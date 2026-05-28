-- =========================================================
-- Nông Sản Tuấn Tú Hà Nội — Database Schema
-- Postgres 15+ (Supabase default)
-- Paste toàn bộ file này vào Supabase → SQL Editor → Run
-- =========================================================

-- Cleanup nếu đã có (chạy idempotent)
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS reminders CASCADE;
DROP TABLE IF EXISTS notes CASCADE;
DROP TABLE IF EXISTS maintenance_logs CASCADE;
DROP TABLE IF EXISTS fuel_logs CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS cash_entries CASCADE;
DROP TABLE IF EXISTS payment_accounts CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS partners CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS staff CASCADE;
DROP TABLE IF EXISTS company_info CASCADE;
DROP TABLE IF EXISTS master_data CASCADE;
DROP TABLE IF EXISTS integrations CASCADE;

-- =========================================================
-- 1. STAFF — Nhân viên (gắn với auth.users của Supabase)
-- =========================================================
CREATE TABLE staff (
  id          TEXT PRIMARY KEY,              -- NV001, NV002...
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL UNIQUE,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT,
  dept        TEXT,
  phone       TEXT,
  email       TEXT,
  avatar      TEXT,
  avatar_color TEXT DEFAULT '#1C2D5A',
  permissions TEXT[] DEFAULT '{}',           -- mảng: ['Tất cả'] hoặc ['Dashboard','Khách hàng',...]
  salary      BIGINT DEFAULT 0,
  kpi         TEXT,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active','off')),
  join_date   DATE,
  address     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_staff_user_id ON staff(user_id);
CREATE INDEX idx_staff_status ON staff(status);

-- =========================================================
-- 2. CUSTOMERS — Khách hàng
-- =========================================================
CREATE TABLE customers (
  id           TEXT PRIMARY KEY,             -- KH001, KH002...
  code         TEXT NOT NULL UNIQUE,
  type         TEXT NOT NULL CHECK (type IN ('B2B','B2C')),
  group_name   TEXT DEFAULT 'Mới',           -- VIP / Thường / Mới / Inactive
  name         TEXT NOT NULL,
  contact      TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  province     TEXT,
  service_id   TEXT DEFAULT 'lien-tinh',     -- lien-tinh / chuyen-nha / thue-xe-tai / thue-kho / thue-cau / boc-xep
  route        TEXT,
  -- B2B fields
  company      TEXT,
  tax_code     TEXT,
  representative TEXT,
  contract     TEXT,
  -- Tracking
  source       TEXT,
  staff_owner  TEXT,                         -- tên NV phụ trách
  last_contact DATE,
  last_order   DATE,
  active       BOOLEAN DEFAULT TRUE,
  -- Stats (cập nhật bằng trigger hoặc rebuild)
  orders_count INTEGER DEFAULT 0,
  revenue      BIGINT DEFAULT 0,
  debt         BIGINT DEFAULT 0,
  debt_overdue BIGINT DEFAULT 0,
  remind_count INTEGER DEFAULT 0,
  zalo         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_customers_type ON customers(type);
CREATE INDEX idx_customers_group ON customers(group_name);
CREATE INDEX idx_customers_staff ON customers(staff_owner);
CREATE INDEX idx_customers_phone ON customers(phone);

-- =========================================================
-- 3. VEHICLES — Xe nội bộ
-- =========================================================
CREATE TABLE vehicles (
  id              TEXT PRIMARY KEY,           -- V01, V02...
  plate           TEXT NOT NULL UNIQUE,
  vehicle_type    TEXT,                       -- Xe tải 1.5T / 5T / cẩu...
  capacity        DECIMAL(5,2),
  cap_unit        TEXT DEFAULT 'tấn',
  last_driver     TEXT,                       -- driver id
  last_driver_name TEXT,
  status          TEXT DEFAULT 'idle' CHECK (status IN ('running','idle','maintenance')),
  current_order   TEXT,
  current_route   TEXT,
  odometer        INTEGER DEFAULT 0,
  last_service    TEXT,
  next_register   TEXT,
  next_service_km INTEGER,
  insurance       TEXT,
  cost_30d        BIGINT DEFAULT 0,
  trips_30d       INTEGER DEFAULT 0,
  maintenance_note TEXT,
  documents       JSONB DEFAULT '[]'::jsonb,  -- mảng files đính kèm
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_vehicles_status ON vehicles(status);

-- =========================================================
-- 4. DRIVERS — Tài xế nội bộ
-- =========================================================
CREATE TABLE drivers (
  id            TEXT PRIMARY KEY,             -- DR01, DR02...
  code          TEXT NOT NULL UNIQUE,         -- TX001
  name          TEXT NOT NULL,
  phone         TEXT,
  license       TEXT,
  can_drive     TEXT[] DEFAULT '{}',          -- mảng vehicle ids tài xế lái được
  primary_vehicle TEXT,
  primary_plate TEXT,
  status        TEXT DEFAULT 'off' CHECK (status IN ('running','off')),
  join_date     DATE,
  trips_30d     INTEGER DEFAULT 0,
  revenue_30d   BIGINT DEFAULT 0,
  rating        DECIMAL(2,1) DEFAULT 5.0,
  address       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_drivers_status ON drivers(status);

-- =========================================================
-- 5. PARTNERS — Đối tác ngoài
-- =========================================================
CREATE TABLE partners (
  id            TEXT PRIMARY KEY,             -- P01, P02...
  code          TEXT NOT NULL UNIQUE,         -- DT001
  kind          TEXT NOT NULL CHECK (kind IN ('company','freelance')),
  name          TEXT NOT NULL,
  contact       TEXT,
  phone         TEXT,
  vehicle_plate TEXT,
  vehicle_type  TEXT,
  capacity      DECIMAL(5,2) DEFAULT 0,
  cap_unit      TEXT DEFAULT 'tấn',
  specialty     TEXT,
  pricing       TEXT,
  rating        DECIMAL(2,1) DEFAULT 5.0,
  trips_30d     INTEGER DEFAULT 0,
  total_spent_30d BIGINT DEFAULT 0,
  active        BOOLEAN DEFAULT TRUE,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_partners_kind ON partners(kind);
CREATE INDEX idx_partners_active ON partners(active);

-- =========================================================
-- 6. ORDERS — Đơn hàng
-- =========================================================
CREATE TABLE orders (
  code           TEXT PRIMARY KEY,             -- NSTT-526045
  order_date     TIMESTAMPTZ DEFAULT NOW(),
  customer_id    TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  TEXT,
  service_type   TEXT NOT NULL,                -- lien-tinh / chuyen-nha / ...
  transport_mode TEXT,                         -- duong-bo / duong-thuy / duong-sat (chỉ liên tỉnh)
  pickup         TEXT,
  drop_address   TEXT,
  goods          TEXT,
  qty            INTEGER DEFAULT 1,
  weight         INTEGER DEFAULT 0,
  unit           TEXT DEFAULT 'Thùng',
  freight        BIGINT NOT NULL,              -- cước thu KH
  cod            BIGINT DEFAULT 0,             -- thu hộ
  pay_by         TEXT,                         -- Người gửi trả / Người nhận trả / Công nợ
  -- Carrier (xe + tài xế)
  driver_id      TEXT,
  driver_name    TEXT,
  vehicle        TEXT,
  external       BOOLEAN DEFAULT FALSE,        -- TRUE = thuê đối tác ngoài
  partner_id     TEXT REFERENCES partners(id) ON DELETE SET NULL,
  partner_name   TEXT,
  partner_cost   BIGINT DEFAULT 0,
  profit         BIGINT,                       -- = freight - partner_cost (chỉ external)
  -- Status
  status         TEXT DEFAULT 'confirmed' CHECK (status IN ('draft','confirmed','pickup','transit','delivered','reconciled','cancelled')),
  cancel_reason  TEXT,
  -- Tracking
  staff          TEXT,                         -- NV tạo đơn
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_service ON orders(service_type);
CREATE INDEX idx_orders_date ON orders(order_date DESC);
CREATE INDEX idx_orders_staff ON orders(staff);

-- =========================================================
-- 7. PAYMENT_ACCOUNTS — TK thanh toán
-- =========================================================
CREATE TABLE payment_accounts (
  id          TEXT PRIMARY KEY,                -- A1, A2...
  kind        TEXT NOT NULL CHECK (kind IN ('cash','bank','ewallet')),
  name        TEXT NOT NULL,
  detail      TEXT,
  balance     BIGINT DEFAULT 0,
  keeper      TEXT,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- 8. CASH_ENTRIES — Sổ quỹ (phiếu thu/chi)
-- =========================================================
CREATE TABLE cash_entries (
  no          TEXT PRIMARY KEY,                -- PT-526045 / PC-526010
  entry_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type  TEXT NOT NULL CHECK (entry_type IN ('in','out')),
  party       TEXT,                            -- người nộp/nhận
  description TEXT,
  account     TEXT,                            -- tên TK liên quan
  amount      BIGINT NOT NULL,
  staff       TEXT,
  ref_order   TEXT,                            -- mã đơn liên quan (nullable)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cash_type ON cash_entries(entry_type);
CREATE INDEX idx_cash_date ON cash_entries(entry_date DESC);

-- =========================================================
-- 9. INVOICES — Hóa đơn VAT
-- =========================================================
CREATE TABLE invoices (
  no          TEXT PRIMARY KEY,                -- 1C25T-0042
  inv_date    DATE NOT NULL,
  customer    TEXT,
  tax_code    TEXT,
  description TEXT,
  net         BIGINT NOT NULL,                 -- tiền hàng
  vat         BIGINT NOT NULL,                 -- thuế VAT
  status      TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending','paid','overdue')),
  cqt_code    TEXT,                            -- mã CQT
  cqt_sync    TEXT,                            -- success/failed/pending
  issued_at   TIMESTAMPTZ,
  paid_date   DATE,
  paid_via    TEXT,                            -- số phiếu thu link đến
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(inv_date DESC);

-- =========================================================
-- 10. NOTES, REMINDERS, LOGS — phụ trợ
-- =========================================================
CREATE TABLE notes (
  id          BIGSERIAL PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  who         TEXT,
  when_at     TIMESTAMPTZ DEFAULT NOW(),
  text        TEXT NOT NULL
);
CREATE INDEX idx_notes_customer ON notes(customer_id, when_at DESC);

CREATE TABLE reminders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  rem_date    TIMESTAMPTZ DEFAULT NOW(),
  channel     TEXT,                            -- call / zalo / sms / email / onsite
  message     TEXT,
  response    TEXT,                            -- promise / paid / negotiate / excuse / no-answer / refuse
  by_staff    TEXT
);
CREATE INDEX idx_reminders_customer ON reminders(customer_id, rem_date DESC);

CREATE TABLE fuel_logs (
  id          BIGSERIAL PRIMARY KEY,
  vehicle_id  TEXT REFERENCES vehicles(id) ON DELETE CASCADE,
  fuel_date   TIMESTAMPTZ DEFAULT NOW(),
  amount      BIGINT NOT NULL,
  liters      DECIMAL(6,2),
  odometer    INTEGER NOT NULL,
  by_driver   TEXT,
  station     TEXT
);
CREATE INDEX idx_fuel_vehicle ON fuel_logs(vehicle_id, fuel_date DESC);

CREATE TABLE maintenance_logs (
  id          BIGSERIAL PRIMARY KEY,
  vehicle_id  TEXT REFERENCES vehicles(id) ON DELETE CASCADE,
  m_date      DATE DEFAULT CURRENT_DATE,
  m_type      TEXT,                            -- Bảo dưỡng định kỳ / Thay dầu / Sửa máy...
  cost        BIGINT,
  odometer    INTEGER,
  garage      TEXT,
  note        TEXT
);
CREATE INDEX idx_maint_vehicle ON maintenance_logs(vehicle_id, m_date DESC);

CREATE TABLE activity_logs (
  id          BIGSERIAL PRIMARY KEY,
  staff_id    TEXT,
  action      TEXT,                            -- login / logout / create_order / ...
  detail      TEXT,
  at_time     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_activity_staff ON activity_logs(staff_id, at_time DESC);

-- =========================================================
-- 11. COMPANY_INFO, MASTER_DATA, INTEGRATIONS — config
-- =========================================================
CREATE TABLE company_info (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton row
  name        TEXT,
  short_name  TEXT,
  tax_code    TEXT,
  reg_no      TEXT,
  address     TEXT,
  hotline     TEXT,
  email       TEXT,
  website     TEXT,
  bank        TEXT,
  slogan      TEXT,
  logo_url    TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE master_data (
  key         TEXT PRIMARY KEY,                -- services / custGroups / sources / units / ...
  data        JSONB NOT NULL,                  -- mảng [{id, label, icon, color}]
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE integrations (
  id          TEXT PRIMARY KEY,                -- telegram / zalo-oa / ai-engine / ...
  enabled     BOOLEAN DEFAULT FALSE,
  config      JSONB DEFAULT '{}'::jsonb,       -- {botToken, apiKey, ...}
  last_test_at TIMESTAMPTZ,
  last_test_result TEXT,
  configured_at TIMESTAMPTZ
);

-- =========================================================
-- Auto-update updated_at trigger
-- =========================================================
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
           AND tablename IN ('staff','customers','vehicles','drivers','partners','orders','payment_accounts','invoices','company_info','master_data')
  LOOP
    EXECUTE format('CREATE TRIGGER set_timestamp_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();', t, t);
  END LOOP;
END $$;

-- =========================================================
-- DONE — bảng đã tạo. Tiếp theo chạy file 02-rls.sql
-- =========================================================
SELECT 'Schema created successfully — 16 tables ready' AS status;
