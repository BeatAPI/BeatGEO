type Website = { org: string; brand: string };
const pages: Record<string, string> = {
	"": "/geo",
	"/settings/brand": "/brand",
	"/seo": "/seo",
	"/search-console": "/search-console",
	"/settings/prompts": "/questions",
	"/traffic": "/traffic",
	"/opportunities": "/opportunities",
	"/settings/competitors": "/competitors",
	"/settings/llms": "/models",
	"/responses": "/responses",
	"/visibility": "/visibility",
	"/share-of-voice": "/share-of-voice",
	"/query-fan-out": "/query-fan-out",
	"/settings": "/brand",
};

const workspacePages: Record<string, string> = {
	"/settings/cases": "/cases",
	"/settings/api-keys": "/api-keys",
	"/settings/api": "/developers/api",
	"/settings/mcp": "/developers/mcp",
	"/settings/skill": "/skill",
	"/settings/brands": "/websites",
	"/settings": "/workspace",
};

export function localPathRewrite(website: Website | null) {
	const prefix = website
		? `/app/org/${encodeURIComponent(website.org)}/brand/${encodeURIComponent(website.brand)}`
		: null;
	return {
		input: ({ url }: { url: URL }) => {
			url.pathname = expandPath(url, prefix, website);
			return url;
		},
		output: ({ url }: { url: URL }) => {
			const match = url.pathname.replace(/\/$/, "").match(/^\/app\/org\/[^/]+\/brand\/[^/]+(.*)$/);
			if (match) url.pathname = pages[match[1]] ?? match[1].replace(/^\/prompts(?=\/|$)/, "/questions");
			else if (url.pathname === "/setup") url.pathname = "/brand";
			else if (/^\/app\/org\/[^/]+/.test(url.pathname)) {
				const suffix = url.pathname.replace(/^\/app\/org\/[^/]+/, "");
				url.pathname = workspacePages[suffix] ?? "/brand";
			} else if (url.pathname === "/app" || url.pathname === "/app/") url.pathname = "/";
			return url;
		},
	};
}

function expandPath(url: URL, prefix: string | null, website: Website | null) {
	const path = url.pathname.replace(/\/$/, "") || "/";
	if (path === "/") return "/app";
	if (path === "/brand" && (url.searchParams.get("add") === "true" || !prefix)) return "/setup";
	const workspace = Object.entries(workspacePages).find(([, short]) => short === path);
	if (workspace && website) return `/app/org/${encodeURIComponent(website.org)}${workspace[0]}`;
	const page = Object.entries(pages).find(([, short]) => short === path);
	if (page) return prefix ? prefix + page[0] : "/setup";
	if (path.startsWith("/questions/")) return prefix ? prefix + path.replace("/questions/", "/prompts/") : "/setup";
	return url.pathname;
}
