import { cn } from "@workspace/ui/lib/utils";

// Decorative only: the faint request snippets behind BeatAPI's own hero, in
// GEO terms. Not content, so not translated.
const FRAGMENTS = [
	{
		position: "right-[20rem] top-[3.25rem] rotate-[5deg]",
		code: `mcp.call("collect_question", {\n  brand: "your-site",\n  target: "chatgpt"\n})`,
	},
	{
		position: "right-[40rem] top-[2.75rem] -rotate-[4deg] hidden 2xl:block",
		code: `{\n  "mentioned": false,\n  "citations": 23,\n  "domains": 10\n}`,
	},
	{
		position: "right-10 top-[3.5rem] -rotate-[3deg]",
		code: `GET /v1/web/search\nAuthorization: Bearer\n  $BEATAPI_API_KEY`,
	},
];

export function CodeTexture({ className }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={cn("beat-code-texture pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
		>
			<div className="beat-grid absolute inset-x-0 top-0 h-80" />
			<div className="hidden xl:block">
				{FRAGMENTS.map((fragment) => (
					<pre
						key={fragment.position}
						className={cn(
							"absolute select-none font-mono text-[11px] leading-6 text-[var(--code-ink)]/[0.09]",
							fragment.position,
						)}
					>
						{fragment.code}
					</pre>
				))}
			</div>
		</div>
	);
}
