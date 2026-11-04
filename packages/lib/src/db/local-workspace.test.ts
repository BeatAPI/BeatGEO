import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("./db", () => ({
	db: {
		transaction: async (run: (tx: unknown) => Promise<unknown>) => {
			const before = structuredClone(state.rows);
			const tx = {
				execute: async () => {},
				select: () => ({
					from: (table: Parameters<typeof getTableName>[0]) => {
						const rows = state.rows[getTableName(table)] ?? [];
						return {
							limit: async (count: number) => rows.slice(0, count),
							where: () => ({ limit: async (count: number) => rows.slice(0, count) }),
						};
					},
				}),
				insert: (table: Parameters<typeof getTableName>[0]) => ({
					values: (value: Record<string, unknown>) => {
						state.rows[getTableName(table)] ??= [];
						const rows = state.rows[getTableName(table)];
						if (getTableName(table) === "member") {
							rows.push(value);
							return Promise.resolve();
						}
						return {
							returning: async () => {
								rows.push(value);
								return [value];
							},
							onConflictDoNothing: async () => {
								if (!rows.some((row) => row.id === value.id)) rows.push(value);
							},
						};
					},
				}),
			};
			try {
				return await run(tx);
			} catch (error) {
				state.rows = before;
				throw error;
			}
		},
	},
}));

import { ensureLocalWorkspace } from "./local-workspace";

beforeEach(() => {
	state.rows = { user: [], organization: [], member: [], brands: [] };
});
describe("private local workspace ownership", () => {
	it("creates one private owner and reuses it on later opens without a password", async () => {
		const first = await ensureLocalWorkspace();
		const again = await ensureLocalWorkspace();
		expect(first.id).toBe(again.id);
		expect(state.rows.user).toHaveLength(1);
		expect(state.rows.organization).toHaveLength(1);
		expect(state.rows.member).toHaveLength(1);
		expect(state.rows.user[0]).not.toHaveProperty("password");
		expect(state.rows.account).toBeUndefined();
	});
	it("preserves the existing owner, organization URL and brands", async () => {
		state.rows = {
			user: [{ id: "original-owner", name: "Original", email: "original@example.invalid" }],
			organization: [{ id: "default", slug: "original-workspace", name: "Original workspace" }],
			member: [{ id: "original-membership", organizationId: "default", userId: "original-owner", role: "admin" }],
			brands: [{ id: "brand-1", organizationId: "default" }],
		};
		const before = structuredClone(state.rows);
		expect((await ensureLocalWorkspace()).id).toBe("original-owner");
		expect(state.rows).toEqual(before);
	});
	it("refuses to claim a multi-user database", async () => {
		state.rows.user = [{ id: "one" }, { id: "two" }];
		const before = structuredClone(state.rows);
		await expect(ensureLocalWorkspace()).rejects.toThrow(/multiple users/);
		expect(state.rows).toEqual(before);
	});
	it("does not bypass a disabled existing owner", async () => {
		state.rows.user = [{ id: "disabled", banned: true }];
		await expect(ensureLocalWorkspace()).rejects.toThrow(/disabled/);
	});
	it("does not promote an existing non-owner member", async () => {
		state.rows.user = [{ id: "member" }];
		state.rows.organization = [{ id: "default" }];
		state.rows.member = [{ userId: "member", organizationId: "default", role: "member" }];
		const before = structuredClone(state.rows);
		await expect(ensureLocalWorkspace()).rejects.toThrow(/not an owner/);
		expect(state.rows).toEqual(before);
	});
});
