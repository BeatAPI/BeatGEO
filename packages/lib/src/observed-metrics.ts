export interface ObservedAnswer {
	id: string;
	provider: string | null;
	model: string;
	version: string;
	webSearchEnabled: boolean;
	brandMentioned: boolean;
	competitorsMentioned: string[];
	createdAt: Date;
	branded: boolean;
}

export function summarizeObservedAnswers(rows: ObservedAnswer[]) {
	const groups = new Map<
		string,
		{
			key: string;
			provider: string;
			model: string;
			version: string;
			webSearch: boolean;
			branded: boolean;
			answers: number;
			mentions: number;
			competitorMentions: number;
			lastSeen: string;
		}
	>();
	const seen = new Set<string>();
	for (const row of rows) {
		if (seen.has(row.id)) continue;
		seen.add(row.id);
		const key = JSON.stringify([row.provider, row.model, row.version, row.webSearchEnabled, row.branded]);
		const group = groups.get(key) ?? {
			key,
			provider: row.provider ?? "unknown",
			model: row.model,
			version: row.version,
			webSearch: row.webSearchEnabled,
			branded: row.branded,
			answers: 0,
			mentions: 0,
			competitorMentions: 0,
			lastSeen: row.createdAt.toISOString(),
		};
		group.answers++;
		group.mentions += Number(row.brandMentioned);
		group.competitorMentions += new Set(row.competitorsMentioned).size;
		if (row.createdAt.toISOString() > group.lastSeen) group.lastSeen = row.createdAt.toISOString();
		groups.set(key, group);
	}
	return [...groups.values()].map((group) => ({
		...group,
		mentionRate: (group.mentions / group.answers) * 100,
		shareOfVoice:
			group.mentions + group.competitorMentions
				? (group.mentions / (group.mentions + group.competitorMentions)) * 100
				: null,
	}));
}
