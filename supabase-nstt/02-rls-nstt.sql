-- =========================================================
-- Nông Sản Tuấn Tú Hà Nội — Row Level Security (RLS) policies
-- Chạy SAU 01-schema-nstt.sql
-- =========================================================
-- Strategy ban đầu: cho phép tất cả authenticated user đọc/ghi.
-- Sau khi app ổn định, sẽ siết theo role (admin/sales/kt/cskh).

-- =====================================================
-- BẬT RLS cho 14 bảng
-- =====================================================
ALTER TABLE staff             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shippers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_data       ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_info      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations      ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLICY: Authenticated users → full access (sẽ siết sau)
-- =====================================================
-- Helper: tạo cả 4 policy (select/insert/update/delete) cho 1 bảng
-- Lặp lại cho từng bảng

-- STAFF
CREATE POLICY "auth_select_staff" ON staff FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_insert_staff" ON staff FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_update_staff" ON staff FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_delete_staff" ON staff FOR DELETE TO authenticated USING (TRUE);

-- CUSTOMERS
CREATE POLICY "auth_select_customers" ON customers FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_insert_customers" ON customers FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_update_customers" ON customers FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_delete_customers" ON customers FOR DELETE TO authenticated USING (TRUE);

-- PRODUCTS (anon có thể đọc — bảng giá public)
CREATE POLICY "any_select_products"   ON products FOR SELECT USING (TRUE);
CREATE POLICY "auth_insert_products"  ON products FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_update_products"  ON products FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_delete_products"  ON products FOR DELETE TO authenticated USING (TRUE);

-- ORDERS
CREATE POLICY "auth_select_orders" ON orders FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_insert_orders" ON orders FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_update_orders" ON orders FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_delete_orders" ON orders FOR DELETE TO authenticated USING (TRUE);

-- INVOICES
CREATE POLICY "auth_select_invoices" ON invoices FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_insert_invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_update_invoices" ON invoices FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_delete_invoices" ON invoices FOR DELETE TO authenticated USING (TRUE);

-- SUPPLIERS
CREATE POLICY "auth_select_suppliers" ON suppliers FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_insert_suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_update_suppliers" ON suppliers FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_delete_suppliers" ON suppliers FOR DELETE TO authenticated USING (TRUE);

-- SHIPPERS
CREATE POLICY "auth_select_shippers" ON shippers FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_insert_shippers" ON shippers FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_update_shippers" ON shippers FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_delete_shippers" ON shippers FOR DELETE TO authenticated USING (TRUE);

-- LEADS
CREATE POLICY "auth_select_leads" ON leads FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_insert_leads" ON leads FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_update_leads" ON leads FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_delete_leads" ON leads FOR DELETE TO authenticated USING (TRUE);

-- PAYMENT_ACCOUNTS (anon đọc được — để footer hiển thị TK NH)
CREATE POLICY "any_select_pacc"  ON payment_accounts FOR SELECT USING (TRUE);
CREATE POLICY "auth_insert_pacc" ON payment_accounts FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_update_pacc" ON payment_accounts FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_delete_pacc" ON payment_accounts FOR DELETE TO authenticated USING (TRUE);

-- CASH_ENTRIES
CREATE POLICY "auth_select_cash" ON cash_entries FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_insert_cash" ON cash_entries FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "auth_update_cash" ON cash_entries FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "auth_delete_cash" ON cash_entries FOR DELETE TO authenticated USING (TRUE);

-- MASTER_DATA (anon đọc — vì cần load dropdown trước khi login)
CREATE POLICY "any_select_master" ON master_data FOR SELECT USING (TRUE);
CREATE POLICY "auth_modify_master" ON master_data FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- COMPANY_INFO (anon đọc — vì cần hiển thị tên DN trên trang login)
CREATE POLICY "any_select_company" ON company_info FOR SELECT USING (TRUE);
CREATE POLICY "auth_modify_company" ON company_info FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ACTIVITY_LOGS (chỉ insert qua authenticated, đọc qua authenticated)
CREATE POLICY "auth_select_logs" ON activity_logs FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_insert_logs" ON activity_logs FOR INSERT TO authenticated WITH CHECK (TRUE);

-- INTEGRATIONS (chỉ authenticated, không cho anon đọc — vì chứa API key)
CREATE POLICY "auth_select_int" ON integrations FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_modify_int" ON integrations FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- =====================================================
-- Hoàn tất RLS. Tiếp theo: 03-seed-nstt.sql để seed master data + company + admin.
-- =====================================================
