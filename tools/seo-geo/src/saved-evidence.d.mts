export function readSavedSeoEvidence(dataDir: string, runId?: string): Promise<{ runId: string; snapshot: Record<string, unknown> } | null>;
