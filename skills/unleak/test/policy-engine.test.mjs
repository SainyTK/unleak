import test from "node:test";
import assert from "node:assert/strict";
import { validateAndPlan } from "../scripts/lib/sql-policy-engine.mjs";

const schema = {
  connection: "x",
  objects: [{
    name: "orders",
    type: "table",
    columns: [
      { name: "id", primaryKey: true },
      { name: "customer_email" },
      { name: "amount" },
      { name: "note" }
    ]
  }, {
    name: "customers",
    type: "table",
    columns: [
      { name: "id", primaryKey: true },
      { name: "status" }
    ]
  }, {
    name: "audit_log",
    type: "table",
    columns: [{ name: "id" }, { name: "secret_token" }]
  }]
};
const policy = {
  connection: "x",
  objects: [{
    name: "orders",
    objectPolicy: "enabled",
    columns: [
      { name: "id", policy: "joinable" },
      { name: "customer_email", policy: "masked", maskOptions: { mode: "email" } },
      { name: "amount", policy: "visible" },
      { name: "note", policy: "hidden" }
    ]
  }, {
    name: "customers",
    objectPolicy: "enabled",
    columns: [
      { name: "id", policy: "joinable" },
      { name: "status", policy: "visible" }
    ]
  }, {
    name: "audit_log",
    objectPolicy: "disabled",
    columns: [{ name: "id", policy: "joinable" }, { name: "secret_token", policy: "hidden" }]
  }]
};

test("expands star without hidden columns", () => {
  const plan = validateAndPlan("SELECT * FROM orders", schema, policy);
  assert.deepEqual(plan.outputColumns, ["id", "customer_email", "amount"]);
  assert.deepEqual(plan.columnsRemoved, ["note"]);
  assert(plan.transforms.find((item) => item.column === "id" && item.type === "hashed"));
  assert(plan.transforms.find((item) => item.column === "customer_email" && item.type === "masked"));
});

test("rejects hidden explicit selection and protected filters", () => {
  assert.throws(() => validateAndPlan("SELECT note FROM orders", schema, policy), /SQL_HIDDEN_COLUMN_SELECTED/);
  assert.throws(() => validateAndPlan("SELECT amount FROM orders WHERE customer_email = 'alice@example.com'", schema, policy), /SQL_PROTECTED_COLUMN_IN_WHERE/);
});

test("rejects disabled objects and non-select statements", () => {
  assert.throws(() => validateAndPlan("SELECT id FROM audit_log", schema, policy), /SQL_DISABLED_OBJECT/);
  assert.throws(() => validateAndPlan("DELETE FROM orders", schema, policy), /SQL_FORBIDDEN_STATEMENT|SQL_SELECT_ONLY/);
  assert.throws(() => validateAndPlan("SELECT amount FROM orders; SELECT amount FROM orders", schema, policy), /SQL_MULTIPLE_STATEMENTS/);
  assert.throws(() => validateAndPlan("CREATE TABLE x (id int)", schema, policy), /SQL_FORBIDDEN_STATEMENT|SQL_SELECT_ONLY/);
});

test("rejects transaction, session, pragma, copy, attach, detach, and temp table commands", () => {
  for (const sql of [
    "BEGIN",
    "COMMIT",
    "ROLLBACK",
    "PRAGMA table_info(orders)",
    "COPY orders TO STDOUT",
    "ATTACH DATABASE 'x.sqlite' AS x",
    "DETACH DATABASE x",
    "CREATE TEMP TABLE x AS SELECT amount FROM orders"
  ]) {
    assert.throws(() => validateAndPlan(sql, schema, policy), /SQL_FORBIDDEN_STATEMENT|SQL_SELECT_ONLY/, sql);
  }
});

test("plans strict joinable equality joins without leaking raw keys", () => {
  const plan = validateAndPlan("SELECT c.id AS customer_key, o.id AS order_key, o.amount FROM customers c JOIN orders o ON c.id = o.id", schema, policy);
  assert.deepEqual(plan.outputColumns, ["customer_key", "order_key", "amount"]);
  assert.match(plan.rewrittenSql, /"c"\."id" AS "customer_key"/);
  assert(plan.transforms.find((item) => item.column === "customer_key" && item.type === "hashed"));
});

test("rejects joinable literal comparisons and function-based join conditions", () => {
  assert.throws(() => validateAndPlan("SELECT amount FROM orders WHERE id = 1", schema, policy), /SQL_PROTECTED_COLUMN_IN_WHERE/);
  assert.throws(() => validateAndPlan("SELECT c.status, o.amount FROM customers c JOIN orders o ON lower(c.id) = o.id", schema, policy), /SQL_JOINABLE_JOIN_REJECTED|SQL_PROTECTED_COLUMN_IN_EXPRESSION/);
});

