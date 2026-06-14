-- =========================================================
-- BẬT REALTIME cho bảng kv_store
-- =========================================================
-- kv_store chứa các dữ liệu CRITICAL nhiều người cùng dùng:
--   debtLedger (công nợ), timesheet/timesheetMeta (chấm công),
--   inv_movements (sổ kho), procurementRuns (gom hàng), payrollExtra...
-- Mặc định kv_store CHƯA nằm trong publication 'supabase_realtime'
-- → NV đổi công nợ ở máy này, máy khác phải reload mới thấy.
-- Chạy file này 1 lần để các dữ liệu đó đồng bộ TỨC THÌ (<1s) như đơn/KH.
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'kv_store'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE kv_store;
    RAISE NOTICE '✅ Realtime ON: kv_store';
  ELSE
    RAISE NOTICE '⏭ kv_store đã bật realtime sẵn';
  END IF;
END $$;

-- VERIFY
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'kv_store';

SELECT '✅ kv_store đã realtime — công nợ/chấm công/sổ kho đồng bộ ngay giữa các máy' AS done;
