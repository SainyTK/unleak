import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SafeError } from "./errors.mjs";
import { skillRoot } from "./paths.mjs";

const REQUIRED_PACKAGES = ["better-sqlite3", "pg", "mysql2", "node-sql-parser", "@google-cloud/bigquery"];
const MIN_NODE_MAJOR = 18;

export function assertDependenciesReady(root = skillRoot) {
  const result = checkReadiness({ root, includeConfig: false });
  const dependencyErrors = result.checks.filter((check) => check.required && !check.ok);
  if (dependencyErrors.length > 0) {
    throw new SafeError("DEPENDENCIES_NOT_INSTALLED", "Unleak dependencies are not installed.", dependencyDetails(root, dependencyErrors));
  }
  return true;
}

export function checkReadiness({ root = skillRoot, includeConfig = true } = {}) {
  const checks = [
    checkNodeVersion(),
    checkPackageJson(root),
    checkNodeModules(root),
    ...checkPackages(root)
  ];
  if (includeConfig) checks.push(checkConfig(root));

  return {
    ready: checks.every((check) => check.ok),
    skillRoot: root,
    checks,
    missing: checks.filter((check) => !check.ok).map((check) => check.path || check.name)
  };
}

export function readinessSuggestion(root = skillRoot) {
  return {
    suggestion: "Run npm install from the Unleak skill root, then retry the same command.",
    command: "npm install",
    cwd: root
  };
}

export function configSuggestion(root = skillRoot) {
  return {
    suggestion: "Ask the user to create local/db-conf.json from db-conf.example.json and edit it manually. Do not read local/db-conf.json.",
    command: "node scripts/init-config.mjs",
    cwd: root
  };
}

function dependencyDetails(root, checks) {
  return {
    ...readinessSuggestion(root),
    missing: checks.map((check) => check.path || check.name)
  };
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    name: "node",
    ok: Number.isInteger(major) && major >= MIN_NODE_MAJOR,
    required: true,
    version: process.version,
    minimum: `>=${MIN_NODE_MAJOR}`
  };
}

function checkPackageJson(root) {
  const target = path.join(root, "package.json");
  return {
    name: "package.json",
    path: target,
    ok: fs.existsSync(target),
    required: true
  };
}

function checkNodeModules(root) {
  const target = path.join(root, "node_modules");
  return {
    name: "node_modules",
    path: target,
    ok: fs.existsSync(target),
    required: true
  };
}

function checkPackages(root) {
  const requireFromRoot = createRequire(path.join(root, "package.json"));
  return REQUIRED_PACKAGES.map((packageName) => {
    try {
      requireFromRoot.resolve(packageName);
      return { name: packageName, ok: true, required: true };
    } catch {
      return { name: packageName, ok: false, required: true };
    }
  });
}

function checkConfig(root) {
  const target = path.join(root, "local", "db-conf.json");
  return {
    name: "local/db-conf.json",
    path: target,
    ok: fs.existsSync(target),
    required: true,
    details: fs.existsSync(target) ? undefined : configSuggestion(root)
  };
}
