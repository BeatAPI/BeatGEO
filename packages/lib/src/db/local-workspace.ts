import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { member, organization, user } from "./schema";

/** Preserve the sole existing owner; never claim a multi-user database. */
export async function ensureLocalWorkspace() {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('beatgeo-local-workspace'))`);
		const users = await tx.select().from(user).limit(2);
		if (users.length > 1)
			throw new Error(
				"This database contains multiple users. Open it with its original configuration; no ownership was changed.",
			);
		let owner = users[0];
		if (owner?.banned) throw new Error("The existing workspace owner is disabled. No ownership was changed.");
		if (!owner) {
			[owner] = await tx
				.insert(user)
				.values({
					id: randomUUID(),
					name: "Local workspace",
					email: "workspace@beatgeo.invalid",
					emailVerified: true,
					role: "user",
				})
				.returning();
		}
		const organizations = await tx.select().from(organization).limit(2);
		if (organizations.length > 1 || (organizations[0] && organizations[0].id !== "default"))
			throw new Error("This database is not a single local workspace. No ownership was changed.");
		await tx
			.insert(organization)
			.values({ id: "default", name: "Local workspace", slug: "default", createdAt: new Date() })
			.onConflictDoNothing({ target: organization.id });
		const [membership] = await tx
			.select()
			.from(member)
			.where(and(eq(member.userId, owner.id), eq(member.organizationId, "default")))
			.limit(1);
		if (membership && !["admin", "owner"].includes(membership.role))
			throw new Error("The existing workspace membership is not an owner. No permissions were changed.");
		if (!membership)
			await tx.insert(member).values({
				id: randomUUID(),
				userId: owner.id,
				organizationId: "default",
				role: "admin",
				createdAt: new Date(),
			});
		return owner;
	});
}
