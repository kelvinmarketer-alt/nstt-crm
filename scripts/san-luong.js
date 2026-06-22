/* =========================================================
   Nông Sản Tuấn Tú — BÁO CÁO SẢN LƯỢNG THEO SẢN PHẨM
   Ma trận Sản phẩm × Thời gian (ngày / tháng / quý).
   Lọc theo TỪNG ĐỐI TÁC hoặc TỔNG TOÀN CÔNG TY (Tất cả).
   Tự sinh từ ĐƠN HÀNG (items: số lượng theo từng đơn vị).
   ========================================================= */
(function () {
  const S = () => window.STORE;
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /* ngày 1 đơn → ISO (ưu tiên ngày GIAO) */
  function orderISO(o) {
    const raw = o.deliverDate || o.date || o.createdAt || '';
    let m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return '';
  }
  const unitNorm = u => { let s = (u || '').toString().trim().toLowerCase(); const m = s.match(/\(([^)]+)\)/); if (m) s = m[1].trim(); return s || 'đv'; };
  const fmtNum = n => { const r = Math.round(n * 100) / 100; return Number.isInteger(r) ? r.toLocaleString('vi-VN') : r.toLocaleString('vi-VN', { maximumFractionDigits: 2 }); };

  /* === Thời gian theo độ gộp === */
  function periodOf(iso, gran) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return '';
    if (gran === 'thang') return `${m[1]}-${m[2]}`;
    if (gran === 'quy') { const q = Math.floor((+m[2] - 1) / 3) + 1; return `${m[1]}-Q${q}`; }
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  function periodLabel(key, gran) {
    if (gran === 'thang') { const m = key.match(/(\d{4})-(\d{2})/); return m ? `Th${+m[2]}/${m[1]}` : key; }
    if (gran === 'quy') { const m = key.match(/(\d{4})-Q(\d)/); return m ? `Q${m[2]}/${m[1]}` : key; }
    const m = key.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : key;
  }
  function periodList(fromISO, toISO, gran) {
    const out = [], seen = new Set();
    let d = new Date(fromISO + 'T00:00:00'), end = new Date(toISO + 'T00:00:00');
    if (isNaN(d) || isNaN(end) || d > end) return out;
    let guard = 0;
    while (d <= end && guard++ < 4000) {
      const k = periodOf(isoOf(d), gran);
      if (!seen.has(k)) { seen.add(k); out.push(k); }
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  /* === Build dữ liệu === */
  function build(fromISO, toISO, gran, custFilter) {
    const orders = S().get('orders', window.ORDERS || []) || [];
    const periods = periodList(fromISO, toISO, gran);
    const fromD = new Date(fromISO + 'T00:00:00'), toD = new Date(toISO + 'T23:59:59');
    const rows = {};
    let nOrders = 0;
    orders.forEach(o => {
      if (o.status === 'draft' || o.status === 'cancelled') return;
      if (custFilter && (o.cust || o.custId) !== custFilter) return;
      const iso = orderISO(o); if (!iso) return;
      const od = new Date(iso + 'T00:00:00'); if (isNaN(od) || od < fromD || od > toD) return;
      const per = periodOf(iso, gran);
      nOrders++;
      (Array.isArray(o.items) ? o.items : []).forEach(it => {
        const qty = +it.qty || 0; if (!qty) return;
        const unit = unitNorm(it.unit);
        const name = (it.name || '').trim() || '(không tên)';
        const key = (it.id || ('x:' + name.toLowerCase())) + '|' + unit;
        const r = rows[key] || (rows[key] = { name, unit, byPeriod: {}, total: 0 });
        r.byPeriod[per] = (r.byPeriod[per] || 0) + qty;
        r.total += qty;
      });
    });
    const list = Object.values(rows).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
    return { periods, list, nOrders };
  }

  const ubFmt = obj => Object.keys(obj).sort((a, b) => a === 'kg' ? -1 : b === 'kg' ? 1 : a.localeCompare(b, 'vi')).map(u => `${fmtNum(obj[u])} ${u}`).join(' · ');

  let _last = null;
  let _view = 'product';   /* 'product' = SP × thời gian · 'cust' = danh sách đối tác (1 khách/dòng) */
  const ctl = id => document.getElementById(id);

  function updateViewBtns() {
    document.querySelectorAll('[data-slview]').forEach(b => {
      const on = b.getAttribute('data-slview') === _view;
      b.style.background = on ? '#15803D' : '#fff';
      b.style.color = on ? '#fff' : 'var(--navy)';
    });
  }
  window.slSetView = function (v) { _view = (v === 'cust') ? 'cust' : 'product'; updateViewBtns(); window.slRender(); };

  window.slRender = function () {
    const fromISO = ctl('slFrom').value, toISO = ctl('slTo').value;
    if (!fromISO || !toISO) { window.toast && window.toast('Chọn từ ngày → đến ngày', 'warn'); return; }
    updateViewBtns();
    if (_view === 'cust') { renderCustView(fromISO, toISO); return; }

    const gran = ctl('slGran').value || 'ngay';
    const custFilter = ctl('slCust').value || '';
    const custName = custFilter ? (ctl('slCust').selectedOptions[0] || {}).textContent : '';
    const data = build(fromISO, toISO, gran, custFilter);
    _last = { ...data, fromISO, toISO, gran, custFilter, custName };
    const tbl = ctl('slTable');

    if (!data.list.length) {
      tbl.innerHTML = `<tbody><tr><td style="padding:30px;text-align:center;color:var(--muted)">Không có mặt hàng nào trong khoảng đã chọn${custFilter ? ' (đối tác này)' : ''}. (Đơn phải có chi tiết mặt hàng + không phải nháp/huỷ.)</td></tr></tbody>`;
      ctl('slSummary').textContent = '';
      return;
    }
    /* Tổng kg theo từng kỳ (gọn 1 dòng) + tổng theo mọi đơn vị (cho dòng tóm tắt) */
    const kgPer = {}, totUnit = {};
    let kgTot = 0;
    data.list.forEach(r => {
      totUnit[r.unit] = (totUnit[r.unit] || 0) + r.total;
      if (r.unit === 'kg') { data.periods.forEach(p => kgPer[p] = (kgPer[p] || 0) + (r.byPeriod[p] || 0)); kgTot += r.total; }
    });

    const head = `<thead><tr>
      <th class="par">SẢN PHẨM (${data.list.length})</th>
      ${data.periods.map(p => `<th class="num">${periodLabel(p, gran)}</th>`).join('')}
      <th class="num" style="background:#DCFCE7">TỔNG</th>
    </tr></thead>`;
    const body = `<tbody>${data.list.map(r => `<tr>
      <td class="par" title="${r.name} (${r.unit})">${r.name} <span style="color:#94A3B8;font-size:11px">/${r.unit}</span></td>
      ${data.periods.map(p => { const v = r.byPeriod[p] || 0; return `<td class="num ${v ? '' : 'z'}">${v ? fmtNum(v) : '·'}</td>`; }).join('')}
      <td class="num"><b>${fmtNum(r.total)}</b> <span style="color:#94A3B8;font-size:10px">${r.unit}</span></td>
    </tr>`).join('')}</tbody>`;
    const foot = `<tfoot><tr>
      <td class="par" title="Tổng kg mỗi kỳ — đơn vị khác xem ở dòng Tổng sản lượng phía trên">TỔNG kg/kỳ</td>
      ${data.periods.map(p => `<td class="num">${kgPer[p] ? fmtNum(kgPer[p]) : '·'}</td>`).join('')}
      <td class="num"><b>${fmtNum(kgTot)} kg</b></td>
    </tr></tfoot>`;
    tbl.innerHTML = head + body + foot;

    const granLabel = gran === 'thang' ? 'tháng' : gran === 'quy' ? 'quý' : 'ngày';
    const backLink = custFilter ? ` · <a href="javascript:void(0)" onclick="window.slSetView('cust')" style="color:var(--navy);font-weight:700">← Tất cả đối tác</a>` : '';
    ctl('slSummary').innerHTML =
      `📅 <b>${periodLabel(periodOf(fromISO, 'ngay'), 'ngay')} → ${periodLabel(periodOf(toISO, 'ngay'), 'ngay')}</b> · gộp theo <b>${granLabel}</b> · `
      + `phạm vi: <b>${custFilter ? custName : 'TOÀN CÔNG TY'}</b> · ${data.list.length} mã SP · ${data.nOrders} đơn${backLink}<br>`
      + `📦 Tổng sản lượng: <b style="color:#15803D">${ubFmt(totUnit)}</b>`;
  };

  /* === XEM THEO ĐỐI TÁC: 1 khách = 1 dòng → bấm để xem tổng SP của khách đó === */
  function buildCustList(fromISO, toISO) {
    const orders = S().get('orders', window.ORDERS || []) || [];
    const customers = S().get('customers', window.CUSTOMERS || []) || [];
    const cmap = {}; customers.forEach(c => cmap[c.id] = c);
    const fromD = new Date(fromISO + 'T00:00:00'), toD = new Date(toISO + 'T23:59:59');
    const m = {};
    orders.forEach(o => {
      if (o.status === 'draft' || o.status === 'cancelled') return;
      const iso = orderISO(o); if (!iso) return;
      const od = new Date(iso + 'T00:00:00'); if (isNaN(od) || od < fromD || od > toD) return;
      const id = o.cust || o.custId; if (!id) return;
      const r = m[id] || (m[id] = { id, name: o.custName || (cmap[id] && cmap[id].name) || id, orders: 0, units: {}, sku: new Set() });
      r.orders++;
      (Array.isArray(o.items) ? o.items : []).forEach(it => {
        const q = +it.qty || 0; if (!q) return; const u = unitNorm(it.unit);
        r.units[u] = (r.units[u] || 0) + q;
        r.sku.add((it.id || it.name || '') + '|' + u);
      });
    });
    return Object.values(m).map(r => ({ id: r.id, name: r.name, orders: r.orders, units: r.units, nSku: r.sku.size }))
      .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name, 'vi'));
  }
  function renderCustView(fromISO, toISO) {
    const list = buildCustList(fromISO, toISO);
    const tbl = ctl('slTable');
    if (!list.length) { tbl.innerHTML = `<tbody><tr><td style="padding:30px;text-align:center;color:var(--muted)">Không có đơn nào trong khoảng đã chọn.</td></tr></tbody>`; ctl('slSummary').textContent = ''; return; }
    tbl.innerHTML = `<thead><tr>
        <th class="par">ĐỐI TÁC (${list.length})</th>
        <th class="num">SỐ ĐƠN</th><th class="num">SỐ MÃ SP</th>
        <th>TỔNG SẢN LƯỢNG (theo đơn vị)</th>
      </tr></thead>
      <tbody>${list.map(r => `<tr style="cursor:pointer" onclick="window.slDrillCust('${(r.id || '').replace(/'/g, "\\'")}')">
        <td class="par"><a href="javascript:void(0)" title="Bấm xem chi tiết sản phẩm của ${(r.name || '').replace(/"/g, '&quot;')}" style="color:var(--navy);font-weight:700;text-decoration:none;border-bottom:1px dotted var(--navy)">${r.name}</a></td>
        <td class="num"><b>${r.orders}</b></td>
        <td class="num">${r.nSku}</td>
        <td style="white-space:normal;font-size:11.5px;color:#15803D;font-weight:600">${ubFmt(r.units)}</td>
      </tr>`).join('')}</tbody>`;
    const totOrders = list.reduce((s, r) => s + r.orders, 0);
    ctl('slSummary').innerHTML = `👥 <b>${list.length}</b> đối tác · ${totOrders} đơn · khoảng <b>${periodLabel(periodOf(fromISO, 'ngay'), 'ngay')} → ${periodLabel(periodOf(toISO, 'ngay'), 'ngay')}</b> — 👉 bấm 1 đối tác để xem <b>tổng sản phẩm</b> của họ.`;
  }
  window.slDrillCust = function (id) {
    const sel = ctl('slCust'); if (sel) sel.value = id;
    _view = 'product';
    window.slRender();
  };

  /* === Preset === */
  window.slPreset = function (kind) {
    const now = window.todayDate ? window.todayDate() : new Date();
    const y = now.getFullYear(), m = now.getMonth();
    let from, to;
    if (kind === 'month') { from = new Date(y, m, 1); to = new Date(y, m + 1, 0); }
    else if (kind === 'prev') { from = new Date(y, m - 1, 1); to = new Date(y, m, 0); }
    else if (kind === 'quarter') { const q = Math.floor(m / 3); from = new Date(y, q * 3, 1); to = new Date(y, q * 3 + 3, 0); }
    else if (kind === 'year') { from = new Date(y, 0, 1); to = new Date(y, 11, 31); }
    ctl('slFrom').value = isoOf(from); ctl('slTo').value = isoOf(to);
    if (kind === 'quarter' || kind === 'year') ctl('slGran').value = kind === 'year' ? 'thang' : 'thang';
    window.slRender();
  };

  /* === Xuất Excel === */
  window.slExport = function () {
    if (!window.XLSX) { window.toast && window.toast('Chưa tải thư viện Excel — reload', 'warn'); return; }
    if (!_last || !_last.list.length) { window.toast && window.toast('Chưa có dữ liệu — bấm "Xem báo cáo" trước', 'warn'); return; }
    const { periods, list, gran, custFilter, custName, fromISO, toISO } = _last;
    const aoa = [];
    aoa.push([`SẢN LƯỢNG THEO SẢN PHẨM · ${custFilter ? custName : 'TOÀN CÔNG TY'} · ${fromISO} → ${toISO} · gộp theo ${gran}`]);
    aoa.push(['SẢN PHẨM', 'ĐVT', ...periods.map(p => periodLabel(p, gran)), 'TỔNG']);
    list.forEach(r => {
      aoa.push([r.name, r.unit, ...periods.map(p => r.byPeriod[p] || ''), r.total]);
    });
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 30 }, { wch: 7 }, ...periods.map(() => ({ wch: 9 })), { wch: 11 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Sản lượng');
    const fn = `SAN-LUONG_${custFilter || 'TOAN-CTY'}_${fromISO}_${toISO}.xlsx`;
    window.XLSX.writeFile(wb, fn);
    window.toast && window.toast('✓ Đã xuất ' + fn, 'success');
  };

  /* === Init === */
  function populateCust() {
    const sel = ctl('slCust'); if (!sel) return;
    const custs = (S().get('customers', window.CUSTOMERS || []) || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    sel.innerHTML = `<option value="">🏢 Tất cả đối tác (toàn công ty)</option>` +
      custs.map(c => `<option value="${c.id}">${c.code ? c.code + ' · ' : ''}${(c.name || '').replace(/</g, '')}</option>`).join('');
  }
  function init() {
    if (!ctl('slFrom')) return;
    if (window.renderAppShell) window.renderAppShell('san-luong', 'Sản lượng theo sản phẩm');
    const now = window.todayDate ? window.todayDate() : new Date();
    ctl('slFrom').value = isoOf(new Date(now.getFullYear(), now.getMonth(), 1));
    ctl('slTo').value = isoOf(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    populateCust();
    window.slRender();
    if (S().subscribe) {
      S().subscribe('orders', () => window.slRender());
      S().subscribe('customers', () => populateCust());
      S().subscribe('__preloaded__', k => { if (k === 'orders' || k === 'customers') { populateCust(); window.slRender(); } });
    }
  }
  if (document.readyState !== 'loading') setTimeout(init, 60); else document.addEventListener('DOMContentLoaded', () => setTimeout(init, 60));
})();
