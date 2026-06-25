/* =========================================================
   XOÁ ĐƠN CÔNG NỢ IMPORT theo NGÀY UP (created_at).
   - Mặc định DRY RUN: chỉ LIỆT KÊ, không xoá. Thêm CONFIRM=1 để xoá thật.
   - DAY=YYYY-MM-DD để chọn ngày up cần xoá (mặc định = ngày up gần nhất có đơn import).
   - Sau khi xoá đơn: xoá luôn KH source='import-phiếu' không còn đơn nào tham chiếu.
   Chạy:  node cron/del-congno-today.mjs            (xem trước)
          CONFIRM=1 node cron/del-congno-today.mjs  (xoá thật)
          CONFIRM=1 DAY=2026-06-25 node cron/del-congno-today.mjs
   ========================================================= */
const URL = 'https://edhyvdstmewshurxucka.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkaHl2ZHN0bWV3c2h1cnh1Y2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDI4MDYsImV4cCI6MjA5NTUxODgwNn0.WXOLLLkyrLPRAOnAu_4tgFL4KJ-S3ZKuOYePgWc_96I';
const h = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
const CONFIRM = process.env.CONFIRM === '1';
const DAY = process.env.DAY || '';

async function get(t, sel) { const r = await fetch(`${URL}/rest/v1/${t}?select=${sel}`, { headers: h }); if (!r.ok) throw new Error(t + ' ' + r.status + ' ' + (await r.text()).slice(0, 200)); return r.json(); }

const orders = await get('orders', 'code,notes,status,created_at,cust_name,customer_id,drop_addr,freight');
/* đơn nhập từ phiếu Excel nhận diện qua ghi chú (cloud không có cột source) */
const imp = orders.filter(o => (o.notes || '').includes('Nhập từ phiếu'));
const byDay = {}; imp.forEach(o => { const d = (o.created_at || '').slice(0, 10); (byDay[d] = byDay[d] || []).push(o); });
const days = Object.keys(byDay).sort().reverse();
console.log('Đơn import theo ngày up (created_at):');
days.forEach(d => console.log(`  ${d}: ${byDay[d].length} đơn · ${byDay[d].reduce((s, o) => s + (+o.freight || 0), 0).toLocaleString('vi-VN')}đ`));

const target = DAY || days[0];
if (!target || !byDay[target]) { console.log('\nKhông có đơn import cho ngày', target); process.exit(0); }
const victims = byDay[target];
console.log(`\n>>> NGÀY XOÁ: ${target} — ${victims.length} đơn:`);
victims.forEach(o => console.log(`   ${o.code} · ${o.cust_name} · ${o.drop_addr || '—'} · ${(+o.freight || 0).toLocaleString('vi-VN')}đ`));

if (!CONFIRM) { console.log('\n[DRY RUN] Thêm CONFIRM=1 để xoá thật.'); process.exit(0); }

let del = 0;
for (const o of victims) {
  const r = await fetch(`${URL}/rest/v1/orders?code=eq.${encodeURIComponent(o.code)}`, { method: 'DELETE', headers: h });
  if (r.ok) del++; else console.log('  ✗ lỗi xoá', o.code, r.status);
}
console.log(`\n✓ Đã xoá ${del}/${victims.length} đơn.`);

/* Xoá KH import không còn đơn nào */
const remain = (await get('orders', 'customer_id')).map(o => o.customer_id);
const remainSet = new Set(remain);
const custs = await get('customers', 'id,name,source,created');
const orphan = custs.filter(c => c.source === 'import-phiếu' && !remainSet.has(c.id));
console.log(`\nKH import mồ côi (không còn đơn): ${orphan.length}`);
let dc = 0;
for (const c of orphan) {
  const r = await fetch(`${URL}/rest/v1/customers?id=eq.${encodeURIComponent(c.id)}`, { method: 'DELETE', headers: h });
  if (r.ok) { dc++; console.log('  - xoá KH', c.id, c.name); } else console.log('  ✗ lỗi xoá KH', c.id, r.status);
}
console.log(`✓ Đã xoá ${dc} KH mồ côi. XONG — mở app reload để doanh thu/công nợ tính lại.`);
