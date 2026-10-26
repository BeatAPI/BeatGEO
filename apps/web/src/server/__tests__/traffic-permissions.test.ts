import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
	auth: vi.fn(),
	read: vi.fn(),
	sync: vi.fn(),
	disconnect: vi.fn(),
	importLog: vi.fn(),
	properties: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({ validator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setCookie: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ requireBrandSession: m.auth }));
vi.mock("../traffic-core", () => ({
	readTraffic: m.read,
	syncGa: m.sync,
	disconnectGa: m.disconnect,
	gaProperties: m.properties,
	importCrawlTraffic: m.importLog,
	trafficReturnTo: vi.fn(),
}));

import { connectGaFn, disconnectGaFn, getGaPropertiesFn, getTrafficFn, importCrawlsFn, syncGaFn } from "../traffic-fn";

beforeEach(() => {
	vi.clearAllMocks();
	m.auth.mockRejectedValue(new Error("Forbidden"));
});
it.each([getTrafficFn, getGaPropertiesFn, syncGaFn, disconnectGaFn, importCrawlsFn, connectGaFn])(
	"checks brand access before reading data, storing credentials or making Google requests",
	async (fn) => {
		await expect(
			fn({ data: { brandId: "other-brand", content: "private-log", format: "auto" } } as never),
		).rejects.toThrow("Forbidden");
		for (const call of [m.read, m.sync, m.disconnect, m.importLog, m.properties]) expect(call).not.toHaveBeenCalled();
	},
);
