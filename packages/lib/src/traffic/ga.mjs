// GA4 read-only adapter. Session acquisition, crawl requests and sampled answers stay separate.
import { readFile } from "node:fs/promises";
import { logTime, siteHostname } from "./crawls.mjs";

export const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const GA_DIMENSIONS = ["sessionSource", "sessionMedium", "sessionDefaultChannelGroup"];
export const GA_METRICS = ["sessions", "engagedSessions", "keyEvents"];
export const AI_SOURCES = [
	["ChatGPT", ["chatgpt.com", "chat.openai.com"]],
	["Gemini", ["gemini.google.com", "bard.google.com"]],
	["Perplexity", ["perplexity.ai"]],
	["Claude", ["claude.ai"]],
	["Copilot", ["copilot.microsoft.com"]],
	["DeepSeek", ["chat.deepseek.com", "deepseek.com"]],
	["Grok", ["grok.com"]],
	["豆包 / Doubao", ["doubao.com"]],
	["Kimi", ["kimi.com", "kimi.moonshot.cn"]],
];
const domains = AI_SOURCES.flatMap(([, hosts]) => hosts);
const SOURCE_REGEX = `(?i)^([a-z0-9-]+\\.)*(${domains.map((d) => d.replaceAll(".", "\\.")).join("|")})$`;
export function classifyGaSource(source, channel) {
	const host = source.toLowerCase().replace(/\.$/, "");
	const match = AI_SOURCES.find(([, hosts]) => hosts.some((d) => host === d || host.endsWith(`.${d}`)));
	return match
		? { platform: match[0], basis: "source-domain" }
		: channel === "AI Assistant"
			? { platform: "Other AI Assistant", basis: "ga-channel" }
			: null;
}
export function gaProperty(value) {
	const id = String(value ?? "").replace(/^properties\//, "");
	if (!/^[1-9]\d*$/.test(id))
		throw new Error("GA property must be a numeric GA4 property ID (not a G- measurement ID).");
	return id;
}
export function gaDates({ start = "28daysAgo", end = "yesterday" } = {}) {
	for (const date of [start, end]) {
		if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
				throw new Error("Invalid GA date.");
		} else if (!/^(today|yesterday|[1-9]\d*daysAgo)$/.test(date))
			throw new Error("GA dates use YYYY-MM-DD, yesterday, today or NdaysAgo.");
	}
	if (/^\d{4}-/.test(start) && /^\d{4}-/.test(end) && start > end)
		throw new Error("GA start date must not follow end date.");
	return { startDate: start, endDate: end };
}
export function resolveGaDates(dates, timeZone, now = Date.now()) {
	let parts;
	try {
		parts = new Intl.DateTimeFormat("en-US", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(now);
	} catch {
		throw new Error("Invalid GA property timezone.");
	}
	const part = (name) => parts.find((p) => p.type === name).value;
	const anchor = Date.parse(`${part("year")}-${part("month")}-${part("day")}`);
	const absolute = (d) =>
		/^\d{4}-/.test(d)
			? d
			: new Date(anchor - (d === "today" ? 0 : d === "yesterday" ? 1 : Number.parseInt(d)) * 86400000)
					.toISOString()
					.slice(0, 10);
	return gaDates({ start: absolute(dates.startDate), end: absolute(dates.endDate) });
}
export function gaRequest({ site, dates, landing = false, offset = 0, limit = 1000 }) {
	return {
		dimensions: [...GA_DIMENSIONS, ...(landing ? ["landingPage"] : [])].map((name) => ({ name })),
		metrics: GA_METRICS.map((name) => ({ name })),
		dateRanges: [dates],
		dimensionFilter: {
			andGroup: {
				expressions: [
					{
						filter: {
							fieldName: "hostName",
							stringFilter: { matchType: "EXACT", value: siteHostname(site), caseSensitive: false },
						},
					},
					{
						orGroup: {
							expressions: [
								{
									filter: {
										fieldName: "sessionDefaultChannelGroup",
										stringFilter: { matchType: "EXACT", value: "AI Assistant" },
									},
								},
								{
									filter: {
										fieldName: "sessionSource",
										stringFilter: { matchType: "FULL_REGEXP", value: SOURCE_REGEX, caseSensitive: false },
									},
								},
							],
						},
					},
				],
			},
		},
		orderBys: [...GA_DIMENSIONS, ...(landing ? ["landingPage"] : [])].map((dimensionName) => ({
			dimension: { dimensionName },
		})),
		offset: String(offset),
		limit: String(limit),
	};
}
export async function googleJson(url, { token, body, fetchImpl = fetch } = {}) {
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
		throw new Error("GA request failed or timed out. No report was updated; retry later.");
	}
	if (!response.ok) {
		const help =
			response.status === 401
				? "Authorization expired; reconnect GA."
				: response.status === 403
					? "Check GA read permission and that Analytics Data/Admin APIs are enabled."
					: response.status === 429
						? "GA quota reached; retry later."
						: "Check property, dates and API compatibility.";
		// Never echo Google's response, URL parameters or bearer token.
		throw new Error(`GA API HTTP ${response.status}. ${help}`);
	}
	try {
		return await response.json();
	} catch {
		throw new Error("Invalid GA API JSON response.");
	}
}
export async function listGaProperties(token, { fetchImpl = fetch } = {}) {
	const properties = new Map();
	let pageToken;
	for (let page = 0; page < 50; page++) {
		const url = new URL("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
		url.searchParams.set("pageSize", "200");
		if (pageToken) url.searchParams.set("pageToken", pageToken);
		const data = await googleJson(url, { token, fetchImpl });
		for (const account of data.accountSummaries ?? [])
			for (const p of account.propertySummaries ?? []) {
				properties.set(gaProperty(p.property), {
					id: gaProperty(p.property),
					name: String(p.displayName ?? p.property),
				});
			}
		pageToken = data.nextPageToken;
		if (!pageToken) return [...properties.values()];
	}
	throw new Error("Too many GA property pages.");
}
export async function listGaSites(token, property, { fetchImpl = fetch } = {}) {
	const sites = new Set();
	let pageToken;
	for (let page = 0; page < 50; page++) {
		const url = new URL(`https://analyticsadmin.googleapis.com/v1beta/properties/${gaProperty(property)}/dataStreams`);
		url.searchParams.set("pageSize", "200");
		if (pageToken) url.searchParams.set("pageToken", pageToken);
		const data = await googleJson(url, { token, fetchImpl });
		for (const stream of data.dataStreams ?? []) {
			try {
				if (stream.webStreamData?.defaultUri) sites.add(siteHostname(new URL(stream.webStreamData.defaultUri).origin));
			} catch {
				/* skip invalid web stream URI */
			}
		}
		pageToken = data.nextPageToken;
		if (!pageToken) return [...sites];
	}
	throw new Error("Too many GA stream pages.");
}
function quality(metadata = {}) {
	return {
		timeZone: typeof metadata.timeZone === "string" ? metadata.timeZone : null,
		thresholded: metadata.subjectToThresholding === true,
		otherRow: metadata.dataLossFromOtherRow === true,
		sampled: !!metadata.samplingMetadatas?.length,
		truncated: !!metadata.dataTruncationReasons?.length,
		restricted: !!metadata.schemaRestrictionResponse?.activeMetricRestrictions?.length,
		emptyReason: !!metadata.emptyReason,
	};
}
function reportRows(report, landing) {
	const dimensions = [...GA_DIMENSIONS, ...(landing ? ["landingPage"] : [])];
	if (
		JSON.stringify(report.dimensionHeaders?.map((h) => h.name)) !== JSON.stringify(dimensions) ||
		JSON.stringify(report.metricHeaders?.map((h) => h.name)) !== JSON.stringify(GA_METRICS)
	)
		throw new Error("Unexpected GA report columns.");
	const seen = new Set();
	return (report.rows ?? []).map((r) => {
		if (r.dimensionValues?.length !== dimensions.length || r.metricValues?.length !== GA_METRICS.length)
			throw new Error("Invalid GA report row.");
		const values = r.dimensionValues.map((d) => d.value);
		if (values.some((v) => typeof v !== "string" || v.length > 8192)) throw new Error("Invalid GA dimension.");
		const key = JSON.stringify(values);
		if (seen.has(key)) throw new Error("Duplicate GA dimension rows; retry the report.");
		seen.add(key);
		if (r.metricValues.some((m) => typeof m.value !== "string" || !/^\d+(?:\.\d+)?$/.test(m.value)))
			throw new Error("Invalid GA metrics.");
		const numbers = r.metricValues.map((m) => Number(m.value));
		if (numbers.some((n) => !Number.isFinite(n) || n < 0) || !numbers.slice(0, 2).every(Number.isSafeInteger))
			throw new Error("Invalid GA metrics.");
		const [source, medium, channel, page] = values;
		const match = classifyGaSource(source, channel);
		return {
			source,
			medium,
			channel,
			...(landing ? { path: page.split(/[?#]/, 1)[0] } : {}),
			...(match ?? { platform: "Unclassified", basis: "unclassified" }),
			sessions: numbers[0],
			engagedSessions: numbers[1],
			keyEvents: numbers[2],
		};
	});
}
function validateExport(snapshot) {
	if (snapshot?.schema !== "beat-geo/ga-export@1")
		throw new Error("Expected beat-geo/ga-export@1 JSON. Use ga connect/sync or the documented export format.");
	const property = gaProperty(snapshot.property?.id),
		site = siteHostname(snapshot.site);
	const dates = gaDates({ start: snapshot.dates?.startDate, end: snapshot.dates?.endDate });
	if (!snapshot.dates?.startDate || !snapshot.dates?.endDate) throw new Error("GA export needs a date range.");
	if (![dates.startDate, dates.endDate].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))
		throw new Error("GA exports must retain resolved YYYY-MM-DD dates.");
	if (!snapshot.sources || !snapshot.landing) throw new Error("GA export needs both source and landing-page reports.");
	let fetchedAt = null;
	if (snapshot.fetchedAt != null) {
		try {
			fetchedAt = logTime(snapshot.fetchedAt);
		} catch {
			throw new Error("GA export fetchedAt must be an ISO timestamp with timezone.");
		}
	}
	return { property, site, dates, fetchedAt };
}
function exportQuality(snapshot) {
	const warnings = [];
	const qualityByReport = { sources: quality(snapshot.sources.metadata), landing: quality(snapshot.landing.metadata) };
	for (const [name, report] of [
		["sources", snapshot.sources],
		["landing", snapshot.landing],
	]) {
		if (!Number.isSafeInteger(report.rowCount) || report.rowCount < 0 || report.rowCount !== (report.rows ?? []).length)
			throw new Error("Incomplete GA export: fetch all report pages before analysis.");
		for (const [key, value] of Object.entries(qualityByReport[name]))
			if (key !== "timeZone" && value) warnings.push(`${name}:${key}`);
	}
	if (qualityByReport.sources.timeZone !== qualityByReport.landing.timeZone)
		throw new Error("GA report timezones do not agree.");
	if (!qualityByReport.sources.timeZone) warnings.push("timezone-unknown");

	return { warnings, qualityByReport };
}
export function analyzeGa(snapshot) {
	const { property, site, dates, fetchedAt } = validateExport(snapshot);
	const sources = reportRows(snapshot.sources, false),
		pages = reportRows(snapshot.landing, true);
	const { warnings, qualityByReport } = exportQuality(snapshot);
	if (sources.some((r) => r.basis === "unclassified") || pages.some((r) => r.basis === "unclassified"))
		warnings.push("unclassified-rows");
	const known = sources.filter((r) => r.basis !== "unclassified");
	const totals = known.reduce(
		(a, r) => ({
			sessions: a.sessions + r.sessions,
			engagedSessions: a.engagedSessions + r.engagedSessions,
			keyEvents: a.keyEvents + r.keyEvents,
		}),
		{ sessions: 0, engagedSessions: 0, keyEvents: 0 },
	);
	const platforms = [...new Set(known.map((r) => r.platform))]
		.map((platform) => ({
			platform,
			...known
				.filter((r) => r.platform === platform)
				.reduce(
					(a, r) => ({
						sessions: a.sessions + r.sessions,
						engagedSessions: a.engagedSessions + r.engagedSessions,
						keyEvents: a.keyEvents + r.keyEvents,
					}),
					{ sessions: 0, engagedSessions: 0, keyEvents: 0 },
				),
		}))
		.sort((a, b) => b.sessions - a.sessions);
	return {
		schema: "beat-geo/ga-summary@1",
		generatedAt: new Date().toISOString(),
		synthetic: snapshot.synthetic === true,
		property: { id: property, name: String(snapshot.property.name ?? property).slice(0, 300) },
		site,
		dates,
		timeZone: qualityByReport.sources.timeZone,
		fetchedAt,
		quality: qualityByReport,
		warnings,
		totals,
		platforms,
		sources,
		pages,
		observation: warnings.length ? "limited" : known.length ? "observed" : "empty",
	};
}
function mergeMetadata(metadata, next = {}) {
	const q = quality(next);
	if (metadata.timeZone && q.timeZone && metadata.timeZone !== q.timeZone)
		throw new Error("GA report timezone changed during pagination.");
	return {
		...metadata,
		...next,
		subjectToThresholding: metadata.subjectToThresholding || q.thresholded,
		dataLossFromOtherRow: metadata.dataLossFromOtherRow || q.otherRow,
		samplingMetadatas: metadata.samplingMetadatas || next.samplingMetadatas,
		dataTruncationReasons: metadata.dataTruncationReasons || next.dataTruncationReasons,
		schemaRestrictionResponse:
			quality(metadata).restricted || q.restricted ? { activeMetricRestrictions: [{}] } : undefined,
	};
}
function validateRowCount(count, expected) {
	if (!Number.isSafeInteger(count) || count < 0 || (expected !== undefined && count !== expected))
		throw new Error("GA rows changed during pagination; retry the report.");
}
async function fetchGaReport({ id, host, dates, token, fetchImpl, landing }) {
	const rows = [];
	let first,
		expected,
		metadata = {};
	for (let page = 0; page < 50; page++) {
		const result = await googleJson(`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, {
			token,
			fetchImpl,
			body: gaRequest({ site: host, dates, landing, offset: rows.length }),
		});
		reportRows(result, landing);
		const count = result.rowCount ?? 0;
		validateRowCount(count, expected);
		expected = count;
		first ??= result;
		metadata = mergeMetadata(metadata, result.metadata);
		rows.push(...(result.rows ?? []));
		if (rows.length === count) break;
		if (!result.rows?.length || rows.length > count || page === 49)
			throw new Error("GA pagination incomplete (maximum 50000 rows per report).");
	}
	return {
		dimensionHeaders: first.dimensionHeaders,
		metricHeaders: first.metricHeaders,
		rows,
		rowCount: expected,
		metadata,
	};
}
export async function fetchGa({ token, property, site, start, end, fetchImpl = fetch }) {
	const id = gaProperty(property.id),
		host = siteHostname(site),
		requestedDates = gaDates({ start, end });
	const info = await googleJson(`https://analyticsadmin.googleapis.com/v1beta/properties/${id}`, { token, fetchImpl });
	if (!info.timeZone) throw new Error("GA property timezone is missing.");
	const dates = resolveGaDates(requestedDates, info.timeZone);
	const reports = {
		sources: await fetchGaReport({ id, host, dates, token, fetchImpl, landing: false }),
		landing: await fetchGaReport({ id, host, dates, token, fetchImpl, landing: true }),
	};
	// Sanitize the export, too: fixed columns only; no query strings, credentials or arbitrary API fields.
	const snapshot = {
		schema: "beat-geo/ga-export@1",
		property: { id, name: property.name },
		site: host,
		dates,
		fetchedAt: new Date().toISOString(),
		...reports,
	};
	const summary = analyzeGa(snapshot);
	if (summary.timeZone !== info.timeZone) throw new Error("GA property timezone changed during the query; retry.");
	return { snapshot: sanitizeGaSnapshot(snapshot), summary };
}
function sanitizeGaSnapshot(snapshot) {
	const summary = analyzeGa(snapshot);
	const clean = {
		schema: "beat-geo/ga-export@1",
		property: summary.property,
		site: summary.site,
		dates: summary.dates,
		fetchedAt: summary.fetchedAt,
		...(summary.synthetic ? { synthetic: true } : {}),
	};
	for (const [name, landing] of [
		["sources", false],
		["landing", true],
	]) {
		const cleaned = reportRows(snapshot[name], landing);
		clean[name] = {
			dimensionHeaders: [...GA_DIMENSIONS, ...(landing ? ["landingPage"] : [])].map((name) => ({ name })),
			metricHeaders: GA_METRICS.map((name) => ({ name })),
			rowCount: cleaned.length,
			rows: cleaned.map((r) => ({
				dimensionValues: [r.source, r.medium, r.channel, ...(landing ? [r.path] : [])].map((value) => ({ value })),
				metricValues: GA_METRICS.map((k) => ({ value: String(r[k]) })),
			})),
		};
		const q = summary.quality[name];
		clean[name].metadata = {
			timeZone: q.timeZone,
			subjectToThresholding: q.thresholded,
			dataLossFromOtherRow: q.otherRow,
			...(q.sampled ? { samplingMetadatas: [{}] } : {}),
			...(q.truncated ? { dataTruncationReasons: [{}] } : {}),
			...(q.restricted ? { schemaRestrictionResponse: { activeMetricRestrictions: [{}] } } : {}),
			...(q.emptyReason ? { emptyReason: "present" } : {}),
		};
	}
	return clean;
}
export async function loadGa(file) {
	let text;
	try {
		text = await readFile(file, "utf8");
	} catch {
		throw new Error("Cannot read GA export file.");
	}
	if (Buffer.byteLength(text) > 20 * 1024 * 1024) throw new Error("GA export exceeds 20 MiB.");
	let snapshot;
	try {
		snapshot = JSON.parse(text);
	} catch {
		throw new Error("Invalid GA export JSON.");
	}
	const clean = sanitizeGaSnapshot(snapshot);
	return { snapshot: clean, summary: analyzeGa(clean) };
}
