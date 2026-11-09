import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
	auth: vi.fn(),
	brand: vi.fn(),
	fetch: vi.fn(),
	writes: [] as Array<Record<string, unknown>>,
	config: null as unknown,
	acquired: true,
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({ validator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@/lib/auth/helpers", () => ({ requireBrandSession: m.auth }));
vi.mock("../traffic-core", () => ({ trafficBrand: m.brand }));
vi.mock("@workspace/lib/db/db", () => ({
	db: {
		transaction: async (fn: (tx: unknown) => unknown) =>
			fn({
				execute: async () => ({ rows: [{ acquired: m.acquired }] }),
				select: () => ({ from: () => ({ where: async () => (m.config ? [{ config: m.config }] : []) }) }),
				insert: () => ({
					values: (value: Record<string, unknown>) => ({
						onConflictDoUpdate: async () => {
							m.writes.push(value);
						},
					}),
				}),
			}),
	},
}));

import { readAiConnectionFn } from "../ai-report-connections";

const input = { brandId: "brand-a", source: "bing", property: "https://example.com/", action: "sync" };
beforeEach(() => {
	vi.clearAllMocks();
	m.writes = [];
	m.config = null;
	m.acquired = true;
	vi.stubGlobal("fetch", m.fetch);
	m.auth.mockResolvedValue({});
	m.brand.mockResolvedValue({ website: "https://example.com" });
	m.fetch.mockResolvedValue(
		new Response(
			JSON.stringify({
				ready: true,
				property: input.property,
				url: "https://www.bing.com/webmasters/aiperformance",
				startDate: "2026-10-01",
				endDate: "2026-10-02",
				total: 10,
				coverage: "Official rows",
				tables: [{ dimension: "page", rows: [{ key: "https://example.com/a", value: 10 }] }],
			}),
		),
	);
});
it("requires brand access and website ownership before opening a report", async () => {
	m.auth.mockRejectedValue(new Error("Forbidden"));
	await expect(readAiConnectionFn({ data: input } as never)).rejects.toThrow("Forbidden");
	expect(m.fetch).not.toHaveBeenCalled();
	m.auth.mockResolvedValue({});
	await expect(readAiConnectionFn({ data: { ...input, property: "https://other.test/" } } as never)).rejects.toThrow(
		"website saved",
	);
	expect(m.fetch).not.toHaveBeenCalled();
});
it("saves a validated browser report and its last successful synchronization", async () => {
	const result = await readAiConnectionFn({ data: input } as never);
	expect(result.ok).toBe(true);
	const report = m.writes[0].snapshot as Record<string, unknown>;
	expect(report.method).toBe("browser");
	expect(report.total).toBe(10);
	expect(report.rows).toEqual([{ key: "https://example.com/a", value: 10 }]);
	expect(m.writes[1].config).toMatchObject({
		aiReport: { state: "ready", property: input.property, lastSyncedAt: expect.any(String) },
	});
});
it("preserves the last successful sync and never writes an empty report after failure", async () => {
	m.config = { site: "example.com", aiReport: { property: input.property, lastSyncedAt: "2026-10-01T00:00:00Z" } };
	m.fetch.mockRejectedValue(new Error("offline"));
	const result = await readAiConnectionFn({ data: input } as never);
	expect(result.ok).toBe(false);
	expect(m.writes).toHaveLength(1);
	expect(m.writes[0].config).toMatchObject({
		aiReport: { state: "needs-attention", lastSyncedAt: "2026-10-01T00:00:00Z" },
	});
});
it("does not accept a response for another website or an out-of-scope page", async () => {
	m.fetch.mockResolvedValue(
		new Response(
			JSON.stringify({
				ready: true,
				property: input.property,
				url: "https://www.bing.com/webmasters/",
				startDate: "2026-10-01",
				endDate: "2026-10-02",
				tables: [{ dimension: "page", rows: [{ key: "https://other.test/a", value: 5 }] }],
			}),
		),
	);
	expect((await readAiConnectionFn({ data: input } as never)).ok).toBe(false);
	expect(m.writes.every((row) => String(row.kind).startsWith("ai-connection:"))).toBe(true);
});
it("does not start another browser operation while a sync holds the lock", async () => {
	m.acquired = false;
	await expect(readAiConnectionFn({ data: input } as never)).rejects.toThrow("busy");
	expect(m.fetch).not.toHaveBeenCalled();
});
