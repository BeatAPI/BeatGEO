import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { getConnectionsFn, inspectBeatApiFn, saveBeatApiFn, selectBrowserProfileFn } from "@/server/connections";

export const Route = createFileRoute("/_authed/setup")({
	beforeLoad: ({ context }) => {
		if (!context.canManageConnections || context.clientConfig?.mode !== "local") throw notFound();
	},
	component: SetupPage,
});

function SetupPage() {
	const client = useQueryClient();
	const status = useQuery({
		queryKey: ["connections"],
		queryFn: () => getConnectionsFn(),
		refetchInterval: 15000,
		retry: false,
	});
	const [key, setKey] = useState("");
	const [model, setModel] = useState("");
	const [models, setModels] = useState<string[]>([]);
	const [message, setMessage] = useState("");
	const action = useMutation({
		mutationFn: async (operation: "inspect" | "save") => {
			setMessage("");
			if (operation === "inspect") {
				const result = await inspectBeatApiFn({ data: { key: key || undefined } });
				setModels(result.models);
				setModel((current) =>
					result.models.includes(current)
						? current
						: result.models.includes(status.data?.beatapi.model || "")
							? status.data!.beatapi.model
							: "",
				);
				return "Key verified. Choose a model and save. No generation request was made.";
			}
			await saveBeatApiFn({ data: { key: key || undefined, model } });
			setKey("");
			await client.invalidateQueries({ queryKey: ["connections"] });
			await client.invalidateQueries({ queryKey: ["question-generation"] });
			return "Connection saved. Workers receive the configuration within one minute.";
		},
		onSuccess: setMessage,
	});

	return (
		<main className="beat-workspace min-h-svh bg-muted/20">
			<header className="border-b bg-background">
				<div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-10">
					<Link to="/app" aria-label="BeatGEO home">
						<Logo />
					</Link>
					<Link to="/app" className={buttonVariants({ variant: "outline", size: "sm" })}>
						Back to workspace
					</Link>
				</div>
			</header>
			<div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-[200px_minmax(0,1fr)] md:px-10 md:py-12">
				<aside>
					<nav aria-label="Setup steps" className="flex flex-wrap gap-2 md:sticky md:top-8 md:flex-col">
						<p className="mb-2 hidden px-3 text-xs font-medium uppercase tracking-widest text-muted-foreground md:block">
							Workspace setup
						</p>
						{[
							["research", "01", "BeatAPI"],
							["browser", "02", "Chrome"],
							["website", "03", "Your website"],
							["monitoring", "04", "Monitoring"],
						].map(([id, number, label]) => (
							<a
								key={id}
								href={`#${id}`}
								className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
							>
								<span className="font-mono text-xs text-muted-foreground">{number}</span>
								{label}
							</a>
						))}
					</nav>
				</aside>
				<div className="min-w-0 space-y-6">
					<div className="space-y-2">
						<h1 className="text-3xl font-semibold tracking-tight">Connect your workspace</h1>
						<p className="text-sm text-muted-foreground">
							Connect once. Add your website, review questions, then track real AI answers.
						</p>
					</div>
					<SetupChecklist connections={status.data} />
					<details className="rounded-xl border p-4 text-sm">
						<summary className="cursor-pointer font-medium">Where does my data live?</summary>
						<p className="mt-2 text-muted-foreground">
							BeatGEO stores accounts, brands, questions and results in its own PostgreSQL database. The standard
							installer creates it in Docker for you. You do not need to create tables or connect to BeatAPI's database.
							Your local BeatGEO login and your BeatAPI key serve different purposes.
						</p>
						<p className="mt-2 text-muted-foreground">
							If setup is incomplete, run <code>pnpm local:doctor</code>. It checks Node.js, pnpm, Git and Docker
							without changing data.
						</p>
					</details>
					{status.isPending && <p role="status">Checking connections…</p>}
					{status.error && (
						<p role="alert">
							Connection settings are unavailable. Sign in as the local administrator and check your database.
						</p>
					)}

					<section id="research" className="scroll-mt-6 space-y-4 rounded-xl border bg-card p-5 md:p-6">
						<h2 className="text-lg font-semibold">1. Connect BeatAPI</h2>
						<p className="text-sm text-muted-foreground">
							Generate questions from your website. Connect your key and choose a research model.
						</p>
						{status.data?.beatapi.researchOverride && (
							<p className="text-sm">
								Research provider override: {status.data.beatapi.researchOverride}. Your server configuration takes
								priority.
							</p>
						)}
						{status.data?.beatapi.configured && (
							<p className="text-sm">
								Saved key: {status.data.beatapi.keyHint} · {status.data.beatapi.model || "Choose a model"}
							</p>
						)}
						<div className="space-y-2">
							<Label htmlFor="beatapi-key">BeatAPI API key</Label>
							<Input
								id="beatapi-key"
								type="password"
								autoComplete="off"
								value={key}
								onChange={(event) => {
									setKey(event.target.value);
									setModels([]);
									setModel("");
								}}
								placeholder={
									status.data?.beatapi.configured ? "Leave blank to use the saved key" : "Paste your BeatAPI key"
								}
							/>
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<Button
								variant="outline"
								onClick={() => action.mutate("inspect")}
								disabled={action.isPending || (!key && !status.data?.beatapi.configured)}
							>
								Verify key & load models
							</Button>
							<a href="https://beatapi.io" target="_blank" rel="noreferrer" className="text-sm underline">
								Get a BeatAPI key
							</a>
						</div>
						{models.length > 0 && (
							<>
								<div className="space-y-2">
									<Label htmlFor="research-model">Research model</Label>
									<select
										id="research-model"
										className="w-full rounded-md border bg-background p-2"
										value={model}
										onChange={(event) => setModel(event.target.value)}
									>
										<option value="">Choose a text model</option>
										{models.map((id) => (
											<option key={id}>{id}</option>
										))}
									</select>
								</div>
								<Button disabled={!model || action.isPending} onClick={() => action.mutate("save")}>
									Save connection
								</Button>
							</>
						)}
						<details className="text-sm">
							<summary className="cursor-pointer font-medium">API usage and credentials</summary>{" "}
							<p className="text-sm text-muted-foreground">
								Verification reads account access and model availability. It does not prove structured-generation
								support. Research runs use your BeatAPI balance; saving does not start one. The saved key is reused for
								future research. Without a key, you can still generate an industry starter set and collect browser
								answers.
							</p>
							<p className="mt-2 text-muted-foreground">
								The key is encrypted and shared by this instance; only its administrator can change it. Choose a text
								model with structured-output support.
							</p>
						</details>
						{action.error && <p role="alert">{action.error.message}</p>}
						{message && (
							<p role="status" className="text-sm">
								{message}
							</p>
						)}
					</section>
					<BrowserStep
						browser={status.data?.browser}
						refreshing={status.isFetching}
						refresh={() => {
							void status.refetch();
						}}
					/>
					<section id="website" className="scroll-mt-6 space-y-3 rounded-xl border bg-card p-5 md:p-6">
						<h2 className="text-lg font-semibold">3. Add your website</h2>
						<p className="text-sm text-muted-foreground">
							Enter your brand and website. We research the business and generate questions for you to review. Start
							monitoring only after Chrome is connected and your target website is signed in. The first collection
							confirms whether it works.
						</p>
						<Link to="/app" className={buttonVariants({})}>
							Continue to brands
						</Link>
					</section>

					<section id="monitoring" className="scroll-mt-6 space-y-3 rounded-xl border bg-card p-5 md:p-6">
						<h2 className="text-lg font-semibold">4. Keep monitoring running</h2>
						<p className="text-sm text-muted-foreground">
							You can close this page. Keep this computer awake, Docker, Chrome and <code>pnpm local:start</code>{" "}
							running. Stopping the app or putting the computer to sleep interrupts collection; this is not a hosted
							service.
						</p>
						<details className="text-sm">
							<summary className="cursor-pointer font-medium">What runs automatically?</summary>{" "}
							<p className="text-sm text-muted-foreground">
								Confirmed questions are reused for scheduled checks. Browser collection does not regenerate questions or
								use BeatAPI model credits. New research and optimization reports can use API credits; AI websites may
								have their own account limits.
							</p>
							<p className="text-sm text-muted-foreground">
								Review answers and citations, record an improvement, then retest the same questions. A timeout or login
								failure is shown as a failed collection, not zero exposure.
							</p>
						</details>
						<details className="text-sm">
							<summary className="cursor-pointer font-medium">Restart and keep your data</summary>
							<p className="mt-2 text-muted-foreground">
								Run <code>pnpm local:start</code> again from this repository. The PostgreSQL volume retains your brands,
								questions and results. Back up that database and your private configuration, including the encryption
								key; do not delete the volume to restart.
							</p>
						</details>
					</section>
				</div>
			</div>
		</main>
	);
}

