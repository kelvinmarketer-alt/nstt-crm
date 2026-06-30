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
  /* Ca giao → cột 'c' (Chiều/Tối) hoặc 's' (Sáng/Trưa/không ghi) cho phiếu ma trận */
  const shiftKey = o => /chi[eề]u|t[oố]i/i.test(o.shipShift || o.ship_shift || '') ? 'c' : 's';
  /* Nhãn thương hiệu (kv custBrands) → gom nhiều cơ sở. Chưa gán → mỗi cơ sở tự là 1 thương hiệu. */
  const _nk = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
  function custBrandMap() { return S().get('custBrands', {}) || {}; }
  function brandOf(custId, name) { const m = custBrandMap(); return (m[custId] && String(m[custId]).trim()) || name || custId; }

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
      const cust = custById[o.cust] || {};
      const r = rows[key] || (rows[key] = { key, name, addr: cust.address || o.drop || '', phone: cust.phone || '',
        daily: {}, dailyShift: {}, dailyCost: {}, total: 0, cost: 0, noCostOrders: 0 });
      r.daily[iso] = (r.daily[iso] || 0) + amt;
      /* tách ca cho phiếu ma trận: dailyShift[iso] = {s, c} */
      const sk = shiftKey(o);
      const ds = r.dailyShift[iso] || (r.dailyShift[iso] = { s: 0, c: 0 });
      ds[sk] += amt;
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

  /* Gộp danh sách cơ sở → nhóm THƯƠNG HIỆU (mỗi nhóm có dòng cộng + các cơ sở con) */
  function groupByBrand(list) {
    const g = {};
    list.forEach(r => {
      const bn = brandOf(r.key, r.name);
      const k = _nk(bn) || r.key;
      const grp = g[k] || (g[k] = { brandKey: k, brand: bn, sites: [], daily: {}, dailyCost: {}, total: 0, cost: 0, paid: 0, remain: 0, debtNow: 0, profit: 0, noCostOrders: 0 });
      grp.sites.push(r);
      Object.keys(r.daily).forEach(d => grp.daily[d] = (grp.daily[d] || 0) + r.daily[d]);
      Object.keys(r.dailyCost).forEach(d => grp.dailyCost[d] = (grp.dailyCost[d] || 0) + r.dailyCost[d]);
      grp.total += r.total; grp.cost += r.cost; grp.paid += r.paid; grp.remain += r.remain;
      grp.debtNow += r.debtNow; grp.profit += r.profit; grp.noCostOrders += r.noCostOrders;
    });
    const groups = Object.values(g);
    groups.forEach(gr => { gr.margin = gr.total ? gr.profit / gr.total : 0; gr.sites.sort((a, b) => b.total - a.total); });
    return groups.sort((a, b) => b.total - a.total);
  }

  let _last = null;   /* cache cho export */
  let cnView = 'rev'; /* 'rev' = Doanh thu & Công nợ · 'cost' = Giá vốn & Lợi nhuận */
  let cnGroupBrand = false;   /* gộp theo thương hiệu (nhiều cơ sở) */
  let cnQuery = '';           /* lọc theo tên đối tác */
  let _cnSearchT = null;
  window.cnSearch = function (v) {
    cnQuery = v || '';
    clearTimeout(_cnSearchT);
    _cnSearchT = setTimeout(() => window.cnRender(), 160);   /* debounce gõ phím */
  };
  window.cnToggleBrand = function () { cnGroupBrand = !cnGroupBrand; const b = document.getElementById('cnBrandBtn'); if (b) { b.style.background = cnGroupBrand ? '#15803D' : '#fff'; b.style.color = cnGroupBrand ? '#fff' : 'var(--navy)'; } window.cnRender(); };

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
    /* lọc theo ô tìm kiếm (tên đối tác — bỏ dấu) */
    const q = _nk(cnQuery);
    if (q) data.list = data.list.filter(r => _nk(r.name).includes(q));
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
    let body;
    if (cnGroupBrand) {
      const groups = groupByBrand(data.list);
      body = `<tbody>${groups.map(g => {
        const multi = g.sites.length > 1;
        const brandRow = `<tr style="background:#F0FDF4">
          <td class="par" style="background:#F0FDF4" title="Bấm xem phiếu công nợ ma trận (cơ sở × ngày × Sáng/Chiều)">
            <a href="javascript:void(0)" onclick="window.cnShowBrandNotice('${(g.brandKey || '').replace(/'/g, "\\'")}')" style="color:#15803D;font-weight:800;text-decoration:none;border-bottom:1px dotted #15803D">${g.brand}</a>
            ${multi ? `<span style="font-size:10px;color:#15803D"> ▾ ${g.sites.length} cơ sở</span>` : ''}</td>
          ${data.days.map(d => { const v = dailyOf(g)[d] || 0; return `<td class="num ${v ? '' : 'z'}"><b>${v ? fmt(v) : '·'}</b></td>`; }).join('')}
          ${bodyRight(g)}</tr>`;
        const siteRows = multi ? g.sites.map(r => `<tr>
          <td class="par" style="padding-left:18px;font-weight:400" title="${(r.addr || r.name).replace(/"/g, '&quot;')}"><a href="javascript:void(0)" onclick="window.cnShowNotice('${(r.key || '').replace(/'/g, "\\'")}')" style="color:#475569;text-decoration:none;border-bottom:1px dotted #94A3B8">↳ ${r.addr || r.name}</a></td>
          ${data.days.map(d => { const v = dailyOf(r)[d] || 0; return `<td class="num ${v ? '' : 'z'}">${v ? fmt(v) : '·'}</td>`; }).join('')}
          ${bodyRight(r)}</tr>`).join('') : '';
        return brandRow + siteRows;
      }).join('')}</tbody>`;
    } else {
      body = `<tbody>${data.list.map(r => `<tr>
        <td class="par" title="Bấm để xem Thông báo công nợ — in / copy gửi khách"><a href="javascript:void(0)" onclick="window.cnShowNotice('${(r.key || '').replace(/'/g, "\\'")}')" style="color:var(--navy);font-weight:700;text-decoration:none;border-bottom:1px dotted var(--navy)">${r.name}</a></td>
        ${data.days.map(d => { const v = dailyOf(r)[d] || 0; return `<td class="num ${v ? '' : 'z'}">${v ? fmt(v) : '·'}</td>`; }).join('')}
        ${bodyRight(r)}
      </tr>`).join('')}</tbody>`;
    }
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
      (anyEst ? `<br><span class="cn-est-note" style="color:#B45309;font-size:11.5px">* Có đơn thiếu giá vốn (SP ngoài DM / SP chưa có giá nhập) → lợi nhuận là ƯỚC TÍNH (chỉ trừ phần có giá nhập).</span>` : '');
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
    /* các ngày phát sinh → dòng phiếu, TÁCH Sáng/Chiều (ca giao của đơn).
       Khách chỉ giao 1 buổi → buổi kia để trống. */
    const rows = Object.keys(r.daily).filter(d => r.daily[d] > 0).sort()
      .map(d => { const sh = r.dailyShift[d] || { s: 0, c: 0 }; return { iso: d, date: isoVN(d), s: sh.s, c: sh.c, tot: r.daily[d] }; });
    const sumS = rows.reduce((a, e) => a + e.s, 0), sumC = rows.reduce((a, e) => a + e.c, 0);
    const totalPS = r.total, paid = r.paid || 0, remain = r.remain != null ? r.remain : totalPS;

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
        <thead><tr><th>STT</th><th>Ngày Tháng</th><th>Sáng</th><th>Chiều</th><th>Cộng ngày</th><th>Ghi Chú</th></tr></thead>
        <tbody>${rows.map((e, i) => `<tr><td style="text-align:center">${i + 1}</td><td style="text-align:center">${e.date}</td><td style="text-align:right">${e.s ? money(e.s) : ''}</td><td style="text-align:right">${e.c ? money(e.c) : ''}</td><td style="text-align:right"><b>${money(e.tot)}</b></td><td></td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#888;padding:12px">Không có phát sinh trong kỳ</td></tr>'}</tbody>
        <tfoot>
          <tr class="totrow"><td colspan="2" style="text-align:center">Tổng</td><td style="text-align:right">${sumS ? money(sumS) : '-'}</td><td style="text-align:right">${sumC ? money(sumC) : '-'}</td><td style="text-align:right">${money(totalPS)}</td><td></td></tr>
          <tr class="grand"><td colspan="5" style="text-align:right">TỔNG SỐ TIỀN CÔNG NỢ${paid > 0 ? ' (đã thu ' + money(paid) + 'đ → còn phải thu)' : ''}</td><td style="text-align:right">${money(paid > 0 ? remain : totalPS)}</td></tr>
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
        ${JSON.stringify(rows.map((e, i) => `${i + 1}. ${e.date}: ${money(e.tot)}đ` + (e.s && e.c ? ` (Sáng ${money(e.s)} · Chiều ${money(e.c)})` : e.c ? ' (Chiều)' : '')))}.forEach(function(l){lines.push(l)});
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

  /* ===== GÁN NHÃN THƯƠNG HIỆU (gom cơ sở) ===== */
  let _brandWork = {};
  window.cnManageBrands = function () {
    const custs = (S().get('customers', []) || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    _brandWork = { ...(custBrandMap()) };
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const rows = custs.map(c => `
      <tr data-bk="${esc(_nk(c.name + ' ' + (c.address || '')))}">
        <td style="font-weight:600">${esc(c.name)}<div style="font-size:10px;color:#94A3B8;font-weight:400">${esc(c.address || '—')}</div></td>
        <td><input data-bid="${esc(c.id)}" value="${esc(_brandWork[c.id] || '')}" placeholder="(để trống = tự là 1 thương hiệu)"
          oninput="window._cnBrandSet('${esc(c.id)}', this.value)" style="width:100%;padding:5px 7px;border:1px solid var(--line);border-radius:6px;font-size:12px"></td>
      </tr>`).join('');
    window.openModal('🏷 Gán thương hiệu cho cơ sở', `
      <div style="background:#EFF6FF;color:#1E40AF;padding:9px 11px;border-radius:8px;font-size:12px;margin-bottom:10px;line-height:1.5">
        1 thương hiệu có nhiều cơ sở → gõ <b>cùng một tên thương hiệu</b> (vd <b>BIA ƠI</b>) vào các cơ sở đó. Để trống = cơ sở tự là 1 thương hiệu riêng.<br>
        💡 Lọc bên dưới rồi <b>gán hàng loạt</b> cho các dòng đang hiện.
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input id="cnBrandFilter" placeholder="🔎 Lọc theo tên/địa chỉ…" oninput="window._cnBrandFilter(this.value)" style="flex:1;padding:6px 9px;border:1px solid var(--line);border-radius:6px;font-size:12px">
        <input id="cnBrandBulk" placeholder="Tên thương hiệu" style="width:160px;padding:6px 9px;border:1px solid var(--line);border-radius:6px;font-size:12px">
        <button class="btn btn-ghost btn-sm" onclick="window._cnBrandBulk()">Gán cho dòng đang hiện</button>
      </div>
      <div style="max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:8px">
        <table class="mini-table" id="cnBrandTbl" style="margin:0;font-size:12px;width:100%">
          <thead><tr><th>Cơ sở (tên · địa chỉ)</th><th style="width:200px">Thương hiệu</th></tr></thead>
          <tbody>${rows || '<tr><td colspan=2 style="padding:14px;color:var(--muted)">Chưa có khách hàng.</td></tr>'}</tbody>
        </table></div>
    `, {
      width: '680px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
               <button class="btn btn-primary" onclick="window._cnBrandSave()">💾 Lưu nhãn thương hiệu</button>`,
    });
  };
  window._cnBrandSet = function (id, val) { if (val && val.trim()) _brandWork[id] = val.trim(); else delete _brandWork[id]; };
  window._cnBrandFilter = function (q) {
    const k = _nk(q); document.querySelectorAll('#cnBrandTbl tbody tr').forEach(tr => {
      tr.style.display = (!k || (tr.getAttribute('data-bk') || '').includes(k)) ? '' : 'none';
    });
  };
  window._cnBrandBulk = function () {
    const v = (document.getElementById('cnBrandBulk').value || '').trim(); if (!v) { window.toast && window.toast('Nhập tên thương hiệu trước', 'warn'); return; }
    document.querySelectorAll('#cnBrandTbl tbody tr').forEach(tr => {
      if (tr.style.display === 'none') return;
      const inp = tr.querySelector('input[data-bid]'); if (inp) { inp.value = v; window._cnBrandSet(inp.getAttribute('data-bid'), v); }
    });
  };
  window._cnBrandSave = function () {
    S().set('custBrands', { ..._brandWork });
    window.closeModal();
    window.toast && window.toast('✓ Đã lưu nhãn thương hiệu — bật "Gộp theo thương hiệu" để xem.', 'success');
    if (!cnGroupBrand) window.cnToggleBrand(); else window.cnRender();
  };

  /* ===== PHIẾU CÔNG NỢ MA TRẬN (thương hiệu nhiều cơ sở: cơ sở × ngày × Sáng/Chiều) ===== */
  window.cnShowBrandNotice = function (brandKey) {
    if (!_last || !_last.list) { window.toast && window.toast('Bấm "Xem báo cáo" trước', 'warn'); return; }
    const grp = groupByBrand(_last.list).find(g => g.brandKey === brandKey);
    if (!grp) { window.toast && window.toast('Không tìm thấy thương hiệu', 'warn'); return; }
    if (grp.sites.length === 1) return window.cnShowNotice(grp.sites[0].key);   /* 1 cơ sở → phiếu thường */
    const sites = grp.sites;
    const days = _last.days.filter(d => (grp.daily[d] || 0) > 0);
    const ci = S().get('companyInfo', {}) || {};
    const comp = {
      name: ci.name || 'CÔNG TY TNHH NÔNG SẢN TUẤN TÚ HÀ NỘI', tax: ci.tax || '0110302211',
      address: ci.address || '36/147A - Tân Mai - Hoàng Mai - Hà Nội', bank: ci.bank || 'MB 228666669999',
      bankOwner: ci.bankOwner || 'CTY TNHH NÔNG SẢN TUẤN TÚ HÀ NỘI', email: ci.email || 'nongsantuantuhanoi@gmail.com',
      director: ci.director || ci.hotline || '0836 676 086',
    };
    const _bp = String(comp.bank || '').trim().match(/^(\S+)[\s:]+(\d[\d\s]*\d|\d)$/);
    comp.bankCode = ci.bankCode || (_bp && _bp[1]) || 'MB';
    comp.bankAcc = ci.bankAcc || (_bp && _bp[2].replace(/\s/g, '')) || '228666669999';
    const totalPS = grp.total, paid = grp.paid || 0, remain = grp.remain != null ? grp.remain : totalPS;
    const _noDia = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase();
    const qrAmt = Math.max(0, Math.round(remain || 0));
    const qrNote = ('CONG NO ' + _noDia(grp.brand)).slice(0, 50);
    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(comp.bankCode)}-${encodeURIComponent(comp.bankAcc)}-qr_only.png?amount=${qrAmt}&addInfo=${encodeURIComponent(qrNote)}&accountName=${encodeURIComponent(_noDia(comp.name))}`;
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    /* tiêu đề: 2 hàng — cơ sở (gộp 2 cột) rồi Sáng/Chiều */
    const h1 = sites.map(s => `<th colspan="2" style="text-align:center">${esc(s.addr || s.name)}</th>`).join('');
    const h2 = sites.map(() => `<th style="text-align:center">Sáng</th><th style="text-align:center">Chiều</th>`).join('');
    const bodyRows = days.map((d, i) => {
      const cells = sites.map(s => {
        const sh = s.dailyShift[d] || { s: 0, c: 0 };
        return `<td style="text-align:right">${sh.s ? money(sh.s) : ''}</td><td style="text-align:right">${sh.c ? money(sh.c) : ''}</td>`;
      }).join('');
      return `<tr><td style="text-align:center">${i + 1}</td><td style="white-space:nowrap">${isoVN(d)}</td>${cells}</tr>`;
    }).join('');
    /* dòng Tổng theo từng cột (Sáng/Chiều mỗi cơ sở) */
    const colTotCells = sites.map(s => {
      let ts = 0, tc = 0; days.forEach(d => { const sh = s.dailyShift[d] || { s: 0, c: 0 }; ts += sh.s; tc += sh.c; });
      return `<td style="text-align:right">${ts ? money(ts) : '-'}</td><td style="text-align:right">${tc ? money(tc) : '-'}</td>`;
    }).join('');
    /* dòng Tổng mỗi cơ sở (gộp 2 cột) */
    const siteTotCells = sites.map(s => `<td colspan="2" style="text-align:right;font-weight:700">${money(s.total)}</td>`).join('');
    const nCol = 2 + sites.length * 2;
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Công nợ thương hiệu — ${esc(grp.brand)}</title>
    <style>
      *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:18px;color:#1a1a1a;background:#fff}
      .pg{max-width:1180px;margin:0 auto;padding:24px 28px 48px;background:#fff}
      .hd{display:flex;gap:14px;align-items:flex-start;border-bottom:2px solid #1B5E20;padding-bottom:8px}
      .hd img.logo{width:74px;height:74px;object-fit:contain}
      .cinfo{flex:1;font-size:12.5px;line-height:1.5}.cinfo b{font-size:15px;color:#1B5E20}
      .greet{display:flex;justify-content:space-between;margin-top:10px;font-size:13px}
      h1{color:#C0392B;text-align:center;font-size:20px;margin:8px 0 2px}
      .sub{text-align:center;font-style:italic;color:#C0392B;font-size:12.5px;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;font-size:11.5px}
      th,td{border:1px solid #555;padding:3px 6px}
      thead th{background:#EAF5EA;text-align:center;font-weight:700}
      .totrow td{font-weight:700;background:#FAFAFA}
      .grand{background:#FFF7C2;color:#C0392B;font-weight:800;font-size:14px}
      .ft{text-align:center;color:#C0392B;font-weight:700;font-size:12.5px;margin-top:10px;line-height:1.6}
      .sign{display:flex;justify-content:space-around;margin-top:26px;font-size:12px;text-align:center}.sign>div{min-height:74px}
      .toolbar{position:sticky;top:0;background:#fff;padding:8px 0 12px;display:flex;gap:8px;justify-content:center}
      .toolbar button{padding:8px 16px;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer}
      .b1{background:#1B5E20;color:#fff}.b3{background:#2563EB;color:#fff}.b4{background:#fff;color:#1B5E20;border:1px solid #1B5E20 !important}
      @media print{.toolbar{display:none}body{padding:0}}
    </style></head><body>
    <div class="toolbar">
      <button class="b3" onclick="copyImg()">📸 Copy ảnh gửi khách</button>
      <button class="b4" onclick="downloadImg()">⬇ Tải ảnh</button>
      <button class="b1" onclick="window.print()">🖨 In phiếu</button>
    </div>
    <div class="pg" id="pg">
      <div class="hd">
        <img class="logo" src="${location.origin}/assets/logo.png" crossorigin="anonymous" onerror="this.style.display='none'">
        <div class="cinfo"><b>${comp.name}</b><br>Mã Số Thuế: ${comp.tax}<br>Địa Chỉ: ${comp.address}<br>
          Số Tài Khoản: ${comp.bank} &nbsp;·&nbsp; Chủ TK: ${comp.bankOwner}<br>Email: ${comp.email} &nbsp;·&nbsp; GĐĐH: ${comp.director}</div>
        <div style="flex:0 0 auto;text-align:center;min-width:132px">
          <img src="${qrUrl}" crossorigin="anonymous" style="width:126px;height:126px;object-fit:contain;border:1px solid #1B5E20;border-radius:8px;padding:3px" onerror="this.style.opacity='0.15'">
          <div style="font-size:10px;color:#1B5E20;font-weight:700;margin-top:2px">Quét QR chuyển khoản</div></div>
      </div>
      <div class="greet"><div><b>Kính Gửi:</b> ${esc(grp.brand)}<br><b>Số cơ sở:</b> ${sites.length} cơ sở</div><div><b>Kỳ:</b> ${ddmm(_last.fromISO)} – ${ddmm(_last.toISO)}</div></div>
      <h1>THÔNG BÁO CÔNG NỢ – KIÊM ĐỀ NGHỊ THANH TOÁN</h1>
      <div class="sub">từ ngày ${ddmm(_last.fromISO)}/${_last.fromISO.slice(0,4)} – ${ddmm(_last.toISO)}/${_last.toISO.slice(0,4)} · gộp ${sites.length} cơ sở</div>
      <table>
        <thead>
          <tr><th rowspan="2" style="vertical-align:middle">STT</th><th rowspan="2" style="vertical-align:middle">Ngày Tháng</th>${h1}</tr>
          <tr>${h2}</tr>
        </thead>
        <tbody>${bodyRows || `<tr><td colspan="${nCol}" style="text-align:center;padding:14px;color:#888">Không có phát sinh trong kỳ</td></tr>`}</tbody>
        <tfoot>
          <tr class="totrow"><td colspan="2" style="text-align:center">Tổng</td>${colTotCells}</tr>
          <tr class="totrow"><td colspan="2" style="text-align:center">Tổng theo cơ sở</td>${siteTotCells}</tr>
          <tr class="grand"><td colspan="${nCol - 1}" style="text-align:right">TỔNG SỐ TIỀN CÔNG NỢ${paid > 0 ? ' (đã thu ' + money(paid) + 'đ → còn phải thu)' : ''}</td><td style="text-align:right">${money(paid > 0 ? remain : totalPS)}</td></tr>
        </tfoot>
      </table>
      <div class="ft">Xin Trân Trọng Quý Khách Hàng Đã Tin Tưởng Đồng Hành.<br>Mọi Phản Hồi Xin Liên Hệ Giám Đốc Điều Hành: ${comp.director}</div>
      <div class="sign"><div><b>Đại Diện Bên Bán</b><br>(Ký, Đóng dấu)</div><div><b>Kế Toán Bên Bán</b><br>(Ký, Ghi Rõ Họ Tên)</div><div><b>Kế Toán Bên Mua</b><br>(Ký, Ghi Rõ Họ Tên)</div></div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script>
    <script>
      var _imgName = ${JSON.stringify('cong-no-' + (_nk(grp.brand).replace(/\s+/g, '-') || 'thuong-hieu') + '-' + ddmm(_last.toISO).replace('/', '-'))};
      async function _snap(){ if(!window.html2canvas){ alert('Thư viện ảnh đang tải, đợi 1-2 giây rồi bấm lại.'); return null; }
        return await window.html2canvas(document.getElementById('pg'),{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false}); }
      function _dl(blob){ var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=_imgName+'.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href);},3000); }
      async function copyImg(){ try{ var cv=await _snap(); if(!cv) return; cv.toBlob(async function(blob){ try{ await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]); alert('✓ Đã copy ẢNH phiếu — dán vào Zalo/Messenger (Ctrl+V).'); }catch(err){ _dl(blob); alert('Không copy trực tiếp được → đã TẢI ảnh .png về máy.'); } },'image/png'); }catch(e){ alert('Lỗi tạo ảnh: '+(e&&e.message||e)); } }
      async function downloadImg(){ try{ var cv=await _snap(); if(!cv) return; cv.toBlob(function(blob){ _dl(blob); },'image/png'); }catch(e){ alert('Lỗi tạo ảnh: '+(e&&e.message||e)); } }
    <\/script>
    </body></html>`;
    const w = window.open('', '_blank', 'width=1200,height=900');
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
  /* ===================================================================
     ĐỐI SOÁT FILE ↔ APP — up file ma trận (KH × ngày) → so tổng/ngày,
     liệt kê đơn THIẾU / DƯ / LỆCH để biết chính xác chỗ sai.
     =================================================================== */
  /* Convert giá trị ô ngày → ISO. Dùng UTC để KHỎI lệch 1 ngày (serial Excel = UTC midnight). */
  function cellToISO(v) {
    if (typeof v === 'number' && v > 40000 && v < 60000) {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return isNaN(d) ? '' : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    const m2 = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m2) return `${m2[3]}-${pad(m2[2])}-${pad(m2[1])}`;
    return '';
  }
  const _SUMLBL = /^(doanh thu|gi[áa] v[ốo]n|l[ợo]i nhu[ậaậ]n|s[ốo] đơn|t[ổoổ]ng|c[ộoộ]ng)/i;
  /* Parse workbook ma trận → { iso: {total, custs:[{name,amt}]} } */
  function parseMasterFile(wb) {
    const out = {};
    for (const sn of wb.SheetNames) {
      /* BỎ QUA sheet "NHẬP" (giá nhập/cost) — chỉ đối soát DOANH THU, tránh cộng gộp đôi cùng ngày */
      const snn = String(sn).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
      if (snn.includes('nhap')) continue;
      const grid = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
      let hr = -1, daycols = [];
      for (let r = 0; r < Math.min(grid.length, 10); r++) {
        const cols = [];
        for (let c = 1; c < (grid[r] || []).length; c++) { const iso = cellToISO(grid[r][c]); if (iso) cols.push([c, iso]); }
        if (cols.length >= 4) { hr = r; daycols = cols; break; }
      }
      if (hr < 0) continue;
      /* đoán đơn vị: nếu giá trị nhỏ (<100k) → file ghi NGHÌN đồng → ×1000 */
      const sample = [];
      for (let r = hr + 1; r < grid.length; r++) {
        const a = String(grid[r][0] || '').trim(); if (!a || _SUMLBL.test(a)) continue;
        for (const [c] of daycols) { const v = +grid[r][c]; if (v) sample.push(v); }
      }
      sample.sort((a, b) => a - b);
      const med = sample[Math.floor(sample.length / 2)] || 0;
      const mult = (med && med < 100000) ? 1000 : 1;
      for (let r = hr + 1; r < grid.length; r++) {
        const name = String(grid[r][0] || '').trim();
        if (!name || _SUMLBL.test(name)) continue;
        for (const [c, iso] of daycols) {
          const v = +grid[r][c]; if (!v) continue;
          const o = out[iso] || (out[iso] = { total: 0, custs: [] });
          const amt = Math.round(v * mult);
          o.total += amt; o.custs.push({ name, amt });
        }
      }
    }
    return out;
  }
  /* Token "đặc trưng" của 1 tên khách (bỏ từ chung) — để ghép master(tên tuyến) ↔ app(tên NH) */
  const _RC_STOP = new Set(['nh', 'bia', 'oi', 'do', 'cong', 'no', 'tuan', 'khach', 'quan', 'nhau', 'com', 'pho', 'cs', 'nha', 'hang', 'ngay', 'cua', 'so', 'duong', 'pkb', 'kem']);
  const _rcToks = s => _nk(s).split(' ').filter(t => t.length >= 3 && !_RC_STOP.has(t));
  /* Khớp file.custs ↔ cloud.orders.
     B1: GỘP đơn app theo KHÁCH (cộng Sáng+Chiều) — vì master gộp 1 ô/khách/ngày, app tách ca.
     B2: ghép theo TIỀN (±2500đ) greedy giảm dần → loại sạch cặp trùng tiền (đã gồm cả ca tách).
     B3: phần dư 2 bên thử ghép theo TÊN (token chung) → 'lệch tiền' (cùng khách khác số),
         còn lại miss = THIẾU HẲN (app không có đơn nào), extra = app DƯ HẲN. */
  function reconDay(fileCusts, cloudOrders) {
    /* B1 — gộp app theo khách */
    const agg = {};
    cloudOrders.forEach(o => {
      const k = o.key || _nk(o.name);
      const a = agg[k] || (agg[k] = { name: o.name, amt: 0, codes: [], tk: _rcToks(o.name) });
      a.amt += o.amt; if (o.code) a.codes.push(o.code);
    });
    let cl = Object.values(agg);
    const fc = fileCusts.map(x => ({ ...x, tk: _rcToks(x.name) }));
    /* B2 — ghép theo tiền */
    const missAmt = [];
    fc.slice().sort((a, b) => b.amt - a.amt).forEach(f => {
      let k = -1; for (let i = 0; i < cl.length; i++) { if (Math.abs(cl[i].amt - f.amt) <= 2500) { k = i; break; } }
      if (k < 0) missAmt.push(f); else cl.splice(k, 1);
    });
    /* B3 — phần dư: ghép theo tên (≥1 token chung) → lệch tiền */
    const diffAmt = [], miss = [];
    missAmt.forEach(f => {
      let bi = -1, bs = 0;
      cl.forEach((c, i) => { const ov = f.tk.filter(t => c.tk.includes(t)).length; if (ov > bs) { bs = ov; bi = i; } });
      if (bi >= 0) { diffAmt.push({ name: f.name, fileAmt: f.amt, appName: cl[bi].name, appAmt: cl[bi].amt, codes: cl[bi].codes }); cl.splice(bi, 1); }
      else miss.push(f);
    });
    return { miss, extra: cl, diff: diffAmt };   /* miss=thiếu hẳn · extra=app dư hẳn · diff=cùng khách lệch tiền */
  }
  window.cnReconcile = function () {
    if (!window.XLSX) { window.toast && window.toast('Thư viện Excel chưa tải — reload trang', 'warn'); return; }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xlsx,.xls';
    inp.onchange = e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = ev => {
        try {
          const wb = window.XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          const fileMap = parseMasterFile(wb);
          if (!Object.keys(fileMap).length) { window.toast && window.toast('Không tìm thấy bảng ma trận (hàng tiêu đề có các CỘT NGÀY) trong file', 'warn'); return; }
          renderReconcile(fileMap, f.name);
        } catch (err) { console.error(err); window.toast && window.toast('Lỗi đọc file: ' + err.message, 'warn'); }
      };
      rd.readAsArrayBuffer(f);
    };
    inp.click();
  };
  function renderReconcile(fileMap, fname) {
    const orders = S().get('orders', window.ORDERS || []) || [];
    const cloudMap = {};
    orders.forEach(o => {
      if (o.status === 'draft' || o.status === 'cancelled') return;
      const iso = orderISO(o); if (!iso || !fileMap[iso]) return;     /* chỉ ngày có trong file */
      const amt = +o.freight || 0; if (!amt) return;
      const cm = cloudMap[iso] || (cloudMap[iso] = { total: 0, orders: [] });
      /* key gộp theo KHÁCH (id ưu tiên, fallback tên chuẩn hoá) → gộp Sáng/Chiều khi đối soát */
      cm.total += amt; cm.orders.push({ key: o.cust || _nk(o.custName || ''), name: o.custName || o.cust || '—', amt, code: o.code });
    });
    /* Lọc theo khoảng ngày đang chọn trên trang (nếu có) — để đối soát đúng kỳ, bỏ tháng khác trong file */
    const fEl = document.getElementById('cnFrom'), tEl = document.getElementById('cnTo');
    const fromR = fEl && fEl.value, toR = tEl && tEl.value;
    let days = Object.keys(fileMap).sort();
    if (fromR && toR) days = days.filter(d => d >= fromR && d <= toR);
    const m = n => (+n || 0).toLocaleString('vi-VN');
    let gF = 0, gC = 0, body = '', drill = '';
    days.forEach(d => {
      const fT = fileMap[d].total, cT = (cloudMap[d] || {}).total || 0; const diff = cT - fT;
      gF += fT; gC += cT;
      const cls = Math.abs(diff) < 1 ? 'ok' : (diff < 0 ? 'low' : 'high');
      const tag = Math.abs(diff) < 1 ? '✓ khớp' : (diff < 0 ? `app THIẾU ${m(-diff)}` : `app DƯ ${m(diff)}`);
      body += `<tr class="rc-${cls}"><td><b>${ddmm(d)}</b></td><td class="num">${m(fT)}</td><td class="num">${m(cT)}</td><td class="num" style="font-weight:700">${diff > 0 ? '+' : ''}${m(diff)}</td><td style="font-size:11.5px">${tag}</td></tr>`;
      if (Math.abs(diff) >= 1000) {
        const { miss, extra, diff: dlist } = reconDay(fileMap[d].custs, (cloudMap[d] || {}).orders || []);
        const missSum = miss.reduce((s, x) => s + x.amt, 0), extraSum = extra.reduce((s, x) => s + x.amt, 0);
        if (miss.length || extra.length || dlist.length) {
          drill += `<details style="margin:6px 0;border:1px solid var(--line);border-radius:8px;padding:0"><summary style="padding:8px 12px;cursor:pointer;font-weight:700;color:var(--navy)">${ddmm(d)} — chênh ${diff > 0 ? '+' : ''}${m(diff)}đ${miss.length ? ` · ${miss.length} khách THIẾU HẲN (${m(missSum)}đ)` : ''}${extra.length ? ` · ${extra.length} app DƯ` : ''}${dlist.length ? ` · ${dlist.length} lệch tiền` : ''}</summary><div style="padding:8px 12px">`;
          if (miss.length) drill += `<div style="color:#B91C1C;font-weight:700;font-size:12px;margin-bottom:3px">✗ Có trong FILE, app KHÔNG có đơn nào (thiếu hẳn — cần nhập phiếu):</div>` + miss.map(x => `<div style="font-size:12px">• ${x.name} = <b>${m(x.amt)}</b></div>`).join('');
          if (dlist.length) drill += `<div style="color:#9333EA;font-weight:700;font-size:12px;margin:6px 0 3px">≠ Cùng khách nhưng LỆCH TIỀN (file ↔ app):</div>` + dlist.map(x => `<div style="font-size:12px">• ${x.name} <span style="color:var(--muted)">(app: ${x.appName})</span> · file <b>${m(x.fileAmt)}</b> ↔ app <b>${m(x.appAmt)}</b> = ${x.appAmt - x.fileAmt > 0 ? '+' : ''}${m(x.appAmt - x.fileAmt)}</div>`).join('');
          if (extra.length) drill += `<div style="color:#A16207;font-weight:700;font-size:12px;margin:6px 0 3px">+ App có khách này, FILE không có (app dư hẳn):</div>` + extra.map(x => `<div style="font-size:12px">• ${(x.codes || []).join(', ')} · ${x.name} = <b>${m(x.amt)}</b></div>`).join('');
          drill += `</div></details>`;
        }
      }
    });
    const gd = gC - gF;
    const html = `
      <style>
        .rc-tbl{width:100%;border-collapse:collapse;font-size:13px}
        .rc-tbl th,.rc-tbl td{padding:7px 10px;border-bottom:1px solid #EEF2F0;text-align:left}
        .rc-tbl th{background:#F0FDF4;color:#15803D;font-weight:700;position:sticky;top:0}
        .rc-tbl td.num{text-align:right;font-variant-numeric:tabular-nums}
        .rc-low td{background:#FEF2F2}.rc-high td{background:#FFFBEB}.rc-ok td{background:#F0FDF4}
      </style>
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">📄 File: <b>${fname || ''}</b> · so <b>tổng tiền/ngày</b> giữa file (nguồn) và đơn trong app. <span style="color:#B91C1C">đỏ = app thiếu</span> · <span style="color:#A16207">vàng = app dư</span>.</div>
      <div style="overflow:auto;max-height:46vh;border:1px solid var(--line);border-radius:8px">
        <table class="rc-tbl"><thead><tr><th>Ngày</th><th class="num">FILE</th><th class="num">APP</th><th class="num">CHÊNH</th><th>Tình trạng</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr style="background:#1B5E20;color:#fff;font-weight:700"><td>TỔNG ${days.length} ngày</td><td class="num">${m(gF)}</td><td class="num">${m(gC)}</td><td class="num">${gd > 0 ? '+' : ''}${m(gd)}</td><td>${gd < 0 ? 'app thiếu ' + m(-gd) : gd > 0 ? 'app dư ' + m(gd) : '✓ khớp'}</td></tr></tfoot></table>
      </div>
      <div style="margin-top:12px"><div style="font-weight:700;color:var(--navy);margin-bottom:4px">🔍 Chi tiết ngày lệch (đơn thiếu/dư):</div>${drill || '<div style="color:#15803D">✓ Không ngày nào lệch ≥1.000đ.</div>'}</div>`;
    window.openModal('📋 Đối soát File ↔ App', html, { width: 760 });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
