# AI platform reports

Use **Visibility → AI platform reports** to keep platform-reported citations and impressions separate from question-monitoring samples. No API credential is needed for imports, and importing does not schedule collections or refresh Google/Bing data.

Export a single CSV table from Bing AI Performance or Google Search Console's generative AI report. Extract ZIP downloads before selecting a CSV. This release accepts two-column tables:

- Page / Citations or Page / Impressions
- Date / Citations or Date / Impressions
- Grounding Query / Citations (Bing only)

Common English and Simplified Chinese headers are recognized. Use exact integer counts; opportunity ranges and abbreviated counts are rejected. Provide the export's website, inclusive date range and filters, including market/search type/timezone where relevant. Google ordinary-search exports must not be relabelled as AI data. CSV alone cannot authenticate its source; the importer explicitly asks the user to confirm provenance. Exports with additional dimensions must be reduced to a supported table without changing its meaning.

Each import is an independent snapshot scoped to the current brand. The same normalized report is saved only once. Different or overlapping snapshots remain separate and are not summed. Page/query comparisons require identical source, website, dimension and filters, equal-length non-overlapping periods. Missing rows remain unknown; daily tables are not paired across unrelated calendar dates. Detail rows are not summed into site totals. User-supplied filters must match exactly for comparison.

Limits: 2 MB per CSV, 2,000 rows and 100 saved imports per brand. Remove an unused import to free a slot; its original file is unaffected. Page reports must use a hostname saved on the brand; import separate hostnames separately.

Validation uses synthetic CSV fixtures and mocked persistence/authorization tests. A real browser check exercises file selection and preview without saving synthetic observations into the owner's brand. Actual Bing/GSC export variants and account data still require validation with their real files. Automatic AI-report API synchronization and Topic Portfolio opportunity imports are not included.
