import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { runtimeHeartbeats } from "@workspace/lib/db/schema";
import { readRuntimeHealth, startWorkerHeartbeat, workerStatus } from "@workspace/lib/runtime-health";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

it("reports a registered worker and removes its heartbeat on shutdown", async () => {
	const error = vi.fn();
	const stop = await startWorkerHeartbeat(error);
	try {
		expect(await readRuntimeHealth()).toMatchObject({ database: "ready", worker: "ready" });
	} finally {
		await stop();
	}
	expect(error).not.toHaveBeenCalled();
});
it("reports missing and stale heartbeats without claiming an empty queue is healthy", async () => {
	const now = new Date();
	expect(workerStatus(null, now)).toBe("not_started");
	expect(workerStatus(new Date(now.getTime() - 100_000), now)).toBe("offline");
	expect(workerStatus(new Date(now.getTime() - 20_000), now)).toBe("ready");
	const id = randomUUID();
	await db.insert(runtimeHeartbeats).values({ id, service: "worker", lastSeen: new Date(now.getTime() - 100_000) });
	try {
		expect((await readRuntimeHealth()).worker).toBe("offline");
	} finally {
		await db.delete(runtimeHeartbeats).where(eq(runtimeHeartbeats.id, id));
	}
});
