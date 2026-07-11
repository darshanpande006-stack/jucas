-- Jucas data model. SQLite (node:sqlite).
-- Design notes:
--  * All client-facing names carry _en/_hi/_mr columns (trilingual is first-class).
--  * Recipe quantities are stored per 100 plates — the unit caterers actually think in.
--  * A proposal doubles as the contract: acceptance captures typed-name signature,
--    timestamp and phone (upgradeable to a formal e-sign provider later).
--  * Money is stored as REAL rupees; volumes here never hit float-precision issues
--    that matter at ₹ granularity, and it keeps SQL reporting simple.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clients (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  whatsapp    TEXT,               -- often same as phone; kept separate for reality
  email       TEXT,
  address     TEXT,
  lang        TEXT NOT NULL DEFAULT 'mr',  -- preferred language: en | hi | mr
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venues (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  address   TEXT,
  city      TEXT,
  capacity  INTEGER,
  notes     TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id           INTEGER PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES clients(id),
  source       TEXT NOT NULL DEFAULT 'walk_in', -- walk_in|phone|whatsapp|referral|portal
  event_type   TEXT,                            -- wedding|engagement|thread_ceremony|birthday|corporate|religious|other
  event_date   TEXT,
  meal         TEXT DEFAULT 'lunch',            -- breakfast|lunch|dinner
  guest_count  INTEGER,
  venue_id     INTEGER REFERENCES venues(id),
  venue_text   TEXT,
  status       TEXT NOT NULL DEFAULT 'new',     -- new|contacted|proposal_sent|confirmed|lost
  notes        TEXT,
  token        TEXT UNIQUE,                     -- public status-tracking link
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Catalog ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS packages (
  id                    INTEGER PRIMARY KEY,
  code                  TEXT UNIQUE NOT NULL,
  tier                  INTEGER NOT NULL,        -- 1 = entry, 2 = premium, 3 = royal
  name_en TEXT NOT NULL, name_hi TEXT NOT NULL, name_mr TEXT NOT NULL,
  desc_en TEXT, desc_hi TEXT, desc_mr TEXT,
  base_price_per_plate  REAL NOT NULL,
  min_guests            INTEGER NOT NULL DEFAULT 100,
  active                INTEGER NOT NULL DEFAULT 1
);

-- Volume slabs: at guest_count >= min_guests apply discount_pct to the per-plate
-- price. package_id NULL = applies to every package.
CREATE TABLE IF NOT EXISTS price_slabs (
  id           INTEGER PRIMARY KEY,
  package_id   INTEGER REFERENCES packages(id),
  min_guests   INTEGER NOT NULL,
  discount_pct REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS dishes (
  id       INTEGER PRIMARY KEY,
  name_en TEXT NOT NULL, name_hi TEXT NOT NULL, name_mr TEXT NOT NULL,
  category TEXT NOT NULL,       -- sweet|main|dal|rice|bread|snack|salad|condiment|beverage
  addon_price_per_plate REAL NOT NULL DEFAULT 0,  -- per-plate delta when added on top of a package
  active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS package_dishes (
  package_id INTEGER NOT NULL REFERENCES packages(id),
  dish_id    INTEGER NOT NULL REFERENCES dishes(id),
  PRIMARY KEY (package_id, dish_id)
);

CREATE TABLE IF NOT EXISTS ingredients (
  id          INTEGER PRIMARY KEY,
  name_en TEXT NOT NULL, name_hi TEXT NOT NULL, name_mr TEXT NOT NULL,
  unit        TEXT NOT NULL,     -- kg | L | pcs
  category    TEXT NOT NULL,     -- grain|pulse|vegetable|fruit|dairy|oil|spice|dry_fruit|sweetener|other
  market_rate REAL               -- approx ₹ per unit, for procurement cost estimates
);

-- Quantity of an ingredient needed per 100 plates of a dish.
CREATE TABLE IF NOT EXISTS recipe_items (
  id            INTEGER PRIMARY KEY,
  dish_id       INTEGER NOT NULL REFERENCES dishes(id),
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  qty_per_100   REAL NOT NULL,
  UNIQUE (dish_id, ingredient_id)
);

-- ── Events ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY,
  lead_id         INTEGER REFERENCES leads(id),
  client_id       INTEGER NOT NULL REFERENCES clients(id),
  title           TEXT,
  event_type      TEXT,
  event_date      TEXT NOT NULL,
  meal            TEXT DEFAULT 'lunch',
  venue_id        INTEGER REFERENCES venues(id),
  venue_text      TEXT,
  guest_count     INTEGER NOT NULL,
  package_id      INTEGER REFERENCES packages(id),
  per_plate_price REAL,                      -- cached output of the pricing engine
  status          TEXT NOT NULL DEFAULT 'booked', -- booked|in_prep|completed|cancelled
  notes           TEXT,
  token           TEXT UNIQUE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_menu_items (
  id           INTEGER PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id),
  dish_id      INTEGER NOT NULL REFERENCES dishes(id),
  from_package INTEGER NOT NULL DEFAULT 1,   -- 1 = part of package, 0 = paid add-on
  price_delta  REAL NOT NULL DEFAULT 0,      -- per-plate, only for add-ons
  UNIQUE (event_id, dish_id)
);

-- ── Procurement ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendors (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  phone    TEXT,
  category TEXT,      -- grocery|vegetable|dairy|other
  notes    TEXT
);

-- Snapshot of the scaled shopping list for one event (regenerable).
CREATE TABLE IF NOT EXISTS procurement_items (
  id            INTEGER PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id),
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  qty           REAL NOT NULL,
  unit          TEXT NOT NULL,
  est_cost      REAL,
  purchased     INTEGER NOT NULL DEFAULT 0,
  actual_cost   REAL,
  vendor_id     INTEGER REFERENCES vendors(id),
  UNIQUE (event_id, ingredient_id)
);

-- ── Contract labor ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  phone    TEXT,
  whatsapp TEXT,
  role     TEXT NOT NULL,          -- head_cook|cook|helper|server|driver
  day_rate REAL NOT NULL DEFAULT 0,
  notes    TEXT,
  active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS staff_assignments (
  id            INTEGER PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id),
  staff_id      INTEGER NOT NULL REFERENCES staff(id),
  role          TEXT NOT NULL,
  agreed_rate   REAL NOT NULL,               -- day rate agreed for this event
  status        TEXT NOT NULL DEFAULT 'invited', -- invited|confirmed|declined
  attendance    TEXT,                        -- NULL|present|half_day|absent
  payout_amount REAL,                        -- computed from attendance × agreed_rate
  paid          INTEGER NOT NULL DEFAULT 0,
  paid_at       TEXT,
  UNIQUE (event_id, staff_id)
);

-- ── Proposals / contracts ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proposals (
  id              INTEGER PRIMARY KEY,
  lead_id         INTEGER NOT NULL REFERENCES leads(id),
  version         INTEGER NOT NULL DEFAULT 1,
  package_id      INTEGER REFERENCES packages(id),
  guest_count     INTEGER NOT NULL,
  per_plate_price REAL NOT NULL,
  items_json      TEXT NOT NULL,   -- frozen snapshot of menu + pricing lines
  total           REAL NOT NULL,
  advance_pct     REAL NOT NULL DEFAULT 50,
  valid_until     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft', -- draft|sent|viewed|accepted|rejected|expired
  token           TEXT UNIQUE NOT NULL,
  sent_at         TEXT,
  viewed_at       TEXT,
  accepted_at     TEXT,            -- e-signature record (typed-name confirmation)
  accepted_name   TEXT,
  accepted_phone  TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Billing ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id         INTEGER PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id),
  number     TEXT UNIQUE NOT NULL,   -- JUC-2026-0001
  issue_date TEXT NOT NULL,
  due_date   TEXT,
  subtotal   REAL NOT NULL,
  discount   REAL NOT NULL DEFAULT 0,
  total      REAL NOT NULL,
  status     TEXT NOT NULL DEFAULT 'unpaid', -- unpaid|partial|paid|cancelled (cache; derived from payments)
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          INTEGER PRIMARY KEY,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL,
  qty         REAL NOT NULL DEFAULT 1,
  rate        REAL NOT NULL,
  amount      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id),
  event_id   INTEGER NOT NULL REFERENCES events(id),
  amount     REAL NOT NULL,
  method     TEXT NOT NULL,   -- cash | upi | bank
  ref        TEXT,            -- UPI txn id / cheque no
  paid_on    TEXT NOT NULL,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Communication ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comm_logs (
  id           INTEGER PRIMARY KEY,
  client_id    INTEGER REFERENCES clients(id),
  lead_id      INTEGER REFERENCES leads(id),
  event_id     INTEGER REFERENCES events(id),
  staff_id     INTEGER REFERENCES staff(id),
  channel      TEXT NOT NULL,               -- whatsapp|email|call|sms
  direction    TEXT NOT NULL DEFAULT 'out', -- out|in
  template_key TEXT,
  lang         TEXT,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'logged', -- logged (wa.me handoff)|queued|sent|failed
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_status       ON leads(status);
CREATE INDEX IF NOT EXISTS idx_events_date        ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_client      ON events(client_id);
CREATE INDEX IF NOT EXISTS idx_menu_event         ON event_menu_items(event_id);
CREATE INDEX IF NOT EXISTS idx_proc_event         ON procurement_items(event_id);
CREATE INDEX IF NOT EXISTS idx_assign_event       ON staff_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_payments_event     ON payments(event_id);
CREATE INDEX IF NOT EXISTS idx_comm_client        ON comm_logs(client_id);
