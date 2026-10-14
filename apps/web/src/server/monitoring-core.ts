import { db } from "@workspace/lib/db/db";
import { collectionAttempts, optimizationActions, prompts } from "@workspace/lib/db/schema";
import {
	compareObservations,
	latestObservations,
	type Observation,
	PROMPT_JOB_OPTIONS,
} from "@workspace/lib/monitoring";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";

export async function observationsForBrand(brandId: string, since: Date): Promise<Observation[]> {
	const rows = await db
		.select({ observation: collectionAttempts.observation })
		.from(collectionAttempts)
		.where(
			and(
				eq(collectionAttempts.brandId, brandId),
				eq(collectionAttempts.status, "completed"),
				gt(collectionAttempts.startedAt, since),
			),
		)
		.orderBy(desc(collectionAttempts.startedAt))
		.limit(2000);
	return rows.flatMap((row) => (row.observation ? [row.observation] : []));
}

export async function readMonitoring(brandId: string) {
	const [attempts, actions] = await Promise.all([
		db
			.select()
			.from(collectionAttempts)
			.where(eq(collectionAttempts.brandId, brandId))
			.orderBy(desc(collectionAttempts.startedAt))
			.limit(50),
		db
			.select()
			.from(optimizationActions)
			.where(eq(optimizationActions.brandId, brandId))
			.orderBy(desc(optimizationActions.createdAt))
			.limit(50),
	]);
	const since = actions.reduce(
		(date, action) => (action.appliedAt && action.appliedAt < date ? action.appliedAt : date),
		new Date(),
	);
	const observations = actions.some((action) => action.appliedAt) ? await observationsForBrand(brandId, since) : [];
	return {
		attempts: attempts.map(({ attemptKey: _attemptKey, ...attempt }) => ({
			...attempt,
			status:
				attempt.status === "running" &&
				Date.now() - attempt.startedAt.getTime() > PROMPT_JOB_OPTIONS.expireInSeconds * 1000
					? "interrupted"
					: attempt.status,
		})),
		actions: actions.map((action) => ({
			...action,
			comparison: action.appliedAt
				? compareObservations(action.baseline, observations, action.appliedAt.toISOString())
				: null,
		})),
	};
}

export async function createOptimizationAction(input: {
	brandId: string;
	title: string;
	description: string;
	promptIds: string[];
}) {
	const owned = await db
		.select({ id: prompts.id, value: prompts.value })
		.from(prompts)
		.where(and(eq(prompts.brandId, input.brandId), inArray(prompts.id, input.promptIds)));
	if (new Set(input.promptIds).size !== owned.length) throw new Error("Select questions belonging to this brand.");
	const observations = await observationsForBrand(input.brandId, new Date(Date.now() - 30 * 86400_000));
	const baseline = latestObservations(
		observations.filter((row) =>
			owned.some((prompt) => prompt.id === row.promptId && prompt.value === row.promptValue),
		),
	);
	if (owned.some((prompt) => !baseline.some((row) => row.promptId === prompt.id)))
		throw new Error("Collect a completed baseline for these questions first. Failed attempts cannot be a baseline.");
	const [action] = await db
		.insert(optimizationActions)
		.values({ brandId: input.brandId, title: input.title, description: input.description, baseline })
		.returning();
	return action;
}

export async function applyOptimizationAction(brandId: string, id: string, implementationNote: string) {
	const [action] = await db
		.update(optimizationActions)
		.set({ status: "applied", implementationNote, appliedAt: new Date() })
		.where(
			and(
				eq(optimizationActions.id, id),
				eq(optimizationActions.brandId, brandId),
				eq(optimizationActions.status, "planned"),
			),
		)
		.returning();
	if (!action) throw new Error("Action is unavailable or already applied.");
	return action;
}

export async function retestOptimizationAction(brandId: string, id: string) {
	const [action] = await db
		.select()
		.from(optimizationActions)
		.where(and(eq(optimizationActions.id, id), eq(optimizationActions.brandId, brandId)));
	if (!action?.appliedAt) throw new Error("Record the implemented change before retesting.");
	const ids = [...new Set(action.baseline.map((row) => row.promptId))];
	const current = await db
		.select()
		.from(prompts)
		.where(and(eq(prompts.brandId, brandId), inArray(prompts.id, ids), eq(prompts.enabled, true)));
	const sameQuestions = current.filter((prompt) =>
		action.baseline.some((row) => row.promptId === prompt.id && row.promptValue === prompt.value),
	);
	if (!sameQuestions.length)
		throw new Error("Baseline questions were changed, disabled or deleted. Create a new baseline.");
	const boss = await getBoss();
	let queued = 0;
	for (const prompt of sameQuestions) {
		const job = await boss.send(
			"process-prompt",
			{ promptId: prompt.id, force: true },
			{ ...PROMPT_JOB_OPTIONS, singletonKey: `retest-${id}-${prompt.id}`, singletonSeconds: 300 },
		);
		if (job) queued++;
	}
	return { queued, skipped: ids.length - sameQuestions.length };
}
