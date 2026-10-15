#!/usr/bin/env tsx
/** Generate BeatGEO's bars mark. Run pnpm --filter @workspace/web generate-icons. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderOgPng } from "@workspace/og/rasterize";
import pngToIco from "png-to-ico";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
const bars = [
	{ x: 13, y: 12, w: 7, h: 40, color: "#355bd8" },
	{ x: 24, y: 19, w: 6, h: 26, color: "#18202c" },
	{ x: 34, y: 14, w: 6, h: 36, color: "#18202c" },
	{ x: 44, y: 23, w: 6, h: 18, color: "#18202c" },
];
function svg() {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f7f9ff"/>${bars.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.w / 2}" fill="${b.color}"/>`).join("")}</svg>`;
}
async function png(size: number) {
	return renderOgPng(
		<div
			style={{
				display: "flex",
				position: "relative",
				width: size,
				height: size,
				backgroundColor: "#f7f9ff",
				borderRadius: (size * 14) / 64,
			}}
		>
			{bars.map((b) => (
				<div
					key={b.x}
					style={{
						position: "absolute",
						left: (size * b.x) / 64,
						top: (size * b.y) / 64,
						width: (size * b.w) / 64,
						height: (size * b.h) / 64,
						borderRadius: (size * b.w) / 128,
						backgroundColor: b.color,
					}}
				/>
			))}
		</div>,
		{ width: size, height: size, fonts: [] },
	);
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
console.log("BeatGEO icons generated.");
