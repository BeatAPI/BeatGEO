import { describe, expect, it, vi } from "vitest";
import { fetchGaPerformance } from "./ga.mjs";

describe("GA search acquisition", () => {
	it("keeps channel and landing reports separate with Google's session rate and threshold metadata", async () => {
		const calls: Record<string, unknown>[] = [];
		const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
			if (String(url).includes("analyticsadmin")) return Response.json({ timeZone: "America/New_York" });
			const input = JSON.parse(String(init?.body));
			calls.push(input);
			return Response.json({
				rowCount: 1,
				metadata: { subjectToThresholding: true },
				rows: [
					{
						dimensionValues: input.dimensions.map((d: { name: string }) => ({
							value: d.name === "landingPage" ? "/pricing" : "google",
						})),
						metricValues: ["10", "8", "15", "0.6"].map((value) => ({ value })),
					},
				],
			});
		});
		const result = await fetchGaPerformance({
			token: "private",
			property: { id: "1", name: "Test" },
			site: "example.com",
			start: "2026-10-01",
			end: "2026-10-28",
			fetchImpl,
		});
		expect(calls).toHaveLength(6);
		expect(result.current.organicPages.rows[0].metrics.sessionKeyEventRate).toBe(0.6);
		expect(result.current.organicPages.metadata[0].subjectToThresholding).toBe(true);
		expect(result.previous.endDate).toBe("2026-09-30");
		const search = calls.filter((c) => JSON.stringify(c.dimensionFilter).includes('"Organic Search"'));
		expect(search).toHaveLength(4);
		expect(search.filter((c) => JSON.stringify(c.dimensionFilter).includes('"sessionSource"'))).toHaveLength(2);
		expect(JSON.stringify(result)).not.toContain("private");
	});
});
