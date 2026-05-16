import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const skillRoot = path.resolve(import.meta.dirname, "..");
const dbPath = path.resolve(import.meta.dirname, "fixtures", "sales.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.rmSync(dbPath, { force: true });
const db = new Database(dbPath);
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    phone TEXT,
    national_id TEXT,
    status TEXT NOT NULL,
    city TEXT
  );
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    amount REAL NOT NULL,
    order_date TEXT NOT NULL,
    category TEXT NOT NULL,
    note TEXT
  );
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY,
    actor_email TEXT,
    secret_token TEXT,
    body TEXT
  );
  CREATE VIEW order_summary AS
    SELECT category, COUNT(*) AS order_count, SUM(amount) AS total_amount
    FROM orders
    GROUP BY category;
`);

const customers = db.prepare("INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?)");
customers.run(1, "Alice Tan", "alice@example.com", "+66 81 111 2222", "1101700200001", "active", "Bangkok");
customers.run(2, "Bob Lee", "bob@example.com", "+66 82 333 4444", "1101700200002", "active", "Chiang Mai");
customers.run(3, "Carol Wong", "carol@example.com", "+66 83 555 6666", "1101700200003", "inactive", "Phuket");

const orders = db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?)");
orders.run(100, 1, 1200.5, "2026-05-01", "software", "vip customer");
orders.run(101, 1, 800, "2026-05-02", "hardware", "ship quickly");
orders.run(102, 2, 250, "2026-05-03", "software", "contains, comma");
orders.run(103, 3, 99.99, "2026-05-04", "support", "line\nbreak");

db.prepare("INSERT INTO audit_log VALUES (?, ?, ?, ?)").run(1, "admin@example.com", "raw-secret-token", "full audit body");
db.close();

const localDir = path.join(skillRoot, "local");
fs.mkdirSync(localDir, { recursive: true });
fs.writeFileSync(path.join(localDir, "db-conf.json"), `${JSON.stringify({
  hmacSecret: "local-test-hmac-secret",
  defaultLimit: 5,
  maxLimit: 20,
  connections: [
    {
      name: "sales_sqlite",
      dialect: "sqlite",
      credentials: {
        path: path.relative(skillRoot, dbPath)
      }
    },
    {
      name: "sales_pg",
      dialect: "postgres",
      credentials: {
        host: "localhost",
        port: "5432",
        dbname: "postgres",
        username: "postgres",
        password: ""
      }
    }
  ]
}, null, 2)}\n`);

const schemaDir = path.join(localDir, "schema");
fs.mkdirSync(schemaDir, { recursive: true });
fs.writeFileSync(path.join(schemaDir, "sales_pg.schema.json"), `${JSON.stringify({
  schemaVersion: 1,
  connection: "sales_pg",
  dialect: "postgres",
  generatedAt: new Date().toISOString(),
  objects: [
    {
      name: "unleak_audit_log",
      type: "table",
      columns: [
        { name: "id", dataType: "integer", nullable: false, primaryKey: true },
        { name: "actor_email", dataType: "text", nullable: true, primaryKey: false },
        { name: "secret_token", dataType: "text", nullable: true, primaryKey: false },
        { name: "body", dataType: "text", nullable: true, primaryKey: false }
      ]
    },
    {
      name: "unleak_customers",
      type: "table",
      columns: [
        { name: "id", dataType: "integer", nullable: false, primaryKey: true },
        { name: "customer_name", dataType: "text", nullable: false, primaryKey: false },
        { name: "customer_email", dataType: "text", nullable: false, primaryKey: false },
        { name: "phone", dataType: "text", nullable: true, primaryKey: false },
        { name: "national_id", dataType: "text", nullable: true, primaryKey: false },
        { name: "status", dataType: "text", nullable: false, primaryKey: false },
        { name: "city", dataType: "text", nullable: true, primaryKey: false }
      ]
    },
    {
      name: "unleak_order_summary",
      type: "view",
      columns: [
        { name: "category", dataType: "text", nullable: true, primaryKey: false },
        { name: "order_count", dataType: "bigint", nullable: true, primaryKey: false },
        { name: "total_amount", dataType: "numeric", nullable: true, primaryKey: false }
      ]
    },
    {
      name: "unleak_orders",
      type: "table",
      columns: [
        { name: "id", dataType: "integer", nullable: false, primaryKey: true },
        {
          name: "customer_id",
          dataType: "integer",
          nullable: true,
          primaryKey: false,
          foreignKey: { table: "unleak_customers", column: "id" }
        },
        { name: "amount", dataType: "numeric", nullable: false, primaryKey: false },
        { name: "order_date", dataType: "date", nullable: false, primaryKey: false },
        { name: "category", dataType: "text", nullable: false, primaryKey: false },
        { name: "note", dataType: "text", nullable: true, primaryKey: false }
      ]
    }
  ]
}, null, 2)}\n`);

console.log(JSON.stringify({ ok: true, dbPath }, null, 2));
