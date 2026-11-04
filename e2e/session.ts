/**
 * Database-level helpers for establishing an authenticated E2E session.
 *
 * The local workspace has no sign-in form, so the setup writes a session row
 * and hands the browser the cookie better-auth would have set.
 *
 * The cookie format is better-auth's: `<token>.<signature>`, where the
 * signature is a base64 HMAC-SHA256 of the token under BETTER_AUTH_SECRET (see
 * `makeSignature` in better-auth's crypto module). Callers must verify the
 * cookie is actually accepted — `assertSessionAccepted` below — so a change in
 * that format fails setup with a clear message instead of surfacing as a wall
 * of "redirected to /auth/login" test failures.
 */
import crypto from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import pg from "pg";
import { DATABASE_URL, TEST_BRAND_ID, TEST_BRAND_NAME } from "./fixtures";

/** better-auth's session cookie name on a non-HTTPS base URL. */
const SESSION_COOKIE_NAME = "better-auth.session_token";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const target = new URL(DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !decodeURIComponent(target.pathname).endsWith("_test"))
    throw new Error("E2E sessions require a disposable local *_test database.");
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function getBetterAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Set BETTER_AUTH_SECRET to the isolated test server's secret.");
  return secret;
}

/** Mirrors better-auth's `makeSignature`: base64 HMAC-SHA256 of the value. */
function signSessionToken(token: string, secret: string): string {
  const signature = crypto.createHmac("sha256", secret).update(token).digest("base64");
  return `${token}.${signature}`;
}

/** Mint a session for an existing user. Returns the signed cookie value. */
export async function issueSessionCookie(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");

  await withDb(async (client) => {
    await client.query(
      `INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NOW() + INTERVAL '7 days', NOW(), NOW())`,
      [token, userId],
    );
  });

  return signSessionToken(token, getBetterAuthSecret());
}

/** Cookie payload shaped for `browserContext.addCookies`. */
export function sessionCookie(value: string, baseURL: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value,
    domain: new URL(baseURL).hostname,
    path: "/",
    httpOnly: true,
    secure: new URL(baseURL).protocol === "https:",
    sameSite: "Strict" as const,
    expires: Math.floor((Date.now() + SESSION_TTL_MS) / 1000),
  };
}

/**
 * Insert the user if absent and make them an admin with report-generator
 * access for the report tests.
 */
export async function ensureUser(client: pg.Client, user: { email: string; name: string }): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, true, 'admin', NOW(), NOW())
     ON CONFLICT (email) DO UPDATE
       SET role = 'admin', email_verified = true
     RETURNING id`,
    [user.name, user.email],
  );
  return rows[0].id;
}

/** Establish the synthetic owner's membership in the fixture workspace. */
export async function ensureOrgMembership(client: pg.Client, userId: string): Promise<void> {
  await client.query(
    `INSERT INTO organization (id, name, slug, created_at)
     VALUES ($1, $2, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [TEST_BRAND_ID, TEST_BRAND_NAME],
  );

  const existing = await client.query(
    `SELECT id FROM member WHERE organization_id = $1 AND user_id = $2 LIMIT 1`,
    [TEST_BRAND_ID, userId],
  );
  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO member (id, organization_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'admin', NOW())`,
      [TEST_BRAND_ID, userId],
    );
  }
}

/**
 * Fail loudly if the session the setup just established isn't usable.
 *
 * The role check is not incidental: better-auth caches the session's user
 * fields in a cookie for five minutes, so a session opened before the admin
 * role was granted keeps reporting the old one until that cache expires. It
 * surfaces as the sidebar's admin section and /reports quietly going missing,
 * which is far easier to read here than spread across the specs.
 */
export async function assertSessionAccepted(request: APIRequestContext, expectedEmail: string): Promise<void> {
  const response = await request.get("/api/auth/get-session");
  const body = await response.text();
  if (!response.ok()) {
    throw new Error(`Session check failed: ${response.status()} ${body}`);
  }

  let session: { user?: { email?: string; role?: string } } | null = null;
  try {
    session = body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`Session check returned an unparseable body: ${body}`);
  }

  if (session?.user?.email !== expectedEmail) {
    throw new Error(`Session check did not return ${expectedEmail}. Body: ${body || "(empty)"}`);
  }
  if (session.user.role !== "admin") {
    throw new Error(`Session reports role "${session.user.role}", expected "admin" (stale session cookie cache?)`);
  }
}
