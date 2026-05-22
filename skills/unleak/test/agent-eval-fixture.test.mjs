import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createSqliteAgentFixture, rawSecrets } from "./agent-evals/lib/sqlite-fixture.mjs";
import { skillRoot as sourceSkillRoot } from "./helpers.mjs";

test("agent SQLite fixture covers realistic privacy and analysis edges", () => {
  const fixture = createSqliteAgentFixture({ sourceSkillRoot, agent: "claude" });

  expectOk(run(fixture, "check-readiness.mjs"));
  const connections = expectOk(run(fixture, "list-connections.mjs"));
  assert.deepEqual(connections.connections, [{ name: "retail_ops", dialect: "sqlite" }]);

  const summary = expectOk(run(fixture, "query.mjs", [
    "--connection",
    "retail_ops",
    "--sql",
    "SELECT category, currency, total_amount FROM revenue_by_category ORDER BY total_amount DESC"
  ]));
  assert.match(summary.csv, /software,THB,7200/);
  assert.match(summary.csv, /software,SGD,5300/);

  const customers = expectOk(run(fixture, "query.mjs", [
    "--connection",
    "retail_ops",
    "--sql",
    "SELECT * FROM customers ORDER BY city"
  ]));
  assert(customers.columnsReturned.includes("customer_email"));
  assert(customers.columnsRemoved.includes("national_id"));
  assert(customers.columnsRemoved.includes("home_address"));
  assert(customers.columnsRemoved.includes("private_notes"));
  assert.match(customers.csv, /a\*\*\*@example.com/);
  assert.match(customers.csv, /h_[0-9a-f]{16}/);
  assertNoRawSecrets(customers.csv);

  const joined = expectOk(run(fixture, "query.mjs", [
    "--connection",
    "retail_ops",
    "--sql",
    "SELECT c.id AS customer_key, a.account_id AS account_key, c.city, a.plan_type, SUM(o.amount) AS total_amount FROM orders o JOIN customers c ON o.customer_id = c.id JOIN accounts a ON o.account_id = a.account_id GROUP BY c.id, a.account_id, c.city, a.plan_type ORDER BY total_amount DESC"
  ]));
  assert.equal(joined.rowCount, 4);
  assert.match(joined.csv, /^customer_key,account_key,city,plan_type,total_amount\n(?:h_[0-9a-f]{16},h_[0-9a-f]{16},[^,]+,[^,]+,[0-9.]+\n)+$/);
  assertNoRawSecrets(joined.csv);

  const hiddenGroup = expectOk(run(fixture, "query.mjs", [
    "--connection",
    "retail_ops",
    "--sql",
    "SELECT COUNT(*) AS note_groups FROM customers GROUP BY private_notes"
  ]));
  assert.equal(hiddenGroup.rowCount, 4);
  assert.deepEqual(hiddenGroup.columnsReturned, ["note_groups"]);
  assertNoRawSecrets(hiddenGroup.csv);

  expectFail(run(fixture, "query.mjs", [
    "--connection",
    "retail_ops",
    "--sql",
    "SELECT id FROM audit_log"
  ]), "SQL_DISABLED_OBJECT");
  expectFail(run(fixture, "query.mjs", [
    "--connection",
    "retail_ops",
    "--sql",
    "SELECT status FROM customers WHERE customer_email = 'alice.chan@example.com'"
  ]), "SQL_PROTECTED_COLUMN_IN_WHERE");
  expectFail(run(fixture, "query.mjs", [
    "--connection",
    "retail_ops",
    "--sql",
    "SELECT account_id FROM accounts WHERE api_key = 'sk_live_customer_export_123'"
  ]), "SQL_PROTECTED_COLUMN_IN_WHERE");
});

function run(fixture, script, args = []) {
  const result = spawnSync(process.execPath, [path.join(fixture.skillRoot, "scripts", script), ...args], {
    cwd: fixture.root,
    encoding: "utf8"
  });
  const output = JSON.parse(result.stdout || "{}");
  return { ...result, output };
}

function expectOk(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.ok, true, JSON.stringify(result.output));
  return result.output;
}

function expectFail(result, code) {
  assert.notEqual(result.status, 0);
  assert.equal(result.output.ok, false, JSON.stringify(result.output));
  assert.equal(result.output.error.code, code, JSON.stringify(result.output));
  assertNoRawSecrets(result.stdout + result.stderr);
  return result.output;
}

function assertNoRawSecrets(text) {
  for (const secret of rawSecrets) {
    assert.doesNotMatch(text, new RegExp(escapeRe(secret), "i"), `raw secret leaked: ${secret}`);
  }
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
