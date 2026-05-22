import fs from "node:fs";
import { activePolicyPath, schemaPath } from "./paths.mjs";
import { readJson } from "./fs-json.mjs";

export function loadSchema(connection, schema = undefined) {
  return readJson(schemaPath(connection, schema), "SCHEMA_NOT_FOUND", "SCHEMA_INVALID");
}

export function loadActivePolicy(connection, schema = undefined) {
  return readJson(activePolicyPath(connection, schema), "ACTIVE_POLICY_NOT_FOUND", "ACTIVE_POLICY_INVALID");
}

export function objectMap(schema) {
  return new Map(schema.objects.map((object) => [object.name, object]));
}

export function activePolicyExists(connection, schema = undefined) {
  return fs.existsSync(activePolicyPath(connection, schema));
}
