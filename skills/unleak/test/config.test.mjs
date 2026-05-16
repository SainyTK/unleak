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
    { name: "sales_pg", dialect: "postgres" }
  ]);
  assert.doesNotMatch(JSON.stringify(output), /localhost|local-test-hmac-secret|5432/);
});

test("install-claude-settings creates and deduplicates deny rules", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-settings-"));
  const settingsPath = path.join(cwd, ".claude", "settings.json");
  const first = expectOk(run("install-claude-settings.mjs", [], { cwd }));
  const second = expectOk(run("install-claude-settings.mjs", [], { cwd }));
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal(first.denyRulesAdded, 17);
  assert.equal(second.denyRulesAdded, 0);
  assert(settings.permissions.deny.every((rule) => !/\((\/|[A-Za-z]:[\\/])/.test(rule)));
  assert(settings.permissions.deny.some((rule) => rule === "Bash(*activate-policy*)"));
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
  assert.deepEqual(settings.permissions.allow, ["Read(**/*.sql)"]);
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
  assert.throws(() => validateConfig({ ...base, connections: [{ name: "bad", dialect: "mysql", credentials: {} }] }), /DB_CONF_INVALID/);
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
  assert.doesNotThrow(() => validateConfig(example));
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
