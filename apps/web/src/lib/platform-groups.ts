/**
 * How the LLM settings page groups tracked platforms.
 *
 * The three groups answer different questions about a brand, which is why they
 * are separate cards with their own copy rather than one grid of pills: a
 * scraped surface tells you what a visitor sees, an ungrounded API call tells
 * you what the model already believes, and a grounded one tells you what it
 * finds and cites. Grounded calls also cost roughly ten times an ungrounded one.
 *
 * The tiers' ids and names live in @workspace/config/platforms. Only the long
 * descriptions live here, because this page is the one surface with room for
 * them.
 */
import { PLATFORM_TIER_LABELS, type PlatformTierId } from "@workspace/config/platforms";
import type { PlatformOption } from "@/components/platform-picker";

export interface PlatformGroup {
	id: PlatformTierId;
	title: string;
	description: string;
	options: PlatformOption[];
}

const GROUP_DESCRIPTIONS: Record<PlatformTierId, string> = {
	scraped: "Opens the AI product in your own signed-in Chrome and saves the answer and visible sources a visitor sees.",
	api: "Asks the model directly through your BeatAPI key, without web search, so answers show what the model already believes about you.",
	premium:
		"LLMs called with their native web-search tools, so answers are grounded using recent updates to their web index.",
};

/** Which group an option belongs to. The one place that rule is decided. */
function platformGroupId(option: PlatformOption): PlatformTierId {
	if (option.access === "scraped") return "scraped";
	return option.webSearch ? "premium" : "api";
}

/**
 * Split options into their groups, cheapest signal first, dropping any group the
 * instance configures nothing for. Order within a group is preserved so it keeps
 * following SCRAPE_TARGETS.
 */
export function groupPlatformOptions(options: PlatformOption[]): PlatformGroup[] {
	const order: PlatformTierId[] = ["scraped", "api", "premium"];
	return order
		.map((id) => ({
			id,
			...platformGroupCopy(id),
			options: options.filter((option) => platformGroupId(option) === id),
		}))
		.filter((group) => group.options.length > 0);
}

export function platformGroupCopy(id: PlatformTierId): { title: string; description: string } {
	return { title: PLATFORM_TIER_LABELS[id], description: GROUP_DESCRIPTIONS[id] };
}
