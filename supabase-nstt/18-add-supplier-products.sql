-- ============================================================
-- 18 — Thêm cột products (JSONB) cho bảng suppliers
-- ------------------------------------------------------------
-- Mỗi NCC giờ cung cấp các SẢN PHẨM cụ thể (không phải nhóm hàng),
-- mỗi SP có thể có giá nhập riêng:
--   products = [{ "id":"SP001", "name":"Bí xanh", "price":12000 }, ...]
--
-- BẮT BUỘC chạy file này — nếu không, app gửi cột 'products' lên cloud
-- sẽ bị tự-strip (auto-heal) → danh sách SP của NCC mất sau khi reload.
-- ============================================================

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS products JSONB DEFAULT '[]'::jsonb;

-- Kiểm tra:
-- SELECT id, name, products FROM suppliers;
