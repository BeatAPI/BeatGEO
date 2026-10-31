# Evidence rules

These are the definitions the analyzer implements. Tests in `test/` pin them.

## Three different counts

| Term | Definition |
| --- | --- |
| Source URL | A URL a search call returned (`web_search_call.action.sources`). Exact-string deduplicated, query string included. |
| Cited URL | A distinct URL that appears in at least one `url_citation` annotation of the final answer. |
| Citation occurrence | One `url_citation` annotation. The same URL cited twice is two occurrences and one cited URL. |

A URL that is cited but was not returned as a source still counts as cited. It does not raise the source count.

Pages the model opened or searched within (`open_page`, `find_in_page`) are recorded on the call but are neither sources nor citations.

## Counting across answers

Summaries count **answers**, not URLs:

- "Cited in 3/5" means three of five sampled answers cited at least one URL on that domain.
- "Mentioned in 2/5" means two of five answers contained the name (or an alias) in prose.
- A denominator excludes failed requests. Failures are listed separately.

Results are written as `k/n` and never as percentages. Domains are the hostname without a leading `www.`; the tool does not apply a public-suffix list, so `a.co.uk` and `b.co.uk` are different domains and `docs.example.com` is a subdomain of `example.com` only when `example.com` is the configured owned domain.

## Brand mentions

- Matching runs on answer prose after removing citation labels (`([site](url))`), markdown links whose target the response cited or returned, and bare URLs.
- A markdown link to a URL the response never cited or returned keeps its label (the model wrote the name in prose).
- Names and aliases are case-insensitive. Boundaries consider Latin letters and digits only, so `Acmes` does not match `Acme` while `推荐Acme和…` does.
- Mention order is not a recommendation rank. Not being mentioned only means it did not appear in that answer.
- Owned-domain matching includes subdomains (`docs.example.com` for `example.com`) and excludes lookalike hosts (`notexample.com`).

## What is never inferred

- Hidden chain of thought or why a source was selected.
- Search queries the response did not return.
- Which query inside a multi-query call produced which source. Sources are tied to the call, not to an individual query.
- Any value for a field the provider did not return.

## Comparing runs

A difference between two small samples is not a trend. `diff` keeps both denominators and flags a row as low sample when either side has fewer than 5 answers. Use the same question set, engine and model on both sides.
