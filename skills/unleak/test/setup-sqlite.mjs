import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

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
console.log(JSON.stringify({ ok: true, dbPath }, null, 2));
