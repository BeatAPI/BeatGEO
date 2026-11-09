import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
	auth: vi.fn(),
	brand: vi.fn(),
	transaction: vi.fn(),
	select: vi.fn(),
	insert: vi.fn(),
	remove: vi.fn(),
	existing: [] as { kind: string }[],
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({ validator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@/lib/auth/helpers", () => ({ requireBrandSession: m.auth }));
vi.mock("../traffic-core", () => ({ trafficBrand: m.brand }));
vi.mock("@workspace/lib/db/db", () => ({ db: { transaction: m.transaction, select: m.select, delete: m.remove } }));

import { deleteAiReportFn, importAiReportFn, listAiReportsFn } from "../ai-reports";

const input = {
	brandId: "brand-a",
	source: "bing",
	dimension: "page",
	site: "example.com",
	startDate: "2026-10-01",
	endDate: "2026-10-28",
	scope: "All",
	content: "Page,Citations\nhttps://example.com/a,12",
};
beforeEach(() => {
	vi.clearAllMocks();
	m.existing = [];
	m.auth.mockResolvedValue({ user: { id: "owner" } });
	m.brand.mockResolvedValue({ website: "https://example.com" });
	m.transaction.mockImplementation(async (fn) =>
		fn({
			execute: vi.fn(),
			select: () => ({ from: () => ({ where: async () => m.existing }) }),
			insert: () => ({ values: m.insert }),
		}),
	);
});
it.each([listAiReportsFn, importAiReportFn, deleteAiReportFn])(
	"requires brand access before touching report data",
	async (fn) => {
		m.auth.mockRejectedValue(new Error("Forbidden"));
		await expect(fn({ data: input } as never)).rejects.toThrow("Forbidden");
		expect(m.transaction).not.toHaveBeenCalled();
		expect(m.select).not.toHaveBeenCalled();
		expect(m.remove).not.toHaveBeenCalled();
	},
);
it("rejects reports belonging to a different brand website", async () => {
	await expect(
		importAiReportFn({
			data: { ...input, site: "other.test", content: "Page,Citations\nhttps://other.test/a,12" },
		} as never),
	).rejects.toThrow("website saved");
	expect(m.transaction).not.toHaveBeenCalled();
});
it("stores one snapshot and makes a duplicate import idempotent", async () => {
	const first = await importAiReportFn({ data: input } as never);
	expect(first.duplicate).toBe(false);
	expect(m.insert).toHaveBeenCalledTimes(1);
	const record = m.insert.mock.calls[0][0];
	expect(record.snapshot.rows).toEqual([{ key: "https://example.com/a", value: 12 }]);
	expect(record.brandId).toBe("brand-a");
	m.existing = [{ kind: record.kind }];
	const second = await importAiReportFn({ data: input } as never);
	expect(second).toEqual({ id: first.id, duplicate: true });
	expect(m.insert).toHaveBeenCalledTimes(1);
});
it("refuses excess history without discarding existing reports", async () => {
	m.existing = Array.from({ length: 100 }, (_, i) => ({ kind: `ai-report:${i}` }));
	await expect(importAiReportFn({ data: input } as never)).rejects.toThrow("Report limit");
	expect(m.insert).not.toHaveBeenCalled();
	expect(m.remove).not.toHaveBeenCalled();
});
