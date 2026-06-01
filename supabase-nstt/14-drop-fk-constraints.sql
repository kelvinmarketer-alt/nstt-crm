-- =========================================================
-- DROP FOREIGN KEY constraints — cho kiến trúc offline-first
-- =========================================================
-- App sync từng bảng ĐỘC LẬP + ASYNC (offline-first).
-- → đơn (con) có thể sync LÊN cloud TRƯỚC khách hàng (cha)
-- → FK constraint chặn: "violates foreign key constraint orders_customer_id_fkey"
--
-- Giải pháp chuẩn cho offline-first: bỏ FK, toàn vẹn tham chiếu xử lý ở
-- tầng app (đơn đã lưu sẵn cust_name snapshot; xóa KH không xóa đơn cũ).
-- =========================================================

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND conrelid::regclass::text IN (
        'orders', 'invoices', 'inventory', 'purchases', 'quotes',
        'recurring_orders', 'returns', 'leads', 'cash_entries'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I;', fk.tbl, fk.conname);
    RAISE NOTICE '✅ Dropped FK % on %', fk.conname, fk.tbl;
  END LOOP;
END $$;

-- =========================================================
-- VERIFY — còn FK nào trên các bảng business không?
-- =========================================================
SELECT conrelid::regclass AS tbl, conname
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
  AND conrelid::regclass::text IN (
    'orders', 'invoices', 'inventory', 'purchases', 'quotes',
    'recurring_orders', 'returns', 'leads', 'cash_entries'
  );

SELECT '✅ Đã bỏ FK constraints — app sync async không còn lỗi foreign key' AS done;
