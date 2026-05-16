#!/usr/bin/env node
import { main, SafeError } from "./lib/errors.mjs";
import { checkReadiness, configSuggestion, readinessSuggestion } from "./lib/readiness.mjs";

main(async () => {
  const result = checkReadiness();
  if (!result.ready) {
    const hasMissingConfig = result.checks.some((check) => check.name === "local/db-conf.json" && !check.ok);
    const hasMissingDependencies = result.checks.some((check) => check.name !== "local/db-conf.json" && !check.ok);
    const code = hasMissingDependencies ? "DEPENDENCIES_NOT_INSTALLED" : "CONFIG_NOT_FOUND";
    const message = hasMissingDependencies ? "Unleak dependencies are not installed." : "Unleak config is not ready.";
    throw new SafeError(code, message, {
      skillRoot: result.skillRoot,
      missing: result.missing,
      suggestions: [
        ...(hasMissingDependencies ? [readinessSuggestion(result.skillRoot)] : []),
        ...(hasMissingConfig ? [configSuggestion(result.skillRoot)] : [])
      ]
    });
  }
  return result;
});
