import { createServerFn } from "@tanstack/react-start";
import { readRuntimeHealth } from "@workspace/lib/runtime-health";
import { getCredential, refreshCredentialOverlay } from "@workspace/lib/secrets";
import { z } from "zod";
import { canManageConnections, requireAuthSession } from "@/lib/auth/helpers";
import { browserRequest, connectionSummary, inspectBeatApi, saveBeatApi } from "./connections-core";

async function requireLocalAdmin() {
	const session = await requireAuthSession();
	if (!(await canManageConnections(session)))
		throw new Error("Only the local instance administrator can manage connections.");
}
const keyInput = z.object({ key: z.string().trim().max(4096).optional() });
async function resolveKey(key?: string) {
	await refreshCredentialOverlay();
	const value = key || getCredential("BEATAPI_API_KEY");
	if (!value) throw new Error("Enter your BeatAPI key.");
	return value;
}
export const getConnectionsFn = createServerFn({ method: "GET" }).handler(async () => {
	await requireLocalAdmin();
	await refreshCredentialOverlay();
	const [browser, runtime] = await Promise.all([
		browserRequest("/api/browser"),
		readRuntimeHealth().catch(() => ({ database: "unavailable" as const, worker: "unknown" as const, lastSeen: null })),
	]);
	return { beatapi: connectionSummary(), browser, runtime };
});
export const inspectBeatApiFn = createServerFn({ method: "POST" })
	.validator(keyInput)
	.handler(async ({ data }) => {
		await requireLocalAdmin();
		return { models: await inspectBeatApi(await resolveKey(data.key)) };
	});
export const saveBeatApiFn = createServerFn({ method: "POST" })
	.validator(keyInput.extend({ model: z.string().trim().min(1).max(250) }))
	.handler(async ({ data }) => {
		await requireLocalAdmin();
		return saveBeatApi(await resolveKey(data.key), data.model);
	});
export const selectBrowserProfileFn = createServerFn({ method: "POST" })
	.validator(z.object({ profileId: z.string().min(1).max(120) }))
	.handler(async ({ data }) => {
		await requireLocalAdmin();
		const result = await browserRequest("/api/browser/profile", data.profileId);
		if (!result.online) throw new Error("Could not select this Chrome profile. Refresh the connection and try again.");
		return result;
	});
