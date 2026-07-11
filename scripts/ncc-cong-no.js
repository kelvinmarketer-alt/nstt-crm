/* Công nợ PHẢI TRẢ nhà cung cấp — MA TRẬN NCC × ngày, khuôn giống "Công nợ tổng hợp (CFO)".
   Nguồn: phiếu nhập ĐÃ NHẬN (phát sinh theo ngày) + phiếu chi (đã trả) + suppliers.debt (công nợ HT).
   Phục vụ quyết toán NCC theo tháng. Tab trong Tài chính (finance.html nhúng ?embed=1). */
(function () {
  const S = () => window.STORE;
  const getSup = () => (S().get('suppliers', window.SUPPLIERS || []) || []);
  const getPur = () => (S().get('purchases', window.PURCHASES || []) || []);
  const escH = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const typeOf = id => ((S().get('supplierMeta', {}) || {})[id] || {}).type || '';
  const _nk = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  let _last = null, _q = '';

  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ddmm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
  function dmyToISO(dmy) { const m = String(dmy || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : ''; }
  function dayList(fromISO, toISO) {
    const out = []; if (!fromISO || !toISO) return out;
    let d = new Date(fromISO + 'T00:00:00'); const end = new Date(toISO + 'T00:00:00'); let g = 0;
    while (d <= end && g++ < 400) { out.push(isoOf(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  /* Phiếu chi cho NCC này: khớp party = tên NCC (payPur/ncdPay/paySupplier đều set party=tên NCC) hoặc desc chứa id */
  const cashForSup = (e, r) => e && e.type === 'out' && (e.party === r.name || (e.desc && String(e.desc).includes(r.key)));

  function build(fromISO, toISO) {
    const sups = getSup(); const byId = {}; sups.forEach(s => byId[s.id] = s);
    const cash = S().get('cashEntries', []) || [];
    const days = dayList(fromISO, toISO); const daySet = new Set(days);
    const rows = {};
    getPur().forEach(p => {
      if (p.status !== 'received') return;
      if (p.supplierId === 'EXT-MARKET' || (byId[p.supplierId] || {}).system) return;   /* thu mua ngoài = tiền mặt, bỏ */
      const iso = dmyToISO(p.date); if (!daySet.has(iso)) return;
      const amt = +p.total || 0; if (!amt) return;
      const s = byId[p.supplierId] || {};
      const r = rows[p.supplierId] || (rows[p.supplierId] = { key: p.supplierId, name: s.name || p.supplierId, phone: s.phone || '', type: typeOf(p.supplierId), daily: {}, total: 0 });
      r.daily[iso] = (r.daily[iso] || 0) + amt; r.total += amt;
    });
    Object.values(rows).forEach(r => {
      r.paid = cash.filter(e => daySet.has(dmyToISO(e.date)) && cashForSup(e, r)).reduce((s, e) => s + (+e.amount || 0), 0);
      r.remain = r.total - r.paid;
      r.debtNow = (byId[r.key] && +byId[r.key].debt) || 0;
    });
    return { days, list: Object.values(rows).sort((a, b) => b.total - a.total) };
  }

  window.ncdSearch = function (v) { _q = (v || '').trim(); window.ncdRender(); };

  window.ncdRender = function () {
    const tbl = document.getElementById('ncdTable'); if (!tbl) return;
    const fromISO = (document.getElementById('ncdFrom') || {}).value;
    const toISO = (document.getElementById('ncdTo') || {}).value;
    if (!fromISO || !toISO) { tbl.innerHTML = `<tbody><tr><td style="padding:30px;text-align:center;color:var(--muted)">Chọn khoảng ngày rồi bấm "Xem báo cáo".</td></tr></tbody>`; return; }
    const data = build(fromISO, toISO);
    if (_q) data.list = data.list.filter(r => _nk(r.name).includes(_nk(_q)));
    _last = { ...data, fromISO, toISO };
    const unit = +((document.getElementById('ncdUnit') || {}).value) || 1;
    const fmtU = v => { const n = v / unit; return n ? (unit === 1 ? Math.round(n).toLocaleString('vi-VN') : (Math.round(n * 10) / 10).toLocaleString('vi-VN')) : ''; };

    const sm = document.getElementById('ncdSummary');
    if (!data.list.length) {
      tbl.innerHTML = `<tbody><tr><td style="padding:30px;text-align:center;color:var(--muted)">Không có phiếu nhập NCC (đã nhận) trong ${ddmm(fromISO)}–${ddmm(toISO)}.<br><span style="font-size:12px">Công nợ NCC hình thành khi <b>nhận hàng NCC</b> ở Phiếu nhập (Gom hàng → Chốt → điền giá → ✓ Đã nhận).</span></td></tr></tbody>`;
      if (sm) sm.textContent = ''; return;
    }
    const colTot = {}; data.days.forEach(d => colTot[d] = 0);
    let gPS = 0, gPaid = 0, gRemain = 0, gDebt = 0;
    data.list.forEach(r => { data.days.forEach(d => colTot[d] += (r.daily[d] || 0)); gPS += r.total; gPaid += r.paid; gRemain += r.remain; gDebt += r.debtNow; });

    const head = `<thead><tr>
      <th class="par">NHÀ CUNG CẤP (${data.list.length})</th>
      ${data.days.map(d => `<th class="num">${ddmm(d)}</th>`).join('')}
      <th class="num" style="background:#DCFCE7">TỔNG NHẬP</th>
      <th class="num" style="background:#DBEAFE">ĐÃ TRẢ</th>
      <th class="num" style="background:#FEF3C7">CHƯA TRẢ</th>
      <th class="num" style="background:#FEE2E2">CÔNG NỢ HT</th>
    </tr></thead>`;
    const body = `<tbody>${data.list.map(r => `<tr>
      <td class="par" title="Bấm để ghi thanh toán công nợ NCC"><a href="javascript:void(0)" onclick="window.ncdPay('${r.key}')" style="color:var(--navy);font-weight:700;text-decoration:none;border-bottom:1px dotted var(--navy)">${escH(r.name)}</a></td>
      ${data.days.map(d => { const v = r.daily[d] || 0; return `<td class="num ${v ? '' : 'z'}">${v ? fmtU(v) : '·'}</td>`; }).join('')}
      <td class="num"><b>${fmtU(r.total)}</b></td>
      <td class="num cn-paid">${r.paid ? fmtU(r.paid) : '·'}</td>
      <td class="num cn-owe">${r.remain ? fmtU(r.remain) : '·'}</td>
      <td class="num" style="font-weight:800;color:#DC2626">${r.debtNow ? fmtU(r.debtNow) : '·'}</td>
    </tr>`).join('')}</tbody>`;
    const foot = `<tfoot><tr>
      <td class="par">TỔNG CỘNG</td>
      ${data.days.map(d => `<td class="num">${colTot[d] ? fmtU(colTot[d]) : '·'}</td>`).join('')}
      <td class="num">${fmtU(gPS)}</td><td class="num">${fmtU(gPaid)}</td><td class="num">${fmtU(gRemain)}</td><td class="num">${fmtU(gDebt)}</td>
    </tr></tfoot>`;
    tbl.innerHTML = head + body + foot;

    const dvi = unit === 1 ? 'đồng' : 'nghìn đồng';
    if (sm) sm.innerHTML =
      `📅 <b>${ddmm(fromISO)} → ${ddmm(toISO)}</b> · ${data.days.length} ngày · ${data.list.length} NCC · đơn vị: <b>${dvi}</b><br>` +
      `🧾 Tổng nhập <b>${gPS.toLocaleString('vi-VN')}đ</b> · đã trả <b style="color:#16A34A">${gPaid.toLocaleString('vi-VN')}đ</b> · 🔴 công nợ phải trả hiện tại <b style="color:#DC2626">${gDebt.toLocaleString('vi-VN')}đ</b>`;
  };

  window.ncdPreset = function (kind) {
    const now = window.todayDate ? window.todayDate() : new Date();
    const y = now.getFullYear(), m = now.getMonth(); let from, to;
    if (kind === 'k1') { from = new Date(y, m, 1); to = new Date(y, m, 15); }
    else if (kind === 'k2') { from = new Date(y, m, 16); to = new Date(y, m + 1, 0); }
    else if (kind === 'prev') { from = new Date(y, m - 1, 1); to = new Date(y, m, 0); }
    else { from = new Date(y, m, 1); to = new Date(y, m + 1, 0); }   /* month */
    document.getElementById('ncdFrom').value = isoOf(from);
    document.getElementById('ncdTo').value = isoOf(to);
    window.ncdRender();
  };

  window.ncdExport = function () {
    if (!window.XLSX) { window.toast && window.toast('Chưa tải thư viện Excel — reload trang', 'warn'); return; }
    if (!_last || !_last.list.length) { window.toast && window.toast('Chưa có dữ liệu — bấm "Xem báo cáo" trước', 'warn'); return; }
    const unit = +((document.getElementById('ncdUnit') || {}).value) || 1;
    const r1 = v => unit === 1 ? Math.round(v) : Math.round(v / unit * 10) / 10;
    const { days, list, fromISO, toISO } = _last;
    const aoa = [[`CÔNG NỢ NHÀ CUNG CẤP · ${ddmm(fromISO)} → ${ddmm(toISO)} · đơn vị: ${unit === 1 ? 'đồng' : 'nghìn đồng'}`]];
    aoa.push(['NHÀ CUNG CẤP', ...days.map(ddmm), 'TỔNG NHẬP', 'ĐÃ TRẢ', 'CHƯA TRẢ', 'CÔNG NỢ HT']);
    const colTot = {}; days.forEach(d => colTot[d] = 0); let gPS = 0, gPaid = 0, gRem = 0, gDebt = 0;
    list.forEach(r => {
      const row = [r.name];
      days.forEach(d => { const v = r.daily[d] || 0; colTot[d] += v; row.push(v ? r1(v) : ''); });
      row.push(r1(r.total), r1(r.paid), r1(r.remain), r1(r.debtNow));
      gPS += r.total; gPaid += r.paid; gRem += r.remain; gDebt += r.debtNow; aoa.push(row);
    });
    aoa.push(['TỔNG CỘNG', ...days.map(d => colTot[d] ? r1(colTot[d]) : ''), r1(gPS), r1(gPaid), r1(gRem), r1(gDebt)]);
    const ws = window.XLSX.utils.aoa_to_sheet(aoa); const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'CongNoNCC');
    window.XLSX.writeFile(wb, `cong-no-ncc-${fromISO}_${toISO}.xlsx`);
  };

  /* Ghi thanh toán toàn bộ nợ 1 NCC → trừ nợ + đánh dấu phiếu đã nhận = đã trả + phiếu chi vào sổ quỹ */
  window.ncdPay = function (id) {
    const list = getSup(); const s = list.find(x => x.id === id);
    if (!s || !(+s.debt > 0)) { window.toast && window.toast('NCC này không còn nợ', 'info'); return; }
    if (!confirm(`Ghi thanh toán ${window.fmt(s.debt)} ₫ cho ${s.name}?`)) return;
    const amt = +s.debt || 0;
    s.debt = 0;
    S().set('suppliers', list);
    const pur = getPur(); let purCh = false;
    pur.forEach(p => { if (p.supplierId === id && p.status === 'received' && (+p.total || 0) - (+p.paid || 0) > 0.5) { p.paid = p.total; purCh = true; } });
    if (purCh) S().set('purchases', pur);
    const cash = S().get('cashEntries', []) || [];
    const pcMax = cash.reduce((m, e) => { const n = parseInt(String(e.no || '').replace(/^PC/, ''), 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
    cash.unshift({
      no: 'PC' + String(pcMax + 1).padStart(4, '0'),
      date: (window.todayVN ? window.todayVN() : new Date().toLocaleDateString('vi-VN')),
      type: 'out', amount: amt, account: 'Tiền mặt', party: s.name,
      desc: 'Thanh toán công nợ NCC ' + s.id,
    });
    S().set('cashEntries', cash);
    if (window.audit) window.audit.log('supplier.pay', `Trả ${window.fmt(amt)} ₫ cho ${s.name}`);
    window.toast && window.toast('✓ Đã ghi phiếu chi ' + window.fmt(amt) + ' ₫', 'success');
    window.ncdRender();
  };

  /* Init */
  if (window.renderAppShell) window.renderAppShell('ncc-debt', 'Công nợ NCC');
  if (window.STORE) {
    S().get('purchases'); S().get('suppliers'); S().get('cashEntries');   /* warm-load */
    S().subscribe('suppliers', window.ncdRender);
    S().subscribe('purchases', window.ncdRender);
    S().subscribe('cashEntries', window.ncdRender);
  }
  window.ncdPreset('month');   /* mặc định: tháng này + tự render */
})();
