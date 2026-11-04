#!/usr/bin/env tsx
/** Package the approved product mark for browser tabs and app installation. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderOgPng } from "@workspace/og/rasterize";
import pngToIco from "png-to-ico";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
const mark = `data:image/png;base64,${readFileSync(resolve(directory, "beatgeo-product.png")).toString("base64")}`;
function svg() {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><image width="120" height="120" href="${mark}"/></svg>`;
}
async function png(size: number) {
	return renderOgPng(<img alt="BeatGEO" src={mark} style={{ width: size, height: size }} />, {
		width: size,
		height: size,
		fonts: [],
	});
}
mkdirSync(directory, { recursive: true });
for (const name of ["beatgeo-icon.svg", "beatgeo-icon-maskable.svg"]) writeFileSync(resolve(directory, name), svg());
for (const size of [96, 192, 512]) {
	const buffer = await png(size);
	writeFileSync(resolve(directory, `beatgeo-icon-${size}.png`), buffer);
	if (size !== 96) writeFileSync(resolve(directory, `beatgeo-icon-maskable-${size}.png`), buffer);
}
writeFileSync(resolve(directory, "apple-touch-icon.png"), await png(180));
writeFileSync(resolve(directory, "favicon.ico"), await pngToIco(await Promise.all([16, 32, 48].map(png))));
console.log("BeatGEO product icons generated.");
