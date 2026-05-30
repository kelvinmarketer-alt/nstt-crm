-- =========================================================
-- SEED 37 NV THẬT từ Bảng lương tháng 4/2026 NSTT
-- =========================================================
-- ⚠️ CHẠY 1 LẦN sau khi user xác nhận. Sẽ DELETE staff demo cũ + INSERT NV thật.
--
-- Cấu trúc dữ liệu:
-- - GIỮ NGUYÊN 5 system users (admin/sales/cskh/ketoan/vanhanh)
--   Họ là role-based account để login app, link tới auth.users.
-- - XÓA các NV demo cũ (NV006-NV009 nếu có)
-- - INSERT 37 NV thật với mã NV010 → NV046
--
-- Cột mới (đã thêm):
-- - contract_type: 'official' | 'probation' | 'intern' | 'parttime'
-- - has_bhxh: BOOLEAN
-- =========================================================

-- 1. ALTER TABLE thêm 2 cột cho formula lương
ALTER TABLE staff ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'official';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS has_bhxh      BOOLEAN DEFAULT FALSE;

-- 2. DELETE NV demo cũ (giữ 5 system user NV001-NV005)
DELETE FROM staff WHERE id NOT IN ('NV001','NV002','NV003','NV004','NV005');

-- 3. INSERT 37 NV thật từ docx
-- Format: (id, code, name, role, dept, salary, contract_type, status, has_bhxh, notes)

-- === VĂN PHÒNG — HR / Tuyển dụng / Kế toán / Sale / MKT ===
INSERT INTO staff (id, code, name, role, dept, salary, contract_type, status, has_bhxh, notes) VALUES
  ('NV010','NV010','Nguyễn Phương Trang','Nhân viên','HCNS',13000000,'official','active',TRUE,'HR chính · Mỗi tháng 1 ngày nghỉ có lương · Trừ 578k BHXH/tháng'),
  ('NV011','NV011','Nguyễn Bích Phượng','Nhân viên','Tuyển dụng',8000000,'official','active',FALSE,''),
  ('NV012','NV012','Trần Thùy Vân','Nhân viên','Tuyển dụng',7500000,'probation','active',FALSE,'Thử việc 2 tháng'),
  ('NV013','NV013','Đỗ Thị May','Thực tập sinh','Tuyển dụng',5000000,'intern','active',FALSE,'Thực tập sinh 100%'),
  ('NV014','NV014','Vũ Ngọc Ánh','Nhân viên','Kế toán',8000000,'official','active',FALSE,'Làm ngày CN tính 0.5 công · Phụ cấp 1tr BHXH từ tháng 5'),
  ('NV015','NV015','Nguyễn Thị Thủy','Nhân viên','Kế toán',10000000,'official','active',FALSE,'Làm T7-CN tính 0.7 công/ngày · Đóng BHXH từ tháng 5'),
  ('NV016','NV016','Chu Thị Tố Loan','Nhân viên','Sale',7500000,'official','active',FALSE,''),
  ('NV017','NV017','Nguyễn Minh Hiếu','Nhân viên','Sale',7000000,'official','active',FALSE,''),
  ('NV018','NV018','Ngô Sách Hiệp','Nhân viên','Sale',8000000,'probation','inactive',FALSE,'Đã nghỉ (T4)'),
  ('NV019','NV019','Tào Huyền Trang','Nhân viên','Sale',7000000,'probation','inactive',FALSE,'Đã nghỉ (T4)'),
  ('NV020','NV020','Quách Thu Ngân','Nhân viên','Sale',8000000,'probation','inactive',FALSE,'Đã nghỉ (T4)'),
  ('NV021','NV021','Nguyễn Diễm Quỳnh','Nhân viên','MKT',10500000,'probation','active',FALSE,'Thử việc 2 tháng'),
  ('NV022','NV022','Nguyễn Nhật Minh','Thực tập sinh','MKT',5000000,'intern','active',FALSE,'Thực tập sinh');

-- === KHO — chính thức (công chuẩn 29) ===
INSERT INTO staff (id, code, name, role, dept, salary, contract_type, status, has_bhxh, notes) VALUES
  ('NV023','NV023','Dương Phương Trang','Quản lý','Kho',13000000,'official','active',TRUE,'Quản lý Kho · Trừ 578k BHXH/tháng'),
  ('NV024','NV024','Dương Phương Mai','Nhân viên','Kho',9000000,'official','active',FALSE,'Tháng 5 tăng lương 10 triệu'),
  ('NV025','NV025','Trần Anh Phi','Nhân viên','Kho',9000000,'official','active',FALSE,''),
  ('NV026','NV026','Nguyễn Việt Nam','Nhân viên','Kho',9000000,'official','active',FALSE,'Tháng 5 tăng lương 10 triệu'),
  ('NV027','NV027','Võ Thiên Ngân','Nhân viên','Kho',9000000,'official','active',FALSE,''),

