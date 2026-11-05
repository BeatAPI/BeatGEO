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
		const seen = new Set();
		for (let offset = 0; offset < 10000; offset += 1000) {
			const result = await request(
				url,
				token,
				{ ...base, dimensions: [dimension], rowLimit: 1000, startRow: offset },
				fetchImpl,
			);
			if (result.rows !== undefined && !Array.isArray(result.rows))
				throw new Error("Invalid Search Console performance response.");
			const batch = cleanRows(result.rows ?? [], [dimension]);
			if (batch.length > 1000) throw new Error("Invalid Search Console page size.");
			appendGscRows(rows, batch, seen);
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
		totals: cleanRows(totals.rows ?? [], [])[0] ?? null,
		pages: pages.rows ?? [],
		queries: queries.rows ?? [],
		limitReached: pages.limitReached || queries.limitReached,
		warning:
			"Google Search performance only. Google may omit queries or return only top rows; detail is limited to 10,000 rows per view and must not be summed as totals.",
	};
}

/** A bounded, reproducible comparison; missing rows are never inferred as zero. */
export async function fetchGscAnalysis({ token, siteUrl, startDate, endDate, maxRows = 2000, fetchImpl = fetch }) {
	if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 10000)
		throw new Error("Invalid Search Console row budget.");
	const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1;
	if (!Number.isInteger(days) || days < 1 || days > 90)
		throw new Error("Search comparisons are limited to 90 days per period.");
	const current = await fetchGsc({ token, siteUrl, startDate, endDate, fetchImpl });
	const shift = (date, n) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
	const previous = await fetchGsc({
		token,
		siteUrl,
		startDate: shift(startDate, -days),
		endDate: shift(startDate, -1),
		fetchImpl,
	});
	const url = `${API}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
	async function dataset(period, dimensions) {
		const rows = [];
		const seen = new Set();
		let exhausted = false;
		while (rows.length < maxRows) {
			const limit = Math.min(1000, maxRows - rows.length);
			const response = await request(
				url,
				token,
				{
					startDate: period.startDate,
					endDate: period.endDate,
					type: "web",
					dataState: "final",
					dimensions,
					rowLimit: limit,
					startRow: rows.length,
				},
				fetchImpl,
			);
			const batch = cleanRows(response.rows ?? [], dimensions);
			if (
				!Array.isArray(batch) ||
				batch.length > limit ||
				batch.some(
					(row) =>
						!Array.isArray(row.keys) ||
						row.keys.length !== dimensions.length ||
						row.keys.some((k) => typeof k !== "string") ||
						["clicks", "impressions", "ctr", "position"].some((k) => !Number.isFinite(row[k]) || row[k] < 0) ||
						row.ctr > 1,
				)
			)
				throw new Error("Invalid Search Console analysis rows.");
			appendGscRows(rows, batch, seen);
			if (batch.length < limit) {
				exhausted = true;
				break;
			}
		}
		return { dimensions, rows, returnedRows: rows.length, limitReached: !exhausted, providerLimited: true };
	}
	async function enrich(period) {
		const [daily, queryPages, dailyPages] = await Promise.all([
			dataset(period, ["date"]),
			dataset(period, ["query", "page"]),
			dataset(period, ["date", "page"]),
		]);
		return { ...period, daily, queryPages, dailyPages };
	}
	const [head, base] = await Promise.all([enrich(current), enrich(previous)]);
	return {
		...current,
		analysis: { schema: "beat-geo/gsc-analysis@1", timezone: "America/Los_Angeles", current: head, previous: base },
	};
}

function cleanRows(rows, dimensions) {
	if (!Array.isArray(rows)) throw new Error("Invalid Search Console rows.");
	return rows.map((row) => {
		const keys = row.keys ?? [];
		if (!Array.isArray(keys) || keys.length !== dimensions.length || keys.some((key) => typeof key !== "string"))
			throw new Error("Invalid Search Console dimensions.");
		if (
			["clicks", "impressions", "ctr", "position"].some((key) => !Number.isFinite(row[key]) || row[key] < 0) ||
			row.ctr > 1
		)
			throw new Error("Invalid Search Console metrics.");
		return { keys, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
	});
}

function appendGscRows(rows, batch, seen) {
	for (const row of batch) {
		const key = JSON.stringify(row.keys);
		if (seen.has(key)) throw new Error("Search Console rows changed during pagination; retry the report.");
		seen.add(key);
		rows.push(row);
	}
}
