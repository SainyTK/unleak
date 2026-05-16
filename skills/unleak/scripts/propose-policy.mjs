#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { main, SafeError } from "./lib/errors.mjs";
import { parseArgs } from "./lib/args.mjs";
import { readJson, writeJson } from "./lib/fs-json.mjs";
import { proposalPath, schemaDir, schemaPath } from "./lib/paths.mjs";
import { proposePolicy } from "./lib/propose.mjs";

main(async () => {
  const args = parseArgs();
  const schemaFiles = args.connection ? [schemaPath(args.connection)] : fs.readdirSync(schemaDir).filter((file) => file.endsWith(".schema.json")).map((file) => path.join(schemaDir, file));
  if (schemaFiles.length === 0) throw new SafeError("SCHEMA_NOT_FOUND");
  const proposals = [];
  for (const file of schemaFiles) {
    const schema = readJson(file, "SCHEMA_NOT_FOUND", "SCHEMA_INVALID");
    const target = proposalPath(process.cwd(), schema.connection);
    if (fs.existsSync(target) && !args.force) throw new SafeError("PROPOSAL_EXISTS");
    writeJson(target, proposePolicy(schema));
    proposals.push({ connection: schema.connection, path: target });
  }
  return { proposals };
});
