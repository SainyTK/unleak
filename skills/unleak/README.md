# Unleak

Local database access guardrail for Claude Code. `unleak` keeps credentials in `local/db-conf.json`, routes database work through skill-owned scripts, and applies user-approved policies before query results are shown.

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
```

If a command reports missing dependencies, run `npm install` from the Unleak skill root, then retry the same command.

`init-config.mjs` creates `local/db-conf.json` from the example and installs Claude deny rules for protected files, `activate-policy.mjs`, `psql`, and `sqlite3`. `install-claude-settings.mjs` can be rerun later to repair or deduplicate those rules.

## Claude Rules

- Do not read or edit `unleak/local/db-conf.json`.
- Do not edit scripts, schema files, active policies, or `.claude/settings.json`.
- Do not run `activate-policy.mjs`; ask the user to run it with `!node`.
- Do not use raw database CLIs after `unleak` is configured, including `psql` and `sqlite3`.
- Query only after schema and active policy exist.

## Test

```bash
bun run test
bun run test:postgres
bun run test:postgres:active
```

The default test run skips local Postgres integration. Use `bun run test:postgres` when local Postgres is available. After manually activating `sales_pg`, use `bun run test:postgres:active` to prove the active policy masks, hashes, omits hidden fields, and rejects protected filters and disabled objects. The tests cover config safety, settings merge, schema backups, policy validation, proposal overwrite protection, query output gates, masking, hashing, hidden-column omission, joinable joins, CTE passthrough, FROM subquery passthrough, and UNION policy matching.

## Current SQL Scope

Supported: one `SELECT`, `SELECT *`, direct column passthrough, visible expressions with aliases, simple joins, simple CTEs, simple FROM subqueries, `UNION` / `UNION ALL`, allowlisted scalar and aggregate functions, output-alias `ORDER BY`, and row caps.

Unsupported or conservative: complex recursive CTEs, broad parser-specific window cases, `INTERSECT`, `EXCEPT`, DDL, DML, PRAGMA, COPY, ATTACH, DETACH, transaction/session commands, temp tables, and unresolved lineage.
