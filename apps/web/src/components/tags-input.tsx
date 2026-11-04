import { TagsInput as BaseTagsInput, type TagsInputProps } from "@workspace/ui/components/tags-input";
import { useT } from "@/lib/i18n";

export function TagsInput({
	placeholder = "Select...",
	searchPlaceholder = "Search...",
	emptyText = "No results.",
	...props
}: TagsInputProps) {
	const t = useT();
	return (
		<BaseTagsInput
			{...props}
			placeholder={t(placeholder)}
			searchPlaceholder={t(searchPlaceholder)}
			emptyText={t(emptyText)}
			addLabel={t("Add")}
			maximumLabel={t("Maximum reached")}
			inputHint={t("Type or paste to add a value")}
			removeLabel={(value) => t("Remove {value}", { value })}
		/>
	);
}
