-- =========================================================
-- 21: BÁO TELEGRAM "CÓ ĐƠN MỚI" NGAY KHI TẠO ĐƠN — chạy ở SERVER (DB trigger).
-- Thay cho việc gửi từ trình duyệt (phụ thuộc máy/cache/tab → thu gọn + trùng).
-- DB tự bắn 1 lần khi INSERT đơn status='confirmed' → luôn đủ mặt hàng, không trùng.
-- Cần pg_net (net.http_post) — đã dùng ở trigger web_orders. Chạy lại nhiều lần OK.
-- =========================================================

CREATE OR REPLACE FUNCTION notify_new_order()
RETURNS TRIGGER AS $$
DECLARE
  cfg       JSONB;
  token     TEXT;
  chat      TEXT;
  route_id  TEXT;
  c_phone   TEXT;
  c_addr    TEXT;
  items_str TEXT;
  n_item    INT;
  msg       TEXT;
BEGIN
  -- Chỉ báo đơn MỚI (vừa tạo). Đơn nhập từ Excel (status='delivered') KHÔNG báo.
  IF COALESCE(NEW.status,'') <> 'confirmed' THEN RETURN NEW; END IF;

  SELECT config INTO cfg FROM integrations WHERE key = 'telegram';
  IF cfg IS NULL THEN RETURN NEW; END IF;
  token := cfg->>'botToken';
  IF token IS NULL THEN RETURN NEW; END IF;

  -- Kênh "phân đơn shipper" theo routing (fallback chatId mặc định)
  route_id := cfg->'routing'->>'shipper_dispatch';
  SELECT ch->>'chatId' INTO chat
    FROM jsonb_array_elements(COALESCE(cfg->'channels','[]'::jsonb)) ch
    WHERE ch->>'id' = route_id LIMIT 1;
  chat := COALESCE(chat, cfg->>'chatId');
  IF chat IS NULL THEN RETURN NEW; END IF;

  -- SĐT + địa chỉ từ khách hàng
  SELECT phone, address INTO c_phone, c_addr FROM customers WHERE id = NEW.customer_id;

  -- Danh sách mặt hàng đầy đủ
  n_item := COALESCE(jsonb_array_length(NEW.items), 0);
  SELECT string_agg(
           '• ' || COALESCE(it->>'name','') || ' ' || COALESCE(it->>'qty','0') ||
           COALESCE(NULLIF(it->>'unit',''),'kg') || ' = ' ||
           replace(to_char(COALESCE(NULLIF(it->>'total','')::numeric,0),'FM999,999,999'),',','.') || 'đ',
           E'\n')
    INTO items_str
    FROM jsonb_array_elements(COALESCE(NEW.items,'[]'::jsonb)) it;

  msg :=
    '🆕 CÓ ĐƠN MỚI ' || NEW.code || E'\n\n' ||
    '👤 ' || COALESCE(NEW.cust_name,'?') || E'\n' ||
    '📞 ' || COALESCE(c_phone,'—') || E'\n' ||
    '📍 ' || COALESCE(NULLIF(NEW.drop_addr,''), c_addr, '—') || E'\n' ||
    '📅 ' || COALESCE(LEFT(NEW.deliver_date::text,10), LEFT(NEW.order_date::text,10), '') ||
            ' · Ca ' || COALESCE(NULLIF(NEW.ship_shift,''),'Sáng') ||
            CASE WHEN COALESCE(NEW.ship_time,'')<>'' THEN ' · ' || NEW.ship_time ELSE '' END || E'\n\n' ||
    '📦 Mặt hàng (' || n_item || ' mã):' || E'\n' || COALESCE(items_str,'') || E'\n\n' ||
    '💰 Tổng: ' || replace(to_char(COALESCE(NEW.freight,0),'FM999,999,999'),',','.') || 'đ' || E'\n' ||
    '💵 Thanh toán: ' || COALESCE(NEW.pay_by,'Công nợ') ||
    CASE WHEN COALESCE(NEW.cod,0) > 0 THEN E'\n🛒 COD: ' || replace(to_char(NEW.cod,'FM999,999,999'),',','.') || 'đ' ELSE '' END ||
    CASE WHEN COALESCE(NEW.notes,'')<>'' THEN E'\n📝 Ghi chú: ' || NEW.notes ELSE '' END;

  PERFORM net.http_post(
    url     := 'https://api.telegram.org/bot' || token || '/sendMessage',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('chat_id', chat, 'text', msg)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;   -- lỗi gửi KHÔNG được chặn việc tạo đơn
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_order ON orders;
CREATE TRIGGER trg_notify_new_order
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_new_order();

SELECT '✅ 21: Trigger báo "CÓ ĐƠN MỚI" từ SERVER khi tạo đơn (đủ mặt hàng, không trùng)' AS done;
