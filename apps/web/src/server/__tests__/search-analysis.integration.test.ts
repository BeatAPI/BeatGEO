import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { db } from "@workspace/lib/db/db";
import { brands, optimizationActions } from "@workspace/lib/db/schema";
import type { GscSummary } from "@workspace/lib/traffic/gsc";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import type { OrganizationAuth } from "@/lib/auth/api-auth";
import { createMcpServer } from "@/lib/mcp/server";
import { toolsFor } from "@/lib/mcp/tools";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";
import { analysisContext, listAnalysisEvidence, readEvidence, saveAnalysisEvidence } from "../analysis-core";
import { createContentDraft } from "../content-draft-core";
import { disconnectGsc, readTraffic, saveGscAuthorization, syncGsc } from "../traffic-core";

let brandId: string, other: string;
let client: Client, server: ReturnType<typeof createMcpServer>;
const api = vi.fn<typeof fetch>(async (_url, init) => {
	if (!init?.body)
		return Response.json({ siteEntry: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }] });
	const body = JSON.parse(String(init.body));
	if (body.dimensions?.join() === "query,page")
		return Response.json({
			rows: [
				{ keys: ["image api", "https://example.com/pricing"], clicks: 3, impressions: 500, ctr: 0.006, position: 7 },
			],
		});
	return Response.json({ rows: [] });
});
beforeAll(async () => {
	brandId = await createBrand({ website: "https://example.com" });
	other = await createBrand({ website: "https://other.example" });
	const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
	const auth: OrganizationAuth = {
		kind: "organization",
		keyId: "test",
		name: null,
		organizationId: brand.organizationId,
		organizationName: "Test",
		scopes: new Set(["read", "write"]),
		brandIds: [brandId],
		createdAt: null,
		lastUsedAt: null,
		expiresAt: null,
		rateLimit: { limit: 1000, window: "minute" },
		rateLimitRemaining: null,
	};
	const [ct, st] = InMemoryTransport.createLinkedPair();
	client = new Client({ name: "analysis-test", version: "1" });
	server = createMcpServer(auth, toolsFor(auth));
	await Promise.all([client.connect(ct), server.connect(st)]);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});
