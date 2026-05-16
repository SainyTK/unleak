const DISABLED_OBJECT = /(audit|log|session|token|credential|secret|password|key|auth)/i;
const HIDDEN = /(password|token|secret|key|credential|auth|cookie|session|notes?|comments?|content|body|address|national|passport|tax|latitude|longitude|location)/i;
const MASKED = /(email|phone|name)/i;
const HASHED = /(^id$|_id$|uuid|identifier|account|customer|user)/i;
const VISIBLE = /(amount|count|qty|quantity|price|date|time|status|category|type|flag|is_|total|score|rate|metric|revenue|currency|country|city)/i;

export function proposePolicy(schema) {
  return {
    policyVersion: 1,
    connection: schema.connection,
    generatedAt: new Date().toISOString(),
    objects: schema.objects.map((object) => ({
      name: object.name,
      type: object.type,
      objectPolicy: DISABLED_OBJECT.test(object.name) ? "disabled" : "enabled",
      columns: object.columns.map((column) => ({
        name: column.name,
        ...policyForColumn(column)
      }))
    }))
  };
}

function policyForColumn(column) {
  if (column.primaryKey || column.foreignKey) return { policy: "joinable" };
  if (HIDDEN.test(column.name)) return { policy: "hidden" };
  if (MASKED.test(column.name)) {
    const mode = /email/i.test(column.name) ? "email" : /phone/i.test(column.name) ? "phone" : "partial";
    return { policy: "masked", maskOptions: mode === "partial" ? { mode, showLast: 1 } : { mode } };
  }
  if (VISIBLE.test(column.name)) return { policy: "visible" };
  if (HASHED.test(column.name)) return { policy: "hashed" };
  return { policy: "hidden" };
}
