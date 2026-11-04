export function gscPropertyLabel(property: string): string {
	return property.startsWith("sc-domain:") ? property.slice("sc-domain:".length) : property;
}
