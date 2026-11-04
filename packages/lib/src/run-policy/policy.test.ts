import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { RUNS_PER_PROMPT_FALLBACK } from "../constants";
import {
	dueToleranceMs,
	isTargetDue,
	type ResolveRunPlanInput,
	resolvePromptRunPlan,
	selectDueTargets,
	targetKey,
	targetOverdueStatus,
} from "./policy";

const NOW = new Date("2026-08-05T12:00:00Z");

const SELF_HOSTED_TARGETS = parseScrapeTargets(
	"chatgpt:brightdata:online,perplexity:brightdata:online,claude:anthropic-api:claude-sonnet-5:online",
);

function localInput(overrides?: Partial<ResolveRunPlanInput>): ResolveRunPlanInput {
	return {
		scrapeTargets: SELF_HOSTED_TARGETS,
		brand: { enabledModels: null, delayOverrideHours: null },
		defaultDelayHours: 24,
		...overrides,
	};
}

describe("resolvePromptRunPlan", () => {
	it("runs every configured target at the brand cadence, replicated the deployment default", () => {
		const plan = resolvePromptRunPlan(localInput());
		expect(plan.targets.map((t) => t.config)).toEqual(SELF_HOSTED_TARGETS);
		for (const target of plan.targets) {
			expect(target.intervalHours).toBe(24);
			expect(target.replication).toBe(RUNS_PER_PROMPT_FALLBACK);
		}
		expect(plan.rescheduleHours).toBe(24);
	});

	it("honors delayOverrideHours", () => {
		const plan = resolvePromptRunPlan(localInput({ brand: { enabledModels: null, delayOverrideHours: 6 } }));
		expect(plan.targets.every((t) => t.intervalHours === 6)).toBe(true);
		expect(plan.rescheduleHours).toBe(6);
	});

	it("applies brand.enabledModels exactly like selectTargetsForBrand", () => {
		const plan = resolvePromptRunPlan(localInput({ brand: { enabledModels: ["chatgpt"], delayOverrideHours: null } }));
		expect(plan.targets.map((t) => t.config.model)).toEqual(["chatgpt"]);
	});

	it("empty enabledModels runs nothing and queues no next run", () => {
		const plan = resolvePromptRunPlan(localInput({ brand: { enabledModels: [], delayOverrideHours: null } }));
		expect(plan.targets).toEqual([]);
		expect(plan.rescheduleHours).toBeNull();
	});

	it("throws on unknown enabledModels (existing loud-failure semantics)", () => {
		expect(() =>
			resolvePromptRunPlan(localInput({ brand: { enabledModels: ["nope"], delayOverrideHours: null } })),
		).toThrow(/nope/);
	});
});

describe("cadence enforcement", () => {
	const plan = {
		config: { model: "chatgpt", provider: "brightdata", webSearch: true },
		intervalHours: 6,
		replication: 1,
	};

	it("never-run targets are due", () => {
		expect(isTargetDue(plan, undefined, NOW)).toBe(true);
	});

	it("a target run a full interval ago is due, one run recently is not", () => {
		expect(isTargetDue(plan, new Date(NOW.getTime() - 6 * 3600 * 1000), NOW)).toBe(true);
		expect(isTargetDue(plan, new Date(NOW.getTime() - 1 * 3600 * 1000), NOW)).toBe(false);
	});

	it("tolerates cadence jitter but not half-interval early fires", () => {
		const tolerance = dueToleranceMs(6);
		expect(isTargetDue(plan, new Date(NOW.getTime() - (6 * 3600 * 1000 - tolerance)), NOW)).toBe(true);
		expect(isTargetDue(plan, new Date(NOW.getTime() - 3 * 3600 * 1000), NOW)).toBe(false);
	});

	it("selectDueTargets keys claude base and web separately", () => {
		const base = {
			config: { model: "claude", provider: "anthropic-api", webSearch: false },
			intervalHours: 24,
			replication: 1,
		};
		const web = {
			config: { model: "claude", provider: "anthropic-api", webSearch: true },
			intervalHours: 24,
			replication: 1,
		};
		const lastRuns = new Map([[targetKey(web.config), new Date(NOW.getTime() - 3600 * 1000)]]);
		const due = selectDueTargets([base, web], lastRuns, NOW);
		expect(due).toEqual([base]);
	});

	it("the maintenance-expedite oversampling fix: an early fire only runs the stale target", () => {
		const fresh = { ...plan, config: { ...plan.config, model: "perplexity" } };
		const lastRuns = new Map([
			[targetKey(plan.config), new Date(NOW.getTime() - 26 * 3600 * 1000)], // broken, stale
			[targetKey(fresh.config), new Date(NOW.getTime() - 1 * 3600 * 1000)], // healthy, fresh
		]);
		expect(selectDueTargets([plan, fresh], lastRuns, NOW).map((t) => t.config.model)).toEqual(["chatgpt"]);
	});
});

describe("targetOverdueStatus", () => {
	const promptCreatedAt = new Date(NOW.getTime() - 30 * 24 * 3600 * 1000);
	const status = (over: Partial<Parameters<typeof targetOverdueStatus>[0]>) =>
		targetOverdueStatus({
			intervalHours: 6,
			lastRunAt: null,
			promptCreatedAt,
			now: NOW.getTime(),
			...over,
		});

	it("never-run targets on a long-established prompt are overdue, with no measurable lateness", () => {
		expect(status({ lastRunAt: null })).toEqual({ isOverdue: true, overdueByMs: null });
	});

	it("a freshly created prompt is not overdue inside its grace window", () => {
		expect(
			status({ lastRunAt: null, promptCreatedAt: new Date(NOW.getTime() - 60_000), graceMs: 30 * 60 * 1000 }),
		).toEqual({ isOverdue: false, overdueByMs: null });
	});

	it("a run inside the interval is on schedule", () => {
		expect(status({ lastRunAt: new Date(NOW.getTime() - 3600 * 1000) })).toEqual({
			isOverdue: false,
			overdueByMs: null,
		});
	});

	it("exactly one interval late is still on schedule — overdue means past it", () => {
		expect(status({ lastRunAt: new Date(NOW.getTime() - 6 * 3600 * 1000) }).isOverdue).toBe(false);
	});

	it("reports how far past the interval a stale run is", () => {
		const lastRunAt = new Date(NOW.getTime() - 8 * 3600 * 1000);
		expect(status({ lastRunAt })).toEqual({ isOverdue: true, overdueByMs: 2 * 3600 * 1000 });
	});

	it("grace pushes the threshold out without changing the reported lateness", () => {
		const lastRunAt = new Date(NOW.getTime() - 6.25 * 3600 * 1000);
		expect(status({ lastRunAt, graceMs: 30 * 60 * 1000 }).isOverdue).toBe(false);
		expect(status({ lastRunAt }).overdueByMs).toBe(0.25 * 3600 * 1000);
	});

	it("follows the target's own interval, so a slow target is judged slowly", () => {
		const lastRunAt = new Date(NOW.getTime() - 12 * 3600 * 1000);
		expect(status({ lastRunAt, intervalHours: 6 }).isOverdue).toBe(true);
		expect(status({ lastRunAt, intervalHours: 24 }).isOverdue).toBe(false);
	});
});
