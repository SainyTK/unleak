import fs from "node:fs";
import { activePolicyPath, schemaPath } from "./paths.mjs";
import { readJson } from "./fs-json.mjs";

export function loadSchema(connection) {
  return readJson(schemaPath(connection), "SCHEMA_NOT_FOUND", "SCHEMA_INVALID");
}

export function loadActivePolicy(connection) {
  return readJson(activePolicyPath(connection), "ACTIVE_POLICY_NOT_FOUND", "ACTIVE_POLICY_INVALID");
}

export function objectMap(schema) {
  return new Map(schema.objects.map((object) => [object.name, object]));
}

export function activePolicyExists(connection) {
  return fs.existsSync(activePolicyPath(connection));
}
