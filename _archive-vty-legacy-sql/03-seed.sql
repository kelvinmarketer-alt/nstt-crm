-- =========================================================
-- Nông Sản Tuấn Tú Hà Nội — Seed Data (data khởi tạo)
-- Chạy SAU 02-rls.sql
-- =========================================================

-- Company info
INSERT INTO company_info (id, name, short_name, tax_code, reg_no, address, hotline, email, website, bank, slogan)
VALUES (1,
  'Công ty TNHH Nông Sản Tuấn Tú Hà Nội',
  'Nông Sản Tuấn Tú Hà Nội',
  '0109876543',
  '0109876543',
  'Số 88 Trần Duy Hưng, P. Trung Hòa, Q. Cầu Giấy, TP. Hà Nội',
  '0903 111 222',
  'contact@vtylogistics.vn',
  'https://vtylogistics.vn',
  'Vietcombank · 1021xxxxxx',
  'Vận chuyển trọn niềm tin — Nông Sản Tuấn Tú'
) ON CONFLICT (id) DO NOTHING;

-- Master data — services
INSERT INTO master_data (key, data) VALUES
('services', '[
  {"id":"lien-tinh","label":"Vận chuyển liên tỉnh","icon":"🚚","color":"#C8102E"},
  {"id":"chuyen-nha","label":"Chuyển nhà trọn gói","icon":"🏠","color":"#7C3AED"},
  {"id":"thue-xe-tai","label":"Cho thuê xe tải","icon":"🚛","color":"#0EA5E9"},
  {"id":"thue-kho","label":"Cho thuê kho bãi","icon":"🏭","color":"#15803D"},
  {"id":"thue-cau","label":"Cho thuê xe cẩu","icon":"🏗","color":"#B45309"},
  {"id":"boc-xep","label":"Bốc xếp","icon":"💪","color":"#1C2D5A"}
]'::jsonb),
('transportModes', '[
  {"id":"duong-bo","label":"Đường bộ","icon":"🛣"},
  {"id":"duong-thuy","label":"Đường thủy","icon":"🚢"},
  {"id":"duong-sat","label":"Đường sắt","icon":"🚂"}
]'::jsonb),
('custGroups', '[
  {"id":"Mới","label":"Mới","color":"#15803D"},
  {"id":"Thường","label":"Thường","color":"#1E40AF"},
  {"id":"VIP","label":"VIP","color":"#E8A33D"},
  {"id":"Inactive","label":"Không hoạt động","color":"#6B7280"}
]'::jsonb),
('custTypes', '[
  {"id":"B2C","label":"👤 Cá nhân","color":"#C8102E"},
  {"id":"B2B","label":"🏢 Doanh nghiệp","color":"#1C2D5A"}
]'::jsonb),
('sources', '[
  {"id":"gioi-thieu","label":"Giới thiệu"},
  {"id":"web","label":"Web / SEO"},
  {"id":"facebook","label":"Facebook"},
  {"id":"zalo","label":"Zalo"},
  {"id":"sales","label":"Sales chủ động"},
  {"id":"hoi-cho","label":"Hội chợ / triển lãm"},
  {"id":"youtube","label":"YouTube / TikTok"}
]'::jsonb),
('units', '[
  {"id":"thung","label":"Thùng"},{"id":"kien","label":"Kiện"},
  {"id":"bao","label":"Bao"},{"id":"hop","label":"Hộp"},
  {"id":"pallet","label":"Pallet"},{"id":"kg","label":"Kg"},
  {"id":"container","label":"Container"},{"id":"chuyen","label":"Chuyến"},
  {"id":"gio","label":"Giờ"},{"id":"thang","label":"Tháng"},
  {"id":"m3","label":"M³ (khối)"}
]'::jsonb),
('payMethods', '[
  {"id":"sender","label":"Người gửi trả"},
  {"id":"receiver","label":"Người nhận trả"},
  {"id":"congno","label":"Công nợ"}
]'::jsonb),
('departments', '[
  {"id":"gd","label":"Ban giám đốc"},{"id":"sales","label":"Sales"},
  {"id":"cskh","label":"CSKH"},{"id":"ketoan","label":"Kế toán"},
  {"id":"vanhanh","label":"Vận hành"}
]'::jsonb),
('vehicleTypes', '[
  {"id":"xetai-1.5t","label":"Xe tải 1.5T"},
  {"id":"xetai-2.5t","label":"Xe tải 2.5T"},
  {"id":"xetai-3.5t","label":"Xe tải 3.5T"},
  {"id":"xetai-5t","label":"Xe tải 5T"},
  {"id":"xetai-10t","label":"Xe tải 10T"},
  {"id":"container","label":"Đầu kéo container"},
  {"id":"cau","label":"Xe cẩu tự hành"},
  {"id":"donglanh","label":"Xe đông lạnh"}
]'::jsonb),
('provinces', '["Hà Nội","Hải Phòng","TP.HCM","Đà Nẵng","Hải Dương","Bắc Ninh","Nam Định","Thanh Hóa","Quảng Ninh","Hưng Yên","Thái Bình","Ninh Bình","Vĩnh Phúc","Phú Thọ","Nghệ An","Bình Dương","Đồng Nai","Cần Thơ"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Payment accounts (TK thanh toán mặc định)
INSERT INTO payment_accounts (id, kind, name, detail, balance, keeper, active) VALUES
('A1', 'cash',    'Quỹ tiền mặt văn phòng',      'Tủ sắt phòng Kế toán',           42000000, 'Lê Thị Phương', TRUE),
('A2', 'bank',    'Vietcombank · 1021xxxxxx',     'CN Cầu Giấy',                  128400000, 'Tuấn Tú',    TRUE),
('A3', 'bank',    'MB Bank · 0312xxxxxx',         'CN Hà Nội',                     42800000, 'Tuấn Tú',    TRUE),
('A4', 'bank',    'Techcombank · 1903xxxxxx',     'TK dự phòng',                   14800000, 'Tuấn Tú',    TRUE),
('A5', 'ewallet', 'MoMo · 0903 111 222',          'Thu COD KH nhỏ',                 1200000, 'Hoàng Mai',     TRUE),
('A6', 'ewallet', 'ViettelPay · 0903 111 222',    'Dự phòng',                            0, 'Hoàng Mai',     FALSE)
ON CONFLICT (id) DO NOTHING;

-- Staff (5 user mặc định — gắn với auth.users sau khi register)
INSERT INTO staff (id, code, name, role, dept, phone, email, avatar, avatar_color, permissions, salary, kpi, status, join_date, address) VALUES
('NV001','NV001','Tuấn Tú',     'Chủ doanh nghiệp',          'Ban giám đốc','0903 111 222','admin@vty.vn','TT','#339B21',ARRAY['Tất cả'],                                              0, NULL,'active','2020-01-01','Hà Nội'),
('NV002','NV002','Trần Lan',       'Trưởng phòng Sales/CSKH',   'Sales',       '0912 333 444','sales@vty.vn','TL','#1C2D5A',ARRAY['Dashboard','Khách hàng','Đơn hàng','Công nợ','Hóa đơn','Báo cáo'], 18000000,'92%','active','2022-05-10','Cầu Giấy, HN'),
('NV003','NV003','Phạm Hùng',      'Nhân viên Sales',            'Sales',       '0936 555 666','hung@vty.vn','PH','#7C3AED',ARRAY['Dashboard','Khách hàng','Đơn hàng','Báo cáo'],            12000000,'88%','active','2024-03-15','Hai Bà Trưng, HN'),
('NV004','NV004','Hoàng Mai',      'NV CSKH B2C / Last-mile',   'CSKH',        '0978 777 888','cskh@vty.vn','HM','#E8A33D',ARRAY['Dashboard','Khách hàng','Đơn hàng'],                       10000000,'95%','active','2024-11-01','Đống Đa, HN'),
('NV005','NV005','Lê Thị Phương',  'Kế toán',                    'Kế toán',     '0945 222 111','kt@vty.vn','LP','#15803D',ARRAY['Dashboard','Kế toán','Công nợ','Hóa đơn','Báo cáo'],     14000000,'90%','active','2023-02-08','Thanh Xuân, HN')
ON CONFLICT (id) DO NOTHING;

-- Integrations (8 tích hợp default disabled)
INSERT INTO integrations (id, enabled, config) VALUES
('telegram',     FALSE, '{}'::jsonb),
('zalo-oa',      FALSE, '{}'::jsonb),
('ai-engine',    FALSE, '{"provider":"gemini"}'::jsonb),
('einvoice',     FALSE, '{}'::jsonb),
('google-sheets',FALSE, '{}'::jsonb),
('google-maps',  FALSE, '{}'::jsonb),
('sms-brand',    FALSE, '{}'::jsonb),
('email-smtp',   FALSE, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

SELECT 'Seed data loaded: company + master data (10 keys) + 6 payment accounts + 5 staff + 8 integrations' AS status;
