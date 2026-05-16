# Changelog

All notable changes to `unleak` should be summarized here.

## 0.1.1

- Refactor the project into a focused installable skill package under `skills/unleak/`.
- Add local SQLite and Postgres workflow scripts for readiness checks, schema dumps, policy proposal, policy validation, policy activation, and guarded queries.
- Add policy-engine coverage for masking, hashing, hidden fields, joinable columns, row caps, simple joins, CTEs, FROM subqueries, and `UNION` queries.
- Add user-facing setup docs for skill installation, local database config, manual policy activation, and supported SQL scope.
- Add `docs/unleak-theory.md` to explain the leakage-reduction model and trust boundary.

## 0.1.0

- Establish canonical skill packaging under `skills/unleak/`.
- Add generated Codex, Claude, and Gemini packaging surfaces.
- Add hook install and uninstall flow plus repo-local examples.
- Add branch-analysis demo with passing and blocked validation paths.
- Add deterministic benchmark harness with committed result snapshots.
- Add CI and repository verification checks.
