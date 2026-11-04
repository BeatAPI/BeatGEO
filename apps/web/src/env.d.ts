/// <reference types="vite/client" />

// Every var here must have an entry in packages/config/src/env-registry.ts
// (enforced by env-registry.test.ts).

interface ImportMetaEnv {
	// Analytics
	readonly VITE_PLAUSIBLE_DOMAIN?: string;
	readonly VITE_CLARITY_PROJECT_ID?: string;
	readonly VITE_POSTHOG_KEY?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// Server-side environment variables (accessed via process.env in server functions)
// and Vite define globals
declare global {
	// App version injected by Vite define
	const __APP_VERSION__: string;
	namespace NodeJS {
		interface ProcessEnv {
			readonly DATABASE_URL: string;
			readonly APP_URL?: string;
			readonly SCRAPE_TARGETS?: string;
			readonly BROWSER_RUNNER_URL?: string;
			readonly BROWSER_RUNS_DIR?: string;
			readonly BROWSER_LAB_PORT?: string;
			readonly BEAT_BROWSER_SPACES?: string;
			readonly BEAT_BROWSER_PROFILE_ID?: string;
			readonly BEAT_BROWSER_COMMAND?: string;
			readonly BEAT_BROWSER_ARGS_JSON?: string;

			readonly BROWSER_RUNNER_TOKEN?: string;
			readonly OPENAI_API_KEY: string;
			readonly ANTHROPIC_API_KEY: string;
			readonly MISTRAL_API_KEY?: string;
			readonly OPENROUTER_API_KEY?: string;
			readonly SEARCHAPI_API_KEY?: string;
			readonly OLOSTEP_API_KEY?: string;
			readonly BRIGHTDATA_API_TOKEN?: string;
			readonly OXYLABS_USERNAME?: string;
			readonly OXYLABS_PASSWORD?: string;
			readonly CLORO_API_KEY?: string;
			readonly JINA_API_KEY?: string;
			readonly BEATAPI_API_KEY?: string;
			readonly BEATAPI_RESEARCH_MODEL?: string;
			readonly ONBOARDING_LLM_TARGET?: string;
			readonly BEAT_GEO_ENCRYPTION_KEY?: string;
			readonly BEAT_GEO_POSTHOG_KEY?: string;

			readonly BEAT_GEO_ENCRYPTION_KEY_OLD?: string;
			readonly DATAFORSEO_LOGIN: string;
			readonly DATAFORSEO_PASSWORD: string;
			readonly BETTER_AUTH_SECRET?: string;
			readonly ADMIN_API_KEYS?: string;
			readonly DEFAULT_BRAND_DOMAINS?: string;
			readonly ENVIRONMENT?: string;
			readonly DISABLE_TELEMETRY?: string;
		}
	}
}

export {};
