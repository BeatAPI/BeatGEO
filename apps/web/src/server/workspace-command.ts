import { createHash } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { workspaceCommands } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { ApiError } from "@/lib/api/handler";

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => [key, canonical(item)]),
		);
	return value;
}

export async function workspaceCommand(
	input: {
		organizationId: string;
		brandId?: string;
		operation: string;
		idempotencyKey: string;
		args: unknown;
	},
	execute: (commandId: string) => Promise<unknown>,
) {
	const fingerprint = createHash("sha256")
		.update(JSON.stringify(canonical([input.operation, input.brandId, input.args])))
		.digest("hex");
	// Persist intent before any independently committed service or queue side effect.
	// A crash leaves an inspectable running command rather than silently replaying it.
	const [command] = await db
		.insert(workspaceCommands)
		.values({ ...input, fingerprint })
		.onConflictDoNothing()
		.returning();
	if (!command) {
		const [previous] = await db
			.select()
			.from(workspaceCommands)
			.where(
				and(
					eq(workspaceCommands.organizationId, input.organizationId),
					eq(workspaceCommands.idempotencyKey, input.idempotencyKey),
				),
			);
		if (previous.fingerprint !== fingerprint)
			throw new ApiError(409, "Conflict", "This idempotency key was used for different arguments.");
		if (previous.status === "completed") return { commandId: previous.id, replayed: true, data: previous.result };
		throw new ApiError(
			409,
			"Conflict",
			previous.error ||
				"This command is running or was interrupted. Inspect its history before starting another command.",
		);
	}
	try {
		const result = await execute(command.id);
		const data: unknown = JSON.parse(JSON.stringify(result));
		await db
			.update(workspaceCommands)
			.set({ status: "completed", result: data, finishedAt: new Date() })
			.where(eq(workspaceCommands.id, command.id));
		return { commandId: command.id, replayed: false, data };
	} catch (error) {
		await db
			.update(workspaceCommands)
			.set({
				status: "failed",
				error: "Command failed. Inspect current project state before retrying with a new key.",
				finishedAt: new Date(),
			})
			.where(eq(workspaceCommands.id, command.id));
		throw error;
	}
}
