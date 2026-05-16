import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

export const skillRoot = path.resolve(import.meta.dirname, "..");
export const projectRoot = path.resolve(skillRoot, "..");

export function run(script, args = [], options = {}) {
  const result = spawnSync(process.execPath, [path.join(skillRoot, "scripts", script), ...args], {
    cwd: options.cwd || projectRoot,
    encoding: "utf8"
  });
  const output = JSON.parse(result.stdout || "{}");
  return { ...result, output };
}

export function expectOk(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.ok, true, JSON.stringify(result.output));
  return result.output;
}

export function expectFail(result, code) {
  assert.notEqual(result.status, 0);
  assert.equal(result.output.ok, false, JSON.stringify(result.output));
  assert.equal(result.output.error.code, code, JSON.stringify(result.output));
  assert.doesNotMatch(result.stdout + result.stderr, /raw-secret-token|local-test-hmac-secret|postgres:\/\/|password|DB_OPEN_FAILED.*stack/i);
  return result.output;
}
