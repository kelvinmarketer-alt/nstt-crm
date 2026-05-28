-- =========================================================
-- Nông Sản Tuấn Tú Hà Nội — Seed data ban đầu
-- Chạy SAU 02-rls-nstt.sql
-- =========================================================
-- Bao gồm:
--   - Company info (Cty TNHH XNK NSTT)
--   - Master data (loại KH, nhóm, dịch vụ, đvt...)
--   - 5 NV mặc định (admin/sales/cskh/kt/vận hành)
--   - 6 payment accounts (quỹ TM + 4 TK NH + 1 ví)
--   - 8 integrations placeholder

-- =====================================================
-- 1. COMPANY INFO
-- =====================================================
INSERT INTO company_info (id, name, short_name, tax, address, director, hotline, email, website, bank, bank_owner, slogan) VALUES
(1,
  'Công Ty TNHH Xuất Nhập Khẩu - Nông Sản Tuấn Tú Hà Nội',
  'Nông Sản Tuấn Tú Hà Nội',
  '0110302211',
  '36/147A Tân Mai, Hoàng Mai, Hà Nội',
  '0836676086',
  '0836 676 086',
  'nongsantuantuhanoi@gmail.com',
  'nongsantuantuhanoi.com',
  'Techcombank 6699399999',
  'Nguyễn Tuấn Anh',
  'Nông sản sạch bảo vệ con người và thiên nhiên - Uy tín làm nên thương hiệu'
);

-- =====================================================
-- 2. MASTER DATA — dropdown defaults
-- =====================================================
INSERT INTO master_data (key, items) VALUES
('cust_types', '[
  {"id":"nha-hang","label":"Nhà hàng","icon":"🍴"},
  {"id":"quan-an","label":"Quán ăn","icon":"🍜"},
  {"id":"khach-san","label":"Khách sạn","icon":"🏨"},
  {"id":"canteen","label":"Canteen / Bếp ăn KCN","icon":"🍱"},
  {"id":"cafe","label":"Café / Coffee","icon":"☕"},
  {"id":"individual","label":"Cá nhân","icon":"👤"}
]'::jsonb),

('cust_groups', '[
  {"id":"VIP","label":"VIP","color":"#E8A33D"},
  {"id":"Thường","label":"Thường","color":"#6B7280"},
  {"id":"Mới","label":"Mới","color":"#3B82F6"},
  {"id":"Inactive","label":"Ngừng đặt","color":"#9CA3AF"}
]'::jsonb),

('cust_sources', '[
  {"id":"Sales chủ động","label":"Sales chủ động"},
  {"id":"Giới thiệu","label":"Giới thiệu"},
  {"id":"Facebook","label":"Facebook"},
  {"id":"Zalo","label":"Zalo"},
  {"id":"Website","label":"Website"},
  {"id":"Hội chợ / triển lãm","label":"Hội chợ / triển lãm"}
]'::jsonb),

('product_categories', '[
  {"id":"rau-ta","label":"Hàng rau ta","en":"Local Vegetables","icon":"🥬"},
  {"id":"rau-dalat","label":"Rau Đà Lạt","en":"Dalat Vegetables","icon":"🥗"},
  {"id":"nam","label":"Hàng nấm","en":"Mushroom","icon":"🍄"},
  {"id":"rau-vung-mien","label":"Rau vùng miền","en":"Regional Vegetables","icon":"🌿"},
  {"id":"rau-gia-vi","label":"Rau gia vị","en":"Herbs & Spices","icon":"🌶"},
  {"id":"rau-la","label":"Rau lá","en":"Leafy Vegetables","icon":"🥬"},
  {"id":"hang-khac","label":"Hàng khác","en":"Other","icon":"📦"},
  {"id":"thit-lon","label":"Thịt lợn","en":"Pork","icon":"🐖"},
  {"id":"thit-ga","label":"Thịt gà","en":"Chicken","icon":"🐔"},
  {"id":"thit-bo","label":"Thịt bò","en":"Beef","icon":"🐂"},
  {"id":"khac","label":"Khác","en":"Other","icon":"📋"}
]'::jsonb),

('order_freq', '[
  {"id":"hang-ngay","label":"Hằng ngày"},
  {"id":"2-3-tuan","label":"2-3 lần/tuần"},
  {"id":"hang-tuan","label":"Hằng tuần"},
  {"id":"thang","label":"Hằng tháng"}
]'::jsonb),

('units', '[
  {"id":"kg","label":"Kilogram (kg)"},
  {"id":"bo","label":"Bó"},
  {"id":"thung","label":"Thùng"},
  {"id":"goi","label":"Gói"},
  {"id":"con","label":"Con (gia cầm)"}
]'::jsonb),

