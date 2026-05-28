-- =========================================================
-- Nông Sản Tuấn Tú Hà Nội — Row Level Security (RLS)
-- Chạy SAU 01-schema.sql trong Supabase SQL Editor
-- =========================================================
-- Mục tiêu:
-- 1. Mọi NV đã login (auth.uid()) đều có quyền đọc/sửa/xóa
-- 2. Phân quyền chi tiết do permissions[] của staff record quyết định
--    (kiểm tra ở client side để giảm phức tạp DB)
-- 3. Anon (chưa login) chỉ đọc được login + company_info
-- =========================================================

-- Bật RLS cho tất cả bảng
ALTER TABLE staff             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_info      ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_data       ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations      ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- POLICY: Authenticated users có full access (đơn giản nhất)
-- Anon (login page) chỉ đọc một số bảng cần thiết
-- =========================================================

-- STAFF: Anon đọc được (cần để check login). Authenticated full CRUD
CREATE POLICY "staff_read_all" ON staff   FOR SELECT USING (TRUE);
CREATE POLICY "staff_auth_write" ON staff FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Helper: tạo policy CRUD cho user đã login
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN VALUES
    ('customers'),('vehicles'),('drivers'),('partners'),('orders'),
    ('payment_accounts'),('cash_entries'),('invoices'),
    ('notes'),('reminders'),('fuel_logs'),('maintenance_logs'),('activity_logs'),
    ('master_data'),('integrations')
  LOOP
    EXECUTE format('CREATE POLICY "%s_auth_all" ON %I FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);', t, t);
  END LOOP;
END $$;

-- COMPANY_INFO: anon đọc (cho login page hiển thị logo), authenticated CRUD
CREATE POLICY "company_read_all" ON company_info FOR SELECT USING (TRUE);
CREATE POLICY "company_auth_write" ON company_info FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

SELECT 'RLS enabled on 17 tables · authenticated users have full CRUD' AS status;
