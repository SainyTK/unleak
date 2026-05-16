import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validatePolicyAgainstSchema } from "../scripts/lib/policy.mjs";
import { run, expectOk, expectFail, skillRoot } from "./helpers.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sqliteWorkflow(cwd) {
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const schema = JSON.parse(fs.readFileSync(path.join(skillRoot, "local", "schema", "sales_sqlite.schema.json"), "utf8"));
  const proposalPath = path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json");
  const policy = JSON.parse(fs.readFileSync(proposalPath, "utf8"));
  return { schema, policy, proposalPath };
}

test("policy validation fails missing and unknown schema items", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-policy-"));
  const { schema, policy } = sqliteWorkflow(cwd);
  assert.doesNotThrow(() => validatePolicyAgainstSchema(policy, schema));

  const missingObject = clone(policy);
  missingObject.objects.pop();
  assert.throws(() => validatePolicyAgainstSchema(missingObject, schema), /POLICY_MISSING_OBJECT/);

  const unknownObject = clone(policy);
  unknownObject.objects.push({ name: "ghost", type: "table", objectPolicy: "enabled", columns: [] });
  assert.throws(() => validatePolicyAgainstSchema(unknownObject, schema), /POLICY_UNKNOWN_OBJECT/);

  const unknownColumn = clone(policy);
  unknownColumn.objects[0].columns.push({ name: "ghost_col", policy: "visible" });
  assert.throws(() => validatePolicyAgainstSchema(unknownColumn, schema), /POLICY_UNKNOWN_COLUMN/);

  const invalidMask = clone(policy);
  const masked = invalidMask.objects.flatMap((object) => object.columns).find((column) => column.policy === "masked");
  masked.maskOptions = { mode: "bad" };
  assert.throws(() => validatePolicyAgainstSchema(invalidMask, schema), /POLICY_INVALID_MASK_OPTIONS/);

  const typeMismatch = clone(policy);
  typeMismatch.objects[0].type = typeMismatch.objects[0].type === "table" ? "view" : "table";
  assert.throws(() => validatePolicyAgainstSchema(typeMismatch, schema), /POLICY_OBJECT_TYPE_MISMATCH/);

  const invalidObjectPolicy = clone(policy);
  invalidObjectPolicy.objects[0].objectPolicy = "maybe";
  assert.throws(() => validatePolicyAgainstSchema(invalidObjectPolicy, schema), /POLICY_INVALID_OBJECT_POLICY/);

  const invalidColumnPolicy = clone(policy);
  invalidColumnPolicy.objects[0].columns[0].policy = "maybe";
  assert.throws(() => validatePolicyAgainstSchema(invalidColumnPolicy, schema), /POLICY_INVALID_COLUMN_POLICY/);

  const disabledMissingColumn = clone(policy);
  const disabledObject = disabledMissingColumn.objects.find((object) => object.objectPolicy === "disabled");
  disabledObject.columns.pop();
  assert.throws(() => validatePolicyAgainstSchema(disabledMissingColumn, schema), /POLICY_MISSING_COLUMN/);
});

test("proposal refuses overwrite unless forced", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-proposal-"));
  sqliteWorkflow(cwd);
  expectFail(run("propose-policy.mjs", ["--connection", "sales_sqlite"], { cwd }), "PROPOSAL_EXISTS");
  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
});

test("propose-policy default writes proposals for all local schema files", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-propose-all-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  const output = expectOk(run("propose-policy.mjs", ["--force"], { cwd }));
  const connections = output.proposals.map((item) => item.connection);
  assert(connections.includes("sales_sqlite"));
  assert(connections.includes("sales_pg"));
  assert(fs.existsSync(path.join(cwd, "unleak-policy-review", "sales_sqlite.policy.proposed.json")));
  assert(fs.existsSync(path.join(cwd, "unleak-policy-review", "sales_pg.policy.proposed.json")));
});

test("schema dump includes no sample values", () => {
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  const schemaText = fs.readFileSync(path.join(skillRoot, "local", "schema", "sales_sqlite.schema.json"), "utf8");
  assert.doesNotMatch(schemaText, /alice@example.com|Bob Lee|raw-secret-token|vip customer/);
});

