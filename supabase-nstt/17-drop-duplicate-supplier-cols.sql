-- ============================================================
-- 17 — Dọn cột RÁC trùng lặp trong bảng suppliers
-- ------------------------------------------------------------
-- Bảng suppliers vô tình có cả cột chuẩn LẪN cột rác cùng nghĩa:
--   contact_person  (chuẩn)  ↔  contact      (rác, null)
--   supply_categories(chuẩn) ↔  category     (rác, [])
--   payment_terms   (chuẩn)  ↔  payment_term (rác, null)
--   notes           (chuẩn)  ↔  note         (rác, null)
--   balance         (chuẩn)  ↔  debt         (rác)
-- Cột rác null khiến app đọc về bị ghi đè → mất dữ liệu sau reload.
-- Code đã được vá (mapFrom 2 lượt, cột chuẩn luôn thắng) nên KHÔNG bắt
-- buộc chạy file này — nhưng chạy sẽ giúp DB gọn + giảm egress.
--
-- An toàn: chỉ drop nếu cột tồn tại. Cột rating + total_spend GIỮ LẠI
-- (đã được map đúng trong code).
-- ============================================================

ALTER TABLE suppliers DROP COLUMN IF EXISTS contact;
ALTER TABLE suppliers DROP COLUMN IF EXISTS category;
ALTER TABLE suppliers DROP COLUMN IF EXISTS payment_term;
ALTER TABLE suppliers DROP COLUMN IF EXISTS note;
ALTER TABLE suppliers DROP COLUMN IF EXISTS debt;

-- Kiểm tra lại schema sau khi dọn:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'suppliers' ORDER BY ordinal_position;
