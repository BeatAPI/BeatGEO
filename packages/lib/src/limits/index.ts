/**
 * Hard caps on what a brand may hold, checked on every write path. These block
 * only *adding* beyond a cap; anything already over is left alone.
 */

import { count, eq, inArray, sql } from "drizzle-orm";
import { MAX_COMPETITORS, MAX_PROMPTS } from "../constants";
import { db } from "../db/db";
import type { DbConnection } from "../db/db-connection";
import { brands, competitors, prompts } from "../db/schema";

export type WriteDenialCode = "prompt-cap" | "competitor-cap";

export class WriteDeniedError extends Error {
	readonly code: WriteDenialCode;
	readonly status = 409;
	readonly error = "Conflict";

	constructor(code: WriteDenialCode, message: string) {
		super(message);
		this.name = "WriteDeniedError";
		this.code = code;
	}
}

export type WriteDecision = { allowed: true } | { allowed: false; code: WriteDenialCode; message: string };

const ALLOWED: WriteDecision = { allowed: true };

/** Blocks adding, not the current size: the editor resubmits every row on save,
 * and a brand can already be over the cap. */
export function decidePromptCap(existing: number, adding: number): WriteDecision {
	if (adding <= 0 || existing + adding <= MAX_PROMPTS) return ALLOWED;
	return {
		allowed: false,
		code: "prompt-cap",
		message: `A brand may have at most ${MAX_PROMPTS} prompts (this one has ${existing}).`,
	};
}

export function decideCompetitorCap(resulting: number): WriteDecision {
	if (resulting <= MAX_COMPETITORS) return ALLOWED;
	return {
		allowed: false,
		code: "competitor-cap",
		message: `A brand may have at most ${MAX_COMPETITORS} competitors (this would leave ${resulting}).`,
	};
}

export function assertAllowed(decision: WriteDecision): void {
	if (!decision.allowed) throw new WriteDeniedError(decision.code, decision.message);
}

export async function assertPromptCap(brandId: string, adding: number, conn: DbConnection = db): Promise<void> {
	if (adding <= 0) return;
	const [row] = await conn.select({ value: count() }).from(prompts).where(eq(prompts.brandId, brandId));
	assertAllowed(decidePromptCap(row?.value ?? 0, adding));
}

/** Guard adding `adding` competitors to a brand. */
export async function assertCompetitorCap(brandId: string, adding: number, conn: DbConnection = db): Promise<void> {
	if (adding <= 0) return;
	const [row] = await conn.select({ value: count() }).from(competitors).where(eq(competitors.brandId, brandId));
	assertAllowed(decideCompetitorCap((row?.value ?? 0) + adding));
}

/** Advisory locks share one namespace per database; the first argument keeps
 * these locks off any other use of the same org id. */
const QUOTA_LOCK_CLASS = 0x656c6d6f;

/**
 * Serialize one organization's capped writes, so two requests cannot both see
 * the last free slot and both take it.
 *
 * `run` must do all of its work on the `tx` it is handed, checks included.
 * Reaching for the pooled `db` holds this transaction open while waiting for a
 * second connection, which deadlocks the pool under enough concurrent callers.
 */
export async function withQuotaLock<T>(
	organizationId: string,
	run: (tx: DbConnection, afterCommit: (task: () => Promise<unknown>) => void) => Promise<T>,
): Promise<T> {
	const deferred: Array<() => Promise<unknown>> = [];
	const value = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${QUOTA_LOCK_CLASS}, hashtext(${organizationId}))`);
		return run(tx, (task) => deferred.push(task));
	});
	for (const task of deferred) await task();
	return value;
}

export async function countBrandsByOrg(orgIds: string[], conn: DbConnection = db): Promise<Map<string, number>> {
	if (orgIds.length === 0) return new Map();
	const rows = await conn
		.select({ organizationId: brands.organizationId, value: count() })
		.from(brands)
		.where(inArray(brands.organizationId, orgIds))
		.groupBy(brands.organizationId);
	return new Map(rows.map((row) => [row.organizationId, row.value]));
}

export async function countOrgBrands(organizationId: string, conn: DbConnection = db): Promise<number> {
	return (await countBrandsByOrg([organizationId], conn)).get(organizationId) ?? 0;
}

/**
 * The org a brand belongs to, for callers that hold only a brand id and no
 * user context (/api/v1 key auth, the worker). Access control is the caller's
 * concern; this is pure tenancy resolution.
 */
export async function getBrandOrganizationId(brandId: string): Promise<string> {
	const [row] = await db
		.select({ organizationId: brands.organizationId })
		.from(brands)
		.where(eq(brands.id, brandId))
		.limit(1);
	if (!row) throw new Error(`Brand not found: ${brandId}`);
	return row.organizationId;
}
