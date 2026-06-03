-- =========================================================
-- 20: Cờ tg_notify cho web_orders — tránh báo Telegram TRÙNG.
-- Site WordPress đã tự báo Telegram (inc/telegram.php) khi có đơn,
-- nên đơn đẩy từ WP sẽ set tg_notify=false → trigger Supabase BỎ QUA gửi.
-- Các luồng khác (insert trực tiếp) để mặc định true → vẫn báo.
-- Chạy SAU 19-web-integration.sql. An toàn chạy lại nhiều lần.
-- =========================================================

ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS tg_notify BOOLEAN DEFAULT TRUE;

CREATE OR REPLACE FUNCTION notify_web_order()
RETURNS TRIGGER AS $$
DECLARE
  tg     JSONB;
  token  TEXT;
  chat   TEXT;
  msg    TEXT;
  n_item INT;
BEGIN
  -- WP (hoặc nguồn nào set tg_notify=false) đã tự lo Telegram → bỏ qua
  IF NOT COALESCE(NEW.tg_notify, TRUE) THEN RETURN NEW; END IF;

  SELECT value INTO tg FROM kv_store WHERE key = 'int_telegram';
  IF tg IS NULL THEN RETURN NEW; END IF;

  token := tg->>'botToken';
  chat  := COALESCE(tg->'routing'->>'web_order_chatId', tg->>'chatId');
  IF token IS NULL OR chat IS NULL THEN RETURN NEW; END IF;

  n_item := COALESCE(jsonb_array_length(NEW.items), 0);
  msg := '🛒 ĐƠN MỚI TỪ WEBSITE' || E'\n' ||
         '👤 ' || COALESCE(NEW.cust_name,'') || ' · ☎ ' || COALESCE(NEW.cust_phone,'') || E'\n' ||
         '📍 ' || COALESCE(NEW.cust_address,'—') || E'\n' ||
         '💰 ' || to_char(COALESCE(NEW.total,0),'FM999,999,999') || 'đ · ' ||
                  upper(COALESCE(NEW.payment,'cod')) ||
                  CASE WHEN COALESCE(NEW.recurring,'') <> '' THEN ' · 🔁 ' || NEW.recurring ELSE '' END || E'\n' ||
         '📦 ' || n_item || ' mặt hàng' ||
                  CASE WHEN COALESCE(NEW.note,'') <> '' THEN E'\n📝 ' || NEW.note ELSE '' END || E'\n' ||
         '→ Mở CRM ▸ "Đơn từ web" để duyệt';

  PERFORM net.http_post(
    url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('chat_id', chat, 'text', msg)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT '✅ 20: tg_notify flag — WP đẩy đơn sẽ KHÔNG báo Telegram trùng' AS done;
