export function filterRuns(runs, engine = "all", status = "all") {
	return runs.filter(
		(run) =>
			(engine === "all" || run.engine === engine) &&
			(status === "all" || (status === "completed" ? run.status === "completed" : run.status !== "completed")),
	);
}

export function citationRows(runs) {
	const groups = new Map();
	for (const run of runs.filter((item) => item.status === "completed")) {
		const seen = new Set();
		for (const source of run.citations || []) {
			let url;
			try {
				url = new URL(source.url);
			} catch {
				continue;
			}
			if (!/^https?:$/.test(url.protocol) || seen.has(url.href)) continue;
			seen.add(url.href);
			const row = groups.get(url.href) || {
				url: url.href,
				domain: url.hostname,
				title: source.title,
				count: 0,
				engines: new Set(),
			};
			row.count++;
			row.engines.add(run.engine);
			groups.set(url.href, row);
		}
	}
	return [...groups.values()].sort((a, b) => b.count - a.count).map((row) => ({ ...row, engines: [...row.engines] }));
}

export function promptRows(runs) {
	const groups = new Map();
	for (const run of runs) {
		const key = JSON.stringify([run.prompt, run.brand || "", run.aliases || []]);
		const row = groups.get(key) || {
			prompt: run.prompt,
			brand: run.brand || "",
			total: 0,
			completed: 0,
			scored: 0,
			mentions: 0,
			engines: new Set(),
		};
		row.total++;
		row.engines.add(run.engine);
		if (run.status === "completed") {
			row.completed++;
			if (typeof run.brandMentioned === "boolean") row.scored++;
			if (run.brandMentioned === true) row.mentions++;
		}
		groups.set(key, row);
	}
	return [...groups.values()].map((row) => ({
		...row,
		mentionRate: row.scored ? row.mentions / row.scored : null,
		engines: [...row.engines],
	}));
}
