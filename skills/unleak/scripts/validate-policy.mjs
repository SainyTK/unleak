#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { main, SafeError } from "./lib/errors.mjs";
import { parseArgs } from "./lib/args.mjs";
import { readJson } from "./lib/fs-json.mjs";
import { activePolicyDir, schemaPath } from "./lib/paths.mjs";
import { validatePolicyAgainstSchema } from "./lib/policy.mjs";

main(async () => {
  const args = parseArgs();
  const files = filesToValidate(args);
  if (files.length === 0) throw new SafeError("POLICY_NOT_FOUND");
  const validated = [];
  for (const file of files) {
    const policy = readJson(file, "POLICY_NOT_FOUND", "POLICY_INVALID");
    const schema = readJson(schemaPath(policy.connection), "SCHEMA_NOT_FOUND", "SCHEMA_INVALID");
    validatePolicyAgainstSchema(policy, schema);
    validated.push({ connection: policy.connection, path: file });
  }
  return { validated };
});

function filesToValidate(args) {
  if (args.active) {
    if (!fs.existsSync(activePolicyDir)) return [];
    return fs.readdirSync(activePolicyDir).filter((file) => file.endsWith(".json")).map((file) => path.join(activePolicyDir, file));
  }
  if (args._[0]) return [path.resolve(process.cwd(), args._[0])];
  const dir = path.join(process.cwd(), "unleak-policy-review");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((file) => file.endsWith(".policy.proposed.json")).map((file) => path.join(dir, file));
}
