import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ default: { request: mocks.request } }));
vi.mock("node:http", () => ({ default: { request: mocks.request } }));

import { fetchPublicPage } from "./public-page";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
});
function reply(status: number, headers: Record<string, string>, body = "") {
	mocks.request.mockImplementationOnce((_url, _options, receive) => {
		const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
		req.end = () => {
			const res = Readable.from([Buffer.from(body)]);
			Object.assign(res, { statusCode: status, headers });
			receive(res);
		};
		req.destroy = (error) => {
			req.emit("error", error);
		};
		return req;
	});
}
it("rejects mixed public/private DNS before connecting", async () => {
	mocks.lookup.mockResolvedValue([
		{ address: "8.8.8.8", family: 4 },
		{ address: "10.0.0.1", family: 4 },
	]);
	await expect(fetchPublicPage("https://example.com")).rejects.toThrow("private or reserved");
	expect(mocks.request).not.toHaveBeenCalled();
});
it("validates every redirect and never follows a metadata endpoint", async () => {
	reply(302, { location: "http://169.254.169.254/" });
	await expect(fetchPublicPage("https://example.com")).rejects.toThrow("public HTTP");
	expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("pins the DNS address and limits response size", async () => {
	reply(200, { "content-type": "text/html" }, "x".repeat(1_048_577));
	await expect(fetchPublicPage("https://example.com")).rejects.toThrow("1 MB");
	const callback = vi.fn();
	mocks.request.mock.calls[0][1].lookup("example.com", {}, callback);
	expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
});
