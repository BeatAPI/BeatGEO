/**
 * Authentication setup for the local project.
 *
 * The local workspace has no sign-in form: its one session is issued by the
 * local request handler. The setup makes the E2E user an admin of the seeded
 * brand, writes a session row and hands the browser the cookie better-auth
 * would have set, then saves that state for every spec to reuse.
 */
import { AUTH_STATE_PATH, TEST_BRAND_ID, TEST_USER } from "../fixtures";
import {
  assertSessionAccepted,
  ensureOrgMembership,
  ensureUser,
  issueSessionCookie,
  sessionCookie,
  withDb,
} from "../session";
import { test as setup } from "../test";

setup("authenticate", async ({ page, baseURL }) => {
  const userId = await withDb(async (client) => {
    const id = await ensureUser(client, TEST_USER);
    await ensureOrgMembership(client, id);
    return id;
  });
  await page.context().addCookies([sessionCookie(await issueSessionCookie(userId), baseURL!)]);

  await page.context().addCookies([{ name: "beatgeo-website", value: TEST_BRAND_ID,
    domain: new URL(baseURL!).hostname, path: "/", httpOnly: true, sameSite: "Strict" }]);
  await assertSessionAccepted(page.request, TEST_USER.email);
  await page.context().storageState({ path: AUTH_STATE_PATH });
  console.log(`[auth.setup] authenticated as ${TEST_USER.email}`);
});
