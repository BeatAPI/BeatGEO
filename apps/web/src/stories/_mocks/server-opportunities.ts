/**
 * Mock for @/server/opportunities-fn used in Storybook. The real pipeline behind
 * it reads saved reports; only its explicit generate operation builds a digest
 * and calls a model. Both server implementations stay out of the browser.
 * The types come from it all the same — `import type` is erased before
 * Storybook's alias redirects the module, so a story can't drift from the real
 * response shape.
 *
 * Stories set the response via setMockOpportunities().
 */
import type { OpportunitiesResponse } from "@/server/opportunities";

export type { OpportunitiesReport, OpportunitiesResponse } from "@/server/opportunities";

let calls = { reads: 0, generations: 0 };
export function resetMockOpportunitiesCalls() {
	calls = { reads: 0, generations: 0 };
}
export function getMockOpportunitiesCalls() {
	return { ...calls };
}

let _report: OpportunitiesResponse | null = null;

export function setMockOpportunities(data: OpportunitiesResponse) {
	_report = data;
}

export const getOpportunitiesFn = async (..._args: unknown[]) => {
	calls.reads++;
	return _report;
};

export const generateOpportunitiesFn = async (..._args: unknown[]) => {
	calls.generations++;
	throw new Error("Storybook does not run research providers.");
};
