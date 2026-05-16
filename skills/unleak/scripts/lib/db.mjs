import Database from "better-sqlite3";
import pg from "pg";
import { sqliteFileFor } from "./config.mjs";
import { SafeError } from "./errors.mjs";

export function openSqlite(connection, readonly = false) {
  try {
    return new Database(sqliteFileFor(connection), { readonly, fileMustExist: readonly });
  } catch {
    throw new SafeError("DB_OPEN_FAILED");
  }
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
