import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertDependenciesReady, checkReadiness, readinessSuggestion } from "../scripts/lib/readiness.mjs";
import { SafeError } from "../scripts/lib/errors.mjs";

test("readiness reports missing dependency install state without reading config", () => {
  const root = tempSkillRoot();
  const result = checkReadiness({ root, includeConfig: false });

  assert.equal(result.ready, false);
  assert(result.missing.includes(path.join(root, "node_modules")));
  assert(result.missing.includes("better-sqlite3"));
  assert(result.missing.includes("pg"));
  assert(result.missing.includes("node-sql-parser"));
  assert(!result.missing.some((item) => String(item).endsWith("local/db-conf.json")));
});

test("dependency assertion gives agent-safe npm install guidance", () => {
  const root = tempSkillRoot();

  assert.throws(
    () => assertDependenciesReady(root),
    (error) => {
      assert(error instanceof SafeError);
      assert.equal(error.code, "DEPENDENCIES_NOT_INSTALLED");
      assert.equal(error.details.command, "npm install");
      assert.equal(error.details.cwd, root);
      assert(error.details.suggestion.includes("retry the same command"));
      return true;
    }
  );
});

test("standalone readiness includes missing config path and suggestion", () => {
  const root = tempSkillRoot();
  fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
  const result = checkReadiness({ root });

  assert.equal(result.ready, false);
  assert(result.missing.includes(path.join(root, "local", "db-conf.json")));
  const configCheck = result.checks.find((check) => check.name === "local/db-conf.json");
  assert.equal(configCheck.details.command, "mkdir -p local && cp db-conf.example.json local/db-conf.json");
});

test("readiness npm suggestion points at the skill root", () => {
  const root = tempSkillRoot();
  assert.deepEqual(readinessSuggestion(root), {
    suggestion: "Run npm install from the Unleak skill root, then retry the same command.",
    command: "npm install",
    cwd: root
  });
});

function tempSkillRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "unleak-readiness-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
  return root;
}
