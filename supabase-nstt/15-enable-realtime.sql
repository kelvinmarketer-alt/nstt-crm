-- =========================================================
-- BẬT SUPABASE REALTIME cho các bảng business
-- =========================================================
-- Cho phép app nhận thay đổi tức thì (<1s) qua websocket:
-- đổi đơn/KH/HĐ ở máy này → máy khác thấy NGAY (như Google Docs).
--
-- Realtime hoạt động qua publication 'supabase_realtime'.
-- Thêm bảng vào publication này để bật.
-- =========================================================

DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'orders', 'customers', 'invoices', 'cash_entries',
    'suppliers', 'products', 'leads', 'inventory',
    'purchases', 'quotes', 'recurring_orders', 'returns', 'staff'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- Tránh lỗi nếu bảng đã có trong publication
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I;', t);
      RAISE NOTICE '✅ Realtime ON: %', t;
    ELSE
      RAISE NOTICE '⏭ Đã bật sẵn: %', t;
    END IF;
  END LOOP;
END $$;

-- =========================================================
-- VERIFY — các bảng đã bật realtime
-- =========================================================
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

SELECT '✅ Đã bật Realtime — đổi ở máy này, máy khác thấy ngay (<1s)' AS done;
