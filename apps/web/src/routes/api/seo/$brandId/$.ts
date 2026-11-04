import { createFileRoute } from "@tanstack/react-router";
import { handleSeoWorkbench } from "@/server/seo-workbench";

export const Route = createFileRoute("/api/seo/$brandId/$")({
	server: {
		handlers: {
			GET: ({ request, params }) => handleSeoWorkbench(request, params.brandId),
			POST: ({ request, params }) => handleSeoWorkbench(request, params.brandId),
		},
	},
});
