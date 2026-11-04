import release from "./google-client-release.json";

export function googleClient(callbackPath: string) {
	const app = new URL(process.env.APP_URL || "http://localhost:3000");
	const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname);
	if (app.protocol !== "https:" && !(app.protocol === "http:" && loopback))
		throw new Error("Google authorization requires HTTPS outside localhost.");
	const web = Boolean(process.env.GA_CLIENT_ID || process.env.GA_CLIENT_SECRET);
	const id = web ? process.env.GA_CLIENT_ID : process.env.GOOGLE_DESKTOP_CLIENT_ID || release.clientId;
	// Installed-app credentials identify a public client; never reuse them with a custom client ID.
	const secret = web
		? process.env.GA_CLIENT_SECRET
		: process.env.GOOGLE_DESKTOP_CLIENT_SECRET || (id === release.clientId ? release.clientSecret : undefined);
	const ready = web
		? Boolean(id && secret)
		: Boolean(id && secret && id.endsWith(".apps.googleusercontent.com") && loopback);
	return { id, secret, ready, redirect: new URL(callbackPath, app).href, secure: app.protocol === "https:" };
}
