-- =========================================================
-- Nông Sản Tuấn Tú Hà Nội — Schema NSTT (clean, không liên quan VTY)
-- 14 bảng nông sản B2B
-- =========================================================
-- ⚠️ Chỉ chạy file này vào project Supabase MỚI tên `nstt-crm`.
-- KHÔNG chạy vào project VTY (dbfffwtnxhytcoczhxhf) — sẽ ghi đè data VTY.

-- =====================================================
-- 1. STAFF — Nhân viên nội bộ
-- =====================================================
CREATE TABLE staff (
  id            TEXT PRIMARY KEY,                 -- NV001, NV002...
  user_id       UUID UNIQUE,                       -- link tới auth.users.id (sau khi tạo user)
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,                     -- 'Chủ doanh nghiệp' | 'Sales' | 'CSKH' | 'Kế toán' | 'Vận hành'
  dept          TEXT,                              -- 'Ban GĐ' | 'Sales' | 'CSKH' | 'Kế toán'...
  phone         TEXT,
  email         TEXT UNIQUE,
  salary        BIGINT DEFAULT 0,                  -- lương cơ bản (VNĐ)
  perms         TEXT[] DEFAULT '{}',               -- mảng quyền module: ['dashboard','orders','customers'...]
  status        TEXT DEFAULT 'active',             -- 'active' | 'inactive'
  hire_date     DATE,
  kpi           INT DEFAULT 0,                     -- 0-100
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_staff_user_id  ON staff(user_id);
CREATE INDEX idx_staff_role     ON staff(role);
CREATE INDEX idx_staff_status   ON staff(status);

-- =====================================================
-- 2. CUSTOMERS — Khách hàng (nhà hàng, quán ăn, khách sạn, canteen, cafe)
-- =====================================================
CREATE TABLE customers (
  id            TEXT PRIMARY KEY,                  -- KH001, KH002...
  code          TEXT UNIQUE NOT NULL,
  type          TEXT,                              -- 'nha-hang' | 'quan-an' | 'khach-san' | 'canteen' | 'cafe' | 'individual'
  group_name    TEXT,                              -- 'VIP' | 'Thường' | 'Mới' | 'Inactive'
  name          TEXT NOT NULL,
  contact       TEXT,                              -- Tên người liên hệ chính
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  province      TEXT DEFAULT 'Hà Nội',
  order_freq    TEXT,                              -- 'hang-ngay' | '2-3-tuan' | 'hang-tuan' | 'thang'
  main_cats     TEXT[] DEFAULT '{}',               -- nhóm hàng hay mua: ['rau-ta','thit-lon'...]
  staff_owner   TEXT,                              -- tên NV phụ trách
  source        TEXT,                              -- 'Sales chủ động' | 'Giới thiệu' | 'Zalo' | 'Facebook'...
  created       DATE,
  last_order    DATE,
  last_contact  DATE,
  active        BOOLEAN DEFAULT TRUE,
  orders_count  INT DEFAULT 0,                     -- số đơn đã đặt
  revenue       BIGINT DEFAULT 0,                  -- tổng doanh thu
  debt          BIGINT DEFAULT 0,                  -- công nợ phải thu
  debt_overdue  BIGINT DEFAULT 0,                  -- công nợ quá hạn
  zalo          TEXT,
  notes         JSONB DEFAULT '[]',                -- [{who,when,text}]
  company       TEXT,                              -- tên DN trên hợp đồng
  tax           TEXT,                              -- MST
  rep           TEXT,                              -- Người đại diện pháp lý
  contract      TEXT,                              -- Mã hợp đồng
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_customers_type        ON customers(type);
CREATE INDEX idx_customers_group       ON customers(group_name);
CREATE INDEX idx_customers_staff_owner ON customers(staff_owner);
CREATE INDEX idx_customers_phone       ON customers(phone);
CREATE INDEX idx_customers_active      ON customers(active);

-- =====================================================
-- 3. PRODUCTS — Sản phẩm nông sản (120+ SP)
-- =====================================================
CREATE TABLE products (
  id              TEXT PRIMARY KEY,                -- SP001, SP002...
  name            TEXT NOT NULL,
  en              TEXT,                            -- tên tiếng Anh
  cat             TEXT,                            -- 'rau-ta' | 'rau-dalat' | 'nam' | 'rau-vung-mien' | 'rau-gia-vi' | 'rau-la' | 'thit-lon' | 'thit-ga' | 'thit-bo' | 'hang-khac' | 'khac'
  unit            TEXT DEFAULT 'kg',
  img             TEXT,                            -- path tới ảnh
  price_history   JSONB DEFAULT '[]',              -- [{date, buy, sell}]
  supplier_id     TEXT,                            -- NCC mặc định
  stock_threshold INT DEFAULT 5,                   -- ngưỡng cảnh báo sắp hết hàng
  tags            TEXT[] DEFAULT '{}',
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_products_cat    ON products(cat);
CREATE INDEX idx_products_active ON products(active);

-- =====================================================
-- 4. ORDERS — Đơn hàng (B2B giao cho nhà hàng)
-- =====================================================
CREATE TABLE orders (
  code           TEXT PRIMARY KEY,                 -- NSTT-526064
  order_date     TIMESTAMPTZ NOT NULL,
  customer_id    TEXT REFERENCES customers(id) ON DELETE SET NULL,
  cust_name      TEXT,                             -- snapshot tên KH lúc đặt
  service_type   TEXT,                             -- 'rau-ta' | 'thit-lon' | 'rau-la'...
  transport_mode TEXT DEFAULT 'giao-ngay',
  pickup_addr    TEXT,                             -- địa chỉ lấy hàng (kho NSTT)
  drop_addr      TEXT,                             -- địa chỉ giao
  goods          TEXT,                             -- mô tả tóm tắt SP
  qty            DECIMAL(10,2),                    -- tổng số lượng
  weight         DECIMAL(10,2),                    -- tổng cân nặng (kg)
  unit           TEXT DEFAULT 'kg',
  items          JSONB DEFAULT '[]',               -- [{id,name,unit,qty,price,total}]
  freight        BIGINT DEFAULT 0,                 -- tổng tiền hàng
  cod            BIGINT DEFAULT 0,                 -- thu hộ
  pay_by         TEXT DEFAULT 'Công nợ',           -- 'Tiền mặt' | 'Chuyển khoản' | 'Công nợ'
  shipper_id     TEXT,                             -- nếu có shipper nội bộ
  driver_name    TEXT,                             -- tên người giao
  vehicle        TEXT,                             -- biển số / mô tả phương tiện
  status         TEXT DEFAULT 'new',               -- 'new'|'confirmed'|'pickup'|'transit'|'delivered'|'reconciled'|'settled'|'returned'|'cancelled'
  return_reason  TEXT,                             -- lý do trả hàng (nếu có)
  staff          TEXT,                             -- NV xử lý đơn
  delivered_at   TIMESTAMPTZ,
  delivery_time  TEXT DEFAULT 'Sáng',
  taken_by       TEXT,                             -- NV nhận đặt hàng (cho phiếu xuất kho)
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_orders_customer    ON orders(customer_id);
CREATE INDEX idx_orders_status      ON orders(status);
CREATE INDEX idx_orders_date        ON orders(order_date DESC);
CREATE INDEX idx_orders_staff       ON orders(staff);
CREATE INDEX idx_orders_service     ON orders(service_type);

-- =====================================================
-- 5. INVOICES — Hóa đơn VAT điện tử
-- =====================================================
CREATE TABLE invoices (
  no            TEXT PRIMARY KEY,                  -- 1C25T-0042
  invoice_date  DATE NOT NULL,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  cust          TEXT,
  tax           TEXT,                              -- MST KH
  net           BIGINT DEFAULT 0,                  -- tiền hàng chưa VAT
  vat           BIGINT DEFAULT 0,                  -- tiền VAT
  vat_rate      INT DEFAULT 10,                    -- % VAT
  description   TEXT,
  status        TEXT DEFAULT 'draft',              -- 'draft'|'pending'|'paid'|'overdue'
  paid_date     DATE,
  cqt_code      TEXT,                              -- mã cơ quan thuế
  cqt_sync      TEXT,                              -- 'success'|'failed'|'pending'
  issued_at     TIMESTAMPTZ,
  related_order TEXT REFERENCES orders(code) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status   ON invoices(status);
CREATE INDEX idx_invoices_date     ON invoices(invoice_date DESC);

-- =====================================================
-- 6. SUPPLIERS — Nhà cung cấp nông sản
-- =====================================================
CREATE TABLE suppliers (
  id              TEXT PRIMARY KEY,                -- NCC001
  code            TEXT UNIQUE,
  name            TEXT NOT NULL,
  contact_person  TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  tax             TEXT,                            -- MST NCC
  supply_categories TEXT[] DEFAULT '{}',           -- ['rau-dalat','thit-lon']
  payment_terms   TEXT,                            -- 'Trả ngay' | 'Công nợ 7 ngày' | 'Công nợ 30 ngày'
  balance         BIGINT DEFAULT 0,                -- công nợ phải trả NCC
  active          BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_suppliers_active ON suppliers(active);

-- =====================================================
-- 7. SHIPPERS — Đội shipper nội bộ
-- =====================================================
CREATE TABLE shippers (
  id            TEXT PRIMARY KEY,                  -- SH001
  name          TEXT NOT NULL,
  phone         TEXT,
  vehicle       TEXT,                              -- biển số xe
  area          TEXT,                              -- khu vực phụ trách
  active        BOOLEAN DEFAULT TRUE,
  orders_today  INT DEFAULT 0,
  kpi_total     INT DEFAULT 0,                     -- tổng đơn đã giao
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 8. LEADS — Khách hàng tiềm năng
-- =====================================================
CREATE TABLE leads (
  id            TEXT PRIMARY KEY,                  -- LD001
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  source        TEXT,                              -- 'Facebook' | 'Zalo' | 'Hotline' | 'Khảo sát' | 'Giới thiệu'
  stage         TEXT DEFAULT 'new',                -- 'new'|'contacted'|'meeting'|'converted'|'lost'
  est_value     BIGINT DEFAULT 0,                  -- giá trị dự kiến/tháng
  owner         TEXT,                              -- NV phụ trách
  notes         TEXT,
  last_contact  DATE,
  converted_to  TEXT REFERENCES customers(id) ON DELETE SET NULL,  -- nếu chốt thành KH
  lost_reason   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_leads_stage ON leads(stage);
CREATE INDEX idx_leads_owner ON leads(owner);

-- =====================================================
-- 9. PAYMENT_ACCOUNTS — TK thanh toán (quỹ tiền mặt + NH)
-- =====================================================
CREATE TABLE payment_accounts (
  id            TEXT PRIMARY KEY,                  -- A1, A2
  kind          TEXT,                              -- 'cash'|'bank'|'ewallet'
  name          TEXT NOT NULL,
  detail        TEXT,
  balance       BIGINT DEFAULT 0,
  keeper        TEXT,                              -- NV thủ quỹ
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 10. CASH_ENTRIES — Phiếu thu / chi
-- =====================================================
CREATE TABLE cash_entries (
  no            TEXT PRIMARY KEY,                  -- PT-526045, PC-526010
  entry_date    DATE NOT NULL,
  entry_type    TEXT NOT NULL,                     -- 'in' (thu) | 'out' (chi)
  party         TEXT,                              -- Người nộp/nhận
  description   TEXT,
  account       TEXT,                              -- tên TK
  amount        BIGINT NOT NULL,
  staff         TEXT,                              -- NV lập phiếu
  related_order TEXT REFERENCES orders(code) ON DELETE SET NULL,
  related_invoice TEXT REFERENCES invoices(no) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cash_type ON cash_entries(entry_type);
CREATE INDEX idx_cash_date ON cash_entries(entry_date DESC);

-- =====================================================
-- 11. MASTER_DATA — Dữ liệu nền dropdown (loại KH, nhóm, dịch vụ...)
-- =====================================================
CREATE TABLE master_data (
  key           TEXT PRIMARY KEY,                  -- 'cust_types','cust_groups','service_types'...
  items         JSONB NOT NULL DEFAULT '[]',       -- [{id,label,icon,color}]
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 12. COMPANY_INFO — Cấu hình DN (1 row duy nhất)
-- =====================================================
CREATE TABLE company_info (
  id            INT PRIMARY KEY DEFAULT 1,         -- luôn = 1, đảm bảo single-row
  name          TEXT,
  short_name    TEXT,
  tax           TEXT,
  address       TEXT,
  director      TEXT,                              -- SĐT GĐ
  hotline       TEXT,
  email         TEXT,
  website       TEXT,
  bank          TEXT,
  bank_owner    TEXT,
  logo_url      TEXT,
  slogan        TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- =====================================================
-- 13. ACTIVITY_LOGS — Audit log toàn hệ thống
-- =====================================================
CREATE TABLE activity_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID,                              -- ai làm
  user_name     TEXT,
  action        TEXT NOT NULL,                     -- 'order.create', 'invoice.print'...
  target        TEXT,                              -- mã đối tượng (NSTT-xxx, KH001...)
  details       JSONB,                             -- {before, after, extra}
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_activity_user   ON activity_logs(user_id);
CREATE INDEX idx_activity_action ON activity_logs(action);
CREATE INDEX idx_activity_date   ON activity_logs(created_at DESC);

-- =====================================================
-- 14. INTEGRATIONS — Cấu hình tích hợp (Telegram/Zalo/AI/Email...)
-- =====================================================
CREATE TABLE integrations (
  key           TEXT PRIMARY KEY,                  -- 'telegram_bot','zalo_oa','ai_filler'...
  enabled       BOOLEAN DEFAULT FALSE,
  config        JSONB DEFAULT '{}',                -- {token,chatId,channels[...]}
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Trigger: tự cập nhật updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER staff_updated_at      BEFORE UPDATE ON staff      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER customers_updated_at  BEFORE UPDATE ON customers  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER products_updated_at   BEFORE UPDATE ON products   FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER orders_updated_at     BEFORE UPDATE ON orders     FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER invoices_updated_at   BEFORE UPDATE ON invoices   FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER suppliers_updated_at  BEFORE UPDATE ON suppliers  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER shippers_updated_at   BEFORE UPDATE ON shippers   FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER leads_updated_at      BEFORE UPDATE ON leads      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER company_updated_at    BEFORE UPDATE ON company_info FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER master_data_updated_at BEFORE UPDATE ON master_data FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =====================================================
-- Hoàn thành schema. Tiếp theo: 02-rls-nstt.sql để bật bảo mật.
-- =====================================================
