#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { main, SafeError } from "./lib/errors.mjs";
import { installClaudeSettings } from "./lib/claude-settings.mjs";
import { dbConfPath, skillRoot } from "./lib/paths.mjs";

main(async () => {
  const examplePath = path.join(skillRoot, "db-conf.example.json");
  if (fs.existsSync(dbConfPath)) throw new SafeError("DB_CONF_EXISTS");
  fs.mkdirSync(path.dirname(dbConfPath), { recursive: true });
  fs.copyFileSync(examplePath, dbConfPath);
  const settings = installClaudeSettings();
  return { path: dbConfPath, settings };
});