function BrowserStep({
	browser,
	refreshing,
	refresh,
}: {
	browser?: Awaited<ReturnType<typeof getConnectionsFn>>["browser"];
	refreshing: boolean;
	refresh: () => void;
}) {
	const client = useQueryClient();
	const [copyMessage, setCopyMessage] = useState("");
	const profile = useMutation({
		mutationFn: (profileId: string) => selectBrowserProfileFn({ data: { profileId } }),
		onSuccess: () => client.invalidateQueries({ queryKey: ["connections"] }),
	});
	return (
		<section id="browser" className="scroll-mt-6 space-y-4 rounded-xl border bg-card p-5 md:p-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-lg font-semibold">2. Connect Chrome</h2>
				<Button variant="outline" onClick={refresh} disabled={refreshing}>
					Check connection
				</Button>
			</div>
			<p role="status">
				{!browser?.online
					? "Browser service offline"
					: browser.profiles.length
						? `${browser.profiles.length} Chrome profile(s) connected`
						: "Waiting for the Chrome extension"}
			</p>
			{!browser?.online && (
				<p className="text-sm text-muted-foreground">
					Start the local app with <code>pnpm local:start</code>. The browser component is included.
				</p>
			)}
			{browser?.online && browser.profiles.length === 0 && (
				<p className="text-sm">
					Open <code>chrome://extensions</code>, enable Developer mode, choose Load unpacked, and select the folder
					below. Keep this folder on your computer.
				</p>
			)}
			{browser?.extensionPath && (
				<div className="space-y-1">
					<p className="text-sm text-muted-foreground">Included extension · {browser.version}</p>
					<code className="block break-all text-sm">{browser.extensionPath}</code>
					<Button
						variant="outline"
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(browser.extensionPath);
								setCopyMessage("Extension path copied.");
							} catch {
								setCopyMessage("Select and copy the folder path above.");
							}
						}}
					>
						Copy extension folder
					</Button>
					{copyMessage && (
						<p role="status" className="text-sm">
							{copyMessage}
						</p>
					)}
				</div>
			)}
			{browser?.profiles.length ? (
				<div className="space-y-2">
					<Label htmlFor="chrome-profile">Chrome profile</Label>
					<select
						id="chrome-profile"
						className="w-full rounded-md border bg-background p-2"
						value={browser.selectedProfileId}
						disabled={profile.isPending}
						onChange={(event) => profile.mutate(event.target.value)}
					>
						<option value="" disabled>
							Select a profile
						</option>
						{browser.profiles.map((p) => (
							<option key={p.id} value={p.id}>
								{p.label} · {p.id.slice(0, 8)}
							</option>
						))}
					</select>
					<p className="text-sm text-muted-foreground">
						Sign in to ChatGPT in the selected profile; ChatGPT is the default collection target. These links open in
						your current browser, so switch to that profile first. Connection status does not verify website sign-in.
						Gemini requires separate target configuration and validation.
					</p>
					<div className="flex gap-4 text-sm">
						<a className="underline" href="https://chatgpt.com" target="_blank" rel="noreferrer">
							Open ChatGPT
						</a>
						<a className="underline" href="https://gemini.google.com/app" target="_blank" rel="noreferrer">
							Open Gemini
						</a>
					</div>
				</div>
			) : null}
			{profile.error && <p role="alert">{profile.error.message}</p>}
		</section>
	);
}

function SetupChecklist({ connections }: { connections?: Awaited<ReturnType<typeof getConnectionsFn>> }) {
	return (
		<section aria-label="Setup checklist" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
			<div>
				<p className="text-sm font-medium">Research</p>
				<p className="text-sm text-muted-foreground">
					{connections?.beatapi.configured && connections.beatapi.model
						? "Key and model saved"
						: "Connect a key and model"}
				</p>
			</div>
			<div>
				<p className="text-sm font-medium">Browser</p>
				<p className="text-sm text-muted-foreground">
					{connections?.browser.online &&
					connections.browser.profiles.some((p) => p.id === connections.browser.selectedProfileId)
						? "Chrome profile connected"
						: "Connect and select Chrome"}
				</p>
			</div>
			<div>
				<p className="text-sm font-medium">Website accounts</p>
				<p className="text-sm text-muted-foreground">Login is checked during collection</p>
			</div>
		</section>
	);
}
