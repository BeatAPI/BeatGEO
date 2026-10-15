import { db } from "@workspace/lib/db/db";
import { secrets } from "@workspace/lib/db/schema";
import { encryptCredential, getCredential, refreshCredentialOverlay } from "@workspace/lib/secrets";

const API = "https://api.beatapi.io/v1";

async function keyRead(path: "/usage" | "/models", key: string) {
	try {
		const result = await fetch(`${API}${path}`, {
			redirect: "error",
			headers: { Authorization: `Bearer ${key}` },
			signal: AbortSignal.timeout(15000),
		});
		if (!result.ok) throw new Error(`BeatAPI returned ${result.status}. Check your key and access.`);
		return await result.json();
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("BeatAPI returned")) throw error;
		throw new Error("Could not reach BeatAPI. Check your connection and try again.");
	}
}

export async function inspectBeatApi(key: string) {
	await keyRead("/usage", key);
	const result = await keyRead("/models", key);
	if (!Array.isArray(result.data)) throw new Error("BeatAPI did not return a model list.");
	return result.data
		.flatMap((row: { id?: unknown }) => (typeof row.id === "string" ? [row.id] : []))
		.slice(0, 2000) as string[];
}

export async function saveBeatApi(key: string, model: string) {
	const models = await inspectBeatApi(key);
	if (!models.includes(model)) throw new Error("Choose a model available to this key.");
	const entries = await Promise.all(
		[
			["BEATAPI_API_KEY", key],
			["BEATAPI_RESEARCH_MODEL", model],
		].map(async ([name, value]) => ({ name, encryptedValue: await encryptCredential(name, value) })),
	);
	await db.transaction(async (tx) => {
		for (const entry of entries)
			await tx
				.insert(secrets)
				.values(entry)
				.onConflictDoUpdate({
					target: secrets.name,
					set: { encryptedValue: entry.encryptedValue, updatedAt: new Date() },
				});
	});
	await refreshCredentialOverlay();
	return { saved: true };
}

export function connectionSummary() {
	const key = getCredential("BEATAPI_API_KEY");
	return {
		configured: Boolean(key),
		keyHint: key ? `${key.slice(0, 4)}••••` : null,
		model: getCredential("BEATAPI_RESEARCH_MODEL") || "",
		researchOverride: process.env.ONBOARDING_LLM_TARGET || "",
	};
}

export async function browserRequest(path: "/api/browser" | "/api/browser/profile", profileId?: string) {
	const base = new URL(process.env.BROWSER_RUNNER_URL || "http://127.0.0.1:4318");
	if (base.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(base.hostname))
		throw new Error("The browser service must run on this computer.");
	try {
		const response = await fetch(new URL(path, base), {
			method: profileId ? "POST" : "GET",
			redirect: "error",
			signal: AbortSignal.timeout(15000),
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.BROWSER_RUNNER_TOKEN || ""}`,
			},
			...(profileId ? { body: JSON.stringify({ profileId }) } : {}),
		});
		if (!response.ok) throw new Error("unavailable");
		const data = await response.json();
		const profiles: Array<{ id: string; label: string }> = Array.isArray(data.profiles)
			? data.profiles.map((p: { profileId: string; description?: string }) => ({
					id: p.profileId,
					label: p.description || "Chrome",
				}))
			: [];
		return {
			online: true,
			profiles,
			selectedProfileId: data.selectedProfileId || "",
			extensionPath: data.extensionPath || "",
			version: data.version || "",
			error: "",
		};
	} catch {
		return {
			online: false,
			profiles: [],
			selectedProfileId: "",
			extensionPath: "",
			version: "",
			error: "Browser service unavailable. Start BeatGEO locally, then check again.",
		};
	}
}
