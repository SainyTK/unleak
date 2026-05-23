import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const skillRoot = path.resolve(import.meta.dirname, "..");
const testDir = path.join(skillRoot, "test");
const args = new Set(process.argv.slice(2));

const setup = spawnSync(process.execPath, [path.join(testDir, "setup-sqlite.mjs")], {
  cwd: skillRoot,
  stdio: "inherit"
});
if (setup.status !== 0) process.exit(setup.status ?? 1);

const testFiles = fs.readdirSync(testDir)
  .filter((file) => file.endsWith(".test.mjs"))
  .sort()
  .map((file) => path.join(testDir, file));

const env = { ...process.env };
if (args.has("--postgres")) env.UNLEAK_POSTGRES_TEST = "1";
if (args.has("--mysql")) env.UNLEAK_MYSQL_TEST = "1";
if (args.has("--postgres-active")) {
  env.UNLEAK_POSTGRES_TEST = "1";
  env.UNLEAK_POSTGRES_ACTIVE_TEST = "1";
}
if (args.has("--mysql-active")) {
  env.UNLEAK_MYSQL_TEST = "1";
  env.UNLEAK_MYSQL_ACTIVE_TEST = "1";
}

const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...testFiles], {
  cwd: skillRoot,
  env,
  stdio: "inherit"
});

process.exitCode = result.status ?? 1;
