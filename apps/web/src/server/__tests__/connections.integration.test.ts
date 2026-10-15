import { randomBytes } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { secrets } from "@workspace/lib/db/schema";
import { clearCredentialOverlay, getCredential } from "@workspace/lib/secrets";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { connectionSummary, saveBeatApi } from "../connections-core";

const names = ["BEATAPI_API_KEY", "BEATAPI_RESEARCH_MODEL"];
let previous: Array<typeof secrets.$inferSelect>;
beforeAll(async () => {
	previous = await db.select().from(secrets).where(inArray(secrets.name, names));
	await db.delete(secrets).where(inArray(secrets.name, names));
	vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});
afterAll(async () => {
	await db.delete(secrets).where(inArray(secrets.name, names));
	if (previous.length) await db.insert(secrets).values(previous);
	clearCredentialOverlay();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});
it("saves encrypted credentials into the existing database, reloads them, and preserves them after rejected updates", async () => {
	const request = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ ok: true }))
		.mockResolvedValueOnce(Response.json({ data: [{ id: "test-text-model" }] }));
	vi.stubGlobal("fetch", request);
	await saveBeatApi("test-only-secret-key", "test-text-model");
	const saved = await db.select().from(secrets).where(inArray(secrets.name, names));
	expect(saved).toHaveLength(2);
	expect(JSON.stringify(saved)).not.toContain("test-only-secret-key");
	expect(JSON.stringify(saved)).not.toContain("test-text-model");
	expect(getCredential("BEATAPI_API_KEY")).toBe("test-only-secret-key");
	expect(getCredential("BEATAPI_RESEARCH_MODEL")).toBe("test-text-model");
	expect(connectionSummary()).toMatchObject({ configured: true, keyHint: "test••••", model: "test-text-model" });
	request.mockResolvedValueOnce(new Response("rejected", { status: 401 }));
	await expect(saveBeatApi("invalid-test-key", "test-text-model")).rejects.toThrow("401");
	expect(await db.select().from(secrets).where(inArray(secrets.name, names))).toEqual(saved);
});
