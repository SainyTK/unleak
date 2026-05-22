# BigQuery Dialect Implementation Plan

## Goal

Add a `bigquery` dialect to Unleak.

Primary auth path: user logs in with `gcloud auth application-default login`, then manually pastes ADC JSON into `skills/unleak/local/db-conf.json`. Agents must not read the raw ADC file or `local/db-conf.json` directly.

## Config Shape

Add `bigquery` as a supported `connection.dialect`.

BigQuery connection example:

```json
{
  "name": "warehouse_bq",
  "dialect": "bigquery",
  "credentials": {
    "projectId": "my-gcp-project",
    "adc": {
      "type": "authorized_user",
      "client_id": "...",
      "client_secret": "...",
      "refresh_token": "..."
    }
  },
  "options": {
    "location": "US",
    "maxBytesBilled": 1000000000,
    "maxDatasetsPerSchemaDump": 50
  }
}
```

Service account JSON must also be supported:

```json
{
  "name": "warehouse_bq",
  "dialect": "bigquery",
  "credentials": {
    "projectId": "my-gcp-project",
    "adc": {
      "type": "service_account",
      "client_email": "...",
      "private_key": "..."
    }
  },
  "options": {
    "maxBytesBilled": 1000000000
  }
}
```

Validation:

- `credentials.projectId` is required.
- `credentials.adc` is required.
- `authorized_user` ADC requires `client_id`, `client_secret`, and `refresh_token`.
- `service_account` ADC requires `client_email` and `private_key`.
- Other ADC types are invalid for now.
- Dialect-specific config belongs under `connection.options`, not root connection fields.

Default BigQuery options:

- `maxBytesBilled`: `1000000000`
- `maxDatasetsPerSchemaDump`: `50`
- `location`: optional

Resolution order for `maxBytesBilled`:

1. `connection.options.maxBytesBilled`
2. `config.options.bigquery.maxBytesBilled`
3. built-in default `1000000000`

## Dependency

Add official client dependency:

```bash
bun add @google-cloud/bigquery
```

Use:

```js
new BigQuery({
  projectId: connection.credentials.projectId,
  credentials: connection.credentials.adc
})
```

Pass `location` to dry-run/query jobs when configured.

## Policy Scope Model

Connection is auth boundary.

Schema/dataset is policy boundary.

One BigQuery connection can expose many datasets. Each dataset gets its own schema file, proposed policy file, and active policy file.

Scope key format:

```text
<connection>__<schema>
```

Examples:

```text
warehouse_bq__sales
warehouse_bq__finance
```

Files:

```text
skills/unleak/local/schema/warehouse_bq__sales.schema.json
skills/unleak/local/active-policies/warehouse_bq__sales.json
unleak-policy-review/warehouse_bq__sales.policy.proposed.json
```

Policy content should include both connection and schema:

```json
{
  "policyVersion": 1,
  "connection": "warehouse_bq",
  "schema": "sales",
  "scope": "warehouse_bq__sales"
}
```

Compatibility:

- SQLite keeps existing `--connection sales_sqlite` behavior.
- Existing Postgres keeps existing `--connection sales_pg` behavior for `public` or legacy single-scope use.
- BigQuery query requires `--connection` and `--schema`.
- Activation reads `connection` and `schema` from policy file; no flags needed.

## Schema Dump

Commands:

```bash
node scripts/dump-schema.mjs --connection warehouse_bq
node scripts/dump-schema.mjs --connection warehouse_bq --schema sales
```

Behavior:

- No `--schema`: list datasets in configured project and dump one schema file per dataset.
- With `--schema`: dump only that dataset.
- Use API pagination for dataset listing.
- Apply `maxDatasetsPerSchemaDump` after collecting/counting datasets.
- If dataset count exceeds limit, fail with safe error `BIGQUERY_DATASET_LIMIT_EXCEEDED`.
- Over-limit error should include count, limit, and hint to use `--schema <dataset>`. Do not dump dataset names in the error.
- If dumping all and one dataset fails, fail the whole run with safe error `BIGQUERY_SCHEMA_DUMP_FAILED`.
- If dumping one dataset and it fails, fail that run.

Dataset/schema names:

- Accept only filename-safe BigQuery dataset IDs matching `[A-Za-z0-9_]+`.
- Reject unsupported names with a safe error such as `BIGQUERY_SCHEMA_NAME_UNSUPPORTED`.

Schema content:

```json
{
  "schemaVersion": 1,
  "connection": "warehouse_bq",
  "schema": "sales",
  "scope": "warehouse_bq__sales",
  "dialect": "bigquery",
  "namespace": {
    "projectId": "my-gcp-project",
    "datasetId": "sales"
  },
  "generatedAt": "2026-05-20T00:00:00.000Z",
  "objects": []
}
```

Object names inside schema/policy remain local table or view names:

```json
{
  "name": "orders",
  "type": "table",
  "columns": []
}
```

Include:

- Tables
- Views
- External tables if BigQuery lists them as queryable tables

Do not add special handling for external tables.

Nested fields:

- MVP supports top-level columns only.
- A BigQuery `RECORD` column is recorded as one top-level column.
- Nested field policies and `profile.email` style queries are unsupported/rejected for MVP.

## Query API

BigQuery query command:

```bash
node scripts/query.mjs --connection warehouse_bq --schema sales --sql "SELECT amount FROM orders"
```