-- === KHO — thử việc (công chuẩn 30 thử việc + 29 chính thức trong cùng tháng) ===
  ('NV028','NV028','Bùi Thị Bích','Nhân viên','Kho',9000000,'probation','active',FALSE,'Thử việc 1 tháng'),
  ('NV029','NV029','Vũ Hồng Tươi','Nhân viên','Kho',9000000,'probation','active',FALSE,'Thử việc 1 tháng'),
  ('NV030','NV030','Hoàng Thùy Nhi','Nhân viên','Kho',9000000,'probation','active',FALSE,'Tên cũ: Nguyên · Thử việc 2 tháng (85%)'),

-- === KẾ TOÁN NHẬP LIỆU (thử việc 100%) ===
  ('NV031','NV031','Nguyễn Lan Anh','Nhân viên','Kế toán',8000000,'probation','active',FALSE,'Thử việc 2 tháng · 100% lương thử việc');

-- === KHO PART-TIME (công chuẩn 30, không phụ cấp) ===
INSERT INTO staff (id, code, name, role, dept, salary, contract_type, status, has_bhxh, notes) VALUES
  ('NV032','NV032','Vũ Văn Huân','Nhân viên','Kho',4500000,'parttime','active',FALSE,'Part-time · Không phụ cấp · Thưởng chiều = ½ sáng'),
  ('NV033','NV033','Phạm Tùng Dương','Nhân viên','Kho',4500000,'parttime','active',FALSE,'Part-time · Không phụ cấp · Thưởng chiều = ½ sáng');

-- === SHIP / GIAO HÀNG (công chuẩn 30, phụ cấp 1.5M) ===
INSERT INTO staff (id, code, name, role, dept, salary, contract_type, status, has_bhxh, notes) VALUES
  ('NV034','NV034','Phạm Thị Thảo','Shipper','Giao hàng',6500000,'official','active',FALSE,''),
  ('NV035','NV035','Tưởng Việt Dũng','Shipper','Giao hàng',6000000,'official','inactive',FALSE,'Đã nghỉ (26/4)'),
  ('NV036','NV036','Nguyễn Văn Thắng','Shipper','Giao hàng',6000000,'official','active',FALSE,''),
  ('NV037','NV037','Nguyễn Minh Hưởng','Shipper','Giao hàng',6000000,'official','active',FALSE,''),
  ('NV038','NV038','Võ Kim Thiên Ngân','Shipper','Giao hàng',6000000,'official','active',FALSE,'M3 chuyển sang kho'),
  ('NV039','NV039','Trần Trung Hiếu','Shipper','Giao hàng',6000000,'official','inactive',FALSE,'29/4 nghỉ hẳn'),
  ('NV040','NV040','Nguyễn Hữu Trí','Shipper','Giao hàng',6500000,'official','active',FALSE,''),
  ('NV041','NV041','Cao Thế Trung','Shipper','Giao hàng',6000000,'official','active',FALSE,''),
  ('NV042','NV042','Phùng Khắc Doanh','Shipper','Giao hàng',6000000,'official','inactive',FALSE,'M6 nghỉ hẳn'),
  ('NV043','NV043','Tạ Đình Dũng','Shipper','Giao hàng',6000000,'official','active',FALSE,'Vào 29/4'),
  ('NV044','NV044','Nguyễn Trọng Huy','Shipper','Giao hàng',6000000,'official','active',FALSE,'Vào 17/4'),
  ('NV045','NV045','Trịnh Tiến Đông','Shipper','Giao hàng',6000000,'official','active',FALSE,'Vào 19/4'),
  ('NV046','NV046','Đặng Quang Vinh','Shipper chiều','Giao hàng',4000000,'official','active',FALSE,'Ship chiều');

-- =========================================================
-- DONE
-- =========================================================
SELECT
  COUNT(*) AS total_staff,
  COUNT(*) FILTER (WHERE status='active') AS active,
  COUNT(*) FILTER (WHERE status='inactive') AS resigned,
  COUNT(*) FILTER (WHERE dept='Giao hàng') AS shippers,
  COUNT(*) FILTER (WHERE dept='Kho') AS warehouse,
  COUNT(*) FILTER (WHERE has_bhxh=TRUE) AS with_bhxh
FROM staff;

SELECT '✅ Đã import 37 NV thật từ bảng lương tháng 4/2026' AS done;
