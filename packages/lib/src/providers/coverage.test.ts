/**
 * Keeps the three lists that describe "what BeatGEO can track" honest about each
 * other: the models we give display metadata to, the provider/model combos the
 * scheduled status workflow exercises, and the providers we actually ship.
 *
 * If they drift, the monitoring platforms page cannot tell the user which
 * provider a platform needs.
 */

import { PROVIDERS_DOCS_URL } from "@workspace/config/constants";
import { KNOWN_MODELS } from "@workspace/config/models";
import { providersByModel } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { describeProvider, getAllProviders, resolveProviderAccess } from "./index";

describe("provider coverage", () => {
	const byModel = providersByModel();

	it("monitors every model we ship display metadata for", () => {
		const unmonitored = Object.keys(KNOWN_MODELS).filter((model) => !byModel.has(model));
		expect(unmonitored).toEqual([]);
	});

	it("only names providers we ship, so the setup links can't dangle", () => {
		const shipped = new Set(getAllProviders().map((provider) => provider.id));
		for (const [model, providers] of byModel) {
			for (const provider of providers) {
				expect(shipped, `${model} names unknown provider "${provider}"`).toContain(provider);
			}
		}
	});

	it("can describe every provider a model needs, with a setup link", () => {
		for (const providers of byModel.values()) {
			for (const provider of providers) {
				const described = describeProvider(provider);
				expect(described).not.toBeNull();
				expect(described?.name).toBeTruthy();
				expect(described?.docsUrl.startsWith(PROVIDERS_DOCS_URL)).toBe(true);
			}
		}
	});

	it("refuses to describe a provider we don't ship", () => {
		// Naming one is a configuration error, and SCRAPE_TARGETS validation already
		// rejects it at boot, so guessing a description here would only hide it.
		expect(() => describeProvider("some-provider-we-dropped")).toThrow(/unknown provider/i);
	});
});

/**
 * The settings page labels a target "Scraped" or "API" from this, and the two
 * describe genuinely different data — a browser observation carries the page a
 * visitor sees, an API answer is the model talking to us.
 */
describe("how a target is reached", () => {
	it("reads consumer pages through BeatBrowser", () => {
		expect(resolveProviderAccess({ provider: "beat-browser", model: "chatgpt", webSearch: false })).toBe("scraped");
	});

	it("asks the model directly through BeatAPI", () => {
		expect(
			resolveProviderAccess({ provider: "beatapi", model: "claude", version: "claude-sonnet-5-5", webSearch: false }),
		).toBe("api");
	});
});