Rules:

- BigQuery SQL must use local unqualified table names.
- Supported: `FROM orders`, `JOIN customers c`.
- Unsupported for MVP: fully qualified table names, dataset-qualified names, wildcard tables, table decorators, snapshots, and system-time queries.

Reject or do not promise support for:

```sql
SELECT amount FROM `project.sales.orders`
SELECT amount FROM sales.orders
SELECT amount FROM events_*
SELECT amount FROM orders@1234567890
SELECT amount FROM orders FOR SYSTEM_TIME AS OF ...
```

Policy validation runs against local object names. Executor qualifies physical table references after validation:

```sql
FROM orders
```

becomes:

```sql
FROM `my-gcp-project.sales.orders` AS orders
```

Alias handling:

```sql
JOIN customers c
```

becomes:

```sql
JOIN `my-gcp-project.sales.customers` AS c
```

Do not qualify CTE names or FROM-subquery aliases.

## SQL Parser And Policy Engine

Make parser dialect-aware:

- `postgres` -> `postgresql`
- `bigquery` -> `bigquery`
- SQLite can keep current behavior unless implementation needs a cleaner map.

Keep the Unleak supported SQL subset conservative:

- `SELECT` only
- existing join, CTE, subquery, aggregate, alias, output transform rules
- local object names only for BigQuery

BigQuery-specific unsupported patterns should fail before execution with safe errors.

## BigQuery Cost Guard

Every BigQuery query execution must perform a BigQuery dry run first.

Dry run behavior:

- `--dry-run`: return policy plan plus BigQuery estimated bytes.
- normal execution: dry run first, compare estimate to `maxBytesBilled`, then execute only if under cap.
- execution job also passes `maximumBytesBilled`.

Error:

```text
BIGQUERY_BYTES_LIMIT_EXCEEDED
```

Include safe details:

- estimated bytes
- configured limit

Do not include credentials or full query internals in unsafe ways.

## BigQuery Result Normalization

Normalize BigQuery client wrapper values before CSV/output transforms.

Handle:

- `BigQueryDate` / `BigQueryDatetime` / `BigQueryTime` / `BigQueryTimestamp` -> string
- Big numeric objects -> string or number-safe string
- arrays/structs -> JSON string

Goal: stable CSV and JSON-safe output before masking/hashing/CSV generation.

## Claude Settings / Raw CLI Deny Rules

Add deny rules for direct BigQuery CLI use:

```text
Bash(bq*)
Bash(rtk bq*)
```

Do not broadly deny `gcloud*`.

Docs should say:

- users may run `gcloud auth application-default login`
- agents must not use raw BigQuery CLIs after Unleak setup
- agents must not read ADC source files or `local/db-conf.json`

Existing deny rules for `psql`, `rtk psql`, `sqlite3`, and `rtk sqlite3` remain.

## Docs

Document BigQuery as:

- primary path: `gcloud auth application-default login`
- user manually copies ADC JSON into `credentials.adc`
- service account JSON is supported for advanced/CI use
- `credentials.projectId` is required
- one policy file per dataset/schema
- query with `--connection` + `--schema`
- SQL uses local table names only
- BigQuery cost guard uses `options.maxBytesBilled`

## Tests

Add focused tests without requiring live BigQuery by default:

- config validation accepts BigQuery authorized-user ADC
- config validation accepts BigQuery service-account ADC
- config validation rejects bad ADC type and missing required fields
- db-conf example includes BigQuery shape
- list-connections remains safe and does not expose credentials/project/datasets
- Claude settings include `Bash(bq*)` and `Bash(rtk bq*)`
- scope key/path generation creates `connection__schema`
- policy validation uses `connection` + `schema`/`scope`
- BigQuery local table qualification handles aliases
- CTE names are not qualified
- fully qualified BigQuery table names are rejected
- wildcard/decorator/system-time patterns are rejected
- BigQuery dry-run byte cap failure maps to `BIGQUERY_BYTES_LIMIT_EXCEEDED`
- BigQuery result normalization covers date/time/numeric/array/object values

Live BigQuery integration tests should be opt-in only, similar to current Postgres tests.

Suggested env gate:

```text
UNLEAK_BIGQUERY_TEST=1
```

Do not make default `bun run test` depend on cloud credentials or network.

## Implementation Touch Points

Likely files:

- `skills/unleak/package.json`
- `skills/unleak/db-conf.example.json`
- `skills/unleak/scripts/lib/config.mjs`
- `skills/unleak/scripts/lib/db.mjs`
- `skills/unleak/scripts/lib/readiness.mjs`
- `skills/unleak/scripts/lib/paths.mjs`
- `skills/unleak/scripts/lib/schema.mjs`
- `skills/unleak/scripts/lib/policy.mjs`
- `skills/unleak/scripts/lib/propose.mjs`
- `skills/unleak/scripts/lib/sql-policy-engine.mjs`
- `skills/unleak/scripts/lib/claude-settings.mjs`
- `skills/unleak/scripts/dump-schema.mjs`
- `skills/unleak/scripts/propose-policy.mjs`
- `skills/unleak/scripts/activate-policy.mjs`
- `skills/unleak/scripts/query.mjs`
- `skills/unleak/README.md`
- `README.md`
- `CHANGELOG.md`
- relevant tests under `skills/unleak/test/`

