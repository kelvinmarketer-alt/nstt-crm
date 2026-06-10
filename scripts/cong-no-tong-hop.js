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
    const custById = {}; customers.forEach(c => custById[c.id] = c);
    const days = dayList(fromISO, toISO);
    const daySet = new Set(days);

    const rows = {};
    orders.forEach(o => {
      if (o.status === 'draft' || o.status === 'cancelled') return;   /* bỏ nháp/huỷ */
      const iso = orderISO(o);
      if (!daySet.has(iso)) return;
      const key = o.cust || o.custName || '—';
      const name = o.custName || (custById[o.cust] && custById[o.cust].name) || key;
      const amt = +o.freight || 0;
      if (!amt) return;
      const r = rows[key] || (rows[key] = { key, name, daily: {}, total: 0 });
      r.daily[iso] = (r.daily[iso] || 0) + amt;
      r.total += amt;
    });
    /* Đã thu trong kỳ (phiếu thu) + công nợ hiện tại */
    Object.values(rows).forEach(r => {
      r.paid = ledger.filter(e => e.custId === r.key && e.type === 'payment' && daySet.has(ledgerISO(e)))
        .reduce((s, e) => s + (+e.amount || 0), 0);
      r.remain = r.total - r.paid;
      r.debtNow = (custById[r.key] && +custById[r.key].debt) || 0;
    });
    const list = Object.values(rows).sort((a, b) => b.total - a.total);
    return { days, list };
  }

  let _last = null;   /* cache cho export */

  window.cnRender = function () {
    const fromISO = document.getElementById('cnFrom').value;
    const toISO = document.getElementById('cnTo').value;
    const tbl = document.getElementById('cnTable');
    if (!fromISO || !toISO) { window.toast && window.toast('Chọn từ ngày → đến ngày', 'warn'); return; }
    const data = build(fromISO, toISO);
    _last = { ...data, fromISO, toISO };
    const unit = +(document.getElementById('cnUnit').value) || 1;
    const fmt = v => { const n = v / unit; return n ? (unit === 1 ? Math.round(n).toLocaleString('vi-VN') : (Math.round(n * 10) / 10).toLocaleString('vi-VN')) : ''; };

    if (!data.list.length) {
      tbl.innerHTML = `<tbody><tr><td style="padding:30px;text-align:center;color:var(--muted)">Không có đơn nào trong khoảng ${ddmm(fromISO)}–${ddmm(toISO)}. (Đơn phải được nhập trong app + không phải nháp/huỷ.)</td></tr></tbody>`;
      document.getElementById('cnSummary').textContent = '';
      return;
    }
    /* Tổng cột theo ngày + tổng chung */
    const colTot = {}; data.days.forEach(d => colTot[d] = 0);
    let gT = 0, gPaid = 0, gRemain = 0, gDebt = 0;
    data.list.forEach(r => { data.days.forEach(d => colTot[d] += (r.daily[d] || 0)); gT += r.total; gPaid += r.paid; gRemain += r.remain; gDebt += r.debtNow; });

    const head = `<thead><tr>
      <th class="par">ĐỐI TÁC (${data.list.length})</th>
      ${data.days.map(d => `<th class="num">${ddmm(d)}</th>`).join('')}
      <th class="num" style="background:#DCFCE7">TỔNG PS</th>
      <th class="num" style="background:#DCFCE7">ĐÃ THU</th>
      <th class="num" style="background:#FEF3C7">CHƯA THU</th>
      <th class="num" style="background:#FEE2E2">CÔNG NỢ HT</th>
    </tr></thead>`;
    const body = `<tbody>${data.list.map(r => `<tr>
      <td class="par" title="${(r.name || '').replace(/"/g, '&quot;')}">${r.name}</td>
      ${data.days.map(d => { const v = r.daily[d] || 0; return `<td class="num ${v ? '' : 'z'}">${v ? fmt(v) : '·'}</td>`; }).join('')}
      <td class="num"><b>${fmt(r.total)}</b></td>
      <td class="num cn-paid">${r.paid ? fmt(r.paid) : '·'}</td>
      <td class="num cn-owe">${r.remain ? fmt(r.remain) : '·'}</td>
      <td class="num">${r.debtNow ? fmt(r.debtNow) : '·'}</td>
    </tr>`).join('')}</tbody>`;
    const foot = `<tfoot><tr>
      <td class="par">TỔNG CỘNG</td>
      ${data.days.map(d => `<td class="num">${colTot[d] ? fmt(colTot[d]) : '·'}</td>`).join('')}
      <td class="num">${fmt(gT)}</td>
      <td class="num">${fmt(gPaid)}</td>
      <td class="num">${fmt(gRemain)}</td>
      <td class="num">${fmt(gDebt)}</td>
    </tr></tfoot>`;
    tbl.innerHTML = head + body + foot;

    const dvi = unit === 1 ? 'đồng' : 'nghìn đồng';
    document.getElementById('cnSummary').innerHTML =
      `📅 <b>${ddmm(fromISO)} → ${ddmm(toISO)}</b> · ${data.days.length} ngày · ${data.list.length} đối tác · đơn vị: <b>${dvi}</b><br>` +
      `💰 Tổng phát sinh <b>${(gT).toLocaleString('vi-VN')}đ</b> · đã thu <b style="color:#16A34A">${(gPaid).toLocaleString('vi-VN')}đ</b> · chưa thu <b style="color:#B91C1C">${(gRemain).toLocaleString('vi-VN')}đ</b>`;
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
    aoa.push(['ĐỐI TÁC', ...days.map(ddmm), 'TỔNG PHÁT SINH', 'ĐÃ THU', 'CHƯA THU', 'CÔNG NỢ HIỆN TẠI']);
    const colTot = {}; days.forEach(d => colTot[d] = 0);
    let gT = 0, gPaid = 0, gRemain = 0, gDebt = 0;
    list.forEach(r => {
      const row = [r.name];
      days.forEach(d => { const v = r.daily[d] || 0; colTot[d] += v; row.push(v ? r1(v) : ''); });
      row.push(r1(r.total), r1(r.paid), r1(r.remain), r1(r.debtNow));
      gT += r.total; gPaid += r.paid; gRemain += r.remain; gDebt += r.debtNow;
      aoa.push(row);
    });
    aoa.push(['TỔNG CỘNG', ...days.map(d => colTot[d] ? r1(colTot[d]) : ''), r1(gT), r1(gPaid), r1(gRemain), r1(gDebt)]);
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 28 }, ...days.map(() => ({ wch: 9 })), { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Công nợ');
    const fn = `CONG-NO-TONG-HOP_${fromISO}_${toISO}.xlsx`;
    window.XLSX.writeFile(wb, fn);
    window.toast && window.toast('✓ Đã xuất ' + fn, 'success');
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
