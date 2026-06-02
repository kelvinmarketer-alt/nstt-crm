/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Auto-trigger Telegram
   ─────────────────────────────────────────────────────────
   Wire 2 trigger event-based + 1 scheduler:

   1. SHIPPER_DISPATCH (event)
      Trigger: STORE.subscribe('orders') phát hiện đơn mới
              có status = 'confirmed' (đã xác nhận, chuẩn bị giao)
      Action: gửi tin nhắn vào group shipper qua kênh routing 'shipper_dispatch'

   2. PRICE_UPDATE (event)
      Đã có ở scripts/price-auto-send.js — subscribe 'products' price change.

   3. ALERT (scheduled)
      Mỗi ngày giờ user đặt (default 9:00) → tổng hợp:
      - Đơn quá hạn giao (overdue)
      - Công nợ KH quá hạn > 30 ngày
      - KH 30+ ngày không đặt
      Gửi vào kênh routing 'alert'

   Load global trên mọi page qua shared.js
   ========================================================= */
(function () {
  if (!window.STORE) { setTimeout(arguments.callee, 100); return; }
  if (window._tgAutoTriggerReady) return;
  window._tgAutoTriggerReady = true;

  /* =========================================================
     1. SHIPPER_DISPATCH — trigger khi đơn mới confirmed
     ─────────────────────────────────────────────────────────
     Track đơn đã gửi bằng key RIÊNG localStorage (KHÔNG để flag _ trên
     order object — vì field _ bị strip khi lưu cloud → mỗi lần sync về
     lại tưởng đơn mới → spam). Baseline lần đầu để không gửi lại đơn cũ.
     ========================================================= */
  const TG_SENT_KEY = 'vty_tg_shipper_sent';
  function getSentSet() {
    try { return new Set(JSON.parse(localStorage.getItem(TG_SENT_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  function saveSentSet(set) {
    try { localStorage.setItem(TG_SENT_KEY, JSON.stringify([...set].slice(-1000))); } catch (e) {}
  }
  let _tgBaselined = false;

  window.STORE.subscribe('orders', orders => {
    if (!Array.isArray(orders)) return;
    const sent = getSentSet();

    /* Lần đầu nhận data (load/preload): đánh dấu mọi đơn confirmed hiện có
       là "đã biết" → KHÔNG gửi lại đơn cũ. Chỉ gửi đơn confirmed MỚI sau đó. */
    if (!_tgBaselined) {
      _tgBaselined = true;
      let added = false;
      orders.forEach(o => {
        if (o.status === 'confirmed' && o.code && !sent.has(o.code)) { sent.add(o.code); added = true; }
      });
      if (added) saveSentSet(sent);
      return;
    }

    let added = false;
    orders.forEach(o => {
      if (o.status === 'confirmed' && o.code && !sent.has(o.code)) {
        sent.add(o.code); added = true;
        setTimeout(() => sendShipperDispatch(o), 0);
      }
    });
    if (added) saveSentSet(sent);
  });

  async function sendShipperDispatch(o) {
    if (!window.getTgChannel || !window.sendTgMessage) return;
    const ch = window.getTgChannel('shipper_dispatch');
    if (!ch || !ch.botToken || !ch.chatId) return;

    const cust = (window.STORE.get('customers', []) || []).find(c => c.id === (o.cust || o.customer_id)) || {};
    const items = (o.items || []).map(it =>
      `• ${it.name} ${it.qty}${it.unit || 'kg'} = ${window.fmt(it.total)}đ`
    ).join('\n');

    const msg = `🚚 *ĐƠN MỚI CẦN GIAO* ${o.code}\n\n` +
      `👤 ${o.custName || cust.name || '?'}\n` +
      `📞 ${cust.phone || '—'}\n` +
      `📍 ${o.drop || cust.address || '—'}\n` +
      `📅 ${o.date} · ${o.deliveryTime || 'Sáng'}\n` +
      `\n📦 *Mặt hàng:*\n${items}\n` +
      `\n💰 Tổng: *${window.fmt(o.freight)}đ*\n` +
      `💵 Thanh toán: ${o.payBy || 'Công nợ'}\n` +
      (o.cod ? `🛒 COD: ${window.fmt(o.cod)}đ\n` : '') +
      (o.note ? `\n📝 Ghi chú: ${o.note}\n` : '') +
      `\n_Đơn vừa được xác nhận lúc ${new Date().toLocaleTimeString('vi-VN')}_`;

    try {
      await fetch(`https://api.telegram.org/bot${ch.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ch.chatId, text: msg, parse_mode: 'Markdown' }),
      });
      console.log(`[TG] ✓ Đã gửi đơn ${o.code} cho shipper`);
    } catch (e) {
      console.warn(`[TG shipper_dispatch]`, e.message);
    }
  }

  /* =========================================================
     2. ALERT — scheduler tổng hợp cảnh báo hằng ngày
     ========================================================= */
  function buildAlertMessage() {
    const todayDate = window.todayDate ? window.todayDate() : new Date();
    const orders = window.STORE.get('orders', []) || [];
    const customers = window.STORE.get('customers', []) || [];

    /* 1. Đơn quá hạn giao (status confirmed/pickup quá 1 ngày trước hôm nay) */
    const overdueOrders = orders.filter(o => {
      if (o.status !== 'confirmed' && o.status !== 'pickup' && o.status !== 'transit') return false;
      if (!o.date) return false;
      const m = o.date.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (!m) return false;
      const yr = m[3].length === 2 ? '20' + m[3] : m[3];
      const orderDate = new Date(+yr, +m[2]-1, +m[1]);
      const diffDays = (todayDate - orderDate) / (1000 * 60 * 60 * 24);
      return diffDays > 1;
    }).slice(0, 5);

    /* 2. KH công nợ quá hạn (debtOverdue > 0) */
    const overdueDebt = customers.filter(c => (c.debtOverdue || 0) > 0)
      .sort((a, b) => (b.debtOverdue || 0) - (a.debtOverdue || 0))
      .slice(0, 5);

    /* 3. KH không đặt > 30 ngày */
    const inactiveCust = customers.filter(c => {
      if (!c.lastOrder || c.lastOrder === '—') return false;
      const m = c.lastOrder.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (!m) return false;
      const yr = m[3].length === 2 ? '20' + m[3] : m[3];
      const lastDate = new Date(+yr, +m[2]-1, +m[1]);
      const diffDays = (todayDate - lastDate) / (1000 * 60 * 60 * 24);
      return diffDays > 30 && diffDays < 90 && c.group !== 'Inactive';
    }).slice(0, 5);

    if (!overdueOrders.length && !overdueDebt.length && !inactiveCust.length) {
      return `✅ *${todayDate.toLocaleDateString('vi-VN')}*\n\nKhông có cảnh báo nào hôm nay. Mọi thứ ổn định!`;
    }

    const out = [`⚠️ *CẢNH BÁO NỘI BỘ — ${todayDate.toLocaleDateString('vi-VN')}*\n`];

    if (overdueOrders.length) {
      out.push(`\n📦 *${overdueOrders.length} đơn QUÁ HẠN GIAO:*`);
      overdueOrders.forEach(o => out.push(`• ${o.code} · ${o.custName} · ${o.date}`));
    }
    if (overdueDebt.length) {
      out.push(`\n💸 *${overdueDebt.length} KH NỢ QUÁ HẠN:*`);
      overdueDebt.forEach(c => out.push(`• ${c.name} · ${(c.debtOverdue/1e6).toFixed(1)}tr`));
    }
    if (inactiveCust.length) {
      out.push(`\n😴 *${inactiveCust.length} KH 30+ NGÀY KHÔNG ĐẶT:*`);
      inactiveCust.forEach(c => out.push(`• ${c.name} · cuối ${c.lastOrder}`));
    }
    return out.join('\n');
  }

  async function sendAlertNow() {
    if (!window.getTgChannel || !window.sendTgMessage) return false;
    const ch = window.getTgChannel('alert');
    if (!ch || !ch.botToken || !ch.chatId) {
      console.warn('[TG alert] Chưa cấu hình kênh cảnh báo');
      return false;
    }
    const msg = buildAlertMessage();
    try {
      await fetch(`https://api.telegram.org/bot${ch.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ch.chatId, text: msg, parse_mode: 'Markdown' }),
      });
      console.log('[TG] ✓ Đã gửi cảnh báo nội bộ');
      return true;
    } catch (e) {
      console.warn('[TG alert]', e.message);
      return false;
    }
  }
  window.sendAlertNow = sendAlertNow;
  window.buildAlertMessage = buildAlertMessage;

  /* === Scheduler: kiểm tra mỗi phút xem đến giờ chưa === */
  let _lastAlertDate = '';
  setInterval(() => {
    const cfg = window.STORE.get('int_telegram', {}) || {};
    if (!cfg.alertEnabled) return;
    const targetHour = cfg.alertHour || '09:00';   /* default 9:00 sáng */
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const todayStr = now.toISOString().slice(0, 10);
    if (hhmm === targetHour && _lastAlertDate !== todayStr) {
      _lastAlertDate = todayStr;
      sendAlertNow();
    }
  }, 30000); /* check mỗi 30s */

  console.log('%c[NSTT] ✓ TG auto-trigger ready (shipper dispatch + daily alert)', 'color:#1B5E20;font-weight:bold');
})();
