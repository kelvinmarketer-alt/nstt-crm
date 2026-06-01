-- =========================================================
-- FIX RLS: mở PUBLIC (anon) write cho các bảng business còn thiếu
-- =========================================================
-- App đăng nhập qua MOCK_USERS (KHÔNG tạo Supabase Auth session)
-- → dùng ANON key. Các policy cũ 'TO authenticated' chặn anon INSERT/UPDATE.
-- Triệu chứng: đọc được (SELECT 200) nhưng lưu cloud fail (401) →
-- orders/customers/invoices/cash_entries luôn = 0 trên cloud.
--
-- Các bảng đã có public_full (07-fix-rls): inventory, purchases, quotes,
-- recurring_orders, returns, adspend, kv_store, integrations, staff, ai_usage_log.
-- File này bổ sung các bảng CÒN THIẾU.
-- =========================================================

DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'customers', 'orders', 'invoices', 'cash_entries',
    'suppliers', 'leads', 'products', 'payment_accounts', 'activity_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- Bỏ mọi policy cũ (authenticated-only) trên bảng
    EXECUTE format('DROP POLICY IF EXISTS "auth_select_%1$s" ON %1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_insert_%1$s" ON %1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_update_%1$s" ON %1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_delete_%1$s" ON %1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "public_full_%1$s" ON %1$s;', t);
    -- Tạo policy PUBLIC full (anon + authenticated đọc/ghi)
    EXECUTE format(
      'CREATE POLICY "public_full_%1$s" ON %1$s FOR ALL TO PUBLIC USING (true) WITH CHECK (true);',
      t
    );
    RAISE NOTICE '✅ % → public_full', t;
  END LOOP;
END $$;

-- =========================================================
-- VERIFY — liệt kê policy của các bảng business
-- =========================================================
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('customers','orders','invoices','cash_entries',
                    'suppliers','leads','products','payment_accounts','activity_logs')
ORDER BY tablename;

SELECT '✅ Đã mở public write cho 9 bảng business — app (anon key) giờ lưu cloud được' AS done;
