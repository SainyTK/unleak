PRAGMA foreign_keys = ON;

DROP VIEW IF EXISTS revenue_by_category;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS support_tickets;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  phone TEXT,
  national_id TEXT,
  date_of_birth TEXT,
  status TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  signup_date TEXT NOT NULL,
  vip_score REAL,
  home_address TEXT,
  private_notes TEXT
);

CREATE TABLE accounts (
  account_id TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  plan_type TEXT NOT NULL,
  monthly_revenue REAL NOT NULL,
  risk_score REAL NOT NULL,
  health_status TEXT NOT NULL,
  api_key TEXT
);

CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  order_date TEXT NOT NULL,
  category TEXT NOT NULL,
  coupon_code TEXT,
  delivery_address TEXT,
  internal_note TEXT
);

CREATE TABLE support_tickets (
  ticket_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  topic TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolution_hours REAL,
  message_body TEXT
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  actor_email TEXT,
  session_token TEXT,
  secret_payload TEXT,
  body TEXT
);

CREATE VIEW revenue_by_category AS
  SELECT category, currency, COUNT(*) AS order_count, SUM(amount) AS total_amount
  FROM orders
  GROUP BY category, currency;

INSERT INTO customers VALUES
  (1, 'Alice Chan', 'alice.chan@example.com', '+66 81 111 2211', '1101700200011', '1988-01-02', 'active', 'Bangkok', 'TH', '2025-01-15', 92.5, '88 Sukhumvit Road', 'VIP churn risk: divorce mentioned'),
  (2, 'Ben Lopez', 'ben.lopez@example.com', '+66 82 333 4422', '1101700200022', '1990-03-04', 'active', 'Chiang Mai', 'TH', '2025-02-20', 75.0, '221B Demo Street', 'Asked about invoice export'),
  (3, 'Chanya Suk', 'chanya.suk@example.com', '+66 83 555 6633', '1101700200033', '1979-09-09', 'paused', 'Phuket', 'TH', '2024-12-05', 58.0, '12 Beach Lane', 'Sensitive medical note'),
  (4, 'Dara Ng', 'dara.ng@example.com', '+65 9000 1234', '1101700200044', '1985-07-07', 'active', 'Singapore', 'SG', '2025-04-01', 88.0, '9 Market Street', 'Enterprise buyer');

INSERT INTO accounts VALUES
  ('acct_alice_enterprise', 1, 'enterprise', 2500, 0.18, 'healthy', 'sk_live_customer_export_123'),
  ('acct_ben_growth', 2, 'growth', 1200, 0.35, 'watch', 'sk_live_growth_456'),
  ('acct_chanya_starter', 3, 'starter', 300, 0.71, 'at_risk', 'sk_live_starter_789'),
  ('acct_dara_enterprise', 4, 'enterprise', 3200, 0.22, 'healthy', 'oauth-refresh-token-demo');

INSERT INTO orders VALUES
  (1001, 1, 'acct_alice_enterprise', 4800, 'THB', '2026-05-01', 'software', 'VIP50', '88 Sukhumvit Road', 'card_4242424242424242'),
  (1002, 1, 'acct_alice_enterprise', 1250, 'THB', '2026-05-03', 'services', NULL, '88 Sukhumvit Road', 'rush renewal'),
  (1003, 2, 'acct_ben_growth', 2400, 'THB', '2026-05-05', 'software', 'GROWTH10', '221B Demo Street', 'finance contact copied'),
  (1004, 3, 'acct_chanya_starter', 150, 'THB', '2026-05-07', 'support', NULL, '12 Beach Lane', 'refund requested'),
  (1005, 4, 'acct_dara_enterprise', 5300, 'SGD', '2026-05-08', 'software', 'ENT20', '9 Market Street', 'board deck needed'),
  (1006, 4, 'acct_dara_enterprise', 700, 'SGD', '2026-05-10', 'training', NULL, '9 Market Street', 'onsite workshop');

INSERT INTO support_tickets VALUES
  (501, 1, 'billing', 'high', 'open', '2026-05-04T09:15:00Z', NULL, 'Customer pasted tax document and private address'),
  (502, 2, 'integration', 'medium', 'closed', '2026-05-05T11:00:00Z', 5.5, 'Webhook token exposed in message'),
  (503, 3, 'refund', 'high', 'open', '2026-05-09T14:30:00Z', NULL, 'Medical hardship details in free text'),
  (504, 4, 'onboarding', 'low', 'closed', '2026-05-11T03:20:00Z', 2.0, 'Normal product question');

INSERT INTO audit_log VALUES
  (1, 'ops@example.com', 'raw-session-token-abc', 'credential dump', 'full audit body');
