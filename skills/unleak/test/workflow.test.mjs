import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { run, expectOk, expectFail, skillRoot } from "./helpers.mjs";

test("sqlite lifecycle protects active policy data", () => {
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-workflow-"));

  const schemaOut = expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  assert.equal(schemaOut.schemas[0].connection, "sales_sqlite");
  const schema = JSON.parse(fs.readFileSync(path.join(skillRoot, "local", "schema", "sales_sqlite.schema.json"), "utf8"));
  const customers = schema.objects.find((object) => object.name === "customers");
  assert(customers.columns.find((column) => column.name === "id" && column.primaryKey));
  assert(customers.columns.find((column) => column.name === "customer_email"));
  assert.doesNotMatch(JSON.stringify(schema), /alice@example.com|raw-secret-token/);

  const proposalOut = expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  assert.equal(proposalOut.proposals[0].connection, "sales_sqlite");
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  const proposal = JSON.parse(fs.readFileSync(proposalPath, "utf8"));
  const customerPolicy = proposal.objects.find((object) => object.name === "customers");
  assert.equal(customerPolicy.columns.find((column) => column.name === "customer_email").policy, "masked");
  assert.equal(customerPolicy.columns.find((column) => column.name === "national_id").policy, "hidden");
  assert.equal(proposal.objects.find((object) => object.name === "audit_log").objectPolicy, "disabled");

  expectOk(run("validate-policy.mjs", [proposalPath], { cwd }));
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));
  expectOk(run("validate-policy.mjs", ["--active"]));

  const visible = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount AS amount_out, category FROM orders ORDER BY amount_out"]));
  assert.equal(visible.ok, true);
});

test("query output masks, hashes, omits hidden, writes csv, and rejects leaks", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-query-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));
  const star = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT * FROM customers ORDER BY status"]));
  assert.equal(star.format, "csv");
  assert(star.columnsReturned.includes("customer_email"));
  assert(star.columnsRemoved.includes("national_id"));
  assert.match(star.csv, /h_[0-9a-f]{16}/);
  assert.match(star.csv, /a\*\*\*@example.com/);
  assert.doesNotMatch(star.csv, /alice@example.com|1101700200001/);

  expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT national_id FROM customers"]), "SQL_HIDDEN_COLUMN_SELECTED");
  expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT status FROM customers WHERE customer_email = 'alice@example.com'"]), "SQL_PROTECTED_COLUMN_IN_WHERE");
  expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT id FROM audit_log"]), "SQL_DISABLED_OBJECT");

  const grouped = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT customer_id AS customer_key, COUNT(*) AS order_count FROM orders GROUP BY customer_id"]));
  assert.equal(grouped.rowCount, 3);
  assert.match(grouped.csv, /^customer_key,order_count\n(?:h_[0-9a-f]{16},[0-9]+\n)+$/);
  assert.doesNotMatch(grouped.csv, /(^|,)1,|(^|,)2,|(^|,)3,/);
  const groupedHidden = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT COUNT(*) AS note_count FROM orders GROUP BY note"]));
  assert.equal(groupedHidden.rowCount, 4);
  assert.doesNotMatch(groupedHidden.csv, /vip customer|ship quickly|contains, comma|line/);

  const out = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount, 'contains, comma' AS sample FROM orders", "--out", "unleak-query-output/orders.csv", "--force"], { cwd }));
  assert.equal(out.format, "csv_file");
  const csv = fs.readFileSync(path.join(cwd, "unleak-query-output", "orders.csv"), "utf8");
  assert.match(csv, /amount,sample/);
  assert.match(csv, /"contains, comma"/);
  expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders", "--out", "../bad.csv"]), "OUTPUT_PATH_INVALID");
});

test("query supports enabled views as first-class objects", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-view-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));

  const result = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT category, order_count, total_amount FROM order_summary ORDER BY category"]));
  assert.equal(result.rowCount, 3);
  assert.deepEqual(result.columnsReturned, ["category", "order_count", "total_amount"]);
  assert.match(result.csv, /software,2,1450\.5/);
});

test("query preconditions and output overwrite gates are safe", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-gates-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));

  expectFail(run("query.mjs", ["--sql", "SELECT amount FROM orders"]), "CONNECTION_REQUIRED");
  expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders", "--file", "q.sql"]), "QUERY_INPUT_INVALID");
  expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--file", "missing.sql"], { cwd }), "QUERY_FILE_NOT_FOUND");
  const dryRun = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders", "--dry-run"]));
  assert.equal(dryRun.dryRun, true);

  fs.writeFileSync(path.join(cwd, "visible-query.sql"), "SELECT amount FROM orders ORDER BY amount");
  const fileQuery = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--file", "visible-query.sql", "--limit", "1"], { cwd }));
  assert.equal(fileQuery.rowCount, 1);
  assert.deepEqual(fileQuery.columnsReturned, ["amount"]);

  expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders", "--out", "out.csv"], { cwd }));
  expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders", "--out", "out.csv"], { cwd }), "OUTPUT_EXISTS");
  expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders", "--out", path.join(cwd, "absolute.csv")], { cwd }), "OUTPUT_PATH_INVALID");
  const nestedOut = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders", "--out", "nested/results/out.csv"], { cwd }));
  assert.equal(nestedOut.outputPath, "./nested/results/out.csv");
  assert(fs.existsSync(path.join(cwd, "nested", "results", "out.csv")));
});

