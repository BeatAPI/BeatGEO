// The account-free local workspace is never a network-facing service.
if ((!process.env.DEPLOYMENT_MODE || process.env.DEPLOYMENT_MODE === "local") && process.env.READ_ONLY !== "true") {
	process.env.NITRO_HOST = "127.0.0.1";
	process.env.HOST = "127.0.0.1";
	process.env.NITRO_PORT = new URL(process.env.APP_URL || "http://localhost:3140").port || "3140";
}
await import("../.output/server/index.mjs");
