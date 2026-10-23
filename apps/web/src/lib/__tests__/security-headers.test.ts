import { expect, it } from "vitest";
import { addSecurityHeaders } from "../security-headers";

it("preserves an immutable redirect while adding browser security headers", () => {
	const response = addSecurityHeaders(Response.redirect("http://localhost:3140/app", 302));
	expect(response.status).toBe(302);
	expect(response.headers.get("location")).toBe("http://localhost:3140/app");
	expect(response.headers.get("x-frame-options")).toBe("DENY");
});
it("preserves session cookies and a streamed response body", async () => {
	const input = new Response("workspace");
	input.headers.append("set-cookie", "session=one; HttpOnly; SameSite=Strict");
	input.headers.append("set-cookie", "cache=two; HttpOnly");
	const response = addSecurityHeaders(input);
	expect(response.headers.getSetCookie()).toHaveLength(2);
	expect(await response.text()).toBe("workspace");
});
