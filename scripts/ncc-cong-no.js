/* Bảng công nợ PHẢI TRẢ nhà cung cấp — song song "Công nợ tổng hợp (CFO)" nhưng cho NCC.
   Nguồn: suppliers.debt (markReceived cộng khi mua NCC; ncdPay/paySupplier trừ)
   + purchases (phiếu đã nhận: tổng nhập, đã trả, còn nợ, xổ ra từng phiếu).
   Tab trong Tài chính (finance.html nhúng ?embed=1). */
(function () {
  const S = () => window.STORE;
  const getSup = () => (S().get('suppliers', window.SUPPLIERS || []) || []);
  const getPur = () => (S().get('purchases', window.PURCHASES || []) || []);
  const fmt = v => (window.fmt ? window.fmt(v) : String(v || 0));
  const escH = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const typeOf = id => ((S().get('supplierMeta', {}) || {})[id] || {}).type || '';
  const _open = new Set();   /* NCC đang xổ chi tiết phiếu */

  /* Gom số liệu theo NCC: tổng nhập (phiếu đã nhận), đã trả, còn nợ, danh sách phiếu */
  function rows() {
    const purBySup = {};
    getPur().forEach(p => {
      if (p.status !== 'received') return;
      (purBySup[p.supplierId] = purBySup[p.supplierId] || []).push(p);
    });
    return getSup().map(s => {
      const ps = purBySup[s.id] || [];
      const nhap = ps.reduce((a, p) => a + (+p.total || 0), 0);
      const traPhieu = ps.reduce((a, p) => a + (+p.paid || 0), 0);
      const debt = +s.debt || 0;
      const nUnpaid = ps.filter(p => (+p.total || 0) - (+p.paid || 0) > 0.5).length;
      return { id: s.id, name: s.name, phone: s.phone || '', type: typeOf(s.id), debt, nhap, tra: traPhieu, nUnpaid, phieu: ps };
    }).filter(r => r.debt > 0.5).sort((a, b) => b.debt - a.debt);
  }

  window.ncdRender = function () {
    const all = rows();
    const q = ((document.getElementById('ncdSearch') || {}).value || '').toLowerCase().trim();
    const ty = (document.getElementById('ncdType') || {}).value || '';
    let list = all;
    if (ty) list = list.filter(r => r.type === ty || r.type === 'both');
    if (q) list = list.filter(r => (r.name + ' ' + r.phone).toLowerCase().includes(q));

    const totDebt = all.reduce((s, r) => s + r.debt, 0);
    const totNhap = all.reduce((s, r) => s + r.nhap, 0);
    const nUnpaidTot = all.reduce((s, r) => s + r.nUnpaid, 0);
    const sm = document.getElementById('ncdSummary');
    if (sm) sm.innerHTML =
      kpi('🔴 Tổng phải trả NCC', fmt(totDebt) + ' ₫', '#DC2626') +
      kpi('Số NCC đang nợ', String(all.length), 'var(--navy)') +
      kpi('Tổng đã nhập (phiếu)', fmt(totNhap) + ' ₫', 'var(--navy)') +
      kpi('Số phiếu chưa trả', String(nUnpaidTot), 'var(--navy)');

    const tb = document.getElementById('ncdTable');
    if (!tb) return;
    if (!all.length) {
      tb.innerHTML = `<div style="padding:34px;text-align:center;color:var(--muted);font-size:13px;line-height:1.6">
        ✓ Chưa có NCC nào đang nợ.<br><span style="font-size:12px">Công nợ NCC hình thành khi <b>nhận hàng NCC</b> ở Phiếu nhập (Gom hàng → Chốt → phiếu nhập → điền giá → ✓ Đã nhận). Thu mua ngoài trả tiền mặt ngay nên không tạo nợ.</span></div>`;
      return;
    }
    if (!list.length) { tb.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted)">Không khớp bộ lọc.</div>`; return; }

    tb.innerHTML = `<table class="ncd-tbl"><thead><tr>
        <th style="width:26px"></th>
        <th>Nhà cung cấp</th><th class="hide-xs">SĐT</th><th class="hide-xs">Loại</th>
        <th class="num hide-xs">Tổng nhập</th><th class="num hide-xs">Đã trả</th>
        <th class="num">Còn nợ</th><th></th>
      </tr></thead><tbody>
      ${list.map(r => {
        const op = _open.has(r.id);
        const detail = op ? `<tr class="ncd-detail"><td></td><td colspan="7" style="background:#FAFBFC;padding:8px 12px">
          <div style="font-size:11.5px;color:var(--muted);margin-bottom:5px">Phiếu nhập đã nhận của ${escH(r.name)} (${r.phieu.length}):</div>
          ${r.phieu.length ? r.phieu.slice().reverse().map(p => { const due = (+p.total || 0) - (+p.paid || 0);
            return `<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px dashed #E5E7EB;font-size:12px">
              <span><b style="font-family:monospace">${escH(p.id)}</b> · ${escH(p.date)}${p.invoiceNo ? ' · HĐ ' + escH(p.invoiceNo) : ''}</span>
              <span>${fmt(p.total)}₫ · <span style="color:${due > 0.5 ? '#DC2626' : 'var(--ok)'}">${due > 0.5 ? 'nợ ' + fmt(due) + '₫' : '✓ đã trả'}</span></span>
            </div>`; }).join('') : '<div style="font-size:12px;color:var(--muted)">—</div>'}
        </td></tr>` : '';
        return `<tr>
          <td style="cursor:pointer;text-align:center;color:#64748B" onclick="window.ncdToggle('${r.id}')">${op ? '▾' : '▸'}</td>
          <td style="cursor:pointer" onclick="window.ncdToggle('${r.id}')"><b>${escH(r.name)}</b><div style="font-size:11px;color:var(--muted)">${r.id}${r.nUnpaid ? ' · ' + r.nUnpaid + ' phiếu chưa trả' : ''}</div></td>
          <td class="hide-xs">${escH(r.phone) || '—'}</td>
          <td class="hide-xs">${r.type === 'si' ? '📦 Sỉ' : r.type === 'le' ? '🛵 Lẻ' : r.type === 'both' ? 'Cả hai' : '—'}</td>
          <td class="num hide-xs">${fmt(r.nhap)}</td>
          <td class="num hide-xs" style="color:var(--ok)">${r.tra ? fmt(r.tra) : '·'}</td>
          <td class="num" style="color:#DC2626;font-weight:800;white-space:nowrap">${fmt(r.debt)} ₫</td>
          <td class="num"><button class="btn btn-ghost btn-sm" style="color:var(--ok);white-space:nowrap" onclick="window.ncdPay('${r.id}')">💰 Trả nợ</button></td>
        </tr>${detail}`;
      }).join('')}
      <tr style="background:#FEF2F2;font-weight:800"><td></td><td colspan="5" class="num" style="text-align:right">TỔNG PHẢI TRẢ</td><td class="num" style="color:#DC2626">${fmt(totDebt)} ₫</td><td></td></tr>
      </tbody></table>`;
  };

  window.ncdToggle = function (id) { if (_open.has(id)) _open.delete(id); else _open.add(id); window.ncdRender(); };

  function kpi(label, val, color) {
    return `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:13px 15px">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">${label}</div>
      <div style="font-size:20px;font-weight:800;color:${color};margin-top:3px">${val}</div></div>`;
  }

  /* Trả toàn bộ nợ 1 NCC → trừ nợ + đánh dấu phiếu NET đã nhận = đã trả + phiếu chi vào sổ quỹ */
  window.ncdPay = function (id) {
    const list = getSup(); const s = list.find(x => x.id === id);
    if (!s || !(+s.debt > 0)) return;
    if (!confirm(`Ghi thanh toán ${fmt(s.debt)} ₫ cho ${s.name}?`)) return;
    const amt = +s.debt || 0;
    s.debt = 0;
    S().set('suppliers', list);
    const pur = getPur(); let purChanged = false;
    pur.forEach(p => { if (p.supplierId === id && p.status === 'received' && (+p.total || 0) - (+p.paid || 0) > 0.5) { p.paid = p.total; purChanged = true; } });
    if (purChanged) S().set('purchases', pur);
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
    S().get('purchases'); S().get('suppliers');   /* warm-load */
    S().subscribe('suppliers', window.ncdRender);
    S().subscribe('purchases', window.ncdRender);
  }
  window.ncdRender();
})();
