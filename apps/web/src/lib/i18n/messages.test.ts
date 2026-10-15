import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCALE_KEY, loadLocale, parseLocale, saveLocale, translate } from "./messages";

afterEach(() => vi.unstubAllGlobals());

describe("interface language", () => {
	it("keeps English as the default on the server and for unknown preferences", () => {
		vi.stubGlobal("window", undefined);
		expect(loadLocale()).toBe("en");
		expect(parseLocale("ja")).toBe("en");
		expect(translate("en", "Save")).toBe("Save");
	});
	it("saves and restores a Chinese choice without changing other preferences", () => {
		const storage = new Map<string, string>([["unrelated", "keep"]]);
		vi.stubGlobal("window", {
			localStorage: {
				getItem: (key: string) => storage.get(key) ?? null,
				setItem: (key: string, value: string) => storage.set(key, value),
			},
		});
		saveLocale("zh");
		expect(loadLocale()).toBe("zh");
		expect(storage.get(LOCALE_KEY)).toBe("zh");
		expect(storage.get("unrelated")).toBe("keep");
	});
	it("still translates when browser storage is blocked", () => {
		vi.stubGlobal("window", {
			get localStorage() {
				throw new Error("Storage blocked");
			},
		});
		expect(() => saveLocale("zh")).not.toThrow();
		expect(loadLocale()).toBe("en");
		expect(translate("zh", "Save")).toBe("保存");
	});
	it("keeps dynamic names and unknown messages intact", () => {
		expect(translate("zh", "Set up {brand}", { brand: "Overview <test> {count}" })).toBe(
			"设置 Overview <test> {count}",
		);
		expect(translate("zh", "Provider-specific error 123")).toBe("Provider-specific error 123");
		expect(translate("zh", "constructor")).toBe("constructor");
		expect(translate("zh", "Generate {count} starter questions", { count: 12 })).toBe("生成 12 个初始问题");
	});
});
