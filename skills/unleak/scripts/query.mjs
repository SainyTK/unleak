#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { main, SafeError } from "./lib/errors.mjs";
import { parseArgs } from "./lib/args.mjs";
import { loadConfig, getConnection, limitsFor } from "./lib/config.mjs";
import { loadSchema, loadActivePolicy } from "./lib/schema.mjs";
import { validatePolicyAgainstSchema } from "./lib/policy.mjs";
import { hmacValue, maskValue, toCsv } from "./lib/output.mjs";
import { assertDependenciesReady } from "./lib/readiness.mjs";

let openSqlite;
let withPostgres;
let validateAndPlan;

main(async () => {
  assertDependenciesReady();
  ({ openSqlite, withPostgres } = await import("./lib/db.mjs"));
  ({ validateAndPlan } = await import("./lib/sql-policy-engine.mjs"));
  const args = parseArgs();
  if (!args.connection) throw new SafeError("CONNECTION_REQUIRED");
  if ((args.sql && args.file) || (!args.sql && !args.file)) throw new SafeError("QUERY_INPUT_INVALID");
  const config = loadConfig();
  const connection = getConnection(config, args.connection);
  const schema = loadSchema(connection.name);
  const policy = loadActivePolicy(connection.name);
  validatePolicyAgainstSchema(policy, schema);
  const sql = args.sql ? args.sql : readQueryFile(args.file);
  const plan = validateAndPlan(sql, schema, policy);
  if (args["dry-run"]) {
    return {
      connection: connection.name,
      dryRun: true,
      columnsReturned: plan.outputColumns,
      columnsRemoved: plan.columnsRemoved,
      schemaGeneratedAt: schema.generatedAt,
      policyActivatedAt: policy.activatedAt
    };
  }
  const { defaultLimit, maxLimit } = limitsFor(config, connection);
  const requestedLimit = args.limit ? Math.min(Number(args.limit), maxLimit) : defaultLimit;
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : defaultLimit;
  const rows = await executeLimited(connection, plan.rewrittenSql, limit);
  const transformed = rows.slice(0, limit).map((row) => transformRow(row, plan.transforms, config.hmacSecret));
  const csv = toCsv(transformed, plan.outputColumns);
  if (args.out) {
    const outputPath = safeOutputPath(args.out);
    if (fs.existsSync(outputPath) && !args.force) throw new SafeError("OUTPUT_EXISTS");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, csv);
    return {
      connection: connection.name,
      format: "csv_file",
      rowCount: transformed.length,
      limitApplied: limit,
      schemaGeneratedAt: schema.generatedAt,
      policyActivatedAt: policy.activatedAt,
      columnsReturned: plan.outputColumns,
      columnsRemoved: plan.columnsRemoved,
      outputPath: `./${path.relative(process.cwd(), outputPath)}`
    };
  }
  return {
    connection: connection.name,
    format: "csv",
    rowCount: transformed.length,
    limitApplied: limit,
    schemaGeneratedAt: schema.generatedAt,
    policyActivatedAt: policy.activatedAt,
    columnsReturned: plan.outputColumns,
    columnsRemoved: plan.columnsRemoved,
    csv
  };
});

async function executeLimited(connection, sql, limit) {
  const wrapped = `SELECT * FROM (${sql}) AS unleak_q LIMIT ${Number(limit)}`;
  if (connection.dialect === "sqlite") {
    const db = openSqlite(connection, true);
    try {
      return db.prepare(wrapped).all();
    } catch {
      throw new SafeError("SCHEMA_STALE_OR_QUERY_INVALID");
    } finally {
      db.close();
    }
  }
  return withPostgres(connection, async (client) => {
    try {
      const result = await client.query(wrapped);
      return result.rows;
    } catch {
      throw new SafeError("SCHEMA_STALE_OR_QUERY_INVALID");
    }
  });
}

function transformRow(row, transforms, secret) {
  const next = {};
  for (const transform of transforms) {
    const value = row[transform.column];
    if (transform.type === "hashed") {
      if (!secret) throw new SafeError("HMAC_SECRET_REQUIRED");
      next[transform.column] = hmacValue(secret, value);
    } else if (transform.type === "masked") {
      next[transform.column] = maskValue(value, transform.maskOptions);
    } else {
      next[transform.column] = value;
    }
  }
  return next;
}

function safeOutputPath(raw) {
  if (path.isAbsolute(raw) || raw.split(/[\\/]/).includes("..")) throw new SafeError("OUTPUT_PATH_INVALID");
  return path.resolve(process.cwd(), raw);
}

function readQueryFile(file) {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  } catch {
    throw new SafeError("QUERY_FILE_NOT_FOUND");
  }
}
