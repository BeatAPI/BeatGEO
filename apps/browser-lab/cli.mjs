import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureExisting, collect, saveRun } from "./core.mjs";

const args = process.argv.slice(2);
const option = (key, fallback) => {
	const index = args.indexOf(key);
	return index >= 0 ? args[index + 1] : fallback;
};
const input = {
	engine: option("--engine", "chatgpt"),
	prompt: option("--prompt", ""),
	brand: option("--brand", "BeatAPI"),
};
const here = path.dirname(fileURLToPath(import.meta.url));
const directory = process.env.BROWSER_RUNS_DIR || path.resolve(here, "../../.open-profound/runs");
const tabId = option("--capture-tab");
try {
	const result = tabId
		? await captureExisting(input, Number(tabId))
		: await collect(input, {
				publish: (run) => saveRun(directory, run),
				timeoutMs: Number(option("--timeout-ms", "900000")),
			});
	await saveRun(directory, result);
	console.log(
		JSON.stringify(
			{
				id: result.id,
				status: result.status,
				engine: result.engine,
				brandMentioned: result.brandMentioned,
				answerCharacters: result.answer?.length || 0,
				citations: result.citations?.length || 0,
				error: result.error,
			},
			null,
			2,
		),
	);
	if (result.status !== "completed") process.exitCode = 1;
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
