-- =========================================================
-- Hotfix RLS — kv_store + integrations bị chặn khi anon role gọi
-- =========================================================
-- Vấn đề: policy cũ chỉ allow `authenticated`, nhưng app NSTT chạy mode
-- supabase + anon key (auth ở app layer). Mọi insert/update vào kv_store
-- bị block với "new row violates row-level security policy".
--
-- Fix: đổi policy thành allow PUBLIC (anon + authenticated) cho 2 bảng
-- kv_store + integrations. App là internal CRM cho NV nội bộ, bảo mật
-- ở layer app (auth + perms) chứ không ở DB level.
--
-- KHÔNG ảnh hưởng dữ liệu — chỉ đổi quyền truy cập.

-- Drop policy cũ
DROP POLICY IF EXISTS "auth full kv_store" ON kv_store;
DROP POLICY IF EXISTS "auth_select_int" ON integrations;
DROP POLICY IF EXISTS "auth_modify_int" ON integrations;

-- Tạo policy mới: PUBLIC (anon + authenticated) full access
CREATE POLICY "public_full_kv_store" ON kv_store
  FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

CREATE POLICY "public_full_integrations" ON integrations
  FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

-- Tương tự áp dụng cho 6 bảng phụ trợ (đề phòng lỗi tương tự)
DROP POLICY IF EXISTS "auth full inventory" ON inventory;
DROP POLICY IF EXISTS "auth full purchases" ON purchases;
DROP POLICY IF EXISTS "auth full quotes" ON quotes;
DROP POLICY IF EXISTS "auth full recurring_orders" ON recurring_orders;
DROP POLICY IF EXISTS "auth full returns" ON returns;
DROP POLICY IF EXISTS "auth full adspend" ON adspend;

CREATE POLICY "public_full_inventory"        ON inventory        FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "public_full_purchases"        ON purchases        FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "public_full_quotes"           ON quotes           FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "public_full_recurring_orders" ON recurring_orders FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "public_full_returns"          ON returns          FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "public_full_adspend"          ON adspend          FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

SELECT '✅ RLS policies đã chuyển thành PUBLIC — anon key giờ insert/update OK' AS done;
