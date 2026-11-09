/**
 * Canonical registry of every environment variable the apps read.
 *
 * This is the single source of truth for env var declarations. Tests in
 * env-registry.test.ts enforce that the two other declaration sites stay in
 * sync with it:
 * - turbo.json `globalEnv` (cache invalidation) must list exactly these names
 * - apps/web/src/env.d.ts must declare every entry (client vars in
 *   ImportMetaEnv, server vars in NodeJS.ProcessEnv)
 *
 * Adding or renaming a var = edit this file (+ the env.d.ts line and
 * turbo.json entry the failing test asks for).
 */

/** Where an env var is consumed. Client vars are baked into the browser bundle by Vite. */
type EnvVarScope = "server" | "client";

export interface EnvVarSpec {
	/** Variable name. `client` scope names must be VITE_-prefixed (enforced by test). */
	name: string;
	scope: EnvVarScope;
	/**
	 * - "required": hard-required at startup (validation reports it when missing)
	 * - "dynamic-scrape-targets": required only when SCRAPE_TARGETS references `provider`
	 * - "optional": never required at startup
	 */
	requiredBy: "required" | "dynamic-scrape-targets" | "optional";
	/** Only for requiredBy: "dynamic-scrape-targets" — the SCRAPE_TARGETS provider id that needs this key. */
	provider?: string;
	description: string;
}

export const ENV_REGISTRY: EnvVarSpec[] = [
	{
		name: "BEATAPI_API_KEY",
		scope: "server",
		requiredBy: "dynamic-scrape-targets",
		provider: "beatapi",
		description: "BeatAPI key for research, analysis and optional API simulations.",
	},
	{
		name: "BEATAPI_RESEARCH_MODEL",
		scope: "server",
		requiredBy: "optional",
		description: "BeatAPI model ID for structured research and opportunity analysis.",
	},
	{
		name: "BROWSER_RUNNER_URL",
		scope: "server",
		requiredBy: "optional",
		description: "Local BeatGEO Browser Lab URL.",
	},
	{
		name: "BROWSER_RUNNER_TOKEN",
		scope: "server",
		requiredBy: "dynamic-scrape-targets",
		provider: "beat-browser",
		description: "Shared token for the local browser collector.",
	},
	{
		name: "DATABASE_URL",
		scope: "server",
		requiredBy: "required",
		description: "PostgreSQL connection string.",
	},
	{
		name: "APP_URL",
		scope: "server",
		requiredBy: "optional",
		description: "Loopback URL of the local web app, written by local setup.",
	},
	{
		name: "BETTER_AUTH_SECRET",
		scope: "server",
		requiredBy: "required",
		description: "Session cookie encryption secret.",
	},
	{
		name: "SCRAPE_TARGETS",
		scope: "server",
		requiredBy: "required",
		description: "Comma-separated model:provider[:version] entries. Example: chatgpt:beat-browser,claude:beatapi",
	},
	{
		name: "ONBOARDING_LLM_TARGET",
		scope: "server",
		requiredBy: "optional",
		description:
			"model:provider override for the LLM behind brand onboarding and the Opportunities report (e.g., 'research:beatapi'). Defaults to the first configured provider in RESEARCH_PROVIDER_PREFERENCE.",
	},
	{
		name: "JINA_API_KEY",
		scope: "server",
		requiredBy: "optional",
		description:
			"Optional Jina Reader API key for website-excerpt fetching. When set, requests are authenticated (tracked by key, not IP), which raises the rate limit and avoids the anonymous 'bad network reputation' 401 block.",
	},
	{
		name: "BEAT_GEO_ENCRYPTION_KEY",
		scope: "server",
		// `beatgeo init` generates it and the CLI backfills it on upgrade.
		requiredBy: "required",
		description:
			"Base64-encoded 32-byte key used to encrypt provider credentials stored in the database. Generate one with: openssl rand -base64 32",
	},
	{
		name: "BEAT_GEO_ENCRYPTION_KEY_OLD",
		scope: "server",
		requiredBy: "optional",
		description:
			"Previous BEAT_GEO_ENCRYPTION_KEY values, comma-separated, kept readable while rotating. Set only during a rotation.",
	},
	{
		name: "BROWSER_RUNS_DIR",
		scope: "server",
		requiredBy: "optional",
		description: "Private directory for local browser evidence.",
	},
	{
		name: "BROWSER_LAB_PORT",
		scope: "server",
		requiredBy: "optional",
		description: "Loopback port for the local browser workbench.",
	},
	{
		name: "BEAT_BROWSER_SPACES",
		scope: "server",
		requiredBy: "optional",
		description: "Enable independent BeatBrowser TaskSpaces. Defaults to enabled.",
	},
	{
		name: "BEAT_BROWSER_PROFILE_ID",
		scope: "server",
		requiredBy: "optional",
		description: "Chrome profile chosen for browser observations.",
	},
	{
		name: "BEAT_BROWSER_COMMAND",
		scope: "server",
		requiredBy: "optional",
		description: "Executable for the BeatBrowser bridge.",
	},
	{
		name: "BEAT_BROWSER_ARGS_JSON",
		scope: "server",
		requiredBy: "optional",
		description: "JSON array of fixed arguments for the BeatBrowser executable.",
	},
	{
		name: "ADMIN_API_KEYS",
		scope: "server",
		requiredBy: "optional",
		description: "Comma-separated bearer tokens accepted by the admin API.",
	},
	{
		name: "DEFAULT_BRAND_DOMAINS",
		scope: "server",
		requiredBy: "optional",
		description: "Comma-separated domains added as default brands.",
	},
];

/**
 * Providers that can run onboarding research and the Opportunities report, in
 * preference order. Lives here, not with the onboarding code, so startup
 * validation can require one of them.
 */
export const RESEARCH_PROVIDER_PREFERENCE = ["beatapi"] as const;

export const CREDENTIAL_ENV_NAMES: ReadonlySet<string> = new Set([
	...ENV_REGISTRY.filter((spec) => spec.requiredBy === "dynamic-scrape-targets" && spec.provider).map(
		(spec) => spec.name,
	),
	"BEATAPI_RESEARCH_MODEL",
]);
