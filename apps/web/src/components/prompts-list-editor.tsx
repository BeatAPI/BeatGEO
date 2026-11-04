import { useT } from "@/lib/i18n";
/**
 * Shared prompts table — used by the settings/prompts page (manages a brand's
 * full prompt list) and the prompt wizard's Review step (picks from
 * AI-suggested prompts + custom additions).
 *
 * Controlled component: the caller owns the `prompts` array and the change
 * callback. The settings page wraps it with save/server logic; the wizard
 * keeps it inline. The `showSystemTags` prop hides the System Tags column
 * in the wizard since onboarding hasn't yet computed any system tags.
 */

import { IconInfoCircle } from "@tabler/icons-react";
import { parseBulkPrompts } from "@workspace/lib/bulk-prompts";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Switch } from "@workspace/ui/components/switch";
import { Textarea } from "@workspace/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { Inbox, ListPlus, Plus, Sparkles, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { TagsInput } from "@/components/tags-input";

export interface EditablePrompt {
	id?: string;
	_key: string;
	value: string;
	enabled: boolean;
	tags: string[];
	systemTags: string[];
	suggested?: boolean;
}

export function newPromptEntry(partial?: Partial<EditablePrompt>): EditablePrompt {
	return {
		_key: uuidv4(),
		value: partial?.value ?? "",
		enabled: partial?.enabled ?? true,
		tags: partial?.tags ?? [],
		systemTags: partial?.systemTags ?? [],
		...(partial?.id ? { id: partial.id } : {}),
		...(partial?.suggested ? { suggested: true } : {}),
	};
}

/**
 * Every column layout the table can take, spelled out rather than assembled at
 * runtime: Tailwind only generates class names that appear literally in source.
 */
const GRID_COLS = {
	system: "md:grid-cols-[2.25rem_minmax(0,1fr)_6rem_minmax(14rem,1fr)_2.75rem]",
	plain: "md:grid-cols-[2.25rem_minmax(0,1fr)_minmax(14rem,1fr)_2.75rem]",
};

interface PromptsListEditorProps {
	prompts: EditablePrompt[];
	onChange: (next: EditablePrompt[]) => void;
	/** Show the read-only System Tags column. Default true. */
	showSystemTags?: boolean;
	/** `_key`s of rows edited since the last save, flagged with an accent rail
	 *  so a change is findable in a list of up to {@link MAX_PROMPTS} rows. */
	changedKeys?: ReadonlySet<string>;
	leading?: ReactNode;
	pendingRows?: number;
}

/**
 * The bulk-paste box's state. The parse is pure and lives in @workspace/lib so
 * the rules (trim, dedupe, cap) are tested without a DOM; it runs on every
 * keystroke only to label the button and warn about what will be dropped.
 */
function useBulkPaste(filledValues: string[], onAdd: (values: string[]) => void) {
	const t = useT();
	const [bulkOpen, setBulkOpen] = useState(false);
	const [bulkText, setBulkText] = useState("");

	const bulkPreview = useMemo(
		() => parseBulkPrompts(bulkText, { existing: filledValues, limit: MAX_PROMPTS }),
		[bulkText, filledValues],
	);

	// Over capacity blocks the whole paste rather than quietly taking the lines
	// that fit, so nobody submits a list believing all of it landed.
	const overCapacity = bulkPreview.skipped.overCapacity.length;
	const closeBulk = () => {
		setBulkOpen(false);
		setBulkText("");
	};

	return {
		bulkOpen,
		setBulkOpen,
		bulkText,
		setBulkText,
		bulkPreview,
		bulkNotice:
			bulkText.trim().length > 0 &&
			(bulkPreview.skipped.blank > 0 ||
				bulkPreview.skipped.duplicateOfExisting.length + bulkPreview.skipped.duplicateInPaste.length > 0)
				? t("Skipped duplicate lines: {duplicates}; blank lines: {blank}.", {
						duplicates: bulkPreview.skipped.duplicateOfExisting.length + bulkPreview.skipped.duplicateInPaste.length,
						blank: bulkPreview.skipped.blank,
					})
				: null,
		bulkError:
			overCapacity > 0
				? t("This paste exceeds the {limit} question limit by {count}. Remove lines to continue.", {
						limit: MAX_PROMPTS,
						count: overCapacity,
					})
				: null,
		closeBulk,
		addBulk: () => {
			if (bulkPreview.added.length === 0 || overCapacity > 0) return;
			onAdd(bulkPreview.added);
			closeBulk();
		},
	};
}

/**
 * Which rows are ticked. Counted against the current prompts so stale keys
 * (e.g. after the wizard regenerates suggestions) don't linger in the tally.
 */
