-- =========================================================
-- THÊM CỘT facebook cho khách hàng
-- =========================================================
-- Bảng customers đã có sẵn cột `zalo`. Chỉ cần thêm `fb` để lưu link Facebook.
-- (SĐT đã cho phép để trống sẵn — cột phone vốn NULLable.)
-- Chạy 1 lần trong SQL Editor. An toàn, không đụng dữ liệu cũ.
-- =========================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS fb TEXT;

-- VERIFY
SELECT column_name FROM information_schema.columns
WHERE table_name = 'customers' AND column_name IN ('zalo', 'fb')
ORDER BY column_name;

SELECT '✅ Đã thêm cột fb cho customers — lưu được link Zalo + Facebook' AS done;
