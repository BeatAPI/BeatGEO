import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function getPackageVersion(): Promise<string> {
	const selfDir = path.dirname(fileURLToPath(import.meta.url));
	const packagePath = path.resolve(selfDir, "..", "package.json");
	const contents = await fs.readFile(packagePath, "utf8");
	const json = JSON.parse(contents) as { version?: string };
	return json.version!;
}
