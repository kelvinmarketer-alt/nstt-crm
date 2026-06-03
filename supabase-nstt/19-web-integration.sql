-- =========================================================
-- TÍCH HỢP WEBSITE nongsantuantuhanoi  ⇄  App CRM (NSTT)
-- Chạy SAU các file 01–18. An toàn chạy lại nhiều lần (idempotent).
-- =========================================================
-- Mục tiêu:
--   1) public_products  → VIEW sạch cho website đọc (CHỈ giá bán, KHÔNG lộ giá vốn/NCC)
--   2) web_orders       → BẢNG nhận đơn từ website (hộp "Đơn từ web" chờ duyệt)
--   3) Realtime         → CRM thấy đơn web mới tức thì (badge)
--   4) notify_web_order → Postgres tự gửi Telegram báo NV (token đọc từ kv_store,
--                         KHÔNG đặt token trong code website)
-- =========================================================


-- =========================================================
-- 1) VIEW public_products — API sản phẩm cho website
-- =========================================================
-- Website chỉ cần: tên, danh mục, đơn vị, ảnh, GIÁ BÁN hiện tại.
-- price        = sell của entry MỚI NHẤT trong price_history
-- prev_price   = sell của entry liền trước (để web hiển thị giá gạch nếu đã giảm)
-- KHÔNG expose: buy (giá vốn), supplier_id, toàn bộ price_history.
CREATE OR REPLACE VIEW public_products AS
SELECT
  p.id,
  p.name,
  p.cat,
  p.unit,
  p.img,
  (SELECT (e->>'sell')::numeric
     FROM jsonb_array_elements(p.price_history) e
     WHERE (e->>'sell') IS NOT NULL
     ORDER BY e->>'date' DESC
     LIMIT 1)                                    AS price,
  (SELECT (e->>'sell')::numeric
     FROM jsonb_array_elements(p.price_history) e
     WHERE (e->>'sell') IS NOT NULL
     ORDER BY e->>'date' DESC
     OFFSET 1 LIMIT 1)                           AS prev_price,
  p.updated_at
FROM products p
WHERE p.active = TRUE;

-- Chỉ giữ SP có giá bán hợp lệ (>0) — bọc lại bằng view ngoài cho gọn ở web.
CREATE OR REPLACE VIEW public_products_live AS
SELECT * FROM public_products WHERE price IS NOT NULL AND price > 0;

-- PostgREST cần quyền SELECT cho anon/authenticated để website (anon key) đọc được.
GRANT SELECT ON public_products       TO anon, authenticated;
GRANT SELECT ON public_products_live  TO anon, authenticated;


-- =========================================================
-- 2) BẢNG web_orders — đơn đặt từ website (chờ NV duyệt)
-- =========================================================
CREATE TABLE IF NOT EXISTS web_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_code      TEXT,                              -- mã sinh ở web (TT260603-XXXX)
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  cust_name     TEXT NOT NULL,
  cust_phone    TEXT NOT NULL,
  cust_email    TEXT,
  cust_address  TEXT,
  province      TEXT,
  note          TEXT,
  payment       TEXT,                              -- 'cod'|'bank'|'momo'|'vnpay'
  recurring     TEXT,                              -- '' | 'hang-ngay' | '2-3-tuan' | ...
  items         JSONB DEFAULT '[]',                -- [{slug,name,qty,price,unit,subtotal,image}]
  total         NUMERIC DEFAULT 0,
  status        TEXT DEFAULT 'pending',            -- 'pending'|'confirmed'|'rejected'
  linked_order  TEXT,                              -- code đơn chính thức sau duyệt (NSTT-xxx)
  linked_cust   TEXT,                              -- id KH sau khi map/tạo (KH00x)
  handled_by    TEXT,                              -- tên NV duyệt
  handled_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_web_orders_status  ON web_orders(status);
CREATE INDEX IF NOT EXISTS idx_web_orders_created ON web_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_orders_phone   ON web_orders(cust_phone);

-- RLS: theo đúng convention app (anon = cả website lẫn CRM đều dùng anon key).
-- App CRM cần đọc + cập nhật trạng thái; website cần thêm đơn.
ALTER TABLE web_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_full_web_orders" ON web_orders;
CREATE POLICY "public_full_web_orders" ON web_orders
  FOR ALL TO PUBLIC USING (true) WITH CHECK (true);


-- =========================================================
-- 3) REALTIME cho web_orders — CRM hiện badge "đơn web mới" tức thì
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'web_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE web_orders;
    RAISE NOTICE '✅ Realtime ON: web_orders';
  ELSE
    RAISE NOTICE '⏭ Realtime đã bật sẵn: web_orders';
  END IF;
END $$;


-- =========================================================
-- 4) TELEGRAM tự động — Postgres gửi báo NV khi có đơn web mới
-- =========================================================
-- Dùng pg_net (HTTP từ trong DB). Token + chatId đọc từ kv_store key 'int_telegram'
-- → KHÔNG nhúng token vào code website. Chạy server-side, báo cả khi không ai mở CRM.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_web_order()
RETURNS TRIGGER AS $$
DECLARE
  tg     JSONB;
  token  TEXT;
  chat   TEXT;
  msg    TEXT;
  n_item INT;
BEGIN
  SELECT value INTO tg FROM kv_store WHERE key = 'int_telegram';
  IF tg IS NULL THEN RETURN NEW; END IF;

  token := tg->>'botToken';
  -- ưu tiên kênh routing 'web_order' nếu có khai báo chatId trực tiếp, không thì dùng chatId mặc định
  chat  := COALESCE(tg->'routing'->>'web_order_chatId', tg->>'chatId');
  IF token IS NULL OR chat IS NULL THEN RETURN NEW; END IF;

  n_item := COALESCE(jsonb_array_length(NEW.items), 0);
  msg := '🛒 ĐƠN MỚI TỪ WEBSITE' || E'\n' ||
         '👤 ' || COALESCE(NEW.cust_name,'') || ' · ☎ ' || COALESCE(NEW.cust_phone,'') || E'\n' ||
         '📍 ' || COALESCE(NEW.cust_address,'—') || E'\n' ||
         '💰 ' || to_char(COALESCE(NEW.total,0),'FM999,999,999') || 'đ · ' ||
                  upper(COALESCE(NEW.payment,'cod')) ||
                  CASE WHEN COALESCE(NEW.recurring,'') <> '' THEN ' · 🔁 ' || NEW.recurring ELSE '' END || E'\n' ||
         '📦 ' || n_item || ' mặt hàng' ||
                  CASE WHEN COALESCE(NEW.note,'') <> '' THEN E'\n📝 ' || NEW.note ELSE '' END || E'\n' ||
         '→ Mở CRM ▸ "Đơn từ web" để duyệt';

  PERFORM net.http_post(
    url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('chat_id', chat, 'text', msg)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- không để lỗi Telegram chặn việc lưu đơn
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS web_orders_notify ON web_orders;
CREATE TRIGGER web_orders_notify
  AFTER INSERT ON web_orders
  FOR EACH ROW EXECUTE FUNCTION notify_web_order();


-- =========================================================
-- VERIFY
-- =========================================================
SELECT 'public_products_live' AS obj, count(*) AS rows FROM public_products_live
UNION ALL
SELECT 'web_orders (pending)', count(*) FROM web_orders WHERE status = 'pending';

SELECT '✅ 19-web-integration: view + web_orders + realtime + telegram trigger READY' AS done;