afterAll(async () => {
	await Promise.all([client?.close(), server?.close()]);
	if (brandId) await deleteBrand(brandId);
	if (other) await deleteBrand(other);
});
async function call(name: string, args: Record<string, unknown>) {
	const r = await client.callTool({ name, arguments: args });
	const text = (r.content as Array<{ text: string }>)[0].text;
	if (r.isError) throw new Error(text);
	return JSON.parse(text);
}
it("archives real joint snapshots, keeps prior evidence on a failed refresh, and completes the MCP SEO draft workflow", async () => {
	vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
	await saveGscAuthorization(brandId, {
		accessToken: "private-access",
		refreshToken: "private-refresh",
		expiresAt: Date.now() + 3600000,
	});
	vi.stubGlobal("fetch", api);
	await syncGsc(brandId, "https://example.com/");
	const first = (await listAnalysisEvidence(brandId)).items[0];
	await syncGsc(brandId);
	expect((await listAnalysisEvidence(brandId)).items).toHaveLength(2);
	expect(await readEvidence(brandId, first.id)).toMatchObject({ id: first.id, payload: { kind: "gsc" } });
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("secret-provider-error", { status: 503 })),
	);
	await expect(syncGsc(brandId)).rejects.toThrow("503");
	expect((await listAnalysisEvidence(brandId)).items).toHaveLength(2);
	expect((await readTraffic(brandId)).gsc?.snapshot).not.toBeNull();
	const context = await call("get_analysis_context", { brandId });
	expect(context.diagnosis.findings[0].query).toBe("image api");
	expect(JSON.stringify(context)).not.toContain("private-");
	await expect(call("get_analysis_context", { brandId: other })).rejects.toThrow();
	await expect(readEvidence(other, first.id)).rejects.toThrow("brand");
	const rows = await call("read_analysis_evidence", {
		brandId,
		evidenceId: first.id,
		dataset: "current.queryPages",
		offset: 0,
		limit: 1,
	});
	expect(rows.rows[0].keys).toEqual(["image api", "https://example.com/pricing"]);
	const write = (command: Record<string, unknown>, key = randomUUID()) =>
		call("apply_workspace_command", { brandId, idempotencyKey: key, command });
	const saved = await write({ type: "save_diagnosis", evidenceIds: context.diagnosis.evidenceIds });
	const key = randomUUID(),
		args = { type: "create_seo_action", diagnosisId: saved.data.id, findingId: context.diagnosis.findings[0].id };
	const action = await write(args, key);
	expect((await write(args, key)).data.id).toBe(action.data.id);
	expect(action.data.baseline).toEqual([]);
	expect(action.data.kind).toBe("seo");
	const draft = await createContentDraft(brandId, action.data.id, 0, "zh", false);
	expect(draft.contentDraft).toContain("https://example.com/pricing");
	expect(draft.contentDraft).toContain("image api");
	expect(draft.contentDraft).toContain("# 核查搜索摘要与意图");
	expect(draft.contentDraft).toContain("筛选规则：展示至少 100 次");
	expect(draft.contentDraft).not.toContain("Rule:");
	expect(draft.contentDraft).not.toContain("Review search snippet and intent");
	await expect(
		write({ type: "record_implementation", actionId: action.data.id, note: "Updated title" }),
	).rejects.toThrow();
	await write({ type: "review_draft", actionId: action.data.id, revision: 1 });
	await write({ type: "record_implementation", actionId: action.data.id, note: "Updated title" });
	const comparison = await write({ type: "compare_seo_action", actionId: action.data.id });
	expect(comparison.data.status).toBe("waiting");
	const [stored] = await db.select().from(optimizationActions).where(eq(optimizationActions.id, action.data.id));
	expect(stored.seoBaseline?.evidenceIds).toContain(saved.data.id);
});
it("keeps refresh preview read-only and prevents duplicate network work", async () => {
	vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
	api.mockClear();
	vi.stubGlobal("fetch", api);
	const plan = { source: "gsc", pages: [] };
	const preview = await call("refresh_analysis_data", { brandId, mode: "preview", plan });
	expect(preview.maxCostUsd).toBe(0);
	expect(api).not.toHaveBeenCalled();
	const args = { brandId, mode: "execute", plan, idempotencyKey: randomUUID() };
	const result = await call("refresh_analysis_data", args);
	const calls = api.mock.calls.length;
	expect((await call("refresh_analysis_data", args)).replayed).toBe(true);
	expect(api).toHaveBeenCalledTimes(calls);
	const status = await call("refresh_analysis_data", { brandId, mode: "status", commandId: result.commandId });
	expect(status.status).toBe("completed");
	await disconnectGsc(brandId);
	expect((await call("refresh_analysis_data", args)).replayed).toBe(true);
	expect(api).toHaveBeenCalledTimes(calls);
	await expect(
		call("refresh_analysis_data", { ...args, plan: { source: "pages", pages: ["https://example.com/unknown"] } }),
	).rejects.toThrow();
});
it("does not treat missing or stale aggregate data as zero search performance", async () => {
	const snapshot: GscSummary = {
		schema: "beat-geo/gsc-summary@1",
		site: "https://other.example/",
		siteUrl: "https://other.example/",
		startDate: "2026-10-01",
		endDate: "2026-10-28",
		fetchedAt: "2026-11-01T00:00:00Z",
		totals: null,
		pages: [],
		queries: [],
		limitReached: false,
		warning: "limited",
	};
	await saveAnalysisEvidence(other, { kind: "gsc", data: snapshot });
	const context = await analysisContext(other);
	expect(context.diagnosis.findings).toEqual([]);
	expect(context.diagnosis.warnings.join()).toContain("Refresh Search Console");
});
