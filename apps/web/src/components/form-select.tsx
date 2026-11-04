import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";

type Option<T extends string> = { value: T; label: string; disabled?: boolean };

/** Shared presentation for website, connection and onboarding choices. */
export function FormSelect<T extends string>({
	id,
	value,
	onValueChange,
	options,
	placeholder,
	disabled,
	className,
	"aria-label": ariaLabel,
}: {
	id?: string;
	value: T;
	onValueChange: (value: T) => void;
	options: Option<T>[];
	placeholder?: string;
	disabled?: boolean;
	className?: string;
	"aria-label"?: string;
}) {
	const selected = options.find((option) => option.value === value);
	return (
		<Select
			value={value}
			onValueChange={(next) => next !== null && onValueChange(next)}
			items={options}
			disabled={disabled}
		>
			<SelectTrigger id={id} aria-label={ariaLabel} className={cn("w-full min-w-0", className)}>
				<SelectValue className="min-w-0 truncate text-left" placeholder={placeholder}>
					{selected?.label ?? (value || placeholder)}
				</SelectValue>
			</SelectTrigger>
			<SelectContent align="start" className="w-(--anchor-width) max-w-[calc(100vw-2rem)]">
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value} disabled={option.disabled}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
