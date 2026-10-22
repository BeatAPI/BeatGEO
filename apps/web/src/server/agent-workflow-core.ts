import { createHash } from "node:crypto";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { db } from "@workspace/lib/db/db";
import { brands, collectionAttempts, organization, prompts, workspaceCommands } from "@workspace/lib/db/schema";
import { assertCanCreateBrand } from "@workspace/lib/entitlements";
import { compareObservations, PROMPT_JOB_OPTIONS } from "@workspace/lib/monitoring";
import { readRuntimeHealth } from "@workspace/lib/runtime-health";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError } from "@/lib/api/handler";
import { getBoss } from "@/lib/boss-client";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";
import { browserRequest } from "./connections-core";
import { reviewContentDraft, saveContentDraft } from "./content-draft-core";
import {
	applyOptimizationAction,
	createOptimizationAction,
	readMonitoring,
	retestOptimizationAction,
} from "./monitoring-core";
import { createBrand, saveWizardOnboarding, updateBrand, wizardOnboardingInputSchema } from "./onboarding-core";
import { workspaceCommand } from "./workspace-command";

export const workspaceOperation = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("update_brand"),
		name: z.string().trim().min(1).max(200).optional(),
		aliases: z.array(z.string().max(200)).max(30).optional(),
	}),
	z.object({
		type: z.literal("save_questions"),
		prompts: wizardOnboardingInputSchema.shape.prompts.unwrap(),
		competitors: wizardOnboardingInputSchema.shape.competitors,
	}),
	z.object({
		type: z.literal("create_action"),
		title: z.string().trim().min(1).max(200),
		description: z.string().max(4000),
		promptIds: z.array(z.uuid()).min(1).max(20),
	}),
	z.object({
		type: z.literal("save_draft"),
		actionId: z.uuid(),
		revision: z.number().int().min(0),
		content: z.string().trim().min(1).max(24000),
	}),
	z.object({ type: z.literal("review_draft"), actionId: z.uuid(), revision: z.number().int().min(0) }),
	z.object({ type: z.literal("record_implementation"), actionId: z.uuid(), note: z.string().trim().min(1).max(2000) }),
	z.object({ type: z.literal("retest_action"), actionId: z.uuid() }),
	z.object({
		type: z.literal("configure_monitoring"),
		enabled: z.boolean(),
		intervalHours: z.number().int().min(1).max(720),
		models: z.array(z.string().min(1)).min(1).max(10).optional(),
		expectedUpdatedAt: z.iso.datetime(),
	}),
]);
export type WorkspaceOperation = z.infer<typeof workspaceOperation>;

export async function createAgentBrand(organizationId: string, key: string, website: string, name?: string) {
	return workspaceCommand(
		{ organizationId, operation: "create_brand", idempotencyKey: key, args: { website, name } },
		async (commandId) => {
			const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
			if (!/^https?:$/.test(url.protocol) || url.username || url.password)
				throw new ApiError(400, "Invalid website", "Use a public HTTP or HTTPS website.");
			await assertCanCreateBrand(organizationId);
			const id = `brand-${createHash("sha256").update(`${organizationId}:${key}`).digest("hex").slice(0, 24)}`;
			await createBrand({ id, organizationId, name: name || url.hostname, website: url.href });
			await db.update(workspaceCommands).set({ brandId: id }).where(eq(workspaceCommands.id, commandId));
			// Creating a project does not authorize indefinite browser sampling.
			return updateBrand({ brandId: id, enabled: false });
		},
	);
}

export async function applyWorkspaceOperation(
	brand: typeof brands.$inferSelect,
	key: string,
	command: WorkspaceOperation,
) {
	return workspaceCommand(
		{
			organizationId: brand.organizationId,
			brandId: brand.id,
			operation: command.type,
			idempotencyKey: key,
			args: command,
		},
		async () => {
			switch (command.type) {
				case "update_brand":
					return updateBrand({ brandId: brand.id, brandName: command.name, aliases: command.aliases });
				case "save_questions":
					if (command.prompts.length > 20 || (command.competitors?.length ?? 0) > 20)
						throw new ApiError(400, "Invalid input", "Save at most 20 questions and competitors per command.");
					return saveWizardOnboarding({
						brandId: brand.id,
						prompts: command.prompts,
						competitors: command.competitors,
					});
				case "create_action":
					return createOptimizationAction({ brandId: brand.id, ...command });
				case "save_draft":
					return saveContentDraft(brand.id, command.actionId, command.revision, command.content);
				case "review_draft":
					return reviewContentDraft(brand.id, command.actionId, command.revision);
				case "record_implementation":
					return applyOptimizationAction(brand.id, command.actionId, command.note);
				case "retest_action":
					requireBrowserTargets();
					return retestOptimizationAction(brand.id, command.actionId);
				case "configure_monitoring":
					return configureMonitoring(brand, command);
			}
		},
	);
}

