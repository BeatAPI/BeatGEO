import { createServerEntry } from "@tanstack/react-start/server-entry";

// The MVP publishes its documentation on GitHub, not the inherited marketing site.
export default createServerEntry({
	fetch() {
		return new Response(
			`<!doctype html><html lang="en"><meta charset="utf-8"><title>BeatGeo</title><body><h1>BeatGeo</h1><p>Open-source AI visibility monitoring by BeatAPI.</p><p><a href="https://github.com/BeatAPI/BeatGeo">Source, setup and product roadmap</a></p></body></html>`,
			{
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
					"X-Content-Type-Options": "nosniff",
				},
			},
		);
	},
});
