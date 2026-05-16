#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { main, SafeError } from "./lib/errors.mjs";
import { readJson, writeJson, backupIfExists } from "./lib/fs-json.mjs";
import { activePolicyBackupDir, activePolicyPath, schemaPath } from "./lib/paths.mjs";
import { validatePolicyAgainstSchema } from "./lib/policy.mjs";

function cleanupProposal(file) {
  fs.unlinkSync(file);
  const reviewDir = path.dirname(file);
  if (path.basename(reviewDir) !== "unleak-policy-review") return null;
  try {
    fs.rmdirSync(reviewDir);
    return reviewDir;
  } catch (error) {
    if (error.code === "ENOTEMPTY" || error.code === "ENOENT") return null;
    throw error;
  }
}

main(async () => {
  const input = process.argv[2];
  if (!input) throw new SafeError("POLICY_FILE_REQUIRED");
  const proposalPath = path.resolve(process.cwd(), input);
  const policy = readJson(proposalPath, "POLICY_NOT_FOUND", "POLICY_INVALID");
  const schema = readJson(schemaPath(policy.connection), "SCHEMA_NOT_FOUND", "SCHEMA_INVALID");
  validatePolicyAgainstSchema(policy, schema);
  const active = { ...policy, activatedAt: new Date().toISOString() };
  const target = activePolicyPath(policy.connection);
  const backupPath = backupIfExists(target, activePolicyBackupDir);
  writeJson(target, active);
  const removedReviewDir = cleanupProposal(proposalPath);
  return { connection: policy.connection, activePolicyPath: target, backupPath, removedProposalPath: proposalPath, removedReviewDir };
});
