import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocale, useT } from "@/lib/i18n";
import { createContentDraftFn, reviewContentDraftFn, saveContentDraftFn } from "@/server/content-draft-fn";

type DraftAction = {
	id: string;
	contentDraft: string | null;
	draftRevision: number;
	reviewedRevision: number | null;
	status: string;
};
const button = "rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50";
function isReviewed(action: DraftAction) {
	return Boolean(action.contentDraft) && action.draftRevision === action.reviewedRevision;
}
function draftText(edit: { content: string } | null, action: DraftAction) {
	return edit?.content ?? action.contentDraft ?? "";
}
export function ContentDraft({ brandId, action }: { brandId: string; action: DraftAction }) {
	const t = useT();
	const { locale } = useLocale();
	const client = useQueryClient();
	const [edit, setEdit] = useState<{ content: string; revision: number } | null>(null);
	const [notice, setNotice] = useState("");
	const content = draftText(edit, action);
	const dirty = edit !== null && edit.content !== action.contentDraft;
	const reviewed = isReviewed(action);
	const mutation = useMutation({
		mutationFn: async (operation: "outline" | "ai" | "save" | "review") => {
			setNotice("");
			const data = { brandId, id: action.id, revision: edit?.revision ?? action.draftRevision };
			if (operation === "save") return saveContentDraftFn({ data: { ...data, content } });
			if (operation === "review") return reviewContentDraftFn({ data });
			return createContentDraftFn({ data: { ...data, language: locale, useAi: operation === "ai" } });
		},
		onSuccess: async () => {
			setEdit(null);
			await client.invalidateQueries({ queryKey: ["monitoring", brandId] });
		},
	});
	const readOnly = action.status !== "planned";
	return (
		<details className="py-2">
			<summary className="cursor-pointer text-sm font-medium">
				{t("Content draft")} · {t(reviewed ? "Reviewed" : "Needs review")}
			</summary>
			<div className="mt-3 space-y-3">
				<p className="text-xs text-muted-foreground">
					{t(
						"Drafts stay here until you publish them yourself. Review facts and references before marking an improvement implemented.",
					)}
				</p>
				{!readOnly && (
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className={button}
							disabled={mutation.isPending || Boolean(action.contentDraft) || dirty}
							onClick={() => mutation.mutate("outline")}
						>
							{t("Create outline · free")}
						</button>
						<button
							type="button"
							className={button}
							disabled={mutation.isPending || Boolean(action.contentDraft) || dirty}
							onClick={() => mutation.mutate("ai")}
						>
							{t("Generate draft · uses API")}
						</button>
					</div>
				)}
				{content && (
					<>
						<textarea
							aria-label={t("Content draft")}
							className="min-h-64 w-full rounded-md border bg-card p-4 text-sm leading-7"
							maxLength={24_000}
							value={content}
							readOnly={readOnly || mutation.isPending}
							onChange={(event) =>
								setEdit({ content: event.target.value, revision: edit?.revision ?? action.draftRevision })
							}
						/>
						<div className="flex flex-wrap gap-2">
							{!readOnly && (
								<>
									<button
										type="button"
										className={button}
										disabled={!dirty || !content.trim() || mutation.isPending}
										onClick={() => mutation.mutate("save")}
									>
										{t("Save draft")}
									</button>
									<button
										type="button"
										className={button}
										disabled={dirty || Boolean(reviewed) || mutation.isPending}
										onClick={() => mutation.mutate("review")}
									>
										{t("Approve draft")}
									</button>
								</>
							)}
							<button
								type="button"
								className={button}
								disabled={dirty || !reviewed}
								onClick={async () => {
									try {
										await navigator.clipboard.writeText(content);
										setNotice("Draft copied.");
									} catch {
										setNotice("Select the draft and copy it manually.");
									}
								}}
							>
								{t("Copy Markdown")}
							</button>
						</div>
					</>
				)}
				{dirty && <p className="text-xs">{t("Unsaved changes. Saving clears the previous approval.")}</p>}
				{mutation.isPending && (
					<p role="status" className="text-sm">
						{t("Preparing draft…")}
					</p>
				)}
				{mutation.error && <p role="alert">{t(mutation.error.message)}</p>}
				{notice && <p role="status">{t(notice)}</p>}
			</div>
		</details>
	);
}