test("rejects duplicate aliases and ambiguous unqualified columns", () => {
  assert.throws(() => validateAndPlan("SELECT amount AS value, customer_email AS value FROM orders", schema, policy), /SQL_DUPLICATE_OUTPUT_NAME/);
  assert.throws(() => validateAndPlan("SELECT id FROM customers c JOIN orders o ON c.id = o.id", schema, policy), /SQL_AMBIGUOUS_COLUMN/);
  assert.throws(() => validateAndPlan("SELECT ghost FROM orders", schema, policy), /SQL_UNKNOWN_COLUMN/);
});

test("expands table star and prefixes multi-object star headers", () => {
  const tableStar = validateAndPlan("SELECT o.* FROM orders o", schema, policy);
  assert.deepEqual(tableStar.outputColumns, ["id", "customer_email", "amount"]);
  const multiStar = validateAndPlan("SELECT * FROM customers c JOIN orders o ON c.id = o.id", schema, policy);
  assert(multiStar.outputColumns.includes("c.id"));
  assert(multiStar.outputColumns.includes("o.amount"));
  assert(multiStar.columnsRemoved.includes("note"));
});

test("requires ORDER BY to use output aliases only", () => {
  assert.doesNotThrow(() => validateAndPlan("SELECT amount AS amount_out FROM orders ORDER BY amount_out", schema, policy));
  assert.throws(() => validateAndPlan("SELECT amount AS amount_out FROM orders ORDER BY amount", schema, policy), /SQL_ORDER_BY_OUTPUT_ALIAS_ONLY/);
});

test("tracks simple CTE passthrough lineage", () => {
  const plan = validateAndPlan("WITH safe AS (SELECT customer_email FROM orders) SELECT customer_email FROM safe", schema, policy);
  assert.deepEqual(plan.outputColumns, ["customer_email"]);
  assert(plan.transforms.find((item) => item.column === "customer_email" && item.type === "masked"));
});

test("validates UNION branches with matching output policy", () => {
  const plan = validateAndPlan("SELECT amount AS value FROM orders UNION ALL SELECT amount AS value FROM orders", schema, policy);
  assert.deepEqual(plan.outputColumns, ["value"]);
  assert.match(plan.rewrittenSql, /UNION ALL/);
  assert.throws(() => validateAndPlan("SELECT amount AS value FROM orders UNION SELECT customer_email AS value FROM orders", schema, policy), /SQL_UNION_POLICY_MISMATCH/);
});

test("tracks simple FROM subquery passthrough lineage", () => {
  const plan = validateAndPlan("SELECT q.customer_email FROM (SELECT customer_email FROM orders) q", schema, policy);
  assert.deepEqual(plan.outputColumns, ["customer_email"]);
  assert(plan.transforms.find((item) => item.column === "customer_email" && item.type === "masked"));
  assert.throws(() => validateAndPlan("SELECT q.customer_email FROM (SELECT customer_email FROM orders) q WHERE q.customer_email = 'alice@example.com'", schema, policy), /SQL_PROTECTED_COLUMN_IN_WHERE/);
});

test("allows visible aggregates and scalar functions with aliases", () => {
  const aggregate = validateAndPlan("SELECT category AS category, COUNT(*) AS total FROM orders GROUP BY category", {
    ...schema,
    objects: schema.objects.map((object) => object.name === "orders" ? { ...object, columns: [...object.columns, { name: "category" }] } : object)
  }, {
    ...policy,
    objects: policy.objects.map((object) => object.name === "orders" ? { ...object, columns: [...object.columns, { name: "category", policy: "visible" }] } : object)
  });
  assert.deepEqual(aggregate.outputColumns, ["category", "total"]);
  const scalar = validateAndPlan("SELECT round(amount) AS rounded FROM orders", schema, policy);
  assert.deepEqual(scalar.outputColumns, ["rounded"]);
});

test("requires aggregate aliases and rejects aggregates over protected columns", () => {
  const countPlan = validateAndPlan("SELECT COUNT(*) AS total FROM orders", schema, policy);
  assert.deepEqual(countPlan.outputColumns, ["total"]);
  assert.throws(() => validateAndPlan("SELECT COUNT(*) FROM orders", schema, policy), /SQL_DERIVED_ALIAS_REQUIRED/);
  assert.throws(() => validateAndPlan("SELECT COUNT(customer_email) AS email_count FROM orders", schema, policy), /SQL_PROTECTED_COLUMN_IN_EXPRESSION/);
});

test("allows visible HAVING aggregate logic", () => {
  const schemaWithCategory = {
    ...schema,
    objects: schema.objects.map((object) => object.name === "orders" ? { ...object, columns: [...object.columns, { name: "category" }] } : object)
  };
  const policyWithCategory = {
    ...policy,
    objects: policy.objects.map((object) => object.name === "orders" ? { ...object, columns: [...object.columns, { name: "category", policy: "visible" }] } : object)
  };
  assert.doesNotThrow(() => validateAndPlan("SELECT category AS category, SUM(amount) AS total FROM orders GROUP BY category HAVING SUM(amount) > 100", schemaWithCategory, policyWithCategory));
});

