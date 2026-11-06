import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
	select: vi.fn(),
	transaction: vi.fn(),
	execute: vi.fn(),
	insert: vi.fn(),
	complete: vi.fn(),
	prompts: vi.fn(),
	command: vi.fn(),
	runs: vi.fn(),
}));
vi.mock("@workspace/lib/db/db", () => ({
	db: {
		select: mocked.select,
		transaction: mocked.transaction,
	},
}));
vi.mock("@workspace/lib/onboarding", () => ({ runStructuredCompletionPrompt: mocked.complete }));
vi.mock("@/server/prompt-resolution", () => ({ resolveFilteredPrompts: mocked.prompts }));
vi.mock("@/server/workspace-command", () => ({ workspaceCommand: mocked.command }));
vi.mock("@/lib/postgres-read", () => ({
	getPerPromptRunStats: mocked.runs,
	getBrandMentionRateByModel: async () => [],
	getPerPromptCitationPages: async () => [],
	getPerPromptDailyCitationStats: async () => [],
	getPerPromptDailyCompetitorMentions: async () => [],
}));

import { generateOpportunities, resolveOpportunities } from "../opportunities";
import { publishedOpportunities } from "../opportunities-core";

const report = { summary: ["Saved insight"], opportunities: [], risks: [] };
const saved = { report, createdAt: new Date("2020-01-01T00:00:00.000Z"), model: "old-model" };
const brand = { id: "brand", organizationId: "org" };
function rows(value: unknown[]) {
	const query = Object.assign(Promise.resolve(value), {
		from: () => query,
		where: () => query,
		orderBy: () => query,
		limit: () => Promise.resolve(value),
	});
	return query;
}
beforeEach(() => {
	vi.resetAllMocks();
	mocked.select.mockImplementation(() => rows([]));
	mocked.execute.mockResolvedValue({ rows: [{ acquired: true }] });
	mocked.transaction.mockImplementation(async (run) =>
		run({ select: mocked.select, execute: mocked.execute, insert: mocked.insert }),
	);
	mocked.command.mockImplementation(async (_input, run) => ({ data: await run("command") }));
	mocked.prompts.mockResolvedValue([]);
});

describe("recommendation reading and explicit generation", () => {
	it("reads even an old report without collecting evidence or spending credits", async () => {
		mocked.select.mockImplementation(() => rows([saved]));
		expect(await resolveOpportunities(brand.id)).toMatchObject({
			report,
			reason: null,
			lastEvaluatedAt: saved.createdAt.toISOString(),
		});
		expect(await publishedOpportunities(brand.id)).toMatchObject({ status: "ready", summary: report.summary });
		expect(mocked.prompts).not.toHaveBeenCalled();
		expect(mocked.complete).not.toHaveBeenCalled();
		expect(mocked.command).not.toHaveBeenCalled();
	});
	it("reports not-generated rather than claiming insufficient evidence on an empty read", async () => {
		expect(await resolveOpportunities(brand.id)).toMatchObject({ report: null, reason: "not-generated" });
		expect(await publishedOpportunities(brand.id)).toMatchObject({ status: "not-generated" });
		expect(mocked.prompts).not.toHaveBeenCalled();
		expect(mocked.complete).not.toHaveBeenCalled();
	});
	it("checks actual evidence only after an explicit request and does not spend without answers", async () => {
		expect(await generateOpportunities(brand, "key", "UTC", null)).toMatchObject({
			report: null,
			reason: "insufficient-data",
		});
		expect(mocked.command).toHaveBeenCalledWith(
			expect.objectContaining({
				idempotencyKey: "key",
				operation: "generate_opportunities",
				args: { timezone: "UTC", expectedLastEvaluatedAt: null },
			}),
			expect.any(Function),
		);
		expect(mocked.prompts).toHaveBeenCalledOnce();
		expect(mocked.complete).not.toHaveBeenCalled();
	});
	it("rejects overlapping generation even when a second client uses a different key", async () => {
		mocked.execute.mockResolvedValue({ rows: [{ acquired: false }] });
		await expect(generateOpportunities(brand, "other-key", "UTC", null)).rejects.toThrow("already being generated");
		expect(mocked.complete).not.toHaveBeenCalled();
		expect(mocked.prompts).not.toHaveBeenCalled();
	});
	it("returns a newer saved report to a stale tab without purchasing it again", async () => {
		mocked.select.mockImplementation(() => rows([saved]));
		expect(await generateOpportunities(brand, "other-key", "UTC", null)).toMatchObject({ report });
		expect(mocked.complete).not.toHaveBeenCalled();
		expect(mocked.prompts).not.toHaveBeenCalled();
	});
	it("returns durable command replays without entering the generation pipeline", async () => {
		mocked.command.mockResolvedValue({ replayed: true, data: { report, reason: null } });
		expect(await generateOpportunities(brand, "same-key", "UTC", null)).toMatchObject({ report });
		expect(mocked.transaction).not.toHaveBeenCalled();
		expect(mocked.complete).not.toHaveBeenCalled();
	});
	it("purchases and saves one generation only after explicit action with real answer evidence", async () => {
		mocked.select
			.mockReturnValueOnce(rows([]))
			.mockReturnValueOnce(rows([{ name: "Brand", website: "https://example.com", additionalDomains: [] }]))
			.mockReturnValueOnce(rows([]));
		mocked.prompts.mockResolvedValue([{ id: "prompt", value: "Which tool?", tags: [] }]);
		mocked.runs.mockResolvedValue([{ prompt_id: "prompt", runs: 1, brand_mention_rate: 0 }]);
		mocked.complete.mockResolvedValue({ object: report, modelVersion: "test-model" });
		const persist = vi.fn().mockResolvedValue([{ createdAt: new Date("2026-11-06T00:00:00Z") }]);
		mocked.insert.mockReturnValue({ values: () => ({ returning: persist }) });
		expect(await generateOpportunities(brand, "key", "UTC", null)).toMatchObject({
			report,
			model: "test-model",
			lastEvaluatedAt: "2026-11-06T00:00:00.000Z",
		});
		expect(mocked.complete).toHaveBeenCalledOnce();
		expect(persist).toHaveBeenCalledOnce();
	});
});
