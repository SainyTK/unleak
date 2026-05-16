import path from "node:path";
import { fileURLToPath } from "node:url";

export const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const localDir = path.join(skillRoot, "local");
export const dbConfPath = path.join(localDir, "db-conf.json");
export const schemaDir = path.join(localDir, "schema");
export const schemaBackupDir = path.join(schemaDir, ".backups");
export const activePolicyDir = path.join(localDir, "active-policies");
export const activePolicyBackupDir = path.join(activePolicyDir, ".backups");

export function schemaPath(connection) {
  return path.join(schemaDir, `${connection}.schema.json`);
}

export function activePolicyPath(connection) {
  return path.join(activePolicyDir, `${connection}.json`);
}

export function proposalPath(cwd, connection) {
  return path.join(cwd, "unleak-policy-review", `${connection}.policy.proposed.json`);
}

export function relFromCwd(target, cwd = process.cwd()) {
  return path.relative(cwd, target) || ".";
}
