import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
import { PostHog } from "posthog-node";

const POSTHOG_HOST = "https://us.i.posthog.com";

function envDisabled(): boolean {
	return Boolean(process.env.DISABLE_TELEMETRY);
}

async function readEnvKey(configDir: string, key: string): Promise<string | undefined> {
	try {
		const contents = await fs.readFile(path.join(configDir, ".env"), "utf8");
		return parse(contents)[key];
	} catch {
		return undefined;
	}
}

async function isTelemetryDisabled(configDir: string): Promise<boolean> {
	if (envDisabled()) return true;
	return Boolean(await readEnvKey(configDir, "DISABLE_TELEMETRY"));
}

export async function trackCliEvent(
	configDir: string,
	eventName: string,
	properties?: Record<string, string | number | boolean | undefined>,
	personProperties?: Record<string, string | number | boolean | undefined>,
): Promise<void> {
	if (await isTelemetryDisabled(configDir)) return;
	const key = process.env.BEAT_GEO_POSTHOG_KEY || (await readEnvKey(configDir, "BEAT_GEO_POSTHOG_KEY"));
	if (!key) return;
	const distinctId = await readEnvKey(configDir, "DEPLOYMENT_ID");
	if (!distinctId) return;

	try {
		const client = new PostHog(key, { host: POSTHOG_HOST });
		client.capture({
			distinctId,
			event: eventName,
			properties: {
				...properties,
				...(personProperties ? { $set: personProperties } : {}),
			},
		});
		await client.shutdown();
	} catch {
		// Telemetry should never block the CLI
	}
}
