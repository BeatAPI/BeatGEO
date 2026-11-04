import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { type ReactNode, useState } from "react";
import { FormSelect } from "@/components/form-select";
import { usePublicHash } from "@/hooks/use-public-hash";
import { useT } from "@/lib/i18n";
import {
	disconnectBeatApiFn,
	getConnectionsFn,
	inspectBeatApiFn,
	saveBeatApiFn,
	selectBrowserProfileFn,
} from "@/server/connections";

export function BrandSetup({
	website,
	actions,
	monitoringActions,
	connectedWebsite = false,
}: {
	website: ReactNode;
	actions?: ReactNode;
	monitoringActions?: ReactNode;
	connectedWebsite?: boolean;
}) {
	const t = useT();
	const client = useQueryClient();
	const status = useQuery({
		queryKey: ["connections"],
		queryFn: () => getConnectionsFn(),
		refetchInterval: 15000,
		retry: false,
	});
	const [key, setKey] = useState("");
	const [model, setModel] = useState<string | null>(null);
	const [models, setModels] = useState<string[]>([]);
	const [message, setMessage] = useState("");
	const action = useMutation({
		mutationFn: async (operation: "inspect" | "save" | "disconnect") => {
			setMessage("");
			if (operation === "inspect") {
				const result = await inspectBeatApiFn({ data: { key: key || undefined } });
				setModels(result.models);
				setModel((current) =>
					current && result.models.includes(current)
						? current
						: result.models.includes(status.data?.beatapi.model || "")
							? status.data?.beatapi.model || ""
							: "",
				);
				return "Account access checked. Choose a research model if needed. SEO permissions are checked when a query runs.";
			}
			if (operation === "disconnect") {
				await disconnectBeatApiFn();
				setModels([]);
				setModel(null);
			} else {
				await saveBeatApiFn({ data: { key: key || undefined, model: model ?? undefined } });
			}
			setKey("");
			await client.invalidateQueries({ queryKey: ["connections"] });
			await client.invalidateQueries({ queryKey: ["question-generation"] });
			return operation === "disconnect"
				? "BeatAPI disconnected for SEO and GEO. Workers receive the change within one minute. Your platform key has not been revoked."
				: "Key saved for SEO and GEO. Saving makes no API calls and does not verify permissions or balance. Workers receive changes within one minute.";
		},
		onSuccess: setMessage,
	});

	const hash = usePublicHash();
	const navigate = useNavigate();
	const steps = setupSteps(connectedWebsite, status.data);
	const active = steps.some((step) => step.id === hash) ? hash : "website";
	return (
		<div className="mx-auto w-full max-w-6xl space-y-8">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-2">
					<h1 className="beat-page-title">{t("Brand")}</h1>
					<p className="max-w-xl text-sm leading-6 text-muted-foreground">
						{t("Your website and connections, in one place. Set up what you need, then explore SEO and GEO.")}
					</p>
				</div>
				{actions}
			</header>
			<div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
				<nav aria-label={t("Setup steps")} className="grid grid-cols-2 gap-2 lg:sticky lg:top-6 lg:grid-cols-1">
					{steps.map((step, index) => (
						<button
							key={step.id}
							type="button"
							aria-current={active === step.id ? "step" : undefined}
							onClick={() => void navigate({ hash: step.id, replace: true, resetScroll: false })}
							className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${active === step.id ? "border-border bg-accent text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/50"}`}
						>
							<span className="pt-0.5 font-mono text-xs opacity-60">0{index + 1}</span>
							<span className="space-y-1">
								<span className="block text-sm font-medium">{t(step.title)}</span>
								<span className="block text-xs leading-5 text-muted-foreground">{t(step.note)}</span>
							</span>
						</button>
					))}
				</nav>
				<div className="min-w-0">
					{status.error && (
						<p role="alert" className="mb-4 text-sm text-destructive">
							{t("Could not load connection settings. Try refreshing the page.")}
						</p>
					)}
					<div hidden={active !== "website"} className="space-y-6">
						{website}
					</div>
					<div hidden={active !== "browser"}>
						<BrowserStep
							browser={status.data?.browser}
							refreshing={status.isFetching}
							refresh={() => {
								void status.refetch();
							}}
						/>
					</div>
					<div hidden={active !== "research"}>
						{" "}
						<section id="research" className="scroll-mt-6 space-y-4 rounded-xl border bg-card p-5 md:p-6">
							<h2 className="text-lg font-semibold">{t("API Key")}</h2>
							<p className="text-sm text-muted-foreground">
								{t(
									"Save one BeatAPI key for all twelve SEO endpoints and GEO research. A research model is optional for SEO.",
								)}
							</p>
							{status.data?.beatapi.researchOverride && (
								<p className="text-sm">
									{t("Research provider override: ")}
									{status.data.beatapi.researchOverride}
									{t(". Your server configuration takes priority.")}
								</p>
							)}
							{status.data?.beatapi.configured && (
								<p className="text-sm">
									{t("Saved key: ")}
									{status.data.beatapi.keyHint} · {status.data.beatapi.model || t("Research model not selected")}
								</p>
							)}
							<div className="space-y-2">
								<Label htmlFor="beatapi-key">{t("BeatAPI API key")}</Label>
								<Input
									id="beatapi-key"
									type="password"
									autoComplete="off"
									value={key}
									onChange={(event) => {
										setKey(event.target.value);
										setModels([]);
										setModel(null);
									}}
									placeholder={
										status.data?.beatapi.configured
											? t("Leave blank to use the saved key")
											: t("Paste your BeatAPI key")
									}
								/>
							</div>
							<div className="flex flex-wrap items-center gap-3">
								<Button
									variant="outline"
									onClick={() => action.mutate("inspect")}
									disabled={action.isPending || (!key && !status.data?.beatapi.configured)}
								>
									{t("Check access & load models (optional)")}
								</Button>
								<a href="https://beatapi.io" target="_blank" rel="noreferrer" className="text-sm underline">
									{t("Get a BeatAPI key")}
								</a>
							</div>
							{models.length > 0 && (
								<div className="space-y-2">
									<Label htmlFor="research-model">{t("Research model (optional)")}</Label>
									<FormSelect
										id="research-model"
										value={model ?? status.data?.beatapi.model ?? ""}
										onValueChange={setModel}
										options={[
											{ value: "", label: t("No research model — SEO only") },
											...models.map((id) => ({ value: id, label: id })),
										]}
									/>
								</div>
							)}
							<div className="flex flex-wrap items-center gap-3">
								<Button
									disabled={action.isPending || (!key && !status.data?.beatapi.configured)}
									onClick={() => action.mutate("save")}
								>
									{t("Save connection")}
								</Button>
								<Button
									variant="outline"
									disabled={action.isPending || !status.data?.beatapi.configured}
									onClick={() => action.mutate("disconnect")}
								>
									{t("Disconnect BeatAPI")}
								</Button>
							</div>
							<details className="text-sm">
								<summary className="cursor-pointer font-medium">{t("API usage and credentials")}</summary>{" "}
								<p className="text-sm text-muted-foreground">
									{t(
										"Saving keeps your key encrypted on this computer without making API calls. The optional check reads account access and model availability; it does not verify all SEO permissions. Confirm SEO query costs before execution. Browser collection and starter questions remain available without a key.",
									)}
								</p>
								<p className="mt-2 text-muted-foreground">
									{t(
										"This is the only place to save, replace or disconnect the shared key. Changes apply to SEO and GEO across this workspace. GEO research also needs a text model with structured-output support.",
									)}
								</p>
							</details>
							{action.error && <p role="alert">{t(action.error.message)}</p>}
							{message && (
								<p role="status" className="text-sm">
									{t(message)}
								</p>
							)}
						</section>
					</div>
					<div hidden={active !== "monitoring"} className="space-y-4">
						<RuntimeStatus runtime={status.data?.runtime} />
						{monitoringActions}
						<section id="monitoring" className="scroll-mt-6 space-y-3 rounded-xl border bg-card p-5 md:p-6">
							<h2 className="text-lg font-semibold">{t("Continuous monitoring")}</h2>
							<p className="text-sm text-muted-foreground">
								{t("You can close this page. Keep this computer awake, Chrome and ")}
								<code>pnpm local:start</code>{" "}
								{t(
									"running. Stopping the app or putting the computer to sleep interrupts collection; this is not a hosted service.",
								)}
							</p>
							<details className="text-sm">
								<summary className="cursor-pointer font-medium">{t("What runs automatically?")}</summary>{" "}
								<p className="text-sm text-muted-foreground">
									{t(
										"Confirmed questions are reused for scheduled checks. Browser collection does not regenerate questions or use BeatAPI model credits. New research and optimization reports can use API credits; AI websites may have their own account limits.",
									)}
								</p>
								<p className="text-sm text-muted-foreground">
									{t(
										"Review answers and citations, record an improvement, then retest the same questions. A timeout or login failure is shown as a failed collection, not zero exposure.",
									)}
								</p>
							</details>
							<details className="text-sm">
								<summary className="cursor-pointer font-medium">{t("Restart and keep your data")}</summary>
								<p className="mt-2 text-muted-foreground">
									{t("Run ")}
									<code>pnpm local:start</code>
									{t(
										" again from this repository. Your data is retained. For the default installation, stop BeatGEO and back up .beat-geo/postgres, .beat-geo/database.json and your .env configuration together. Never delete them to restart.",
									)}
								</p>
							</details>
						</section>
					</div>
					<p className="mt-6 text-xs leading-5 text-muted-foreground">
						{t(
							"Website and Google properties belong to this brand. Browser and API Key are shared across your local workspace.",
						)}
					</p>
				</div>
			</div>
		</div>
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
	const t = useT();
	const client = useQueryClient();
	const [copyMessage, setCopyMessage] = useState("");
	const profile = useMutation({
		mutationFn: (profileId: string) => selectBrowserProfileFn({ data: { profileId } }),
		onSuccess: () => client.invalidateQueries({ queryKey: ["connections"] }),
	});
	return (
		<section id="browser" className="scroll-mt-6 space-y-4 rounded-xl border bg-card p-5 md:p-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-lg font-semibold">{t("Browser")}</h2>
				<Button variant="outline" onClick={refresh} disabled={refreshing}>
					{t("Check connection")}
				</Button>
			</div>
			<p role="status">
				{!browser?.online
					? t("Browser service offline")
					: browser.profiles.length
						? t("{count} Chrome profiles connected", { count: browser.profiles.length })
						: t("Waiting for the Chrome extension")}
			</p>
			{!browser?.online && (
				<p className="text-sm text-muted-foreground">
					{t("Start the local app with ")}
					<code>pnpm local:start</code>
					{t(". The browser component is included.")}
				</p>
			)}
			{browser?.online && browser.profiles.length === 0 && (
				<p className="text-sm">
					{t("Open ")}
					<code>chrome://extensions</code>
					{t(
						", enable Developer mode, choose Load unpacked, and select the folder below. Keep this folder on your computer.",
					)}
				</p>
			)}
			{browser?.extensionPath && (
				<div className="space-y-1">
					<p className="text-sm text-muted-foreground">
						{t("Included extension · ")}
						{browser.version}
					</p>
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
						{t("Copy extension folder")}
					</Button>
					{copyMessage && (
						<p role="status" className="text-sm">
							{t(copyMessage)}
						</p>
					)}
				</div>
			)}
			{browser?.profiles.length ? (
				<div className="space-y-2">
					<Label htmlFor="chrome-profile">{t("Chrome profile")}</Label>
					<FormSelect
						id="chrome-profile"
						value={browser.selectedProfileId ?? ""}
						disabled={profile.isPending}
						onValueChange={(value) => profile.mutate(value)}
						placeholder={t("Select a profile")}
						options={browser.profiles.map((p) => ({ value: p.id, label: p.label + " · " + p.id.slice(0, 8) }))}
					/>
					<p className="text-sm text-muted-foreground">
						{t(
							"Sign in to ChatGPT in the selected profile; ChatGPT is the default collection target. These links open in your current browser, so switch to that profile first. Connection status does not verify website sign-in. Gemini requires separate target configuration and validation.",
						)}
					</p>
					<div className="flex gap-4 text-sm">
						<a className="underline" href="https://chatgpt.com" target="_blank" rel="noreferrer">
							{t("Open ChatGPT")}
						</a>
						<a className="underline" href="https://gemini.google.com/app" target="_blank" rel="noreferrer">
							{t("Open Gemini")}
						</a>
					</div>
				</div>
			) : null}
			{profile.error && <p role="alert">{t(profile.error.message)}</p>}
		</section>
	);
}

function RuntimeStatus({ runtime }: { runtime?: Awaited<ReturnType<typeof getConnectionsFn>>["runtime"] }) {
	const t = useT();
	const workerMessage =
		runtime?.worker === "ready"
			? "Worker ready"
			: runtime?.worker === "offline"
				? "Worker offline"
				: "Worker not ready";
	return (
		<section className="rounded-xl border bg-card p-4 text-sm" aria-label={t("Service health")}>
			<div className="flex flex-wrap justify-between gap-3">
				<span>
					{t("Local storage")}: {t(!runtime ? "Checking…" : runtime.database === "ready" ? "Ready" : "Unavailable")}
				</span>
				<span role="status">{t(workerMessage)}</span>
			</div>
			{runtime && runtime.worker !== "ready" && (
				<p className="mt-2 text-muted-foreground">
					{t("Collection is not ready. Start pnpm local:start and refresh; queued questions are preserved.")}
				</p>
			)}
		</section>
	);
}

function setupSteps(connectedWebsite: boolean, connections?: Awaited<ReturnType<typeof getConnectionsFn>>) {
	return [
		{ id: "website", title: "Website brand", note: connectedWebsite ? "Website added" : "Start with your domain" },
		{
			id: "browser",
			title: "Browser",
			note: connections?.browser.selectedProfileId ? "Chrome profile selected" : "Connect your Chrome",
		},
		{
			id: "research",
			title: "API Key",
			note: connections?.beatapi.configured ? "Shared key saved" : "For SEO and GEO research",
		},
		{
			id: "monitoring",
			title: "Continuous monitoring",
			note: connections?.runtime.worker === "ready" ? "Worker ready" : "Check service health",
		},
	];
}
