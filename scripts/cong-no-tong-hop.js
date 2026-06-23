/* =========================================================
   Nông Sản Tuấn Tú — CÔNG NỢ TỔNG HỢP ĐỐI TÁC (CFO view)
   Ma trận đối tác × ngày, tự sinh từ ĐƠN HÀNG + sổ công nợ.
   Thay file Excel "Book1" copy tay: Tổng phát sinh · Đã thu · Chưa thu.
   ========================================================= */
(function () {
  const S = () => window.STORE;
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /* Chuẩn hoá ngày 1 đơn → ISO yyyy-mm-dd (ưu tiên ngày GIAO) */
  function orderISO(o) {
    const raw = o.deliverDate || o.date || o.createdAt || '';
    let m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);          /* ISO */
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);         /* dd/mm/yyyy */
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return '';
  }
  function ledgerISO(e) {
    if (e.ts) { const d = new Date(e.ts); if (!isNaN(d)) return isoOf(d); }
    const m = String(e.date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : '';
  }
  function dayList(fromISO, toISO) {
    const out = [];
    let d = new Date(fromISO + 'T00:00:00'), end = new Date(toISO + 'T00:00:00');
    if (isNaN(d) || isNaN(end) || d > end) return out;
    let guard = 0;
    while (d <= end && guard++ < 400) { out.push(isoOf(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  const ddmm = iso => { const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : iso; };

  /* ===== Build dữ liệu báo cáo ===== */
  function build(fromISO, toISO) {
    const orders = S().get('orders', window.ORDERS || []) || [];
    const customers = S().get('customers', window.CUSTOMERS || []) || [];
    const ledger = S().get('debtLedger', []) || [];
    const products = S().get('products', window.PRODUCTS || []) || [];
    const custById = {}; customers.forEach(c => custById[c.id] = c);
    const prodById = {}; products.forEach(p => prodById[p.id] = p);
    const days = dayList(fromISO, toISO);
    const daySet = new Set(days);

    /* GIÁ VỐN 1 đơn = Σ giá vốn từng mặt hàng.
       Ưu tiên giá vốn SNAPSHOT lưu trên mặt hàng (it.buyTotal — từ file nhập có cột giá nhập,
       số THẬT tại thời điểm). Nếu không có → quy về giá nhập của SP trong danh mục theo ngày.
       SP ngoài DM & không có snapshot → 0 (không tính được vốn → LN ước tính). */
    function orderCost(o, iso) {
      const items = Array.isArray(o.items) ? o.items : [];
      let c = 0, known = false;
      items.forEach(it => {
        if (+it.buyTotal > 0) { c += +it.buyTotal; known = true; return; }   /* số thật từ phiếu */
        const p = it.id ? prodById[it.id] : null;
        const e = p ? window.priceEntryOn(p, iso) : null;
        const buy = e ? (+e.buy || 0) : 0;
        if (buy > 0) known = true;
        c += (+it.qty || 0) * buy;
      });
      return { cost: c, hasItems: items.length > 0, known };
    }

    const rows = {};
    orders.forEach(o => {
      if (o.status === 'draft' || o.status === 'cancelled') return;   /* bỏ nháp/huỷ */
      const iso = orderISO(o);
      if (!daySet.has(iso)) return;
      const key = o.cust || o.custName || '—';
      const name = o.custName || (custById[o.cust] && custById[o.cust].name) || key;
      const amt = +o.freight || 0;
      if (!amt) return;
      const r = rows[key] || (rows[key] = { key, name, daily: {}, dailyCost: {}, total: 0, cost: 0, noCostOrders: 0 });
      r.daily[iso] = (r.daily[iso] || 0) + amt;
      r.total += amt;
      const oc = orderCost(o, iso);
      r.dailyCost[iso] = (r.dailyCost[iso] || 0) + oc.cost;
      r.cost += oc.cost;
      if (!oc.hasItems || !oc.known) r.noCostOrders++;   /* đơn không có dữ liệu giá vốn → cảnh báo LN ước tính */
    });
    /* Đã thu trong kỳ (phiếu thu) + công nợ hiện tại + lợi nhuận */
    Object.values(rows).forEach(r => {
      r.paid = ledger.filter(e => e.custId === r.key && e.type === 'payment' && daySet.has(ledgerISO(e)))
        .reduce((s, e) => s + (+e.amount || 0), 0);
      r.remain = r.total - r.paid;
      r.debtNow = (custById[r.key] && +custById[r.key].debt) || 0;
      r.profit = r.total - r.cost;
      r.margin = r.total ? (r.profit / r.total) : 0;
    });
    const list = Object.values(rows).sort((a, b) => b.total - a.total);
    return { days, list };
  }

  let _last = null;   /* cache cho export */
  let cnView = 'rev'; /* 'rev' = Doanh thu & Công nợ · 'cost' = Giá vốn & Lợi nhuận */

  window.cnSetView = function (v) {
    cnView = (v === 'cost') ? 'cost' : 'rev';
    document.querySelectorAll('[data-cnview]').forEach(b => {
      const on = b.getAttribute('data-cnview') === cnView;
      b.style.background = on ? '#15803D' : '#fff';
      b.style.color = on ? '#fff' : 'var(--navy)';
    });
    window.cnRender();
  };

  window.cnRender = function () {
    const fromISO = document.getElementById('cnFrom').value;
    const toISO = document.getElementById('cnTo').value;
    const tbl = document.getElementById('cnTable');
    if (!fromISO || !toISO) { window.toast && window.toast('Chọn từ ngày → đến ngày', 'warn'); return; }
    const data = build(fromISO, toISO);
    _last = { ...data, fromISO, toISO };
    const unit = +(document.getElementById('cnUnit').value) || 1;
    const fmt = v => { const n = v / unit; return n ? (unit === 1 ? Math.round(n).toLocaleString('vi-VN') : (Math.round(n * 10) / 10).toLocaleString('vi-VN')) : ''; };
    const pct = m => (Math.round(m * 1000) / 10).toLocaleString('vi-VN') + '%';

    if (!data.list.length) {
      tbl.innerHTML = `<tbody><tr><td style="padding:30px;text-align:center;color:var(--muted)">Không có đơn nào trong khoảng ${ddmm(fromISO)}–${ddmm(toISO)}. (Đơn phải được nhập trong app + không phải nháp/huỷ.)</td></tr></tbody>`;
      document.getElementById('cnSummary').textContent = '';
      return;
    }
    const isCost = cnView === 'cost';
    const dailyOf = r => isCost ? r.dailyCost : r.daily;

    /* Tổng cột theo ngày + tổng chung */
    const colTot = {}; data.days.forEach(d => colTot[d] = 0);
    let gT = 0, gCost = 0, gProfit = 0, gPaid = 0, gRemain = 0, gDebt = 0;
    data.list.forEach(r => {
      data.days.forEach(d => colTot[d] += (dailyOf(r)[d] || 0));
      gT += r.total; gCost += r.cost; gProfit += r.profit; gPaid += r.paid; gRemain += r.remain; gDebt += r.debtNow;
    });

    let headRight, bodyRight, footRight;
    if (!isCost) {
      headRight = `<th class="num" style="background:#DCFCE7">TỔNG PS</th>
        <th class="num" style="background:#DCFCE7">ĐÃ THU</th>
        <th class="num" style="background:#FEF3C7">CHƯA THU</th>
        <th class="num" style="background:#FEE2E2">CÔNG NỢ HT</th>
        <th class="num" style="background:#EDE9FE">LỢI NHUẬN</th>`;
      bodyRight = r => `<td class="num"><b>${fmt(r.total)}</b></td>
        <td class="num cn-paid">${r.paid ? fmt(r.paid) : '·'}</td>
        <td class="num cn-owe">${r.remain ? fmt(r.remain) : '·'}</td>
        <td class="num">${r.debtNow ? fmt(r.debtNow) : '·'}</td>
        <td class="num" style="font-weight:700;color:${r.profit >= 0 ? '#15803D' : '#B91C1C'}" title="Biên LN ${pct(r.margin)}${r.noCostOrders ? ' · có đơn thiếu giá vốn → ước tính' : ''}">${fmt(r.profit)}${r.noCostOrders ? ' *' : ''}</td>`;
      footRight = `<td class="num">${fmt(gT)}</td><td class="num">${fmt(gPaid)}</td><td class="num">${fmt(gRemain)}</td><td class="num">${fmt(gDebt)}</td><td class="num">${fmt(gProfit)}</td>`;
    } else {
      headRight = `<th class="num" style="background:#FEF3C7">GIÁ VỐN</th>
        <th class="num" style="background:#DCFCE7">DOANH THU</th>
        <th class="num" style="background:#EDE9FE">LỢI NHUẬN</th>
        <th class="num" style="background:#E0F2FE">BIÊN %</th>`;
      bodyRight = r => `<td class="num"><b>${fmt(r.cost)}</b></td>
        <td class="num">${fmt(r.total)}</td>
        <td class="num" style="font-weight:700;color:${r.profit >= 0 ? '#15803D' : '#B91C1C'}">${fmt(r.profit)}${r.noCostOrders ? ' *' : ''}</td>
        <td class="num" style="color:${r.margin >= 0 ? '#15803D' : '#B91C1C'}">${r.total ? pct(r.margin) : '·'}</td>`;
      footRight = `<td class="num">${fmt(gCost)}</td><td class="num">${fmt(gT)}</td><td class="num">${fmt(gProfit)}</td><td class="num">${gT ? pct(gProfit / gT) : '·'}</td>`;
    }

    const head = `<thead><tr>
      <th class="par">ĐỐI TÁC (${data.list.length})</th>
      ${data.days.map(d => `<th class="num">${ddmm(d)}</th>`).join('')}
      ${headRight}
    </tr></thead>`;
    const body = `<tbody>${data.list.map(r => `<tr>
      <td class="par" title="Bấm để xem Thông báo công nợ — in / copy gửi khách"><a href="javascript:void(0)" onclick="window.cnShowNotice('${(r.key || '').replace(/'/g, "\\'")}')" style="color:var(--navy);font-weight:700;text-decoration:none;border-bottom:1px dotted var(--navy)">${r.name}</a></td>
      ${data.days.map(d => { const v = dailyOf(r)[d] || 0; return `<td class="num ${v ? '' : 'z'}">${v ? fmt(v) : '·'}</td>`; }).join('')}
      ${bodyRight(r)}
    </tr>`).join('')}</tbody>`;
    const foot = `<tfoot><tr>
      <td class="par">TỔNG CỘNG</td>
      ${data.days.map(d => `<td class="num">${colTot[d] ? fmt(colTot[d]) : '·'}</td>`).join('')}
      ${footRight}
    </tr></tfoot>`;
    tbl.innerHTML = head + body + foot;

    const dvi = unit === 1 ? 'đồng' : 'nghìn đồng';
    const anyEst = data.list.some(r => r.noCostOrders);
    document.getElementById('cnSummary').innerHTML =
      `📅 <b>${ddmm(fromISO)} → ${ddmm(toISO)}</b> · ${data.days.length} ngày · ${data.list.length} đối tác · đơn vị: <b>${dvi}</b> · đang xem: <b>${isCost ? 'Giá vốn & Lợi nhuận' : 'Doanh thu & Công nợ'}</b><br>` +
      `💰 Doanh thu <b>${gT.toLocaleString('vi-VN')}đ</b> · giá vốn <b>${gCost.toLocaleString('vi-VN')}đ</b> · lợi nhuận <b style="color:#15803D">${gProfit.toLocaleString('vi-VN')}đ</b> (biên ${gT ? pct(gProfit / gT) : '0%'}) · đã thu <b style="color:#16A34A">${gPaid.toLocaleString('vi-VN')}đ</b>` +
      (anyEst ? `<br><span style="color:#B45309;font-size:11.5px">* Có đơn thiếu giá vốn (SP ngoài DM / SP chưa có giá nhập) → lợi nhuận là ƯỚC TÍNH (chỉ trừ phần có giá nhập).</span>` : '');
  };

  /* ===== Preset khoảng ngày ===== */
  window.cnPreset = function (kind) {
    const now = window.todayDate ? window.todayDate() : new Date();
    const y = now.getFullYear(), m = now.getMonth();
    let from, to;
    if (kind === 'k1') { from = new Date(y, m, 1); to = new Date(y, m, 15); }
    else if (kind === 'k2') { from = new Date(y, m, 16); to = new Date(y, m + 1, 0); }
    else if (kind === 'month') { from = new Date(y, m, 1); to = new Date(y, m + 1, 0); }
    else if (kind === 'prev') { from = new Date(y, m - 1, 1); to = new Date(y, m, 0); }
    document.getElementById('cnFrom').value = isoOf(from);
    document.getElementById('cnTo').value = isoOf(to);
    window.cnRender();
  };

  /* ===== Xuất Excel (mẫu Book1: đối tác × ngày) ===== */
  window.cnExport = function () {
    if (!window.XLSX) { window.toast && window.toast('Chưa tải thư viện Excel — reload trang', 'warn'); return; }
    if (!_last || !_last.list.length) { window.toast && window.toast('Chưa có dữ liệu — bấm "Xem báo cáo" trước', 'warn'); return; }
    const unit = +(document.getElementById('cnUnit').value) || 1;
    const r1 = (v) => unit === 1 ? Math.round(v) : Math.round(v / unit * 10) / 10;
    const { days, list, fromISO, toISO } = _last;
    const aoa = [];
    aoa.push([`CÔNG NỢ TỔNG HỢP ĐỐI TÁC · ${ddmm(fromISO)} → ${ddmm(toISO)} · đơn vị: ${unit === 1 ? 'đồng' : 'nghìn đồng'}`]);
    aoa.push(['ĐỐI TÁC', ...days.map(ddmm), 'TỔNG PHÁT SINH', 'GIÁ VỐN', 'LỢI NHUẬN', 'BIÊN %', 'ĐÃ THU', 'CHƯA THU', 'CÔNG NỢ HIỆN TẠI']);
    const colTot = {}; days.forEach(d => colTot[d] = 0);
    let gT = 0, gCost = 0, gProfit = 0, gPaid = 0, gRemain = 0, gDebt = 0;
    list.forEach(r => {
      const row = [r.name];
      days.forEach(d => { const v = r.daily[d] || 0; colTot[d] += v; row.push(v ? r1(v) : ''); });
      const marginTxt = r.total ? (Math.round(r.margin * 1000) / 10) + '%' : '';
      row.push(r1(r.total), r1(r.cost), r1(r.profit), marginTxt, r1(r.paid), r1(r.remain), r1(r.debtNow));
      gT += r.total; gCost += r.cost; gProfit += r.profit; gPaid += r.paid; gRemain += r.remain; gDebt += r.debtNow;
      aoa.push(row);
    });
    const gMargin = gT ? (Math.round(gProfit / gT * 1000) / 10) + '%' : '';
    aoa.push(['TỔNG CỘNG', ...days.map(d => colTot[d] ? r1(colTot[d]) : ''), r1(gT), r1(gCost), r1(gProfit), gMargin, r1(gPaid), r1(gRemain), r1(gDebt)]);
    if (list.some(r => r.noCostOrders)) aoa.push(['* Có đơn thiếu giá nhập (SP ngoài DM / chưa có giá nhập) → lợi nhuận là ƯỚC TÍNH.']);
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 28 }, ...days.map(() => ({ wch: 9 })), { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Công nợ');
    const fn = `CONG-NO-TONG-HOP_${fromISO}_${toISO}.xlsx`;
    window.XLSX.writeFile(wb, fn);
    window.toast && window.toast('✓ Đã xuất ' + fn, 'success');
  };

  /* ===== PHIẾU "THÔNG BÁO CÔNG NỢ — KIÊM ĐỀ NGHỊ THANH TOÁN" (in / copy) ===== */
  const money = v => (Math.round(+v || 0)).toLocaleString('vi-VN');
  const isoVN = iso => { const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; };

  window.cnShowNotice = function (custKey) {
    if (!_last || !_last.list) { window.toast && window.toast('Bấm "Xem báo cáo" trước', 'warn'); return; }
    const r = _last.list.find(x => x.key === custKey);
    if (!r) { window.toast && window.toast('Không tìm thấy đối tác', 'warn'); return; }
    const c = (S().get('customers', []) || []).find(x => x.id === custKey) || { name: r.name };
    const ci = S().get('companyInfo', {}) || {};
    const comp = {
      name: ci.name || 'CÔNG TY TNHH NÔNG SẢN TUẤN TÚ HÀ NỘI',
      tax: ci.tax || '0110302211',
      address: ci.address || '36/147A - Tân Mai - Hoàng Mai - Hà Nội',
      bank: ci.bank || 'MB 228666669999',
      bankOwner: ci.bankOwner || 'CTY TNHH NÔNG SẢN TUẤN TÚ HÀ NỘI',
      email: ci.email || 'nongsantuantuhanoi@gmail.com',
      director: ci.director || ci.hotline || '0836 676 086',
    };
    /* Tách mã NH + số TK cho VietQR — bám theo đúng dòng "Số Tài Khoản" (vd "MB 228666669999")
       → đổi ngân hàng/STK chỉ cần sửa companyInfo.bank, QR tự đổi theo. */
    const _bp = String(comp.bank || '').trim().match(/^(\S+)[\s:]+(\d[\d\s]*\d|\d)$/);
    comp.bankCode = ci.bankCode || (_bp && _bp[1]) || 'MB';
    comp.bankAcc = ci.bankAcc || (_bp && _bp[2].replace(/\s/g, '')) || '228666669999';
    /* các ngày phát sinh trong kỳ → dòng phiếu */
    const rows = Object.keys(r.daily).filter(d => r.daily[d] > 0).sort()
      .map(d => ({ date: isoVN(d), amount: r.daily[d] }));
    const totalPS = r.total, paid = r.paid || 0, remain = r.remain != null ? r.remain : totalPS;
    /* chia 2 cột (trái STT 1..n, phải tiếp theo) — CHỈ hiện đúng số dòng có dữ liệu */
    const half = Math.max(1, Math.ceil(rows.length / 2));
    const colCell = (i) => {
      const e = rows[i];
      return `<td style="text-align:center">${e ? (i + 1) : ''}</td><td>${e ? e.date : ''}</td><td style="text-align:right">${e ? money(e.amount) : ''}</td><td></td>`;
    };
    let bodyRows = '';
    for (let i = 0; i < half; i++) bodyRows += `<tr>${colCell(i)}${colCell(i + half)}</tr>`;
    const sumL = rows.slice(0, half).reduce((s, e) => s + e.amount, 0);
    const sumR = rows.slice(half).reduce((s, e) => s + e.amount, 0);

    /* VietQR ĐỘNG — tự điền đúng SỐ TIỀN CÔNG NỢ + ghi chú "CONG NO <khách>" khi quét. */
    const _noDia = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase();
    const qrAmt = Math.max(0, Math.round(remain || 0));
    const qrNote = ('CONG NO ' + _noDia(c.name || custKey)).slice(0, 50);
    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(comp.bankCode)}-${encodeURIComponent(comp.bankAcc)}-qr_only.png`
      + `?amount=${qrAmt}&addInfo=${encodeURIComponent(qrNote)}&accountName=${encodeURIComponent(_noDia(comp.name))}`;

    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thông báo công nợ — ${(c.name || '').replace(/</g, '')}</title>
    <style>
      *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:18px;color:#1a1a1a;background:#fff}
      .pg{max-width:880px;margin:0 auto;padding:26px 32px 52px;background:#fff}
      .hd{display:flex;gap:14px;align-items:flex-start;border-bottom:2px solid #1B5E20;padding-bottom:8px}
      .hd img{width:74px;height:74px;object-fit:contain}
      .cinfo{flex:1;font-size:12.5px;line-height:1.5}
      .cinfo b{font-size:15px;color:#1B5E20}
      .greet{display:flex;justify-content:space-between;margin-top:10px;font-size:13px}
      h1{color:#C0392B;text-align:center;font-size:21px;margin:8px 0 2px}
      .sub{text-align:center;font-style:italic;color:#C0392B;font-size:12.5px;margin-bottom:2px}
      .note0{font-style:italic;font-size:12px;margin:6px 0}
      table{width:100%;border-collapse:collapse;font-size:12.5px}
      th,td{border:1px solid #555;padding:4px 7px}
      thead th{background:#EAF5EA;text-align:center;font-weight:700}
      .totrow td{font-weight:700;background:#FAFAFA}
      .grand{background:#FFF7C2;color:#C0392B;font-weight:800;font-size:14px}
      .ft{text-align:center;color:#C0392B;font-weight:700;font-size:12.5px;margin-top:10px;line-height:1.6}
      .sign{display:flex;justify-content:space-around;margin-top:30px;font-size:12px;text-align:center}
      .sign>div{min-height:78px}
      .toolbar{position:sticky;top:0;background:#fff;padding:8px 0 12px;display:flex;gap:8px;justify-content:center}
      .toolbar button{padding:8px 16px;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer}
      .b1{background:#1B5E20;color:#fff}.b2{background:#E8A33D;color:#fff}.b3{background:#2563EB;color:#fff}.b4{background:#fff;color:#1B5E20;border:1px solid #1B5E20 !important}
      @media print{.toolbar{display:none}body{padding:0}}
    </style></head><body>
    <div class="toolbar">
      <button class="b3" onclick="copyImg()">📸 Copy ảnh gửi khách</button>
      <button class="b4" onclick="downloadImg()">⬇ Tải ảnh</button>
      <button class="b1" onclick="window.print()">🖨 In phiếu</button>
      <button class="b2" onclick="copyTxt()">📋 Copy nội dung</button>
    </div>
    <div class="pg" id="pg">
      <div class="hd">
        <img src="${location.origin}/assets/logo.png" crossorigin="anonymous" onerror="this.style.display='none'">
        <div class="cinfo">
          <b>${comp.name}</b><br>
          Mã Số Thuế: ${comp.tax}<br>
          Địa Chỉ: ${comp.address}<br>
          Số Tài Khoản: ${comp.bank} &nbsp;·&nbsp; Chủ TK: ${comp.bankOwner}<br>
          Email: ${comp.email} &nbsp;·&nbsp; GĐĐH: ${comp.director}
        </div>
        <div class="qrbox" style="flex:0 0 auto;text-align:center;min-width:138px">
          <img src="${qrUrl}" alt="VietQR chuyển khoản" crossorigin="anonymous" style="width:132px;height:132px;object-fit:contain;border:1px solid #1B5E20;border-radius:8px;padding:3px;background:#fff" onerror="this.style.opacity='0.15'">
          <div style="font-size:10px;color:#1B5E20;font-weight:700;margin-top:2px">Quét QR để chuyển khoản</div>
          <div style="font-size:9.5px;color:#555">${comp.bank}</div>
        </div>
      </div>
      <div class="greet"><div><b>Kính Gửi Quý Khách Hàng:</b> ${c.name || ''}<br><b>Địa Chỉ:</b> ${c.address || '—'}</div><div><b>Số Điện Thoại:</b> ${c.phone || '—'}</div></div>
      <h1>THÔNG BÁO CÔNG NỢ – KIÊM ĐỀ NGHỊ THANH TOÁN</h1>
      <div class="sub">từ ngày ${ddmm(_last.fromISO)}/${_last.fromISO.slice(0,4)} – ${ddmm(_last.toISO)}/${_last.toISO.slice(0,4)}</div>
      <div class="note0">Chuyên Sỉ Rau Củ Quả Đà Lạt Và Rau Vùng Miền.</div>
      <table>
        <thead><tr><th>STT</th><th>Ngày Tháng</th><th>Số Tiền</th><th>Ghi Chú</th><th>STT</th><th>Ngày Tháng</th><th>Số Tiền</th><th>Ghi Chú</th></tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr class="totrow"><td colspan="2" style="text-align:center">Tổng</td><td style="text-align:right">${money(sumL)}</td><td></td><td colspan="2" style="text-align:center">Tổng</td><td style="text-align:right">${sumR ? money(sumR) : ''}</td><td></td></tr>
          <tr class="grand"><td colspan="6" style="text-align:right">TỔNG SỐ TIỀN CÔNG NỢ${paid > 0 ? ' (đã thu ' + money(paid) + 'đ → còn phải thu)' : ''}</td><td colspan="2" style="text-align:right">${money(paid > 0 ? remain : totalPS)}</td></tr>
        </tfoot>
      </table>
      <div class="ft">
        Xin Trân Trọng Quý Khách Hàng Đã Tin Tưởng Đồng Hành Và Dành Thời Gian Quan Tâm.<br>
        Với Mong Muốn Cố Gắng Hoàn Thiện, Chúng Tôi Xin Lắng Nghe, Tiếp Thu Và Bổ Sung Những Điều Thiếu Sót.<br>
        Mọi Ý Kiến Đóng Góp Và Phản Hồi Xin Liên Hệ Giám Đốc Điều Hành: ${comp.director}
      </div>
      <div class="sign"><div><b>Đại Diện Bên Bán</b><br>(Ký, Đóng dấu)</div><div><b>Kế Toán Bên Bán</b><br>(Ký, Ghi Rõ Họ Tên)</div><div><b>Kế Toán Bên Mua</b><br>(Ký, Ghi Rõ Họ Tên)</div></div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
    <script>
      var _imgName = ${JSON.stringify('cong-no-' + ((c.name || 'khach').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'khach') + '-' + ddmm(_last.toISO))};
      async function _snap(){
        if(!window.html2canvas){ alert('Thư viện ảnh đang tải, đợi 1-2 giây rồi bấm lại.'); return null; }
        var el=document.getElementById('pg');
        return await window.html2canvas(el,{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false});
      }
      function _dl(blob){
        var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=_imgName+'.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){URL.revokeObjectURL(a.href);},3000);
      }
      async function copyImg(){
        try{
          var cv=await _snap(); if(!cv) return;
          cv.toBlob(async function(blob){
            try{
              await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
              alert('✓ Đã copy ẢNH phiếu — dán thẳng vào Zalo/Messenger gửi khách (Ctrl+V / Cmd+V).');
            }catch(err){
              _dl(blob);
              alert('Trình duyệt không cho copy ảnh trực tiếp → đã TẢI ảnh .png về máy. Anh gửi file ảnh đó cho khách.');
            }
          },'image/png');
        }catch(e){ alert('Lỗi tạo ảnh: '+(e&&e.message||e)); }
      }
      async function downloadImg(){
        try{ var cv=await _snap(); if(!cv) return; cv.toBlob(function(blob){ _dl(blob); },'image/png'); }
        catch(e){ alert('Lỗi tạo ảnh: '+(e&&e.message||e)); }
      }
      function copyTxt(){
        var lines=[${JSON.stringify(comp.name)},'MST: '+${JSON.stringify(comp.tax)},'',
          'THÔNG BÁO CÔNG NỢ – KIÊM ĐỀ NGHỊ THANH TOÁN',
          'Kính gửi: '+${JSON.stringify(c.name || '')},
          'Kỳ: ${ddmm(_last.fromISO)}/${_last.fromISO.slice(0,4)} - ${ddmm(_last.toISO)}/${_last.toISO.slice(0,4)}',''];
        ${JSON.stringify(rows.map((e, i) => `${i + 1}. ${e.date}: ${money(e.amount)}đ`))}.forEach(function(l){lines.push(l)});
        lines.push('');
        lines.push('TỔNG CÔNG NỢ PHẢI THANH TOÁN: '+${JSON.stringify(money(paid > 0 ? remain : totalPS))}+'đ');
        lines.push('STK: '+${JSON.stringify(comp.bank + ' · ' + comp.bankOwner)});
        navigator.clipboard.writeText(lines.join('\\n')).then(function(){alert('✓ Đã copy nội dung — dán gửi khách (Zalo/SMS).');});
      }
    <\/script>
    </body></html>`;
    const w = window.open('', '_blank', 'width=920,height=900');
    if (!w) { window.toast && window.toast('Trình duyệt chặn popup — cho phép popup để mở phiếu', 'warn'); return; }
    w.document.write(html); w.document.close();
  };

  /* ===== Khởi tạo: mặc định = tháng này, tự render khi có data ===== */
  function init() {
    if (window.renderAppShell) window.renderAppShell('debt-summary', 'Công nợ tổng hợp');
    const now = window.todayDate ? window.todayDate() : new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const fEl = document.getElementById('cnFrom'), tEl = document.getElementById('cnTo');
    if (fEl && !fEl.value) fEl.value = isoOf(first);
    if (tEl && !tEl.value) tEl.value = isoOf(now);
    window.cnRender();
    /* Re-render khi đơn/KH/sổ nợ về từ cloud */
    if (S().subscribe) { S().subscribe('orders', () => window.cnRender()); S().subscribe('customers', () => {}); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
