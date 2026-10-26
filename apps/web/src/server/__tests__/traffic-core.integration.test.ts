import { resetDeploymentCache } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { brandDataSources } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";
import ga from "../../../../../packages/lib/src/traffic/__fixtures__/ga.json";
import { disconnectGa, importCrawlTraffic, readTraffic, saveGaAuthorization, syncGa } from "../traffic-core";

const ids: string[] = [];
beforeEach(() => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	resetDeploymentCache();
});
afterAll(async () => {
	for (const id of ids) await deleteBrand(id);
});
afterEach(() => {
	resetDeploymentCache();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});
async function brand() {
	const id = await createBrand({ website: "https://example.com" });
	ids.push(id);
	return id;
}
it("persists independent per-brand crawl snapshots without private request fields", async () => {
	const id = await brand(),
		other = await brand();
	const row =
		'192.0.2.123 - user [25/Oct/2026:16:00:00 +0800] "GET /docs?private-token=yes HTTP/1.1" 200 42 "https://private-referrer/" "OAI-SearchBot/1.0"';
	await importCrawlTraffic(id, row, "combined");
	const saved = await readTraffic(id);
	expect(saved.crawls?.snapshot?.site).toBe("example.com");
	expect(saved.ga).toBeNull();
	expect((await readTraffic(other)).crawls).toBeNull();
	expect(JSON.stringify(saved)).not.toContain("private-token");
	expect(JSON.stringify(saved)).not.toContain("192.0.2.123");
	await expect(importCrawlTraffic(id, "invalid log", "auto")).rejects.toThrow("No valid");
	expect((await readTraffic(id)).crawls?.snapshot?.site).toBe("example.com");
});
it("encrypts GA grants, saves an exact-host snapshot and removes it on disconnect", async () => {
	vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
	vi.stubEnv("GA_CLIENT_ID", "test");
	vi.stubEnv("GA_CLIENT_SECRET", "test-secret");
	const id = await brand(),
		other = await brand();
	await saveGaAuthorization(id, {
		accessToken: "private-access",
		refreshToken: "private-refresh",
		expiresAt: Date.now() + 3600000,
	});
	const [stored] = await db.select().from(brandDataSources).where(eq(brandDataSources.brandId, id));
	expect(stored.encryptedCredentials).not.toContain("private-refresh");
	expect(JSON.stringify(await readTraffic(id))).not.toContain("private-access");
	expect((await readTraffic(other)).ga).toBeNull();
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url, init) => {
			const u = String(url);
			if (u.includes("accountSummaries"))
				return Response.json({
					accountSummaries: [
						{ propertySummaries: [{ property: `properties/${ga.property.id}`, displayName: "Example" }] },
					],
				});
			if (u.includes("analyticsadmin")) return Response.json({ timeZone: "Asia/Shanghai" });
			const body = JSON.parse(String(init?.body));
			return Response.json(body.dimensions.length === 3 ? ga.sources : ga.landing);
		}),
	);
	const summary = await syncGa(id, ga.property.id);
	expect(summary.totals.sessions).toBe(22);
	expect((await readTraffic(id)).ga?.config?.property?.id).toBe(ga.property.id);
	await expect(syncGa(id, ga.property.id, "unrelated.example")).rejects.toThrow("hostname");
	expect((await readTraffic(id)).ga?.snapshot).not.toBeNull();
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("private-error-token", { status: 403 })),
	);
	await expect(syncGa(id)).rejects.toThrow("403");
	expect((await readTraffic(id)).ga?.snapshot).not.toBeNull();
	await disconnectGa(id);
	expect((await readTraffic(id)).ga).toBeNull();
});
