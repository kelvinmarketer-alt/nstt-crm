/* =========================================================
   NSTT — Báo cáo Telegram theo LỊCH (chạy trên GitHub Actions, KHÔNG cần mở app)
   Mỗi 30' workflow gọi script này. Script đọc config + dữ liệu từ Supabase (anon),
   đến giờ + đã bật thì gửi Telegram. Chống gửi trùng bằng kv_store 'tgCronSent'.
   Đọc bot token / chatId / routing / cờ bật từ bảng integrations(key='telegram').
   ENV: DRY_RUN=1 để chỉ in, không gửi.
   ========================================================= */
const URL = process.env.SUPABASE_URL || 'https://edhyvdstmewshurxucka.supabase.co';
const ANON = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkaHl2ZHN0bWV3c2h1cnh1Y2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDI4MDYsImV4cCI6MjA5NTUxODgwNn0.WXOLLLkyrLPRAOnAu_4tgFL4KJ-S3ZKuOYePgWc_96I';
const DRY = process.env.DRY_RUN === '1';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON };
const fmt = n => Math.round(+n || 0).toLocaleString('vi-VN');

async function rest(path) { const r = await fetch(`${URL}/rest/v1/${path}`, { headers: H }); if (!r.ok) throw new Error(path + ' → ' + r.status); return r.json(); }
async function getKv(key) { const d = await rest(`kv_store?key=eq.${encodeURIComponent(key)}&select=value`); return (d[0] && d[0].value) || null; }
async function setKv(key, value) {
  await fetch(`${URL}/rest/v1/kv_store`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key, value }) });
}

