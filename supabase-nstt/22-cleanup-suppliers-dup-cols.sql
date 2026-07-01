-- =========================================================
-- NSTT — Dọn CỘT RÁC TRÙNG ở bảng suppliers (tuỳ chọn, không gấp)
-- Bảng suppliers có cả cột chuẩn LẪN cột rác cũ trỏ cùng ý nghĩa:
--   contact_person  ↔ contact
--   supply_categories ↔ category
--   balance         ↔ debt
--   notes           ↔ note
--   payment_terms   ↔ payment_term
-- App đọc qua mapFrom() ưu tiên CỘT CHUẨN nên hiển thị vẫn ĐÚNG (đã kiểm: 0 NCC lệch số).
-- File này chỉ để DỌN schema cho gọn. Chạy trong Supabase → SQL Editor.
-- An toàn: chỉ xoá cột rác, giữ nguyên cột chuẩn + dữ liệu.
-- =========================================================

-- (tuỳ chọn) Đồng bộ nốt giá trị rác về cột chuẩn nếu cột chuẩn đang trống:
UPDATE suppliers SET contact_person   = COALESCE(NULLIF(contact_person,''), contact)        WHERE (contact_person IS NULL OR contact_person='') AND contact IS NOT NULL;
UPDATE suppliers SET supply_categories = COALESCE(supply_categories, category)               WHERE supply_categories IS NULL AND category IS NOT NULL;
UPDATE suppliers SET balance          = COALESCE(NULLIF(balance,0), debt)                    WHERE (balance IS NULL OR balance=0) AND debt IS NOT NULL AND debt<>0;
UPDATE suppliers SET notes            = COALESCE(NULLIF(notes,''), note)                     WHERE (notes IS NULL OR notes='') AND note IS NOT NULL;
UPDATE suppliers SET payment_terms    = COALESCE(NULLIF(payment_terms,''), payment_term)     WHERE (payment_terms IS NULL OR payment_terms='') AND payment_term IS NOT NULL;

-- Xoá cột rác:
ALTER TABLE suppliers DROP COLUMN IF EXISTS contact;
ALTER TABLE suppliers DROP COLUMN IF EXISTS category;
ALTER TABLE suppliers DROP COLUMN IF EXISTS debt;
ALTER TABLE suppliers DROP COLUMN IF EXISTS note;
ALTER TABLE suppliers DROP COLUMN IF EXISTS payment_term;
-- 'products' để lại (không rõ có dùng ở nơi khác không) — bỏ comment dòng dưới nếu chắc chắn không dùng:
-- ALTER TABLE suppliers DROP COLUMN IF EXISTS products;
