-- =========================================================
-- Add CEO + CFO + Perm payroll.approve cho CFO
-- =========================================================
-- Từ file bảng lương T4 user gửi:
-- - Nguyễn Tuấn Anh (CEO) — LCB 10M, BHXH 2.560k
-- - Giáp Quỳnh Anh (CFO) — LCB 10M, BHXH 3.200k (duyệt bảng lương)
-- =========================================================

-- Add CEO + CFO
INSERT INTO staff (id, name, role, dept, salary, contract_type, status, has_bhxh, notes, perms) VALUES
  ('NV007','Nguyễn Tuấn Anh','CEO','Ban GĐ',10000000,'official','active',TRUE,
   'CEO · Giám đốc điều hành · BHXH 2.560.000/tháng',
   ARRAY['all']::TEXT[]),
  ('NV008','Giáp Quỳnh Anh','CFO','Ban GĐ',10000000,'official','active',TRUE,
   'CFO · Giám đốc Tài chính · BHXH 3.200.000/tháng · Duyệt bảng lương',
   ARRAY['all','payroll.approve','payroll.viewAll','payroll.edit']::TEXT[])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  dept = EXCLUDED.dept,
  salary = EXCLUDED.salary,
  has_bhxh = EXCLUDED.has_bhxh,
  notes = EXCLUDED.notes,
  perms = EXCLUDED.perms,
  status = 'active';

-- Update HR Trang để có quyền tính + submit lương (không duyệt được)
UPDATE staff
SET perms = ARRAY['payroll.calc','payroll.submit','payroll.viewAll','staff','timesheet']::TEXT[]
WHERE id = 'NV010' AND name = 'Nguyễn Phương Trang';

-- Update existing admin/ban-gd user → cấp quyền full
UPDATE staff
SET perms = ARRAY['all']::TEXT[]
WHERE dept = 'ban-gd' OR role = 'Chủ doanh nghiệp';

SELECT
  id, name, role, dept, salary, has_bhxh,
  array_to_string(perms, ', ') AS permissions
FROM staff
WHERE id IN ('NV007','NV008','NV010') OR dept = 'ban-gd'
ORDER BY id;

SELECT '✅ Đã add CEO + CFO + setup perms duyệt lương' AS done;