/* VN time (UTC+7) */
function vnNow() { const d = new Date(Date.now() + 7 * 3600 * 1000); return { hhmm: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`, min: d.getUTCHours() * 60 + d.getUTCMinutes(), date: d.toISOString().slice(0, 10), vnDate: `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` }; }
const toMin = hhmm => { const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : -1; };

/* ===== Tính công nợ + quá hạn (giống app) ===== */
function ordDate(o) { const i = o.deliver_date; if (i && /^\d{4}-\d{2}-\d{2}/.test(i)) return new Date(i.slice(0, 10) + 'T00:00:00Z'); const m = String(o.order_date || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
function buildDebtData(orders, customers, ledger, creditDays) {
  const TERM_DEF = 7, nowMs = Date.now();
  const chargesBy = {}, paidBy = {};
  orders.forEach(o => {
    if (o.status === 'draft' || o.status === 'cancelled') return;
    if (!/nợ|cong no|credit/i.test(o.pay_by || '')) return;
    const id = o.customer_id; if (!id) return;
    (chargesBy[id] = chargesBy[id] || []).push({ amt: +o.freight || 0, t: ordDate(o) });
  });
  ledger.forEach(e => { if (e.type === 'payment' && e.custId) paidBy[e.custId] = (paidBy[e.custId] || 0) + (+e.amount || 0); });
  const nameOf = {}; customers.forEach(c => nameOf[c.id] = c.name);
  const rows = Object.keys(chargesBy).map(id => {
    const ch = chargesBy[id].filter(c => c.t && c.amt > 0).sort((a, b) => a.t - b.t);
    let pay = paidBy[id] || 0; ch.forEach(c => { if (pay > 0) { const u = Math.min(pay, c.amt); c.amt -= u; pay -= u; } });
    const debt = Math.max(0, Math.round(ch.reduce((s, c) => s + c.amt, 0)));
    const oldest = ch.find(c => c.amt > 0.5);
    const term = +(creditDays || {})[id] || TERM_DEF;
    const ov = oldest ? Math.max(0, Math.floor((nowMs - oldest.t.getTime()) / 86400000) - term) : 0;
    return { name: nameOf[id] || id, debt, overdue: ov };
  }).filter(r => r.debt > 0).sort((a, b) => b.debt - a.debt);
  return rows;
}
function debtReportMsg(rows, vnDate) {
  const total = rows.reduce((s, r) => s + r.debt, 0);
  const od = rows.filter(r => r.overdue > 0), odT = od.reduce((s, r) => s + r.debt, 0);
  const out = [`🧮 *BÁO CÁO CÔNG NỢ — ${vnDate}*`, ''];
  out.push(`💰 Tổng công nợ: *${fmt(total)}đ* · ${rows.length} khách`);
  out.push(`⏰ Quá hạn: *${fmt(odT)}đ* · ${od.length} khách`);
  if (rows.length) { out.push('\n*Top khách nợ:*'); rows.slice(0, 12).forEach(r => out.push(`• ${r.name} · ${fmt(r.debt)}đ${r.overdue > 0 ? ` ⏰ ${r.overdue} ngày` : ''}`)); if (rows.length > 12) out.push(`… và ${rows.length - 12} khách khác`); }
  else out.push('\n✅ Không có công nợ.');
  return out.join('\n');
}
function alertMsg(orders, customers, debtRows, vnDate, nowMs) {
  const overdueOrders = orders.filter(o => ['confirmed', 'pickup', 'transit'].includes(o.status) && o.deliver_date).filter(o => { const t = ordDate(o); return t && (nowMs - t.getTime()) / 86400000 > 1; }).slice(0, 5);
  const odDebt = debtRows.filter(r => r.overdue > 0).slice(0, 5);
  if (!overdueOrders.length && !odDebt.length) return `✅ *${vnDate}*\nKhông có cảnh báo nào hôm nay.`;
  const out = [`⚠️ *CẢNH BÁO NỘI BỘ — ${vnDate}*`];
  if (overdueOrders.length) { out.push(`\n📦 *${overdueOrders.length} đơn QUÁ HẠN GIAO:*`); overdueOrders.forEach(o => out.push(`• ${o.code} · ${o.cust_name} · ${(o.deliver_date || '').slice(0, 10)}`)); }
  if (odDebt.length) { out.push(`\n💸 *${odDebt.length} KH NỢ QUÁ HẠN:*`); odDebt.forEach(r => out.push(`• ${r.name} · ${fmt(r.debt)}đ ⏰${r.overdue}n`)); }
  return out.join('\n');
}

async function sendTg(botToken, chatId, text) {
  if (DRY) { console.log(`\n--- [DRY] gửi tới ${chatId} ---\n${text}\n`); return true; }
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }) });
  const ok = r.ok; if (!ok) console.warn('TG send fail', r.status, await r.text()); return ok;
}

(async () => {
  const ig = await rest(`integrations?key=eq.telegram&select=config,enabled`);
  const cfg = (ig[0] && ig[0].config) || {};
  if (!cfg.botToken) { console.log('Chưa cấu hình Telegram → bỏ qua.'); return; }
  const chFor = purpose => { const id = (cfg.routing || {})[purpose]; const ch = (cfg.channels || []).find(c => c.id === id); return ch && ch.chatId ? ch.chatId : cfg.chatId; };
  const t = vnNow();
  const inWindow = h => { const m = toMin(h); return m >= 0 && (t.min - m) >= 0 && (t.min - m) < 30; };   /* cron 30' → khớp 1 lần */
  const marker = (await getKv('tgCronSent')) || {};
  let changed = false;
  console.log(`[VN ${t.vnDate} ${t.hhmm}] DRY=${DRY ? 1 : 0}`);

  /* dữ liệu dùng chung */
  const [orders, customers, ledgerKv, creditKv] = await Promise.all([
    rest('orders?select=code,cust_name,customer_id,deliver_date,order_date,freight,status,pay_by'),
    rest('customers?select=id,name'),
    getKv('debtLedger'), getKv('custCreditDays'),
  ]);
  const debtRows = buildDebtData(orders, customers, ledgerKv || [], creditKv || {});

  /* FORCE (chạy tay): GỬI ngay cả 2 báo cáo, bỏ qua giờ/cờ (DRY=1 → chỉ in) */
  if (process.env.FORCE === '1') {
    const chat = chFor('alert');
    if (!chat) { console.log('Chưa có kênh Cảnh báo nội bộ → không gửi.'); return; }
    await sendTg(cfg.botToken, chat, debtReportMsg(debtRows, t.vnDate));
    await sendTg(cfg.botToken, chat, alertMsg(orders, customers, debtRows, t.vnDate, Date.now()));
    console.log('✓ FORCE: đã gửi thử cả 2 báo cáo.');
    return;
  }

  /* 1) Báo cáo công nợ */
  if (cfg.debtReportEnabled && inWindow(cfg.debtReportHour || '08:00') && marker.debt !== t.date) {
    const chat = chFor('alert'); if (chat) { if (await sendTg(cfg.botToken, chat, debtReportMsg(debtRows, t.vnDate))) { marker.debt = t.date; changed = true; console.log('✓ Đã gửi báo cáo công nợ'); } }
  }
  /* 2) Cảnh báo nội bộ */
  if (cfg.alertEnabled && inWindow(cfg.alertHour || '09:00') && marker.alert !== t.date) {
    const chat = chFor('alert'); if (chat) { if (await sendTg(cfg.botToken, chat, alertMsg(orders, customers, debtRows, t.vnDate, Date.now()))) { marker.alert = t.date; changed = true; console.log('✓ Đã gửi cảnh báo nội bộ'); } }
  }

  if (changed && !DRY) await setKv('tgCronSent', marker);
  if (!changed) console.log('Chưa tới giờ / chưa bật / đã gửi hôm nay → không gửi.');
})().catch(e => { console.error('ERROR', e); process.exit(1); });