test("allows GROUP BY on any column policy while preserving output transforms", () => {
  const joinablePlan = validateAndPlan("SELECT id AS order_key, COUNT(*) AS total FROM orders GROUP BY id", schema, policy);
  assert.deepEqual(joinablePlan.outputColumns, ["order_key", "total"]);
  assert(joinablePlan.transforms.find((item) => item.column === "order_key" && item.type === "hashed"));

  const maskedPlan = validateAndPlan("SELECT customer_email AS email_key, COUNT(*) AS total FROM orders GROUP BY customer_email", schema, policy);
  assert(maskedPlan.transforms.find((item) => item.column === "email_key" && item.type === "masked"));

  const hiddenPlan = validateAndPlan("SELECT COUNT(*) AS total FROM orders GROUP BY note", schema, policy);
  assert.deepEqual(hiddenPlan.outputColumns, ["total"]);
  assert.throws(() => validateAndPlan("SELECT note, COUNT(*) AS total FROM orders GROUP BY note", schema, policy), /SQL_HIDDEN_COLUMN_SELECTED/);

  const hashedPolicy = {
    ...policy,
    objects: policy.objects.map((object) => object.name === "orders" ? {
      ...object,
      columns: object.columns.map((column) => column.name === "id" ? { ...column, policy: "hashed" } : column)
    } : object)
  };
  const hashedPlan = validateAndPlan("SELECT id AS order_key, COUNT(*) AS total FROM orders GROUP BY id", schema, hashedPolicy);
  assert(hashedPlan.transforms.find((item) => item.column === "order_key" && item.type === "hashed"));
});

test("allows visible-only window expressions and rejects protected window expressions", () => {
  const visible = validateAndPlan("SELECT SUM(amount) OVER () AS total_amount FROM orders", schema, policy);
  assert.deepEqual(visible.outputColumns, ["total_amount"]);
  assert.throws(() => validateAndPlan("SELECT COUNT(customer_email) OVER () AS email_count FROM orders", schema, policy), /SQL_PROTECTED_COLUMN_IN_EXPRESSION/);
});

test("rejects unknown functions and protected derived expressions", () => {
  assert.throws(() => validateAndPlan("SELECT random(amount) AS r FROM orders", schema, policy), /SQL_FUNCTION_NOT_ALLOWED/);
  assert.throws(() => validateAndPlan("SELECT lower(customer_email) AS email_key FROM orders", schema, policy), /SQL_PROTECTED_COLUMN_IN_EXPRESSION/);
});

test("allows DISTINCT only when selected expression is visible-safe", () => {
  assert.doesNotThrow(() => validateAndPlan("SELECT DISTINCT amount FROM orders", schema, policy));
  assert.throws(() => validateAndPlan("SELECT DISTINCT customer_email FROM orders", schema, policy), /SQL_PROTECTED_COLUMN_IN_DISTINCT|SQL_DERIVED_ALIAS_REQUIRED/);
});

test("rejects protected GROUP BY, HAVING, ORDER BY, LIKE, and IN usage", () => {
  assert.throws(() => validateAndPlan("SELECT amount AS amount_out FROM orders HAVING customer_email = 'alice@example.com'", schema, policy), /SQL_PROTECTED_COLUMN_IN_HAVING/);
  assert.throws(() => validateAndPlan("SELECT amount AS amount_out FROM orders ORDER BY 1", schema, policy), /SQL_ORDER_BY_ORDINAL_REJECTED/);
  assert.throws(() => validateAndPlan("SELECT amount FROM orders WHERE customer_email LIKE '%@example.com'", schema, policy), /SQL_PROTECTED_COLUMN_IN_WHERE/);
  assert.throws(() => validateAndPlan("SELECT amount FROM orders WHERE customer_email IN \('alice@example.com'\)", schema, policy), /SQL_PROTECTED_COLUMN_IN_WHERE/);
});

test("allows visible WHERE literals, LIKE, IN, and selected literals with aliases", () => {
  assert.doesNotThrow(() => validateAndPlan("SELECT amount FROM orders WHERE amount IN (250, 800)", schema, policy));
  assert.doesNotThrow(() => validateAndPlan("SELECT amount FROM orders WHERE amount LIKE '8%'", schema, policy));
  const plan = validateAndPlan("SELECT 'ok' AS label, amount FROM orders", schema, policy);
  assert.deepEqual(plan.outputColumns, ["label", "amount"]);
});

test("rejects unsupported set operators", () => {
  assert.throws(() => validateAndPlan("SELECT amount FROM orders INTERSECT SELECT amount FROM orders", schema, policy), /SQL_SET_OPERATOR_UNSUPPORTED/);
  assert.throws(() => validateAndPlan("SELECT amount FROM orders EXCEPT SELECT amount FROM orders", schema, policy), /SQL_SET_OPERATOR_UNSUPPORTED/);
});
