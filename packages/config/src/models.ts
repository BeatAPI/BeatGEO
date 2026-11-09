/**
 * Display metadata for the models BeatGEO can track: the label a customer sees and
 * which brand logo represents it.
 *
 * Lives in config rather than with the providers because the model *names* do
 * (STANDARD_PLATFORM_MENU, SCRAPE_TARGETS), and because the marketing site needs
 * to name platforms without depending on the database-backed lib package.
 * Rendering an iconId is each app's business; this only says which one applies.
 */
export interface ModelMeta {
	label: string;
	iconId: string;
}

export const KNOWN_MODELS: Record<string, ModelMeta> = {
	chatgpt: { label: "ChatGPT", iconId: "openai" },
	gemini: { label: "Gemini", iconId: "google" },
	claude: { label: "Claude", iconId: "anthropic" },
	deepseek: { label: "DeepSeek", iconId: "deepseek" },
	qwen: { label: "Qwen", iconId: "qwen" },
	kimi: { label: "Kimi", iconId: "moonshotai" },
	grok: { label: "Grok", iconId: "x" },
	glm: { label: "GLM", iconId: "generic" },
};

export function getModelMeta(model: string): ModelMeta {
	if (KNOWN_MODELS[model]) return KNOWN_MODELS[model];
	const label = model
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
	return { label, iconId: "generic" };
}

/**
 * The BeatAPI model asked when a target names only the platform, e.g.
 * `claude:beatapi`. A target may still pin another model as `claude:beatapi:<id>`.
 */
export const BEATAPI_DEFAULT_MODELS: Record<string, string> = {
	chatgpt: "gpt-5.6-luna",
	gemini: "gemini-3.8-flash",
	claude: "claude-sonnet-5-5",
	deepseek: "deepseek-v4.1-flash",
	qwen: "qwen3.8-flash",
	kimi: "kimi-k3",
	grok: "grok-4.6",
	glm: "glm-5.3",
};
