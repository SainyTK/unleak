import test from "node:test";
import assert from "node:assert/strict";
import { proposePolicy } from "../scripts/lib/propose.mjs";

test("policy proposal heuristics classify objects and columns", () => {
  const policy = proposePolicy({
    connection: "heuristic_db",
    objects: [
      {
        name: "audit_log",
        type: "table",
        columns: [
          { name: "id", primaryKey: true },
          { name: "actor_email" },
          { name: "secret_token" },
          { name: "body" }
        ]
      },
      {
        name: "orders",
        type: "table",
        columns: [
          { name: "id", primaryKey: true },
          { name: "customer_id", foreignKey: { table: "customers", column: "id" } },
          { name: "customer_name" },
          { name: "customer_email" },
          { name: "phone" },
          { name: "amount" },
          { name: "status" },
          { name: "note" },
          { name: "mystery_blob" }
        ]
      }
    ]
  });

  const audit = policy.objects.find((object) => object.name === "audit_log");
  const orders = policy.objects.find((object) => object.name === "orders");
  const orderColumn = (name) => orders.columns.find((column) => column.name === name);
  const auditColumn = (name) => audit.columns.find((column) => column.name === name);

  assert.equal(policy.policyVersion, 1);
  assert.equal(policy.connection, "heuristic_db");
  assert.equal(audit.objectPolicy, "disabled");
  assert.equal(orders.objectPolicy, "enabled");
  assert.equal(auditColumn("id").policy, "joinable");
  assert.equal(auditColumn("secret_token").policy, "hidden");
  assert.equal(auditColumn("body").policy, "hidden");
  assert.equal(orderColumn("id").policy, "joinable");
  assert.equal(orderColumn("customer_id").policy, "joinable");
  assert.equal(orderColumn("customer_name").policy, "masked");
  assert.equal(orderColumn("customer_email").policy, "masked");
  assert.equal(orderColumn("phone").policy, "masked");
  assert.equal(orderColumn("amount").policy, "visible");
  assert.equal(orderColumn("status").policy, "visible");
  assert.equal(orderColumn("note").policy, "hidden");
  assert.equal(orderColumn("mystery_blob").policy, "hidden");
});
