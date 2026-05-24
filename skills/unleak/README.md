# Unleak

Local database access guardrail for Claude Code. `unleak` keeps credentials in `local/db-conf.json`, routes SQLite, Postgres, and BigQuery work through skill-owned scripts, and applies user-approved policies before query results are shown.

This is leakage reduction, not a sandbox. Claude Code permissions and the query policy engine are guardrails for everyday database inspection.

## Setup

```bash
cd unleak
bun install
# or, when installed as a skill:
npm install
node test/setup-sqlite.mjs
node test/setup-postgres.mjs
```

Postgres setup uses only isolated demo objects named `unleak_*` in the configured database.

## User Workflow

```bash
node scripts/check-readiness.mjs
node scripts/init-config.mjs
node scripts/install-claude-settings.mjs
node scripts/list-connections.mjs
node scripts/dump-schema.mjs
node scripts/propose-policy.mjs --force
node scripts/validate-policy.mjs
```

Review `./unleak-policy-review/<connection>.policy.proposed.json`, then activate manually:

```bash
!node /absolute/path/to/unleak/scripts/activate-policy.mjs ./unleak-policy-review/<connection>.policy.proposed.json
```

After activation:

```bash
node scripts/query.mjs --connection sales_sqlite --sql "SELECT * FROM customers"
node scripts/query.mjs --connection sales_sqlite --file ./query.sql --out ./unleak-query-output/result.csv
node scripts/query.mjs --connection warehouse_bq --schema sales --sql "SELECT amount FROM orders"
```

If a command reports missing dependencies, run `npm install` from the Unleak skill root, then retry the same command.

`init-config.mjs` creates `local/db-conf.json` from the example and installs Claude deny rules for protected files, `activate-policy.mjs`, `psql`, `sqlite3`, and `bq`. `install-claude-settings.mjs` can be rerun later to repair or deduplicate those rules.

For BigQuery, users may run `gcloud auth application-default login`, then manually paste ADC JSON into `credentials.adc` and set `credentials.projectId`. Service account JSON is also supported for CI or advanced use. BigQuery stores one schema and policy per dataset with scope keys like `warehouse_bq__sales`; query commands must pass both `--connection` and `--schema`. SQL must use local table names only. Unleak validates policy against those names, qualifies BigQuery table references internally, dry-runs every query, and enforces `options.maxBytesBilled`.

## Claude Rules

- Do not read or edit `unleak/local/db-conf.json`.
- Do not edit scripts, schema files, active policies, or `.claude/settings.json`.
- Do not run `activate-policy.mjs`; ask the user to run it with `!node`.
- Do not use raw database CLIs after `unleak` is configured, including `psql`, `sqlite3`, and `bq`.
- Do not read ADC source files or `local/db-conf.json`.
- Query only after schema and active policy exist.

## Test

```bash
bun run test
bun run test:agent:fixture
bun run test:agent:preflight
bun run eval:sqlite:report
bun run eval:postgres:report
bun run eval:mysql:report
bun run eval:bigquery:report
bun run test:postgres
bun run test:postgres:active
```

The default test run skips local Postgres integration. Use `bun run test:postgres` when local Postgres is available. After manually activating `sales_pg`, use `bun run test:postgres:active` to prove the active policy masks, hashes, omits hidden fields, and rejects protected filters and disabled objects. The tests cover config safety, settings merge, schema backups, policy validation, proposal overwrite protection, query output gates, masking, hashing, hidden-column omission, joinable joins, CTE passthrough, FROM subquery passthrough, and UNION policy matching.

Agent evals use a richer retail dataset in a temporary project and install the skill under `.claude/skills/unleak` or `.agents/skills/unleak`. The fixture gate proves the dataset, schema, and active policy are valid without calling an external agent. The SQLite fixture uses `retail_ops`; the Postgres fixture uses the same rows at `postgres@localhost:5432/unleak-evals` through `retail_ops_pg`; the MySQL fixture uses the same rows at `root@localhost:3306/unleak-evals` through `retail_ops_mysql`; the BigQuery fixture uses the same rows in dataset `unleak_evals` through `retail_ops_bq`. Real agent runs are explicit:

```bash
bun run test:agent:claude
bun run test:agent:codex
bun run test:agent:sqlite
bun run test:agent:postgres
bun run test:agent:mysql
bun run test:agent:bigquery
```

`bun run test:agent:preflight` checks whether Claude and Codex are authenticated and reachable before running model-backed evals. Failures are written under `test/agent-evals/failures/` with the prompt, JSONL transcript, extracted commands, and diagnosis. The evals assert that agents use Unleak scripts, avoid raw database CLIs, do not run policy activation, and do not leak seeded raw emails, national IDs, addresses, notes, API keys, session tokens, or payment markers.

`bun run eval:sqlite:report` runs the real Claude and Codex SQLite evals and writes the public report to `../../docs/evals/sqlite-agent-evals.md`, with structured JSON and transcript snapshots beside it. `bun run eval:postgres:report` runs the same eval suite against Postgres and writes `../../docs/evals/postgres-agent-evals.md`. `bun run eval:mysql:report` runs the MySQL eval suite and writes `../../docs/evals/mysql-agent-evals.md`. `bun run eval:bigquery:report` runs the BigQuery eval suite and writes `../../docs/evals/bigquery-agent-evals.md`.

## Current SQL Scope

Supported: one `SELECT`, `SELECT *`, direct column passthrough, visible expressions with aliases, simple joins, simple CTEs, simple FROM subqueries, `UNION` / `UNION ALL`, allowlisted scalar and aggregate functions, output-alias `ORDER BY`, and row caps.

Unsupported or conservative: complex recursive CTEs, broad parser-specific window cases, `INTERSECT`, `EXCEPT`, DDL, DML, PRAGMA, COPY, ATTACH, DETACH, transaction/session commands, temp tables, and unresolved lineage.
