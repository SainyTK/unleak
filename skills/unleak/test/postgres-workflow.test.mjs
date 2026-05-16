import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { run, expectOk, expectFail, skillRoot } from "./helpers.mjs";

const pgAvailable = process.env.UNLEAK_POSTGRES_TEST === "1";

test("postgres workflow dumps schema and validates proposed policy", { skip: !pgAvailable && "set UNLEAK_POSTGRES_TEST=1 to run local Postgres integration" }, (t) => {
  const setup = spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-postgres.mjs")], { encoding: "utf8" });
  if (setup.status !== 0 && /EPERM|ECONNREFUSED/.test(setup.stderr)) {
    t.skip("local Postgres is unavailable or blocked by sandbox");
    return;
  }
  assert.equal(setup.status, 0, setup.stderr);

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-pg-"));
  expectOk(run("dump-schema.mjs", ["--connection", "sales_pg"]));
  const schema = JSON.parse(fs.readFileSync(path.join(skillRoot, "local", "schema", "sales_pg.schema.json"), "utf8"));
  assert.equal(schema.dialect, "postgres");
  assert(schema.objects.find((object) => object.name === "unleak_customers"));
  assert(schema.objects.find((object) => object.name === "unleak_orders"));
  assert.doesNotMatch(JSON.stringify(schema), /alice@example.com|raw-secret-token/);

  expectOk(run("propose-policy.mjs", ["--connection", "sales_pg", "--force"], { cwd }));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_pg.policy.proposed.json");
  const proposal = JSON.parse(fs.readFileSync(proposalPath, "utf8"));
  assert.equal(proposal.objects.find((object) => object.name === "unleak_audit_log").objectPolicy, "disabled");
  assert.equal(proposal.objects.find((object) => object.name === "unleak_customers").columns.find((column) => column.name === "customer_email").policy, "masked");
  expectOk(run("validate-policy.mjs", [proposalPath], { cwd }));
});

test("postgres query path is blocked until user activates policy", { skip: !pgAvailable && "set UNLEAK_POSTGRES_TEST=1 to run local Postgres integration" }, (t) => {
  const setup = spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-postgres.mjs")], { encoding: "utf8" });
  if (setup.status !== 0 && /EPERM|ECONNREFUSED/.test(setup.stderr)) {
    t.skip("local Postgres is unavailable or blocked by sandbox");
    return;
  }
  if (fs.existsSync(path.join(skillRoot, "local", "active-policies", "sales_pg.json"))) {
    const star = expectOk(run("query.mjs", ["--connection", "sales_pg", "--sql", "SELECT * FROM unleak_customers ORDER BY status"]));
    assert.match(star.csv, /a\*\*\*@example.com/);
    assert.doesNotMatch(star.csv, /alice@example.com|1101700200001/);
    expectFail(run("query.mjs", ["--connection", "sales_pg", "--sql", "SELECT status FROM unleak_customers WHERE customer_email = 'alice@example.com'"]), "SQL_PROTECTED_COLUMN_IN_WHERE");
    expectFail(run("query.mjs", ["--connection", "sales_pg", "--sql", "SELECT id FROM unleak_audit_log"]), "SQL_DISABLED_OBJECT");
  } else {
    expectFail(run("query.mjs", ["--connection", "sales_pg", "--sql", "SELECT * FROM unleak_customers"]), "ACTIVE_POLICY_NOT_FOUND");
  }
});
