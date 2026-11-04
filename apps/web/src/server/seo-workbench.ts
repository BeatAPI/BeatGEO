import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { brandSegment } from "@workspace/lib/app-urls";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, organization } from "@workspace/lib/db/schema";
import { getCredential, refreshCredentialOverlay } from "@workspace/lib/secrets";
import { eq } from "drizzle-orm";
import { canManageConnections, requireBrandSession } from "@/lib/auth/helpers";
import demoConfig from "../../../../tools/seo-geo/examples/seo.project.example.json";
import demoSnapshot from "../../../../tools/seo-geo/examples/seo.snapshot.example.json";
import { createWorkbench, type Workbench } from "../../../../tools/seo-geo/src/workbench.mjs";
import script from "../../../../tools/seo-geo/web/app.js?raw";
import i18n from "../../../../tools/seo-geo/web/i18n.js?raw";
import html from "../../../../tools/seo-geo/web/index.html?raw";
import messages from "../../../../tools/seo-geo/web/messages.js?raw";
import selects from "../../../../tools/seo-geo/web/selects.js?raw";
import css from "../../../../tools/seo-geo/web/style.css?raw";
import { addSeoPrompts } from "./seo-prompts";

const workspaces = new Map<string, Promise<Workbench>>();

function sameOrigin(request: Request) {
	const url = new URL(request.url);
	const expected = new URL(process.env.APP_URL || "http://localhost:3000");
	return (
		url.origin === expected.origin &&
		(!request.headers.get("origin") || request.headers.get("origin") === expected.origin) &&
		request.headers.get("sec-fetch-site") !== "cross-site"
	);
}

async function brandContext(brandId: string) {
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new Error("Brand unavailable");
	const [org, rivals] = await Promise.all([
		db.query.organization.findFirst({ where: eq(organization.id, brand.organizationId) }),
		db.query.competitors.findMany({ where: eq(competitors.brandId, brandId) }),
	]);
	if (!org) throw new Error("Workspace unavailable");
	return {
		brandName: brand.name,
		settingsUrl: `/app/org/${encodeURIComponent(org.slug)}/brand/${encodeURIComponent(brandSegment(brand))}/settings/brand#research`,
		promptsUrl: `/app/org/${encodeURIComponent(org.slug)}/brand/${encodeURIComponent(brandSegment(brand))}/settings/prompts`,
		responsesUrl: `/app/org/${encodeURIComponent(org.slug)}/brand/${encodeURIComponent(brandSegment(brand))}/responses`,
		project: {
			site: brand.website,
			competitors: rivals.flatMap((rival) => rival.domains).slice(0, 5),
			workflows: ["overview"],
			country: "us",
		},
	};
}

async function createBrandWorkbench(brandId: string) {
	const context = await brandContext(brandId);
	const segment = createHash("sha256").update(brandId).digest("hex");
	return createWorkbench({
		dataDir: path.join(process.env.BEAT_GEO_SEO_DATA_DIR || path.join(os.homedir(), ".beat-geo", "seo"), segment),
		initialKey: "",
		assets: {
			"index.html": html,
			"app.js": script,
			"style.css": css,
			"i18n.js": i18n,
			"messages.js": messages,
			"selects.js": selects,
		},
		demoConfig,
		demoSnapshot,
		managed: {
			...context,
			basePath: `/api/seo/${encodeURIComponent(brandId)}`,
			refreshContext: () => brandContext(brandId),
			getKey: async () => {
				await refreshCredentialOverlay();
				return getCredential("BEATAPI_API_KEY") || "";
			},
			addQuestions: (input) => addSeoPrompts({ ...input, brandId }),
		},
	});
}

/** Authorization runs for every asset, report and mutation, before any workspace is opened. */
export async function handleSeoWorkbench(request: Request, brandId: string): Promise<Response> {
	if (!sameOrigin(request)) return new Response("Use this workspace's own address.", { status: 403 });
	if (!["GET", "POST"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
	try {
		const session = await requireBrandSession(brandId);
		if (!(await canManageConnections(session))) return new Response("Forbidden", { status: 403 });
	} catch {
		return new Response("Brand access required", { status: 403 });
	}
	try {
		let workspace = workspaces.get(brandId);
		if (!workspace) {
			workspace = createBrandWorkbench(brandId);
			workspaces.set(brandId, workspace);
			workspace.catch(() => workspaces.delete(brandId));
		}
		return (await workspace).request(request);
	} catch {
		return Response.json({ error: "无法打开 SEO 工作台，请检查本地存储并刷新页面。" }, { status: 503 });
	}
}
