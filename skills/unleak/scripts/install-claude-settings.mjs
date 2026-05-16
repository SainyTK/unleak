#!/usr/bin/env node
import { main } from "./lib/errors.mjs";
import { installClaudeSettings } from "./lib/claude-settings.mjs";

main(async () => {
  return installClaudeSettings();
});
