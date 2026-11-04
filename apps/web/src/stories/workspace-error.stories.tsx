import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { AppShell } from "@/components/app-shell";
import { LanguageSwitch } from "@/components/language-switch";
import { LocaleProvider, useT } from "@/lib/i18n";
import { saveLocale, storedLocale } from "@/lib/i18n/messages";
import { DefaultErrorComponent } from "@/router-default-components";

const meta = { title: "Pages/Workspace Recovery" } satisfies Meta;
export default meta;
export const InlineRecovery: StoryObj = {
	render: () => (
		<LocaleProvider>
			<AppShell sidebar={<aside>BeatGEO</aside>} header={<LanguageSwitch />}>
				<DefaultErrorComponent error={new Error("Fixture load failure")} reset={() => {}} />
			</AppShell>
		</LocaleProvider>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getAllByRole("button", { name: "中文", exact: true })).toHaveLength(1);
		await userEvent.click(canvas.getByRole("button", { name: "中文", exact: true }));
		await expect(canvas.getByRole("heading", { name: "页面暂时无法加载" })).toBeVisible();
		await expect(canvas.getByRole("button", { name: "重新加载" })).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "EN", exact: true }));
		await expect(canvas.getByRole("heading", { name: "This page couldn't load" })).toBeVisible();
		await expect(canvas.getByRole("button", { name: "Reload page" })).toBeVisible();
	},
};

function RestoredHeading() {
	const t = useT();
	return <h1>{t("Overview")}</h1>;
}
export const ServerLanguageOnFirstPaint: StoryObj = {
	beforeEach: () => {
		const previous = storedLocale();
		saveLocale("zh");
		return () => saveLocale(previous ?? "en");
	},
	render: () => (
		<LocaleProvider initialLocale="zh">
			<AppShell sidebar={<aside>BeatGEO</aside>} header={<LanguageSwitch />}>
				<RestoredHeading />
			</AppShell>
		</LocaleProvider>
	),
	play: async ({ canvasElement }) => {
		const c = within(canvasElement);
		await expect(c.getByRole("heading", { name: "概览" })).toBeVisible();
		await expect(c.queryByText("Overview", { exact: true })).toBeNull();
	},
};
