import type { Meta, StoryObj } from "@storybook/react";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { LanguageSwitch } from "@/components/language-switch";
import { type EditablePrompt, newPromptEntry, PromptsListEditor } from "@/components/prompts-list-editor";
import { LocaleProvider } from "@/lib/i18n";

const meta = {
	title: "Components/PromptsListEditor",
} satisfies Meta;

export default meta;

/** The table layout is `hidden md:grid` — widen the canvas past 768px to see it. */
function Harness({ initial, showSystemTags = true }: { initial: EditablePrompt[]; showSystemTags?: boolean }) {
	const [prompts, setPrompts] = useState(initial);

	return (
		<div className="p-8">
			<PromptsListEditor prompts={prompts} onChange={setPrompts} showSystemTags={showSystemTags} />
		</div>
	);
}

const entries = (values: string[], partial?: Partial<EditablePrompt>) =>
	values.map((value) => newPromptEntry({ value, ...partial }));

const filler = (count: number) => entries(Array.from({ length: count }, (_, i) => `best running shoes option ${i}`));

/** Opens the bulk panel and pastes `text` into it. */
const addMultiple =
	(text: string) =>
	async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: /add multiple/i }));
		await userEvent.click(canvas.getByLabelText("Questions to add, one per line"));
		await userEvent.paste(text);
	};

export const Populated = () => (
	<Harness
		initial={[
			...entries(["best running shoes for flat feet"], { tags: ["footwear"], systemTags: ["unbranded"] }),
			...entries(["is nike better than adidas"], { tags: ["comparison"], systemTags: ["branded"] }),
			...entries(["most durable trail runners"], { enabled: false, systemTags: ["unbranded"] }),
		]}
	/>
);

/**
 * A paste into a non-empty list carrying every skip reason at once: two blank
 * lines, a repeat of an existing prompt (differing only in case and spacing),
 * and a line repeated within the paste. Two survive, and the notice accounts
 * for all four dropped lines.
 */
export const AddMultiple: StoryObj = {
	render: () => <Harness initial={entries(["best running shoes for flat feet", "most durable trail runners"])} />,
	play: async (ctx) => {
		await addMultiple(
			"trail shoes for wide feet\n\nBest  Running   Shoes For Flat Feet\n   \nbest marathon racing flats\ntrail shoes for wide feet",
		)(ctx);
		const canvas = within(ctx.canvasElement);
		await expect(canvas.getByRole("button", { name: /^add 2 questions$/i })).toBeEnabled();
		await expect(canvas.getByText("Skipped duplicate lines: 2; blank lines: 2.")).toBeVisible();
	},
};

/**
 * 95 filled prompts plus 5 blank rows, so there is room for exactly 5 more —
 * blank rows fill the table but don't hold prompt slots. Pasting 6 lines puts
 * the paste over the limit, which blocks it outright rather than taking the 5
 * that fit.
 */
export const AddMultipleOverCapacity: StoryObj = {
	render: () => (
		<Harness showSystemTags={false} initial={[...filler(MAX_PROMPTS - 5), ...entries(["", "", "", "", ""])]} />
	),
	play: async (ctx) => {
		await addMultiple(
			"trail shoes for wide feet\nbest marathon racing flats\nlightweight gym trainers\nbest shoes for plantar fasciitis\ncushioned recovery runners\nzero drop road shoes",
		)(ctx);
		const canvas = within(ctx.canvasElement);
		await expect(canvas.getByRole("button", { name: /^add 5 questions$/i })).toBeDisabled();
		await expect(canvas.getByRole("alert")).toHaveTextContent(
			`This paste exceeds the ${MAX_PROMPTS} question limit by 1. Remove lines to continue.`,
		);
	},
};

export const RemoveUnsavedRow: StoryObj = {
	render: () => (
		<Harness
			initial={[
				...entries(["best running shoes for flat feet"], { id: "saved-1" }),
				...entries(["trail shoes for wide feet"], { suggested: true }),
			]}
		/>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryAllByRole("button", { name: 'Remove "best running shoes for flat feet"' })).toHaveLength(
			0,
		);
		await userEvent.click(canvas.getAllByRole("button", { name: 'Remove "trail shoes for wide feet"' })[0]!);
		await expect(canvas.queryAllByDisplayValue("trail shoes for wide feet")).toHaveLength(0);
	},
};

/** At the cap: both toolbar buttons are hidden and the limit message shows. */
export const AtCapacity = () => <Harness showSystemTags={false} initial={filler(MAX_PROMPTS)} />;

export const BilingualBulkFeedback: StoryObj = {
	render: () => (
		<LocaleProvider>
			<LanguageSwitch />
			<Harness initial={entries(["Existing question"])} />
		</LocaleProvider>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "EN", exact: true }));
		await userEvent.click(canvas.getByRole("button", { name: "Add Multiple" }));
		const input = canvas.getByLabelText("Questions to add, one per line");
		await userEvent.type(input, "New question\nNew question");
		await expect(canvas.getByText("Skipped duplicate lines: 1; blank lines: 0.")).toBeVisible();
		await userEvent.click(canvas.getByRole("button", { name: "中文", exact: true }));
		await expect(canvas.getByText("已跳过 1 行重复内容和 0 行空白内容。")).toBeVisible();
		await expect(canvas.getByRole("button", { name: "添加 1 个问题" })).toBeEnabled();
		await expect(canvas.getByLabelText("要添加的问题，每行一个")).toHaveValue("New question\nNew question");
		await userEvent.click(canvas.getByRole("button", { name: "EN", exact: true }));
		await expect(canvas.getByRole("button", { name: "Add 1 question", exact: true })).toBeEnabled();
	},
};
