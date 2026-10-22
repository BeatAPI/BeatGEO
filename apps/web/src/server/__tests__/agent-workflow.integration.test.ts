import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { resetDeploymentCache } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { brands, workspaceCommands } from "@workspace/lib/db/schema";
import { PROMPT_JOB_OPTIONS } from "@workspace/lib/monitoring";
import { getProvider } from "@workspace/lib/providers";
import { startWorkerHeartbeat } from "@workspace/lib/runtime-health";
import { eq, sql } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { OrganizationAuth } from "@/lib/auth/api-auth";
import { createMcpServer } from "@/lib/mcp/server";
import { toolsFor } from "@/lib/mcp/tools";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";
import { type ProcessPromptData, processPromptJob } from "../../../../worker/src/jobs/process-prompt";

let boss: PgBoss;
vi.mock("@/lib/boss-client", () => ({ getBoss: async () => boss }));
vi.mock("../../../../worker/src/boss", () => ({ getBoss: () => boss }));
vi.mock("../../../../worker/src/telemetry", () => ({ trackWorkerEvent: vi.fn() }));
vi.mock("@/server/connections-core", () => ({ browserRequest: async () => ({ online: false }) }));
const schema = `agent_${randomUUID().replaceAll("-", "")}`;
let base: string;
let other: string;
let brandId: string;
let stop: () => Promise<void>;
let client: Client;
let server: ReturnType<typeof createMcpServer>;
const provider = vi.spyOn(getProvider("beat-browser"), "run");

