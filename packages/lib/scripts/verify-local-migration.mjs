import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const source = new URL("../src/db/migrations/", import.meta.url);
export function migrateTestDatabase(client) {
	return migrate(drizzle(client), { migrationsFolder: fileURLToPath(source) });
}

/** The caller owns the disposable database and its temporary directory. */
export async function verifyLocalMigration(client, temporaryRoot) {
	const prior = path.join(temporaryRoot, "migrations-before-local-cleanup");
	await mkdir(path.join(prior, "meta"), { recursive: true });
	const journal = JSON.parse(await readFile(new URL("meta/_journal.json", source), "utf8"));
	const before = { ...journal, entries: journal.entries.filter((entry) => entry.idx < 29) };
	await writeFile(path.join(prior, "meta/_journal.json"), JSON.stringify(before));
	for (const entry of before.entries)
		await cp(new URL(`${entry.tag}.sql`, source), path.join(prior, `${entry.tag}.sql`));
	const db = drizzle(client);
	await migrate(db, { migrationsFolder: prior });
	await client.query(
		`INSERT INTO "user" (id, name, email) VALUES ('upgrade-owner', 'Local owner', 'owner@upgrade.invalid')`,
	);
	await client.query(
		`INSERT INTO organization (id, name, slug, created_at) VALUES ('default', 'Workspace', 'default', NOW())`,
	);
	await client.query(
		`INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('upgrade-member', 'default', 'upgrade-owner', 'admin', NOW())`,
	);
	await client.query(
		`INSERT INTO brands (id, name, website, organization_id) VALUES ('upgrade-brand', 'Example', 'https://example.com', 'default')`,
	);
	await client.query(
		`INSERT INTO prompts (brand_id, value, premium_models) VALUES ('upgrade-brand', 'Keep this question', '{claude}')`,
	);
	await client.query(
		`INSERT INTO secrets (name, encrypted_value) VALUES ('BEATAPI_API_KEY', 'synthetic-opaque-ciphertext')`,
	);
	await client.query(
		`INSERT INTO subscription (id, plan, reference_id, status) VALUES ('removed-plan', 'pro', 'default', 'active')`,
	);
	const snapshots = new Map();
	for (const table of ["member", "brands", "secrets"])
		snapshots.set(table, (await client.query(`SELECT * FROM "${table}"`)).rows);
	await migrate(db, { migrationsFolder: fileURLToPath(source) });
	// A second startup must be harmless, with no repeated cleanup side effects.
	await migrate(db, { migrationsFolder: fileURLToPath(source) });
	for (const [table, rows] of snapshots) assert.deepEqual((await client.query(`SELECT * FROM "${table}"`)).rows, rows);
	assert.deepEqual((await client.query("SELECT value FROM prompts")).rows, [{ value: "Keep this question" }]);
	assert.equal((await client.query(`SELECT count(*)::int AS n FROM "user" WHERE id = 'upgrade-owner'`)).rows[0].n, 1);
	assert.equal((await client.query("SELECT count(*)::int AS n FROM organization WHERE id = 'default'")).rows[0].n, 1);
	for (const table of ["subscription", "organization_settings", "sso_provider"]) {
		assert.equal(
			(await client.query("SELECT to_regclass($1) AS relation", [`public.${table}`])).rows[0].relation,
			null,
		);
	}
	for (const [table, column] of [
		["prompts", "premium_models"],
		["user", "stripe_customer_id"],
		["user", "has_report_generator_access"],
		["organization", "stripe_customer_id"],
	]) {
		assert.equal(
			(
				await client.query(
					"SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
					[table, column],
				)
			).rows[0].n,
			0,
		);
	}
	console.log(
		"Local migration: existing workspace, membership, questions and ciphertext preserved; hosted tables removed; restart is idempotent.",
	);
}
