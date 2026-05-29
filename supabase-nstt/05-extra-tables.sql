-- =========================================================
-- Nông Sản Tuấn Tú Hà Nội — 6 bảng phụ trợ (đợt 2)
-- inventory, purchases, quotes, recurring_orders, returns, adspend
-- =========================================================
-- ⚠️ Chạy file này SAU khi đã chạy 01-schema-nstt.sql.

-- =====================================================
-- 13. INVENTORY — Tồn kho theo SP
-- =====================================================
CREATE TABLE IF NOT EXISTS inventory (
  id            TEXT PRIMARY KEY,                  -- INV001
  product_id    TEXT REFERENCES products(id) ON DELETE CASCADE,
  stock         INT DEFAULT 0,                     -- số lượng hiện tại
  min_stock     INT DEFAULT 0,
  max_stock     INT DEFAULT 0,
  avg_daily     INT DEFAULT 0,                     -- trung bình xuất/ngày
  last_in       TEXT,                              -- "dd/mm/yyyy"
  last_out      TEXT,
  location      TEXT,                              -- "Kho A1"
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_loc     ON inventory(location);

-- =====================================================
-- 14. PURCHASES — Phiếu nhập hàng từ NCC
-- =====================================================
CREATE TABLE IF NOT EXISTS purchases (
  id            TEXT PRIMARY KEY,                  -- PN-2026-0142
  supplier_id   TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  date          TEXT,                              -- "dd/mm/yyyy"
  status        TEXT DEFAULT 'ordered',            -- 'ordered'|'received'|'cancelled'
  total         BIGINT DEFAULT 0,
  paid          BIGINT DEFAULT 0,
  items         JSONB DEFAULT '[]',                -- [{productId,name,qty,price,total}]
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status   ON purchases(status);

-- =====================================================
-- 15. QUOTES — Báo giá gửi KH
-- =====================================================
CREATE TABLE IF NOT EXISTS quotes (
  id                  TEXT PRIMARY KEY,            -- BG-2026-0042
  cust_id             TEXT REFERENCES customers(id) ON DELETE SET NULL,
  cust_name           TEXT,
  date                TEXT,                        -- "dd/mm/yyyy"
  valid_until         TEXT,
  status              TEXT DEFAULT 'draft',        -- 'draft'|'sent'|'accepted'|'rejected'|'expired'
  total               BIGINT DEFAULT 0,
  items               JSONB DEFAULT '[]',
  staff_owner         TEXT,
  converted_order_id  TEXT,                        -- mã đơn nếu KH đồng ý
  note                TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quotes_cust   ON quotes(cust_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

-- =====================================================
-- 16. RECURRING_ORDERS — Đơn định kỳ
-- =====================================================
CREATE TABLE IF NOT EXISTS recurring_orders (
  id            TEXT PRIMARY KEY,                  -- RO001
  cust_id       TEXT REFERENCES customers(id) ON DELETE CASCADE,
  cust_name     TEXT,
  frequency     TEXT,                              -- 'daily'|'weekly'|'monthly'|'custom'
  days_of_week  JSONB DEFAULT '[]',                -- [1,2,3,4,5,6]
  deliver_at    TEXT,                              -- "06:30"
  active        BOOLEAN DEFAULT TRUE,
  items         JSONB DEFAULT '[]',
  next_run      TEXT,                              -- "dd/mm/yyyy"
  last_run      TEXT,
  created_at_vn TEXT,                              -- "dd/mm/yyyy" tạo gốc
  staff_owner   TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ro_cust   ON recurring_orders(cust_id);
CREATE INDEX IF NOT EXISTS idx_ro_active ON recurring_orders(active);

-- =====================================================
-- 17. RETURNS — Phiếu trả hàng
-- =====================================================
CREATE TABLE IF NOT EXISTS returns (
  id            TEXT PRIMARY KEY,                  -- RT001
  order_code    TEXT REFERENCES orders(code) ON DELETE SET NULL,
  cust_name     TEXT,
  date          TEXT,                              -- "dd/mm/yyyy"
  reason        TEXT,
  items         JSONB DEFAULT '[]',                -- [{name,qty,refund}]
  refund_total  BIGINT DEFAULT 0,
  status        TEXT DEFAULT 'pending',            -- 'pending'|'refunded'|'replaced'|'rejected'
  pod_photo     TEXT,                              -- URL ảnh proof of delivery
  handled_by    TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_returns_order  ON returns(order_code);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);

-- =====================================================
-- 18. ADSPEND — Chi phí quảng cáo theo ngày
-- =====================================================
CREATE TABLE IF NOT EXISTS adspend (
  id            TEXT PRIMARY KEY,                  -- AD-1716950400-1
  date          TEXT NOT NULL,                     -- "YYYY-MM-DD"
  channel       TEXT,                              -- 'fb'|'google'|'tiktok'|'zalo'
  objective     TEXT,                              -- 'ban-hang'|'tuyen-dung'|...
  form          TEXT,                              -- 'Mess'|'Tin nhắn'|'Lead'|...
  spend         BIGINT DEFAULT 0,
  units         INT DEFAULT 0,                     -- inbox
  leads         INT DEFAULT 0,                     -- SĐT
  custs         INT DEFAULT 0,                     -- khách
  revenue       BIGINT DEFAULT 0,
  candidates    INT DEFAULT 0,                     -- nếu objective=tuyển dụng
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adspend_date    ON adspend(date DESC);
CREATE INDEX IF NOT EXISTS idx_adspend_channel ON adspend(channel);

-- =====================================================
-- RLS Policies — Mở quyền cho user đã đăng nhập (authenticated)
-- =====================================================
ALTER TABLE inventory          ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE adspend            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth full inventory"        ON inventory        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full purchases"        ON purchases        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full quotes"           ON quotes           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full recurring_orders" ON recurring_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full returns"          ON returns          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth full adspend"          ON adspend          FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- DONE
-- =====================================================
SELECT '✅ 6 bảng phụ trợ đã sẵn sàng: inventory, purchases, quotes, recurring_orders, returns, adspend' AS done;
