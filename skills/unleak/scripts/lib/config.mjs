import path from "node:path";
import { dbConfPath, skillRoot } from "./paths.mjs";
import { readJson } from "./fs-json.mjs";
import { SafeError, assertSafeName } from "./errors.mjs";

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
      if (!["sqlite", "postgres"].includes(connection.dialect)) throw new Error("dialect");
      if (!connection.credentials || typeof connection.credentials !== "object") throw new Error("credentials");
      if (connection.dialect === "sqlite" && !connection.credentials.path) throw new Error("sqlite path");
      if (connection.dialect === "postgres") {
        for (const key of ["host", "port", "dbname", "username"]) {
          if (connection.credentials[key] === undefined) throw new Error("postgres field");
        }
      }
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
