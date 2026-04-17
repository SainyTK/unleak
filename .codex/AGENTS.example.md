# Unleak Auto-Start Example For Codex

Use these instructions when the task involves local CSV files, databases, parquet files, exports, or other potentially sensitive business data.

- Require `unleak` setup before model-visible analysis. Prefer `scripts/discover_sources.py` and `scripts/init_policy.py` to create `.unleak/policy.json`.
- Do not inspect or export raw rows directly. Avoid commands such as `cat data.csv`, unrestricted `select *`, database dumps, or copying raw artifacts elsewhere.
- Prefer deterministic local scripts that aggregate, redact, or otherwise sanitize outputs before the model reads them.
- Before using a generated artifact in a response, validate it with `scripts/validate_release.py`.
- If the project has no policy or no sanitized artifact path, stop and ask for setup instead of continuing with raw data analysis.

Copy these instructions into a project `AGENTS.md`, or include them from there if your Codex setup already uses AGENTS includes.
