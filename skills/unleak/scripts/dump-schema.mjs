#!/usr/bin/env node
import fs from "node:fs";
import { main, SafeError } from "./lib/errors.mjs";
import { loadConfig, getConnection } from "./lib/config.mjs";
import { backupIfExists, writeJson } from "./lib/fs-json.mjs";
import { schemaBackupDir, schemaPath } from "./lib/paths.mjs";
import { parseArgs } from "./lib/args.mjs";
import { assertDependenciesReady } from "./lib/readiness.mjs";

let openSqlite;
let withPostgres;

main(async () => {
  assertDependenciesReady();
  ({ openSqlite, withPostgres } = await import("./lib/db.mjs"));
  const args = parseArgs();
  const config = loadConfig();
  const connections = args.connection ? [getConnection(config, args.connection)] : config.connections;
  const written = [];
  for (const connection of connections) {
    const schema = connection.dialect === "sqlite" ? dumpSqlite(connection) : await dumpPostgres(connection);
    const target = schemaPath(connection.name);
    backupIfExists(target, schemaBackupDir);
    writeJson(target, schema);
    written.push({ connection: connection.name, path: target });
  }
  return { schemas: written };
});

function dumpSqlite(connection) {
  const db = openSqlite(connection, true);
  try {
    const objects = db.prepare("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const fks = new Map();
    return baseSchema(connection, objects.map((object) => {
      const tableInfo = db.prepare(`PRAGMA table_info("${object.name.replaceAll('"', '""')}")`).all();
      const fkInfo = object.type === "table" ? db.prepare(`PRAGMA foreign_key_list("${object.name.replaceAll('"', '""')}")`).all() : [];
      fks.set(object.name, fkInfo);
      return {
        name: object.name,
        type: object.type,
        columns: tableInfo.map((column) => {
          const fk = fkInfo.find((item) => item.from === column.name);
          return {
            name: column.name,
            dataType: column.type || "unknown",
            nullable: column.notnull !== 1,
            primaryKey: column.pk > 0,
            ...(fk ? { foreignKey: { table: fk.table, column: fk.to } } : {})
          };
        })
      };
    }));
  } catch {
    throw new SafeError("SCHEMA_DUMP_FAILED");
  } finally {
    db.close();
  }
}

async function dumpPostgres(connection) {
  return withPostgres(connection, async (client) => {
    try {
      const objectsResult = await client.query(`
        SELECT table_name AS name, table_type AS kind
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type IN ('BASE TABLE','VIEW')
        ORDER BY table_name
      `);
      const columnsResult = await client.query(`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY ordinal_position
      `);
      const pkResult = await client.query(`
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
      `);
      const fkResult = await client.query(`
        SELECT kcu.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
      `);
      const pk = new Set(pkResult.rows.map((row) => `${row.table_name}.${row.column_name}`));
      const fk = new Map(fkResult.rows.map((row) => [`${row.table_name}.${row.column_name}`, { table: row.foreign_table_name, column: row.foreign_column_name }]));
      const byTable = new Map();
      for (const column of columnsResult.rows) {
        if (!byTable.has(column.table_name)) byTable.set(column.table_name, []);
        const fkValue = fk.get(`${column.table_name}.${column.column_name}`);
        byTable.get(column.table_name).push({
          name: column.column_name,
          dataType: column.data_type,
          nullable: column.is_nullable === "YES",
          primaryKey: pk.has(`${column.table_name}.${column.column_name}`),
          ...(fkValue ? { foreignKey: fkValue } : {})
        });
      }
      return baseSchema(connection, objectsResult.rows.map((object) => ({
        name: object.name,
        type: object.kind === "VIEW" ? "view" : "table",
        columns: byTable.get(object.name) || []
      })));
    } catch {
      throw new SafeError("SCHEMA_DUMP_FAILED");
    }
  });
}

function baseSchema(connection, objects) {
  return {
    schemaVersion: 1,
    connection: connection.name,
    dialect: connection.dialect,
    generatedAt: new Date().toISOString(),
    objects
  };
}
