---
name: unleak
description: MUST use this skill when installed and users ask to query, inspect, or run SELECT statements against SQLite or Postgres databases. Always route database reads through Unleak when a project contains an unleak/ folder, or when users ask to list database connections, inspect schemas, propose or validate access policies, activate policies, or query approved database data with leakage guardrails. This skill prevents direct credential, policy, schema, and raw database CLI access.
compatibility: Requires Node.js and run `npm install` before using this skill.
---

# Unleak

Use `unleak` for database questions only when the current project has an `unleak/` folder. Unleak reduces leakage risk; it is not a sandbox.

## Rules

- Never read or edit `unleak/local/db-conf.json`.
- Never edit `unleak/scripts/**`, `unleak/local/schema/**`, or `unleak/local/active-policies/**`.
- Never run `activate-policy.mjs`; only suggest the manual command with `!node`.
- Never use raw database CLIs when `unleak` is configured.
- Do not query until schema and an active policy exist.
- When schema and an active policy already exist, answer normal data-inspection requests by querying approved data only. Do not propose, validate, activate, or re-create policy unless the user explicitly asks to set up or update policy.
- Prefer inline SQL with `query.mjs --sql` for normal queries. Do not create project-visible query files like `./query.sql` for routine analysis.
- Create a SQL file only when the query is very complex. Put those files under `unleak/local/queries/` in the skill local state, not in the user's project surface.
- Treat Claude permissions as guardrails, not a complete sandbox.
- Keep the user's current project directory as the working directory. Relative paths must continue to work for the user.

## Workflow

Run scripts from the user's current project directory, replacing `.claude/skills/unleak` with the actual `unleak/` folder path.

Important cwd rule:

- Do not leave the shell inside the Unleak skill root after installing dependencies.
- Prefer `npm install --prefix .claude/skills/unleak` so the working directory stays at the project root.
- If you must use `cd .claude/skills/unleak && npm install`, immediately return to the original project directory before retrying scripts or giving the user any relative-path commands.

1. Check readiness:
   `node .claude/skills/unleak/scripts/check-readiness.mjs`
   If the output reports `DEPENDENCIES_NOT_INSTALLED` or suggests `npm install`, run:
   `npm install --prefix .claude/skills/unleak`
   Then retry the same readiness command from the original project directory and continue.
2. List safe connections:
   `node .claude/skills/unleak/scripts/list-connections.mjs`
   If the user asked to inspect, analyze, query, or find patterns in data and the requested connection already has schema and an active policy, skip setup and policy work. Write focused SELECT queries and run:
   `node .claude/skills/unleak/scripts/query.mjs --connection <name> --sql "SELECT ..."`
   Continue iterating with more SELECT queries until the user's data question is answered.
   If a query is too complex for inline SQL, create it under `.claude/skills/unleak/local/queries/<short-name>.sql` and run:
   `node .claude/skills/unleak/scripts/query.mjs --connection <name> --file .claude/skills/unleak/local/queries/<short-name>.sql`
   Only continue to setup steps 3-12 when config, schema, or active policy is missing, or when the user explicitly asks to set up, propose, validate, activate, or update policy.
3. If config is missing, do not read or create `unleak/local/db-conf.json`. Ask the user to run:
   `mkdir -p .claude/skills/unleak/local && cp .claude/skills/unleak/db-conf.example.json .claude/skills/unleak/local/db-conf.json`
4. Ask the user to edit `unleak/local/db-conf.json` manually:
   - Set a random `hmacSecret`.
   - Keep and configure only the connections they need.
   - For SQLite, set the database file path.
   - For Postgres, set host, port, dbname, username, and password.
5. When the user says the config is saved, rerun:
   `node .claude/skills/unleak/scripts/list-connections.mjs`
6. Install deny rules if needed:
   `node .claude/skills/unleak/scripts/install-claude-settings.mjs`
7. Dump schema:
   `node .claude/skills/unleak/scripts/dump-schema.mjs`
8. Propose policy:
   `node .claude/skills/unleak/scripts/propose-policy.mjs`
9. Read schema and proposed policy files. Briefly explain policy recommendations.
10. Edit only files under `./unleak-policy-review/*.policy.proposed.json`.
11. Validate:
   `node .claude/skills/unleak/scripts/validate-policy.mjs`
12. Ask the user to activate manually:
   `!node .claude/skills/unleak/scripts/activate-policy.mjs ./unleak-policy-review/<connection>.policy.proposed.json`
13. Query approved data:
    `node .claude/skills/unleak/scripts/query.mjs --connection <name> --sql "SELECT ..."`

## Initialized Query Playbook

When a schema and active policy exist for the requested connection, optimize for valid queries:

1. Read the schema file and active policy for that connection before writing analysis SQL:
   - `.claude/skills/unleak/local/schema/<connection>.schema.json`
   - `.claude/skills/unleak/local/active-policies/<connection>.json`
2. Make a quick allowed-field map:
   - objects with `objectPolicy: "enabled"`
   - columns with policy `visible`, `masked`, `hashed`, or `joinable`
   - columns with policy `visible` only
3. Build queries from this map, not from guessed database knowledge.
4. For first-pass exploration, prefer simple one-table summaries: `COUNT(*)`, visible categorical counts, visible numeric `MIN`/`MAX`/`AVG`/`SUM`, and visible date buckets.
5. Avoid `UNION` for table overviews. Run simple count queries separately instead.
6. Avoid parallel or chained query batches until each query shape has passed once. One failed query can cancel useful follow-up work.
7. For non-trivial queries, run `--dry-run` first, then run the same SQL without `--dry-run` after it validates.

Policy-aware SQL rules:

- `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, scalar expressions, and aggregate expressions may reference only `visible` columns.
- Direct `SELECT` may include non-hidden columns, but protected columns (`masked`, `hashed`, `joinable`) should not be used in filters, groups, sorts, or calculations.
- Join conditions may use equality between `visible` or `joinable` columns only.
- Every derived expression must have an explicit alias, e.g. `COUNT(*) AS cnt`.
- `ORDER BY` must use output aliases only, not ordinals and not raw expressions.
- Prefer qualified column names in joins, e.g. `t.company_id = lc.company_id`.
- If validation fails, read the error code and adjust the SQL to use visible columns or simpler direct selections. Do not respond by proposing a new policy unless the user asked to update policy.

Column policy handling:

- `visible`: Safe for normal analysis. May be selected, filtered, grouped, sorted, joined, and used in expressions or aggregates.
- `masked`: May be selected directly when useful for display, but the output is transformed. Do not use it for filters, grouping, sorting, joins, expressions, or aggregates.
- `hashed`: May be selected directly for pseudonymous display or local comparison, but the output is transformed. Do not use it for filters, grouping, sorting, joins, expressions, or aggregates.
- `joinable`: Intended for equality joins and direct pseudonymous selection. May be used in `ON a.col = b.col` when both sides are `visible` or `joinable`. Do not group, filter, sort, aggregate, or calculate with it.
- `hidden`: Never reference it.
- `disabled` object: Never query it.

## Policy Updates

Treat an active policy as initialized state. For prompts like "inspect data", "find patterns", "analyze this connection", or "run a SELECT", use the active policy and focus on queries. Do not refresh schema, propose a replacement policy, edit proposed policies, validate proposals, or ask for activation just because the user requested analysis.

Policy can be updated only when the user explicitly asks to update, revise, expand, tighten, regenerate, or re-activate policy. In that case, run the relevant setup/policy steps above and keep edits limited to `./unleak-policy-review/*.policy.proposed.json`.