export async function readAgentWorkspace(brand: typeof brands.$inferSelect) {
	const [monitoring, history, org, browser] = await Promise.all([
		readMonitoring(brand.id),
		db
			.select({
				id: workspaceCommands.id,
				operation: workspaceCommands.operation,
				status: workspaceCommands.status,
				createdAt: workspaceCommands.createdAt,
				error: workspaceCommands.error,
			})
			.from(workspaceCommands)
			.where(eq(workspaceCommands.brandId, brand.id))
			.orderBy(desc(workspaceCommands.createdAt))
			.limit(50),
		db.query.organization.findFirst({ where: eq(organization.id, brand.organizationId) }),
		browserRequest("/api/browser"),
	]);
	return {
		brand,
		...monitoring,
		history,
		browser,
		url: `${process.env.APP_URL || "http://localhost:3140"}/app/org/${encodeURIComponent(org?.slug || brand.organizationId)}/brand/${encodeURIComponent(brand.slug || brand.id)}`,
	};
}

function requireBrowserTargets() {
	const targets = parseScrapeTargets(process.env.SCRAPE_TARGETS);
	if (!targets.length || targets.some((target) => target.provider !== "beat-browser"))
		throw new ApiError(
			400,
			"Browser configuration required",
			"This workflow submits browser-only collections. Configure SCRAPE_TARGETS with BeatBrowser before running; paid API collection is not implied.",
		);
	return targets;
}

export async function startAgentCollection(
	brand: typeof brands.$inferSelect,
	key: string,
	promptIds: string[],
	repeats: number,
) {
	return workspaceCommand(
		{
			organizationId: brand.organizationId,
			brandId: brand.id,
			operation: "start_collection",
			idempotencyKey: key,
			args: { promptIds, repeats },
		},
		async (commandId) => {
			const targets = requireBrowserTargets();
			if (new Set(promptIds).size !== promptIds.length || promptIds.length * repeats * targets.length > 50)
				throw new ApiError(400, "Invalid plan", "Use distinct question ids and at most 50 total browser samples.");
			const questions = await db
				.select({ id: prompts.id, value: prompts.value })
				.from(prompts)
				.where(and(eq(prompts.brandId, brand.id), eq(prompts.enabled, true), inArray(prompts.id, promptIds)));
			if (questions.length !== promptIds.length)
				throw new ApiError(400, "Invalid questions", "Select enabled questions belonging to this brand.");
			if ((await readRuntimeHealth()).worker !== "ready")
				throw new ApiError(400, "Worker offline", "Start the BeatGEO worker before collecting.");
			const boss = await getBoss();
			const jobs: Array<{ promptId: string; jobId: string | null | undefined }> = [];
			for (const question of questions)
				for (let repeat = 1; repeat <= repeats; repeat++) {
					const jobId = await boss.send(
						"process-prompt",
						{
							promptId: question.id,
							force: true,
							oneShot: true,
							expectedPromptValue: question.value,
							expectedTargets: JSON.stringify(targets),
						},
						{
							...PROMPT_JOB_OPTIONS,
							singletonKey: `agent-${commandId}-${question.id}-${repeat}`,
							singletonSeconds: 86400,
						},
					);
					jobs.push({ promptId: question.id, jobId });
					await db
						.update(workspaceCommands)
						.set({ result: { jobs, questions, repeats, targets } })
						.where(eq(workspaceCommands.id, commandId));
				}
			return {
				brandId: brand.id,
				questions,
				repeats,
				targets,
				jobs,
				note: "One-shot collection. This does not enable recurring monitoring or promise that a model will mention this brand.",
			};
		},
	);
}

