import { expect, request as playwrightRequest, test } from "@playwright/test";
import { TEST_API_KEY } from "../fixtures";

test("a fresh local workspace opens without an account and remembers its language", async ({ page, context, baseURL }) => {
	await page.goto("/");
	await expect(page.getByLabel("Brand Name", { exact: true })).toBeVisible({ timeout: 60_000 });
	await expect(page.getByRole("button", { name: "EN", exact: true })).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByLabel(/password/i)).toHaveCount(0);
	const anonymous = await playwrightRequest.newContext({ baseURL });
	const registration = await anonymous.post("/api/auth/oauth2/register", { data: {
		client_name: "Local first-run MCP client",
		redirect_uris: ["http://127.0.0.1:41999/oauth/callback"],
		grant_types: ["authorization_code"], response_types: ["code"],
		token_endpoint_auth_method: "none", application_type: "native",
	} });
	expect(registration.status(), await registration.text()).toBe(201);
	const { client_id } = await registration.json();
	await anonymous.dispose();
	await context.clearCookies();
	const query = new URLSearchParams({ client_id, response_type: "code",
		redirect_uri: "http://127.0.0.1:41999/oauth/callback", scope: "openid profile email",
		state: "first-local-visit", code_challenge: "a".repeat(43), code_challenge_method: "S256" });
	await page.goto(`/api/auth/oauth2/authorize?${query}`);
	await expect(page.getByText("Local first-run MCP client", { exact: true })).toBeVisible({ timeout: 30_000 });
	await expect(page.getByLabel(/password/i)).toHaveCount(0);
	await page.goto("/");
	const session = await page.request.get("/api/auth/get-session");
	expect(session.ok()).toBe(true);
	expect((await session.json()).user.email).toBe("workspace@beatgeo.invalid");
	await page.getByRole("button", { name: "中文", exact: true }).click();
	await expect(page.getByRole("button", { name: "中文", exact: true })).toHaveAttribute("aria-pressed", "true");
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
	const serverRendered = await page.request.get("/brand");
	expect(await serverRendered.text()).toContain('lang="zh-CN"');
	await page.getByRole("button", { name: "EN", exact: true }).click();
	await page.getByLabel("Brand Name", { exact: true }).fill("Local acceptance");
	await page.getByLabel("Website", { exact: true }).fill("https://example.com");
	await page.getByRole("button", { name: "Save website", exact: true }).click();
	await expect(page.locator('[data-slot="sidebar"]').first()).toBeVisible({ timeout: 60_000 });
	const created = await page.request.post("/api/v1/brands", {
		headers: { Authorization: `Bearer ${TEST_API_KEY}` },
		data: { id: "api-first-run", name: "API website", domains: ["api.example.com"] },
	});
	expect(created.status(), await created.text()).toBe(201);
	expect((await created.json()).organizationId).toBe("default");
	await context.clearCookies();
	await page.goto("/");
	await expect(page.locator('[data-slot="sidebar"]').first()).toBeVisible({ timeout: 60_000 });
	await expect(page.getByLabel(/password/i)).toHaveCount(0);
	await page.goto("/reports");
	await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
	await expect(page.getByText("Access denied.", { exact: false })).toHaveCount(0);
});
