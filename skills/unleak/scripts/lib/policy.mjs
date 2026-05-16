import { SafeError } from "./errors.mjs";

const OBJECT_POLICIES = new Set(["enabled", "disabled"]);
const COLUMN_POLICIES = new Set(["visible", "hidden", "masked", "hashed", "joinable"]);
const COLUMN_CAPABILITIES = new Set(["select", "filter", "group", "sort", "join", "aggregate", "expression"]);

export function validatePolicyAgainstSchema(policy, schema) {
  if (!policy || policy.policyVersion !== 1 || policy.connection !== schema.connection || !Array.isArray(policy.objects)) {
    throw new SafeError("POLICY_INVALID");
  }
  const schemaObjects = new Map(schema.objects.map((object) => [object.name, object]));
  const policyObjects = new Map(policy.objects.map((object) => [object.name, object]));
  for (const object of policy.objects) {
    if (!OBJECT_POLICIES.has(object.objectPolicy)) throw new SafeError("POLICY_INVALID_OBJECT_POLICY");
    const schemaObject = schemaObjects.get(object.name);
    if (!schemaObject) throw new SafeError("POLICY_UNKNOWN_OBJECT");
    if (schemaObject.type !== object.type) throw new SafeError("POLICY_OBJECT_TYPE_MISMATCH");
    const schemaColumns = new Set(schemaObject.columns.map((column) => column.name));
    const policyColumns = new Map((object.columns || []).map((column) => [column.name, column]));
    for (const column of object.columns || []) {
      if (!schemaColumns.has(column.name)) throw new SafeError("POLICY_UNKNOWN_COLUMN");
      if (!COLUMN_POLICIES.has(column.policy)) throw new SafeError("POLICY_INVALID_COLUMN_POLICY");
      validateCapabilities(column);
      validateMaskOptions(column);
    }
    for (const schemaColumn of schemaObject.columns) {
      if (!policyColumns.has(schemaColumn.name)) throw new SafeError("POLICY_MISSING_COLUMN");
    }
  }
  for (const schemaObject of schema.objects) {
    if (!policyObjects.has(schemaObject.name)) throw new SafeError("POLICY_MISSING_OBJECT");
  }
  return true;
}

function validateCapabilities(column) {
  if (column.capabilities === undefined) return;
  if (!Array.isArray(column.capabilities)) throw new SafeError("POLICY_INVALID_COLUMN_CAPABILITIES");
  for (const capability of column.capabilities) {
    if (!COLUMN_CAPABILITIES.has(capability)) throw new SafeError("POLICY_INVALID_COLUMN_CAPABILITIES");
  }
  if (column.policy === "hidden" && column.capabilities.some((capability) => capability !== "group")) {
    throw new SafeError("POLICY_INVALID_COLUMN_CAPABILITIES");
  }
}

function validateMaskOptions(column) {
  if (column.policy !== "masked") return;
  const mode = column.maskOptions?.mode || "partial";
  if (!["partial", "email", "phone"].includes(mode)) throw new SafeError("POLICY_INVALID_MASK_OPTIONS");
  if (mode === "partial" && column.maskOptions?.showLast !== undefined) {
    const showLast = Number(column.maskOptions.showLast);
    if (!Number.isInteger(showLast) || showLast < 0) throw new SafeError("POLICY_INVALID_MASK_OPTIONS");
  }
}

export function policyIndex(policy) {
  const objects = new Map();
  for (const object of policy.objects) {
    objects.set(object.name, {
      ...object,
      columnsByName: new Map(object.columns.map((column) => [column.name, column]))
    });
  }
  return objects;
}
