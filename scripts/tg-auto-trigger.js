/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Auto-trigger Telegram
   ─────────────────────────────────────────────────────────
   Wire 2 trigger event-based + 1 scheduler:

   1a. NEW_ORDER_PING (event): tạo đơn (status 'confirmed') → tin NGẮN
       "🆕 Có đơn mới" vào group (chỉ mã + khách + tổng, KHÔNG chi tiết/shipper).
   1b. SHIPPER_DISPATCH (window.sendShipperDispatch — gọi khi GIAO SHIPPER):
       gom xong + bấm "giao shipper" → tin ĐẦY ĐỦ "ĐƠN MỚI CẦN GIAO" + phân
       shipper. 2 tin khác nhau, dedup riêng.

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
  /* ─────────────────────────────────────────────────────────
     QUAN TRỌNG: KHÔNG bắn Telegram khi MỚI TẠO đơn nữa.
     Đơn mới chỉ "Đơn mới" trong app. Thông báo group + phân đơn cho shipper
     CHỈ bắn khi gom xong → bấm "giao shipper" (procurement.js gọi
     window.sendShipperDispatch). Tránh gửi trùng bằng TG_SENT_KEY.
     ───────────────────────────────────────────────────────── */
  const TG_SENT_KEY = 'vty_tg_shipper_sent';
  function getSentSet() {
    try { return new Set(JSON.parse(localStorage.getItem(TG_SENT_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  function saveSentSet(set) {
    try { localStorage.setItem(TG_SENT_KEY, JSON.stringify([...set].slice(-1000))); } catch (e) {}
  }

  /* Gửi đơn cho group shipper — gọi khi GIAO SHIPPER (không phải lúc tạo đơn).
     Trả {ok, channel}. Chống gửi trùng theo mã đơn. */
  async function sendShipperDispatch(o) {
    if (!o || !o.code) return { ok: false };
    const sent = getSentSet();
    if (sent.has(o.code)) return { ok: true, dup: true };   /* đã phân giao rồi → không gửi lại */
    if (!window.getTgChannel) return { ok: false };
    const ch = window.getTgChannel('shipper_dispatch');
    if (!ch || !ch.botToken || !ch.chatId) return { ok: false };

    const cust = (window.STORE.get('customers', []) || []).find(c => c.id === (o.cust || o.customer_id)) || {};
    const items = (o.items || []).map(it =>
      `• ${it.name} ${it.qty}${it.unit || 'kg'} = ${window.fmt(it.total)}đ`
    ).join('\n');

    const msg = `🚚 *ĐƠN MỚI CẦN GIAO* ${o.code}\n\n` +
      `👤 ${o.custName || cust.name || '?'}\n` +
      `📞 ${o.custPhone || cust.phone || '—'}\n` +
      `📍 ${o.drop || cust.address || '—'}\n` +
      `📅 ${o.deliverDate || o.date} · Ca ${o.shipShift || 'Sáng'}${o.shipTime ? ' · ' + o.shipTime : ''}\n` +
      (o.driverName ? `🛵 Shipper: *${o.driverName}*\n` : '') +
      `\n📦 *Mặt hàng:*\n${items}\n` +
      `\n💰 Tổng: *${window.fmt(o.freight)}đ*\n` +
      `💵 Thanh toán: ${o.payBy || 'Công nợ'}\n` +
      (o.cod ? `🛒 COD: ${window.fmt(o.cod)}đ\n` : '') +
      (o.note ? `\n📝 Ghi chú: ${o.note}\n` : '') +
      `\n_Đơn vừa được phân giao lúc ${new Date().toLocaleTimeString('vi-VN')}_`;

    try {
      await fetch(`https://api.telegram.org/bot${ch.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ch.chatId, text: msg, parse_mode: 'Markdown' }),
      });
      sent.add(o.code); saveSentSet(sent);
      console.log(`[TG] ✓ Đã phân giao đơn ${o.code} cho shipper`);
      return { ok: true, channel: ch.name || 'shipper' };
    } catch (e) {
      console.warn(`[TG shipper_dispatch]`, e.message);
      return { ok: false, error: e.message };
    }
  }
  window.sendShipperDispatch = sendShipperDispatch;

  /* ─────────────────────────────────────────────────────────
     TIN NGẮN "CÓ ĐƠN MỚI" — bắn khi vừa tạo đơn (status 'confirmed').
     Chỉ báo cho biết CÓ đơn mới (mã + khách + tổng), KHÔNG kèm chi tiết/shipper.
     Tin ĐẦY ĐỦ "ĐƠN MỚI CẦN GIAO" + phân shipper → chỉ khi giao shipper.
     Dedup theo mã (per-máy). Baseline lần đầu để KHÔNG báo lại đơn cũ khi mở trang.
     ───────────────────────────────────────────────────────── */
  const TG_NEW_KEY = 'vty_tg_neworder_pinged';
  function getNewSet() { try { return new Set(JSON.parse(localStorage.getItem(TG_NEW_KEY) || '[]')); } catch (e) { return new Set(); } }
  function saveNewSet(s) { try { localStorage.setItem(TG_NEW_KEY, JSON.stringify([...s].slice(-1500))); } catch (e) {} }
  function isNewOrder(o) { return o && o.code && o.status === 'confirmed'; }   /* đơn vừa tạo = "Mới" */
  let _newBaselined = false;

  window.STORE.subscribe('orders', orders => {
    if (!Array.isArray(orders)) return;
    const set = getNewSet();
    /* Lần đầu nhận data → đánh dấu đơn 'Mới' hiện có là đã biết (không báo lại) */
    if (!_newBaselined) {
      _newBaselined = true;
      let add = false;
      orders.forEach(o => { if (isNewOrder(o) && !set.has(o.code)) { set.add(o.code); add = true; } });
      if (add) saveNewSet(set);
      return;
    }
    let add = false;
    orders.forEach(o => {
      if (isNewOrder(o) && !set.has(o.code)) { set.add(o.code); add = true; setTimeout(() => sendNewOrderPing(o), 0); }
    });
    if (add) saveNewSet(set);
  });

  async function sendNewOrderPing(o) {
    if (!window.getTgChannel) return;
    const ch = window.getTgChannel('shipper_dispatch');
    if (!ch || !ch.botToken || !ch.chatId) return;
    const cust = (window.STORE.get('customers', []) || []).find(c => c.id === (o.cust || o.customer_id)) || {};
    const nItems = (o.items || []).length;
    const msg = `🆕 *CÓ ĐƠN MỚI* ${o.code}\n` +
      `👤 ${o.custName || cust.name || '?'}\n` +
      `💰 ${window.fmt(o.freight)}đ · ${o.payBy || 'Công nợ'}${nItems ? ' · ' + nItems + ' mã' : ''}\n` +
      `🕒 ${new Date().toLocaleTimeString('vi-VN')}`;
    try {
      await fetch(`https://api.telegram.org/bot${ch.botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ch.chatId, text: msg, parse_mode: 'Markdown' }),
      });
      console.log(`[TG] ✓ Báo có đơn mới ${o.code}`);
    } catch (e) { console.warn('[TG new-order ping]', e.message); }
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

  /* =========================================================
     BÁO CÁO CÔNG NỢ HÀNG NGÀY — riêng (preview + test + lịch)
     Công nợ tính TRỰC TIẾP từ đơn trả bằng Công nợ − phiếu thu (sổ nợ),
     quá hạn theo hạn nợ KH (window.debtOverdueInfo). Gửi kênh 'alert'.
     ========================================================= */
  function buildDebtReport() {
    const fmt = window.fmt || (n => (n || 0).toLocaleString('vi-VN'));
    const date = (window.todayDate ? window.todayDate() : new Date()).toLocaleDateString('vi-VN');
    const customers = window.STORE.get('customers', []) || [];
    const orders = window.STORE.get('orders', []) || [];
    const ledger = window.STORE.get('debtLedger', []) || [];
    const debtBy = {};
    orders.forEach(o => {
      if (o.status === 'draft' || o.status === 'cancelled') return;
      if (!/nợ|cong no|credit/i.test(o.payBy || o.pay_by || '')) return;
      const id = o.cust || o.customer_id; if (!id) return;
      debtBy[id] = (debtBy[id] || 0) + (+o.freight || 0);
    });
    ledger.forEach(e => { if (e.type === 'payment' && e.custId) debtBy[e.custId] = (debtBy[e.custId] || 0) - (+e.amount || 0); });
    const nameOf = {}; customers.forEach(c => nameOf[c.id] = c.name);
    const rows = Object.keys(debtBy).map(id => {
      const debt = Math.max(0, Math.round(debtBy[id]));
      const ov = window.debtOverdueInfo ? (window.debtOverdueInfo(id).days || 0) : 0;
      return { name: nameOf[id] || id, debt, overdue: ov };
    }).filter(r => r.debt > 0).sort((a, b) => b.debt - a.debt);
    const total = rows.reduce((s, r) => s + r.debt, 0);
    const od = rows.filter(r => r.overdue > 0);
    const odTotal = od.reduce((s, r) => s + r.debt, 0);
    const out = [`🧮 *BÁO CÁO CÔNG NỢ — ${date}*`, ''];
    out.push(`💰 Tổng công nợ: *${fmt(total)}đ* · ${rows.length} khách`);
    out.push(`⏰ Quá hạn: *${fmt(odTotal)}đ* · ${od.length} khách`);
    if (rows.length) {
      out.push('\n*Top khách nợ:*');
      rows.slice(0, 12).forEach(r => out.push(`• ${r.name} · ${fmt(r.debt)}đ${r.overdue > 0 ? ` ⏰ ${r.overdue} ngày` : ''}`));
      if (rows.length > 12) out.push(`… và ${rows.length - 12} khách khác`);
    } else { out.push('\n✅ Không có công nợ.'); }
    return out.join('\n');
  }
  async function sendDebtReportNow() {
    if (!window.getTgChannel) return false;
    const ch = window.getTgChannel('alert');
    if (!ch || !ch.botToken || !ch.chatId) { console.warn('[TG debt-report] chưa cấu hình kênh alert'); return false; }
    try {
      await fetch(`https://api.telegram.org/bot${ch.botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ch.chatId, text: buildDebtReport(), parse_mode: 'Markdown' }),
      });
      console.log('[TG] ✓ Đã gửi báo cáo công nợ');
      return true;
    } catch (e) { console.warn('[TG debt-report]', e.message); return false; }
  }
  window.buildDebtReport = buildDebtReport;
  window.sendDebtReportNow = sendDebtReportNow;

  /* === Scheduler: kiểm tra mỗi 30s xem đến giờ chưa (cảnh báo + báo cáo công nợ) === */
  let _lastAlertDate = '', _lastDebtDate = '';
  setInterval(() => {
    const cfg = window.STORE.get('int_telegram', {}) || {};
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todayStr = now.toISOString().slice(0, 10);
    if (cfg.alertEnabled && hhmm === (cfg.alertHour || '09:00') && _lastAlertDate !== todayStr) {
      _lastAlertDate = todayStr; sendAlertNow();
    }
    if (cfg.debtReportEnabled && hhmm === (cfg.debtReportHour || '08:00') && _lastDebtDate !== todayStr) {
      _lastDebtDate = todayStr; sendDebtReportNow();
    }
  }, 30000); /* check mỗi 30s */

  console.log('%c[NSTT] ✓ TG auto-trigger ready (shipper dispatch + daily alert)', 'color:#1B5E20;font-weight:bold');
})();
