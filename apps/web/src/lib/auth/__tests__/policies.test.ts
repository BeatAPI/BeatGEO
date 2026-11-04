/**
 * Access-control policy regression tests.
 *
 * This file is the single source of truth for "who can do what". If a policy
 * changes, a test here MUST break — that's the whole point.
 */
import { describe, expect, it } from "vitest";
import { evaluateDeploymentPolicy, type RequestInfo } from "@/lib/auth/policies";

function req(method: string, pathname: string, authorizationHeader?: string): RequestInfo {
	return { pathname, method, authorizationHeader };
}

function apiReq(method: string, pathname: string): RequestInfo {
	return req(method, pathname, "Bearer some-token");
}

describe("evaluateDeploymentPolicy", () => {
	describe("workspace routes", () => {
		it("allows GET to app routes", () => {
			expect(evaluateDeploymentPolicy(req("GET", "/app/brand-1")).action).toBe("allow");
		});

		it("allows writes to API routes", () => {
			expect(evaluateDeploymentPolicy(req("POST", "/api/brands")).action).toBe("allow");
		});

		it("allows writes to server functions", () => {
			expect(evaluateDeploymentPolicy(req("POST", "/_server")).action).toBe("allow");
		});

		it("serves the OpenAPI spec", () => {
			expect(evaluateDeploymentPolicy(req("GET", "/api/v1/openapi.json")).action).toBe("serve-openapi");
		});
	});

	describe("api v1", () => {
		it("passes a request that carries a token through", () => {
			for (const [method, path] of [
				["GET", "/api/v1/prompts"],
				["POST", "/api/v1/prompts"],
				["POST", "/api/v1/brands"],
				["PATCH", "/api/v1/brands/acme"],
				["DELETE", "/api/v1/competitors/01234567-89ab-cdef-0123-456789abcdef"],
				["POST", "/api/v1/tools/analyze"],
			] as const) {
				expect(evaluateDeploymentPolicy(apiReq(method, path)).action, `${method} ${path}`).toBe("allow");
			}
		});

		it("refuses a request carrying no usable token, without looking it up", () => {
			for (const header of [undefined, "", "Basic dXNlcjpwYXNz", "Bearer", "Bearer   "]) {
				const result = evaluateDeploymentPolicy(req("GET", "/api/v1/prompts", header));
				expect(result, `header: ${JSON.stringify(header)}`).toMatchObject({
					action: "block",
					status: 401,
					code: "unauthorized",
				});
			}
		});

		it("leaves the docs and the spec reachable without a token", () => {
			expect(evaluateDeploymentPolicy(req("GET", "/api/v1/docs")).action).toBe("allow");
			expect(evaluateDeploymentPolicy(req("GET", "/api/v1/docs/")).action).toBe("allow");
			expect(evaluateDeploymentPolicy(req("GET", "/api/v1/openapi.json/")).action).toBe("serve-openapi");
		});
	});

	describe("org plugin mutations", () => {
		it("blocks POST /api/auth/organization/create", () => {
			expect(evaluateDeploymentPolicy(req("POST", "/api/auth/organization/create"))).toMatchObject({
				action: "block",
				status: 403,
				error: "Forbidden",
			});
		});

		it("blocks DELETE /api/auth/organization/:id", () => {
			expect(evaluateDeploymentPolicy(req("DELETE", "/api/auth/organization/abc"))).toMatchObject({
				action: "block",
				status: 403,
			});
		});

		it("blocks POST /api/auth/organization/invite-member", () => {
			expect(evaluateDeploymentPolicy(req("POST", "/api/auth/organization/invite-member"))).toMatchObject({
				action: "block",
				status: 403,
			});
		});

		it("allows GET /api/auth/organization/list (read endpoints unchanged)", () => {
			expect(evaluateDeploymentPolicy(req("GET", "/api/auth/organization/list")).action).toBe("allow");
		});
	});

	describe("api key plugin mutations", () => {
		it("blocks issuing keys over the plugin endpoint", () => {
			expect(evaluateDeploymentPolicy(req("POST", "/api/auth/api-key/create"))).toMatchObject({
				action: "block",
				status: 403,
			});
		});
	});

	describe("mcp", () => {
		it("lets the transport through, because a read is a POST too", () => {
			// A middleware block would be a bare 403 with no WWW-Authenticate, which
			// is what a client reads to discover it should sign in.
			expect(evaluateDeploymentPolicy(req("POST", "/api/mcp")).action).toBe("allow");
		});

		it("runs the OAuth flow", () => {
			expect(evaluateDeploymentPolicy(req("GET", "/api/auth/oauth2/authorize")).action).toBe("allow");
			expect(evaluateDeploymentPolicy(req("POST", "/api/auth/oauth2/register")).action).toBe("allow");
			expect(evaluateDeploymentPolicy(req("POST", "/api/auth/oauth2/token")).action).toBe("allow");
		});

		it("leaves a path under the MCP endpoint to the route, which answers 404", () => {
			expect(evaluateDeploymentPolicy(req("POST", "/api/mcp/sub")).action).toBe("allow");
		});
	});
});
