import { CopyButton } from "@/components/copy-button";

export function CodeBlock({ code }: { code: string }) {
	return (
		<div className="relative">
			<pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 pr-16 text-xs leading-relaxed">
				<code>{code}</code>
			</pre>
			<CopyButton value={code} className="absolute right-2 top-2" />
		</div>
	);
}
