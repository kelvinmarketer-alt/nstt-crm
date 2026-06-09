/* =========================================================
   NSTT — Tự tạo ĐƠN ĐỊNH KỲ cho NGÀY HÔM SAU (chạy trên GitHub Actions)
   ─────────────────────────────────────────────────────────
   - Chạy mỗi giờ (cron). Đọc cấu hình KV 'autoRecurring' {enabled,time} từ
     master_data. Chỉ tạo đơn khi GIỜ VN hiện tại == giờ đã cài (admin chỉnh
     trong app). → khung giờ điều chỉnh được từ trang admin.
   - Với mỗi mẫu định kỳ ĐANG CHẠY (active) mà NGÀY MAI trùng daysOfWeek →
     tạo 1 đơn (deliver_date = ngày mai), chống trùng theo note.
   - Gửi Telegram báo Sale danh sách đơn vừa tạo.

   ENV (GitHub secrets):
     SUPABASE_URL, SUPABASE_KEY (anon), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
     FORCE=1 (tùy chọn) → bỏ qua kiểm tra giờ (chạy thử thủ công)
   ========================================================= */
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FORCE } = process.env;
/* Chưa cấu hình secrets → thoát NHẸ (exit 0) để workflow không báo lỗi mỗi giờ trước khi setup */
if (!SUPABASE_URL || !SUPABASE_KEY) { console.log('⚠ Chưa cấu hình secret SUPABASE_URL / SUPABASE_KEY — bỏ qua (thêm secrets trong Settings repo).'); process.exit(0); }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

/* Giờ Việt Nam (UTC+7) — Actions chạy UTC */
function vnNow() { return new Date(Date.now() + 7 * 3600 * 1000); }
function isoDay(d) { return d.toISOString().slice(0, 10); }
function viDate(d) { return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; }

async function getKv(key) {
  const { data, error } = await sb.from('master_data').select('items').eq('key', key).maybeSingle();
  if (error) { console.warn('getKv', key, error.message); return null; }
  return data ? data.items : null;
}
function priceToday(prod) {
  const h = (prod && prod.price_history) || [];
  if (!h.length) return 0;
  const last = h[h.length - 1];
  return +(last && (last.sell || last.buy)) || 0;
}
async function nextOrderCode() {
  const { data } = await sb.from('orders').select('code').order('code', { ascending: false }).limit(50);
  let max = 200;
  (data || []).forEach(o => { const m = String(o.code || '').match(/NSTT-(\d+)/); if (m) max = Math.max(max, +m[1]); });
  return 'NSTT-' + String(max + 1).padStart(6, '0');
}
async function tg(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) { console.log('(không có Telegram secret — bỏ qua báo)'); return; }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    });
  } catch (e) { console.warn('tg', e.message); }
}

async function main() {
  const cfg = (await getKv('autoRecurring')) || { enabled: false, time: '21:00' };
  const now = vnNow();
  const vnHour = now.getUTCHours();      /* now đã +7 → getUTCHours = giờ VN */
  const cfgHour = parseInt(String(cfg.time || '21:00').split(':')[0], 10);
  const force = FORCE === '1';

  if (!force) {
    if (!cfg.enabled) { console.log('Tự tạo đơn đang TẮT — thoát.'); return; }
    if (vnHour !== cfgHour) { console.log(`Giờ VN ${vnHour}h != giờ cài ${cfgHour}h — thoát.`); return; }
  }
  console.log(`Chạy tạo đơn định kỳ · VN ${vnHour}h · enabled=${cfg.enabled} · force=${force}`);

  const tom = new Date(now); tom.setUTCDate(tom.getUTCDate() + 1);
  const tomISO = isoDay(tom);
  const tomWd = tom.getUTCDay();

  const [{ data: ros }, { data: custs }, { data: prods }] = await Promise.all([
    sb.from('recurring_orders').select('*'),
    sb.from('customers').select('id,name,phone,address'),
    sb.from('products').select('id,name,price_history'),
  ]);

  const created = [];
  for (const row of (ros || [])) {
    if (row.active === false) continue;
    const dow = row.days_of_week || row.daysOfWeek || [];
    if (Array.isArray(dow) && dow.length && !dow.includes(tomWd)) continue;
    const custId = row.cust_id || row.custId;
    const custName = row.cust_name || row.custName || '';
    const items0 = row.items || [];
    if (!items0.length) continue;

    /* Chống trùng: đã có đơn định kỳ của mẫu này cho ngày mai chưa? */
    const tag = `🔁 Tự sinh định kỳ ${row.id}`;
    const { data: dup } = await sb.from('orders').select('code').eq('deliver_date', tomISO).ilike('notes', `%${tag}%`).limit(1);
    if (dup && dup.length) { console.log(`  bỏ qua ${row.id} — đã có đơn cho ${tomISO}`); continue; }

    const items = items0.map(it => {
      const p = (prods || []).find(x => x.id === it.productId);
      const price = priceToday(p);
      const qty = +it.qty || 0;
      return { id: it.productId, name: it.name, qty, price, total: Math.round(qty * price), priceConfirmed: false };
    });
    const freight = items.reduce((s, i) => s + i.total, 0);
    const c = (custs || []).find(x => x.id === custId) || {};
    const code = await nextOrderCode();
    const order = {
      code, order_date: viDate(now), customer_id: custId, cust_name: custName,
      drop_addr: c.address || '', items, freight, cod: 0, pay_by: 'Công nợ',
      status: 'new', wh_status: '', staff: row.staff_owner || row.staffOwner || '',
      deliver_date: tomISO,
      notes: `${tag} cho ngày ${tomISO}${row.deliver_at ? ' · Giao ' + row.deliver_at : ''}`,
    };
    const { error } = await sb.from('orders').insert(order);
    if (error) { console.warn(`  lỗi tạo đơn ${row.id}:`, error.message); continue; }
    await sb.from('recurring_orders').update({ last_run: tomISO, next_run: tomISO }).eq('id', row.id);
    created.push({ code, cust: custName, n: items.length, kg: items.reduce((s, i) => s + i.qty, 0) });
    console.log(`  ✓ tạo ${code} cho ${custName} (${items.length} mã)`);
  }

  if (created.length) {
    const msg = `🔁 ĐƠN ĐỊNH KỲ — tự tạo ${created.length} đơn cho NGÀY MAI (${tomISO}):\n`
      + created.map(o => `• ${o.code} · ${o.cust} · ${o.n} mã · ${o.kg}kg`).join('\n')
      + `\n\n👉 Sale kiểm tra + xác nhận. Khách báo DỪNG → vào Đơn định kỳ bấm ⏸ Tạm dừng.`;
    await tg(msg);
  } else {
    console.log('Không có mẫu nào đến lịch cho ngày mai.');
  }
  console.log(`Xong. Tạo ${created.length} đơn.`);
}

main().catch(e => { console.error('CRON LỖI:', e); process.exit(1); });
