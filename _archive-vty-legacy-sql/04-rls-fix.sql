-- =========================================================
-- Nông Sản Tuấn Tú Hà Nội — RLS Fix
-- Cho phép anon đọc 3 bảng config (master_data, payment_accounts, integrations)
-- Lý do: app cần đọc các bảng này TRƯỚC khi user login (master data cho dropdown,
-- payment accounts cho form, integrations cho status).
-- Vẫn giữ INSERT/UPDATE/DELETE chỉ cho authenticated.
-- =========================================================

-- master_data: anon đọc OK
DROP POLICY IF EXISTS "md_read_all" ON master_data;
CREATE POLICY "md_read_all" ON master_data FOR SELECT USING (TRUE);

-- payment_accounts: anon đọc OK (nhưng KHÔNG ghi)
DROP POLICY IF EXISTS "pay_read_all" ON payment_accounts;
CREATE POLICY "pay_read_all" ON payment_accounts FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "payment_accounts_auth_all" ON payment_accounts;
CREATE POLICY "pay_auth_write" ON payment_accounts FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "pay_auth_update" ON payment_accounts FOR UPDATE TO authenticated USING (TRUE);
CREATE POLICY "pay_auth_delete" ON payment_accounts FOR DELETE TO authenticated USING (TRUE);

-- integrations: anon đọc OK
DROP POLICY IF EXISTS "int_read_all" ON integrations;
CREATE POLICY "int_read_all" ON integrations FOR SELECT USING (TRUE);

SELECT 'RLS fixed — anon có thể đọc master_data/payment_accounts/integrations' AS status;
