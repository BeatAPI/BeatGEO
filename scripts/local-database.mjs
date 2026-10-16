import { existsSync } from "node:fs";
import { chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

export const DATABASE_ENGINE_VERSION = "17.10.0-beta.17";

export async function availablePort(preferred) {
	for (let port = preferred; port < preferred + 100; port++) {
		if (await portAvailable(port)) return port;
	}
	throw new Error("No free local port found. Close an unused BeatGEO instance and try again.");
}

export async function portAvailable(port) {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once("error", () => resolve(false));
		server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
	});
}

export function embeddedSettings(root, env) {
	const url = new URL(env.DATABASE_URL);
	if (env.BEAT_GEO_DATABASE_MODE !== "embedded" || env.DEPLOYMENT_MODE !== "local" ||
		url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/beatgeo" ||
		url.username !== "beatgeo" || !url.password || url.search || url.hash)
		throw new Error("Embedded storage requires a dedicated local BeatGEO configuration.");
	return {
		databaseDir: path.join(root, ".beat-geo/postgres"),
		port: Number(url.port), user: "beatgeo", password: decodeURIComponent(url.password),
		persistent: true, authMethod: "scram-sha-256", createPostgresUser: false,
		initdbFlags: ["--encoding=UTF8", "--locale=C"],
		postgresFlags: ["-h", "127.0.0.1", "-c", "unix_socket_directories=", "-c", "max_connections=100"],
		onLog: () => {}, onError: () => {},
	};
}

export async function startEmbeddedDatabase(root, env, { initialize = false } = {}) {
	if (process.getuid?.() === 0) throw new Error("Start BeatGEO as your normal user, without sudo.");
	const settings = embeddedSettings(root, env);
	const local = path.dirname(settings.databaseDir);
	await mkdir(local, { recursive: true, mode: 0o700 });
	if ((await lstat(local)).isSymbolicLink()) throw new Error("The private data directory must not be a symlink.");
	await chmod(local, 0o700);
	const marker = path.join(local, "database.json");
	const identity = { engine: "postgres", major: 17, directory: "postgres", port: settings.port };
	if (!existsSync(marker)) {
		if (!initialize || existsSync(settings.databaseDir))
			throw new Error("Local database ownership is unknown. Restore your configuration or complete setup; data was not changed.");
		await writeFile(marker, JSON.stringify(identity), { mode: 0o600, flag: "wx" });
	}
	if (JSON.stringify(JSON.parse(await readFile(marker, "utf8"))) !== JSON.stringify(identity))
		throw new Error("The database configuration does not match this workspace. Restore its original configuration.");
	if (existsSync(settings.databaseDir) && (await lstat(settings.databaseDir)).isSymbolicLink())
		throw new Error("The database directory must not be a symlink.");
	if (!(await portAvailable(settings.port)))
		throw new Error("The local database port is in use. Stop the other BeatGEO instance before starting again.");
	const { default: EmbeddedPostgres } = await import("embedded-postgres");
	const database = new EmbeddedPostgres(settings);
	const versionFile = path.join(settings.databaseDir, "PG_VERSION");
	try {
		if (!existsSync(versionFile)) {
			if (!initialize) throw new Error("Local storage is not initialized. Run pnpm local:setup --resume.");
			// The dependency writes a temporary password file during initdb.
			const previousMask = process.umask(0o077);
			try { await database.initialise(); } finally { process.umask(previousMask); }
		} else if ((await readFile(versionFile, "utf8")).trim() !== "17") {
			throw new Error("This database needs a version migration. Back it up before upgrading.");
		}
		await database.start();
		const client = database.getPgClient("postgres", "127.0.0.1");
		try {
			await client.connect();
			const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", ["beatgeo"]);
			if (!found.rowCount) {
				if (!initialize) throw new Error("The BeatGEO database is missing. Run pnpm local:setup --resume.");
				await client.query('CREATE DATABASE "beatgeo"');
			}
		} finally { await client.end(); }
		let stopping;
		return { getClient: (name = "beatgeo") => database.getPgClient(name, "127.0.0.1"), stop: () => { stopping ??= database.stop(); return stopping; } };
	} catch (error) {
		if (database.process?.exitCode === null && database.process?.signalCode === null) await database.stop();
		throw new Error(error instanceof Error ? error.message.replaceAll(settings.password, "[redacted]") :
			"The bundled database could not start. Check available disk space and your operating system compatibility.");
	}
}
