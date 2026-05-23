import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run, expectOk, expectFail, skillRoot } from "./helpers.mjs";
import { validateConfig } from "../scripts/lib/config.mjs";

test("list-connections returns safe metadata only", () => {
  const output = expectOk(run("list-connections.mjs"));
  assert.deepEqual(output.connections, [
    { name: "sales_sqlite", dialect: "sqlite" },
    { name: "sales_pg", dialect: "postgres" },
    { name: "sales_mysql", dialect: "mysql" }
  ]);
  assert.doesNotMatch(JSON.stringify(output), /localhost|local-test-hmac-secret|5432|3306|root/);
});

test("install-claude-settings creates and deduplicates deny rules", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-settings-"));
  const settingsPath = path.join(cwd, ".claude", "settings.json");
  const first = expectOk(run("install-claude-settings.mjs", [], { cwd }));
  const second = expectOk(run("install-claude-settings.mjs", [], { cwd }));
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal(first.allowRulesAdded, 8);
  assert.equal(second.allowRulesAdded, 0);
  assert(settings.permissions.allow.includes("Write(.claude/skills/unleak/local/queries/*.sql)"));
  assert(settings.permissions.allow.includes("Edit(.claude/skills/unleak/local/queries/*.sql)"));
  assert(settings.permissions.allow.includes("MultiEdit(.claude/skills/unleak/local/queries/*.sql)"));
  assert(settings.permissions.allow.includes("Write(./unleak-policy-review/**)"));
  assert(settings.permissions.allow.includes("Edit(./unleak-policy-review/**)"));
  assert(settings.permissions.allow.includes("MultiEdit(./unleak-policy-review/**)"));
  assert.equal(first.denyRulesAdded, 25);
  assert.equal(second.denyRulesAdded, 0);
  assert(settings.permissions.deny.every((rule) => !/\((\/|[A-Za-z]:[\\/])/.test(rule)));
  assert(settings.permissions.deny.some((rule) => rule === "Bash(*activate-policy*)"));
  assert(settings.permissions.deny.includes("Bash(psql*)"));
  assert(settings.permissions.deny.includes("Bash(rtk psql*)"));
  assert(settings.permissions.deny.includes("Bash(sqlite3*)"));
  assert(settings.permissions.deny.includes("Bash(rtk sqlite3*)"));
  assert(settings.permissions.deny.includes("Bash(mysql*)"));
  assert(settings.permissions.deny.includes("Bash(rtk mysql*)"));
  assert(settings.permissions.deny.includes("Bash(bq*)"));
  assert(settings.permissions.deny.includes("Bash(rtk bq*)"));
  assert(settings.permissions.deny.some((rule) => rule.startsWith("Read(") && rule.endsWith("local/db-conf.json)")));
});

test("install-claude-settings preserves existing settings and does not edit gitignore", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-settings-merge-"));
  const settingsPath = path.join(cwd, ".claude", "settings.json");
  const gitignorePath = path.join(cwd, ".gitignore");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify({
    model: "sonnet",
    permissions: { allow: ["Read(**/*.sql)"], deny: ["Read(/tmp/existing-secret)"] },
    hooks: { Stop: [] }
  }, null, 2));
  fs.writeFileSync(gitignorePath, "existing\n");

  expectOk(run("install-claude-settings.mjs", [], { cwd }));
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal(settings.model, "sonnet");
  assert(settings.permissions.allow.includes("Read(**/*.sql)"));
  assert(settings.permissions.allow.includes("Bash(node .claude/skills/unleak/scripts/*.mjs*)"));
  assert(settings.permissions.deny.includes("Read(/tmp/existing-secret)"));
  assert.deepEqual(settings.hooks, { Stop: [] });
  assert.equal(fs.readFileSync(gitignorePath, "utf8"), "existing\n");
});

test("config validation rejects duplicate names, unsafe names, and unsupported dialects", () => {
  const base = {
    hmacSecret: "x",
    connections: [
      { name: "safe", dialect: "sqlite", credentials: { path: "./x.sqlite" } }
    ]
  };
  assert.doesNotThrow(() => validateConfig(base));
  assert.throws(() => validateConfig({ ...base, connections: [...base.connections, base.connections[0]] }), /DB_CONF_INVALID/);
  assert.throws(() => validateConfig({ ...base, connections: [{ name: "../bad", dialect: "sqlite", credentials: { path: "./x.sqlite" } }] }), /DB_CONF_INVALID/);
  assert.throws(() => validateConfig({ ...base, connections: [{ name: "bad", dialect: "oracle", credentials: {} }] }), /DB_CONF_INVALID/);
  assert.doesNotThrow(() => validateConfig({
    hmacSecret: "x",
    connections: [{ name: "mysql_safe", dialect: "mysql", credentials: { host: "localhost", port: "3306", dbname: "unleak-evals", username: "root", password: "" } }]
  }));
});

