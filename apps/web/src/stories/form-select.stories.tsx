import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { FormSelect } from "@/components/form-select";
import { LanguageSwitch } from "@/components/language-switch";
import { QuestionBankPicker } from "@/components/question-bank-picker";
import { LocaleProvider, useT } from "@/lib/i18n";

const meta = { title: "Components/Workspace Select", component: FormSelect } satisfies Meta<typeof FormSelect>;
export default meta;

function Choices() {
	const t = useT();
	const [value, setValue] = useState("");
	return (
		<div className="w-72 space-y-3">
			<label htmlFor="property">{t("Search Console property")}</label>
			<FormSelect
				id="property"
				value={value}
				onValueChange={setValue}
				placeholder={t("Choose a Search Console property")}
				options={[
					{ value: "", label: t("No research model — SEO only") },
					...Array.from({ length: 24 }, (_, i) => ({
						value: `site-${i}`,
						label: `sc-domain:website-${i}.example`,
						disabled: i === 1,
					})),
				]}
			/>
			<FormSelect
				aria-label="Unavailable"
				disabled
				value=""
				onValueChange={setValue}
				options={[]}
				placeholder="Unavailable"
			/>
			<output data-testid="selection">{value}</output>
		</div>
	);
}
export const KeyboardAndLocale: StoryObj = {
	render: () => (
		<LocaleProvider>
			<LanguageSwitch />
			<Choices />
		</LocaleProvider>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "EN", exact: true }));
		const trigger = canvas.getByRole("combobox", { name: "Search Console property" });
		await userEvent.click(trigger);
		await expect(screen.getByRole("option", { name: "sc-domain:website-1.example", exact: true })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await waitFor(() => expect(screen.getByRole("option", { name: "No research model — SEO only" })).toHaveFocus());
		await userEvent.keyboard("{End}{Enter}");
		await expect(canvas.getByTestId("selection")).toHaveTextContent("site-23");
		await waitFor(() => expect(trigger).toHaveFocus());
		await userEvent.click(canvas.getByRole("button", { name: "中文", exact: true }));
		const translated = canvas.getByRole("combobox", { name: "Search Console 资源" });
		await expect(translated).toHaveTextContent("sc-domain:website-23.example");
		await userEvent.click(translated);
		await waitFor(() =>
			expect(screen.getByRole("option", { name: "sc-domain:website-23.example", exact: true })).toHaveFocus(),
		);
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(translated).toHaveFocus());
		await userEvent.keyboard("{ArrowDown}");
		await userEvent.click(await screen.findByRole("option", { name: "暂不选择研究模型，仅使用 SEO" }));
		await expect(canvas.getByTestId("selection")).toBeEmptyDOMElement();
		await expect(canvas.getByRole("combobox", { name: "Unavailable" })).toBeDisabled();
	},
};
export const QuestionLanguage: StoryObj = {
	render: () => (
		<LocaleProvider>
			<LanguageSwitch />
			<QuestionBankPicker brandName="Example" researchUnavailable onUse={() => {}} />
		</LocaleProvider>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "中文", exact: true }));
		await userEvent.click(canvas.getByRole("combobox", { name: "问题语言" }));
		await userEvent.click(screen.getByRole("option", { name: "英语", exact: true }));
		await waitFor(() => expect(canvas.getByRole("combobox", { name: "问题语言" })).toHaveFocus());
		await userEvent.click(canvas.getByRole("button", { name: "EN", exact: true }));
		await expect(canvas.getByRole("combobox", { name: "Question language" })).toHaveTextContent("English");
		await userEvent.click(canvas.getByRole("combobox", { name: "Business category" }));
		await userEvent.click(await screen.findByRole("option", { name: "Other business", exact: true }));
		await expect(canvas.getByLabelText("Target customers")).toBeVisible();
	},
};