function useRowSelection(prompts: EditablePrompt[]) {
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
	const liveSelectedCount = prompts.reduce((count, p) => (selectedKeys.has(p._key) ? count + 1 : count), 0);
	const allSelected = prompts.length > 0 && liveSelectedCount === prompts.length;

	return {
		selectedKeys,
		liveSelectedCount,
		allSelected,
		toggleSelect: (key: string) =>
			setSelectedKeys((prev) => {
				const next = new Set(prev);
				if (next.has(key)) next.delete(key);
				else next.add(key);
				return next;
			}),
		toggleSelectAll: () => setSelectedKeys(allSelected ? new Set() : new Set(prompts.map((p) => p._key))),
		clearSelection: () => setSelectedKeys(new Set()),
	};
}

function ColumnHeader({
	gridCols,
	showSystemTags,
	allSelected,
	onToggleSelectAll,
	disabled,
}: {
	gridCols: string;
	showSystemTags: boolean;
	allSelected: boolean;
	onToggleSelectAll: () => void;
	disabled: boolean;
}) {
	const t = useT();
	return (
		<div className={`hidden md:grid ${gridCols} gap-2 text-sm font-medium text-muted-foreground border-b pb-2`}>
			<div className="flex justify-center">
				<Checkbox
					checked={allSelected}
					onCheckedChange={onToggleSelectAll}
					disabled={disabled}
					aria-label={allSelected ? t("Deselect all questions") : t("Select all questions")}
				/>
			</div>
			<div className="flex items-center gap-1 min-w-0">
				{t("Question Text")}
				<Tooltip>
					<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
					<TooltipContent>
						<p className="max-w-xs">{t("The question or query that will be sent to AI models for evaluation.")}</p>
					</TooltipContent>
				</Tooltip>
			</div>
			{showSystemTags && (
				<div className="hidden md:flex items-center gap-1">
					{t("System")}
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent>
							<p className="max-w-xs">
								{t('Auto-generated tags like "branded" or "unbranded" based on prompt content.')}
							</p>
						</TooltipContent>
					</Tooltip>
				</div>
			)}
			<div className="flex items-center gap-1 min-w-0">
				{t("Tags")}
				<Tooltip>
					<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
					<TooltipContent>
						<p className="max-w-xs">{t("Custom labels to organize and filter questions.")}</p>
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="flex justify-center">
				<span className="sr-only">{t("Enabled")}</span>
			</div>
		</div>
	);
}

function PromptTextField({
	prompt,
	onValueChange,
	onRemove,
	className,
}: {
	prompt: EditablePrompt;
	onValueChange: (value: string) => void;
	onRemove: () => void;
	className?: string;
}) {
	const t = useT();
	const removable = !prompt.id;
	return (
		<div className={cn("relative", className)}>
			{prompt.suggested && (
				<Tooltip>
					<TooltipTrigger
						render={
							<span className="absolute inset-y-0 left-2.5 flex items-center text-primary">
								<Sparkles className="size-3.5" aria-label={t("Suggested")} />
							</span>
						}
					/>
					<TooltipContent>{t("Suggested. Save to start tracking it, or remove it.")}</TooltipContent>
				</Tooltip>
			)}
			<Input
				value={prompt.value}
				onChange={(e) => onValueChange(e.target.value)}
				placeholder={t("Enter question text...")}
				className={cn("min-w-0", prompt.suggested && "pl-8", removable && "pr-8")}
			/>
			{removable && (
				<button
					type="button"
					onClick={onRemove}
					aria-label={prompt.value ? t('Remove "{prompt}"', { prompt: prompt.value }) : t("Remove question")}
					className="absolute inset-y-0 right-1.5 my-auto flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					<X className="size-3.5" />
				</button>
			)}
		</div>
	);
}

const PENDING_WIDTHS = ["70%", "52%", "63%", "46%", "58%"];

function PendingRows({ count, gridCols }: { count: number; gridCols: string }) {
	return (
		<>
			{PENDING_WIDTHS.slice(0, count).map((width) => (
				<div key={width} aria-hidden className={`grid grid-cols-1 ${gridCols} gap-2 items-center py-2`}>
					<Skeleton className="hidden md:block mx-auto size-4 rounded-[4px]" />
					<Skeleton className="h-4" style={{ width }} />
				</div>
			))}
		</>
	);
}

