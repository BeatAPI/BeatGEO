import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptionKeyError, encryptSecret } from "./crypto";

// refreshCredentialOverlay reads rows through drizzle; mock the db module so the
// store is testable with no database. `db.select().from()` resolves to
// `dbState.rows`, or rejects with `dbState.error` when one is set.
const dbState = vi.hoisted(() => ({ rows: [] as unknown[], error: null as Error | null, queries: 0 }));
vi.mock("../db/db", () => ({
	db: {
		select: () => ({
			from: () => {
				dbState.queries++;
				return dbState.error ? Promise.reject(dbState.error) : Promise.resolve(dbState.rows);
			},
		}),
	},
}));

import {
	clearCredentialOverlay,
	encryptCredential,
	getCredential,
	refreshCredentialOverlay,
	withStoredCredentials,
} from "./store";

const KEY = Buffer.alloc(32, 7);
const KEY_B64 = KEY.toString("base64");

async function encryptedRow(name: string, value: string, key: Buffer = KEY) {
	return { name, encryptedValue: await encryptSecret(value, { key, aad: `secret:${name}` }) };
}

beforeEach(() => {
	dbState.rows = [];
	dbState.error = null;
	dbState.queries = 0;
	clearCredentialOverlay();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	clearCredentialOverlay();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("getCredential", () => {
	it("falls back to process.env when the overlay is empty", () => {
		vi.stubEnv("BEATAPI_API_KEY", "env-value");
		expect(getCredential("BEATAPI_API_KEY")).toBe("env-value");
	});

	it("returns undefined when neither overlay nor env has the var", () => {
		vi.stubEnv("SOME_UNSET_CREDENTIAL", undefined);
		expect(getCredential("SOME_UNSET_CREDENTIAL")).toBeUndefined();
	});

	it("a stored value beats process.env, and clearing restores the env fallback", async () => {
		vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", KEY_B64);
		vi.stubEnv("BEATAPI_API_KEY", "env-value");
		dbState.rows = [await encryptedRow("BEATAPI_API_KEY", "db-value")];

		await refreshCredentialOverlay();
		expect(getCredential("BEATAPI_API_KEY")).toBe("db-value");

		clearCredentialOverlay();
		expect(getCredential("BEATAPI_API_KEY")).toBe("env-value");
	});
	it("keeps an explicitly disconnected BeatAPI credential empty after refresh even with an environment key", async () => {
		vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", KEY_B64);
		vi.stubEnv("BEATAPI_API_KEY", "stale-env-key");
		dbState.rows = [await encryptedRow("BEATAPI_API_KEY", "")];
		await refreshCredentialOverlay();
		expect(getCredential("BEATAPI_API_KEY")).toBe("");
		clearCredentialOverlay();
		await refreshCredentialOverlay();
		expect(getCredential("BEATAPI_API_KEY")).toBe("");
		expect(withStoredCredentials().BEATAPI_API_KEY).toBe("");
	});
});

describe("withStoredCredentials", () => {
	it("counts a credential stored in the database as set", async () => {
		vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", KEY_B64);
		dbState.rows = [await encryptedRow("BEATAPI_RESEARCH_MODEL", "db-value")];
		await refreshCredentialOverlay();

		expect(withStoredCredentials({ DATABASE_URL: "postgres://x" })).toMatchObject({
			DATABASE_URL: "postgres://x",
			BEATAPI_RESEARCH_MODEL: "db-value",
		});
	});
});

describe("refreshCredentialOverlay", () => {
	beforeEach(() => vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", KEY_B64));

	it("overrides each credential independently", async () => {
		vi.stubEnv("BROWSER_RUNNER_TOKEN", "env-password");
		dbState.rows = [await encryptedRow("BEATAPI_RESEARCH_MODEL", "db-user")];

		await refreshCredentialOverlay();

		expect(getCredential("BEATAPI_RESEARCH_MODEL")).toBe("db-user");
		expect(getCredential("BROWSER_RUNNER_TOKEN")).toBe("env-password");
	});

	it("ignores rows whose name is not an overridable credential", async () => {
		vi.stubEnv("NOT_A_CREDENTIAL", undefined);
		dbState.rows = [await encryptedRow("NOT_A_CREDENTIAL", "x")];

		await refreshCredentialOverlay();

		expect(getCredential("NOT_A_CREDENTIAL")).toBeUndefined();
	});

	it("rejects a ciphertext replayed under another credential's name", async () => {
		vi.stubEnv("BROWSER_RUNNER_TOKEN", undefined);
		const stolen = await encryptedRow("BEATAPI_API_KEY", "beatapi-secret");
		dbState.rows = [{ name: "BROWSER_RUNNER_TOKEN", encryptedValue: stolen.encryptedValue }];

		await refreshCredentialOverlay();

		expect(getCredential("BROWSER_RUNNER_TOKEN")).toBeUndefined();
	});

	it("drops only the undecryptable row, leaving healthy rows in place", async () => {
		vi.stubEnv("BROWSER_RUNNER_TOKEN", undefined);
		dbState.rows = [
			await encryptedRow("BEATAPI_API_KEY", "ok"),
			// Encrypted under a different key → GCM auth fails on decrypt.
			await encryptedRow("BROWSER_RUNNER_TOKEN", "nope", Buffer.alloc(32, 9)),
		];

		await refreshCredentialOverlay();

		expect(getCredential("BEATAPI_API_KEY")).toBe("ok");
		expect(getCredential("BROWSER_RUNNER_TOKEN")).toBeUndefined();
	});

	it("never keeps a stale overlay value once a row stops decrypting", async () => {
		vi.stubEnv("BROWSER_RUNNER_TOKEN", undefined); // no env fallback for this var

		dbState.rows = [await encryptedRow("BROWSER_RUNNER_TOKEN", "first")];
		await refreshCredentialOverlay();
		expect(getCredential("BROWSER_RUNNER_TOKEN")).toBe("first");

		dbState.rows = [await encryptedRow("BROWSER_RUNNER_TOKEN", "second", Buffer.alloc(32, 3))];
		await refreshCredentialOverlay();
		expect(getCredential("BROWSER_RUNNER_TOKEN")).toBeUndefined();
	});

	it("keeps serving rows written under a retired key mid-rotation", async () => {
		const retired = Buffer.alloc(32, 4);
		vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY_OLD", retired.toString("base64"));
		dbState.rows = [await encryptedRow("BEATAPI_API_KEY", "written-before-rotation", retired)];

		await refreshCredentialOverlay();

		expect(getCredential("BEATAPI_API_KEY")).toBe("written-before-rotation");
		expect(console.error).not.toHaveBeenCalled();
	});

	it("names the key a stranded row needs instead of blaming the row", async () => {
		vi.stubEnv("BEATAPI_API_KEY", undefined);
		dbState.rows = [await encryptedRow("BEATAPI_API_KEY", "stranded", Buffer.alloc(32, 4))];

		await refreshCredentialOverlay();

		expect(getCredential("BEATAPI_API_KEY")).toBeUndefined();
		expect(console.error).toHaveBeenCalledWith(expect.stringContaining("BEAT_GEO_ENCRYPTION_KEY_OLD"));
	});

	it("leaves the overlay untouched when the query fails", async () => {
		dbState.rows = [await encryptedRow("BEATAPI_API_KEY", "current")];
		await refreshCredentialOverlay();

		dbState.error = new Error("database unavailable");

		await expect(refreshCredentialOverlay()).rejects.toThrow("database unavailable");
		expect(getCredential("BEATAPI_API_KEY")).toBe("current");
	});

	it("degrades to env-only (never throws) when BEAT_GEO_ENCRYPTION_KEY is the wrong length", async () => {
		vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
		vi.stubEnv("BEATAPI_API_KEY", "env-value");
		dbState.rows = [await encryptedRow("BEATAPI_API_KEY", "db-value")];

		await expect(refreshCredentialOverlay()).resolves.toBeUndefined();
		expect(getCredential("BEATAPI_API_KEY")).toBe("env-value");
	});
});

// This PR only adds the ability to store credentials; nobody is moved off
// environment variables yet, so an install with no rows and no key has to behave
// exactly as it did before.
describe("deployments with nothing stored", () => {
	it("is a no-op: env credentials win, the table is never queried, and nothing is logged", async () => {
		vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", undefined);
		vi.stubEnv("BEATAPI_API_KEY", "env-value");
		vi.stubEnv("BEATAPI_RESEARCH_MODEL", "env-user");

		await refreshCredentialOverlay();

		expect(dbState.queries).toBe(0);
		expect(getCredential("BEATAPI_API_KEY")).toBe("env-value");
		expect(getCredential("BEATAPI_RESEARCH_MODEL")).toBe("env-user");
		expect(console.error).not.toHaveBeenCalled();
	});
});

describe("encryptCredential", () => {
	it("produces a payload that round-trips through the overlay", async () => {
		vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", KEY_B64);
		const encryptedValue = await encryptCredential("BROWSER_RUNNER_TOKEN", "longer-secret");

		dbState.rows = [{ name: "BROWSER_RUNNER_TOKEN", encryptedValue }];
		await refreshCredentialOverlay();
		expect(getCredential("BROWSER_RUNNER_TOKEN")).toBe("longer-secret");
	});

	it("rejects a name that is not an overridable credential", async () => {
		vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", KEY_B64);
		await expect(encryptCredential("DATABASE_URL", "postgres://")).rejects.toThrow(/not an overridable credential/);
	});

	it("throws EncryptionKeyError when no encryption key is set", async () => {
		vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", undefined);
		await expect(encryptCredential("BEATAPI_API_KEY", "x")).rejects.toThrow(EncryptionKeyError);
	});
});
