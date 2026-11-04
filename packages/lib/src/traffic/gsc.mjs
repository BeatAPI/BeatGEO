// Search Console performance data describes Google Search, not AI referrals.
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API = "https://www.googleapis.com/webmasters/v3/sites";

async function request(url, token, body, fetchImpl) {
	let response;
	try {
		response = await fetchImpl(url, {
			method: body ? "POST" : "GET",
			redirect: "error",
			headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
			...(body ? { body: JSON.stringify(body) } : {}),
			signal: AbortSignal.timeout(30000),
		});
	} catch {
		throw new Error("Search Console request failed or timed out.");
	}
	if (!response.ok) throw new Error(`Search Console API HTTP ${response.status}. Check authorization and API access.`);
	try {
		return await response.json();
	} catch {
		throw new Error("Invalid Search Console API response.");
	}
}

export async function listGscProperties(token, { fetchImpl = fetch } = {}) {
	const data = await request(API, token, null, fetchImpl);
	if (data.siteEntry !== undefined && !Array.isArray(data.siteEntry))
		throw new Error("Invalid Search Console property list.");
	return (data.siteEntry ?? [])
		.filter((entry) => typeof entry.siteUrl === "string" && entry.permissionLevel !== "siteUnverifiedUser")
		.map((entry) => ({ siteUrl: entry.siteUrl, permissionLevel: entry.permissionLevel }));
}

export async function fetchGsc({ token, siteUrl, startDate, endDate, fetchImpl = fetch }) {
	for (const date of [startDate, endDate]) {
		if (
			typeof date !== "string" ||
			!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
			!Number.isFinite(Date.parse(date)) ||
			new Date(date).toISOString().slice(0, 10) !== date
		)
			throw new Error("Search Console dates must be valid YYYY-MM-DD dates.");
	}
	if (startDate > endDate) throw new Error("Search Console start date must not follow end date.");
	const sites = await listGscProperties(token, { fetchImpl });
	if (!sites.some((site) => site.siteUrl === siteUrl))
		throw new Error("This Google account cannot read the selected Search Console property.");
	const url = `${API}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
	const base = { startDate, endDate, type: "web", dataState: "final" };
	async function details(dimension) {
		const rows = [];
		for (let offset = 0; offset < 10000; offset += 1000) {
			const result = await request(
				url,
				token,
				{ ...base, dimensions: [dimension], rowLimit: 1000, startRow: offset },
				fetchImpl,
			);
			if (result.rows !== undefined && !Array.isArray(result.rows))
				throw new Error("Invalid Search Console performance response.");
			const batch = result.rows ?? [];
			if (batch.length > 1000) throw new Error("Invalid Search Console page size.");
			rows.push(...batch);
			if (batch.length < 1000) return { rows, limitReached: false };
		}
		return { rows, limitReached: true };
	}
	const [totals, pages, queries] = await Promise.all([
		request(url, token, base, fetchImpl),
		details("page"),
		details("query"),
	]);
	for (const result of [totals]) {
		if (result.rows !== undefined && !Array.isArray(result.rows))
			throw new Error("Invalid Search Console performance response.");
	}
	return {
		schema: "beat-geo/gsc-summary@1",
		site: siteUrl,
		siteUrl,
		startDate,
		endDate,
		fetchedAt: new Date().toISOString(),
		totals: totals.rows?.[0] ?? null,
		pages: pages.rows ?? [],
		queries: queries.rows ?? [],
		limitReached: pages.limitReached || queries.limitReached,
		warning:
			"Google Search performance only. Google may omit queries or return only top rows; detail is limited to 10,000 rows per view and must not be summed as totals.",
	};
}
