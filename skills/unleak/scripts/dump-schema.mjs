#!/usr/bin/env node
import fs from "node:fs";
import { main, SafeError } from "./lib/errors.mjs";
import { assertBigQuerySchemaName, bigQueryOptions, loadConfig, getConnection } from "./lib/config.mjs";
import { backupIfExists, writeJson } from "./lib/fs-json.mjs";
import { schemaBackupDir, schemaPath, scopeKey } from "./lib/paths.mjs";
import { parseArgs } from "./lib/args.mjs";
import { assertDependenciesReady } from "./lib/readiness.mjs";

let openSqlite;
let withPostgres;
let withMysql;
let withBigQuery;

main(async () => {
  assertDependenciesReady();
  ({ openSqlite, withPostgres, withMysql, withBigQuery } = await import("./lib/db.mjs"));
  const args = parseArgs();
  const config = loadConfig();
  const connections = args.connection ? [getConnection(config, args.connection)] : config.connections;
  const written = [];
  for (const connection of connections) {
    const schemas = await dumpConnection(config, connection, args.schema);
    for (const schema of schemas) {
      const target = schemaPath(schema.connection, schema.schema);
      backupIfExists(target, schemaBackupDir);
      writeJson(target, schema);
      written.push({ connection: schema.connection, ...(schema.schema ? { schema: schema.schema, scope: schema.scope } : {}), path: target });
    }
  }
  return { schemas: written };
});

async function dumpConnection(config, connection, schemaName = undefined) {
  if (connection.dialect === "sqlite") {
    if (schemaName) throw new SafeError("SCHEMA_UNSUPPORTED");
    return [dumpSqlite(connection)];
  }
  if (connection.dialect === "postgres") {
    if (schemaName && schemaName !== "public") throw new SafeError("SCHEMA_UNSUPPORTED");
    return [await dumpPostgres(connection)];
  }
  if (connection.dialect === "mysql") {
    if (schemaName && schemaName !== connection.credentials.dbname) throw new SafeError("SCHEMA_UNSUPPORTED");
    return [await dumpMysql(connection)];
  }
  return dumpBigQuery(config, connection, schemaName);
}

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

async function dumpMysql(connection) {
  return withMysql(connection, async (client) => {
    try {
      const database = connection.credentials.dbname;
      const [objectsRows] = await client.execute(`
        SELECT table_name AS name, table_type AS kind
        FROM information_schema.tables
        WHERE table_schema = ? AND table_type IN ('BASE TABLE','VIEW')
        ORDER BY table_name
      `, [database]);
      const [columnRows] = await client.execute(`
        SELECT table_name AS table_name, column_name AS column_name, data_type AS data_type, is_nullable AS is_nullable, column_key AS column_key
        FROM information_schema.columns
        WHERE table_schema = ?
        ORDER BY table_name, ordinal_position
      `, [database]);
      const [fkRows] = await client.execute(`
        SELECT table_name AS table_name, column_name AS column_name, referenced_table_name AS referenced_table_name, referenced_column_name AS referenced_column_name
        FROM information_schema.key_column_usage
        WHERE table_schema = ? AND referenced_table_name IS NOT NULL
      `, [database]);
      const fk = new Map(fkRows.map((row) => [`${row.table_name}.${row.column_name}`, { table: row.referenced_table_name, column: row.referenced_column_name }]));
      const byTable = new Map();
      for (const column of columnRows) {
        if (!byTable.has(column.table_name)) byTable.set(column.table_name, []);
        const fkValue = fk.get(`${column.table_name}.${column.column_name}`);
        byTable.get(column.table_name).push({
          name: column.column_name,
          dataType: column.data_type,
          nullable: column.is_nullable === "YES",
          primaryKey: column.column_key === "PRI",
          ...(fkValue ? { foreignKey: fkValue } : {})
        });
      }
      return baseSchema(connection, objectsRows.map((object) => ({
        name: object.name,
        type: object.kind === "VIEW" ? "view" : "table",
        columns: byTable.get(object.name) || []
      })));
    } catch {
      throw new SafeError("SCHEMA_DUMP_FAILED");
    }
  });
}

async function dumpBigQuery(config, connection, schemaName = undefined) {
  if (schemaName) assertBigQuerySchemaName(schemaName);
  return withBigQuery(connection, async (client) => {
    try {
      const datasetIds = schemaName ? [schemaName] : await listBigQueryDatasets(client);
      const options = bigQueryOptions(config, connection);
      if (!schemaName && datasetIds.length > options.maxDatasetsPerSchemaDump) {
        throw new SafeError("BIGQUERY_DATASET_LIMIT_EXCEEDED", "BigQuery dataset count exceeds configured limit.", {
          count: datasetIds.length,
          limit: options.maxDatasetsPerSchemaDump,
          hint: "Use --schema <dataset> to dump one dataset."
        });
      }
      const schemas = [];
      for (const datasetId of datasetIds) {
        assertBigQuerySchemaName(datasetId);
        schemas.push(await dumpBigQueryDataset(client, connection, datasetId));
      }
      return schemas;
    } catch (error) {
      if (error instanceof SafeError) throw error;
      throw new SafeError(schemaName ? "SCHEMA_DUMP_FAILED" : "BIGQUERY_SCHEMA_DUMP_FAILED");
    }
  });
}

async function listBigQueryDatasets(client) {
  const datasetIds = [];
  let query = { autoPaginate: false };
  do {
    const [datasets, nextQuery] = await client.getDatasets(query);
    for (const dataset of datasets) datasetIds.push(dataset.id);
    query = nextQuery;
  } while (query);
  return datasetIds;
}

async function dumpBigQueryDataset(client, connection, datasetId) {
  const [tables] = await client.dataset(datasetId).getTables();
  const objects = [];
  for (const table of tables) {
    const [metadata] = await table.getMetadata();
    const type = metadata.type === "VIEW" ? "view" : "table";
    objects.push({
      name: table.id,
      type,
      columns: (metadata.schema?.fields || []).map((field) => ({
        name: field.name,
        dataType: field.type || "unknown",
        nullable: field.mode !== "REQUIRED"
      }))
    });
  }
  objects.sort((left, right) => left.name.localeCompare(right.name));
  return baseSchema(connection, objects, datasetId);
}

function baseSchema(connection, objects, schema = undefined) {
  return {
    schemaVersion: 1,
    connection: connection.name,
    ...(schema ? {
      schema,
      scope: scopeKey(connection.name, schema),
      namespace: {
        projectId: connection.credentials.projectId,
        datasetId: schema
      }
    } : {}),
    dialect: connection.dialect,
    generatedAt: new Date().toISOString(),
    objects
  };
}