function PromptRow({
	prompt,
	index,
	total,
	update,
	remove,
	allTagOptions,
	showSystemTags,
	changedKeys,
	gridCols,
	selected,
	onToggleSelect,
}: {
	prompt: EditablePrompt;
	index: number;
	total: number;
	update: (index: number, patch: Partial<EditablePrompt>) => void;
	remove: (index: number) => void;
	allTagOptions: { value: string }[];
	showSystemTags: boolean;
	changedKeys?: ReadonlySet<string>;
	gridCols: string;
	selected: boolean;
	onToggleSelect: () => void;
}) {
	const t = useT();
	return (
		<div
			className={cn(
				"-ml-3 border-l-2 pl-3 transition-colors",
				changedKeys?.has(prompt._key) ? "border-amber-500" : "border-transparent",
				!prompt.enabled && "opacity-60",
			)}
		>
			{changedKeys?.has(prompt._key) && <span className="sr-only">{t("Has unsaved changes")}</span>}
			{/* Mobile: stacked, no selection/bulk */}
			<div className={`md:hidden flex flex-col gap-2 pb-3 ${index < total - 1 ? "border-b" : ""}`}>
				<div className="flex items-start gap-2">
					<PromptTextField
						prompt={prompt}
						onValueChange={(value) => update(index, { value })}
						onRemove={() => remove(index)}
						className="min-w-0 flex-1"
					/>
					<div className="pt-2">
						<Switch
							checked={prompt.enabled}
							onCheckedChange={(checked) => update(index, { enabled: checked })}
							aria-label={prompt.enabled ? t("Disable question") : t("Enable question")}
						/>
					</div>
				</div>
				<TagsInput
					value={prompt.tags}
					onValueChange={(tags) => update(index, { tags })}
					options={allTagOptions}
					placeholder={t("Add tag...")}
					searchPlaceholder="Search or create tag..."
					normalizeValue={(raw) => raw.toLowerCase().trim()}
				/>
			</div>

			{/* Desktop (md+): single-line grid */}
			<div className={`hidden md:grid ${gridCols} gap-2 items-start`}>
				<div className="flex justify-center pt-2">
					<Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={t("Select question")} />
				</div>
				<PromptTextField
					prompt={prompt}
					onValueChange={(value) => update(index, { value })}
					onRemove={() => remove(index)}
				/>
				{showSystemTags && <TagsInput value={prompt.systemTags} onValueChange={() => {}} disabled placeholder="—" />}
				<TagsInput
					value={prompt.tags}
					onValueChange={(tags) => update(index, { tags })}
					options={allTagOptions}
					placeholder={t("Add tag...")}
					searchPlaceholder="Search or create tag..."
					normalizeValue={(raw) => raw.toLowerCase().trim()}
				/>
				<div className="flex justify-center pt-2">
					<Switch
						checked={prompt.enabled}
						onCheckedChange={(checked) => update(index, { enabled: checked })}
						aria-label={prompt.enabled ? t("Disable question") : t("Enable question")}
					/>
				</div>
			</div>
		</div>
	);
}

function BulkPasteBox({ bulk }: { bulk: ReturnType<typeof useBulkPaste> }) {
	const t = useT();
	return (
		<div className="space-y-2 rounded-md border bg-muted/40 p-3">
			<Textarea
				value={bulk.bulkText}
				onChange={(e) => bulk.setBulkText(e.target.value)}
				placeholder={t("One question per line")}
				rows={6}
				aria-label={t("Questions to add, one per line")}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					type="button"
					onClick={bulk.addBulk}
					disabled={bulk.bulkPreview.added.length === 0 || bulk.bulkError !== null}
				>
					{bulk.bulkPreview.added.length > 0
						? t(bulk.bulkPreview.added.length === 1 ? "Add {count} question" : "Add {count} questions", {
								count: bulk.bulkPreview.added.length,
							})
						: t("Add Question")}
				</Button>
				<Button variant="ghost" size="sm" type="button" onClick={bulk.closeBulk}>
					{t("Cancel")}
				</Button>
				{bulk.bulkNotice && <span className="text-xs text-muted-foreground">{bulk.bulkNotice}</span>}
			</div>
			{bulk.bulkError && (
				<p role="alert" className="text-xs text-destructive">
					{bulk.bulkError}
				</p>
			)}
		</div>
	);
}

