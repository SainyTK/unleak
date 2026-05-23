import Database from "better-sqlite3";
import pg from "pg";
import { bigQueryOptions, sqliteFileFor } from "./config.mjs";
import { SafeError } from "./errors.mjs";

export function openSqlite(connection, readonly = false) {
  try {
    return new Database(sqliteFileFor(connection), { readonly, fileMustExist: readonly });
  } catch {
    throw new SafeError("DB_OPEN_FAILED");
  }
}

export async function withBigQuery(connection, fn) {
  try {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const client = new BigQuery({
      projectId: connection.credentials.projectId,
      credentials: connection.credentials.adc
    });
    return await fn(client);
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError("DB_OPEN_FAILED");
  }
}

export async function bigQueryDryRun(config, connection, sql) {
  const options = bigQueryOptions(config, connection);
  return withBigQuery(connection, async (client) => {
    try {
      const [job] = await client.createQueryJob({
        query: sql,
        useLegacySql: false,
        dryRun: true,
        maximumBytesBilled: options.maxBytesBilled,
        ...(options.location ? { location: options.location } : {})
      });
      const estimatedBytes = Number(job.metadata?.statistics?.query?.totalBytesProcessed ?? 0);
      assertBigQueryBytesWithinLimit(estimatedBytes, options.maxBytesBilled);
      return { estimatedBytes, maxBytesBilled: options.maxBytesBilled };
    } catch (error) {
      if (error instanceof SafeError) throw error;
      throw new SafeError("SCHEMA_STALE_OR_QUERY_INVALID");
    }
  });
}

export function assertBigQueryBytesWithinLimit(estimatedBytes, maxBytesBilled) {
  if (estimatedBytes > maxBytesBilled) {
    throw new SafeError("BIGQUERY_BYTES_LIMIT_EXCEEDED", "BigQuery estimated bytes exceed configured limit.", {
      estimatedBytes,
      maxBytesBilled
    });
  }
}

export async function bigQueryQuery(config, connection, sql) {
  const options = bigQueryOptions(config, connection);
  return withBigQuery(connection, async (client) => {
    try {
      const [rows] = await client.query({
        query: sql,
        useLegacySql: false,
        maximumBytesBilled: options.maxBytesBilled,
        ...(options.location ? { location: options.location } : {})
      });
      return rows.map(normalizeBigQueryRow);
    } catch {
      throw new SafeError("SCHEMA_STALE_OR_QUERY_INVALID");
    }
  });
}

export function normalizeBigQueryValue(value) {
  const plain = normalizeBigQueryPlain(value);
  if (Array.isArray(plain) || (plain && typeof plain === "object")) return JSON.stringify(plain);
  return plain;
}

function normalizeBigQueryPlain(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalizeBigQueryPlain);
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (typeof value.value === "string" && Object.keys(value).length === 1) return value.value;
  if (value.constructor?.name?.startsWith("BigQuery")) return String(value.value ?? value);
  if (typeof value.toJSON === "function") {
    const json = value.toJSON();
    if (typeof json !== "object" || json === null) return json;
  }
  return Object.fromEntries(Object.entries(value).map(([key, innerValue]) => [key, normalizeBigQueryPlain(innerValue)]));
}

function normalizeBigQueryRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeBigQueryValue(value)]));
}

export async function withPostgres(connection, fn) {
  const client = new pg.Client({
    host: connection.credentials.host,
    port: Number(connection.credentials.port),
    database: connection.credentials.dbname,
    user: connection.credentials.username,
    password: connection.credentials.password ?? ""
  });
  try {
    await client.connect();
    return await fn(client);
  } catch {
    throw new SafeError("DB_OPEN_FAILED");
  } finally {
    try {
      await client.end();
    } catch {
      // noop
    }
  }
}

export async function withMysql(connection, fn) {
  let connectionHandle;
  try {
    const mysql = await import("mysql2/promise");
    connectionHandle = await mysql.createConnection({
      host: connection.credentials.host,
      port: Number(connection.credentials.port),
      database: connection.credentials.dbname,
      user: connection.credentials.username,
      password: connection.credentials.password ?? "",
      rowsAsArray: false,
      namedPlaceholders: false
    });
    return await fn(connectionHandle);
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError("DB_OPEN_FAILED");
  } finally {
    if (connectionHandle) {
      try {
        await connectionHandle.end();
      } catch {
        // noop
      }
    }
  }
}
