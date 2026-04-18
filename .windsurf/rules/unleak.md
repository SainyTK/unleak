---
trigger: always_on
---

# Unleak Activation Rule

Activate `unleak` whenever a coding agent is asked to analyze sensitive local CSV files, SQLite databases, or project data.

Core rule: keep raw data local, compute on that raw data deterministically, and release only validated derived artifacts to the model.

Follow this sequence:

1. Discover sources and infer risky fields without showing raw rows to the model.
2. Confirm the highest-risk and high-risk classes with the user when classification is ambiguous.
3. Write or update local policy so approved release patterns are explicit.
4. Produce a derived artifact and lineage manifest with a local script.
5. Validate the artifact before the model reads it.
6. If validation fails, coarsen the output and retry instead of asking the model to inspect raw data.

Default blocks:

- raw row-level exports
- direct identifiers, secrets, payment data, protected health data, and raw human free text
- exact proprietary business metrics when policy only allows bands, indexes, percentiles, or aggregated summaries
- unrestricted SQL or ad hoc raw-schema prompting from the model

Use `unleak` for teams using coding agents on sensitive local data. Do not position it as infrastructure-grade confidential computing.