export function PromptsListEditor({
	prompts,
	onChange,
	showSystemTags = true,
	changedKeys,
	leading,
	pendingRows = 0,
}: PromptsListEditorProps) {
	const t = useT();
	const allTagOptions = useMemo(() => {
		const set = new Set<string>();
		for (const p of prompts) for (const t of p.tags) set.add(t);
		return [...set].sort().map((t) => ({ value: t }));
	}, [prompts]);

	const update = (index: number, patch: Partial<EditablePrompt>) => {
		onChange(prompts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
	};
	const remove = (index: number) => onChange(prompts.filter((_, i) => i !== index));
	const add = () => {
		if (prompts.length >= MAX_PROMPTS) return;
		onChange([...prompts, newPromptEntry()]);
	};

	// A row only takes a slot once it has text. Blank rows are how this editor
	// stages a new prompt and they're dropped on save, so counting them against
	// the cap would refuse prompts the list still has room for.
	const filledValues = useMemo(() => prompts.map((p) => p.value).filter((v) => v.trim().length > 0), [prompts]);
	const atCapacity = filledValues.length >= MAX_PROMPTS;

	const bulk = useBulkPaste(filledValues, (added) =>
		onChange([...prompts, ...added.map((value) => newPromptEntry({ value }))]),
	);

	const { selectedKeys, liveSelectedCount, allSelected, toggleSelect, toggleSelectAll, clearSelection } =
		useRowSelection(prompts);

	const applyEnabledToSelection = (enabled: boolean) => {
		if (liveSelectedCount === 0) return;
		onChange(prompts.map((p) => (selectedKeys.has(p._key) ? { ...p, enabled } : p)));
	};

	const validCount = prompts.filter((p) => p.enabled && p.value.trim().length > 0).length;

	// Desktop layout only — column order is [select] [text] [system?] [tags]
	// [switch]. Mobile renders a stacked per-prompt block instead (no selection,
	// no bulk).
	const gridCols = GRID_COLS[showSystemTags ? "system" : "plain"];

	return (
		<div className="space-y-4">
			{liveSelectedCount > 0 && (
				<div className="hidden md:flex flex-wrap items-center justify-between gap-x-2 gap-y-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
					<span className="text-muted-foreground">
						<strong className="text-foreground">{liveSelectedCount}</strong>
						{t(" selected")}
					</span>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => applyEnabledToSelection(true)}
							className="cursor-pointer"
						>
							{t("Enable")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => applyEnabledToSelection(false)}
							className="cursor-pointer"
						>
							{t("Disable")}
						</Button>
						<Button type="button" size="sm" variant="ghost" onClick={clearSelection} className="cursor-pointer">
							{t("Clear")}
						</Button>
					</div>
				</div>
			)}

			<ColumnHeader
				gridCols={gridCols}
				showSystemTags={showSystemTags}
				allSelected={allSelected}
				onToggleSelectAll={toggleSelectAll}
				disabled={prompts.length === 0}
			/>

			{leading}

			{pendingRows > 0 && <PendingRows count={pendingRows} gridCols={gridCols} />}

			{prompts.length === 0 && pendingRows === 0 ? (
				<div className="border-2 border-dashed border-muted rounded-lg min-h-48 flex items-center justify-center">
					<div className="text-center py-8 text-muted-foreground">
						<Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p>{t("No questions yet.")}</p>
					</div>
				</div>
			) : (
				<div className="space-y-3">
					{prompts.map((prompt, index) => (
						<PromptRow
							key={prompt._key}
							prompt={prompt}
							index={index}
							total={prompts.length}
							update={update}
							remove={remove}
							allTagOptions={allTagOptions}
							showSystemTags={showSystemTags}
							changedKeys={changedKeys}
							gridCols={gridCols}
							selected={selectedKeys.has(prompt._key)}
							onToggleSelect={() => toggleSelect(prompt._key)}
						/>
					))}
				</div>
			)}

			{!atCapacity && (
				<div className="flex flex-wrap items-center gap-2">
					{prompts.length < MAX_PROMPTS && (
						<Button
							variant="outline"
							size="sm"
							type="button"
							onClick={add}
							className="flex items-center gap-2 cursor-pointer"
						>
							<Plus className="h-4 w-4" />
							{t(" Add Question")}
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						type="button"
						onClick={() => bulk.setBulkOpen((open) => !open)}
						className="flex items-center gap-2 cursor-pointer"
					>
						<ListPlus className="h-4 w-4" />
						{t(" Add Multiple")}
					</Button>
				</div>
			)}

			{bulk.bulkOpen && !atCapacity && <BulkPasteBox bulk={bulk} />}

			{atCapacity && (
				<p className="text-xs text-muted-foreground">
					{t("Maximum of ")}
					{MAX_PROMPTS}
					{t(" questions allowed. Remove a question to add a new one.")}
				</p>
			)}

			<p className="text-xs text-muted-foreground">
				<strong>
					{validCount}/{MAX_PROMPTS}
				</strong>{" "}
				{t("questions configured")}
			</p>
		</div>
	);
}
