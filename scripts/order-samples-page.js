/* =========================================================
   Trang "Mẫu đơn AI — nhớ nét chữ KH"
   Liệt kê mẫu (ảnh + kết quả) theo KH · xem to · xoá.
   ========================================================= */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  let _all = [];

  function custName(custId) {
    const c = (window.STORE.get('customers', []) || []).find(x => x.id === custId);
    return c ? c.name : (custId || '—');
  }

  function renderStats() {
    const host = document.getElementById('osStats');
    const custs = new Set(_all.map(s => s.custId));
    const card = (n, lab, clr) => `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 16px;min-width:130px">
      <div style="font-size:22px;font-weight:800;color:${clr}">${n}</div><div style="font-size:11.5px;color:var(--muted)">${lab}</div></div>`;
    host.innerHTML = card(_all.length, 'Tổng mẫu đã học', 'var(--navy)') + card(custs.size, 'KH có mẫu', '#15803D');
  }

  function buildFilter() {
    const sel = document.getElementById('osFilter');
    const byCust = {};
    _all.forEach(s => { byCust[s.custId] = (byCust[s.custId] || 0) + 1; });
    const cur = new URLSearchParams(location.search).get('cust') || '';
    sel.innerHTML = `<option value="">— Tất cả KH (${_all.length} mẫu) —</option>` +
      Object.keys(byCust).sort((a, b) => byCust[b] - byCust[a])
        .map(cid => `<option value="${esc(cid)}" ${cid === cur ? 'selected' : ''}>${esc(custName(cid))} (${byCust[cid]})</option>`).join('');
    sel.onchange = () => render(sel.value);
  }

  function render(filterCust) {
    const host = document.getElementById('osHost');
    let list = _all.slice();
    if (filterCust) list = list.filter(s => s.custId === filterCust);
    if (!list.length) {
      host.innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:40px;text-align:center;color:var(--muted)">
        Chưa có mẫu nào.<br>Vào <b>Đơn hàng → Tạo đơn</b>, chọn KH, bấm <b>📷 Từ ảnh</b> đọc đơn rồi lưu → mẫu sẽ tự xuất hiện ở đây.</div>`;
      return;
    }
    /* nhóm theo KH */
    const groups = {};
    list.forEach(s => { (groups[s.custId] = groups[s.custId] || []).push(s); });
    host.innerHTML = Object.keys(groups).map(cid => {
      const samples = groups[cid];
      return `<div style="margin-bottom:18px">
        <h3 style="font-size:14px;color:var(--navy);margin:0 0 8px;font-weight:800">👤 ${esc(custName(cid))} <span style="font-weight:400;color:var(--muted);font-size:12px">· ${samples.length} mẫu nét chữ</span></h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
          ${samples.map(s => `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden">
            <img src="data:${s.mime};base64,${s.b64}" style="width:100%;height:170px;object-fit:cover;cursor:zoom-in;background:#F8FAFC" onclick="window._osZoom('${s.id}')">
            <div style="padding:10px 12px">
              <div style="font-size:11px;color:var(--muted);margin-bottom:4px">📅 ${esc(s.date)}</div>
              <div style="font-size:12px;line-height:1.5"><b style="color:#15803D">Kết quả đúng:</b><br>${(s.finalItems || []).map(it => esc(it.name) + ' <b>' + esc(it.qty) + '</b>').join(' · ') || '<i style="color:var(--muted)">—</i>'}</div>
              ${(s.rawItems && s.rawItems.length) ? `<div style="font-size:10.5px;color:var(--muted);margin-top:4px">AI đọc thô ban đầu: ${(s.rawItems || []).map(it => esc(it.name) + ' ' + esc(it.qty)).join(', ')}</div>` : ''}
              <button class="btn btn-ghost btn-sm" style="color:var(--danger);margin-top:8px;font-size:11px" onclick="window._osDel('${s.id}')">✕ Xoá mẫu</button>
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }

  window._osZoom = function (id) {
    const s = _all.find(x => x.id === id); if (!s) return;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200000;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px';
    ov.onclick = () => ov.remove();
    ov.innerHTML = `<img src="data:${s.mime};base64,${s.b64}" style="max-width:96vw;max-height:92vh;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,.5)">`;
    document.body.appendChild(ov);
  };

  window._osDel = async function (id) {
    if (!confirm('Xoá mẫu nét chữ này? AI sẽ không dùng mẫu này nữa.')) return;
    try { await window.OrderSamples.delete(id); } catch (e) {}
    _all = _all.filter(s => s.id !== id);
    renderStats(); buildFilter();
    render(document.getElementById('osFilter').value);
    window.toast && window.toast('Đã xoá mẫu', 'info');
  };

  async function init() {
    if (window.renderAppShell) window.renderAppShell('order-samples', 'Mẫu đơn AI — nhớ nét chữ');
    if (!window.OrderSamples) { document.getElementById('osHost').innerHTML = '<div style="padding:30px;text-align:center;color:var(--danger)">Module OrderSamples chưa tải.</div>'; return; }
    try { _all = await window.OrderSamples.all(); } catch (e) { _all = []; }
    renderStats(); buildFilter();
    render(new URLSearchParams(location.search).get('cust') || '');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
