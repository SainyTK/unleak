import test from "node:test";
import assert from "node:assert/strict";
import { dialectAdapter } from "../scripts/lib/dialect-adapters.mjs";

test("query schema argument is only supported by BigQuery", () => {
  for (const dialect of ["sqlite", "postgres", "mysql"]) {
    const adapter = dialectAdapter(connectionFor(dialect));
    assert.throws(() => adapter.validateQuerySchemaArg("public", connectionFor(dialect)), /SCHEMA_UNSUPPORTED/, dialect);
  }

  assert.throws(() => dialectAdapter(connectionFor("bigquery")).validateQuerySchemaArg(), /SCHEMA_REQUIRED/);
  assert.doesNotThrow(() => dialectAdapter(connectionFor("bigquery")).validateQuerySchemaArg("sales"));
});

test("schema dump keeps dialect-specific schema arguments", async () => {
  await assert.rejects(() => dialectAdapter(connectionFor("sqlite")).dumpSchemas({}, connectionFor("sqlite"), "main"), /SCHEMA_UNSUPPORTED/);
  assert.doesNotThrow(() => dialectAdapter(connectionFor("postgres")).validateDumpSchemaArg("public"));
  assert.throws(() => dialectAdapter(connectionFor("postgres")).validateDumpSchemaArg("private"), /SCHEMA_UNSUPPORTED/);
  assert.doesNotThrow(() => dialectAdapter(connectionFor("mysql")).validateDumpSchemaArg("app_db", connectionFor("mysql")));
  assert.throws(() => dialectAdapter(connectionFor("mysql")).validateDumpSchemaArg("other_db", connectionFor("mysql")), /SCHEMA_UNSUPPORTED/);
});

function connectionFor(dialect) {
  return {
    name: `${dialect}_conn`,
    dialect,
    credentials: {
      path: "test/fixtures/sales.sqlite",
      dbname: "app_db",
      projectId: "project",
      adc: { type: "authorized_user", client_id: "id", client_secret: "secret", refresh_token: "token" }
    }
  };
}
