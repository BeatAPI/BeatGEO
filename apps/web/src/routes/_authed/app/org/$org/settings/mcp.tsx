/**
 * Everything here is a fact about *this* deployment — the endpoint, the tools
 * actually registered — so an air-gapped instance never has to send anybody to example.invalid to connect.
 */
import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_APP_NAME, MCP_PATH } from "@workspace/config/constants";
import { Badge } from "@workspace/ui/components/badge";
import { Card } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import type { ReactNode } from "react";
import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { useAppOrigin } from "@/hooks/use-app-origin";
import { useBranding } from "@/hooks/use-deployment-features";
import { useT } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";
import { listMcpToolsFn, type McpPageData } from "@/server/mcp";

export const Route = createFileRoute("/_authed/app/org/$org/settings/mcp")({
	loader: (): Promise<McpPageData> => listMcpToolsFn(),
	staticData: { crumb: "MCP" },
	head: pageHead({ description: "Connect an AI client to this deployment over MCP." }),
	component: McpSettingsPage,
});

const KEY_PLACEHOLDER = "YOUR_API_KEY";

/** A client id has to survive a config file, so it is not the display name. */
function clientId(appName: string): string {
	const slug = appName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return slug || "mcp";
}

function json(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

interface ClientSnippet {
	note?: ReactNode;
	code: string;
}

interface ClientDocs {
	value: string;
	label: string;
	signIn: ClientSnippet;
	apiKey: ClientSnippet;
}

function clientDocs(id: string, endpoint: string, t: ReturnType<typeof useT>): ClientDocs[] {
	const bearer = { Authorization: `Bearer ${KEY_PLACEHOLDER}` };
	const keyEnvVar = `${id.toUpperCase().replace(/-/g, "_")}_API_KEY`;

	return [
		{
			value: "claude-code",
			label: "Claude Code",
			signIn: { code: `claude mcp add --transport http ${id} ${endpoint}` },
			apiKey: {
				code: `claude mcp add --transport http ${id} ${endpoint} \\\n  --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`,
			},
		},
		{
			value: "codex",
			label: "Codex",
			signIn: { code: `codex mcp add ${id} --url ${endpoint}\ncodex mcp login ${id}` },
			apiKey: {
				note: "Codex reads the key from the environment rather than the config file.",
				code: `codex mcp add ${id} --url ${endpoint} \\\n  --bearer-token-env-var ${keyEnvVar}`,
			},
		},
		{
			value: "cursor",
			label: "Cursor",
			signIn: {
				note: t(
					"Edit ~/.cursor/mcp.json. Sign in when Cursor asks. If an older Cursor version cannot complete sign-in, use an API key.",
				),
				code: json({ mcpServers: { [id]: { url: endpoint } } }),
			},
			apiKey: { code: json({ mcpServers: { [id]: { url: endpoint, headers: bearer } } }) },
		},
		{
			value: "vs-code",
			label: "VS Code",
			signIn: {
				note: t(
					"Add the server under servers in mcp.json. VS Code asks you to sign in when it first starts the server.",
				),
				code: `code --add-mcp '${JSON.stringify({ name: id, type: "http", url: endpoint })}'`,
			},
			apiKey: {
				note: t("Edit mcp.json."),
				code: json({ servers: { [id]: { type: "http", url: endpoint, headers: bearer } } }),
			},
		},
		{
			value: "opencode",
			label: "OpenCode",
			signIn: {
				note: t("Edit opencode.json, then run opencode mcp auth {id}.", { id }),
				code: json({
					$schema: "https://opencode.ai/config.json",
					mcp: { [id]: { type: "remote", url: endpoint, enabled: true } },
				}),
			},
			apiKey: {
				note: t("Edit opencode.json."),
				code: json({
					$schema: "https://opencode.ai/config.json",
					mcp: { [id]: { type: "remote", url: endpoint, enabled: true, headers: bearer } },
				}),
			},
		},
	];
}

function Snippet({ heading, snippet }: { heading: string; snippet: ClientSnippet }) {
	const t = useT();
	return (
		<div className="space-y-2">
			<h3 className="text-sm font-medium">{t(heading)}</h3>
			{snippet.note && (
				<p className="text-sm text-muted-foreground">
					{typeof snippet.note === "string" ? t(snippet.note) : snippet.note}
				</p>
			)}
			<CodeBlock code={snippet.code} />
		</div>
	);
}

function McpSettingsPage() {
	const t = useT();
	const { tools } = Route.useLoaderData();
	const branding = useBranding();
	const origin = useAppOrigin();

	const appName = branding?.name || DEFAULT_APP_NAME;
	const endpoint = `${origin}${MCP_PATH}`;
	const id = clientId(appName);
	const clients = clientDocs(id, endpoint, t);

	return (
		<div className="max-w-4xl space-y-8">
			<header className="space-y-1">
				<h1 className="beat-page-title">MCP</h1>
				<p className="max-w-2xl text-muted-foreground">
					{t("Connect any chat bot to ")}
					{appName}.
				</p>
			</header>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">{t("Endpoint")}</h2>
				<div className="flex min-w-0 items-stretch gap-2">
					<code className="min-w-0 truncate rounded-md border bg-muted/40 px-3 py-1.5 font-mono text-sm">
						{endpoint}
					</code>
					{/* The icon button is square by default and stands taller than the chip beside it. */}
					<CopyButton value={endpoint} className="h-auto w-9" />
				</div>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">{t("Connect")}</h2>
				<Tabs defaultValue={clients[0].value}>
					<TabsList>
						{clients.map((client) => (
							<TabsTrigger key={client.value} value={client.value}>
								{client.label}
							</TabsTrigger>
						))}
					</TabsList>
					{clients.map((client) => (
						<TabsContent key={client.value} value={client.value} className="space-y-5 pt-2">
							<Snippet heading="Sign in with OAuth" snippet={client.signIn} />
							<Snippet heading="Sign in with API Key" snippet={client.apiKey} />
						</TabsContent>
					))}
				</Tabs>
			</section>

			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">{t("Tools")}</h2>
				</div>
				<Card className="gap-0 overflow-hidden py-0">
					<Table className="[&_td]:px-4 [&_th]:px-4">
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="w-[22%]">{t("Tool")}</TableHead>
								<TableHead>{t("What it does")}</TableHead>
								<TableHead className="w-[24%]">{t("Scope")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{tools.map((tool) => (
								<TableRow key={tool.name}>
									<TableCell className="font-mono text-xs text-foreground">{tool.name}</TableCell>
									<TableCell>{t(tool.title)}</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{tool.scopes.map((scope) => (
												<Badge key={scope} variant="secondary" className="font-mono font-normal">
													{scope}
												</Badge>
											))}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Card>
			</section>
		</div>
	);
}
