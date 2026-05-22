import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./fs-json.mjs";
import { dbConfPath, relFromCwd, skillRoot } from "./paths.mjs";

export function installClaudeSettings(cwd = process.cwd()) {
  const settingsPath = path.join(cwd, ".claude", "settings.json");
  const existing = fs.existsSync(settingsPath) ? readJson(settingsPath, "SETTINGS_NOT_FOUND", "SETTINGS_INVALID") : {};
  const allow = requiredAllows();
  const deny = requiredDenies(cwd);
  const permissions = existing.permissions || {};
  const currentAllow = Array.isArray(permissions.allow) ? permissions.allow : [];
  const currentDeny = Array.isArray(permissions.deny) ? permissions.deny : [];
  const mergedAllow = Array.from(new Set([...currentAllow, ...allow]));
  const mergedDeny = Array.from(new Set([...currentDeny, ...deny]));
  const next = { ...existing, permissions: { ...permissions, allow: mergedAllow, deny: mergedDeny } };
  writeJson(settingsPath, next);
  return {
    settingsPath,
    allowRulesAdded: mergedAllow.length - currentAllow.length,
    allowRulesTotal: mergedAllow.length,
    denyRulesAdded: mergedDeny.length - currentDeny.length,
    denyRulesTotal: mergedDeny.length
  };
}

export function requiredAllows() {
  return [
    "Skill(unleak)",
    "Bash(node .claude/skills/unleak/scripts/*.mjs*)",
    "Write(.claude/skills/unleak/local/queries/*.sql)",
    "Edit(.claude/skills/unleak/local/queries/*.sql)",
    "MultiEdit(.claude/skills/unleak/local/queries/*.sql)",
    "Write(./unleak-policy-review/**)",
    "Edit(./unleak-policy-review/**)",
    "MultiEdit(./unleak-policy-review/**)"
  ];
}

export function requiredDenies(cwd = process.cwd()) {
  const dbConfRel = relFromCwd(dbConfPath, cwd);
  const scriptsRel = relFromCwd(path.join(skillRoot, "scripts/**"), cwd);
  const schemaRel = relFromCwd(path.join(skillRoot, "local/schema/**"), cwd);
  const activePoliciesRel = relFromCwd(path.join(skillRoot, "local/active-policies/**"), cwd);

  return [
    `Read(${dbConfRel})`,
    `Edit(${dbConfRel})`,
    `MultiEdit(${dbConfRel})`,
    `Write(${dbConfRel})`,
    `Edit(${scriptsRel})`,
    `MultiEdit(${scriptsRel})`,
    `Write(${scriptsRel})`,
    `Edit(${schemaRel})`,
    `MultiEdit(${schemaRel})`,
    `Write(${schemaRel})`,
    `Edit(${activePoliciesRel})`,
    `MultiEdit(${activePoliciesRel})`,
    `Write(${activePoliciesRel})`,
    "Bash(*activate-policy*)",
    "Bash(psql*)",
    "Bash(rtk psql*)",
    "Bash(sqlite3*)",
    "Bash(rtk sqlite3*)",
    "Bash(bq*)",
    "Bash(rtk bq*)",
    "Edit(.claude/settings.json)",
    "MultiEdit(.claude/settings.json)",
    "Write(.claude/settings.json)"
  ];
}
