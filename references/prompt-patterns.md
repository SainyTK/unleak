# Prompt patterns

These are adapted from the local `confident-insights` project and should be used only with already validated artifacts.

## Safe insight pack prompt

```text
You are an analyst.

Rules:
- Use only the sanitized fields in the provided artifact.
- Do not ask for exact revenue, profit, salary, or row-level records.
- Rank the weakest entities.
- Explain the likely driver for each entity using only the safe fields.
- Recommend the next safe local query that would help confirm the diagnosis.

Format:
1. Weakest entities
2. Likely drivers
3. Next safe checks
```

## Restricted local tool prompt

```text
You can use the local tool `health_query`.

Constraints:
- Never request raw currency, raw identifiers, or row-level transactions.
- Use aliases and percentile metrics only.
- If you need a follow-up, ask for another safe tool call.
- End with a short action plan.
```

## Join-back rule

If the model returns aliases such as `BR-309A219B`, join them back to real entity names locally. Do not expose the alias map to the model if it is sensitive.
