import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/choose-plan")({
	component: () => (
		<section className="space-y-3 p-6">
			<h1 className="text-2xl font-semibold">BeatGEO</h1>
			<p>The open-source MVP is self-hosted. No hosted subscription is offered in this release.</p>
			<a className="underline" href="https://github.com/BeatAPI/BeatGEO">
				Setup and documentation
			</a>
		</section>
	),
});
