// Pure helpers for the Docker image tags + version header that beatgeo writes into
// the generated compose / env files. Kept side-effect-free (no fs) so the
// upgrade re-pin path stays unit-testable; index.ts wraps these with file I/O.

export function renderedByHeader(version: string): string {
	return [
		`# Rendered by beatgeo ${version} on ${new Date().toISOString()}`,
		"# Run `beatgeo upgrade` after upgrading the CLI to refresh this file.",
	].join("\n");
}

// Reads the version recorded in a `# Rendered by beatgeo <version> on ...` header,
// or null when the file has no such header (e.g. a legacy, pre-header install).
export function parseRenderedVersion(contents: string): string | null {
	const match = contents.match(/^# Rendered by beatgeo (\S+) on /m);
	return match ? match[1] : null;
}

// Refreshes the `# Rendered by beatgeo <version> on ...` header, adding one at the
// top if the file doesn't have it yet (e.g. a legacy install rendered before
// the header existed) so future `beatgeo upgrade` runs can detect the version.
export function refreshHeaderVersion(contents: string, version: string): string {
	if (!/^# Rendered by beatgeo \S+ on /m.test(contents)) {
		return `${renderedByHeader(version)}\n${contents}`;
	}
	return contents.replace(
		/^# Rendered by beatgeo \S+ on .*$/m,
		`# Rendered by beatgeo ${version} on ${new Date().toISOString()}`,
	);
}

// Re-pins `beatapi/beat-geo-*:<tag>` image tags to `version`, leaving third-party
// images untouched. Postgres especially: a major bump needs the cluster dumped
// and restored, so rolling the tag here would break a deployment rather than
// upgrade it.
export function repinImages(contents: string, version: string): string {
	return contents.replace(/(image:\s*beatapi\/beat-geo-[a-z-]+):\S+/g, `$1:${version}`);
}