('pay_methods', '[
  {"id":"Tiền mặt","label":"Tiền mặt"},
  {"id":"Chuyển khoản","label":"Chuyển khoản"},
  {"id":"Công nợ","label":"Công nợ"}
]'::jsonb),

('provinces', '[
  {"id":"Hà Nội","label":"Hà Nội"},
  {"id":"Hải Phòng","label":"Hải Phòng"},
  {"id":"Bắc Ninh","label":"Bắc Ninh"},
  {"id":"Hưng Yên","label":"Hưng Yên"}
]'::jsonb),

('departments', '[
  {"id":"ban-gd","label":"Ban Giám Đốc"},
  {"id":"sales","label":"Sales"},
  {"id":"cskh","label":"CSKH"},
  {"id":"ke-toan","label":"Kế toán"},
  {"id":"van-hanh","label":"Vận hành"},
  {"id":"shipper","label":"Shipper"}
]'::jsonb);

-- =====================================================
-- 3. PAYMENT ACCOUNTS
-- =====================================================
INSERT INTO payment_accounts (id, kind, name, detail, balance, keeper, active) VALUES
('A1', 'cash', 'Quỹ tiền mặt văn phòng', 'Tủ sắt phòng Kế toán', 0, 'Lê Thị Phương', TRUE),
('A2', 'bank', 'Techcombank 6699399999', 'Chủ TK Nguyễn Tuấn Anh — TK chính', 0, 'Tuấn Tú', TRUE),
('A3', 'bank', 'Vietcombank · 1021xxxxxx', 'CN Cầu Giấy', 0, 'Tuấn Tú', TRUE),
('A4', 'bank', 'MB Bank · 0312xxxxxx', 'CN Hà Nội', 0, 'Tuấn Tú', TRUE),
('A5', 'ewallet', 'MoMo · 0836 676 086', 'Thu COD KH nhỏ', 0, 'Hoàng Mai', TRUE);

-- =====================================================
-- 4. STAFF (5 NV mặc định — đợi tạo user trong Auth rồi link user_id)
-- =====================================================
-- ⚠️ Sau khi chạy file này, vào Auth → Users → Create 5 user với email tương ứng,
-- rồi UPDATE staff SET user_id = '<uuid>' WHERE id = 'NV001' cho từng người.
INSERT INTO staff (id, name, role, dept, phone, email, salary, perms, status, hire_date, kpi) VALUES
('NV001', 'Tuấn Tú',     'Chủ doanh nghiệp', 'ban-gd',  '0836676086', 'admin@nongsantuantuhanoi.vn', 0,        '{*}',                                                                          'active', '2023-01-01', 95),
('NV002', 'Trần Lan',    'Sales',            'sales',   '0912345678', 'sales@nongsantuantuhanoi.vn', 12000000, '{dashboard,customers,orders,quotes,recurring,debt,invoices,reports,leads}',   'active', '2023-03-15', 85),
('NV003', 'Hoàng Mai',   'CSKH',             'cskh',    '0901234567', 'cskh@nongsantuantuhanoi.vn',  9000000,  '{dashboard,customers,orders,shippers}',                                       'active', '2024-01-10', 80),
('NV004', 'Lê Phương',   'Kế toán',          'ke-toan', '0967890123', 'kt@nongsantuantuhanoi.vn',    11000000, '{dashboard,accounting,debt,invoices,payroll,reports}',                        'active', '2023-06-01', 90),
('NV005', 'Phạm Hùng',   'Vận hành',         'van-hanh','0978901234', 'vh@nongsantuantuhanoi.vn',    10000000, '{dashboard,orders,shippers,products,inventory,purchases,returns,suppliers}', 'active', '2024-02-01', 82);

-- =====================================================
-- 5. INTEGRATIONS PLACEHOLDER (8 tích hợp — disabled mặc định)
-- =====================================================
INSERT INTO integrations (key, enabled, config) VALUES
('telegram_bot',      FALSE, '{"channels":[]}'::jsonb),
('zalo_oa',           FALSE, '{}'::jsonb),
('ai_filler',         FALSE, '{"providers":[]}'::jsonb),
('hoa_don_dien_tu',   FALSE, '{"provider":""}'::jsonb),
('google_sheets',     FALSE, '{}'::jsonb),
('google_maps',       FALSE, '{}'::jsonb),
('sms_brand',         FALSE, '{}'::jsonb),
('email_smtp',        FALSE, '{}'::jsonb);

-- =====================================================
-- Hoàn tất seed cơ bản. App có thể chạy với data này.
-- Để thêm demo data (120 SP + 28 KH + 142 đơn), chạy 04-demo-data.sql.
-- =====================================================
