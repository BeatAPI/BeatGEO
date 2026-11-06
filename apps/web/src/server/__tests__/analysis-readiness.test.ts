import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ traffic: vi.fn(), evidence: vi.fn(), saved: vi.fn(), commands: vi.fn() }));
vi.mock("../traffic-core", () => ({ readTraffic: mocks.traffic }));
vi.mock("../analysis-core", () => ({ latestEvidence: mocks.evidence }));
vi.mock("../../../../../tools/seo-geo/src/saved-evidence.mjs", () => ({ readSavedSeoEvidence: mocks.saved }));
vi.mock("@workspace/lib/db/db", () => ({
	db: { select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: mocks.commands }) }) }) }) },
}));

import { analysisReadiness, googleAnalysisState } from "../analysis-readiness";

beforeEach(() => {
	vi.resetAllMocks();
	mocks.commands.mockResolvedValue([]);
	mocks.evidence.mockResolvedValue([]);
	mocks.saved.mockResolvedValue(null);
	mocks.traffic.mockResolvedValue({ site: "example.com", gsc: null, ga: null });
});
describe("search analysis source readiness", () => {
	it("keeps saved evidence readable while disabling refresh after disconnect", () => {
		expect(
			googleAnalysisState({ connected: false, selected: true, hasSnapshot: true, observedAt: "2026-11-01T00:00:00Z" }),
		).toMatchObject({ status: "disconnected", canRefresh: false, observedAt: "2026-11-01T00:00:00Z" });
	});
	it("distinguishes choosing a property, first collection, legacy summaries and stale analysis", () => {
		const base = { connected: true, selected: true, hasSnapshot: false, observedAt: null };
		expect(googleAnalysisState({ ...base, selected: false }).status).toBe("select_property");
		expect(googleAnalysisState(base).status).toBe("first_refresh");
		expect(googleAnalysisState({ ...base, hasSnapshot: true }).status).toBe("legacy_snapshot");
		expect(googleAnalysisState({ ...base, observedAt: "2026-10-01" }, Date.parse("2026-11-01")).status).toBe("stale");
	});
	it("returns safe setup guidance when sources are not connected and no real saved result exists", async () => {
		const result = await analysisReadiness("brand-a");
		expect(result.sources.every((source) => !source.canRefresh)).toBe(true);
		expect(result.seo).toEqual({ status: "no_saved_result", canRefresh: false });
		expect(result.lastRefresh).toBeNull();
	});
	it("enables import only for a usable saved result belonging to the current website", async () => {
		mocks.saved.mockResolvedValue({ snapshot: { site: "other.example" } });
		expect((await analysisReadiness("brand-a")).seo.status).toBe("wrong_site");
		mocks.saved.mockResolvedValue({ snapshot: { site: "example.com" } });
		expect((await analysisReadiness("brand-a")).seo).toEqual({ status: "ready", canRefresh: true });
	});
	it("matches the SEO workbench domain normalization for www brands", async () => {
		mocks.traffic.mockResolvedValue({ site: "www.example.com", gsc: null, ga: null });
		mocks.saved.mockResolvedValue({ snapshot: { site: "example.com" } });
		expect((await analysisReadiness("brand-a")).seo).toEqual({ status: "ready", canRefresh: true });
	});
	it("does not expose raw file errors, credentials or failed command details", async () => {
		mocks.saved.mockRejectedValue(new Error("private/path/provider-token"));
		mocks.commands.mockResolvedValue([{ status: "failed", createdAt: new Date("2026-11-01") }]);
		const result = await analysisReadiness("brand-a");
		expect(result.seo).toEqual({ status: "unavailable", canRefresh: false });
		expect(result.lastRefresh?.status).toBe("failed");
		expect(JSON.stringify(result)).not.toContain("provider-token");
	});
});
