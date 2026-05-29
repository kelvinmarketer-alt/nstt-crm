-- =========================================================
-- Generic key-value store cho các bảng phụ trợ
-- timesheet, payrollExtra, audit_log, inv_movements, snapshots,
-- budget_2026, loyalty_rules, marketing_tpls, cust_prefs, pod_photos
-- =========================================================
-- Lý do: 9 STORE keys này chỉ-localStorage → NV mất data khi đổi máy.
-- Mỗi cái có schema riêng phức tạp → đỡ tạo 9 bảng riêng, dùng JSONB generic.
-- Trade-off: không query SQL được trên các bảng này, nhưng app NSTT chỉ
-- get/set toàn bộ → JSONB OK.

CREATE TABLE IF NOT EXISTS kv_store (
  key           TEXT PRIMARY KEY,         -- 'timesheet', 'payrollExtra', 'audit_log', ...
  value         JSONB NOT NULL DEFAULT '[]',
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_by    TEXT                       -- email/name NV cuối cùng sửa
);

CREATE INDEX IF NOT EXISTS idx_kv_updated ON kv_store(updated_at DESC);

ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full kv_store" ON kv_store FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION kv_store_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kv_store_updated_trigger ON kv_store;
CREATE TRIGGER kv_store_updated_trigger
  BEFORE UPDATE ON kv_store
  FOR EACH ROW EXECUTE FUNCTION kv_store_touch_updated_at();

SELECT '✅ kv_store ready — dùng cho 10 bảng phụ trợ' AS done;
