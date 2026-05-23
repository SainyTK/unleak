const mysql = await import("mysql2/promise");

const admin = await mysql.createConnection({
  host: process.env.UNLEAK_MYSQL_HOST || "localhost",
  port: Number(process.env.UNLEAK_MYSQL_PORT || 3306),
  user: process.env.UNLEAK_MYSQL_USER || "root",
  password: process.env.UNLEAK_MYSQL_PASSWORD || "",
  multipleStatements: true
});

try {
  await admin.query("CREATE DATABASE IF NOT EXISTS `unleak-evals`");
} finally {
  await admin.end().catch(() => {});
}

const client = await mysql.createConnection({
  host: process.env.UNLEAK_MYSQL_HOST || "localhost",
  port: Number(process.env.UNLEAK_MYSQL_PORT || 3306),
  database: process.env.UNLEAK_MYSQL_DATABASE || "unleak-evals",
  user: process.env.UNLEAK_MYSQL_USER || "root",
  password: process.env.UNLEAK_MYSQL_PASSWORD || "",
  multipleStatements: true
});

try {
  await client.query(`
    DROP VIEW IF EXISTS unleak_order_summary;
    DROP TABLE IF EXISTS unleak_audit_log;
    DROP TABLE IF EXISTS unleak_orders;
    DROP TABLE IF EXISTS unleak_customers;
    CREATE TABLE unleak_customers (
      id INTEGER PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      phone TEXT,
      national_id TEXT,
      status TEXT NOT NULL,
      city TEXT
    );
    CREATE TABLE unleak_orders (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      order_date DATE NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      CONSTRAINT fk_unleak_orders_customer FOREIGN KEY (customer_id) REFERENCES unleak_customers(id)
    );
    CREATE TABLE unleak_audit_log (
      id INTEGER PRIMARY KEY,
      actor_email TEXT,
      secret_token TEXT,
      body TEXT
    );
    CREATE VIEW unleak_order_summary AS
      SELECT category, COUNT(*) AS order_count, SUM(amount) AS total_amount
      FROM unleak_orders
      GROUP BY category;
  `);
  await client.execute(
    "INSERT INTO unleak_customers VALUES (?,?,?,?,?,?,?),(?,?,?,?,?,?,?),(?,?,?,?,?,?,?)",
    [
      1, "Alice Tan", "alice@example.com", "+66 81 111 2222", "1101700200001", "active", "Bangkok",
      2, "Bob Lee", "bob@example.com", "+66 82 333 4444", "1101700200002", "active", "Chiang Mai",
      3, "Carol Wong", "carol@example.com", "+66 83 555 6666", "1101700200003", "inactive", "Phuket"
    ]
  );
  await client.execute(
    "INSERT INTO unleak_orders VALUES (?,?,?,?,?,?),(?,?,?,?,?,?),(?,?,?,?,?,?),(?,?,?,?,?,?)",
    [
      100, 1, 1200.5, "2026-05-01", "software", "vip customer",
      101, 1, 800, "2026-05-02", "hardware", "ship quickly",
      102, 2, 250, "2026-05-03", "software", "contains, comma",
      103, 3, 99.99, "2026-05-04", "support", "line\nbreak"
    ]
  );
  await client.execute("INSERT INTO unleak_audit_log VALUES (?,?,?,?)", [1, "admin@example.com", "raw-secret-token", "full audit body"]);
  console.log(JSON.stringify({ ok: true }, null, 2));
} finally {
  await client.end().catch(() => {});
}
