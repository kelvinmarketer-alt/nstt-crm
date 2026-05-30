-- =========================================================
-- Fix RLS staff — mở quyền PUBLIC (anon + authenticated)
-- =========================================================
-- App đang dùng anon key → cần PUBLIC để đọc/ghi staff
-- (tương tự kv_store, integrations, customers... đã làm trước)

DROP POLICY IF EXISTS "auth full staff" ON staff;
DROP POLICY IF EXISTS "Staff: authenticated full access" ON staff;
DROP POLICY IF EXISTS "auth_select_staff" ON staff;
DROP POLICY IF EXISTS "auth_modify_staff" ON staff;
DROP POLICY IF EXISTS "auth_select_st" ON staff;
DROP POLICY IF EXISTS "auth_modify_st" ON staff;

CREATE POLICY "public_full_staff" ON staff
  FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

SELECT '✅ Staff RLS now PUBLIC — anon key đọc/ghi được' AS done;
