# Interface language

The main product interface supports English and Simplified Chinese. Use **EN / 中文** on the sign-in page, setup page or workspace header. English is the default; an explicit choice is saved in the current browser and synchronized across its tabs. Switching does not navigate away or clear the current form. The control becomes available after client hydration so an early click cannot be silently lost.

Interface language is separate from question language. The starter bank initially follows the interface language; once a question language is explicitly chosen, that choice is retained. Saved questions, user-entered brand names, collected answers and source URLs are never translated by the UI switch.

The translated surface includes setup, brand onboarding, navigation, monitoring, citations, optimization and report controls. Unknown server/provider messages fall back to their original text. CLI output, generated research prose, technical API documentation, the legacy browser lab and marketing site are not translated by this control.

## Adding interface copy

Use `useT()` inside React components for product-owned labels, with the English source string as the key. Add the Chinese translation in `apps/web/src/lib/i18n/zh.json`. Pass variable content as named interpolation values, rather than translating user data or assembling English plural fragments. Keep API IDs, persisted statuses, URLs and evidence unchanged.

The locale preference is local browser state; it needs no account migration or new database. See `apps/web/src/lib/i18n/messages.test.ts` and `e2e/tests/local/language.spec.ts` for preference, fallback and interaction coverage.
