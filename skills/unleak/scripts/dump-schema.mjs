#!/usr/bin/env node
import { main } from "./lib/errors.mjs";
import { loadConfig, getConnection } from "./lib/config.mjs";
import { backupIfExists, writeJson } from "./lib/fs-json.mjs";
import { schemaBackupDir, schemaPath } from "./lib/paths.mjs";
import { parseArgs } from "./lib/args.mjs";
import { assertDependenciesReady } from "./lib/readiness.mjs";

let dialectAdapter;

main(async () => {
  assertDependenciesReady();
  ({ dialectAdapter } = await import("./lib/dialect-adapters.mjs"));
  const args = parseArgs();
  const config = loadConfig();
  const connections = args.connection ? [getConnection(config, args.connection)] : config.connections;
  const written = [];
  for (const connection of connections) {
    const schemas = await dialectAdapter(connection).dumpSchemas(config, connection, args.schema);
    for (const schema of schemas) {
      const target = schemaPath(schema.connection, schema.schema);
      backupIfExists(target, schemaBackupDir);
      writeJson(target, schema);
      written.push({ connection: schema.connection, ...(schema.schema ? { schema: schema.schema, scope: schema.scope } : {}), path: target });
    }
  }
  return { schemas: written };
});
