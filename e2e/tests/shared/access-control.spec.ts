/**
 * Access-control invariants: an anonymous visitor can't reach the dashboard,
 * the public API needs a key, org membership scopes what a signed-in user can
 * see, and organizations can't be created over HTTP. An auth or middleware
 * change that quietly opens one of these up fails here.
 */
import { expect, test } from "../../test";
import { NIKE_BRAND_ID, TEST_API_KEY, TEST_BRAND_NAME, brandUrl, organizationUrl } from "../../fixtures";

test.describe("Unauthenticated access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a non-browser request cannot bootstrap a local session", async ({ request }) => {
    const response = await request.get(brandUrl(), { maxRedirects: 0, failOnStatusCode: false });
    expect(response.status()).toBe(401);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  });

  test("the public API rejects a request with no key", async ({ request }) => {
    const response = await request.get("/api/v1/brands", { failOnStatusCode: false });
    expect(response.status()).toBe(401);
  });

  test("the public API rejects a bad key", async ({ request }) => {
    const response = await request.get("/api/v1/brands", {
      headers: { Authorization: "Bearer not-the-key" },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test("the public API accepts the admin key", async ({ request }) => {
    const response = await request.get("/api/v1/brands", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(response.status()).toBe(200);
  });
});

test.describe("Authenticated access", () => {
  test("a foreign brand address cannot expose another workspace", async ({ page }) => {
    await page.goto(`${organizationUrl()}/brand/${NIKE_BRAND_ID}`);
    await expect(page.getByRole("navigation", { name: "breadcrumb" })).toContainText(TEST_BRAND_NAME);
    await expect(page.getByText("Nike", { exact: true })).toHaveCount(0);
  });

  test("organizations cannot be created over HTTP", async ({ request }) => {
    const response = await request.post("/api/auth/organization/create", {
      data: { name: "Smuggled Org", slug: "smuggled-org" },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(404);
  });
});
