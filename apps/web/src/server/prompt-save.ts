export interface SubmittedPrompt {
	id?: string;
	value: string;
	enabled: boolean;
	tags?: string[];
}

export interface StoredPrompt {
	id: string;
}

interface PlannedUpdate {
	id: string;
	prompt: SubmittedPrompt;
}

interface PlannedInsert {
	prompt: SubmittedPrompt;
}

export interface PromptSavePlan {
	updates: PlannedUpdate[];
	inserts: PlannedInsert[];
}

export function planPromptSave(
	submitted: readonly SubmittedPrompt[],
	existing: readonly StoredPrompt[],
): PromptSavePlan {
	const existingIds = new Set(existing.map((row) => row.id));

	const claimed = new Set<string>();
	const updates: PlannedUpdate[] = [];
	const inserts: PlannedInsert[] = [];

	for (const prompt of submitted) {
		if (prompt.id === undefined) {
			inserts.push({ prompt });
			continue;
		}
		// The editor only ever submits ids it loaded from this brand, so both of
		// these mean the caller and the database disagree about what exists.
		// Guessing which row was meant would write one edit and drop another.
		if (!existingIds.has(prompt.id)) {
			throw new Error(`Prompt ${prompt.id} is not in this brand's list. Reload the page and try again.`);
		}
		if (claimed.has(prompt.id)) {
			throw new Error(`Prompt ${prompt.id} appears twice in this save.`);
		}
		claimed.add(prompt.id);
		updates.push({ id: prompt.id, prompt });
	}

	return { updates, inserts };
}
