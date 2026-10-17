import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { citations, collectionAttempts, prompts } from "@workspace/lib/db/schema";
import { CollectionError, PROMPT_JOB_OPTIONS } from "@workspace/lib/monitoring";
import { getProvider } from "@workspace/lib/providers";
import { startWorkerHeartbeat } from "@workspace/lib/runtime-health";
import { eq, sql } from "drizzle-orm";
import { type Job, PgBoss } from "pg-boss";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
	applyOptimizationAction,
	collectOneQuestion,
	createOptimizationAction,
	readMonitoring,
	retestOptimizationAction,
} from "@/server/monitoring-core";
import { createBrand, createPrompt, deleteBrand } from "@/test/integration/stats-fixtures";
import { type ProcessPromptData, processPromptJob } from "../../../../worker/src/jobs/process-prompt";

let boss: PgBoss;
const queueSchema = `monitoring_test_${randomUUID().replaceAll("-", "")}`;
vi.mock("@/lib/boss-client", () => ({ getBoss: async () => boss }));
vi.mock("../../../../worker/src/boss", () => ({ getBoss: () => boss }));
vi.mock("../../../../worker/src/telemetry", () => ({ trackWorkerEvent: vi.fn() }));
let brand: string;
let other: string;
let promptId: string;
const run = vi.spyOn(getProvider("stub"), "run");
const reply = (text: string) => ({
	textContent: text,
	rawOutput: { text },
	webQueries: [],
	citations: [{ url: "https://example.com", domain: "example.com", title: "Evidence", citationIndex: 1 }],
	modelVersion: "fixture-v1",
});
const job = (id = randomUUID()): Job<ProcessPromptData> =>
	({ id, data: { promptId, force: true } }) as Job<ProcessPromptData>;

beforeAll(async () => {
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	vi.stubEnv("SCRAPE_TARGETS", "chatgpt:stub");
	vi.stubEnv("RUNS_PER_PROMPT", "1");
	boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: queueSchema });
	await boss.start();
	await boss.createQueue("process-prompt", PROMPT_JOB_OPTIONS);
	brand = await createBrand({ name: "BeatGeoFixture" });
	other = await createBrand({ name: "ImageFixture" });
	promptId = await createPrompt(brand, { value: "best tools for an API business" });
});

afterAll(async () => {
	await deleteBrand(brand);
	await deleteBrand(other);
	await boss.stop();
	await db.execute(sql.raw(`DROP SCHEMA "${queueSchema}" CASCADE`));
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

it("persists a baseline, applies an action, queues a real retest and compares completed evidence", async () => {
	run.mockResolvedValue(reply("Another product is recommended."));
	const firstJob = job();
	await processPromptJob([firstJob]);
	const action = await createOptimizationAction({
		brandId: brand,
		title: "Improve comparison page",
		description: "Add verified features and pricing",
		promptIds: [promptId],
	});
	expect(action.baseline).toHaveLength(1);
	expect(action.baseline[0].brandMentioned).toBe(false);
	const evidence = await db.select().from(citations).where(eq(citations.promptRunId, action.baseline[0].runId));
	expect(evidence[0].url).toBe("https://example.com");
	await applyOptimizationAction(brand, action.id, "Updated the comparison page.");
	await expect(applyOptimizationAction(brand, action.id, "overwrite timestamp")).rejects.toThrow("already applied");
	expect(await retestOptimizationAction(brand, action.id)).toEqual({ queued: 1, skipped: 0 });
	const queued = await boss.fetch<ProcessPromptData>("process-prompt");
	expect(queued).toHaveLength(1);
	run.mockResolvedValue(reply("BeatGeoFixture is recommended."));
	await processPromptJob(queued);
	await boss.complete("process-prompt", queued[0].id);
	const view = await readMonitoring(brand);
	expect(view.actions[0].comparison).toMatchObject({
		matched: 1,
		missing: 0,
		beforeRate: 0,
		afterRate: 100,
		deltaPoints: 100,
	});
	expect(view.attempts.every((attempt) => attempt.status === "completed")).toBe(true);
	const calls = run.mock.calls.length;
	await processPromptJob([firstJob]);
	expect(run).toHaveBeenCalledTimes(calls);
});

it("stores timeout as failed coverage without creating a visibility observation", async () => {
	run.mockRejectedValueOnce(new CollectionError("timeout"));
	await processPromptJob([job()]);
	const view = await readMonitoring(brand);
	expect(view.attempts[0]).toMatchObject({ status: "timeout", observation: null });
	expect(view.actions[0].comparison?.matched).toBe(1);
});

it("rejects empty answers and keeps other brands out of action writes and reads", async () => {
	run.mockResolvedValueOnce(reply(""));
	await processPromptJob([job()]);
	expect((await readMonitoring(brand)).attempts[0].status).toBe("empty_answer");
	await expect(
		createOptimizationAction({ brandId: other, title: "Invalid", description: "", promptIds: [promptId] }),
	).rejects.toThrow("belonging to this brand");
	const action = (await readMonitoring(brand)).actions[0];
	await expect(applyOptimizationAction(other, action.id, "Invalid")).rejects.toThrow("unavailable");
	await expect(retestOptimizationAction(other, action.id)).rejects.toThrow("before retesting");
	expect(await readMonitoring(other)).toMatchObject({ attempts: [], actions: [], questions: [] });
});

it("does not retest changed questions against an old baseline", async () => {
	await db.update(prompts).set({ value: "best image generation tools" }).where(eq(prompts.id, promptId));
	const action = (await readMonitoring(brand)).actions[0];
	await expect(retestOptimizationAction(brand, action.id)).rejects.toThrow("changed");
});

it("rolls back a run if evidence cannot be saved", async () => {
	const prompt = await createPrompt(other, { value: "image tools" });
	run.mockResolvedValueOnce({
		...reply("ImageFixture"),
		citations: [{ url: "https://example.com", domain: "example.com", title: "Bad fixture", citationIndex: Number.NaN }],
	});
	await processPromptJob([{ ...job(), data: { promptId: prompt, force: true } }]);
	const [attempt] = await db.select().from(collectionAttempts).where(eq(collectionAttempts.promptId, prompt));
	expect(attempt.status).toBe("failed");
	expect(attempt.observation).toBeNull();
	const { promptRuns } = await import("@workspace/lib/db/schema");
	expect(await db.select().from(promptRuns).where(eq(promptRuns.promptId, prompt))).toHaveLength(0);
});

it("queues one owned question, deduplicates manual retries and rejects an offline worker", async () => {
	const prompt = await createPrompt(brand, { value: "manual collection fixture" });
	const stop = await startWorkerHeartbeat(vi.fn());
	try {
		await expect(collectOneQuestion(other, prompt)).rejects.toThrow("from this brand");
		expect(await collectOneQuestion(brand, prompt)).toEqual({ queued: true });
		expect(await collectOneQuestion(brand, prompt)).toEqual({ queued: false });
		const [queued] = await boss.fetch<ProcessPromptData>("process-prompt");
		expect(queued.data.promptId).toBe(prompt);
		await boss.complete("process-prompt", queued.id);
	} finally {
		await stop();
	}
	await expect(collectOneQuestion(brand, prompt)).rejects.toThrow("Start the collection worker");
});
