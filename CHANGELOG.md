# Changelog

All notable changes to `unleak` should be summarized here.

## 0.1.2

- Add optional per-column policy capabilities for `select`, `filter`, `group`, `sort`, `join`, `aggregate`, and `expression`.
- Keep existing policy behavior as the default when capability overrides are absent.
- Allow direct sortable columns in `ORDER BY` while preserving ordinal and expression restrictions.
- Expand safe analytic SQL function support for anomaly-detection workflows, including `abs`, `nullif`, `strftime`, and `julianday`.
- Document capability overrides in the README and skill instructions.

## 0.1.1

- Refactor the project into a focused installable skill package under `skills/unleak/`.
- Add local SQLite and Postgres workflow scripts for readiness checks, schema dumps, policy proposal, policy validation, policy activation, and guarded queries.
- Add policy-engine coverage for masking, hashing, hidden fields, joinable columns, row caps, simple joins, CTEs, FROM subqueries, and `UNION` queries.
- Add user-facing setup docs for skill installation, local database config, manual policy activation, and supported SQL scope.
- Install raw database CLI deny rules during config initialization, covering `psql`, `rtk psql`, `sqlite3`, and `rtk sqlite3`.
- Add `docs/unleak-theory.md` to explain the leakage-reduction model and trust boundary.

## 0.1.0

- Establish canonical skill packaging under `skills/unleak/`.
- Add generated Codex, Claude, and Gemini packaging surfaces.
- Add hook install and uninstall flow plus repo-local examples.
- Add branch-analysis demo with passing and blocked validation paths.
- Add deterministic benchmark harness with committed result snapshots.
- Add CI and repository verification checks.
