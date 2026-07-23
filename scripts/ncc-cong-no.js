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
      <td class="par" title="Bấm để xem bản đối chiếu công nợ — in / copy gửi NCC"><a href="javascript:void(0)" onclick="window.ncdStatement('${r.key}')" style="color:var(--navy);font-weight:700;text-decoration:none;border-bottom:1px dotted var(--navy)">${escH(r.name)}</a></td>
      ${data.days.map(d => { const v = r.daily[d] || 0; return `<td class="num ${v ? '' : 'z'}">${v ? `<a href="javascript:void(0)" onclick="window.ncdDayDetail('${r.key}','${d}')" style="color:var(--navy);text-decoration:none;border-bottom:1px dotted #94A3B8" title="Xem chi tiết mã hàng / phiếu / đơn ngày này">${fmtU(v)}</a>` : '·'}</td>`; }).join('')}
      <td class="num"><b>${fmtU(r.total)}</b></td>
      <td class="num cn-paid">${r.paid ? fmtU(r.paid) : '·'}</td>
      <td class="num cn-owe">${r.remain ? fmtU(r.remain) : '·'}</td>
      <td class="num" style="font-weight:800;color:#DC2626">${r.debtNow ? `<a href="javascript:void(0)" onclick="window.ncdPay('${r.key}')" title="Bấm để ghi thanh toán công nợ NCC" style="color:#DC2626;text-decoration:none;border-bottom:1px dotted #DC2626">${fmtU(r.debtNow)}</a>` : '·'}</td>
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

  /* ===== Thanh toán công nợ NCC — popup nhập số tiền (trả 1 phần / trả hết) ===== */
  window.ncdPay = function (id) {
    const s = getSup().find(x => x.id === id);
    if (!s || !(+s.debt > 0)) { window.toast && window.toast('NCC này không còn nợ', 'info'); return; }
    const debt = +s.debt || 0;
    const _i = 'width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:10px;font-size:16px;margin-top:4px';
    window.openModal('💵 Thanh toán công nợ — ' + escH(s.name), `
      <div style="font-size:13px;margin-bottom:10px">Đang nợ: <b style="color:#DC2626">${window.fmt(debt)}₫</b></div>
      <label style="font-size:12px;color:var(--muted)">Số tiền trả (₫)</label>
      <input id="ncdPayAmt" type="number" inputmode="numeric" value="${debt}" style="${_i}">
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('ncdPayAmt').value=${debt}">Trả hết</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('ncdPayAmt').value=${Math.round(debt / 2)}">Trả 50%</button>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:8px">Ghi phiếu chi (sổ quỹ tiền mặt) + trừ công nợ NCC. Trả 1 phần → trừ dần từ phiếu nhập cũ nhất.</div>
    `, { width: '420px', footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button><button class="btn btn-primary" onclick="window._ncdDoPay('${id}')">💵 Ghi thanh toán</button>` });
  };
  window._ncdDoPay = function (id) {
    const list = getSup(); const s = list.find(x => x.id === id); if (!s) return;
    const debt = +s.debt || 0;
    let amt = parseFloat(String((document.getElementById('ncdPayAmt') || {}).value || '').replace(/[^\d.]/g, '')) || 0;
    amt = Math.min(Math.max(0, Math.round(amt)), debt);
    if (!(amt > 0)) { window.toast && window.toast('Nhập số tiền > 0', 'warn'); return; }
    s.debt = Math.max(0, debt - amt);
    S().set('suppliers', list);
    /* FIFO: trừ dần vào phiếu received cũ nhất */
    const pur = getPur(); let rem = amt, purCh = false;
    pur.filter(p => p.supplierId === id && p.status === 'received').sort((a, b) => (dmyToISO(a.date) < dmyToISO(b.date) ? -1 : 1))
      .forEach(p => { const due = (+p.total || 0) - (+p.paid || 0); if (due > 0.5 && rem > 0.5) { const pay = Math.min(due, rem); p.paid = (+p.paid || 0) + pay; rem -= pay; purCh = true; } });
    if (purCh) S().set('purchases', pur);
    const cash = S().get('cashEntries', []) || [];
    const pcMax = cash.reduce((m, e) => { const n = parseInt(String(e.no || '').replace(/^PC/, ''), 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
    cash.unshift({
      no: 'PC' + String(pcMax + 1).padStart(4, '0'),
      date: (window.todayVN ? window.todayVN() : new Date().toLocaleDateString('vi-VN')),
      type: 'out', amount: amt, account: 'Tiền mặt', party: s.name, desc: 'Thanh toán công nợ NCC ' + s.id,
    });
    S().set('cashEntries', cash);
    if (window.audit) window.audit.log('supplier.pay', `Trả ${window.fmt(amt)} ₫ cho ${s.name}`);
    window.toast && window.toast('✓ Đã ghi phiếu chi ' + window.fmt(amt) + ' ₫' + (s.debt > 0 ? ' · còn nợ ' + window.fmt(s.debt) : ' · hết nợ'), 'success');
    window.closeModal && window.closeModal();
    window.ncdRender();
  };

  /* ===== Chi tiết công nợ 1 NGÀY của 1 NCC: mã hàng + mã phiếu + mã đơn (bấm → mở module) ===== */
  window.ncdDayDetail = function (supId, iso) {
    const sup = getSup().find(s => s.id === supId) || { name: supId };
    const runs = S().get('procurementRuns', []) || [];
    const phieu = getPur().filter(p => p.supplierId === supId && p.status === 'received' && dmyToISO(p.date) === iso).sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!phieu.length) { window.toast && window.toast('Không có phiếu nhập ngày này', 'info'); return; }
    const f = v => (Math.round(+v || 0)).toLocaleString('vi-VN');
    let dayTot = 0;
    const cards = phieu.map(p => {
      dayTot += +p.total || 0;
      const run = p.gomRunId ? runs.find(r => r.id === p.gomRunId) : null;
      const orderCodes = (run && Array.isArray(run.orderCodes)) ? run.orderCodes : [];
      const warn = (p.items || []).some(it => !(+it.price > 0) && ((+it.goodQty || +it.qty) > 0));
      const itemsHtml = (p.items || []).map(it => {
        const q = it.goodQty != null ? +it.goodQty : (+it.qty || 0); const pw = !(+it.price > 0);
        return `<tr style="border-top:1px solid #F1F5F9"><td style="padding:5px 8px">${escH(it.name)}</td><td style="padding:5px 8px;text-align:right">${q}${escH(it.unit || 'kg')}</td><td style="padding:5px 8px;text-align:right;${pw ? 'color:#B45309' : ''}">${pw ? '⚠ 0' : f(it.price)}</td><td style="padding:5px 8px;text-align:right;font-weight:600">${f(it.total)}</td></tr>`;
      }).join('');
      const ordHtml = orderCodes.length
        ? '🧾 Đi đơn: ' + orderCodes.map(c => `<a href="orders.html?open=${encodeURIComponent(c)}" target="_blank" style="color:var(--navy);border-bottom:1px dotted var(--navy);text-decoration:none">${escH(c)} ↗</a>`).join(', ')
        : '<span style="color:var(--muted)">(không gắn đơn — phiếu lẻ)</span>';
      return `<div style="border:1px solid var(--line);border-radius:10px;margin-bottom:12px;overflow:hidden">
        <div style="background:#F8FAF8;padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <a href="purchases.html?focus=${encodeURIComponent(p.id)}" target="_blank" style="font-weight:800;color:var(--navy);text-decoration:none;border-bottom:1px dotted var(--navy)">📦 ${escH(p.id)} ↗</a>
          ${warn ? '<span style="background:#FEF3C7;color:#B45309;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:99px">⚠ thiếu giá</span>' : ''}
          <div style="flex:1"></div><b style="color:#B91C1C">${f(p.total)}₫</b>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="color:var(--muted);font-size:10.5px;text-transform:uppercase"><th style="padding:4px 8px;text-align:left">Mã hàng</th><th style="padding:4px 8px;text-align:right">SL tốt</th><th style="padding:4px 8px;text-align:right">Giá nhập</th><th style="padding:4px 8px;text-align:right">Thành tiền</th></tr></thead><tbody>${itemsHtml}</tbody></table>
        <div style="padding:7px 12px;font-size:11.5px;border-top:1px solid #F1F5F9">${ordHtml}</div>
      </div>`;
    }).join('');
    window.openModal('📅 Chi tiết nhập ' + ddmm(iso) + ' — ' + escH(sup.name), `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Phiếu nhập <b>${escH(sup.name)}</b> ngày <b>${ddmm(iso)}</b>. Bấm <b>mã phiếu</b> / <b>mã đơn</b> để mở module tương ứng. Sửa công nợ: mở mã phiếu → <b>✏️ Sửa nợ</b>.</div>
      ${cards}
      <div style="text-align:right;font-size:14px;margin-top:6px">Tổng nhập ngày: <b style="color:#B91C1C">${f(dayTot)}₫</b></div>
    `, { width: '720px', footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>` });
  };

  /* ========== F1: ĐỐI CHIẾU CÔNG NỢ NCC (in / copy gửi NCC) ========== */
  const _invMap = () => (S().get('purchaseInvoices', {}) || {});
  const _inPeriod = (dmy, fromISO, toISO) => { const iso = dmyToISO(dmy); return iso && iso >= fromISO && iso <= toISO; };
  window.ncdStatement = function (id) {
    if (!_last) { window.toast && window.toast('Bấm "Xem báo cáo" trước', 'warn'); return; }
    const r = _last.list.find(x => x.key === id); if (!r) { window.toast && window.toast('Không thấy NCC', 'warn'); return; }
    const { fromISO, toISO } = _last;
    const s = getSup().find(x => x.id === id) || { name: r.name };
    const ci = S().get('companyInfo', {}) || {};
    const comp = { name: ci.name || 'CÔNG TY TNHH NÔNG SẢN TUẤN TÚ HÀ NỘI', address: ci.address || '36/147A Tân Mai, Hoàng Mai, Hà Nội', phone: ci.hotline || '0836 676 086' };
    const inv = _invMap();
    const phieu = getPur().filter(p => p.supplierId === id && p.status === 'received' && _inPeriod(p.date, fromISO, toISO))
      .sort((a, b) => (dmyToISO(a.date) < dmyToISO(b.date) ? -1 : 1));
    const f = v => (Math.round(+v || 0)).toLocaleString('vi-VN');
    let tN = 0, tT = 0;
    const rowsHtml = phieu.map((p, i) => { const nh = +p.total || 0, tr = +p.paid || 0; tN += nh; tT += tr;
      return `<tr><td class="c">${i + 1}</td><td class="c">${escH(p.date)}</td><td>${escH(p.id)}</td><td>${escH(inv[p.id] || '')}</td><td class="r">${f(nh)}</td><td class="r">${f(tr)}</td><td class="r">${f(nh - tr)}</td></tr>`; }).join('');
    const conNo = r.debtNow || (tN - tT);
    const txt = `ĐỐI CHIẾU CÔNG NỢ NHÀ CUNG CẤP\n${s.name}\nKỳ: ${ddmm(fromISO)} → ${ddmm(toISO)}\n──────────\n`
      + (phieu.length ? phieu.map((p, i) => `${i + 1}. ${p.date} · ${p.id}: nhập ${f(p.total)} · đã trả ${f(p.paid || 0)} · còn ${f((+p.total || 0) - (+p.paid || 0))}`).join('\n') : '(không có phiếu trong kỳ)')
      + `\n──────────\nTổng nhập: ${f(tN)}đ · Đã trả: ${f(tT)}đ · CÒN NỢ: ${f(conNo)}đ\n— ${comp.name}`;
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Đối chiếu công nợ - ${escH(s.name)}</title><style>
      *{box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:18px;color:#1a1a1a}.pg{max-width:820px;margin:0 auto}
      .hd{border-bottom:2px solid #1B5E20;padding-bottom:8px;margin-bottom:6px}.hd b{font-size:15px;color:#1B5E20}
      h1{color:#1B5E20;text-align:center;font-size:20px;margin:12px 0 2px}.sub{text-align:center;font-size:13px;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border:1px solid #555;padding:4px 7px}thead th{background:#EAF5EA}
      td.c{text-align:center}td.r{text-align:right;font-variant-numeric:tabular-nums}.grand td{background:#FFF7C2;color:#B91C1C;font-weight:800}
      .toolbar{position:sticky;top:0;background:#fff;padding:8px 0 12px;display:flex;gap:8px;justify-content:center}
      .toolbar button{padding:8px 16px;border:none;border-radius:7px;font-weight:700;cursor:pointer}.b1{background:#1B5E20;color:#fff}.b2{background:#E8A33D;color:#fff}
      @media print{.toolbar{display:none}body{padding:0}}</style></head><body>
      <div class="toolbar"><button class="b1" onclick="window.print()">🖨 In</button><button class="b2" onclick="cp()">📋 Copy nội dung</button></div>
      <div class="pg"><div class="hd"><b>${escH(comp.name)}</b><br>${escH(comp.address)} · ĐT: ${escH(comp.phone)}</div>
        <h1>ĐỐI CHIẾU CÔNG NỢ NHÀ CUNG CẤP</h1><div class="sub"><b>${escH(s.name)}</b> · Kỳ: <b>${ddmm(fromISO)} → ${ddmm(toISO)}</b></div>
        <table><thead><tr><th>STT</th><th>Ngày</th><th>Số phiếu</th><th>Số HĐ</th><th>Tiền nhập</th><th>Đã trả</th><th>Còn nợ</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="7" class="c">Không có phiếu trong kỳ</td></tr>'}</tbody>
          <tfoot><tr class="grand"><td colspan="4" class="r">TỔNG NHẬP KỲ</td><td class="r">${f(tN)}</td><td class="r">${f(tT)}</td><td class="r">${f(tN - tT)}</td></tr>
            <tr class="grand"><td colspan="6" class="r">CÔNG NỢ PHẢI TRẢ HIỆN TẠI</td><td class="r">${f(conNo)}</td></tr></tfoot></table>
        <p style="font-size:12px;margin-top:10px">Kính đề nghị Quý nhà cung cấp đối chiếu &amp; xác nhận công nợ kỳ trên. Trân trọng cảm ơn!</p></div>
      <script>function cp(){navigator.clipboard.writeText(${JSON.stringify(txt).replace(/<\//g, '<\\/')}).then(function(){alert('Đã copy nội dung đối chiếu')}).catch(function(){})}<\/script></body></html>`;
    const w = window.open('', '_blank'); if (!w) { window.toast && window.toast('Trình duyệt chặn popup — cho phép để in đối chiếu', 'warn'); return; }
    w.document.write(html); w.document.close();
  };

  /* ========== F2: ĐỐI SOÁT file NCC ↔ app (so tổng nhập theo ngày) ========== */
  window.ncdReconcile = function () {
    window.openModal('📋 Đối soát file NCC ↔ app', `
      <div style="background:#EFF6FF;color:#1E40AF;padding:9px 12px;border-radius:8px;font-size:12px;margin-bottom:12px">Up file bảng kê NCC (Excel) có <b>Ngày</b> + <b>Số tiền</b>. App so <b>tổng nhập theo ngày</b> (theo bộ lọc/kỳ hiện tại) với file → chỉ ra ngày khớp / lệch. Muốn soát 1 NCC: gõ tên NCC vào ô tìm trước rồi mở lại.</div>
      <input type="file" id="ncdRecFile" accept=".xlsx,.xls" onchange="window._ncdRecRead(this.files[0])" style="width:100%;border:1px dashed var(--line);border-radius:8px;padding:14px;background:#FAFAFB">
      <div id="ncdRecOut" style="margin-top:10px"></div>`,
      { width: '640px', footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>` });
  };
  window._ncdRecRead = function (file) {
    if (!file || !window.XLSX) { window.toast && window.toast('Chưa tải thư viện Excel', 'warn'); return; }
    const fr = new FileReader();
    fr.onload = ev => {
      let rows = [];
      try { const wb = window.XLSX.read(ev.target.result, { type: 'array' }); rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }); }
      catch (e) { document.getElementById('ncdRecOut').innerHTML = '<div style="color:#B91C1C">Không đọc được file.</div>'; return; }
      const yr = String((_last && _last.fromISO || '2026').slice(0, 4));
      const fileDay = {};
      rows.forEach(r => {
        if (!Array.isArray(r)) return; let iso = '', amt = 0;
        r.forEach(cell => {
          const s = String(cell == null ? '' : cell).trim();
          const md = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
          if (md && !iso) { const y = md[3] ? (md[3].length === 2 ? '20' + md[3] : md[3]) : yr; iso = `${y}-${pad(+md[2])}-${pad(+md[1])}`; }
          const n = parseFloat(s.replace(/[.\s₫]/g, '').replace(',', '.'));
          if (!isNaN(n) && n > amt) amt = n;
        });
        if (iso && amt) fileDay[iso] = (fileDay[iso] || 0) + amt;
      });
      const appDay = {}; if (_last) _last.days.forEach(d => { appDay[d] = _last.list.reduce((s, r) => s + (r.daily[d] || 0), 0); });
      const allDays = [...new Set([...Object.keys(appDay), ...Object.keys(fileDay)])].filter(d => (appDay[d] || fileDay[d])).sort();
      const f = v => (Math.round(+v || 0)).toLocaleString('vi-VN'); let nLech = 0;
      const body = allDays.map(d => { const a = appDay[d] || 0, ff = fileDay[d] || 0, diff = a - ff; if (Math.abs(diff) > 1) nLech++;
        return `<tr style="background:${Math.abs(diff) > 1 ? '#FEF2F2' : '#fff'}"><td style="padding:5px 9px">${ddmm(d)}</td><td style="padding:5px 9px;text-align:right">${a ? f(a) : '·'}</td><td style="padding:5px 9px;text-align:right">${ff ? f(ff) : '·'}</td><td style="padding:5px 9px;text-align:right;color:${Math.abs(diff) > 1 ? '#B91C1C' : '#16A34A'};font-weight:700">${diff ? f(diff) : '✓'}</td></tr>`; }).join('');
      document.getElementById('ncdRecOut').innerHTML = `<div style="font-size:12.5px;margin-bottom:6px">${nLech ? `⚠ <b style="color:#B91C1C">${nLech} ngày LỆCH</b>` : '✓ Khớp toàn bộ'} · app = theo bộ lọc hiện tại</div>
        <div style="max-height:44vh;overflow:auto;border:1px solid var(--line);border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="background:#F0FDF4"><th style="text-align:left;padding:6px 9px">Ngày</th><th style="text-align:right;padding:6px 9px">App</th><th style="text-align:right;padding:6px 9px">File NCC</th><th style="text-align:right;padding:6px 9px">Lệch</th></tr></thead><tbody>${body || '<tr><td colspan="4" style="padding:14px;text-align:center;color:var(--muted)">Không đọc được ngày/tiền trong file</td></tr>'}</tbody></table></div>`;
    };
    fr.readAsArrayBuffer(file);
  };

  /* ========== F3: NHẬP PHIẾU NHẬP từ Excel (tạo phiếu nháp hàng loạt) ========== */
  let _impGroups = [];
  window.ncdImport = function () {
    _impGroups = [];
    window.openModal('📥 Nhập phiếu nhập từ Excel', `
      <div style="background:#FFFBEB;color:#92400E;padding:9px 12px;border-radius:8px;font-size:12px;margin-bottom:12px">File Excel mỗi dòng 1 mặt hàng, có cột: <b>NCC · Ngày · Tên SP · SL · Đơn giá</b> (dòng đầu là tiêu đề). App gộp theo <b>NCC + ngày</b> → tạo <b>phiếu nhập nháp (Đã đặt)</b> để kho kiểm rồi bấm ✓ Đã nhận. Xem trước rồi mới tạo.</div>
      <input type="file" id="ncdImpFile" accept=".xlsx,.xls" onchange="window._ncdImpRead(this.files[0])" style="width:100%;border:1px dashed var(--line);border-radius:8px;padding:14px;background:#FAFAFB">
      <div id="ncdImpOut" style="margin-top:10px"></div>`,
      { width: '720px', footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button><button class="btn btn-primary" id="ncdImpBtn" onclick="window._ncdImpCommit()" disabled>Tạo phiếu nháp</button>` });
  };
  window._ncdImpRead = function (file) {
    if (!file || !window.XLSX) { window.toast && window.toast('Chưa tải thư viện Excel', 'warn'); return; }
    const fr = new FileReader();
    fr.onload = ev => {
      let rows = [];
      try { const wb = window.XLSX.read(ev.target.result, { type: 'array' }); rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }); }
      catch (e) { document.getElementById('ncdImpOut').innerHTML = '<div style="color:#B91C1C">Không đọc được file.</div>'; return; }
      const head = (rows[0] || []).map(h => _nk(h));
      const col = kw => head.findIndex(h => kw.some(k => h.includes(k)));
      const cN = col(['ncc', 'nha cung cap']), cD = col(['ngay', 'date']), cS = col(['ten', 'san pham', 'mat hang', 'sp']), cQ = col(['sl', 'so luong', 'khoi luong', 'qty']), cP = col(['gia', 'don gia', 'price']);
      if (cN < 0 || cS < 0 || cQ < 0) { document.getElementById('ncdImpOut').innerHTML = '<div style="color:#B91C1C">Thiếu cột NCC / Tên SP / SL. Kiểm tra dòng tiêu đề.</div>'; return; }
      const sups = getSup(); const supByName = {}; sups.forEach(s => supByName[_nk(s.name)] = s);
      const prods = S().get('products', []) || []; const prodByName = {}; prods.forEach(p => prodByName[_nk(p.name)] = p);
      const yr = new Date().getFullYear(); const groups = {};
      rows.slice(1).forEach(r => {
        if (!Array.isArray(r)) return;
        const nccName = String(r[cN] || '').trim(); const spName = String(r[cS] || '').trim();
        const qty = parseFloat(String(r[cQ] || '').replace(',', '.')) || 0; const price = cP >= 0 ? (parseFloat(String(r[cP] || '').replace(/[.\s₫]/g, '')) || 0) : 0;
        if (!nccName || !spName || !(qty > 0)) return;
        const dRaw = cD >= 0 ? String(r[cD] || '').trim() : ''; const md = dRaw.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
        const date = md ? `${pad(+md[1])}/${pad(+md[2])}/${md[3] ? (md[3].length === 2 ? '20' + md[3] : md[3]) : yr}` : (window.todayVN ? window.todayVN() : '');
        const sup = supByName[_nk(nccName)]; const prod = prodByName[_nk(spName)];
        const key = (sup ? sup.id : '#' + _nk(nccName)) + '|' + date;
        const g = groups[key] || (groups[key] = { supId: sup ? sup.id : '', supName: sup ? sup.name : nccName, matched: !!sup, date, items: [] });
        g.items.push({ productId: prod ? prod.id : null, name: prod ? prod.name : spName, unit: prod ? (prod.unit || 'kg') : 'kg', qty, price, total: Math.round(qty * price) });
      });
      _impGroups = Object.values(groups);
      const f = v => (+v || 0).toLocaleString('vi-VN'); const out = document.getElementById('ncdImpOut');
      if (!_impGroups.length) { out.innerHTML = '<div style="color:#B91C1C">Không đọc được dòng hợp lệ nào.</div>'; return; }
      const nUn = _impGroups.filter(g => !g.matched).length;
      out.innerHTML = `<div style="font-size:12.5px;margin-bottom:6px">Sẽ tạo <b>${_impGroups.filter(g => g.matched).length} phiếu nháp</b>${nUn ? ` · ⚠ bỏ <b style="color:#B45309">${nUn} phiếu NCC chưa khớp danh bạ</b> (thêm NCC trước rồi nhập lại)` : ''}</div>
        <div style="max-height:42vh;overflow:auto;border:1px solid var(--line);border-radius:8px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#F0FDF4"><th style="text-align:left;padding:6px 9px">NCC</th><th style="padding:6px 9px">Ngày</th><th style="text-align:right;padding:6px 9px">Số mã</th><th style="text-align:right;padding:6px 9px">Tổng tiền</th></tr></thead><tbody>${_impGroups.map(g => `<tr style="${g.matched ? '' : 'background:#FEF3C7'}"><td style="padding:5px 9px">${escH(g.supName)}${g.matched ? '' : ' ⚠ chưa khớp'}</td><td style="padding:5px 9px;text-align:center">${escH(g.date)}</td><td style="padding:5px 9px;text-align:right">${g.items.length}</td><td style="padding:5px 9px;text-align:right">${f(g.items.reduce((s, i) => s + i.total, 0))}₫</td></tr>`).join('')}</tbody></table></div>`;
      const btn = document.getElementById('ncdImpBtn'); if (btn) btn.disabled = !_impGroups.some(g => g.matched);
    };
    fr.readAsArrayBuffer(file);
  };
  window._ncdImpCommit = function () {
    const ok = _impGroups.filter(g => g.supId);
    if (!ok.length) return;
    const list = getPur(); const stamp = Date.now().toString(36); let n = 0;
    ok.forEach((g, gi) => {
      const items = g.items;
      list.push({ id: 'PNX-' + stamp + '-' + (gi + 1), supplierId: g.supId, date: g.date, status: 'ordered',
        total: items.reduce((s, i) => s + (+i.total || 0), 0), paid: 0, items, noStock: true,
        note: 'Nhập từ Excel · kiểm giá rồi ✓ Đã nhận' });
      n++;
    });
    const skipped = _impGroups.length - ok.length;
    window.STORE.set('purchases', list);
    if (window.audit) window.audit.log('purchase.import', `Nhập Excel ${n} phiếu nháp NCC`);
    window.toast && window.toast(`✓ Đã tạo ${n} phiếu nháp` + (skipped ? ` · bỏ ${skipped} phiếu NCC chưa khớp` : '') + ' — vào Phiếu nhập kiểm giá + ✓ Đã nhận', 'success');
    _impGroups = []; window.closeModal && window.closeModal();
  };

  /* Init */
  if (window.renderAppShell) window.renderAppShell('ncc-debt', 'Công nợ NCC');
  S().get('products');   /* warm-load: khớp SP khi nhập Excel */
  if (window.STORE) {
    S().get('purchases'); S().get('suppliers'); S().get('cashEntries'); S().get('procurementRuns');   /* warm-load */
    S().subscribe('suppliers', window.ncdRender);
    S().subscribe('purchases', window.ncdRender);
    S().subscribe('cashEntries', window.ncdRender);
  }
  window.ncdPreset('month');   /* mặc định: tháng này + tự render */
})();
