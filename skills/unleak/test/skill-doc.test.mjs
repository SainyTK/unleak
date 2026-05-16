import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { skillRoot } from "./helpers.mjs";

test("SKILL.md documents the required Claude safety rules and workflow", () => {
  const text = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");

  for (const required of [
    "Never read or edit `unleak/local/db-conf.json`",
    "Never edit `unleak/scripts/**`, `unleak/local/schema/**`, or `unleak/local/active-policies/**`",
    "Never run `activate-policy.mjs`; only suggest the manual command with `!node`",
    "Never use raw database CLIs when `unleak` is configured",
    "Do not query until schema and an active policy exist",
    "When schema and an active policy already exist, answer normal data-inspection requests by querying approved data only",
    "Do not propose, validate, activate, or re-create policy unless the user explicitly asks to set up or update policy",
    "Prefer inline SQL with `query.mjs --sql` for normal queries",
    "Do not create project-visible query files like `./query.sql` for routine analysis",
    "Create a SQL file only when the query is very complex",
    "Put those files under `unleak/local/queries/` in the skill local state",
    "node .claude/skills/unleak/scripts/list-connections.mjs",
    "If the user asked to inspect, analyze, query, or find patterns in data and the requested connection already has schema and an active policy, skip setup and policy work",
    "node .claude/skills/unleak/scripts/query.mjs --connection <name> --sql \"SELECT ...\"",
    ".claude/skills/unleak/local/queries/<short-name>.sql",
    "Only continue to setup steps 3-12 when config, schema, or active policy is missing, or when the user explicitly asks to set up, propose, validate, activate, or update policy",
    "node .claude/skills/unleak/scripts/init-config.mjs",
    "Set a random `hmacSecret`",
    "For SQLite, set the database file path",
    "For Postgres, set host, port, dbname, username, and password",
    "node .claude/skills/unleak/scripts/check-readiness.mjs",
    "npm install",
    "node .claude/skills/unleak/scripts/install-claude-settings.mjs",
    "node .claude/skills/unleak/scripts/dump-schema.mjs",
    "node .claude/skills/unleak/scripts/propose-policy.mjs",
    "node .claude/skills/unleak/scripts/validate-policy.mjs",
    "!node .claude/skills/unleak/scripts/activate-policy.mjs",
    "node .claude/skills/unleak/scripts/query.mjs",
    "Read the schema file and active policy for that connection before writing analysis SQL",
    ".claude/skills/unleak/local/schema/<connection>.schema.json",
    ".claude/skills/unleak/local/active-policies/<connection>.json",
    "Build queries from this map, not from guessed database knowledge",
    "Avoid `UNION` for table overviews",
    "Avoid parallel or chained query batches until each query shape has passed once",
    "run `--dry-run` first",
    "`WHERE`, `HAVING`, `ORDER BY`, scalar expressions, and aggregate expressions may reference only `visible` columns",
    "`GROUP BY` may reference `visible`, `hashed`, or `joinable` columns",
    "Direct `SELECT` may include non-hidden columns",
    "Join conditions may use equality between `visible` or `joinable` columns only",
    "Every derived expression must have an explicit alias",
    "`ORDER BY` must use output aliases only",
    "Do not respond by proposing a new policy unless the user asked to update policy",
    "`visible`: Safe for normal analysis",
    "`masked`: May be selected directly when useful for display, but the output is transformed",
    "`hashed`: May be selected directly for pseudonymous display, local comparison, or grouped counts, but the output is transformed",
    "`joinable`: Intended for equality joins, direct pseudonymous selection, and grouped counts",
    "May be used in `ON a.col = b.col` when both sides are `visible` or `joinable`",
    "`hidden`: Never reference it",
    "`disabled` object: Never query it",
    "Policy can be updated only when the user explicitly asks to update, revise, expand, tighten, regenerate, or re-activate policy"
  ]) {
    assert(text.includes(required), `missing SKILL.md text: ${required}`);
  }
});

test("skill .gitignore protects local state and dependencies", () => {
  const text = fs.readFileSync(path.join(skillRoot, ".gitignore"), "utf8");
  assert.match(text, /^local\/$/m);
  assert.match(text, /^node_modules\/$/m);
});

test("README documents setup, test, query, and manual activation workflow", () => {
  const text = fs.readFileSync(path.join(skillRoot, "README.md"), "utf8");
  for (const required of [
    "bun install",
    "node test/setup-sqlite.mjs",
    "node test/setup-postgres.mjs",
    "node scripts/install-claude-settings.mjs",
    "node scripts/init-config.mjs",
    "node scripts/check-readiness.mjs",
    "node scripts/list-connections.mjs",
    "node scripts/dump-schema.mjs",
    "node scripts/propose-policy.mjs --force",
    "node scripts/validate-policy.mjs",
    "!node /absolute/path/to/unleak/scripts/activate-policy.mjs",
    "node scripts/query.mjs --connection sales_sqlite",
    "bun run test",
    "Postgres setup uses only isolated demo objects named `unleak_*`"
  ]) {
    assert(text.includes(required), `missing README text: ${required}`);
  }
});
