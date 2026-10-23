import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";
import { LOCAL_BOOTSTRAP_HEADER, localBootstrapProof, localWorkspacePlugin } from "./local-workspace";

const secret = "local-test-secret-that-is-at-least-thirty-two-characters";
function setup() {
	const owner = {
		id: "local-owner",
		name: "Local workspace",
		email: "workspace@beatgeo.invalid",
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	const storage: Record<string, Record<string, unknown>[]> = {
		user: [owner],
		session: [],
		account: [],
		verification: [],
	};
	const ensureOwner = vi.fn(async () => owner);
	const auth = betterAuth({
		baseURL: "http://localhost:3140",
		secret,
		database: memoryAdapter(storage),
		plugins: [localWorkspacePlugin(ensureOwner)],
		rateLimit: { enabled: false },
	});
	return { auth, storage, ensureOwner };
}

describe("invisible local browser sessions", () => {
	it("issues a real reusable auth session without a password or account record", async () => {
		const { auth, storage, ensureOwner } = setup();
		const response = await auth.handler(
			new Request("http://localhost:3140/api/auth/local-workspace", {
				method: "POST",
				headers: { [LOCAL_BOOTSTRAP_HEADER]: localBootstrapProof(secret) },
			}),
		);
		expect(response.status).toBe(200);
		expect(ensureOwner).toHaveBeenCalledOnce();
		const cookies = response.headers.getSetCookie();
		expect(cookies.join(";")).toContain("HttpOnly");
		expect(cookies.join(";")).toContain("SameSite=Strict");
		const headers = new Headers({ cookie: cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ") });
		const session = await auth.api.getSession({ headers });
		expect(session?.user.id).toBe("local-owner");
		expect(storage.account).toHaveLength(0);
		expect((await auth.api.getSession({ headers }))?.session.id).toBe(session?.session.id);
	});
	it.each(["", "invalid", "a".repeat(64), "é".repeat(64)])(
		"refuses issuance without the private in-process proof",
		async (proof) => {
			const { auth, storage, ensureOwner } = setup();
			const response = await auth.handler(
				new Request("http://localhost:3140/api/auth/local-workspace", {
					method: "POST",
					headers: { [LOCAL_BOOTSTRAP_HEADER]: proof },
				}),
			);
			expect(response.status).toBe(404);
			expect(ensureOwner).not.toHaveBeenCalled();
			expect(storage.session).toHaveLength(0);
		},
	);
});
