import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { beginGaOAuth, GA_COOKIE, gaClient } from "./ga-oauth-core";
import { beginGoogleOAuth, GOOGLE_COOKIE, sharedGoogleClient } from "./google-oauth-core";
import { beginGscOAuth, GSC_COOKIE, gscClient } from "./gsc-oauth-core";
import {
	disconnectGa,
	disconnectGsc,
	gaProperties,
	gscProperties,
	importCrawlTraffic,
	readTraffic,
	syncGa,
	syncGsc,
	trafficReturnTo,
} from "./traffic-core";

const brandInput = z.object({ brandId: z.string().min(1).max(200) });
export const connectGoogleFn = createServerFn({ method: "POST" })
	.validator(brandInput.extend({ destination: z.enum(["brand", "traffic"]).optional() }))
	.handler(async ({ data }) => {
		const session = await requireBrandSession(data.brandId);
		const result = await beginGoogleOAuth({
			brandId: data.brandId,
			userId: session.user.id,
			sessionId: session.session.id,
			returnTo:
				data.destination === "brand"
					? (await trafficReturnTo(data.brandId)).replace(/\/traffic$/, "/settings/brand")
					: await trafficReturnTo(data.brandId),
		});
		setCookie(GOOGLE_COOKIE, result.cookie, {
			httpOnly: true,
			secure: sharedGoogleClient().secure,
			sameSite: "lax",
			path: "/api/traffic/google",
			maxAge: 600,
		});
		return { url: result.url };
	});
export const connectGscFn = createServerFn({ method: "POST" })
	.validator(brandInput)
	.handler(async ({ data }) => {
		const session = await requireBrandSession(data.brandId);
		const result = await beginGscOAuth({
			brandId: data.brandId,
			userId: session.user.id,
			sessionId: session.session.id,
			returnTo: await trafficReturnTo(data.brandId),
		});
		setCookie(GSC_COOKIE, result.cookie, {
			httpOnly: true,
			secure: gscClient().secure,
			sameSite: "lax",
			path: "/api/traffic/gsc",
			maxAge: 600,
		});
		return { url: result.url };
	});
export const getGscPropertiesFn = createServerFn({ method: "GET" })
	.validator(brandInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return gscProperties(data.brandId);
	});
export const syncGscFn = createServerFn({ method: "POST" })
	.validator(brandInput.extend({ property: z.string().min(1).max(2048).optional() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return syncGsc(data.brandId, data.property);
	});
export const disconnectGscFn = createServerFn({ method: "POST" })
	.validator(brandInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await disconnectGsc(data.brandId);
		return { disconnected: true };
	});
export const getTrafficFn = createServerFn({ method: "GET" })
	.validator(brandInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return readTraffic(data.brandId);
	});
export const connectGaFn = createServerFn({ method: "POST" })
	.validator(brandInput)
	.handler(async ({ data }) => {
		const session = await requireBrandSession(data.brandId);
		const result = await beginGaOAuth({
			brandId: data.brandId,
			userId: session.user.id,
			sessionId: session.session.id,
			returnTo: await trafficReturnTo(data.brandId),
		});
		setCookie(GA_COOKIE, result.cookie, {
			httpOnly: true,
			secure: gaClient().secure,
			sameSite: "lax",
			path: "/api/traffic/ga",
			maxAge: 600,
		});
		return { url: result.url };
	});
export const getGaPropertiesFn = createServerFn({ method: "GET" })
	.validator(brandInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return gaProperties(data.brandId);
	});
export const syncGaFn = createServerFn({ method: "POST" })
	.validator(
		brandInput.extend({
			propertyId: z
				.string()
				.regex(/^[1-9]\d*$/)
				.optional(),
			site: z.string().max(253).optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return syncGa(data.brandId, data.propertyId, data.site);
	});
export const disconnectGaFn = createServerFn({ method: "POST" })
	.validator(brandInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await disconnectGa(data.brandId);
		return { disconnected: true };
	});
export const importCrawlsFn = createServerFn({ method: "POST" })
	.validator(
		brandInput.extend({
			content: z.string().max(10 * 1024 * 1024),
			format: z.enum(["auto", "combined", "json", "jsonl"]),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return importCrawlTraffic(data.brandId, data.content, data.format);
	});
