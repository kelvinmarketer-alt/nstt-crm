-- ============================================================
-- 19 — Cột quy trình KHO cho bảng orders
-- ------------------------------------------------------------
-- Phục vụ luồng: Sale lên đơn (ngày/ca/giờ giao) → Kho gom hàng
-- → đặt NCC → xác nhận/báo thiếu → xuất kho cho shipper.
--
-- BẮT BUỘC chạy — nếu không, các field mới của đơn (ngày giao, ca,
-- giờ, trạng thái kho, danh sách thiếu) bị auto-strip → mất khi reload
-- và KHÔNG đồng bộ giữa máy Sale ↔ máy Kho.
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT now();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deliver_date TEXT;          -- ngày giao KH yêu cầu (yyyy-mm-dd)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_shift  TEXT;           -- ca giao: Sáng/Trưa/Chiều/Tối
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_time   TEXT;           -- giờ giao yêu cầu (free text)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wh_status   TEXT DEFAULT 'new'; -- new→gathering→confirmed→released
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shortages   JSONB DEFAULT '[]'::jsonb; -- [{name,short,unit,reason}]

-- Kiểm tra:
-- SELECT code, deliver_date, ship_shift, wh_status, shortages FROM orders LIMIT 5;
