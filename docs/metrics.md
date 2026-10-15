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


## Optimization comparisons

An action freezes the latest valid baseline per question and target. After the operator records implementation, comparison pairs use the same question ID and text, provider/model/version/search configuration, and brand definition. Changed or missing cohorts are reported separately, never assigned zero. Before/after percentages use only matched pairs; the difference is percentage points, not relative growth. The panel labels these as matched retests.

Baseline selection requires a completed sample within 30 days for every selected question. Reads are bounded to 2,000 completed observations and the latest 50 actions. An unavailable sample outside those bounds remains missing. Browser model/region/search state cannot currently be pinned: a collector version is not an underlying model version. These are descriptive account-context samples, not evidence of causal improvement or market-wide exposure.
