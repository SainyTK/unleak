#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { main } from "./lib/errors.mjs";
import { readJson, writeJson } from "./lib/fs-json.mjs";
import { dbConfPath, relFromCwd, skillRoot } from "./lib/paths.mjs";

main(async () => {
  const settingsPath = path.join(process.cwd(), ".claude", "settings.json");
  const existing = fs.existsSync(settingsPath) ? readJson(settingsPath, "SETTINGS_NOT_FOUND", "SETTINGS_INVALID") : {};
  const allow = requiredAllows();
  const deny = requiredDenies();
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
});

function requiredAllows() {
  return ["Bash(node .claude/skills/unleak/scripts/*.mjs*)"];
}

function requiredDenies() {
  const dbConfRel = relFromCwd(dbConfPath);
  const scriptsRel = relFromCwd(path.join(skillRoot, "scripts/**"));
  const schemaRel = relFromCwd(path.join(skillRoot, "local/schema/**"));
  const activePoliciesRel = relFromCwd(path.join(skillRoot, "local/active-policies/**"));

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
    "Edit(.claude/settings.json)",
    "MultiEdit(.claude/settings.json)",
    "Write(.claude/settings.json)"
  ];
}
