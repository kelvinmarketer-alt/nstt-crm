-- ============================================================
-- v542 · Thêm cột để LƯU BỀN dữ liệu trước đây mất khi reload/đổi máy
-- Chạy 1 LẦN trong Supabase SQL Editor (project NSTT: edhyvdstmewshurxucka)
-- An toàn: IF NOT EXISTS → chạy lại nhiều lần không sao; cột nullable → không phá web.
-- ============================================================

-- F3: khớp phiếu chi với đúng NCC theo MÃ (tránh 2 NCC trùng tên bị trừ nhầm)
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS supplier_id text;

-- Cờ "không cộng kho" của phiếu nhập tay (trước đây reload lại thành "cộng kho")
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS no_stock boolean;

-- Mốc "ai / khi nào KHO nhận hàng" (bước 2 của phiếu nhập từ phiên gom)
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS wh_received_at text;  -- dd/mm/yyyy
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS wh_by text;           -- tên người nhận kho

-- Xong. Code (v542) đã wire sẵn: có cột là tự lưu/đọc; chưa có cột thì tự bỏ qua (không lỗi).
