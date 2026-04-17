# Example patterns from `confident-insights`

These patterns come from the local project at `/Users/sainy/Documents/projects/personal/confident-insights`. Use them as concrete examples when the user asks how `unleak` should behave in practice.

## 1. Safe insight pack

This is the default path for narrative analysis.

Observed structure:

- task statement
- explicit schema for safe fields
- branch or entity aliases
- indexes relative to a baseline such as the median
- bands for margin, returns, and discount pressure
- a prompt template that forbids exact values

Representative safe fields:

- `branch_alias`
- `sales_index`
- `profit_index`
- `order_index`
- `margin_band`
- `returns_band`
- `discount_band`
- `performance_flag`

## 2. Restricted query gateway

This is the interactive path when the analyst needs follow-up questions.

Observed contract:

- tool name
- description that raw currency is blocked
- explicitly allowed dimensions
- explicitly allowed measures
- example response with aliases and percentiles only

Representative measures:

- `sales_percentile`
- `profit_percentile`
- `margin_percentile`
- `returns_percentile`
- `discount_percentile`

## 3. Differential privacy release

This is optional. Use it for widely reused aggregate releases or repeated access scenarios. The local project expresses this as noisy sales and profit indexes plus metadata about epsilon and clipping.

## 4. Evaluation criterion

The local project measures whether the sanitized outputs preserve the same weakest branches as the raw KPI ranking. That is the right style of benchmark for `unleak`: compare business usefulness, not just whether the file looks redacted.

Example benchmark signal:

- raw bottom-5 branches
- safe bottom-5 branches
- gateway bottom-5 branches
- overlap counts between raw and sanitized rankings

The referenced local evaluation currently shows full overlap for the retail example. Treat that as an example target, not a guaranteed result for every dataset.
