# BeatGeo Metrics v1

The MVP implements literal mention rate, scored/completed coverage and explicit status counts. The same pure module drives runner summaries and workbench coverage. A completed answer with no configured brand is unscored. Observation IDs are deduplicated; attempts are not extra observations.

| Metric | Definition |
|---|---|
| Mention rate | Completed answers mentioning the brand / completed answers with a boolean mention result |
| Completion coverage | Completed observations / stored observations in scope |
| Timeout | Separate `timeout` status count |
| Failure / attention | Separate counts; never negative brand observations |
| Share of voice | Target answer-level mentions / mentions of target plus fixed competitors; function available, workbench integration pending |

Stored-observation coverage is not future scheduled-plan coverage. No planned counts are invented. Brands must be selected separately; account context, platform, mode and question version remain distinguishable. An uncertain submission is not automatically replayed.

Timeout details include question, platform, elapsed time, answer-wait timeout, attempt count, partial text and error. Elapsed time includes opening and cleanup and can exceed answer-wait timeout. Older records may lack timing metadata.

Visible links do not prove complete citation extraction. Recommendation identification, full citation coverage and confidence intervals remain roadmap items. The inherited statistics include Jaccard/Bray–Curtis source changes and last-value-carried-forward views; carried values are not fresh observations. Those views need explicit freshness before becoming BeatGeo's default factual trend.

No composite score is presented as a validated predictor of traffic or revenue.
