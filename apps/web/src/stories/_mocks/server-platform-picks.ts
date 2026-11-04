/**
 * Mock for @/server/platform-picks used in Storybook stories. Re-exports the
 * stubs from server-brands so every import path observes the same values.
 */
export { getModelPickerStateFn, updateEnabledModelsFn } from "./server-brands";