async function call(name: string, args: Record<string, unknown>) {
	const result = await client.callTool({ name, arguments: args });
	const text = (result.content as Array<{ text: string }>)[0].text;
	if (result.isError) throw new Error(text);
	return JSON.parse(text);
}
beforeAll(async () => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	resetDeploymentCache();
	vi.stubEnv("SCRAPE_TARGETS", "chatgpt:beat-browser");
	vi.stubEnv("RUNS_PER_PROMPT", "1");
	vi.stubEnv("BROWSER_RUNNER_TOKEN", "fixture");
	boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema });
	await boss.start();
	await boss.createQueue("process-prompt", PROMPT_JOB_OPTIONS);
	base = await createBrand();
	other = await createBrand();
	stop = await startWorkerHeartbeat(vi.fn());
	const auth: OrganizationAuth = {
		kind: "organization",
		keyId: "test",
		name: null,
		organizationId: base,
		organizationName: "Test",
		scopes: new Set(["read", "write"]),
		brandIds: null,
		createdAt: null,
		lastUsedAt: null,
		expiresAt: null,
		rateLimit: { limit: 1000, window: "minute" },
		rateLimitRemaining: null,
	};
	const [ct, st] = InMemoryTransport.createLinkedPair();
	client = new Client({ name: "workflow-test", version: "1" });
	server = createMcpServer(auth, toolsFor(auth));
	await Promise.all([client.connect(ct), server.connect(st)]);
});
afterAll(async () => {
	await Promise.all([client?.close(), server?.close()]);
	await stop?.();
	await boss?.stop();
	if (brandId) await deleteBrand(brandId);
	if (base) await deleteBrand(base);
	if (other) await deleteBrand(other);
	await db.execute(sql.raw(`DROP SCHEMA "${schema}" CASCADE`));
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	resetDeploymentCache();
});
it("completes a shared MCP workflow with replay protection, browser jobs, evidence, draft conflicts and matched retest", async () => {
	const args = { organizationId: base, website: "https://beatapi.io", name: "BeatAPI", idempotencyKey: randomUUID() };
	const created = await call("create_brand", args);
	brandId = created.data.id;
	expect(created.data.enabled).toBe(false);
	expect((await call("create_brand", args)).data.id).toBe(brandId);
	await expect(call("create_brand", { ...args, name: "Different" })).rejects.toThrow("different arguments");
	const write = (command: Record<string, unknown>, key = randomUUID()) =>
		call("apply_workspace_command", { brandId, idempotencyKey: key, command });
	await write({ type: "save_questions", prompts: [{ value: "Which AI API platforms suit small teams?" }] });
	let workspace = await call("get_workspace", { brandId });
	const promptId = workspace.questions[0].id;
	const collectionArgs = { brandId, promptIds: [promptId], repeats: 2, idempotencyKey: randomUUID() };
	const collection = await call("start_collection", collectionArgs);
	expect((await call("start_collection", collectionArgs)).replayed).toBe(true);
	vi.stubEnv("SCRAPE_TARGETS", "chatgpt:openai-api");
	expect((await call("start_collection", collectionArgs)).replayed).toBe(true);
	vi.stubEnv("SCRAPE_TARGETS", "chatgpt:beat-browser");
	const jobs = await boss.fetch<ProcessPromptData>("process-prompt", { batchSize: 10 });
	// A paused brand retains reviewed questions without starting scheduled collection.
	const samples = jobs.filter((j) => j.data.oneShot);
	expect(samples).toHaveLength(2);
	provider.mockResolvedValue({
		textContent: "Compare available platforms.",
		rawOutput: { text: "Compare available platforms." },
		webQueries: [],
		citations: [{ url: "https://example.com", domain: "example.com", citationIndex: 1 }],
	});
	const changed = {
		...samples[0],
		id: randomUUID(),
		data: { ...samples[0].data, expectedTargets: "different-target-contract" },
	};
	await processPromptJob([changed]);
	expect(provider).not.toHaveBeenCalled();
	await processPromptJob(samples);
	for (const job of jobs) await boss.complete("process-prompt", job.id);
	const progress = await call("get_collection", { brandId, commandId: collection.commandId });
	expect(progress.completed).toBe(2);
	const action = await write({
		type: "create_action",
		title: "Clarify API selection",
		description: "Evidence-linked draft",
		promptIds: [promptId],
	});
	const actionId = action.data.id;
	const saved = await write({
		type: "save_draft",
		actionId,
		revision: 0,
		content: "# Choosing an API\n\nVerify the documented features.",
	});
	expect(saved.data.draftRevision).toBe(1);
	await expect(write({ type: "save_draft", actionId, revision: 0, content: "Overwrite" })).rejects.toThrow();
	await write({ type: "review_draft", actionId, revision: 1 });
	await write({ type: "record_implementation", actionId, note: "Synthetic test change only." });
	await write({ type: "retest_action", actionId });
	const retest = await boss.fetch<ProcessPromptData>("process-prompt", { batchSize: 10 });
	expect(retest[0].data.oneShot).toBe(true);
	provider.mockResolvedValue({
		textContent: "BeatAPI is one option.",
		rawOutput: { text: "BeatAPI is one option." },
		webQueries: [],
		citations: [],
	});
	await processPromptJob(retest);
	for (const job of retest) await boss.complete("process-prompt", job.id);
	workspace = await call("get_workspace", { brandId });
	expect(workspace.actions[0].comparison.matched).toBe(1);
	expect(workspace.history.some((c: { operation: string }) => c.operation === "save_draft")).toBe(true);
	await expect(call("get_workspace", { brandId: other })).rejects.toThrow("not found");
	await expect(call("get_collection", { brandId: other, commandId: collection.commandId })).rejects.toThrow();
	await write({
		type: "configure_monitoring",
		enabled: true,
		intervalHours: 24,
		expectedUpdatedAt: workspace.brand.updatedAt,
	});
	await expect(
		write({
			type: "configure_monitoring",
			enabled: false,
			intervalHours: 24,
			expectedUpdatedAt: workspace.brand.updatedAt,
		}),
	).rejects.toThrow("settings changed");
	expect(
		(await db.select().from(workspaceCommands).where(eq(workspaceCommands.brandId, brandId))).length,
	).toBeGreaterThan(5);
	await db.update(brands).set({ enabled: false }).where(eq(brands.id, brandId));
});
