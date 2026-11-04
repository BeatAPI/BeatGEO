/** Verify volume, cadence and rescheduling against a disposable local test database
 * and a running worker configured with SCRAPE_TARGETS=stub:stub. */
import pg from "pg";
import { PgBoss } from "pg-boss";
import { getRunsPerPrompt } from "@workspace/lib/constants";

const RUNS_PER_PROMPT = getRunsPerPrompt();
import { DATABASE_URL as FIXTURES_DATABASE_URL } from "../fixtures.js";

const DATABASE_URL = process.env.DATABASE_URL ?? FIXTURES_DATABASE_URL;
const target = new URL(DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !decodeURIComponent(target.pathname).endsWith("_test")) {
  throw new Error("Scheduling verification requires a disposable local *_test database.");
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
const boss = new PgBoss(DATABASE_URL);
boss.on("error", () => {});
await boss.start();

async function sendJob(promptId: string) {
  await boss.send("process-prompt", { promptId }, { retryLimit: 0, expireInSeconds: 900 });
}

async function runCount(promptId: string): Promise<number> {
  const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM prompt_runs WHERE prompt_id = $1", [promptId]);
  return rows[0].n;
}

async function waitFor<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function assert(cond: boolean, message: string): void {
  if (!cond) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log(`✓ ${message}`);
}

try {
  const { rows: [prompt] } = await client.query(
    "INSERT INTO prompts (brand_id, value, enabled) VALUES ('default', 'scheduling e2e — local volume', true) RETURNING id",
  );
  try {
    await sendJob(prompt.id);
    await waitFor(async () => (await runCount(prompt.id)) > 0, 120000, "first runs");
    await new Promise((r) => setTimeout(r, 5000));
    const count = await runCount(prompt.id);
    assert(count === RUNS_PER_PROMPT, `local volume: exactly ${RUNS_PER_PROMPT} runs recorded (got ${count})`);
    const { rows } = await client.query(
      "SELECT DISTINCT model, version FROM prompt_runs WHERE prompt_id = $1", [prompt.id]);
    assert(rows.length === 1 && rows[0].model === "stub" && rows[0].version === "stub", "runs carry the stub target");

    await sendJob(prompt.id);
    await new Promise((r) => setTimeout(r, 8000));
    const after = await runCount(prompt.id);
    assert(after === RUNS_PER_PROMPT, `cadence enforcement: an immediate duplicate adds no runs (got ${after})`);

    const { rows: pending } = await client.query(
      "SELECT COUNT(*)::int AS n FROM pgboss.job WHERE name='process-prompt' AND state='created' AND data->>'promptId' = $1",
      [prompt.id]);
    assert(pending[0].n >= 1, "chain alive: a future job is scheduled");
  } finally {
    await client.query("DELETE FROM usage_events WHERE prompt_id = $1", [prompt.id]);
    await client.query("DELETE FROM prompt_runs WHERE prompt_id = $1", [prompt.id]);
    await client.query("DELETE FROM prompts WHERE id = $1", [prompt.id]);
  }
} finally {
  await boss.stop({ graceful: false });
  await client.end();
}
console.log("Local scheduling verification passed");
