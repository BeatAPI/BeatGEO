import { createFileRoute, notFound } from "@tanstack/react-router";
import { WorkflowCase } from "@/components/workflow-case";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/settings/cases")({
	staticData: { crumb: "Real workflow case" },
	beforeLoad: ({ context }) => {
		if (context.clientConfig?.mode !== "local") throw notFound();
	},
	head: pageHead({
		description:
			"The recorded BeatAPI website-to-evidence workflow, with real results and reusable recording material.",
	}),
	component: WorkflowCase,
});