test("config validation accepts BigQuery ADC shapes and rejects unsafe variants", () => {
  const authorizedUser = {
    hmacSecret: "x",
    connections: [{
      name: "warehouse_bq",
      dialect: "bigquery",
      credentials: {
        projectId: "project-a",
        adc: {
          type: "authorized_user",
          client_id: "client",
          client_secret: "secret",
          refresh_token: "refresh"
        }
      },
      options: { location: "US", maxBytesBilled: 1000, maxDatasetsPerSchemaDump: 2 }
    }]
  };
  const serviceAccount = {
    ...authorizedUser,
    connections: [{
      name: "warehouse_bq",
      dialect: "bigquery",
      credentials: {
        projectId: "project-a",
        adc: {
          type: "service_account",
          client_email: "svc@example.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\\n..."
        }
      }
    }]
  };
  assert.doesNotThrow(() => validateConfig(authorizedUser));
  assert.doesNotThrow(() => validateConfig(serviceAccount));
  assert.throws(() => validateConfig({
    ...authorizedUser,
    connections: [{ ...authorizedUser.connections[0], credentials: { projectId: "project-a", adc: { type: "external_account" } } }]
  }), /DB_CONF_INVALID/);
  assert.throws(() => validateConfig({
    ...authorizedUser,
    connections: [{ ...authorizedUser.connections[0], credentials: { projectId: "project-a", adc: { type: "authorized_user", client_id: "client" } } }]
  }), /DB_CONF_INVALID/);
  assert.throws(() => validateConfig({
    ...authorizedUser,
    connections: [{ ...authorizedUser.connections[0], maxBytesBilled: 1000 }]
  }), /DB_CONF_INVALID/);
});

test("db-conf.example.json uses documented object shape with sqlite and postgres examples", () => {
  const examplePath = path.join(skillRoot, "db-conf.example.json");
  const example = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  assert.equal(typeof example, "object");
  assert(!Array.isArray(example));
  assert.equal(typeof example.hmacSecret, "string");
  assert.equal(example.defaultLimit, 100);
  assert.equal(example.maxLimit, 500);
  assert(Array.isArray(example.connections));
  assert(example.connections.some((connection) => connection.dialect === "sqlite" && connection.credentials.path));
  assert(example.connections.some((connection) => connection.dialect === "postgres" && connection.credentials.host && connection.credentials.dbname && connection.credentials.username));
  assert(example.connections.some((connection) => connection.dialect === "mysql" && connection.credentials.host && connection.credentials.dbname && connection.credentials.username));
  assert(example.connections.some((connection) => connection.dialect === "bigquery" && connection.credentials.projectId && connection.credentials.adc?.type === "authorized_user" && connection.options?.maxBytesBilled));
  assert.doesNotThrow(() => validateConfig(example));
});

test("init-config creates local config from example and refuses overwrite", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-init-"));
  const configPath = path.join(skillRoot, "local", "db-conf.json");
  const settingsPath = path.join(fs.realpathSync(cwd), ".claude", "settings.json");
  const holdPath = path.join(os.tmpdir(), `unleak-db-conf-init-${process.pid}.json`);
  fs.renameSync(configPath, holdPath);
  try {
    const output = expectOk(run("init-config.mjs", [], { cwd }));
    assert.equal(output.path, configPath);
    assert.equal(output.settings.settingsPath, settingsPath);
    assert.equal(output.settings.denyRulesAdded, 25);
    const generated = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const example = JSON.parse(fs.readFileSync(path.join(skillRoot, "db-conf.example.json"), "utf8"));
    assert.deepEqual(generated, example);
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert(settings.permissions.deny.includes("Bash(psql*)"));
    assert(settings.permissions.deny.includes("Bash(sqlite3*)"));
    assert(settings.permissions.deny.includes("Bash(mysql*)"));
    assert(settings.permissions.deny.includes("Bash(bq*)"));
    expectFail(run("init-config.mjs", [], { cwd }), "DB_CONF_EXISTS");
  } finally {
    if (fs.existsSync(configPath)) fs.rmSync(configPath);
    fs.renameSync(holdPath, configPath);
  }
});

test("list-connections returns safe JSON errors for missing and invalid config", () => {
  const configPath = path.join(skillRoot, "local", "db-conf.json");
  const holdPath = path.join(os.tmpdir(), `unleak-db-conf-${process.pid}.json`);
  fs.renameSync(configPath, holdPath);
  try {
    expectFail(run("list-connections.mjs"), "DB_CONF_NOT_FOUND");
  } finally {
    fs.renameSync(holdPath, configPath);
  }

  const original = fs.readFileSync(configPath, "utf8");
  try {
    fs.writeFileSync(configPath, "{ invalid json");
    const result = run("list-connections.mjs");
    expectFail(result, "DB_CONF_INVALID");
    assert.doesNotMatch(result.stdout + result.stderr, /SyntaxError|at\s+|local-test-hmac-secret|localhost|5432/);
  } finally {
    fs.writeFileSync(configPath, original);
  }
});
