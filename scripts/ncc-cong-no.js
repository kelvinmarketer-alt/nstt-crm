/* Bảng công nợ phải trả NCC — tương tự "Công nợ tổng hợp" nhưng cho nhà cung cấp.
   Nguồn: suppliers.debt (markReceived cộng khi NET, paySupplier trừ) + purchases (đếm phiếu chưa trả).
   Tab trong Tài chính (finance.html nhúng ?embed=1). */
(function () {
  const S = () => window.STORE;
  const getSup = () => (S().get('suppliers', window.SUPPLIERS || []) || []);
  const getPur = () => (S().get('purchases', window.PURCHASES || []) || []);
  const fmt = v => (window.fmt ? window.fmt(v) : String(v));
  const escH = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const meta = () => (S().get('supplierMeta', {}) || {});
  const typeOf = id => (meta()[id] || {}).type || '';

  function rows() {
    const pur = getPur();
    const unpaidBy = {};
    pur.forEach(p => {
      const due = (+p.total || 0) - (+p.paid || 0);
      if (p.status === 'received' && due > 0.5) unpaidBy[p.supplierId] = (unpaidBy[p.supplierId] || 0) + 1;
    });
    return getSup()
      .filter(s => (+s.debt || 0) > 0.5)
      .map(s => ({ id: s.id, name: s.name, phone: s.phone || '', debt: +s.debt || 0, type: typeOf(s.id), nUnpaid: unpaidBy[s.id] || 0 }))
      .sort((a, b) => b.debt - a.debt);
  }

  window.ncdRender = function () {
    const all = rows();
    const q = (document.getElementById('ncdSearch') && document.getElementById('ncdSearch').value || '').toLowerCase().trim();
    const ty = (document.getElementById('ncdType') && document.getElementById('ncdType').value) || '';
    let list = all;
    if (ty) list = list.filter(r => (r.type || 'le') === ty || (ty === 'le' && r.type === 'both') || (ty === 'si' && r.type === 'both'));
    if (q) list = list.filter(r => (r.name + ' ' + r.phone).toLowerCase().includes(q));

    const total = all.reduce((s, r) => s + r.debt, 0);
    const nUnpaidTotal = all.reduce((s, r) => s + r.nUnpaid, 0);
    const sm = document.getElementById('ncdSummary');
    if (sm) sm.innerHTML =
      kpi('Tổng phải trả NCC', fmt(total) + ' ₫', '#DC2626') +
      kpi('Số NCC đang nợ', String(all.length), 'var(--navy)') +
      kpi('Số phiếu chưa trả', String(nUnpaidTotal), 'var(--navy)');

    const tb = document.getElementById('ncdTable');
    if (!tb) return;
    if (!list.length) {
      tb.innerHTML = `<div style="padding:34px;text-align:center;color:var(--muted);font-size:13px">${all.length ? 'Không khớp bộ lọc.' : '✓ Không có NCC nào đang nợ.'}</div>`;
      return;
    }
    tb.innerHTML = `<table class="ncd-tbl"><thead><tr>
        <th>Nhà cung cấp</th><th class="hide-xs">SĐT</th><th class="hide-xs">Loại</th>
        <th class="num hide-xs">Phiếu chưa trả</th><th class="num">Công nợ phải trả</th><th></th>
      </tr></thead><tbody>
      ${list.map(r => `<tr>
        <td><b>${escH(r.name)}</b><div style="font-size:11px;color:var(--muted)">${r.id}</div></td>
        <td class="hide-xs">${escH(r.phone) || '—'}</td>
        <td class="hide-xs">${r.type === 'si' ? '📦 Sỉ' : r.type === 'le' ? '🛵 Lẻ' : r.type === 'both' ? 'Cả hai' : '—'}</td>
        <td class="num hide-xs">${r.nUnpaid || '—'}</td>
        <td class="num" style="color:#DC2626;font-weight:800;white-space:nowrap">${fmt(r.debt)} ₫</td>
        <td class="num"><button class="btn btn-ghost btn-sm" style="color:var(--ok);white-space:nowrap" onclick="window.ncdPay('${r.id}')">💰 Ghi thanh toán</button></td>
      </tr>`).join('')}
      <tr style="background:#FAFBFC;font-weight:800"><td colspan="4" class="num" style="text-align:right">TỔNG PHẢI TRẢ</td><td class="num" style="color:#DC2626">${fmt(total)} ₫</td><td></td></tr>
      </tbody></table>`;
  };

  function kpi(label, val, color) {
    return `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:13px 15px">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">${label}</div>
      <div style="font-size:21px;font-weight:800;color:${color};margin-top:3px">${val}</div></div>`;
  }

  /* Ghi thanh toán toàn bộ nợ 1 NCC → trừ nợ + phiếu chi vào sổ quỹ (giống paySupplier bên suppliers.js) */
  window.ncdPay = function (id) {
    const list = getSup(); const s = list.find(x => x.id === id);
    if (!s || !(+s.debt > 0)) return;
    if (!confirm(`Ghi thanh toán ${fmt(s.debt)} ₫ cho ${s.name}?`)) return;
    const amt = +s.debt || 0;
    s.debt = 0;
    S().set('suppliers', list);
    const cash = S().get('cashEntries', []) || [];
    const pcMax = cash.reduce((m, e) => { const n = parseInt(String(e.no || '').replace(/^PC/, ''), 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
    cash.unshift({
      no: 'PC' + String(pcMax + 1).padStart(4, '0'),
      date: (window.todayVN ? window.todayVN() : new Date().toLocaleDateString('vi-VN')),
      type: 'out', amount: amt, account: 'Tiền mặt', party: s.name,
      desc: 'Thanh toán công nợ NCC ' + s.id,
    });
    S().set('cashEntries', cash);
    if (window.audit) window.audit.log('supplier.pay', `Trả ${fmt(amt)} ₫ cho ${s.name}`);
    window.toast && window.toast('✓ Đã ghi phiếu chi ' + fmt(amt) + ' ₫', 'success');
    window.ncdRender();
  };

  /* Init */
  if (window.renderAppShell) window.renderAppShell('finance', 'Công nợ NCC');
  if (window.STORE) {
    S().subscribe('suppliers', window.ncdRender);
    S().subscribe('purchases', window.ncdRender);
  }
  window.ncdRender();
})();
