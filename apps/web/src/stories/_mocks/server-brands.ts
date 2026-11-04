/**
 * Mock for @/server/brands used in Storybook stories. Provides stubs for
 * every server function exported by the real module so the route tree can
 * be bundled.
 */

export const getBrand = async (_args: { data: unknown }) => null;

/** Stub re-exported by server-platform-picks.ts */
export const getModelPickerStateFn = async (_args: { data: unknown }) => null;

/** Stub re-exported by server-platform-picks.ts */
export const updateEnabledModelsFn = async (_args: { data: unknown }) => ({ id: "", enabledModels: null });

export const createBrandInOrgFn = async (_args: { data: unknown }) => ({ brandId: "mock-brand-id" });

export const updateBrandFn = async (_args: { data: unknown }) => ({ success: true });

export const getCompetitors = async (_args: { data: unknown }) => [];

export const updateCompetitors = async (_args: { data: unknown }) => ({ success: true });

export const addDomainToBrandFn = async (_args: { data: unknown }) => ({ success: true });

export const addDomainToCompetitorFn = async (_args: { data: unknown }) => ({ success: true });

export const createCompetitorFromDomainFn = async (_args: { data: unknown }) => ({ success: true });
