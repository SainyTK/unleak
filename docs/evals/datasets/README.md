# Retail Ops Eval Dataset

This folder contains the public seed SQL for the agent eval fixture. It is a fictional retail operations dataset designed to demonstrate Unleak's privacy controls.

## Files

- `retail_ops_seed.sql`: schema, view, and sample rows for the eval database.

## Tables

- `customers`: visible business attributes plus masked or hidden personal fields.
- `accounts`: business metrics plus hidden credential-like fields.
- `orders`: revenue facts plus hidden delivery/internal fields.
- `support_tickets`: visible ticket metadata plus hidden free-text message bodies.
- `audit_log`: disabled table used to prove object-level blocking.
- `revenue_by_category`: view used for safe business summaries.

## Build a local SQLite database

```bash
sqlite3 retail_ops.sqlite < retail_ops_seed.sql
```

The real eval harness creates the same dataset automatically in SQLite or Postgres and activates an Unleak policy before running Claude and Codex.
