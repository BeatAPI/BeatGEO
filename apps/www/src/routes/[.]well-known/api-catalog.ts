import { createFileRoute } from "@tanstack/react-router";
import { CLOUD_APP_URL } from "@workspace/config/referrals";
import { canonicalUrl } from "@/lib/seo";

const STATUS_URL = "https://github.com/BeatAPI/BeatGeo";

const catalog = {
	linkset: [
		{
			anchor: `${CLOUD_APP_URL}/api/v1`,
			"service-desc": [
				{
					href: canonicalUrl("/api/openapi.json"),
					type: "application/vnd.oai.openapi+json;version=3.1",
					title: "BeatGeo API — OpenAPI description",
				},
			],
			"service-doc": [
				{
					href: canonicalUrl("/docs/api"),
					type: "text/html",
					title: "BeatGeo API reference",
				},
				{
					href: canonicalUrl("/docs/api.md"),
					type: "text/markdown",
					title: "BeatGeo API reference (markdown)",
				},
			],
			status: [{ href: STATUS_URL, type: "text/html", title: "BeatGeo status" }],
		},
		{
			anchor: `${CLOUD_APP_URL}/api/mcp`,
			"service-doc": [
				{
					href: canonicalUrl("/docs/api/mcp"),
					type: "text/html",
					title: "BeatGeo MCP server",
				},
				{
					href: canonicalUrl("/docs/api/mcp.md"),
					type: "text/markdown",
					title: "BeatGeo MCP server (markdown)",
				},
			],
			status: [{ href: STATUS_URL, type: "text/html", title: "BeatGeo status" }],
		},
	],
};

export const Route = createFileRoute("/.well-known/api-catalog")({
	server: {
		handlers: {
			GET: async () =>
				new Response(JSON.stringify(catalog), {
					headers: {
						"Content-Type": "application/linkset+json",
						"Access-Control-Allow-Origin": "*",
					},
				}),
		},
	},
});
