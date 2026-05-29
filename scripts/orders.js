/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Trang Đơn hàng (Full CRUD)
   ========================================================= */
(function () {
  const SVC = Object.fromEntries((window.SERVICE_TYPES || []).map(s => [s.id, s]));
  const TM  = Object.fromEntries((window.TRANSPORT_MODES || []).map(t => [t.id, t]));
  let orders = window.STORE.get('orders', window.ORDERS || []);
  /* Migration: localStorage còn đơn schema cũ (logistics, chưa có items) → seed lại đơn nông sản */
  if (orders.length && !orders.some(o => Array.isArray(o.items)) && (window.ORDERS || []).length) {
    window.STORE.set('orders', window.ORDERS);
    orders = window.ORDERS;
  }
  let currentStatus = null;
  let currentService = null;
  let orderItems = [];   // mặt hàng của đơn đang tạo (sản phẩm + giá ngày)

  const STATUS = {
    confirmed:  { icon:'📝', label:'Mới',         sub:'chờ điều phối',     color:'#3B82F6' },
    pickup:     { icon:'📦', label:'Đang lấy',    sub:'shipper đến lấy',   color:'#F59E0B' },
    transit:    { icon:'🚚', label:'Đang giao',   sub:'trên đường',        color:'#0EA5E9' },
    delivered:  { icon:'✓',  label:'Đã giao',     sub:'KH đã nhận',        color:'#16A34A' },
    reconciled: { icon:'💰', label:'Đối soát',    sub:'đã thu/chi xong',   color:'#15803D' },
    returned:   { icon:'↩',  label:'Đã trả hàng', sub:'KH trả lại sau khi nhận', color:'#EA580C' },
    cancelled:  { icon:'✕',  label:'Đã hủy',      sub:'không vận chuyển',  color:'#DC2626' },
  };
  const STEPS = ['confirmed','pickup','transit','delivered','reconciled'];
  /* Các trạng thái "kết thúc" — không cho chuyển tiếp theo pipeline */
  const TERMINAL_STATUSES = ['cancelled', 'returned'];
  /* Trạng thái chọn được trong dropdown — bao gồm cả off-pipeline */
  const ALL_STATUSES = [...STEPS, 'returned', 'cancelled'];

  function renderPipeline() {
    const counts = {};
    orders.forEach(o => counts[o.status] = (counts[o.status]||0) + 1);
    const total = orders.length;
    document.getElementById('pipeline').innerHTML = Object.entries(STATUS).map(([k, v]) => {
      const cnt = counts[k] || 0;
      const pct = total ? Math.round(cnt/total*100) : 0;
      return `<div class="pipe-card s-${k} ${currentStatus===k?'active':''}" onclick="filterStatus('${k}')">
        <div class="lab">${v.icon} ${v.label}</div>
        <div class="val">${cnt}</div>
        <div class="sub">${v.sub} · ${pct}%</div>
      </div>`;
    }).join('');
  }

  function renderServiceChips() {
    const counts = { all: orders.length };
    orders.forEach(o => counts[o.serviceType] = (counts[o.serviceType]||0)+1);
    const html = `<button class="chip ${!currentService?'active':''}" onclick="filterService(null)">Tất cả <span class="cnt">${counts.all}</span></button>` +
      (window.SERVICE_TYPES||[]).map(s =>
        `<button class="chip ${currentService===s.id?'active':''}" onclick="filterService('${s.id}')" style="${currentService===s.id?'background:'+s.color+';color:#fff;border-color:'+s.color:''}">${s.icon} ${s.label} <span class="cnt">${counts[s.id]||0}</span></button>`
      ).join('');
    document.getElementById('serviceChips').innerHTML = html;
  }

  window.filterStatus = function(k) {
    currentStatus = currentStatus === k ? null : k;
    renderPipeline(); render();
  };
  window.filterService = function(id) {
    currentService = id;
    renderServiceChips(); render();
  };

  function render() {
    orders = window.STORE.get('orders', window.ORDERS || []);
    const rows = orders.filter(match);
    document.getElementById('rowCount').textContent =
      `${rows.length} / ${orders.length} đơn`
      + (currentStatus ? ` · ${STATUS[currentStatus].label}` : '')
      + (currentService ? ` · ${SVC[currentService].label}` : '');
    document.getElementById('footCount').textContent = rows.length;
    renderPipeline();
    renderServiceChips();

    if (!rows.length) {
      document.getElementById('tbody').innerHTML =
        `<tr><td colspan="11" style="padding:40px;text-align:center;color:var(--muted)">Không có đơn nào khớp.</td></tr>`;
      return;
    }

    document.getElementById('tbody').innerHTML = rows.map(o => {
      const st = STATUS[o.status];
      const svc = SVC[o.serviceType] || {icon:'❓', label:o.serviceType, color:'#666'};
      const tm = o.transportMode ? TM[o.transportMode] : null;
      return `<tr data-code="${o.code}">
        <td onclick="event.stopPropagation()"><div class="checkbox" onclick="this.classList.toggle('on')"></div></td>
        <td><b style="color:var(--navy)">${o.code}</b>
            <div style="margin-top:2px">
              <span class="svc-tag" style="background:${svc.color}20;color:${svc.color}">${svc.icon} ${svc.label}</span>
              ${tm ? `<span class="tm-tag">${tm.icon} ${tm.label}</span>` : ''}
            </div></td>
        <td class="hide-sm" data-field="date" title="Click để sửa ngày đặt" style="font-size:12px;color:var(--muted)">${o.date}</td>
        <td>
          <div style="font-weight:600" data-field="custName" title="Click để sửa tên KH">${o.custName}</div>
          <div style="font-size:11.5px;color:var(--muted)">${o.cust} · <span data-field="staff" title="Click để đổi NV phụ trách">${o.staff}</span></div>
        </td>
        <td class="hide-md" data-field="drop" title="Click để sửa địa chỉ giao" style="font-size:12px">${(o.drop || '—').split(',').slice(0, 2).join(',')}</td>
        <td class="hide-md" style="font-size:12px">${o.qty} ${o.unit.toLowerCase()}${o.weight ? ' · '+o.weight+'kg' : ''}</td>
        <td class="num" data-field="freight" title="Click để sửa tiền hàng">${window.fmt(o.freight)}</td>
        <td class="num hide-md" data-field="cod" title="Click để sửa COD">${o.cod ? window.fmt(o.cod) : '—'}</td>
        <td class="hide-md" style="font-size:12px">
          <div><span data-field="driverName" title="Click để đổi shipper">${o.driverName}</span>${o.external?' <span class="alert-badge warn" style="font-size:9px">ĐT ngoài</span>':''}</div>
          <div style="color:var(--muted);font-size:11px">${o.vehicle}${o.external && o.partnerCost?' · '+window.fmtShort(o.partnerCost)+'đ':''}</div>
        </td>
        <td onclick="event.stopPropagation()">
          <select class="status-select status-select-${o.status}" data-code="${o.code}" data-act="status"
            title="Đổi trạng thái đơn"
            style="border:1px solid var(--line);border-radius:7px;padding:5px 8px;font-size:11.5px;font-weight:700;cursor:pointer;background:${st.color}15;color:${st.color};min-width:130px">
            ${ALL_STATUSES.map(k => `<option value="${k}" ${o.status===k?'selected':''}>${STATUS[k].icon} ${STATUS[k].label}</option>`).join('')}
          </select>
        </td>
        <td onclick="event.stopPropagation()">
          <div class="row-actions">
            <button title="In phiếu giao hàng / xác nhận / xuất kho (mở dialog chọn 3 loại)" data-act="print" data-code="${o.code}">🖨</button>
            ${(o.status === 'delivered' || o.status === 'settled') ? `<button title="🧾 Phiếu xuất kho kiêm HĐ bán hàng — gửi KH sau khi giao xong" data-act="deliveryNote" data-code="${o.code}" style="color:#C00000">🧾</button>` : ''}
            <button title="Xem thông tin đơn (mở chi tiết bên phải)" data-act="edit" data-code="${o.code}">👁</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    document.querySelectorAll('#tbody tr[data-code]').forEach(tr => {
      tr.onclick = () => openOrder(tr.dataset.code);
    });
    document.querySelectorAll('#tbody button[data-act]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const code = btn.dataset.code;
        const act = btn.dataset.act;
        if (act === 'print') window.printOrder(code);
        else if (act === 'deliveryNote') window.printDeliveryNote && window.printDeliveryNote(code);
        else if (act === 'edit') openOrder(code);
      };
    });
    /* Wire dropdown đổi trạng thái */
    document.querySelectorAll('#tbody select.status-select').forEach(sel => {
      sel.onchange = (e) => {
        e.stopPropagation();
        changeOrderStatus(sel.dataset.code, sel.value);
      };
      sel.onclick = e => e.stopPropagation();
    });

    /* Inline edit (click cell = sửa nhanh) */
    if (window.attachInlineEdit) {
      const tb = document.getElementById('tbody');
      const tbl = tb.closest('table');
      if (tbl) {
        if (!tbl.id) tbl.id = 'tblOrders';
        window.attachInlineEdit('#' + tbl.id, {
          store: 'orders',
          idAttr: 'data-code',
          fields: {
            date:       { type: 'text' },
            custName:   { type: 'text' },
            staff:      { type: 'text' },
            drop:       { type: 'textarea', format: v => (v || '—').split(',').slice(0, 2).join(',') },
            freight:    { type: 'number', parse: v => +String(v).replace(/[^0-9.-]/g,'')||0, format: v => window.fmt(v) },
            cod:        { type: 'number', parse: v => +String(v).replace(/[^0-9.-]/g,'')||0, format: v => v ? window.fmt(v) : '—' },
            driverName: { type: 'text' },
          }
        });
      }
    }
  }

  function match(o) {
    if (currentStatus && o.status !== currentStatus) return false;
    if (currentService && o.serviceType !== currentService) return false;
    const q = document.getElementById('qSearch').value.trim().toLowerCase();
    if (q && ![o.code, o.custName, o.driverName, o.vehicle, o.cust].some(x => (x||'').toLowerCase().includes(q))) return false;
    const tm = document.getElementById('fMode').value;
    if (tm && o.transportMode !== tm) return false;
    const dr = document.getElementById('fDriver').value;
    if (dr && o.driverName !== dr) return false;
    const stf = document.getElementById('fStaff').value;
    if (stf && o.staff !== stf) return false;
    return true;
  }

  window.clearOrderFilters = function() {
    ['fMode','fDriver','fStaff'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('qSearch').value = '';
    currentStatus = null;
    currentService = null;
    render();
  };
  ['qSearch','fMode','fDriver','fStaff'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', render);
  });

  /* === Status flow === */
  function advanceStatus(code) {
    const o = orders.find(x => x.code === code);
    if (!o) return;
    const i = STEPS.indexOf(o.status);
    if (i < 0 || i >= STEPS.length - 1) return;
    changeOrderStatus(code, STEPS[i + 1]);
  }

  /* Đổi sang trạng thái BẤT KỲ — gọi từ dropdown. Auto adjust doanh thu KH khi cần. */
  function changeOrderStatus(code, newStatus) {
    const o = orders.find(x => x.code === code);
    if (!o || !STATUS[newStatus] || o.status === newStatus) return;
    const oldStatus = o.status;

    /* Confirm cho các trạng thái "kết thúc" hoặc bước nhảy lùi */
    const isFinal = TERMINAL_STATUSES.includes(newStatus);
    const oldIdx = STEPS.indexOf(oldStatus);
    const newIdx = STEPS.indexOf(newStatus);
    const isBackward = oldIdx >= 0 && newIdx >= 0 && newIdx < oldIdx;
    if (isFinal || isBackward) {
      const verb = newStatus === 'cancelled' ? 'HỦY' : newStatus === 'returned' ? 'TRẢ HÀNG' : 'lùi trạng thái';
      let extraNote = '';
      if (newStatus === 'returned') extraNote = '\n\n⚠️ Doanh thu + công nợ KH sẽ bị TRỪ tự động.';
      if (newStatus === 'cancelled' && (oldStatus === 'delivered' || oldStatus === 'reconciled')) extraNote = '\n\n⚠️ KH đã nhận — không nên hủy. Dùng "Đã trả hàng" thì hợp lý hơn.';
      if (!confirm(`${verb} đơn ${code}?\nTừ "${STATUS[oldStatus].label}" → "${STATUS[newStatus].label}"${extraNote}`)) {
        /* Revert dropdown UI */
        const sel = document.querySelector(`#tbody select.status-select[data-code="${code}"]`);
        if (sel) sel.value = oldStatus;
        return;
      }
      /* Lấy lý do nếu hủy/trả */
      if (newStatus === 'cancelled' || newStatus === 'returned') {
        const reason = prompt(`Lý do ${verb}? (để trống nếu không cần)`, '') || '';
        const reasonKey = newStatus === 'cancelled' ? 'cancelReason' : 'returnReason';
        window.STORE.update('orders', code, { status: newStatus, [reasonKey]: reason, [newStatus + 'At']: new Date().toISOString() });
      } else {
        window.STORE.update('orders', code, { status: newStatus });
      }
    } else {
      window.STORE.update('orders', code, { status: newStatus });
    }

    /* Auto adjust doanh thu / công nợ KH */
    const customers = window.STORE.get('customers', window.CUSTOMERS || []);
    const c = customers.find(x => x.id === o.cust);
    const wasCounted = oldStatus === 'delivered' || oldStatus === 'reconciled';
    const willCount = newStatus === 'delivered' || newStatus === 'reconciled';
    if (c) {
      const delta = { orders: 0, revenue: 0 };
      if (!wasCounted && willCount) { delta.orders = 1; delta.revenue = (o.freight || 0); }
      else if (wasCounted && !willCount) { delta.orders = -1; delta.revenue = -(o.freight || 0); }
      if (delta.orders !== 0 || delta.revenue !== 0) {
        window.STORE.update('customers', o.cust, {
          orders: Math.max(0, (c.orders || 0) + delta.orders),
          revenue: Math.max(0, (c.revenue || 0) + delta.revenue),
          lastOrder: willCount ? new Date().toLocaleDateString('vi-VN') : c.lastOrder,
        });
      }
    }

    /* Toast */
    const msgType = newStatus === 'cancelled' ? 'danger' : newStatus === 'returned' ? 'warn' : 'success';
    window.toast(`${code}: ${STATUS[oldStatus].label} → ${STATUS[newStatus].label}`, msgType);
  }

  /* Giữ wrapper cũ — gọi từ drawer "Hủy đơn" button */
  function cancelOrder(code) {
    changeOrderStatus(code, 'cancelled');
  }
  function returnOrder(code) {
    changeOrderStatus(code, 'returned');
  }
  /* Expose để dùng từ chỗ khác nếu cần */
  window.changeOrderStatus = changeOrderStatus;

  /* === EXPORT CSV (mở bằng Excel) === */
  window.exportOrdersCsv = function () {
    const data = orders.slice();
    const rows = [['Mã đơn','Ngày','Khách hàng','SĐT KH','Địa chỉ giao','Mặt hàng','SL','Tiền hàng','COD','Hình thức','Trạng thái','NV phụ trách','Shipper','Xe']];
    const customers = window.STORE.get('customers', window.CUSTOMERS || []);
    data.forEach(o => {
      const c = customers.find(x => x.id === o.cust) || {};
      rows.push([
        o.code, o.date, o.custName, c.phone || '', o.drop || '',
        (o.items || []).map(it => `${it.name} x${it.qty}${it.unit||'kg'}`).join('; '),
        o.qty || 0, o.freight || 0, o.cod || 0, o.payBy || '',
        (STATUS[o.status] || {}).label || o.status,
        o.staff || '', o.driverName || '', o.vehicle || ''
      ]);
    });
    const csv = rows.map(r => r.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'DonHang-NSTT-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    window.toast('⬇ Đã xuất ' + data.length + ' đơn (mở bằng Excel)', 'success');
  };

  /* === IN PHIẾU GIAO HÀNG (A5-friendly) === */
  /* === LEGACY printOrder — bị ghi đè bởi pdf-templates.js (load sau) ===
     Giữ lại để fallback nếu pdf-templates chưa load */
  window.printOrder_legacy = function (code) {
    const o = orders.find(x => x.code === code);
    if (!o) { window.toast('Không tìm thấy đơn ' + code, 'warn'); return; }
    const customers = window.STORE.get('customers', window.CUSTOMERS || []);
    const c = customers.find(x => x.id === o.cust) || {};
    const items = o.items || [];
    const totalQty = items.reduce((s, it) => s + (it.qty || 0), 0);
    const totalAmt = items.reduce((s, it) => s + (it.total || 0), 0);
    const phone = c.phone || '';
    const company = window.STORE.get('company', { name: 'Nông Sản Tuấn Tú Hà Nội', addr: '36 Tân Mai, Hoàng Mai, Hà Nội', phone: '0903 111 222' });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Phiếu giao hàng ${o.code}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
  body{padding:20px;color:#222;font-size:13px;line-height:1.5}
  .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #339B21;padding-bottom:12px;margin-bottom:14px}
  .hd .l h1{font-size:20px;color:#339B21;font-weight:800;letter-spacing:0.5px}
  .hd .l .sub{font-size:11px;color:#555;margin-top:2px}
  .hd .r{text-align:right;font-size:11px;color:#555}
  .hd .r .code{font-size:18px;color:#1B5E20;font-weight:800;margin-bottom:2px}
  h2{font-size:14px;color:#1B5E20;margin:14px 0 6px;border-bottom:1px dashed #ccc;padding-bottom:3px}
  .kv{display:grid;grid-template-columns:120px 1fr;gap:4px 12px;font-size:12.5px;margin-bottom:4px}
  .kv b{color:#222}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
  th{background:#F0FDF4;color:#1B5E20;font-weight:700;text-transform:uppercase;font-size:10.5px;letter-spacing:0.3px}
  td.num{text-align:right;font-variant-numeric:tabular-nums}
  tfoot td{font-weight:700;background:#FAFAFB}
  .sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:30px;text-align:center;font-size:11.5px}
  .sig div{padding:6px 0;color:#555}
  .sig div b{display:block;color:#222;margin-bottom:60px}
  .note{font-size:11px;color:#666;margin-top:14px;padding:8px 10px;background:#FEF3C7;border-left:3px solid #E8A33D;border-radius:3px}
  @media print{body{padding:0}}
</style></head><body>
  <div class="hd">
    <div class="l">
      <h1>🌱 ${company.name.toUpperCase()}</h1>
      <div class="sub">${company.addr} · ☎ ${company.phone}</div>
    </div>
    <div class="r">
      <div class="code">${o.code}</div>
      <div>Ngày in: ${new Date().toLocaleString('vi-VN')}</div>
      <div>Ngày đơn: ${o.date}</div>
    </div>
  </div>

  <div style="text-align:center;font-size:18px;font-weight:800;color:#1B5E20;letter-spacing:1px;margin-bottom:12px">
    PHIẾU GIAO HÀNG
  </div>

  <h2>👤 Khách hàng</h2>
  <div class="kv"><span>Tên KH:</span><b>${o.custName}${c.code ? ' (' + c.code + ')' : ''}</b></div>
  ${phone ? `<div class="kv"><span>Điện thoại:</span><b>${phone}</b></div>` : ''}
  <div class="kv"><span>Địa chỉ giao:</span><b>${o.drop || '—'}</b></div>
  <div class="kv"><span>Hình thức:</span><b>${o.payBy || '—'}</b></div>

  <h2>📦 Danh sách mặt hàng</h2>
  <table>
    <thead><tr><th style="width:30px">#</th><th>Mặt hàng</th><th class="num" style="width:60px">SL</th><th style="width:40px">ĐVT</th><th class="num" style="width:90px">Đơn giá</th><th class="num" style="width:110px">Thành tiền</th></tr></thead>
    <tbody>
      ${items.map((it, i) => `<tr>
        <td>${i + 1}</td>
        <td>${it.name || ''}</td>
        <td class="num">${it.qty || 0}</td>
        <td>${it.unit || 'kg'}</td>
        <td class="num">${(it.price || 0).toLocaleString('vi-VN')}</td>
        <td class="num">${(it.total || 0).toLocaleString('vi-VN')}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr><td colspan="2">TỔNG CỘNG</td>
        <td class="num">${totalQty}</td><td></td><td></td>
        <td class="num" style="color:#DC2626">${totalAmt.toLocaleString('vi-VN')} ₫</td></tr>
    </tfoot>
  </table>

  ${o.note ? `<div class="note">📝 Ghi chú: ${o.note}</div>` : ''}

  <div class="sig">
    <div><b>Người lập phiếu</b>${o.staff || ''}<br><span style="font-size:10px;color:#888">(ký, ghi rõ họ tên)</span></div>
    <div><b>Shipper giao</b>${o.driverName || '...........'}<br><span style="font-size:10px;color:#888">(ký, ghi rõ họ tên)</span></div>
    <div><b>Khách nhận</b>........................<br><span style="font-size:10px;color:#888">(ký, ghi rõ họ tên)</span></div>
  </div>

  <div style="margin-top:24px;text-align:center;font-size:10.5px;color:#888;border-top:1px dashed #ddd;padding-top:10px">
    Cảm ơn quý khách đã tin tưởng Nông Sản Tuấn Tú Hà Nội 🌱
  </div>

  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\/script>
</body></html>`;
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) { window.toast('Trình duyệt chặn popup — cho phép popup rồi thử lại', 'warn'); return; }
    w.document.write(html);
    w.document.close();
  };

  /* === DRAWER === */
  window.openOrder = function(code) {
    const o = orders.find(x => x.code === code);
    if (!o) return;
    window._currentOrderCode = code;   /* dùng cho action buttons trong tab Hành động */
    const svc = SVC[o.serviceType] || {icon:'❓', label:o.serviceType, color:'#666'};
    const tm = o.transportMode ? TM[o.transportMode] : null;
    const st = STATUS[o.status];

    document.getElementById('dCode').textContent = o.code;
    document.getElementById('dMeta').innerHTML = `
      <span class="status-pill st-${o.status}">${st.icon} ${st.label}</span>
      <span class="svc-tag" style="background:${svc.color}20;color:${svc.color}">${svc.icon} ${svc.label}</span>
      ${tm ? `<span class="tm-tag">${tm.icon} ${tm.label}</span>` : ''}
      <span>· ${o.date}</span>
    `;
    document.getElementById('dFreight').textContent = window.fmtShort(o.freight) + ' ₫';
    document.getElementById('dPay').textContent = o.payBy;
    document.getElementById('dCod').textContent = o.cod ? window.fmtShort(o.cod) + ' ₫' : '—';
    document.getElementById('dWeight').textContent = o.weight ? o.weight + ' kg' : '—';
    document.getElementById('dUnit').textContent = o.qty + ' ' + o.unit.toLowerCase();
    document.getElementById('dService').textContent = svc.label;
    document.getElementById('dMode').textContent = tm ? tm.label : '—';

    document.getElementById('iCode').textContent  = o.code;
    document.getElementById('iCust').textContent  = o.custName + ' (' + o.cust + ')';
    document.getElementById('iStaff').textContent = o.staff;
    document.getElementById('iDate').textContent  = o.date;
    document.getElementById('iGoods').textContent = `${o.qty} ${o.unit.toLowerCase()} · ${o.goods}` + (o.weight ? ' · ' + o.weight + ' kg' : '');
    document.getElementById('iPickup').textContent = o.pickup;
    document.getElementById('iDrop').textContent   = o.drop;
    document.getElementById('iPayBy').textContent  = o.payBy;
    document.getElementById('iTotal').textContent  = window.fmtVND(o.freight + (o.cod||0));
    document.getElementById('iNote').textContent   = o.note || '(không có)';
    document.getElementById('iDriver').innerHTML  = o.driverName + (o.external?' <span class="alert-badge warn" style="font-size:10px;margin-left:6px">🤝 Đối tác ngoài</span>':'');
    document.getElementById('iVehicle').textContent = o.vehicle;
    /* Hiển thị thêm thông tin chi phí đối tác trong tổng thu */
    if (o.external && o.partnerCost) {
      const total = o.freight + (o.cod||0);
      document.getElementById('iTotal').innerHTML = `${window.fmtVND(total)}
        <div style="font-size:11px;color:var(--muted);font-weight:400;margin-top:4px">
          Chi phí thuê: -${window.fmt(o.partnerCost)} ₫ ·
          <b style="color:${o.profit>0?'var(--ok)':'var(--danger)'}">LN: ${o.profit>0?'+':''}${window.fmt(o.profit)} ₫</b>
        </div>`;
    }

    /* Timeline */
    const STEP_LABEL = { confirmed:'Tạo đơn / xác nhận', pickup:'Đang lấy hàng', transit:'Đang vận chuyển', delivered:'Đã giao thành công', reconciled:'Đối soát hoàn tất' };
    const curIdx = STEPS.indexOf(o.status);
    let html = '';
    if (o.status === 'cancelled') {
      html = `<div class="tl-item current"><div class="t1">Đã hủy</div><div class="t2">${o.date} · Lý do: ${o.cancelReason || 'Không rõ'}</div></div>`;
    } else {
      STEPS.forEach((s, i) => {
        const cls = i < curIdx ? 'done' : i === curIdx ? 'current' : 'pending';
        html += `<div class="tl-item ${cls}">
          <div class="t1">${STEP_LABEL[s]}</div>
          <div class="t2">${i <= curIdx ? (i === 0 ? o.date : '(đã hoàn thành)') : 'Chưa diễn ra'}</div>
        </div>`;
      });
    }
    document.getElementById('timelineList').innerHTML = html;

    /* Wire dropdown đổi trạng thái + 3 action buttons */
    const drawer = document.getElementById('drawer');
    const drawerSel = document.getElementById('drawerStatusSel');
    if (drawerSel) {
      drawerSel.innerHTML = ALL_STATUSES.map(k =>
        `<option value="${k}" ${o.status===k?'selected':''}>${STATUS[k].icon} ${STATUS[k].label} — ${STATUS[k].sub}</option>`
      ).join('');
      drawerSel.style.color = (STATUS[o.status] || {}).color || 'var(--navy)';
      drawerSel.style.borderColor = (STATUS[o.status] || {}).color || 'var(--line)';
      drawerSel.onchange = () => {
        changeOrderStatus(code, drawerSel.value);
        setTimeout(() => window.closeDrawer(), 400);
      };
    }
    /* Actions tab buttons dùng inline onclick (HTML), gọi window.* trực tiếp
       — wire copy tracking helper vào window để inline gọi được */
    window.copyOrderTrackingLink = async function (code) {
      const url = `${location.origin}${location.pathname}?track=${code}`;
      try { await navigator.clipboard.writeText(url); window.toast('✓ Đã sao chép link tracking', 'success'); }
      catch (e) { window.toast('Copy fail — link: ' + url, 'warn'); }
    };

    /* Vehicle pane: Gọi shipper / Zalo / Đổi shipper */
    const vBtns = drawer.querySelectorAll('.tab-pane[data-pane="vehicle"] button');
    if (vBtns[0] && vBtns[1]) {
      const drivers = window.STORE.get('shippers', window.DRIVERS || []);
      const dr = drivers.find(d => d.id === o.driver || d.name === o.driverName);
      const phone = dr && dr.phone ? dr.phone.replace(/\s/g, '') : '';
      vBtns[0].disabled = !phone;
      vBtns[0].onclick  = () => { if (phone) window.location.href = 'tel:' + phone; };
      vBtns[1].disabled = !phone;
      vBtns[1].onclick  = () => { if (phone) window.open('https://zalo.me/' + phone, '_blank'); };
    }
    if (vBtns[2]) vBtns[2].onclick = () => window.toast('Đổi shipper/xe — vào trang Shipper để gán lại', 'info');

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab[data-tab="info"]')?.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelector('.tab-pane[data-pane="info"]')?.classList.add('active');
    window.openDrawerBg();
  };

  /* === AI: tạo đơn từ ảnh tin nhắn/đơn viết tay === */
  window.aiCreateOrder = function () {
    if (!window.AI) { window.toast('Chưa tải module AI', 'warn'); return; }
    window.AI.openFillModal({
      task: 'order',
      title: '📷 Tạo đơn từ ảnh (AI)',
      guideHtml: 'Đính kèm <b>ảnh tin nhắn đặt hàng / đơn viết tay</b>. AI đọc tên khách + danh sách mặt hàng + số lượng, tự mở form tạo đơn và điền (giá lấy theo bảng giá hôm nay).<br><b>Cấu trúc gợi ý:</b> Tên khách + SĐT, rồi mỗi dòng "Mặt hàng — số lượng".',
      prompt: 'Đọc ảnh đơn đặt hàng nông sản (tiếng Việt). Trả JSON: {"customerName":"tên khách/nhà hàng","customerPhone":"số điện thoại nếu có","note":"ghi chú nếu có","items":[{"name":"tên mặt hàng","qty": số lượng dạng số}]}. CHỈ trả JSON.',
      onResult: applyAIOrder,
    });
  };
  function applyAIOrder(d) {
    window.openCreateOrder();
    setTimeout(() => {
      const customers = window.STORE.get('customers', []);
      const nm = window.AI.norm(d.customerName), ph = (d.customerPhone || '').replace(/\D/g, '');
      let c = ph ? customers.find(x => (x.phone || '').replace(/\D/g, '') === ph) : null;
      if (!c && nm) c = customers.find(x => window.AI.norm(x.name) === nm)
        || customers.find(x => { const xn = window.AI.norm(x.name); return xn.includes(nm) || nm.includes(xn); });
      if (c) { const sel = document.getElementById('oCust'); if (sel) sel.value = c.id; }

      const prods = window.STORE.get('products', window.PRODUCTS || []);
      let added = 0; const miss = [];
      (d.items || []).forEach(it => {
        const inm = window.AI.norm(it.name);
        let p = prods.find(x => window.AI.norm(x.name) === inm)
          || prods.find(x => { const xn = window.AI.norm(x.name); return xn.includes(inm) || inm.includes(xn); });
        if (p) {
          document.getElementById('oProd').value = p.id;
          document.getElementById('oProdQty').value = it.qty || 1;
          window.addOrderItem();
          added++;
        } else miss.push(it.name);
      });
      if (d.note) { const n = document.getElementById('oNote'); if (n) n.value = d.note; }
      window.toast(`🤖 AI: ${c ? 'KH ' + c.name + ' · ' : '(chưa khớp KH) '}${added} mặt hàng${miss.length ? ' · thiếu: ' + miss.slice(0, 4).join(', ') : ''}`, added ? 'success' : 'warn');
    }, 220);
  }

  /* === Create order modal === */
  window.openCreateOrder = function(prefillCustId) {
    const customers = window.STORE.get('customers', []);
    const drivers = window.STORE.get('shippers', window.DRIVERS || []);
    const vehicles = window.STORE.get('vehicles', window.VEHICLES || []);
    const partners = window.STORE.get('partners', window.PARTNERS || []).filter(p => p.active);
    const svcOpts = window.MD.options('services');
    const tmOpts = window.MD.options('transportModes');
    const unitOpts = window.MD.options('units');
    const payOpts = window.MD.get('payMethods').map(p => `<option>${p.label}</option>`).join('');
    const custOpts = `<option value="">-- Chọn KH --</option>` +
      customers.map(c => `<option value="${c.id}" ${c.id===prefillCustId?'selected':''}>${c.code} · ${c.name}</option>`).join('');
    const drvOpts = `<option value="">-- Chọn shipper --</option>` +
      drivers.map(d => `<option value="${d.id}">${d.name} · ${d.primaryPlate}</option>`).join('');
    const vehOpts = `<option value="">-- Chọn xe --</option>` +
      vehicles.map(v => `<option value="${v.id}">${v.plate} · ${v.type}</option>`).join('');
    const partnerOpts = `<option value="">-- Chọn đối tác --</option>` +
      partners.map(p => `<option value="${p.id}">${p.code} · ${p.name}${p.vehiclePlate?' · '+p.vehiclePlate:''}</option>`).join('');
    const prodList = window.STORE.get('products', window.PRODUCTS || []);
    const prodOpts = `<option value="">-- Chọn sản phẩm --</option>` +
      prodList.map(p => `<option value="${p.id}">${p.name} · ${window.fmt(window.priceOn(p.id, window.todayISO()))}đ/${p.unit}</option>`).join('');
    orderItems = [];
    const nextCode = window.STORE.nextOrderCode();

    window.openModal('+ Tạo đơn mới', `
      <div style="margin-bottom:14px;padding:10px 12px;background:#F3E8FF;border:1px solid #E9D5FF;border-radius:8px;font-size:12px;color:#7C3AED">
        💡 <b>Mã đơn tự sinh:</b> <b>${nextCode}</b>
      </div>
      <div class="form-row">
        <div><label>Mã đơn</label><input id="oCode" value="${nextCode}" readonly style="background:#FAFAFB;font-family:ui-monospace,monospace;font-weight:600"></div>
        <div><label>NV phụ trách</label>
          <select id="oStaff">
            <option>Trần Lan</option><option>Phạm Hùng</option>
            <option>Hoàng Mai</option><option>Tuấn Tú</option>
          </select></div>
      </div>
      <div class="form-row">
        <div><label>Khách hàng * ${window.helpTip ? window.helpTip('Gõ tên/SĐT/mã KH — danh sách tự lọc theo bạn gõ. Ấn ↑↓ chọn, Enter xác nhận. Nếu KH mới chưa có, bấm "+ Thêm KH mới" để mở form thêm nhanh.') : ''}</label>
          <div id="oCust_box"></div>
          <input type="hidden" id="oCust" value="">
        </div>
        <div><label>Nhóm hàng chính</label>
          <select id="oSvc" onchange="window.onChangeService(this.value)">${svcOpts}</select></div>
      </div>
      <div class="form-row">
        <div><label>Hình thức giao</label>
          <select id="oMode">${tmOpts}</select></div>
        <div><label>🎯 Giao đến (địa chỉ KH)</label><input id="oDrop" placeholder="Tự lấy theo KH — sửa nếu cần"></div>
      </div>
      <!-- ====== MẶT HÀNG (đơn giá tự lấy theo bảng giá hôm nay) ====== -->
      <div class="section-h" style="margin:14px 0 8px;display:flex;align-items:center;gap:8px">
        🥬 Mặt hàng
        <span style="font-weight:400;color:var(--muted);font-size:12px">— đơn giá tự lấy theo bảng giá hôm nay</span>
        <div style="flex:1"></div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.addOrderItemsFromImage()" title="AI parse ảnh chụp list hàng / tin nhắn đặt hàng">📷 Từ ảnh</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.addOrderItemsFromExcel()" title="Upload Excel 2 cột: Sản phẩm + Số lượng">📥 Từ Excel</button>
      </div>
      <div class="form-row" style="align-items:flex-end">
        <div style="flex:2"><label>Chọn sản phẩm</label><select id="oProd">${prodOpts}</select></div>
        <div><label>Số lượng</label><input id="oProdQty" type="number" value="1" min="0" step="0.1"></div>
        <div style="flex:0 0 auto"><label>&nbsp;</label><button type="button" class="btn btn-primary btn-sm" style="width:100%" onclick="window.addOrderItem()">+ Thêm 1 món</button></div>
      </div>
      <div id="orderItemsBox" style="margin:6px 0 12px"></div>
      <div class="form-row">
        <div><label>Tóm tắt hàng *</label><input id="oGoods" placeholder="tự điền từ mặt hàng (có thể sửa)"></div>
        <div><label>Trọng lượng (kg)</label><input id="oWeight" type="number" placeholder="0"></div>
      </div>
      <input type="hidden" id="oQty" value="1"><input type="hidden" id="oUnit" value="kg">
      <div class="form-row">
        <div><label>Tổng tiền hàng (₫) *</label><input id="oFreight" type="number" placeholder="0"></div>
        <div><label>COD / Thu hộ (₫)</label><input id="oCod" type="number" placeholder="0"></div>
      </div>
      <div class="form-row">
        <div><label>Hình thức TT</label>
          <select id="oPayBy">${payOpts}</select></div>
        <div></div>
      </div>

      <!-- ============ PHÂN CÔNG SHIPPER ============ -->
      <div class="section-h" style="margin:14px 0 8px">🛵 Phân công giao hàng</div>
      <div class="form-row">
        <div><label>Shipper giao</label><select id="oDriver">${drvOpts}</select></div>
        <div></div>
      </div>

      <div class="form-row wide"><label>Ghi chú</label><textarea id="oNote" rows="2" placeholder="Giao trước 7h sáng, hàng tươi..."></textarea></div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-ghost" onclick="window.saveAsRecurring()" title="Lưu items + KH hiện tại thành mẫu lặp lại theo lịch">🔁 Lưu thành đơn định kỳ</button>
               <button class="btn btn-ghost" onclick="window.submitCreateOrder('draft')">💾 Lưu nháp</button>
               <button class="btn btn-primary" onclick="window.submitCreateOrder('confirmed')">🚚 Tạo & gửi điều hành</button>`,
      width:'620px'
    });
    window.onChangeService(document.getElementById('oSvc').value);
    renderOrderItems();

    /* ============ Mount autocomplete KH ============ */
    if (window.CustSearchBox) {
      const urlParams = new URLSearchParams(location.search);
      const prefilledCust = urlParams.get('createFor') || null;
      window.CustSearchBox.mount('oCust_box', {
        placeholder: 'Gõ tên / SĐT / mã KH (vd "Á Đông", "0912", "KH001")...',
        initialId: prefilledCust,
        onSelect: (c) => {
          const hidden = document.getElementById('oCust');
          if (hidden) hidden.value = c ? c.id : '';
          if (c) window.onOrderCustChange(c.id);
        },
      });
    }
    /* Auto-tính lợi nhuận khi thay đổi giá */
    ['oFreight','oPartnerCost'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updateProfit);
    });
  };

  /* === Mặt hàng trong đơn (sản phẩm + giá ngày) === */
  function renderOrderItems() {
    const box = document.getElementById('orderItemsBox');
    if (!box) return;
    if (!orderItems.length) {
      box.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:4px 0">Chưa có mặt hàng. Chọn sản phẩm + số lượng rồi bấm "+ Thêm".</div>';
    } else {
      const total = orderItems.reduce((s, x) => s + x.total, 0);
      box.innerHTML = `<table class="mini-table" style="margin:0">
        <thead><tr><th>Sản phẩm</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th><th></th></tr></thead>
        <tbody>${orderItems.map((it, i) => `<tr>
          <td><div style="display:flex;align-items:center;gap:8px">${it.img ? `<img src="${it.img}" alt="" style="width:30px;height:30px;object-fit:cover;border-radius:5px;flex:none" onerror="this.style.display='none'">` : ''}${it.name}</div></td><td class="num">${it.qty} ${it.unit}</td>
          <td class="num">${window.fmt(it.price)}</td><td class="num"><b>${window.fmt(it.total)}</b></td>
          <td class="num"><button type="button" class="icon-btn" style="color:var(--danger)" onclick="window.removeOrderItem(${i})" title="Xóa dòng sản phẩm này khỏi đơn">✕</button></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3" class="num"><b>Tổng tiền hàng</b></td><td class="num"><b style="color:var(--red)">${window.fmt(total)} ₫</b></td><td></td></tr></tfoot>
      </table>`;
    }
    const total = orderItems.reduce((s, x) => s + x.total, 0);
    const g = document.getElementById('oGoods');
    if (g) g.value = orderItems.map(x => `${x.name} x${x.qty}${x.unit}`).join(', ');
    const f = document.getElementById('oFreight');
    if (f) f.value = total || '';
    if (typeof updateProfit === 'function') updateProfit();
  }

  window.addOrderItem = function () {
    const id = window.formVal('#oProd');
    const qty = parseFloat(document.getElementById('oProdQty').value) || 0;
    if (!id) { window.toast('Chọn sản phẩm', 'warn'); return; }
    if (qty <= 0) { window.toast('Nhập số lượng', 'warn'); return; }
    const p = window.productById(id);
    if (!p) return;
    const price = window.priceOn(id, window.todayISO());
    const existing = orderItems.find(x => x.id === id);
    if (existing) {
      existing.qty = Math.round((existing.qty + qty) * 100) / 100;
      existing.total = Math.round(existing.qty * existing.price);
    } else {
      orderItems.push({ id, name: p.name, unit: p.unit, img: p.img, qty, price, total: Math.round(qty * price) });
    }
    document.getElementById('oProdQty').value = 1;
    renderOrderItems();
  };

  window.removeOrderItem = function (i) {
    orderItems.splice(i, 1);
    renderOrderItems();
  };

  /* === Helper: match tên SP với product catalog (fuzzy) === */
  function matchProductByName(name) {
    if (!name) return null;
    const products = window.STORE.get('products', window.PRODUCTS || []);
    const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const n = norm(name);
    /* Exact match */
    let p = products.find(x => norm(x.name) === n);
    if (p) return p;
    /* Contains in either direction */
    p = products.find(x => { const xn = norm(x.name); return xn.includes(n) || n.includes(xn); });
    if (p) return p;
    /* Token overlap ≥ 50% */
    const tokens = n.split(/\s+/).filter(t => t.length >= 2);
    if (tokens.length) {
      let best = null, bestScore = 0;
      products.forEach(x => {
        const xt = norm(x.name).split(/\s+/);
        const hit = tokens.filter(t => xt.some(y => y.includes(t) || t.includes(y))).length;
        const sc = hit / tokens.length;
        if (sc > bestScore && sc >= 0.5) { bestScore = sc; best = x; }
      });
      return best;
    }
    return null;
  }

  /* === Áp dụng list items {name, qty} vào orderItems === */
  function applyBulkItems(items, source) {
    let added = 0, updated = 0, unmatched = [];
    let viaAlias = 0;                                       /* match nhờ từ điển KH */
    const custId = window.formVal && window.formVal('#oCust');
    const products = window.STORE.get('products', window.PRODUCTS || []);

    items.forEach(it => {
      const qty = parseFloat(it.qty) || 0;
      if (!qty) return;
      let p = null, learnWord = null;
      /* (1) Ưu tiên từ điển riêng của KH */
      if (custId && window.CustPrefs) {
        const r = window.CustPrefs.resolveItem(custId, it.name);
        if (r) { p = products.find(x => x.id === r.productId); if (p) viaAlias++; }
      }
      /* (2) Fallback fuzzy match catalog chung */
      if (!p) { p = matchProductByName(it.name); learnWord = p ? it.name : null; }
      /* (3) Không khớp gì → bỏ vào unmatched (sẽ hỏi user dạy AI) */
      if (!p) { unmatched.push(it.name); return; }
      const price = window.priceOn(p.id, window.todayISO());
      const existing = orderItems.find(x => x.id === p.id);
      if (existing) {
        existing.qty = Math.round((existing.qty + qty) * 100) / 100;
        existing.total = Math.round(existing.qty * existing.price);
        updated++;
      } else {
        orderItems.push({ id: p.id, name: p.name, unit: p.unit, img: p.img, qty, price, total: Math.round(qty * price) });
        added++;
      }
      /* (4) Nếu match qua fuzzy + tên KH viết ngắn hơn tên SP gốc → đề xuất dạy KH */
      if (learnWord && custId && window.CustPrefs) {
        const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
        if (norm(learnWord).length < norm(p.name).length - 2) {
          /* Async — không block UI. Đợi 1s sau khi toast hiện rồi mới hỏi */
          setTimeout(() => window.CustPrefs.promptToLearn(custId, learnWord, p.id), (added+updated)*500);
        }
      }
    });
    renderOrderItems();
    /* Refresh box gợi ý */
    if (custId) renderCustPrefBox(custId);

    const aliasNote = viaAlias ? ` · 🎯 ${viaAlias} dùng từ điển KH` : '';
    const msg = `✓ ${source}: +${added} mới · ${updated} cập nhật${aliasNote}` + (unmatched.length ? ` · ${unmatched.length} không khớp: ${unmatched.slice(0,3).join(', ')}${unmatched.length>3?'...':''}` : '');
    window.toast(msg, added + updated ? 'success' : 'warn');

    /* Nếu có unmatched + có KH → mở modal hỏi user mapping thủ công */
    if (unmatched.length && custId && window.CustPrefs) {
      setTimeout(() => askUserToMapUnmatched(custId, unmatched), 800);
    }
  }

  /* Modal hỏi user map các tên AI không hiểu cho 1 KH */
  function askUserToMapUnmatched(custId, unmatchedNames) {
    const products = window.STORE.get('products', window.PRODUCTS || []) || [];
    const c = window.STORE.get('customers', []).find(x => x.id === custId);
    const opts = `<option value="">— Bỏ qua —</option>` + products.map(p => `<option value="${p.id}">${p.id} · ${p.name}</option>`).join('');
    window.openModal('🤔 Có ' + unmatchedNames.length + ' từ AI không hiểu — bạn dạy hệ thống nhé?', `
      <div style="background:#FEF3C7;color:#92400E;padding:10px 12px;border-radius:7px;font-size:12.5px;margin-bottom:12px">
        💡 KH <b>${c?.name||custId}</b> có thể dùng từ riêng (vd "hành"="hành tây"). Map 1 lần — <b>lần sau AI tự hiểu</b>.
      </div>
      ${unmatchedNames.map((w, i) => `
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-bottom:8px;align-items:center">
          <div style="font-weight:600">"${w}"</div>
          <select id="map_${i}" data-word="${w}" style="border:1px solid var(--line);border-radius:5px;padding:6px;font-size:12px">${opts}</select>
        </div>
      `).join('')}
    `, {
      footer:`<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
              <button class="btn btn-primary" onclick="window._saveLearnedMaps('${custId}')">💾 Dạy hệ thống + thêm vào đơn</button>`,
      width:'520px'
    });
  }

  window._saveLearnedMaps = function(custId) {
    const learned = [];
    document.querySelectorAll('[id^=map_]').forEach(sel => {
      const word = sel.dataset.word;
      const pid = sel.value;
      if (word && pid) {
        window.CustPrefs.addAlias(custId, word, pid);
        const p = window.productById(pid);
        if (p) {
          const price = window.priceOn(pid, window.todayISO());
          /* Thêm với SL=1 default — user sẽ chỉnh sau */
          orderItems.push({ id: pid, name: p.name, unit: p.unit, img: p.img, qty: 1, price, total: price });
          learned.push(word);
        }
      }
    });
    renderOrderItems();
    renderCustPrefBox(custId);
    window.closeModal();
    if (learned.length) window.toast(`✓ Đã dạy ${learned.length} từ mới + thêm vào đơn (chỉnh SL nếu cần)`, 'success');
  };

  /* === Thêm hàng loạt từ ẢNH (AI parse) — alias-aware === */
  window.addOrderItemsFromImage = function () {
    if (!window.AI) { window.toast('Chưa tải module AI', 'warn'); return; }
    /* Lấy custId hiện tại trong form (nếu đã chọn) để chèn từ điển vào prompt */
    const custId = window.formVal && window.formVal('#oCust');
    const c = custId ? window.STORE.get('customers', []).find(x => x.id === custId) : null;
    const aliasCtx = (custId && window.CustPrefs) ? window.CustPrefs.aliasContextForAI(custId) : '';

    /* Build catalog ngắn gọn để AI ưu tiên match đúng */
    const products = window.STORE.get('products', window.PRODUCTS || []);
    const catalogHint = products.slice(0, 80).map(p => `${p.id}=${p.name}`).join(', ');

    const basePrompt = `Đọc ảnh chứa danh sách mặt hàng nông sản đặt mua (tiếng Việt).
Trả JSON: {"items":[{"name":"tên mặt hàng","qty":<số lượng>}]}.
Số lượng là số nguyên/thập phân (vd 5, 2.5). KHÔNG bao gồm đơn vị "kg" trong qty.

${aliasCtx ? aliasCtx + '\n\n' : ''}DANH MỤC SP CỦA SHOP (id=tên — chỉ liệt kê 1 phần): ${catalogHint}

QUY TẮC ƯU TIÊN khi đọc tên mơ hồ:
1. Nếu có TỪ ĐIỂN RIÊNG của KH ở trên → DÙNG đúng tên SP đó (vd "hành" của KH này = "Hành tây trắng" thì viết "Hành tây trắng" trong items).
2. Nếu không có alias → giữ nguyên tên KH viết, sẽ match fuzzy sau.

CHỈ TRẢ JSON, không giải thích gì thêm.`;

    window.AI.openFillModal({
      task: 'order',
      title: '📷 Thêm mặt hàng từ ảnh (AI)' + (c ? ' — ' + c.name : ''),
      guideHtml: `Đính kèm <b>ảnh chụp tin nhắn / list hàng / phiếu đặt</b>. AI đọc tên + số lượng từng món, tự match với danh mục SP và cộng vào đơn.
        ${c ? `<br>👤 <b>KH:</b> ${c.name} ${aliasCtx ? '— AI đã biết <b style="color:#15803D">'+Object.keys(window.CustPrefs.get(custId).aliases).length+' từ riêng</b> của KH này' : '— <span style="color:#92400E">chưa có từ điển riêng</span>'}`
                  : '<br>⚠️ <b>Chưa chọn KH</b> — AI không có context cá nhân hoá. Chọn KH trước khi đọc ảnh để chính xác hơn.'}
        <br><b>Cấu trúc gợi ý:</b> mỗi dòng "Tên món — số lượng" (vd: "Cà chua 5kg, Rau muống 3kg").`,
      prompt: basePrompt,
      onResult: (d) => {
        const items = (d && d.items) || [];
        if (!items.length) { window.toast('AI không đọc được mặt hàng nào', 'warn'); return; }
        applyBulkItems(items, 'AI' + (aliasCtx ? ' (có từ điển KH)' : ''));
      },
    });
  };

  /* === Thêm hàng loạt từ EXCEL === */
  window.addOrderItemsFromExcel = function () {
    if (!window.XLSX) { window.toast('SheetJS chưa load — reload trang', 'warn'); return; }
    /* Tạo file input ẩn */
    let inp = document.getElementById('bulkItemsFile');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file'; inp.id = 'bulkItemsFile';
      inp.accept = '.xlsx,.xls,.csv'; inp.style.display = 'none';
      document.body.appendChild(inp);
    }
    inp.onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const buf = await f.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (data.length < 2) { window.toast('File trống', 'warn'); return; }
        /* Detect col Tên SP + Số lượng */
        const header = data[0].map(h => String(h || '').toLowerCase().trim());
        const nameCol = header.findIndex(h => /tên|name|sp|sản phẩm|hàng|product/.test(h));
        const qtyCol  = header.findIndex(h => /số.*lượng|qty|sl|lượng/.test(h));
        let items;
        if (nameCol >= 0 && qtyCol >= 0) {
          items = data.slice(1).map(r => ({ name: String(r[nameCol] || '').trim(), qty: parseFloat(r[qtyCol]) || 0 })).filter(it => it.name && it.qty);
        } else {
          /* Fallback: 2 cột đầu */
          items = data.slice(1).map(r => ({ name: String(r[0] || '').trim(), qty: parseFloat(r[1]) || 0 })).filter(it => it.name && it.qty);
        }
        if (!items.length) { window.toast('Không có dòng dữ liệu hợp lệ', 'warn'); return; }
        applyBulkItems(items, 'Excel');
      } catch (err) {
        window.toast('Lỗi đọc file: ' + err.message, 'danger');
      }
      e.target.value = '';
    };
    /* Show pre-modal: download template + upload */
    window.openModal('📥 Nhập mặt hàng từ Excel', `
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
        Upload file <code>.xlsx</code> / <code>.csv</code> với <b>2 cột</b>: <b>Tên sản phẩm</b> + <b>Số lượng</b>.
        App tự match với danh mục SP (so khớp tên gần đúng) + lấy giá hôm nay.
      </div>

      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px 14px;margin-bottom:12px">
        <div style="font-weight:700;font-size:13px;color:#15803D;margin-bottom:6px">📋 Tải file mẫu</div>
        <button class="btn btn-navy btn-sm" onclick="window.downloadOrderItemsTemplate()">⬇ mau-mat-hang-NSTT.xlsx</button>
      </div>

      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 14px">
        <div style="font-weight:700;font-size:13px;color:#A16207;margin-bottom:6px">📤 Hoặc upload file của bạn</div>
        <button class="btn btn-primary" onclick="document.getElementById('bulkItemsFile').click()">📤 Chọn file Excel</button>
      </div>

      <div style="font-size:11.5px;color:var(--muted);margin-top:12px;padding:10px;background:#FAFAFB;border-radius:6px">
        💡 <b>Mẹo:</b> Tên SP không cần khớp 100% — app tự dò gần đúng. Vd "Cà chua" sẽ match "Cà chua đại" / "Cà chua bi".<br>
        Hàng không khớp sẽ báo cuối quá trình để bạn check.
      </div>
    `, {
      footer: `<button class="btn btn-primary" onclick="window.closeModal()">Đóng</button>`,
      width: '480px',
    });
  };

  window.downloadOrderItemsTemplate = function () {
    if (!window.XLSX) { window.toast('SheetJS chưa load', 'warn'); return; }
    const data = [
      ['Tên sản phẩm', 'Số lượng (kg)'],
      ['Cà chua đại', 5],
      ['Rau muống', 3],
      ['Dưa chuột', 8],
      ['Cà rốt tỉa hoa', 2],
      ['Nấm đùi gà', 1.5],
    ];
    const ws = window.XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{wch:30}, {wch:18}];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Mặt hàng');
    window.XLSX.writeFile(wb, 'mau-mat-hang-NSTT.xlsx');
    window.toast('⬇ Đã tải file mẫu', 'success');
  };

  window.onCarrierChange = function(mode) {
    document.getElementById('carrierInternal').style.display = mode === 'internal' ? '' : 'none';
    document.getElementById('carrierExternal').style.display = mode === 'external' ? '' : 'none';
  };

  window.onPartnerChange = function(pid) {
    const preview = document.getElementById('partnerPreview');
    if (!pid) { preview.style.display = 'none'; return; }
    const partners = window.STORE.get('partners', []);
    const p = partners.find(x => x.id === pid);
    if (!p) return;
    preview.style.display = 'block';
    preview.innerHTML = `
      <div><b>${p.name}</b> · ${p.contact} · ${p.phone}</div>
      <div style="margin-top:4px;color:var(--muted)">🚛 ${p.vehicleType} ${p.vehiclePlate ? '· ' + p.vehiclePlate : ''}</div>
      ${p.specialty ? `<div style="color:var(--muted)">🎯 ${p.specialty}</div>` : ''}
      ${p.pricing ? `<div style="color:var(--warn);margin-top:4px"><b>💰 Tham khảo giá:</b> ${p.pricing}</div>` : ''}
    `;
  };

  function updateProfit() {
    const freight = parseInt(window.formVal('#oFreight'), 10) || 0;
    const cost = parseInt(window.formVal('#oPartnerCost'), 10) || 0;
    const profit = freight - cost;
    const profitEl = document.getElementById('oProfit');
    if (profitEl) {
      profitEl.value = profit > 0 ? '+' + window.fmt(profit) + ' ₫' : window.fmt(profit) + ' ₫';
      profitEl.style.color = profit > 0 ? 'var(--ok)' : profit < 0 ? 'var(--danger)' : 'var(--muted)';
    }
  }

  /* === Inline add partner trong order modal === */
  window.openInlineAddPartner = function() {
    window.openModal('+ Thêm nhanh đối tác', `
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">
        Thêm nhanh — chỉ điền thông tin cần thiết. Có thể bổ sung chi tiết sau.
      </div>
      <div class="form-row">
        <div><label>Loại</label>
          <select id="qpKind">
            <option value="company">🏢 Nhà xe</option>
            <option value="freelance">👤 Tự do</option>
          </select></div>
        <div><label>Tên *</label><input id="qpName" placeholder="VD: Cty Đại Phong / A. Tuấn"></div>
      </div>
      <div class="form-row">
        <div><label>SĐT *</label><input id="qpPhone" placeholder="09xx xxx xxx"></div>
        <div><label>Biển số xe</label><input id="qpPlate" placeholder="VD: 29C-77001"></div>
      </div>
      <div class="form-row wide"><label>Loại xe</label>
        <input id="qpVehType" placeholder="VD: Xe tải 5T"></div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.openCreateOrder()">← Quay lại đơn</button>
               <button class="btn btn-primary" onclick="window.submitQuickPartner()">💾 Thêm & chọn vào đơn</button>`
    });
  };

  window.submitQuickPartner = function() {
    const name = window.formVal('#qpName');
    const phone = window.formVal('#qpPhone');
    if (!name) { window.toast('Nhập tên đối tác', 'warn'); return; }
    if (!phone) { window.toast('Nhập SĐT', 'warn'); return; }
    const allP = window.STORE.get('partners', []);
    const newP = {
      id: 'P' + String(allP.length + 1).padStart(2, '0'),
      code: window.STORE.nextId('partners', 'DT'),
      kind: window.formVal('#qpKind'),
      name, contact: name, phone,
      vehiclePlate: window.formVal('#qpPlate') || null,
      vehicleType: window.formVal('#qpVehType') || '',
      capacity: 0, capUnit: 'tấn',
      specialty: '', pricing: '', rating: 5.0,
      trips30d: 0, totalSpent30d: 0, active: true, note: '(thêm nhanh từ tạo đơn)',
    };
    window.STORE.add('partners', newP);
    window.closeModal();
    /* Mở lại order modal + chọn partner mới */
    window.openCreateOrder();
    setTimeout(() => {
      document.querySelector('input[name="oCarrier"][value="external"]').click();
      const sel = document.getElementById('oPartner');
      if (sel) { sel.value = newP.id; window.onPartnerChange(newP.id); }
      window.toast('✓ Đã thêm ' + name + ' & chọn vào đơn', 'success');
    }, 100);
  };
  window.onOrderCustChange = function(custId) {
    const c = window.STORE.get('customers', []).find(x => x.id === custId);
    const drop = document.getElementById('oDrop');
    if (c && drop) drop.value = c.address || '';
    /* gợi ý nhóm hàng chính theo KH */
    if (c && c.mainCats && c.mainCats[0]) {
      const sel = document.getElementById('oSvc'); if (sel) sel.value = c.mainCats[0];
    }
    /* === Cá nhân hoá: hiện gợi ý + nhắc nhở alias === */
    renderCustPrefBox(custId);
  };

  /* Render box "Đặt như lần trước" + alias context cho KH */
  function renderCustPrefBox(custId) {
    let box = document.getElementById('custPrefBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'custPrefBox';
      box.style.cssText = 'margin:10px 0;padding:10px 12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;font-size:12.5px;display:none';
      /* Insert dưới phần chọn KH */
      const ref = document.getElementById('oCust')?.closest('.form-row');
      if (ref) ref.parentNode.insertBefore(box, ref.nextSibling);
    }
    if (!custId || !window.CustPrefs) { box.style.display = 'none'; return; }
    const p = window.CustPrefs.get(custId);
    const sug = window.CustPrefs.suggestItems(custId);
    const aliasCount = Object.keys(p.aliases || {}).length;
    if (!sug.items.length && !aliasCount) {
      box.style.display = 'block';
      box.innerHTML = `<div style="color:#15803D">💡 <b>KH mới với hệ thống</b> — chưa có lịch sử. Sau khi tạo đơn đầu, hệ thống sẽ tự nhớ để gợi ý lần sau.</div>`;
      return;
    }
    box.style.display = 'block';
    let html = '';
    if (sug.items.length) {
      const tag = sug.source === 'last' ? '🕐 ĐẶT GIỐNG LẦN TRƯỚC' : '⭐ HAY ĐẶT';
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <b style="color:#15803D">${tag}</b>
        <span style="color:var(--muted);font-size:11px">${sug.items.length} mặt hàng</span>
        <div style="flex:1"></div>
        <button type="button" class="btn btn-primary btn-sm" onclick="window.applyCustSuggestion('${custId}')" style="padding:3px 10px;font-size:11.5px">✓ Điền nguyên đơn cũ</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${sug.items.map(it => `<button type="button" onclick="window.addOneFromSuggestion('${it.id}',${it.qty})" style="background:#fff;border:1px solid #16A34A;color:#15803D;padding:3px 9px;border-radius:99px;font-size:11px;cursor:pointer" title="Thêm ${it.name} ${it.qty}${it.unit||''}">+ ${it.name} <b>${it.qty}</b></button>`).join('')}
      </div>`;
    }
    if (aliasCount) {
      html += `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #BBF7D0;font-size:11.5px;color:#15803D">
        📖 KH này có <b>${aliasCount}</b> từ điển riêng (vd "hành"→"hành tây"). AI sẽ tự áp dụng khi đọc ảnh đơn.
        <a href="#" onclick="event.preventDefault();window.openCustAliasMgr('${custId}')" style="color:#1B5E20;font-weight:600;margin-left:6px">⚙ Quản lý từ điển</a>
      </div>`;
    } else {
      html += `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #BBF7D0;font-size:11px;color:var(--muted)">
        💡 Chưa có từ điển riêng. Khi AI đọc ảnh đơn KH này không khớp SP nào, em sẽ hỏi để học. <a href="#" onclick="event.preventDefault();window.openCustAliasMgr('${custId}')" style="color:#15803D">⚙ Thêm thủ công</a>
      </div>`;
    }
    box.innerHTML = html;
  }

  /* Điền nguyên đơn cũ */
  window.applyCustSuggestion = function(custId) {
    const sug = window.CustPrefs.suggestItems(custId);
    sug.items.forEach(it => {
      const p = window.productById(it.id); if (!p) return;
      const price = window.priceOn(it.id, window.todayISO());
      const existing = orderItems.find(x => x.id === it.id);
      if (existing) existing.qty += it.qty;
      else orderItems.push({ id: it.id, name: p.name, unit: p.unit, img: p.img, qty: it.qty, price, total: Math.round(it.qty * price) });
      if (existing) existing.total = Math.round(existing.qty * existing.price);
    });
    renderOrderItems();
    window.toast(`✓ Đã điền ${sug.items.length} mặt hàng từ ${sug.source==='last'?'đơn gần nhất':'list hay đặt'}`, 'success');
  };

  /* Thêm 1 SP từ chip gợi ý */
  window.addOneFromSuggestion = function(productId, qty) {
    const p = window.productById(productId); if (!p) return;
    const price = window.priceOn(productId, window.todayISO());
    const existing = orderItems.find(x => x.id === productId);
    if (existing) { existing.qty += +qty; existing.total = Math.round(existing.qty * existing.price); }
    else orderItems.push({ id: productId, name: p.name, unit: p.unit, img: p.img, qty: +qty, price, total: Math.round(qty * price) });
    renderOrderItems();
  };

  /* Modal quản lý từ điển riêng của 1 KH */
  window.openCustAliasMgr = function(custId) {
    const c = window.STORE.get('customers', []).find(x => x.id === custId);
    const p = window.CustPrefs.get(custId);
    const products = window.STORE.get('products', window.PRODUCTS || []) || [];
    const aliasRows = Object.entries(p.aliases).map(([w, pid]) => {
      const prod = products.find(x => x.id === pid);
      const dq = p.defaultQty[pid] || '';
      return `<tr><td>"${w}"</td><td>→ ${prod ? prod.name + ' <span style="color:var(--muted);font-family:monospace;font-size:11px">'+pid+'</span>' : '<i style="color:#DC2626">SP không còn</i>'}</td><td>${dq}</td><td><button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window._delAlias('${custId}','${w}')">✕</button></td></tr>`;
    }).join('') || `<tr><td colspan="4" style="padding:14px;text-align:center;color:var(--muted)">Chưa có từ điển nào. Thêm bên dưới ↓</td></tr>`;

    const prodOpts = `<option value="">— Chọn SP chuẩn —</option>` + products.map(x => `<option value="${x.id}">${x.id} · ${x.name}</option>`).join('');
    window.openModal('📖 Từ điển riêng của ' + (c?.name || custId), `
      <div style="background:#EFF6FF;color:#1E40AF;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:12px;line-height:1.55">
        💡 <b>Cá nhân hoá per KH</b> — giải quyết tình huống KH "${c?.name||'này'}" nhắn ngắn (vd "hành 50kg") nhưng kho có nhiều loại hành (tây/ta/lá). Bạn dạy hệ thống 1 lần — sau đó AI tự hiểu khi đọc ảnh đơn của KH.
        <br><br><b>Ví dụ:</b> Word "hành" → SP "Hành tây trắng" (SP006) · SL mặc định 50kg.
      </div>

      <h3 style="font-size:12px;color:var(--navy);text-transform:uppercase;margin:0 0 6px">Từ điển hiện có (${Object.keys(p.aliases).length})</h3>
      <table class="mini-table" style="width:100%">
        <thead><tr><th>Khi KH viết</th><th>= SP nào</th><th>SL mặc định</th><th></th></tr></thead>
        <tbody id="aliasTbody">${aliasRows}</tbody>
      </table>

      <h3 style="font-size:12px;color:var(--navy);text-transform:uppercase;margin:14px 0 6px">+ Thêm từ điển mới</h3>
      <div style="display:grid;grid-template-columns:1fr 2fr 90px 80px;gap:6px;align-items:end">
        <div><label style="font-size:11px;color:var(--muted)">Từ KH viết</label><input id="alWord" placeholder="hành" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px;font-size:12px"></div>
        <div><label style="font-size:11px;color:var(--muted)">= SP nào</label><select id="alPid" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px;font-size:12px">${prodOpts}</select></div>
        <div><label style="font-size:11px;color:var(--muted)">SL TB</label><input id="alQty" type="number" placeholder="50" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px;font-size:12px"></div>
        <div><button class="btn btn-primary btn-sm" onclick="window._addAlias('${custId}')">+ Thêm</button></div>
      </div>

      <h3 style="font-size:12px;color:var(--navy);text-transform:uppercase;margin:16px 0 6px">⭐ Top SP KH này hay đặt</h3>
      <div style="display:flex;flex-wrap:wrap;gap:5px;font-size:11.5px">
        ${(p.favorites||[]).map(pid => {
          const prod = products.find(x => x.id === pid);
          return prod ? `<span style="background:#F0FDF4;color:#15803D;padding:3px 8px;border-radius:99px">${prod.name} ${p.defaultQty[pid]?'· ~'+p.defaultQty[pid]+prod.unit:''}</span>` : '';
        }).join('') || '<span style="color:var(--muted)">Chưa có đơn — không có dữ liệu</span>'}
      </div>
    `, {
      footer:`<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>`,
      width:'620px'
    });
  };

  /* ============ Lưu items hiện tại thành đơn định kỳ ============ */
  window.saveAsRecurring = function() {
    const custId = window.formVal('#oCust');
    if (!custId) { window.toast('Chọn KH trước','warn'); return; }
    if (!orderItems.length) { window.toast('Thêm ít nhất 1 mặt hàng','warn'); return; }
    const c = window.STORE.get('customers', []).find(x => x.id === custId);
    /* Lưu intermediate trong sessionStorage để recurring.html prefill */
    sessionStorage.setItem('_pendingRO', JSON.stringify({
      custId, custName: c ? c.name : '',
      items: orderItems.map(it => ({ productId: it.id, name: it.name, qty: it.qty })),
      fromOrder: true,
    }));
    if (!confirm(`Sẽ chuyển sang trang Đơn định kỳ với:\n- KH: ${c?.name||custId}\n- ${orderItems.length} mặt hàng (đã prefill)\n\nĐi tới bây giờ?`)) return;
    window.location.href = 'recurring.html?fromOrder=1';
  };

  window._addAlias = function(custId) {
    const w = document.getElementById('alWord').value.trim();
    const pid = document.getElementById('alPid').value;
    const qty = parseFloat(document.getElementById('alQty').value) || 0;
    if (!w || !pid) { window.toast('Nhập từ + chọn SP','warn'); return; }
    window.CustPrefs.addAlias(custId, w, pid, qty);
    window.toast('✓ Đã thêm từ điển','success');
    window.openCustAliasMgr(custId);  /* Re-render modal */
  };

  window._delAlias = function(custId, word) {
    window.CustPrefs.removeAlias(custId, word);
    window.openCustAliasMgr(custId);
  };
  window.onChangeService = function(svcId) {
    const isLienTinh = svcId === 'lien-tinh';
    const modeWrap = document.getElementById('modeWrap');
    if (modeWrap) modeWrap.style.display = isLienTinh ? '' : 'none';
  };

  window.submitCreateOrder = function(initStatus) {
    const custId = window.formVal('#oCust');
    const goods = window.formVal('#oGoods');
    const freight = parseInt(window.formVal('#oFreight'), 10) || 0;
    if (!custId) { window.toast('Chọn khách hàng', 'warn'); return; }
    if (!goods) { window.toast('Nhập tên hàng hóa', 'warn'); return; }
    if (!freight) { window.toast('Nhập cước', 'warn'); return; }

    const customers = window.STORE.get('customers', []);
    const drivers = window.STORE.get('shippers', window.DRIVERS || []);
    const cust = customers.find(c => c.id === custId);

    const drvId = window.formVal('#oDriver');
    const drv = drivers.find(d => d.id === drvId);
    const driver = drvId || '—';
    const driverName = drv ? drv.name : '—';
    const vehicle = drv ? (drv.primaryPlate || 'Xe máy') : '—';

    const svcId = window.formVal('#oSvc');
    const newOrder = {
      code: window.formVal('#oCode'),
      date: new Date().toLocaleString('vi-VN'),
      cust: custId,            /* legacy field — backward compat */
      custId: custId,          /* canonical field — dùng bởi modules mới */
      custName: cust ? cust.name : '—',
      custPhone: cust ? cust.phone : '',
      serviceType: svcId,
      transportMode: window.formVal('#oMode') || 'giao-ngay',
      pickup: 'Kho Tuấn Tú · 36 Tân Mai, Hoàng Mai, HN',
      drop: window.formVal('#oDrop') || (cust ? cust.address : '—'),
      goods,
      qty: parseInt(window.formVal('#oQty'), 10) || 1,
      weight: parseInt(window.formVal('#oWeight'), 10) || 0,
      unit: window.formVal('#oUnit') || 'kg',
      freight,
      cod: parseInt(window.formVal('#oCod'), 10) || 0,
      payBy: window.formVal('#oPayBy'),
      driver, driverName, vehicle,
      external: false,
      status: initStatus,
      staff: window.formVal('#oStaff'),
      note: window.formVal('#oNote') || '',
      items: orderItems.slice(),
    };
    window.STORE.add('orders', newOrder);
    orderItems = [];
    window.closeModal();
    const profitMsg = external ? ` · LN ${window.fmtShort(freight - partnerCost)}₫` : '';
    window.toast('✓ Đã tạo ' + newOrder.code + profitMsg, 'success');
  };

  /* === Auto-open create modal if ?createFor=KH00X === */
  const urlParams = new URLSearchParams(location.search);
  const prefillCust = urlParams.get('createFor');

  /* ============ CỘT HIỂN THỊ ============ */
  const ORD_COL_DEFS = [
    { idx: 2, key: 'time',     label: 'Thời gian' },
    { idx: 4, key: 'drop',     label: 'Giao đến' },
    { idx: 5, key: 'goods',    label: 'Hàng' },
    { idx: 6, key: 'freight',  label: 'Tiền hàng' },
    { idx: 7, key: 'cod',      label: 'COD' },
    { idx: 8, key: 'shipper',  label: 'Shipper / Xe' },
  ];
  function getOrdColPrefs() {
    const p = window.STORE.get('ordColPrefs', null);
    if (!p) { const d = {}; ORD_COL_DEFS.forEach(c => d[c.key] = true); return d; }
    return p;
  }
  function applyOrdColPrefs() {
    const p = getOrdColPrefs();
    ORD_COL_DEFS.forEach(c => {
      const sel = `table thead tr th:nth-child(${c.idx + 1}), table tbody tr td:nth-child(${c.idx + 1})`;
      document.querySelectorAll(sel).forEach(el => { el.style.display = p[c.key] === false ? 'none' : ''; });
    });
  }
  window.openOrderColPicker = function () {
    const p = getOrdColPrefs();
    const html = `<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Bỏ tick để ẩn cột. Cài đặt lưu vào trình duyệt.</div>
      ${ORD_COL_DEFS.map(c => `<label class="check-item"><input type="checkbox" data-col="${c.key}" ${p[c.key] !== false ? 'checked' : ''}> <span>${c.label}</span></label>`).join('')}`;
    window.openModal('⚙ Cột hiển thị', html, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-primary" onclick="window.saveOrdColPrefs()">Áp dụng</button>`,
      width: '360px',
    });
  };
  window.saveOrdColPrefs = function () {
    const prefs = {};
    document.querySelectorAll('input[data-col]').forEach(cb => { prefs[cb.dataset.col] = cb.checked; });
    window.STORE.set('ordColPrefs', prefs);
    window.closeModal();
    applyOrdColPrefs();
    window.toast('✓ Đã cập nhật cột hiển thị', 'success');
  };

  /* ============ IN PHIẾU HÀNG LOẠT (theo filter hiện tại) ============ */
  window.printFilteredOrders = function () {
    const all = window.STORE.get('orders', window.ORDERS || []);
    const filtered = all.filter(o => match(o));
    if (!filtered.length) { window.toast('Không có đơn nào trong bộ lọc hiện tại', 'warn'); return; }
    if (filtered.length > 30 && !confirm(`Sẽ in ${filtered.length} phiếu giao hàng (${filtered.length} trang A5). Tiếp tục?`)) return;
    const customers = window.STORE.get('customers', window.CUSTOMERS || []);
    const company = window.STORE.get('company', { name: 'Nông Sản Tuấn Tú Hà Nội', addr: '36 Tân Mai, Hoàng Mai, Hà Nội', phone: '0903 111 222' });
    const pageHtml = filtered.map(o => {
      const c = customers.find(x => x.id === o.cust) || {};
      const items = o.items || [];
      const totalQty = items.reduce((s, it) => s + (it.qty || 0), 0);
      const totalAmt = items.reduce((s, it) => s + (it.total || 0), 0);
      return `<div class="slip">
        <div class="hd">
          <div class="l"><h1>🌱 ${company.name.toUpperCase()}</h1><div class="sub">${company.addr} · ☎ ${company.phone}</div></div>
          <div class="r"><div class="code">${o.code}</div><div>Ngày: ${o.date}</div></div>
        </div>
        <div class="title">PHIẾU GIAO HÀNG</div>
        <div class="kv"><b>KH:</b> ${o.custName}${c.code ? ' (' + c.code + ')' : ''}${c.phone ? ' · ☎ ' + c.phone : ''}</div>
        <div class="kv"><b>Địa chỉ:</b> ${o.drop || '—'}</div>
        <table>
          <thead><tr><th>#</th><th>Mặt hàng</th><th class="num">SL</th><th>ĐVT</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
          <tbody>${items.map((it, i) => `<tr>
            <td>${i + 1}</td><td>${it.name || ''}</td>
            <td class="num">${it.qty || 0}</td><td>${it.unit || 'kg'}</td>
            <td class="num">${(it.price || 0).toLocaleString('vi-VN')}</td>
            <td class="num">${(it.total || 0).toLocaleString('vi-VN')}</td>
          </tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="2"><b>TỔNG</b></td><td class="num">${totalQty}</td><td></td><td></td><td class="num" style="color:#DC2626"><b>${totalAmt.toLocaleString('vi-VN')} ₫</b></td></tr></tfoot>
        </table>
        <div class="sig">
          <div><b>Người lập</b><br>${o.staff || ''}</div>
          <div><b>Shipper</b><br>${o.driverName || '............'}</div>
          <div><b>Khách nhận</b><br>............</div>
        </div>
      </div>`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${filtered.length} phiếu giao hàng</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
  body{color:#222;font-size:12px;line-height:1.4}
  .slip{padding:18px 22px;page-break-after:always;min-height:148mm}
  .slip:last-child{page-break-after:auto}
  .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #339B21;padding-bottom:10px;margin-bottom:10px}
  .hd .l h1{font-size:16px;color:#339B21;font-weight:800}
  .hd .l .sub{font-size:10px;color:#555;margin-top:2px}
  .hd .r{text-align:right;font-size:10px;color:#555}
  .hd .r .code{font-size:15px;color:#1B5E20;font-weight:800}
  .title{text-align:center;font-size:16px;font-weight:800;color:#1B5E20;letter-spacing:1px;margin:8px 0}
  .kv{margin:4px 0;font-size:11.5px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-top:6px}
  th,td{border:1px solid #ddd;padding:5px 7px;text-align:left}
  th{background:#F0FDF4;color:#1B5E20;font-weight:700;font-size:10px}
  td.num{text-align:right}
  tfoot td{background:#FAFAFB;font-weight:700}
  .sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-top:24px;text-align:center;font-size:10.5px;padding-top:30px;border-top:1px dashed #ccc}
  @media print{body{padding:0}}
</style></head><body>${pageHtml}
<script>window.onload=()=>{setTimeout(()=>window.print(),200)}<\/script>
</body></html>`;
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) { window.toast('Trình duyệt chặn popup — cho phép rồi thử lại', 'warn'); return; }
    w.document.write(html); w.document.close();
    window.toast(`🖨 Đang chuẩn bị ${filtered.length} phiếu giao hàng…`, 'info');
  };

  /* ============================================================
     GỬI ĐƠN CHO SHIPPER — Telegram bot DM / Email / Copy clipboard
     ============================================================ */
  function buildShipperOrderMsg(o) {
    const customers = window.STORE.get('customers', window.CUSTOMERS || []);
    const c = customers.find(x => x.id === o.cust) || {};
    const items = (o.items || []).map(it => `   • ${it.name} × ${it.qty}${it.unit||'kg'} — ${(it.total||0).toLocaleString('vi-VN')}đ`).join('\n');
    const total = (o.items || []).reduce((s, it) => s + (it.total || 0), 0);
    return `🛒 ĐƠN GIAO HÀNG — ${o.code}
📅 ${o.date}

👤 KH: ${o.custName}${c.code ? ' ('+c.code+')' : ''}
📍 Giao đến: ${o.drop || '—'}
☎ SĐT: ${c.phone || '—'}

📦 Danh sách hàng (${(o.items||[]).length} món):
${items}

💵 Tổng tiền: ${total.toLocaleString('vi-VN')} ₫
💳 Hình thức: ${o.payBy || '—'}${o.cod ? `\n🟡 Thu hộ COD: ${o.cod.toLocaleString('vi-VN')} ₫` : ''}
${o.note ? `\n📝 Ghi chú: ${o.note}` : ''}

— CRM Nông Sản Tuấn Tú`;
  }

  window.sendOrderToShipper = function (code) {
    const o = orders.find(x => x.code === code);
    if (!o) return;
    const drivers = window.STORE.get('shippers', window.DRIVERS || []);
    const dr = drivers.find(d => d.id === o.driver || d.name === o.driverName);
    if (!dr || !o.driver || o.driver === '—') {
      window.toast('Đơn chưa gán shipper — cần gán shipper trước', 'warn');
      return;
    }
    const msg = buildShipperOrderMsg(o);
    const tg = window.STORE.get('int_telegram', {});
    const hasTelegram = !!(tg.botToken && dr.telegramChatId);
    const groupCh = window.getTgChannel ? window.getTgChannel('shipper_dispatch') : null;
    const hasGroup = !!groupCh;
    const hasEmail = !!dr.email;
    const hasPhone = !!dr.phone;

    window.openModal('📤 Gửi đơn cho shipper', `
      <div style="display:flex;gap:10px;align-items:center;padding:10px 14px;background:#F0FDF4;border-left:3px solid var(--ok);border-radius:7px;margin-bottom:14px">
        <div style="width:42px;height:42px;border-radius:50%;background:${window.avatarColor(dr.name)};color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px">${window.initials(dr.name)}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px;color:var(--navy)">${dr.name}</div>
          <div style="font-size:11.5px;color:var(--muted)">${dr.phone || ''} · ${dr.primaryPlate || ''}</div>
        </div>
        <div style="text-align:right;font-size:11px;color:var(--muted)">
          ${hasTelegram ? '<div style="color:#0088CC">✓ TG cá nhân</div>' : '<div>✗ Chưa có TG cá nhân</div>'}
          ${hasGroup ? `<div style="color:#7C3AED">✓ Group: ${groupCh.channelName}</div>` : '<div>✗ Chưa cấu hình group</div>'}
          ${hasEmail ? '<div style="color:#15803D">✓ Email</div>' : '<div>✗ Chưa có email</div>'}
        </div>
      </div>

      <div style="font-weight:600;font-size:12px;color:var(--navy);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.3px">👁 Tin nhắn sẽ gửi</div>
      <textarea id="shipperMsgBox" rows="13" style="width:100%;font-family:ui-monospace,monospace;font-size:12px;padding:10px;border:1px solid var(--line);border-radius:7px;line-height:1.5">${msg}</textarea>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:14px">
        ${hasTelegram ? `<button class="btn btn-navy" onclick="window.doSendOrderTg('${code}','${dr.id}')">✈️ TG cá nhân</button>` : ''}
        ${hasGroup ? `<button class="btn btn-navy" style="background:#7C3AED" onclick="window.doSendOrderTgGroup('${code}')">👥 Group "${groupCh.channelName.slice(0,18)}"</button>` : ''}
        <button class="btn btn-ghost" onclick="window.doSendOrderEmail('${code}','${dr.id}')">${hasEmail ? '📧 Email' : '📧 Email mailto'}</button>
        <button class="btn btn-primary" onclick="window.doSendOrderCopy('${code}')">📋 Copy</button>
      </div>

      ${!hasTelegram && !hasGroup ? `<div style="margin-top:10px;padding:8px 10px;background:#FEF3C7;border-radius:6px;font-size:11.5px;color:var(--warn)">
        💡 <b>Có 2 cách gửi qua Telegram:</b><br>
        1. <b>Cá nhân:</b> điền Telegram Chat ID của shipper ở trang Shipper (shipper /start bot rồi /myid).<br>
        2. <b>Group chung:</b> Cài đặt → Telegram Bot → thêm kênh "Phân đơn shipper" → map purpose <code>shipper_dispatch</code>.
      </div>` : ''}

      ${!hasPhone ? '' : `<div style="margin-top:8px;text-align:center;font-size:11.5px"><a href="tel:${dr.phone.replace(/\\s/g,'')}" style="color:var(--red);font-weight:600;text-decoration:none">☎ Gọi trực tiếp ${dr.phone}</a></div>`}
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>`,
      width: '560px',
    });
  };

  window.doSendOrderTg = async function (code, drId) {
    const msg = document.getElementById('shipperMsgBox').value;
    const drivers = window.STORE.get('shippers', window.DRIVERS || []);
    const dr = drivers.find(d => d.id === drId);
    const tg = window.STORE.get('int_telegram', {});
    try {
      const r = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: dr.telegramChatId, text: msg }),
      });
      const j = await r.json();
      if (j.ok) {
        window.toast(`✅ Đã gửi đơn ${code} → ${dr.name} qua Telegram`, 'success');
        /* Log lịch sử */
        const o = orders.find(x => x.code === code);
        if (o) {
          const log = (o.shipperNotify || []).slice();
          log.unshift({ at: new Date().toLocaleString('vi-VN'), channel: 'telegram', to: dr.name, ok: true });
          window.STORE.update('orders', code, { shipperNotify: log });
        }
        window.closeModal();
      } else {
        window.toast('❌ Telegram lỗi: ' + (j.description || 'unknown'), 'danger');
      }
    } catch (e) { window.toast('❌ Network: ' + e.message, 'danger'); }
  };

  window.doSendOrderTgGroup = async function (code) {
    const msg = document.getElementById('shipperMsgBox').value;
    const r = await window.sendTgMessage('shipper_dispatch', msg);
    if (r.ok) {
      window.toast(`✅ Đã gửi đơn ${code} → group ${r.channel}`, 'success');
      const o = orders.find(x => x.code === code);
      if (o) {
        const log = (o.shipperNotify || []).slice();
        log.unshift({ at: new Date().toLocaleString('vi-VN'), channel: 'telegram-group', to: r.channel, ok: true });
        window.STORE.update('orders', code, { shipperNotify: log });
      }
      window.closeModal();
    } else {
      window.toast('❌ ' + r.error, 'danger');
    }
  };

  window.doSendOrderEmail = function (code, drId) {
    const msg = document.getElementById('shipperMsgBox').value;
    const drivers = window.STORE.get('shippers', window.DRIVERS || []);
    const dr = drivers.find(d => d.id === drId);
    const subject = `[NSTT] Đơn giao ${code}`;
    const mailto = `mailto:${dr.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
    window.location.href = mailto;
    const o = orders.find(x => x.code === code);
    if (o) {
      const log = (o.shipperNotify || []).slice();
      log.unshift({ at: new Date().toLocaleString('vi-VN'), channel: 'email', to: dr.name, ok: true });
      window.STORE.update('orders', code, { shipperNotify: log });
    }
    window.toast('✓ Mở email client', 'info');
  };

  window.doSendOrderCopy = async function (code) {
    const msg = document.getElementById('shipperMsgBox').value;
    try {
      await navigator.clipboard.writeText(msg);
      window.toast('✓ Đã copy vào clipboard — paste vào chat shipper', 'success');
    } catch (e) {
      window.toast('Copy lỗi: ' + e.message, 'warn');
    }
  };

  /* Re-apply col prefs sau khi render() lại */
  const _origRenderFn = render;
  window.STORE.subscribe('orders', () => setTimeout(applyOrdColPrefs, 0));

  /* Subscribe + init */
  window.STORE.subscribe('orders', render);
  window.renderAppShell('orders', 'Đơn hàng');
  window.bindTabs();
  render();
  setTimeout(applyOrdColPrefs, 100);
  if (prefillCust) setTimeout(() => window.openCreateOrder(prefillCust), 200);
})();
