# Benchmark plan

The first benchmarks should measure both utility and leakage prevention.

## Required scenarios

1. Retail branch performance analysis
2. HR compensation analysis
3. Support ticket trend analysis with free text present
4. B2B account performance analysis with exact contract values

## A/B comparison

- Baseline: agent receives raw extracts directly
- `unleak`: agent receives only validated derived artifacts

## Metrics

- task completion rate
- recommendation quality judged against a hidden answer key
- leakage rate: count of blocked or leaked high-risk fields
- analyst effort: setup time and iteration count
- token consumption, when measurable
- signal preservation: overlap between the risky entities found from raw KPIs and the risky entities found from the sanitized artifact

## Minimum benchmark package per scenario

- raw fixture data kept local
- a policy file
- an analysis script that creates a safe artifact
- a lineage manifest
- an expected blocked example
- an expected passing example

For the retail example, mirror the `confident-insights` style comparison:

- raw bottom-5 entities from exact KPIs
- safe bottom-5 entities from the sanitized scorecard
- gateway bottom-5 entities from approved percentiles
- overlap counts for safe and gateway outputs

The benchmark result should emphasize whether `unleak` preserves enough signal for useful recommendations while reducing leak events compared with raw prompting.
