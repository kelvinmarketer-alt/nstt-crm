-- =========================================================
-- AI Usage Log — track tokens TOÀN DN (sum across all machines)
-- =========================================================
-- Mỗi AI call (Gemini/Claude/OpenAI) ghi 1 row vào đây.
-- Settings → Tài nguyên → tab "Toàn DN" sum tổng tháng hiện tại.

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id            BIGSERIAL PRIMARY KEY,
  device_id     TEXT,                              -- máy phát sinh call
  user_name     TEXT,                              -- NV đang đăng nhập
  model         TEXT NOT NULL,                     -- 'gemini-flash', 'claude-haiku-4-5', 'openai-gpt-4o-mini'...
  tokens_in     INT DEFAULT 0,
  tokens_out    INT DEFAULT 0,
  ts            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_ts    ON ai_usage_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage_log(model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user  ON ai_usage_log(user_name);

-- RLS: cho phép anon + authenticated full access (giống các bảng khác)
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_full_ai_usage_log" ON ai_usage_log;
CREATE POLICY "public_full_ai_usage_log" ON ai_usage_log FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

-- View aggregate cho tháng hiện tại (sum tokens by model)
CREATE OR REPLACE VIEW ai_usage_month_summary AS
SELECT
  TO_CHAR(ts, 'YYYY-MM') AS month,
  model,
  COUNT(*) AS calls,
  SUM(tokens_in) AS sum_tokens_in,
  SUM(tokens_out) AS sum_tokens_out,
  COUNT(DISTINCT device_id) AS unique_devices,
  COUNT(DISTINCT user_name) AS unique_users
FROM ai_usage_log
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;

SELECT '✅ ai_usage_log + view ready — call AI giờ sẽ log để tổng hợp toàn DN' AS done;