test("validate-policy default and active modes validate expected files", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-validate-cli-"));
  const { proposalPath } = sqliteWorkflow(cwd);
  const defaultOut = expectOk(run("validate-policy.mjs", [], { cwd }));
  assert(defaultOut.validated.some((item) => item.connection === "sales_sqlite" && item.path.endsWith("sales_sqlite.policy.proposed.json")));
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));
  const activeOut = expectOk(run("validate-policy.mjs", ["--active"], { cwd }));
  assert(activeOut.validated.some((item) => item.connection === "sales_sqlite"));
});

test("active policy validation fails after schema drift", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-stale-active-"));
  const { proposalPath } = sqliteWorkflow(cwd);
  expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));

  const schemaPath = path.join(skillRoot, "local", "schema", "sales_sqlite.schema.json");
  const original = fs.readFileSync(schemaPath, "utf8");
  try {
    const schema = JSON.parse(original);
    schema.objects.find((object) => object.name === "customers").columns.push({
      name: "new_sensitive_column",
      dataType: "text",
      nullable: true,
      primaryKey: false
    });
    fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
    expectFail(run("validate-policy.mjs", ["--active"], { cwd }), "POLICY_MISSING_COLUMN");
  } finally {
    fs.writeFileSync(schemaPath, original);
  }
});

test("schema dump backs up previous schema", () => {
  const backupDir = path.join(skillRoot, "local", "schema", ".backups");
  const before = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).length : 0;
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  const after = fs.readdirSync(backupDir).length;
  assert(after > before);
});

test("activation adds activatedAt, preserves generatedAt, and backs up previous active policy", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-activate-"));
  const { proposalPath } = sqliteWorkflow(cwd);
  const reviewDir = path.dirname(proposalPath);
  const backupDir = path.join(skillRoot, "local", "active-policies", ".backups");
  const before = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).length : 0;

  const first = expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));
  assert.equal(first.removedProposalPath, proposalPath);
  assert.equal(first.removedReviewDir, reviewDir);
  assert.equal(fs.existsSync(proposalPath), false);
  assert.equal(fs.existsSync(reviewDir), false);

  expectOk(run("propose-policy.mjs", ["--connection", "sales_sqlite", "--force"], { cwd }));
  const secondPolicy = JSON.parse(fs.readFileSync(proposalPath, "utf8"));
  const second = expectOk(run("activate-policy.mjs", [proposalPath], { cwd }));
  const active = JSON.parse(fs.readFileSync(path.join(skillRoot, "local", "active-policies", "sales_sqlite.json"), "utf8"));
  const after = fs.readdirSync(backupDir).length;

  assert.equal(active.generatedAt, secondPolicy.generatedAt);
  assert.match(active.activatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(first.connection, "sales_sqlite");
  assert.equal(second.connection, "sales_sqlite");
  assert(after > before);
});

test("activation keeps review folder when other proposed policies remain", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-activate-partial-"));
  spawnSync(process.execPath, [path.join(skillRoot, "test", "setup-sqlite.mjs")], { encoding: "utf8" });
  expectOk(run("dump-schema.mjs", ["--connection", "sales_sqlite"]));
  expectOk(run("propose-policy.mjs", ["--force"], { cwd }));

  const reviewDir = path.join(cwd, "unleak-policy-review");
  const sqliteProposal = path.join(reviewDir, "sales_sqlite.policy.proposed.json");
  const pgProposal = path.join(reviewDir, "sales_pg.policy.proposed.json");
  const output = expectOk(run("activate-policy.mjs", [sqliteProposal], { cwd }));

  assert.equal(output.removedProposalPath, sqliteProposal);
  assert.equal(output.removedReviewDir, null);
  assert.equal(fs.existsSync(sqliteProposal), false);
  assert.equal(fs.existsSync(pgProposal), true);
  assert.equal(fs.existsSync(reviewDir), true);
});
