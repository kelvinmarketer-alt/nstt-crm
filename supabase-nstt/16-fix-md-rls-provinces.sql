-- =========================================================
-- FIX: mở RLS public cho master_data + company_info
--      + cập nhật 34 tỉnh/thành VN 2026 (sau sáp nhập 1/7/2025)
-- =========================================================
-- App dùng anon key → cần public write để LƯU được:
--   - Master Data (tỉnh, nhóm KH, loại hình, nguồn...) — Settings
--   - Company Info (thông tin DN cho hóa đơn) — Settings
-- Triệu chứng: sửa Master Data / Company Info xong "lưu cloud lỗi 401".
-- =========================================================

-- 1) RLS public cho master_data + company_info
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['master_data','company_info'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_select_%1$s" ON %1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_insert_%1$s" ON %1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_update_%1$s" ON %1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_delete_%1$s" ON %1$s;', t);
    EXECUTE format('DROP POLICY IF EXISTS "public_full_%1$s" ON %1$s;', t);
    EXECUTE format('CREATE POLICY "public_full_%1$s" ON %1$s FOR ALL TO PUBLIC USING (true) WITH CHECK (true);', t);
  END LOOP;
END $$;

-- 2) Cập nhật 34 tỉnh/thành VN 2026
INSERT INTO master_data (key, items, updated_at)
VALUES ('provinces', '[
  {"id":"Hà Nội","label":"Hà Nội"},
  {"id":"Bắc Ninh","label":"Bắc Ninh"},
  {"id":"Hưng Yên","label":"Hưng Yên"},
  {"id":"Ninh Bình","label":"Ninh Bình"},
  {"id":"Phú Thọ","label":"Phú Thọ"},
  {"id":"Thái Nguyên","label":"Thái Nguyên"},
  {"id":"Quảng Ninh","label":"Quảng Ninh"},
  {"id":"Hải Phòng","label":"Hải Phòng"},
  {"id":"Lạng Sơn","label":"Lạng Sơn"},
  {"id":"Cao Bằng","label":"Cao Bằng"},
  {"id":"Tuyên Quang","label":"Tuyên Quang"},
  {"id":"Lào Cai","label":"Lào Cai"},
  {"id":"Điện Biên","label":"Điện Biên"},
  {"id":"Lai Châu","label":"Lai Châu"},
  {"id":"Sơn La","label":"Sơn La"},
  {"id":"Thanh Hóa","label":"Thanh Hóa"},
  {"id":"Nghệ An","label":"Nghệ An"},
  {"id":"Hà Tĩnh","label":"Hà Tĩnh"},
  {"id":"Quảng Trị","label":"Quảng Trị"},
  {"id":"Huế","label":"Huế"},
  {"id":"Đà Nẵng","label":"Đà Nẵng"},
  {"id":"Quảng Ngãi","label":"Quảng Ngãi"},
  {"id":"Gia Lai","label":"Gia Lai"},
  {"id":"Đắk Lắk","label":"Đắk Lắk"},
  {"id":"Khánh Hòa","label":"Khánh Hòa"},
  {"id":"Lâm Đồng","label":"Lâm Đồng"},
  {"id":"Đồng Nai","label":"Đồng Nai"},
  {"id":"Tây Ninh","label":"Tây Ninh"},
  {"id":"TP. Hồ Chí Minh","label":"TP. Hồ Chí Minh"},
  {"id":"Đồng Tháp","label":"Đồng Tháp"},
  {"id":"Vĩnh Long","label":"Vĩnh Long"},
  {"id":"An Giang","label":"An Giang"},
  {"id":"Cần Thơ","label":"Cần Thơ"},
  {"id":"Cà Mau","label":"Cà Mau"}
]'::jsonb, NOW())
ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items, updated_at = NOW();

SELECT '✅ master_data + company_info mở public + 34 tỉnh đã cập nhật' AS done;
