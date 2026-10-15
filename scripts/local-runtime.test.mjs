import assert from "node:assert/strict";
import { test } from "node:test";
import { localEnvironment, localCompose } from "./local-runtime.mjs";
test("new installs have isolated credentials and need no paid key or fake collector", () => {
	const first = localEnvironment(),
		second = localEnvironment();
	for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BEAT_GEO_ENCRYPTION_KEY", "BROWSER_RUNNER_TOKEN"])
		assert.notEqual(first[key], second[key]);
	assert.equal(Buffer.from(first.BEAT_GEO_ENCRYPTION_KEY, "base64").length, 32);
	assert.equal(first.SCRAPE_TARGETS, "chatgpt:beat-browser");
	assert.equal(first.BEATAPI_API_KEY, undefined);
	assert.equal(first.ONBOARDING_LLM_TARGET, undefined);
	const url = new URL(first.DATABASE_URL);
	assert.equal(url.hostname, "127.0.0.1");
	assert.equal(url.port, "55440");
});
test("database binds only to loopback and uses an independent named volume", () => {
	const compose = localCompose(localEnvironment());
	assert.match(compose, /127\.0\.0\.1:55440:5432/);
	assert.match(compose, /beatgeo-data:/);
	assert.doesNotMatch(compose, /external: true/);
});
