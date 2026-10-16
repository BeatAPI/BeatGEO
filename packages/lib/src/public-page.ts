import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [address, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
] as const)
	blocked.addSubnet(address, prefix, "ipv4");
const publicV6 = new BlockList();
publicV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
	["2001::", 32],
	["2001:db8::", 32],
	["2002::", 16],
] as const)
	blocked.addSubnet(address, prefix, "ipv6");

export function isPublicAddress(address: string) {
	const family = isIP(address);
	if (family === 4) return !blocked.check(address, "ipv4");
	return family === 6 && publicV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

export function publicUrl(value: string) {
	const url = new URL(value);
	const host = url.hostname.replace(/^\[|\]$/g, "");
	if (
		!["http:", "https:"].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.port ||
		/^(localhost|.*\.localhost|.*\.local)$/i.test(host) ||
		(isIP(host) && !isPublicAddress(host))
	)
		throw new Error("Use a public HTTP or HTTPS website without credentials or a custom port.");
	url.hash = "";
	return url;
}

export interface PublicPage {
	url: string;
	status: number;
	body: string;
	contentType: string;
	robots: string;
}

async function requestPage(url: URL, signal: AbortSignal): Promise<PublicPage & { location?: string }> {
	const host = url.hostname.replace(/^\[|\]$/g, "");
	const records = await Promise.race([
		lookup(host, { all: true }),
		new Promise<never>((_, reject) => {
			if (signal.aborted) reject(new Error("Website check timed out."));
			else signal.addEventListener("abort", () => reject(new Error("Website check timed out.")), { once: true });
		}),
	]);
	if (!records.length || records.some((record) => !isPublicAddress(record.address)))
		throw new Error("The website resolves to a private or reserved address.");
	const address = records[0];
	return new Promise((resolve, reject) => {
		const request = (url.protocol === "https:" ? https : http).request(
			url,
			{
				signal,
				method: "GET",
				agent: false,
				family: address.family,
				headers: {
					"User-Agent": "BeatGEO-SiteCheck/1.0",
					Accept: "text/html,text/plain,application/xml,text/xml",
					"Accept-Encoding": "identity",
				},
				// Pin the validated DNS answer through connection establishment.
				lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
			},
			(response) => {
				const chunks: Buffer[] = [];
				let size = 0;
				response.on("error", reject);
				response.on("data", (chunk: Buffer) => {
					size += chunk.length;
					if (size > 1_048_576) request.destroy(new Error("Website response exceeds the 1 MB audit limit."));
					else chunks.push(chunk);
				});
				response.on("end", () => {
					if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
						reject(new Error("Compressed audit responses are not supported."));
						return;
					}
					resolve({
						url: url.href,
						status: response.statusCode ?? 0,
						body: Buffer.concat(chunks).toString("utf8"),
						contentType: response.headers["content-type"] ?? "",
						robots: String(response.headers["x-robots-tag"] ?? ""),
						location: response.headers.location,
					});
				});
			},
		);
		request.on("error", reject);
		request.end();
	});
}

export async function fetchPublicPage(value: string): Promise<PublicPage> {
	let url = publicUrl(value);
	const signal = AbortSignal.timeout(15_000);
	for (let redirects = 0; redirects <= 3; redirects++) {
		const page = await requestPage(url, signal);
		if (page.status < 300 || page.status >= 400 || !page.location) return page;
		url = publicUrl(new URL(page.location, url).href);
	}
	throw new Error("Too many website redirects.");
}
