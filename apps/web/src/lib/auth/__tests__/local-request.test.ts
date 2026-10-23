import { describe, expect, it, vi } from "vitest";
import { handleLocalWorkspaceRequest, localRequestRefusal } from "../local-request";

const APP = "http://localhost:3140";
function request(path = "/", headers: Record<string, string> = {}, method = "GET") {
	return new Request(APP + path, { method, headers });
}
const navigation = {
	accept: "text/html",
	"sec-fetch-site": "none",
	"sec-fetch-mode": "navigate",
	"sec-fetch-dest": "document",
};
function options() {
	return {
		appUrl: APP,
		getSession: vi.fn(async (_headers: Headers): Promise<unknown> => null),
		bootstrap: vi.fn(
			async () => new Response("{}", { headers: { "set-cookie": "session=fresh; HttpOnly; SameSite=Strict; Path=/" } }),
		),
		next: vi.fn(async (_request: Request) => new Response("workspace")),
	};
}

const untrustedHeaders: Record<string, string>[] = [
	{ origin: "https://attacker.example" },
	{ origin: "null" },
	{ "sec-fetch-site": "cross-site" },
	{ "sec-fetch-site": "same-site" },
	{ host: "attacker.example:3140" },
	{ "x-forwarded-host": "localhost:3140" },
	{ forwarded: "host=localhost:3140" },
	{ "x-forwarded-for": "127.0.0.1" },
];

describe("local workspace request protection", () => {
	it.each(untrustedHeaders)("rejects an untrusted request even with a browser session: %j", async (headers) => {
		const deps = options();
		deps.getSession.mockResolvedValue({ user: { id: "owner" } });
		const response = await handleLocalWorkspaceRequest(request("/", headers), deps);
		expect(response.status).toBe(403);
		expect(deps.bootstrap).not.toHaveBeenCalled();
		expect(deps.next).not.toHaveBeenCalled();
	});
	it.each(["http://attacker.example:3140", "http://0.0.0.0:3140", "http://localhost:3141", "https://localhost:3140"])(
		"rejects a different authority: %s",
		(url) => {
			expect(localRequestRefusal(new Request(url), APP)?.status).toBe(403);
		},
	);
	it("rejects a public APP_URL instead of enabling anonymous public access", () => {
		expect(localRequestRefusal(request(), "https://beatgeo.example")?.status).toBe(403);
	});
	it("opens a first direct browser visit and uses the real issued cookie for SSR", async () => {
		const deps = options();
		const response = await handleLocalWorkspaceRequest(request("/app", navigation), deps);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("workspace");
		expect(response.headers.get("set-cookie")).toContain("HttpOnly");
		expect(deps.next.mock.calls[0][0].headers.get("cookie")).toBe("session=fresh");
	});
	it("reuses a valid browser session without issuing a new one", async () => {
		const deps = options();
		deps.getSession.mockResolvedValue({ user: { id: "owner" } });
		expect(
			(await handleLocalWorkspaceRequest(request("/app", { ...navigation, cookie: "session=existing" }), deps)).status,
		).toBe(200);
		expect(deps.bootstrap).not.toHaveBeenCalled();
	});
	it.each([request(), request("/_server/action", { origin: APP }, "POST"), request("/api/private")])(
		"does not bootstrap an API call or a request missing navigation metadata",
		async (input) => {
			const deps = options();
			expect((await handleLocalWorkspaceRequest(input, deps)).status).toBe(401);
			expect(deps.bootstrap).not.toHaveBeenCalled();
		},
	);
	it("rejects cookie-only writes missing browser origin information", async () => {
		const deps = options();
		deps.getSession.mockResolvedValue({ user: { id: "owner" } });
		expect((await handleLocalWorkspaceRequest(request("/_server/action", {}, "POST"), deps)).status).toBe(403);
	});
	it("leaves MCP and REST authentication to their scoped bearer gates", async () => {
		for (const path of ["/api/mcp", "/api/v1/brands"]) {
			const deps = options();
			deps.next.mockResolvedValue(new Response("unauthorized", { status: 401 }));
			expect((await handleLocalWorkspaceRequest(request(path, {}, "POST"), deps)).status).toBe(401);
			expect(deps.bootstrap).not.toHaveBeenCalled();
			expect(deps.getSession).not.toHaveBeenCalled();
		}
	});
	it.each([
		"/api/auth/sign-up/email",
		"/api/auth/sign-in/email",
		"/api/auth/change-password",
		"/api/auth/organization/invite-member",
		"/api/auth/local-workspace",
	])("disables direct account operations: %s", async (path) => {
		const deps = options();
		expect((await handleLocalWorkspaceRequest(request(path, { origin: APP }, "POST"), deps)).status).toBe(404);
		expect(deps.next).not.toHaveBeenCalled();
	});
	it.each([
		"/auth/login",
		"/auth/register",
		"/auth/forgot-password",
		"/auth/reset-password",
		"/accept-invitation/example",
	])("routes obsolete account pages back to the workspace: %s", async (path) => {
		const response = await handleLocalWorkspaceRequest(request(path, navigation), options());
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(`${APP}/app`);
	});
	it("fails closed when the session cannot be established", async () => {
		const deps = options();
		deps.bootstrap.mockResolvedValue(new Response("error", { status: 500 }));
		expect((await handleLocalWorkspaceRequest(request("/app", navigation), deps)).status).toBe(503);
		expect(deps.next).not.toHaveBeenCalled();
	});
});

describe("first visit through the server runtime", () => {
	// The server hands over its own Request subclass, which the platform Request
	// constructor cannot copy: a first visit crashed with a 500 before any cookie existed.
	function runtimeRequest(path: string, headers: Record<string, string>): Request {
		const plain = request(path, headers);
		const runtime = Object.create(Request.prototype) as Request;
		for (const key of ["url", "method", "headers", "signal"] as const)
			Object.defineProperty(runtime, key, { get: () => plain[key] });
		return runtime;
	}

	it("opens the workspace and sets the session cookie", async () => {
		const deps = options();
		const response = await handleLocalWorkspaceRequest(runtimeRequest("/app", navigation), deps);
		expect(response.status).toBe(200);
		expect(response.headers.get("set-cookie")).toContain("session=fresh");
		const forwarded = deps.next.mock.calls[0]?.[0] as Request;
		expect(forwarded.headers.get("cookie")).toContain("session=fresh");
		expect(new URL(forwarded.url).pathname).toBe("/app");
	});
});
