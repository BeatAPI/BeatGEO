/** Browser, API and grounded API answers need separate filters even when they share a model id. */
import { getModelMeta } from "./models";
import { premiumModelLabel } from "./platforms";

/** Default browser-platform aggregate. */
export const ALL_MODELS_VALUE = "all";

/** Marks the grounded-API variant of a model in a filter value. */
const PREMIUM_SUFFIX = "::premium";

export function targetFilterValue(model: string, premium: boolean, access?: string): string {
	return premium ? `${model}${PREMIUM_SUFFIX}` : access === "api" ? `${model}::api` : model;
}

export function parseModelFilter(value: string): { model: string; premium: boolean; api?: boolean } | null {
	if (!value || value === ALL_MODELS_VALUE) return null;
	if (value.endsWith("::api")) return { model: value.slice(0, -5), premium: false, api: true };
	return value.endsWith(PREMIUM_SUFFIX)
		? { model: value.slice(0, -PREMIUM_SUFFIX.length), premium: true }
		: { model: value, premium: false };
}

export function labelForModelFilter(value: string): string {
	if (value === ALL_MODELS_VALUE) return "All browser platforms";
	const parsed = parseModelFilter(value);
	if (!parsed) return value;
	return parsed.premium
		? premiumModelLabel(parsed.model)
		: `${getModelMeta(parsed.model).label}${parsed.api ? " · API" : ""}`;
}

export function iconIdForModelFilter(value: string): string {
	const parsed = parseModelFilter(value);
	return getModelMeta(parsed?.model ?? value).iconId;
}
