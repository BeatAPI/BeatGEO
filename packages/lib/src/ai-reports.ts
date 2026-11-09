export type AiReportSource = "bing" | "google";
export type AiReportDimension = "page" | "query" | "date";
export type AiReportInput = {
	source: AiReportSource;
	dimension: AiReportDimension;
	site: string;
	startDate: string;
	endDate: string;
	scope: string;
	content: string;
};
export type AiReport = Omit<AiReportInput, "content"> & {
	schema: "beat-geo/ai-report@1";
	id: string;
	importedAt: string;
	rows: Array<{ key: string; value: number | null }>;
};
export function reportHost(value: string): string {
	const url = new URL(
		value.startsWith("sc-domain:") ? `https://${value.slice(10)}` : value.includes("://") ? value : `https://${value}`,
	);
	if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port)
		throw new Error("Invalid report website.");
	return url.hostname.toLowerCase();
}
function validDate(value: string) {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		Number.isFinite(Date.parse(value)) &&
		new Date(value).toISOString().slice(0, 10) === value
	);
}
class CsvReader {
	rows: string[][] = [];
	row: string[] = [];
	cell = "";
	quoted = false;
	closed = false;
	quotedChar(c: string | undefined, next: string | undefined) {
		if (c === undefined) throw new Error("Unclosed CSV quote.");
		if (c === '"' && next === '"') {
			this.cell += '"';
			return true;
		}
		if (c === '"') {
			this.quoted = false;
			this.closed = true;
		} else this.cell += c;
		return false;
	}
	char(c: string | undefined) {
		if (c === "," || c === "\n" || c === undefined) {
			this.row.push(this.cell.trim());
			this.cell = "";
			this.closed = false;
			if (c === ",") return;
			if (this.row.some(Boolean)) this.rows.push(this.row);
			this.row = [];
			if (this.rows.length > 2001) throw new Error("CSV has more than 2,000 rows. Export a smaller report.");
			return;
		}
		if (c === '"' && !this.cell && !this.closed) {
			this.quoted = true;
			return;
		}
		if (this.closed || c === '"') throw new Error("Invalid CSV quoting.");
		this.cell += c;
	}
}
function csvRows(content: string): string[][] {
	if (content.length > 2_000_000) throw new Error("CSV is too large (maximum 2 MB).");
	const parser = new CsvReader();
	const text = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
	for (let i = 0; i <= text.length; i++) {
		if (parser.quoted) {
			if (parser.quotedChar(text[i], text[i + 1])) i++;
		} else parser.char(text[i]);
	}
	return parser.rows;
}
function reportCount(raw: string) {
	if (["", "-", "~", "n/a"].includes(raw.toLowerCase())) return null;
	if (!/^(\d+|\d{1,3}(,\d{3})+)$/.test(raw))
		throw new Error("Use exact non-negative counts; ranges and K/M abbreviations are not supported.");
	const value = Number(raw.replaceAll(",", ""));
	if (!Number.isSafeInteger(value)) throw new Error("Invalid report count.");
	return value;
}
function validateKey(key: string, input: AiReportInput, site: string) {
	if (input.dimension === "page") {
		const url = new URL(key);
		if (!["https:", "http:"].includes(url.protocol) || reportHost(key) !== site)
			throw new Error("Page URLs must belong to the report website.");
	}
	if (input.dimension === "date" && (!validDate(key) || key < input.startDate || key > input.endDate))
		throw new Error("A date is outside the report period.");
}
const headers = {
	page: ["page", "pages", "url", "top pages", "网页", "页面", "排名靠前的网页"],
	query: ["grounding query", "grounding queries", "查询", "检索查询"],
	date: ["date", "day", "日期", "天"],
	bing: ["citations", "citation count", "引用", "引用次数"],
	google: ["impressions", "曝光次数", "总曝光次数", "展现次数", "展示次数"],
};
export function parseAiReport(input: AiReportInput): Omit<AiReport, "id" | "importedAt"> {
	if (!["bing", "google"].includes(input.source) || !["page", "query", "date"].includes(input.dimension))
		throw new Error("Unsupported AI report.");
	if (input.source === "google" && input.dimension === "query")
		throw new Error("Google AI query exports are not supported.");
	if (!validDate(input.startDate) || !validDate(input.endDate) || input.startDate > input.endDate)
		throw new Error("Choose valid report dates.");
	if (!input.scope.trim() || input.scope.length > 500) throw new Error("Describe the report filters and coverage.");
	const site = reportHost(input.site),
		table = csvRows(input.content);
	const header = table.shift()?.map((s) => s.toLowerCase()) ?? [];
	const keyIndex = header.findIndex((h) => headers[input.dimension].includes(h));
	const valueIndex = header.findIndex((h) => headers[input.source].includes(h));
	// A two-column report prevents ordinary search clicks/CTR and opportunity ranges from becoming AI counts.
	if (header.length !== 2 || keyIndex < 0 || valueIndex < 0 || keyIndex === valueIndex)
		throw new Error("Use a two-column AI report: Page/Date (or Bing Grounding Query) and Citations/Impressions.");
	if (!table.length) throw new Error("The CSV contains no observations.");
	const seen = new Set<string>();
	const rows = table
		.map((cells) => {
			if (cells.length !== 2) throw new Error("Each CSV row must have two columns.");
			const key = cells[keyIndex],
				raw = cells[valueIndex];
			if (!key || key.length > 2048 || seen.has(key))
				throw new Error("Empty or duplicate report rows are not supported.");
			seen.add(key);
			validateKey(key, input, site);
			const value = reportCount(raw);
			return { key, value };
		})
		.sort((a, b) => a.key.localeCompare(b.key));
	return {
		schema: "beat-geo/ai-report@1",
		source: input.source,
		dimension: input.dimension,
		site,
		startDate: input.startDate,
		endDate: input.endDate,
		scope: input.scope.trim(),
		rows,
	};
}
export function compareAiReports(current: AiReport, previous: AiReport) {
	const days = (r: AiReport) => Date.parse(r.endDate) - Date.parse(r.startDate);
	if (
		current.source !== previous.source ||
		current.dimension !== previous.dimension ||
		current.site !== previous.site ||
		current.scope !== previous.scope ||
		days(current) !== days(previous) ||
		previous.endDate >= current.startDate
	)
		return null;
	const before = new Map(previous.rows.map((r) => [r.key, r.value]));
	// Dates refer to different days, so keep daily observations separate instead of pairing unrelated dates.
	if (current.dimension === "date") return null;
	return current.rows.map((row) => ({
		...row,
		previous: before.get(row.key) ?? null,
		delta: row.value !== null && before.get(row.key) != null ? row.value - (before.get(row.key) as number) : null,
	}));
}
