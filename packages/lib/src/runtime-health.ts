import { randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "./db/db";
import { runtimeHeartbeats } from "./db/schema";

export const WORKER_STALE_MS = 90_000;

export function workerStatus(lastSeen: Date | null, now = new Date()) {
	if (!lastSeen) return "not_started" as const;
	return now.getTime() - lastSeen.getTime() <= WORKER_STALE_MS ? ("ready" as const) : ("offline" as const);
}

export async function readRuntimeHealth() {
	return db.transaction(async (tx) => {
		await tx.execute(sql`set local statement_timeout = '5s'`);
		const [row] = await tx
			.select({ lastSeen: sql<Date | null>`max(${runtimeHeartbeats.lastSeen})` })
			.from(runtimeHeartbeats)
			.where(eq(runtimeHeartbeats.service, "worker"));
		const lastSeen = row?.lastSeen ? new Date(row.lastSeen) : null;
		return { database: "ready" as const, worker: workerStatus(lastSeen), lastSeen: lastSeen?.toISOString() ?? null };
	});
}

// Published only after queue creation and handler registration succeed.
export async function startWorkerHeartbeat(onError: () => void) {
	const id = randomUUID();
	let stopped = false;
	let writing = false;
	let pending: Promise<void> = Promise.resolve();
	const write = async () => {
		await db.transaction(async (tx) => {
			await tx.execute(sql`set local statement_timeout = '5s'`);
			await tx
				.insert(runtimeHeartbeats)
				.values({ id, service: "worker" })
				.onConflictDoUpdate({
					target: runtimeHeartbeats.id,
					set: { lastSeen: sql`now()` },
				});
			await tx
				.delete(runtimeHeartbeats)
				.where(
					and(eq(runtimeHeartbeats.service, "worker"), lt(runtimeHeartbeats.lastSeen, sql`now() - interval '7 days'`)),
				);
		});
	};
	await write();
	const timer = setInterval(() => {
		if (stopped || writing) return;
		writing = true;
		pending = write()
			.catch(onError)
			.finally(() => {
				writing = false;
			});
	}, 20_000);
	timer.unref();
	return async () => {
		stopped = true;
		clearInterval(timer);
		await pending;
		await db.delete(runtimeHeartbeats).where(eq(runtimeHeartbeats.id, id));
	};
}
