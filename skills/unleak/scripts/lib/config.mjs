import path from "node:path";
import { dbConfPath, skillRoot } from "./paths.mjs";
import { readJson } from "./fs-json.mjs";
import { SafeError, assertSafeName } from "./errors.mjs";

const BIGQUERY_DEFAULT_MAX_BYTES_BILLED = 1000000000;
const BIGQUERY_DEFAULT_MAX_DATASETS_PER_SCHEMA_DUMP = 50;

export function loadConfig() {
  const config = readJson(dbConfPath, "DB_CONF_NOT_FOUND", "DB_CONF_INVALID");
  validateConfig(config);
  return config;
}

export function validateConfig(config) {
  try {
    if (!config || typeof config !== "object" || !Array.isArray(config.connections)) {
      throw new Error("bad shape");
    }
    const names = new Set();
    for (const connection of config.connections) {
      assertSafeName(connection.name, "connection");
      if (names.has(connection.name)) throw new Error("duplicate");
      names.add(connection.name);
      if (!["sqlite", "postgres", "bigquery"].includes(connection.dialect)) throw new Error("dialect");
      if (!connection.credentials || typeof connection.credentials !== "object") throw new Error("credentials");
      if (connection.dialect === "sqlite" && !connection.credentials.path) throw new Error("sqlite path");
      if (connection.dialect === "postgres") {
        for (const key of ["host", "port", "dbname", "username"]) {
          if (connection.credentials[key] === undefined) throw new Error("postgres field");
        }
      }
      if (connection.dialect === "bigquery") validateBigQueryConnection(connection);
    }
  } catch {
    throw new SafeError("DB_CONF_INVALID");
  }
}

export function getConnection(config, name) {
  assertSafeName(name, "connection");
  const connection = config.connections.find((item) => item.name === name);
  if (!connection) throw new SafeError("CONNECTION_NOT_FOUND");
  return connection;
}

export function limitsFor(config, connection) {
  const defaultLimit = Number(connection.defaultLimit ?? config.defaultLimit ?? 100);
  const maxLimit = Number(connection.maxLimit ?? config.maxLimit ?? 500);
  return {
    defaultLimit: Number.isFinite(defaultLimit) && defaultLimit > 0 ? defaultLimit : 100,
    maxLimit: Number.isFinite(maxLimit) && maxLimit > 0 ? maxLimit : 500
  };
}

export function sqliteFileFor(connection) {
  const raw = connection.credentials.path;
  return path.isAbsolute(raw) ? raw : path.resolve(skillRoot, raw);
}

export function assertBigQuerySchemaName(name) {
  if (!/^[A-Za-z0-9_]+$/.test(String(name || ""))) {
    throw new SafeError("BIGQUERY_SCHEMA_NAME_UNSUPPORTED");
  }
}

export function bigQueryOptions(config, connection) {
  const connectionOptions = connection.options || {};
  const globalOptions = config.options?.bigquery || {};
  const maxBytesBilled = positiveInteger(
    connectionOptions.maxBytesBilled ?? globalOptions.maxBytesBilled,
    BIGQUERY_DEFAULT_MAX_BYTES_BILLED
  );
  const maxDatasetsPerSchemaDump = positiveInteger(
    connectionOptions.maxDatasetsPerSchemaDump ?? globalOptions.maxDatasetsPerSchemaDump,
    BIGQUERY_DEFAULT_MAX_DATASETS_PER_SCHEMA_DUMP
  );
  return {
    maxBytesBilled,
    maxDatasetsPerSchemaDump,
    ...(connectionOptions.location ? { location: String(connectionOptions.location) } : {})
  };
}

function validateBigQueryConnection(connection) {
  if (connection.projectId || connection.location || connection.maxBytesBilled || connection.maxDatasetsPerSchemaDump) {
    throw new Error("bigquery root options");
  }
  if (!connection.credentials.projectId) throw new Error("bigquery project");
  const adc = connection.credentials.adc;
  if (!adc || typeof adc !== "object") throw new Error("bigquery adc");
  if (adc.type === "authorized_user") {
    for (const key of ["client_id", "client_secret", "refresh_token"]) {
      if (!adc[key]) throw new Error("bigquery authorized_user field");
    }
    return;
  }
  if (adc.type === "service_account") {
    for (const key of ["client_email", "private_key"]) {
      if (!adc[key]) throw new Error("bigquery service_account field");
    }
    return;
  }
  throw new Error("bigquery adc type");
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}