export async function readAgentCollection(brandId: string, commandId: string, cancel = false) {
	const [command] = await db
		.select()
		.from(workspaceCommands)
		.where(
			and(
				eq(workspaceCommands.id, commandId),
				eq(workspaceCommands.brandId, brandId),
				eq(workspaceCommands.operation, "start_collection"),
			),
		);
	if (!command) throw new ApiError(404, "Not Found", "Collection not found.");
	const result = command.result as { jobs?: Array<{ jobId: string | null }> } | null;
	const boss = await getBoss();
	const jobs = [];
	for (const item of result?.jobs || []) {
		if (!item.jobId) continue;
		const job = await boss.getJobById("process-prompt", item.jobId);
		if (cancel && job && ["created", "retry"].includes(job.state)) await boss.cancel("process-prompt", job.id);
		jobs.push({
			id: item.jobId,
			state: cancel && job && ["created", "retry"].includes(job.state) ? "cancelled" : job?.state || "expired",
			output: job?.output,
		});
	}
	const ids = jobs.map((job) => job.id);
	const attempts = ids.length
		? await db
				.select()
				.from(collectionAttempts)
				.where(
					and(
						eq(collectionAttempts.brandId, brandId),
						inArray(sql<string>`${collectionAttempts.attemptKey}::jsonb ->> 0`, ids),
					),
				)
		: [];
	return {
		commandId,
		commandStatus: command.status,
		jobs,
		attempts: attempts.map(({ attemptKey: _key, ...attempt }) => attempt),
		completed: attempts.filter((a) => a.status === "completed").length,
		failed: attempts.filter((a) => a.status !== "completed" && a.status !== "running").length,
		note: "Queue completion is not collection success: inspect attempt status and original answers. Active browser submissions are allowed to finish; cancellation only removes queued work.",
	};
}

export async function getWorkspaceControl(brandId: string) {
	const [brand, history] = await Promise.all([
		db.query.brands.findFirst({ where: eq(brands.id, brandId) }),
		db
			.select({
				id: workspaceCommands.id,
				operation: workspaceCommands.operation,
				status: workspaceCommands.status,
				createdAt: workspaceCommands.createdAt,
			})
			.from(workspaceCommands)
			.where(eq(workspaceCommands.brandId, brandId))
			.orderBy(desc(workspaceCommands.createdAt))
			.limit(50),
	]);
	if (!brand) throw new ApiError(404, "Not found", "Brand not found.");
	return { brand, history };
}

export async function compareAgentCollections(brandId: string, baselineId: string, headId: string) {
	if (baselineId === headId) throw new ApiError(400, "Invalid comparison", "Select two different collection commands.");
	const [baseline, head] = await Promise.all([
		readAgentCollection(brandId, baselineId),
		readAgentCollection(brandId, headId),
	]);
	const before = baseline.attempts.flatMap((row) => (row.observation ? [row.observation] : []));
	const after = head.attempts.flatMap((row) => (row.observation ? [row.observation] : []));
	return {
		baselineId,
		headId,
		baselineCompleted: before.length,
		headCompleted: after.length,
		comparison: compareObservations(
			before,
			after,
			new Date(Math.max(0, ...before.map((row) => Date.parse(row.createdAt)))).toISOString(),
		),
		note: "Only identical question text, target and brand definitions are paired. This is a descriptive comparison of collected observations, not a trend, significance test, implemented-change receipt or proof of causation.",
	};
}

async function configureMonitoring(
	brand: typeof brands.$inferSelect,
	command: Extract<WorkspaceOperation, { type: "configure_monitoring" }>,
) {
	if (command.enabled) {
		const available = requireBrowserTargets().map((target) => target.model);
		if (command.models?.some((model) => !available.includes(model)))
			throw new ApiError(400, "Invalid models", "Choose browser engines configured on this local instance.");
	}
	const [updated] = await db
		.update(brands)
		.set({
			enabled: command.enabled,
			delayOverrideHours: command.intervalHours,
			...(command.models ? { enabledModels: command.models } : {}),
			updatedAt: sql`greatest(clock_timestamp(), ${brands.updatedAt} + interval '1 millisecond')`,
		})
		.where(
			and(
				eq(brands.id, brand.id),
				sql`date_trunc('milliseconds', ${brands.updatedAt}) = ${new Date(command.expectedUpdatedAt)}`,
			),
		)
		.returning();
	if (!updated)
		throw new ApiError(
			409,
			"Conflict",
			"Brand settings changed. Read the workspace and retry with the current updatedAt.",
		);
	const questions = await db
		.select({ id: prompts.id })
		.from(prompts)
		.where(and(eq(prompts.brandId, brand.id), eq(prompts.enabled, true)));
	const scheduled = command.enabled
		? await createMultiplePromptJobSchedulers(
				questions.map((p) => p.id),
				{ sendImmediate: false },
			)
		: [];
	return {
		enabled: updated.enabled,
		intervalHours: updated.delayOverrideHours,
		updatedAt: updated.updatedAt,
		scheduled: scheduled.filter(Boolean).length,
		schedulingFailures: scheduled.filter((ok) => !ok).length,
		note: "Local services and Chrome must remain online. Pausing prevents future collection; an in-flight browser submission may finish. No chat notification subscription is created.",
	};
}
