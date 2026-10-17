import { describe, expect, it } from "vitest";
import { isPublicAddress, publicUrl } from "./public-page";
import { auditFailure, inspectHtml, scanSite } from "./site-audit";

const page = {
	url: "https://example.com/",
	status: 200,
	contentType: "text/html",
	robots: "",
	body: "<html><title>Image maker</title><h1>Create images</h1></html>",
};

describe("public website audit boundaries", () => {
	it.each([
		"http://127.0.0.1/",
		"http://2130706433/",
		"http://169.254.169.254/",
		"http://[::1]/",
		"http://[::ffff:127.0.0.1]/",
		"http://localhost/",
		"file:///etc/passwd",
		"https://user:password@example.com/",
		"https://example.com:8443/",
	])("rejects unsafe destinations: %s", (url) => expect(() => publicUrl(url)).toThrow());
	it.each([
		"10.1.1.1",
		"192.168.1.1",
		"172.31.0.1",
		"100.64.0.1",
		"0.0.0.0",
		"224.0.0.1",
		"fe80::1",
		"fc00::1",
		"2001:db8::1",
		"::ffff:10.1.1.1",
	])("rejects reserved DNS results: %s", (address) => expect(isPublicAddress(address)).toBe(false));
	it("allows public addresses and preserves query parameters", () => {
		expect(isPublicAddress("8.8.8.8")).toBe(true);
		expect(isPublicAddress("2606:4700::1111")).toBe(true);
		expect(publicUrl("https://example.com/?lang=zh#section").href).toBe("https://example.com/?lang=zh");
	});
	it("reports observed missing metadata, indexing directives and JSON syntax", () => {
		const checks = inspectHtml({
			...page,
			robots: "noindex",
			body: `${page.body}<script type="application/ld+json">invalid</script>`,
		});
		expect(checks.find((c) => c.id === "title")?.state).toBe("pass");
		for (const id of ["description", "canonical", "indexing", "structured_data"])
			expect(checks.find((c) => c.id === id)?.state).toBe("issue");
	});
	it("does not turn timeouts and protected pages into poor SEO scores", async () => {
		const result = await scanSite("example.com", async () => {
			throw new Error("timeout");
		});
		expect(result).toMatchObject({ passed: 0, evaluated: 0, total: 9 });
		expect(result.checks.every((c) => c.state === "unknown")).toBe(true);
		expect(result.checks[0].suggestion).toContain("timed out");
	});
	it("explains blocked DNS without exposing transport errors", () => {
		expect(auditFailure(new Error("The website resolves to a private or reserved address."))).toContain("proxy DNS");
		expect(auditFailure(new Error("transport failure with private context"))).not.toContain("private context");
	});
	it("distinguishes conventional sitemap absence from unreadable responses", async () => {
		const result = await scanSite("example.com", async (url) =>
			url.endsWith("sitemap.xml")
				? { ...page, url, status: 404 }
				: url.endsWith("robots.txt")
					? { ...page, url, contentType: "text/plain", body: "User-agent: *\nDisallow: /private" }
					: page,
		);
		expect(result.checks.find((c) => c.id === "robots")?.state).toBe("pass");
		expect(result.checks.find((c) => c.id === "sitemap")?.state).toBe("issue");
	});
});
