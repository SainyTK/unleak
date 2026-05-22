import path from "node:path";
import { fileURLToPath } from "node:url";

export const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const localDir = path.join(skillRoot, "local");
export const dbConfPath = path.join(localDir, "db-conf.json");
export const schemaDir = path.join(localDir, "schema");
export const schemaBackupDir = path.join(schemaDir, ".backups");
export const activePolicyDir = path.join(localDir, "active-policies");
export const activePolicyBackupDir = path.join(activePolicyDir, ".backups");

export function scopeKey(connection, schema = undefined) {
  return schema ? `${connection}__${schema}` : connection;
}

export function schemaPath(connection, schema = undefined) {
  return path.join(schemaDir, `${scopeKey(connection, schema)}.schema.json`);
}

export function activePolicyPath(connection, schema = undefined) {
  return path.join(activePolicyDir, `${scopeKey(connection, schema)}.json`);
}

export function proposalPath(cwd, connection, schema = undefined) {
  return path.join(cwd, "unleak-policy-review", `${scopeKey(connection, schema)}.policy.proposed.json`);
}

export function relFromCwd(target, cwd = process.cwd()) {
  return path.relative(cwd, target) || ".";
}
