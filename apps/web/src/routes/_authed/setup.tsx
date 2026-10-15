import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
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
			return "Connection saved. Workers receive the configuration within one minute.";
		},
		onSuccess: setMessage,
	});

	return (
		<main className="mx-auto w-full max-w-3xl space-y-8 p-5 md:p-10">
			<header className="space-y-2">
				<Link to="/app" className="text-xl font-semibold">
					BeatGeo
				</Link>
				<h1 className="text-3xl font-semibold">Connect your workspace</h1>
				<p className="text-muted-foreground">Browser observations and optional BeatAPI research, in one workspace.</p>
			</header>
			{status.isPending && <p role="status">Checking connections…</p>}
			{status.error && (
				<p role="alert">
					Connection settings are unavailable. Sign in as the local administrator and check your database.
				</p>
			)}
			<BrowserStep
				browser={status.data?.browser}
				refreshing={status.isFetching}
				refresh={() => {
					void status.refetch();
				}}
			/>
			<section className="space-y-4 rounded-xl border bg-card p-5">
				<h2 className="text-lg font-semibold">
					2. Connect BeatAPI <span className="text-sm font-normal text-muted-foreground">Optional</span>
				</h2>
				<p className="text-sm text-muted-foreground">
					Search, read sources and generate research. Shared by this self-hosted instance; only its administrator can
					change it.
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
				<p className="text-sm text-muted-foreground">
					Verification reads account access and model availability. It does not prove structured-generation support.
					Research runs use your BeatAPI balance; saving does not start one.
				</p>
				{action.error && <p role="alert">{action.error.message}</p>}
				{message && (
					<p role="status" className="text-sm">
						{message}
					</p>
				)}
			</section>
			<section className="space-y-3">
				<h2 className="text-lg font-semibold">3. Create your first baseline</h2>
				<p className="text-sm text-muted-foreground">
					Add your website, generate questions, then review and start monitoring. Without an API key, choose an industry
					to generate starter questions.
				</p>
				<Link to="/app" className={buttonVariants({})}>
					Continue to brands
				</Link>
			</section>
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
	const profile = useMutation({
		mutationFn: (profileId: string) => selectBrowserProfileFn({ data: { profileId } }),
		onSuccess: () => client.invalidateQueries({ queryKey: ["connections"] }),
	});
	return (
		<section className="space-y-4 rounded-xl border bg-card p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-lg font-semibold">1. Connect Chrome</h2>
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
						Sign in to ChatGPT or Gemini in this profile. Connection status does not verify website sign-in.
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
