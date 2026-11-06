/** Offline read fixtures keep database and provider implementations outside Storybook. */
const noWrite = async (..._args: unknown[]): Promise<never> => {
	throw new Error("This Storybook fixture is read-only. No operation or provider call was made.");
};

export const getAnalysisFn = async (..._args: unknown[]) => ({
	schema: "beat-geo/analysis-context@1",
	brandId: "mock-brand-id",
	sources: [],
	missing: ["gsc", "ga", "seo"],
	diagnosis: { schema: "beat-geo/search-diagnosis@1", evidenceIds: [], findings: [], warnings: [] },
	nextAction: "",
});
export const getAnalysisReadinessFn = async (..._args: unknown[]) => ({
	sources: ["gsc", "ga"].map((kind) => ({ kind, status: "disconnected", canRefresh: false, observedAt: null })),
	seo: { status: "no_saved_result", canRefresh: false },
	lastRefresh: null,
});
export const getAnalysisHistoryFn = async (..._args: unknown[]) => ({ items: [], nextOffset: null });
export const readAnalysisRowsFn = async (..._args: unknown[]) => ({
	id: "offline",
	kind: "gsc",
	capturedAt: "2026-11-01T00:00:00Z",
	dataset: "current.queryPages",
	summary: {},
	coverage: "{}",
	rows: "[]",
	totalStoredRows: 0,
	nextOffset: null,
	note: "Synthetic offline fixture",
});
export const getMonitoringFn = async (..._args: unknown[]) => ({
	questions: [],
	attempts: [],
	actions: [],
	runtime: { worker: "offline" },
});
export const getWorkspaceControlFn = async (..._args: unknown[]) => ({
	brand: { enabled: false, delayOverrideHours: 24, updatedAt: "2026-11-01T00:00:00Z" },
	history: [],
});
export const getEvidenceSummaryFn = async (..._args: unknown[]) => ({ groups: [], truncated: false });
export const getSiteAuditFn = async (..._args: unknown[]) => null;

export const refreshAnalysisFn = noWrite;
export const analysisCommandFn = noWrite;
export const createOptimizationActionFn = noWrite;
export const applyOptimizationActionFn = noWrite;
export const retestOptimizationActionFn = noWrite;
export const collectOneQuestionFn = noWrite;
export const saveContentDraftFn = noWrite;
export const reviewContentDraftFn = noWrite;
export const createContentDraftFn = noWrite;
export const applyWorkspaceOperationFn = noWrite;
export const runSiteAuditFn = noWrite;