test("query fails closed when schema or active policy is missing", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-missing-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));

  const schemaPath = path.join(skillRoot, "local", "schema", "sales_sqlite.schema.json");
  const schemaHold = path.join(cwd, "sales_sqlite.schema.json.hold");
  fs.renameSync(schemaPath, schemaHold);
  try {
    expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders"]), "SCHEMA_NOT_FOUND");
  } finally {
    fs.renameSync(schemaHold, schemaPath);
  }

  const activePath = path.join(skillRoot, "local", "active-policies", "sales_sqlite.json");
  const activeHold = path.join(cwd, "sales_sqlite.active.json.hold");
  fs.renameSync(activePath, activeHold);
  try {
    expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders"]), "ACTIVE_POLICY_NOT_FOUND");
  } finally {
    fs.renameSync(activeHold, activePath);
  }
});

test("query applies requested row limit under connection max", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-limit-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));

  const limited = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders ORDER BY amount", "--limit", "2"]));
  assert.equal(limited.limitApplied, 2);
  assert.equal(limited.rowCount, 2);
  const capped = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders ORDER BY amount", "--limit", "999"]));
  assert.equal(capped.limitApplied, 20);
  assert.equal(capped.rowCount, 4);
  const defaultLimited = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders UNION ALL SELECT amount FROM orders"]));
  assert.equal(defaultLimited.limitApplied, 5);
  assert.equal(defaultLimited.rowCount, 5);
});

test("query errors do not echo comments, original SQL, or sensitive literals", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-error-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));

  const sqlPath = path.join(cwd, "query.sql");
  fs.writeFileSync(sqlPath, "-- raw marker alice@example.com\nSELECT status FROM customers WHERE customer_email = 'alice@example.com'");
  const result = run("query.mjs", ["--connection", "sales_sqlite", "--file", "query.sql"], { cwd });
  expectFail(result, "SQL_PROTECTED_COLUMN_IN_WHERE");
  assert.doesNotMatch(result.stdout + result.stderr, /raw marker|alice@example.com|SELECT status/);

  const directSql = "-- direct marker alice@example.com\nSELECT status FROM customers WHERE customer_email = 'alice@example.com'";
  const directResult = run("query.mjs", ["--connection", "sales_sqlite", "--sql", directSql]);
  expectFail(directResult, "SQL_PROTECTED_COLUMN_IN_WHERE");
  assert.doesNotMatch(directResult.stdout + directResult.stderr, /direct marker|alice@example.com|SELECT status/);
});

test("stale schema execution errors are sanitized", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-stale-query-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));

  const dbPath = path.join(skillRoot, "test", "fixtures", "sales.sqlite");
  const db = new Database(dbPath);
  try {
    db.exec("DROP TABLE orders");
  } finally {
    db.close();
  }

  const result = run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders"]);
  expectFail(result, "SCHEMA_STALE_OR_QUERY_INVALID");
  assert.doesNotMatch(result.stdout + result.stderr, /no such table|SQLITE_|DROP TABLE|orders/);
});

test("dry-run validates policy without executing stale database query", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-dry-run-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));

  const dbPath = path.join(skillRoot, "test", "fixtures", "sales.sqlite");
  const db = new Database(dbPath);
  try {
    db.exec("DROP TABLE orders");
  } finally {
    db.close();
  }

  const dryRun = expectOk(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT amount FROM orders", "--dry-run"]));
  assert.equal(dryRun.dryRun, true);
  assert.deepEqual(dryRun.columnsReturned, ["amount"]);
});

test("hashed or joinable output fails closed when HMAC secret is missing", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-no-hmac-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));

  const configPath = path.join(skillRoot, "local", "db-conf.json");
  const original = fs.readFileSync(configPath, "utf8");
  try {
    const config = JSON.parse(original);
    delete config.hmacSecret;
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    expectFail(run("query.mjs", ["--connection", "sales_sqlite", "--sql", "SELECT id FROM customers"]), "HMAC_SECRET_REQUIRED");
  } finally {
    fs.writeFileSync(configPath, original);
  }
});
