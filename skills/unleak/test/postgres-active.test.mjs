import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { run, expectOk, expectFail, skillRoot } from "./helpers.mjs";

const activeTestEnabled = process.env.UNLEAK_POSTGRES_ACTIVE_TEST === "1";

test("postgres active policy protects query output", { skip: !activeTestEnabled && "set UNLEAK_POSTGRES_ACTIVE_TEST=1 after user activates sales_pg policy" }, (t) => {
  const activePath = path.join(skillRoot, "local", "active-policies", "sales_pg.json");
  if (!fs.existsSync(activePath)) {
    assert.fail("sales_pg active policy is missing; run the manual activate-policy command first");
  }

  const setup = spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-postgres.mjs")], { encoding: "utf8" });
  if (setup.status !== 0 && /EPERM|ECONNREFUSED/.test(setup.stderr)) {
    t.skip("local Postgres is unavailable or blocked by sandbox");
    return;
  }
  assert.equal(setup.status, 0, setup.stderr);

  const star = expectOk(run("query.mjs", ["--connection", "sales_pg", "--sql", "SELECT * FROM unleak_customers ORDER BY status"]));
  assert.match(star.csv, /a\*\*\*@example.com/);
  assert.match(star.csv, /h_[0-9a-f]{16}/);
  assert.doesNotMatch(star.csv, /alice@example.com|1101700200001|raw-secret-token/);
  assert(star.columnsRemoved.includes("national_id"));

  expectFail(run("query.mjs", ["--connection", "sales_pg", "--sql", "SELECT status FROM unleak_customers WHERE customer_email = 'alice@example.com'"]), "SQL_PROTECTED_COLUMN_IN_WHERE");
  expectFail(run("query.mjs", ["--connection", "sales_pg", "--sql", "SELECT id FROM unleak_audit_log"]), "SQL_DISABLED_OBJECT");
});
