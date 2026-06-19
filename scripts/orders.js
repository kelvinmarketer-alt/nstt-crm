/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Trang Đơn hàng (Full CRUD)
   ========================================================= */
(function () {
  let SVC = Object.fromEntries((window.SERVICE_TYPES || []).map(s => [s.id, s]));
  /* Cho phép dựng lại map nhóm hàng khi danh mục cloud nạp về (tránh hiện raw id "tom") */
  window.rebuildOrderSvc = function () { SVC = Object.fromEntries((window.SERVICE_TYPES || []).map(s => [s.id, s])); };
  /* 1 đơn có thể có NHIỀU nhóm hàng — serviceType lưu chuỗi ghép "id1,id2" */
  const svcIdsOf = o => String((o && o.serviceType) || '').split(',').map(s => s.trim()).filter(Boolean);

  /* ===== Gộp số lượng theo TỪNG đơn vị (dùng chung: form + chi tiết đơn) ===== */
  const unitNorm = u => { let s = (u || '').toString().trim().toLowerCase(); const m = s.match(/\(([^)]+)\)/); if (m) s = m[1].trim(); return s || 'đv'; };
  const fmtNum2 = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  /* items/groups [{unit,qty}] → "43 kg · 10 bắp · 2 hộp · 1 thùng" (kg đứng đầu) */
  function unitBreakdownOf(items) {
    const by = {};
    (items || []).forEach(x => { const u = unitNorm(x.unit); by[u] = (by[u] || 0) + (+x.qty || 0); });
    const keys = Object.keys(by).sort((a, b) => a === 'kg' ? -1 : b === 'kg' ? 1 : a.localeCompare(b, 'vi'));
    return keys.map(u => `${fmtNum2(by[u])} ${u}`).join(' · ');
  }
  /* Tổng TRỌNG LƯỢNG thật (chỉ cộng các mặt hàng tính theo kg/g) → KHÔNG gộp gói/hộp/quả vào.
     Trả null nếu đơn không có mặt hàng kg nào (để caller fallback về o.weight cũ). */
  function kgTotalOf(items) {
    let kg = 0, has = false;
    (items || []).forEach(x => {
      const u = unitNorm(x.unit);
      if (u === 'kg')              { kg += (+x.qty || 0);          has = true; }
      else if (u === 'g' || u === 'gram') { kg += (+x.qty || 0) * 0.001; has = true; }
    });
    return has ? kg : null;
  }
  /* Tách riêng các đơn vị KHÁC kg → "0.5 gói · 4 hộp" (để hiện cạnh số kg, không lặp kg). */
  function nonKgBreakdownOf(items) {
    const by = {};
    (items || []).forEach(x => { const u = unitNorm(x.unit); if (u !== 'kg' && u !== 'g' && u !== 'gram') by[u] = (by[u] || 0) + (+x.qty || 0); });
    return Object.keys(by).sort((a, b) => a.localeCompare(b, 'vi')).map(u => `${fmtNum2(by[u])} ${u}`).join(' · ');
  }

  /* ===== Ô tiền: hiển thị có dấu chấm (1.531.250), đọc về số nguyên ===== */
  const _moneyVal = (sel) => parseInt(String((window.formVal && window.formVal(sel)) || '').replace(/\D/g, ''), 10) || 0;
  window._fmtMoneyInput = function (el) {
    const start = el.selectionStart, before = el.value.length;
    const d = el.value.replace(/\D/g, '');
    el.value = d ? Number(d).toLocaleString('vi-VN') : '';
    /* giữ con trỏ tương đối khi gõ ở cuối */
    const after = el.value.length;
    if (start != null) { try { el.selectionStart = el.selectionEnd = Math.max(0, start + (after - before)); } catch (e) {} }
  };

  /* Nhắc khung giờ nhận đơn + vận chuyển theo CA GIAO (quy trình báo hàng Tuấn Tú) */
  const _SHIFT_HINTS = {
    'Sáng':  '🌅 Đơn giao SÁNG: chốt đơn <b>trước 22h30 tối hôm trước</b> · xe giao <b>5h–11h sáng</b>.',
    'Chiều': '🌇 Đơn giao CHIỀU: chốt đơn <b>12h30–13h30 cùng ngày</b> · xe giao <b>15h30–17h30 chiều</b>.',
    'Trưa':  '🕛 Giao buổi TRƯA — sắp theo lịch xe, liên hệ điều phối xác nhận giờ.',
    'Tối':   '🌙 Giao buổi TỐI — liên hệ điều phối xác nhận khung giờ.',
  };
  window._oShiftHint = function (v) {
    const el = document.getElementById('oShiftHint'); if (!el) return;
    if (v && _SHIFT_HINTS[v]) { el.innerHTML = _SHIFT_HINTS[v]; el.style.display = ''; }
    else { el.innerHTML = ''; el.style.display = 'none'; }
  };
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
  let orderTier = '';    // nhóm giá áp dụng cho đơn đang tạo ('' = giá gốc; theo nhóm giá của KH)
  let _pendingSample = null;  // ảnh đơn vừa đọc bằng AI → lưu thành mẫu "nhớ nét chữ" khi lưu đơn

  /* Đơn giá 1 SP theo NHÓM GIÁ đang chọn của đơn (fallback giá gốc) */
  function priceForOrder(productId) {
    return (typeof window.tierPriceOn === 'function')
      ? window.tierPriceOn(productId, window.todayISO(), orderTier)
      : window.priceOn(productId, window.todayISO());
  }

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
    orders.forEach(o => svcIdsOf(o).forEach(id => counts[id] = (counts[id]||0)+1));
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
    /* Migration 1 lần: đơn web cũ status 'new' → 'confirmed' (đồng nhất với đơn tự tạo) */
    let _migrated = false;
    orders.forEach(o => { if (o && o.status === 'new') { o.status = 'confirmed'; _migrated = true; } });
    if (_migrated) window.STORE.set('orders', orders);
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
      try {
        /* Chuẩn hoá status: đơn web cũ dùng 'new' → coi như 'confirmed' (Mới) */
        const statusKey = STATUS[o.status] ? o.status : 'confirmed';
        const st = STATUS[statusKey];
        const unitStr = (o.unit || 'kg').toLowerCase();
        const dropStr = (o.drop || '—').split(',').slice(0, 2).join(',');
        /* Nguồn đơn: web (qua source HOẶC note 'Đơn từ web' — bền cả sau reload cloud) vs tự tạo */
        const isWeb = o.source === 'web' || /Đơn từ web/i.test(o.note || '');
        const src = isWeb ? { icon: '🛒', label: 'Đơn web', color: '#7C3AED' }
                          : { icon: '✍️', label: 'Tự tạo', color: '#0EA5E9' };
        return `<tr data-code="${o.code}">
          <td onclick="event.stopPropagation()"><div class="checkbox" onclick="this.classList.toggle('on')"></div></td>
          <td><b style="color:var(--navy)">${o.code || '—'}</b>
              <div style="margin-top:2px">
                <span class="tag" style="background:${src.color}1a;color:${src.color};font-weight:600;font-size:10.5px">${src.icon} ${src.label}</span>
              </div></td>
          <td class="hide-sm" data-field="date" title="Click để sửa ngày đặt" style="font-size:12px;color:var(--muted)">${o.date || '—'}</td>
          <td class="cust-col">
            <div class="name-clamp" data-field="custName" title="Click để sửa tên KH">${o.custName || '—'}</div>
            <div style="font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.cust || ''} · <span data-field="staff" title="Click để đổi NV phụ trách">${o.staff || ''}</span></div>
          </td>
          <td class="hide-md" data-field="drop" title="Click để sửa địa chỉ giao" style="font-size:12px">${dropStr}</td>
          <td class="hide-md" style="font-size:12px" title="Tổng sản lượng — tách theo từng đơn vị (kg, gói, hộp… đếm RIÊNG, không cộng gộp)">${(() => {
              const its = Array.isArray(o.items) ? o.items : [];
              const nSku = its.length;
              const bd = unitBreakdownOf(its);   /* "38.5 kg · 0.5 gói · 4 hộp" — KHÔNG cộng khác đơn vị thành kg */
              if (bd) return `<b>${bd}</b>${nSku ? ` <span style="color:var(--muted)">· ${nSku} mã</span>` : ''}`;
              return o.weight ? `${o.weight} kg` : `${o.qty || 0} ${unitStr}`;
            })()}</td>
          <td class="num" data-field="freight" title="Click để sửa tiền hàng">${window.fmt(o.freight || 0)}</td>
          <td class="num hide-md" data-field="cod" title="Click để sửa COD">${o.cod ? window.fmt(o.cod) : '—'}</td>
          <td class="hide-md" style="font-size:12px">
            <div><span data-field="driverName" title="Click để đổi shipper">${o.driverName || '—'}</span>${o.external?' <span class="alert-badge warn" style="font-size:9px">ĐT ngoài</span>':''}</div>
            <div style="color:var(--muted);font-size:11px">${o.vehicle || ''}${o.external && o.partnerCost?' · '+window.fmtShort(o.partnerCost)+'đ':''}</div>
          </td>
          <td onclick="event.stopPropagation()">
            <select class="status-select status-select-${statusKey}" data-code="${o.code}" data-act="status"
              title="Đổi trạng thái đơn"
              style="border:1px solid var(--line);border-radius:7px;padding:5px 8px;font-size:11.5px;font-weight:700;cursor:pointer;background:${st.color}15;color:${st.color};min-width:130px">
              ${ALL_STATUSES.map(k => `<option value="${k}" ${statusKey===k?'selected':''}>${STATUS[k].icon} ${STATUS[k].label}</option>`).join('')}
            </select>
          </td>
          <td onclick="event.stopPropagation()">
            <div class="row-actions">
              <button title="In phiếu giao hàng / xác nhận / xuất kho" data-act="print" data-code="${o.code}">🖨</button>
              ${(o.status === 'delivered' || o.status === 'settled') ? `<button title="🧾 Phiếu xuất kho" data-act="deliveryNote" data-code="${o.code}" style="color:#C00000">🧾</button>` : ''}
              <button title="Xem thông tin đơn" data-act="edit" data-code="${o.code}">👁</button>
            </div>
          </td>
        </tr>`;
      } catch (err) {
        console.warn('[orders render] bỏ qua đơn lỗi:', o.code, err.message);
        return ''; /* skip đơn lỗi, không break cả map */
      }
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

    /* Bulk operations: chọn nhiều đơn → xoá/export/đổi trạng thái */
    if (window.attachBulkOps) {
      const tb = document.getElementById('tbody');
      const tbl = tb.closest('table');
      if (tbl) {
        if (!tbl.id) tbl.id = 'tblOrders';
        window.attachBulkOps({
          tableSelector: '#' + tbl.id,
          store: 'orders',
          idAttr: 'data-code',
          label: 'đơn',
          actions: {
            changeStatus: {
              label: '🔄 Đổi trạng thái',
              field: 'status',
              options: [
                {id:'new', label:'🆕 Mới'},
                {id:'confirmed', label:'✓ Đã xác nhận'},
                {id:'pickup', label:'📦 Lấy hàng'},
                {id:'transit', label:'🚚 Đang giao'},
                {id:'delivered', label:'✓ Đã giao'},
                {id:'cancelled', label:'❌ Hủy'},
              ]
            }
          }
        });
      }
    }

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
    if (currentService && !svcIdsOf(o).includes(currentService)) return false;
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
  function changeOrderStatus(code, newStatus, skipDeliveryConfirm) {
    const o = orders.find(x => x.code === code);
    if (!o || !STATUS[newStatus] || o.status === newStatus) return;
    const oldStatus = o.status;

    /* CỔNG XÁC NHẬN GIAO: không cho nhảy thẳng "Đã giao" — phải xác nhận đủ/trả/thiếu */
    if (newStatus === 'delivered' && oldStatus !== 'delivered' && !skipDeliveryConfirm) {
      const sel = document.querySelector(`#tbody select.status-select[data-code="${code}"]`);
      if (sel) sel.value = oldStatus;   /* revert dropdown */
      window.confirmDeliveryModal(code);
      return;
    }

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

  /* ===== CỔNG XÁC NHẬN GIAO HÀNG ===== */
  window.confirmDeliveryModal = function (code) {
    const o = orders.find(x => x.code === code); if (!o) return;
    window.openModal('🛵 Xác nhận giao hàng — ' + code, `
      <div style="font-size:13px;color:#334155;margin-bottom:14px;line-height:1.6">
        Shipper đã giao đơn <b>${code}</b> cho <b>${o.custName || ''}</b>.<br>Kết quả giao thực tế thế nào?
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-primary" style="justify-content:flex-start;background:#15803D;border-color:#15803D" onclick="window._finalizeDelivery('${code}','success')">✅ Giao đủ — thành công</button>
        <button class="btn btn-ghost" style="justify-content:flex-start;border-color:#F59E0B;color:#B45309" onclick="window._finalizeDelivery('${code}','return')">↩️ Khách trả lại hàng (hỏng / sai)</button>
        <button class="btn btn-ghost" style="justify-content:flex-start;border-color:#DC2626;color:#B91C1C" onclick="window._finalizeDelivery('${code}','short')">⚠️ Giao thiếu hàng</button>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:12px">Chọn "trả lại" hoặc "thiếu" → tự mở module Trả hàng để ghi nhận. Mọi kết quả đều gửi thông báo Telegram.</div>
    `, { footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Để sau</button>`, width: '460px' });
  };

  window._finalizeDelivery = function (code, outcome) {
    if (window.closeModal) window.closeModal();
    changeOrderStatus(code, 'delivered', true);   /* set Đã giao, bỏ qua cổng xác nhận */
    const o = orders.find(x => x.code === code);
    if (window.sendTgMessage && o) {
      const base = `📦 ${code} · ${o.custName || ''}`;
      if (outcome === 'success') window.sendTgMessage('alert', `✅ GIAO THÀNH CÔNG\n${base}`);
      else if (outcome === 'return') window.sendTgMessage('alert', `↩️ KHÁCH TRẢ HÀNG\n${base}\n👉 Ghi nhận phiếu trả ở module Trả hàng.`);
      else window.sendTgMessage('alert', `⚠️ GIAO THIẾU HÀNG\n${base}\n👉 Kiểm tra + ghi nhận ở Trả hàng.`);
    }
    if (outcome === 'success') { window.toast('✓ Đã xác nhận giao thành công ' + code, 'success'); return; }
    /* trả / thiếu → sang module Trả hàng, prefill đơn */
    try { localStorage.setItem('nstt_pending_return', code); } catch (e) {}
    window.toast('Mở module Trả hàng để ghi nhận…', 'warn');
    setTimeout(() => { window.location.href = 'returns.html?ret=' + encodeURIComponent(code); }, 600);
  };

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
  /* === Render tab "Hàng hóa" trong drawer: checklist + tổng SL gộp theo SP === */
  function renderOrderGoodsTab(o) {
    const host = document.getElementById('iItemsList');
    if (!host) return;
    const items = Array.isArray(o.items) ? o.items : [];
    if (!items.length) {
      host.innerHTML = '<div style="padding:18px;text-align:center;color:var(--muted);font-size:13px;background:#FAFAFB;border-radius:8px">Đơn này chưa có chi tiết mặt hàng.<br><span style="font-size:11.5px">' + (o.goods || '') + '</span></div>';
      const c = document.getElementById('iGoodsCount'); if (c) c.textContent = '';
      return;
    }
    /* Gộp các dòng cùng tên SP → tổng số lượng */
    const norm = s => (s || '').toString().trim().toLowerCase();
    const map = new Map();
    items.forEach(it => {
      const k = norm(it.name);
      if (!map.has(k)) map.set(k, { name: it.name, qty: 0, unit: it.unit || 'kg', total: 0 });
      const g = map.get(k);
      g.qty += (+it.qty || 0);
      g.total += (+it.total || 0);
    });
    const groups = [...map.values()];
    const totalAmt = groups.reduce((s, g) => s + g.total, 0);
    const breakdown = unitBreakdownOf(groups);   /* tách theo từng đơn vị (kg/bắp/hộp/thùng…) */
    const cnt = document.getElementById('iGoodsCount');
    if (cnt) cnt.textContent = `· ${groups.length} mã · ${breakdown}`;
    const nfmt = n => n.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <span style="font-size:11.5px;color:var(--muted);flex:1">✓ Tick để soạn hàng · Bảng dưới có <b>đơn giá &amp; thành tiền</b> (chỉ xem nội bộ — phiếu in KHÔNG hiện giá).</span>
        <button class="btn btn-primary btn-sm" onclick="window.editOrderItems('${(o.code || '').replace(/'/g, "\\'")}')" title="Sửa số lượng / đơn giá / thêm-bớt mặt hàng">✏️ Sửa mặt hàng &amp; giá</button>
      </div>
      <table class="mini-table" style="margin:0">
        <thead><tr><th style="width:30px"></th><th style="width:34px" class="num">STT</th><th>Sản phẩm</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
        <tbody>${groups.map((g, i) => { const up = g.qty ? Math.round(g.total / g.qty) : 0; return `<tr>
          <td class="num"><input type="checkbox" class="bh-check" style="width:16px;height:16px;cursor:pointer" onchange="this.closest('tr').style.opacity=this.checked?'0.5':'1';this.closest('tr').style.textDecoration=this.checked?'line-through':'none'"></td>
          <td class="num" style="color:var(--muted);font-weight:600">${i + 1}</td>
          <td><b>${g.name}</b></td>
          <td class="num"><b style="color:var(--navy)">${nfmt(g.qty)}</b> <span style="font-size:11px;color:var(--muted)">${g.unit}</span></td>
          <td class="num" style="color:#15803D">${up ? window.fmt(up) : '—'}</td>
          <td class="num"><b>${g.total ? window.fmt(g.total) : '—'}</b></td>
        </tr>`; }).join('')}</tbody>
        <tfoot><tr style="background:#F0FDF4;border-top:2px solid #15803D">
          <td></td><td colspan="2" style="padding:8px"><b style="color:#15803D">📊 Tổng cộng</b></td>
          <td class="num"><b style="color:#15803D">${breakdown}</b></td>
          <td class="num"></td>
          <td class="num"><b style="color:var(--red)">${window.fmt(totalAmt)} ₫</b></td>
        </tr></tfoot>
      </table>
      <div style="text-align:right;font-size:12px;color:var(--muted);margin-top:6px">Thành tiền hàng: <b style="color:var(--red)">${window.fmt(totalAmt)} ₫</b></div>`;
  }

  window.openOrder = function(code) {
    const o = orders.find(x => x.code === code);
    if (!o) return;
    window._currentOrderCode = code;   /* dùng cho action buttons trong tab Hành động */
    const svcList = svcIdsOf(o).map(id => SVC[id] || {icon:'❓', label:id, color:'#666'});
    if (!svcList.length && o.serviceType) svcList.push({icon:'❓', label:o.serviceType, color:'#666'});
    const tm = o.transportMode ? TM[o.transportMode] : null;
    const st = STATUS[o.status];

    document.getElementById('dCode').textContent = o.code;
    document.getElementById('dMeta').innerHTML = `
      <span class="status-pill st-${o.status}">${st.icon} ${st.label}</span>
      ${svcList.map(svc => `<span class="svc-tag" style="background:${svc.color}20;color:${svc.color}">${svc.icon} ${svc.label}</span>`).join(' ')}
      ${tm ? `<span class="tm-tag">${tm.icon} ${tm.label}</span>` : ''}
      <span>· ${o.date}</span>
    `;
    document.getElementById('dFreight').textContent = window.fmtShort(o.freight) + ' ₫';
    document.getElementById('dPay').textContent = o.payBy;
    document.getElementById('dCod').textContent = o.cod ? window.fmtShort(o.cod) + ' ₫' : '—';
    /* KHỐI LƯỢNG = tổng kg THẬT từ các mặt hàng (không tin o.weight cũ vì có thể lệch khi sửa items).
       Số nhỏ bên dưới = các đơn vị KHÁC kg (gói/hộp/quả…) để không trùng số kg. */
    const _kg = kgTotalOf(o.items || []);
    document.getElementById('dWeight').textContent = _kg != null ? fmtNum2(_kg) + ' kg' : (o.weight ? o.weight + ' kg' : '—');
    const _nonKg = nonKgBreakdownOf(o.items || []);
    document.getElementById('dUnit').textContent = _nonKg || (_kg == null ? (o.qty + ' ' + (o.unit || 'kg').toLowerCase()) : '—');
    document.getElementById('dService').textContent = svcList.map(s => s.label).join(', ') || '—';
    document.getElementById('dMode').textContent = tm ? tm.label : '—';

    document.getElementById('iCode').textContent  = o.code;
    document.getElementById('iCust').textContent  = o.custName + ' (' + o.cust + ')';
    document.getElementById('iStaff').textContent = o.staff;
    document.getElementById('iDate').textContent  = o.date;
    document.getElementById('iGoods').textContent = `${o.qty} ${o.unit.toLowerCase()} · ${o.goods}` + (_kg != null ? ' · ' + fmtNum2(_kg) + ' kg' : (o.weight ? ' · ' + o.weight + ' kg' : ''));
    const shipEl = document.getElementById('iShip');
    if (shipEl) {
      const parts = [];
      if (o.deliverDate) parts.push('📅 ' + o.deliverDate);
      if (o.shipShift) parts.push('ca ' + o.shipShift);
      if (o.shipTime) parts.push(o.shipTime);
      const whLabel = { gathering:'· đang gom hàng', confirmed:'· đã chốt hàng', released:'· đã xuất kho' }[o.whStatus] || '';
      shipEl.textContent = (parts.join(' · ') || '—') + (whLabel ? ' ' + whLabel : '');
    }
    document.getElementById('iPickup').textContent = o.pickup;
    document.getElementById('iDrop').textContent   = o.drop;
    document.getElementById('iPayBy').textContent  = o.payBy;
    document.getElementById('iTotal').textContent  = window.fmtVND(o.freight + (o.cod||0));
    document.getElementById('iNote').textContent   = o.note || '(không có)';
    document.getElementById('iDriver').innerHTML  = o.driverName + (o.external?' <span class="alert-badge warn" style="font-size:10px;margin-left:6px">🤝 Đối tác ngoài</span>':'');
    document.getElementById('iVehicle').textContent = o.vehicle;
    /* === Tab Hàng hóa: checklist + tổng sản lượng từng SP === */
    renderOrderGoodsTab(o);
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

      if (d.note) { const n = document.getElementById('oNote'); if (n) n.value = d.note; }
      /* Dùng chung pipeline: matcher chặt + tự thêm SP ngoài DM + cảnh báo (không bỏ sót) */
      applyBulkItems(d.items || [], 'AI ảnh đơn' + (c ? ' · ' + c.name : ' · (chưa khớp KH)'));
    }, 220);
  }

  /* === Create order modal === */
  window.openCreateOrder = function(prefillCustId) {
    const customers = window.STORE.get('customers', []);
    const drivers = window.STORE.get('shippers', window.DRIVERS || []);
    const vehicles = window.STORE.get('vehicles', window.VEHICLES || []);
    const partners = window.STORE.get('partners', window.PARTNERS || []).filter(p => p.active);
    const svcItems = (window.MD.get && window.MD.get('services')) || window.SERVICE_TYPES || [];
    const svcChecks = svcItems.map(s => `<label class="oSvc-chip" style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid var(--line);border-radius:16px;cursor:pointer;font-size:12.5px;user-select:none;background:#fff;white-space:nowrap">
        <input type="checkbox" class="oSvcChk" value="${s.id}" style="margin:0;cursor:pointer" onchange="window._oSvcToggle(this)">${s.icon || ''} ${s.label}</label>`).join('');
    const tmOpts = window.MD.options('transportModes');
    const unitOpts = window.MD.options('units');
    /* Mặc định chọn "Công nợ" (đa phần đơn B2B ghi nợ) — robust dù master data có thứ tự khác */
    const payOpts = window.MD.get('payMethods').map(p => `<option ${/nợ/i.test(p.label) ? 'selected' : ''}>${p.label}</option>`).join('');
    const custOpts = `<option value="">-- Chọn KH --</option>` +
      customers.map(c => `<option value="${c.id}" ${c.id===prefillCustId?'selected':''}>${c.code} · ${c.name}</option>`).join('');
    const drvOpts = `<option value="">-- Chọn shipper --</option>` +
      drivers.map(d => `<option value="${d.id}">${d.name} · ${d.primaryPlate}</option>`).join('');
    const vehOpts = `<option value="">-- Chọn xe --</option>` +
      vehicles.map(v => `<option value="${v.id}">${v.plate} · ${v.type}</option>`).join('');
    const partnerOpts = `<option value="">-- Chọn đối tác --</option>` +
      partners.map(p => `<option value="${p.id}">${p.code} · ${p.name}${p.vehiclePlate?' · '+p.vehiclePlate:''}</option>`).join('');
    const prodList = window.STORE.get('products', window.PRODUCTS || []);
    orderItems = [];
    orderTier = '';
    _pendingSample = null;
    const tierOpts = window.priceTierOptions ? window.priceTierOptions('') : '<option value="">— Mặc định (Giá gốc) —</option>';
    const nextCode = window.STORE.nextOrderCode();
    /* NV phụ trách — lấy từ staff thật, default = user đang đăng nhập */
    const meUser = (window.AUTH && window.AUTH.currentUser && window.AUTH.currentUser()) || {};
    const staffList = (window.STORE.get('staff', []) || []).filter(s => s.status !== 'inactive');
    const staffOpts = (staffList.length
      ? staffList.map(s => `<option value="${s.name}" ${s.name===meUser.name?'selected':''}>${s.name}${s.dept?' · '+s.dept:''}</option>`).join('')
      : `<option>${meUser.name || '—'}</option>`);

    window.openModal('+ Tạo đơn mới', `
      <div style="margin-bottom:14px;padding:10px 12px;background:#F3E8FF;border:1px solid #E9D5FF;border-radius:8px;font-size:12px;color:#7C3AED">
        💡 <b>Mã đơn tự sinh:</b> <b>${nextCode}</b>
      </div>
      <div class="form-row">
        <div><label>Mã đơn</label><input id="oCode" value="${nextCode}" readonly style="background:#FAFAFB;font-family:ui-monospace,monospace;font-weight:600"></div>
        <div><label>NV phụ trách</label>
          <select id="oStaff">${staffOpts}</select></div>
      </div>
      <div class="form-row">
        <div><label>Khách hàng * ${window.helpTip ? window.helpTip('Gõ tên/SĐT/mã KH — danh sách tự lọc theo bạn gõ. Ấn ↑↓ chọn, Enter xác nhận. Nếu KH mới chưa có, bấm "+ Thêm KH mới" để mở form thêm nhanh.') : ''}</label>
          <div id="oCust_box"></div>
          <input type="hidden" id="oCust" value="">
        </div>
        <div><label>Nhóm hàng chính <span style="font-weight:400;color:var(--muted);font-size:11px">(tích chọn — 1 đơn có thể nhiều nhóm)</span></label>
          <div id="oSvcBox" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid var(--line);border-radius:7px;max-height:120px;overflow:auto;background:#FAFAFB">${svcChecks}</div></div>
      </div>
      <!-- ====== NHÓM GIÁ ÁP DỤNG (tự lấy theo KH — sửa được) ====== -->
      <div class="form-row" style="align-items:flex-end">
        <div><label>💲 Nhóm giá áp dụng ${window.helpTip ? window.helpTip('Bảng giá KH này được nhận. Tự lấy theo "Nhóm giá" đã gán trong hồ sơ KH — đổi tại đây nếu cần (giá các mặt hàng sẽ tính lại theo nhóm).') : ''}</label>
          <select id="oPriceTier" onchange="window.onOrderTierChange(this.value)">${tierOpts}</select>
        </div>
        <div><div id="oTierNote" style="font-size:11.5px;color:var(--muted);padding:8px 2px">Chọn KH để tự áp nhóm giá của khách.</div></div>
      </div>
      <div class="form-row">
        <div><label>Hình thức giao</label>
          <select id="oMode">${tmOpts}</select></div>
        <div><label>🎯 Giao đến (địa chỉ KH)</label><input id="oDrop" placeholder="Tự lấy theo KH — sửa nếu cần"></div>
      </div>
      <!-- ====== YÊU CẦU GIAO CỦA KHÁCH (ngày + ca + giờ) ====== -->
      <div class="form-row">
        <div><label>📅 Ngày giao ${window.helpTip ? window.helpTip('Ngày KH muốn nhận hàng — Kho gom đơn + đặt NCC theo ngày này.') : ''}</label><input id="oDeliverDate" type="date" value="${(window.todayDate?window.todayDate():new Date()).toISOString().slice(0,10)}"></div>
        <div><label>🕐 Ca giao</label>
          <select id="oShipShift" onchange="window._oShiftHint(this.value)"><option value="">— chọn ca —</option><option value="Sáng">Sáng</option><option value="Trưa">Trưa</option><option value="Chiều">Chiều</option><option value="Tối">Tối</option></select>
          <div id="oShiftHint" style="font-size:11.5px;color:#92400E;margin-top:4px;display:none;line-height:1.45"></div></div>
      </div>
      <div class="form-row">
        <div><label>⏰ Giờ giao yêu cầu</label><input id="oShipTime" placeholder="VD: trước 6h sáng, 14h-15h..."></div>
        <div></div>
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
        <div style="flex:2"><label>Chọn sản phẩm <span style="font-weight:400;color:var(--muted);font-size:11px">(gõ tên/mã để tìm)</span></label><input class="prodpick" id="oProd" data-pid="" placeholder="Gõ tên hoặc mã SP… (vd: cà chua, SP012)" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:8px 11px;font-size:13px"></div>
        <div><label>Số lượng</label><input id="oProdQty" type="number" value="1" min="0" step="0.1"></div>
        <div style="flex:0 0 auto"><label>&nbsp;</label><button type="button" class="btn btn-primary btn-sm" style="width:100%;white-space:nowrap" onclick="window.addOrderItem()">+ Thêm 1 món</button></div>
        <div style="flex:0 0 auto"><label>&nbsp;</label><button type="button" class="btn btn-ghost btn-sm" style="width:100%;white-space:nowrap" onclick="window.addCustomOrderItem()" title="Thêm SP khách đặt NGOÀI danh mục công ty — gõ tên + giá tự do">✏️ SP ngoài DM</button></div>
      </div>
      <div id="orderItemsBox" style="margin:6px 0 12px"></div>
      <div class="form-row">
        <div><label>Trọng lượng (kg) <span style="font-weight:400;color:var(--muted);font-size:11px">(tự tính theo kg — sửa được)</span></label><input id="oWeight" type="number" placeholder="0" data-auto="1" oninput="this.dataset.auto='0'"></div>
        <div><label>Đơn vị khác <span style="font-weight:400;color:var(--muted);font-size:11px">(bắp/quả/hộp/túi… — tự tính)</span></label><input id="oOtherUnits" placeholder="vd: 3 bắp, 3 quả, 2 túi" data-auto="1" oninput="this.dataset.auto='0'"></div>
      </div>
      <div class="form-row wide">
        <label>Tóm tắt hàng * <span style="font-weight:400;color:var(--muted);font-size:11px">(tên mặt hàng — có thể sửa)</span></label><input id="oGoods" placeholder="tự điền tên các mặt hàng (có thể sửa)" data-auto="1" oninput="this.dataset.auto='0'">
      </div>
      <input type="hidden" id="oQty" value="1"><input type="hidden" id="oUnit" value="kg">
      <div class="form-row">
        <div><label>Tổng tiền hàng (₫) *</label><input id="oFreight" type="text" inputmode="numeric" oninput="window._fmtMoneyInput(this)" placeholder="0"></div>
        <div><label>COD / Thu hộ (₫)</label><input id="oCod" type="text" inputmode="numeric" oninput="window._fmtMoneyInput(this)" placeholder="0"></div>
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
      width:'980px'
    });
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
    /* Ô "Chọn sản phẩm" — gõ-tìm + THÊM CHỈ BẰNG BÀN PHÍM:
       gõ tên → ↑↓ chọn → Enter chọn SP (nhảy sang ô SL) → Enter ở SL = thêm món → quay lại ô tên.
       Không khớp DM → Enter = nhận thành SP ngoài DM (sang SL) → Enter = thêm. */
    const oProdEl = document.getElementById('oProd');
    const oQtyEl = document.getElementById('oProdQty');
    const _focusQty = () => { if (oQtyEl) { oQtyEl.focus(); try { oQtyEl.select(); } catch (e) {} } };
    if (oProdEl && window.wireProductSearch) {
      window.wireProductSearch(oProdEl, {
        priceFn: priceForOrder,
        onPick: _focusQty,
        onEnterNoList: () => {
          /* Gõ tên nhưng không có gợi ý khớp → coi là SP ngoài DM: tô vàng + sang ô SL để Enter thêm */
          if (!(oProdEl.value || '').trim()) return;
          oProdEl.dataset.pid = '';
          oProdEl.style.background = '#FEF9C3'; oProdEl.style.fontWeight = '600';
          _focusQty();
          window.toast && window.toast('SP ngoài DM — nhập SL rồi Enter để thêm', 'info');
        }
      });
    }
    /* Enter ở ô SỐ LƯỢNG = thêm món (SP trong DM nếu đã chọn; nếu chưa thì lấy tên đã gõ làm SP ngoài DM) */
    if (oQtyEl) {
      oQtyEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (oProdEl && oProdEl.dataset.pid) { window.addOrderItem(); return; }
        const nm = (oProdEl && oProdEl.value || '').trim();
        if (!nm) { window.toast && window.toast('Gõ tên SP rồi Enter', 'warn'); if (oProdEl) oProdEl.focus(); return; }
        window._addOffItemFromForm(nm, parseFloat(oQtyEl.value) || 1);
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
    /* Chuẩn hoá đơn vị hiển thị: "kilogram (kg)"→"kg", "Kg"→"kg" */
    const _normUnit = u => { let s = (u || '').toString().trim().toLowerCase(); const m = s.match(/\(([^)]+)\)/); if (m) s = m[1].trim(); return s || 'đv'; };
    const _fmtNum = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
    /* Gộp số lượng theo TỪNG đơn vị → "17 kg · 3 bắp · 3 quả · 2 túi" (kg đứng đầu) */
    const _unitBreakdown = () => {
      const by = {};
      orderItems.forEach(x => { const u = _normUnit(x.unit); by[u] = (by[u] || 0) + (+x.qty || 0); });
      const keys = Object.keys(by).sort((a, b) => a === 'kg' ? -1 : b === 'kg' ? 1 : a.localeCompare(b, 'vi'));
      return keys.map(u => `${_fmtNum(by[u])} ${u}`).join(' · ');
    };
    if (!orderItems.length) {
      box.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:4px 0">Chưa có mặt hàng. Chọn sản phẩm + số lượng rồi bấm "+ Thêm".</div>';
    } else {
      const total = orderItems.reduce((s, x) => s + x.total, 0);
      /* Danh sách đơn vị (cho SP ngoài DM tự chọn) */
      let units = ((window.MD && window.MD.get && window.MD.get('units')) || []).map(u => (u.label || u)).filter(Boolean);
      if (!units.length) units = ['kg', 'quả', 'bó', 'hộp', 'cây', 'túi', 'gói', 'lạng', 'con', 'chai', 'mớ'];
      const unitSelHtml = (cur, i) => `<select class="oi-unit" data-idx="${i}" style="width:64px;padding:3px 4px;border:1px solid #C4B5FD;border-radius:5px;font-size:11px;background:#F5F3FF;font-weight:600" title="Chọn đơn vị bán">${units.map(u => `<option ${String(u).toLowerCase() === String(cur || '').toLowerCase() ? 'selected' : ''}>${u}</option>`).join('')}</select>`;
      /* Tổng số mã (count) + tổng trọng lượng (kg) */
      const totalSKU = orderItems.length;
      const totalKg = orderItems.reduce((s, x) => {
        const u = (x.unit || '').toLowerCase();
        return s + (u === 'kg' || u === 'g' ? (+x.qty || 0) * (u === 'g' ? 0.001 : 1) : 0);
      }, 0);
      const totalQty = orderItems.reduce((s, x) => s + (+x.qty || 0), 0);
      const nUnconf = orderItems.filter(x => x.priceConfirmed === false).length;
      const bulkBar = `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;background:${nUnconf?'#FEF9C3':'#F0FDF4'};border:1px solid ${nUnconf?'#FDE68A':'#BBF7D0'};border-radius:8px;font-size:12.5px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600;color:#15803D"><input type="checkbox" id="oiSelectAll" ${nUnconf===0?'checked':''} onchange="window.toggleAllPrices(this.checked)"> Chọn/bỏ tất cả</label>
          <span style="color:var(--muted)">${nUnconf?('⚠ '+nUnconf+' mã chưa xác nhận giá'):('✓ Đã xác nhận hết '+orderItems.length+' mã')}</span>
          <div style="flex:1"></div>
          ${nUnconf?`<button type="button" class="btn btn-primary btn-sm" onclick="window.confirmAllPrices()">✓ Xác nhận tất cả giá (${nUnconf})</button>`:''}
        </div>`;
      box.innerHTML = bulkBar + `<table class="mini-table" style="margin:0">
        <thead><tr>
          <th style="width:40px" class="num">STT</th>
          <th>Sản phẩm</th>
          <th class="num">SL</th>
          <th class="num">Đơn giá</th>
          <th class="num">
            <span title="Sale có quyền sửa giá theo đối tác — bấm vào ô đơn giá để gõ">✏</span>
          </th>
          <th class="num">Thành tiền</th>
          <th></th>
        </tr></thead>
        <tbody>${orderItems.map((it, i) => `<tr>
          <td class="num" style="color:var(--muted);font-weight:600">${i + 1}</td>
          <td><div style="display:flex;align-items:center;gap:8px">${it.img ? `<img src="${it.img}" alt="" style="width:30px;height:30px;object-fit:cover;border-radius:5px;flex:none" onerror="this.style.display='none'">` : ''}<div style="flex:1;min-width:0">${it.custom
              ? `<input value="${(it.name||'').replace(/"/g,'&quot;')}" data-idx="${i}" class="oi-name" placeholder="Gõ tên SP khách đặt..." style="width:100%;min-width:150px;padding:4px 7px;border:1px solid #C4B5FD;border-radius:5px;font-size:12.5px;font-weight:600;background:#F5F3FF"><div style="font-size:9px;color:#7C3AED;font-weight:700;margin-top:1px">✏️ NGOÀI DANH MỤC</div>`
              : `<b>${it.name}</b>`}${it.priceConfirmed===false?'<div style="font-size:10px;color:#A16207">⚠ chưa xác nhận giá</div>':''}</div></div></td>
          <td class="num"><div style="display:flex;align-items:center;gap:4px;justify-content:flex-end"><input type="number" min="0" step="0.5" value="${it.qty}" data-idx="${i}" class="oi-qty" style="width:64px;padding:4px 6px;text-align:right;border:1px solid var(--line);border-radius:5px;font-size:12.5px;font-weight:600" title="Sửa số lượng">${it.custom ? unitSelHtml(it.unit, i) : `<span style="font-size:11px;color:var(--muted)">${it.unit}</span>`}</div></td>
          <td class="num">
            <input type="number" min="0" step="100" value="${it.price||0}" data-idx="${i}" class="oi-price" style="width:100px;padding:4px 6px;text-align:right;border:1px solid ${it.priceConfirmed===false?'#FCD34D':'var(--line)'};border-radius:5px;font-size:12.5px;font-weight:600;background:${it.priceConfirmed===false?'#FEF9C3':'#fff'}" title="Sale có quyền sửa giá theo đối tác">
            ${it.basePrice && it.price !== it.basePrice ? `<div style="font-size:10px;color:var(--muted);margin-top:2px">Gốc: ${window.fmt(it.basePrice)}</div>` : ''}
          </td>
          <td class="num"><label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px">
            <input type="checkbox" data-idx="${i}" class="oi-confirm" ${it.priceConfirmed!==false?'checked':''} title="Đã xác nhận giá thủ công">
            ${it.priceConfirmed!==false?'<span style="color:#15803D">✓</span>':'<span style="color:#A16207">!</span>'}
          </label></td>
          <td class="num"><b>${window.fmt(it.total)}</b></td>
          <td class="num"><button type="button" class="icon-btn" style="color:var(--danger)" onclick="window.removeOrderItem(${i})" title="Xóa dòng sản phẩm này khỏi đơn">✕</button></td>
        </tr>`).join('')}</tbody>
        <tfoot>
          <tr style="background:#F0FDF4;border-top:2px solid #15803D">
            <td colspan="2" style="padding:8px"><b style="color:#15803D">📊 Tổng:</b> <span style="color:var(--muted);font-size:12px">${totalSKU} mã · </span><b style="color:#15803D;font-size:12.5px" title="Tách rõ theo từng đơn vị">${_unitBreakdown()}</b></td>
            <td class="num"></td>
            <td class="num">—</td>
            <td class="num">${orderItems.filter(x => x.priceConfirmed === false).length ? '<span style="color:#A16207;font-size:11px">⚠ '+orderItems.filter(x => x.priceConfirmed === false).length+' chưa xác nhận</span>' : '<span style="color:#15803D;font-size:11px">✓ đã xác nhận hết</span>'}</td>
            <td class="num"><b style="color:var(--red);font-size:14px">${window.fmt(total)} ₫</b></td>
            <td></td>
          </tr>
        </tfoot>
      </table>`;
      /* Wire input tên SP thủ công (cập nhật live, không re-render để giữ focus) */
      box.querySelectorAll('.oi-name').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const it = orderItems[+e.target.dataset.idx];
          if (it) it.name = e.target.value;
        });
      });
      /* Wire input số lượng */
      box.querySelectorAll('.oi-qty').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const idx = +e.target.dataset.idx;
          const it = orderItems[idx];
          if (!it) return;
          it.qty = +e.target.value || 0;
          it.total = Math.round(it.qty * (+it.price || 0));
          renderOrderItems();
        });
      });
      /* Wire input giá + checkbox confirm */
      box.querySelectorAll('.oi-price').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const idx = +e.target.dataset.idx;
          const newPrice = +e.target.value || 0;
          const it = orderItems[idx];
          if (!it) return;
          it.price = newPrice;
          it.total = Math.round((+it.qty || 0) * newPrice);
          /* Khi user sửa giá → coi như đã xác nhận thủ công */
          it.priceConfirmed = true;
          renderOrderItems();
        });
      });
      box.querySelectorAll('.oi-confirm').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const idx = +e.target.dataset.idx;
          if (orderItems[idx]) {
            orderItems[idx].priceConfirmed = e.target.checked;
            renderOrderItems();
          }
        });
      });
      /* Wire đổi đơn vị cho SP ngoài DM */
      box.querySelectorAll('.oi-unit').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const it = orderItems[+e.target.dataset.idx];
          if (it) { it.unit = e.target.value; renderOrderItems(); }
        });
      });
    }
    const total = orderItems.reduce((s, x) => s + x.total, 0);
    const totalKg = orderItems.reduce((s, x) => {
      const u = _normUnit(x.unit);   /* "kilogram (kg)"/"Kg" → "kg" để không bỏ sót */
      return s + (u === 'kg' || u === 'g' ? (+x.qty || 0) * (u === 'g' ? 0.001 : 1) : 0);
    }, 0);
    /* Tóm tắt hàng = tên các mặt hàng (số lượng đã có ở Trọng lượng + Đơn vị khác) */
    const g = document.getElementById('oGoods');
    if (g && g.dataset.auto !== '0') g.value = orderItems.map(x => x.name).join(', ');
    /* Đơn vị khác = gộp các đơn vị KHÔNG phải kg: "3 bắp, 3 quả, 2 túi" */
    const ou = document.getElementById('oOtherUnits');
    if (ou && ou.dataset.auto !== '0') {
      const others = {};
      orderItems.forEach(x => { const u = _normUnit(x.unit); if (u !== 'kg' && u !== 'g') others[u] = (others[u] || 0) + (+x.qty || 0); });
      const okeys = Object.keys(others).sort((a, b) => a.localeCompare(b, 'vi'));
      ou.value = okeys.map(u => `${_fmtNum(others[u])} ${u}`).join(', ');
    }
    const f = document.getElementById('oFreight');
    if (f) f.value = total ? Number(total).toLocaleString('vi-VN') : '';
    /* Trọng lượng tự đồng bộ = tổng kg (trừ khi user tự sửa tay → data-auto=0) */
    const w = document.getElementById('oWeight');
    if (w && w.dataset.auto !== '0') w.value = totalKg > 0 ? totalKg.toFixed(2) : '';
    if (typeof updateProfit === 'function') updateProfit();
  }

  /* addOrderItem(): đọc từ ô gõ-tìm #oProd (dataset.pid) + #oProdQty.
     addOrderItem(id, qty): thêm trực tiếp (cho luồng AI/Excel gọi). */
  window.addOrderItem = function (explicitId, explicitQty) {
    const fromInput = explicitId == null;
    const oProdEl = document.getElementById('oProd');
    const id = fromInput ? (oProdEl && oProdEl.dataset.pid) : explicitId;
    const qty = fromInput ? (parseFloat(document.getElementById('oProdQty').value) || 0) : (parseFloat(explicitQty) || 0);
    if (!id) { window.toast('Gõ tìm & chọn sản phẩm', 'warn'); return; }
    if (qty <= 0) { window.toast('Nhập số lượng', 'warn'); return; }
    const p = window.productById(id);
    if (!p) return;
    const basePrice = priceForOrder(id);
    const existing = orderItems.find(x => x.id === id);
    if (existing) {
      existing.qty = Math.round((existing.qty + qty) * 100) / 100;
      existing.total = Math.round(existing.qty * existing.price);
    } else {
      orderItems.push({
        id, name: p.name, unit: p.unit, img: p.img,
        qty, price: basePrice, basePrice,
        priceConfirmed: false, /* Sale phải xác nhận giá thủ công */
        total: Math.round(qty * basePrice)
      });
    }
    /* Reset ô chọn để thêm món tiếp theo nhanh */
    if (fromInput && oProdEl) { oProdEl.value = ''; oProdEl.dataset.pid = ''; oProdEl.style.background = ''; oProdEl.style.fontWeight = ''; }
    document.getElementById('oProdQty').value = 1;
    renderOrderItems();
    if (fromInput && oProdEl) oProdEl.focus();
  };

  /* Thêm SP THỦ CÔNG (khách đặt ngoài danh mục công ty) — gõ tên + giá tự do */
  window.addCustomOrderItem = function () {
    const qty = parseFloat(document.getElementById('oProdQty')?.value) || 1;
    orderItems.push({
      id: null, custom: true,
      name: '', unit: 'kg', img: '',
      qty: qty > 0 ? qty : 1, price: 0, basePrice: 0,
      priceConfirmed: false,   /* Sale nhập giá rồi xác nhận */
      total: 0
    });
    renderOrderItems();
    /* focus ngay ô tên dòng vừa thêm */
    setTimeout(() => {
      const names = document.querySelectorAll('#orderItemsBox .oi-name');
      if (names.length) names[names.length - 1].focus();
    }, 30);
  };

  /* Thêm nhanh 1 SP NGOÀI DM theo tên đã gõ ở ô #oProd (luồng bàn phím) → gộp trùng + quay lại ô tên */
  window._addOffItemFromForm = function (name, qty) {
    name = (name || '').trim(); if (!name) return;
    qty = qty > 0 ? qty : 1;
    const ex = orderItems.find(x => x.custom && (x.name || '').trim().toLowerCase() === name.toLowerCase());
    if (ex) { ex.qty = Math.round((ex.qty + qty) * 100) / 100; ex.total = Math.round(ex.qty * ex.price); }
    else { orderItems.push({ id: null, custom: true, name, unit: 'kg', img: '', qty, price: 0, basePrice: 0, priceConfirmed: false, total: 0 }); }
    const oProdEl = document.getElementById('oProd');
    if (oProdEl) { oProdEl.value = ''; oProdEl.dataset.pid = ''; oProdEl.style.background = ''; oProdEl.style.fontWeight = ''; }
    const q = document.getElementById('oProdQty'); if (q) q.value = 1;
    renderOrderItems();
    if (oProdEl) oProdEl.focus();
    window.toast && window.toast('✓ Thêm "' + name + '" (ngoài DM) — nhập giá ở dòng hàng', 'success');
  };

  window.removeOrderItem = function (i) {
    orderItems.splice(i, 1);
    renderOrderItems();
  };

  /* === SỬA MẶT HÀNG & GIÁ của 1 đơn ĐÃ TẠO (khu vực quản trị) ===
     Tái dùng bộ soạn item (renderOrderItems) — sửa SL/đơn giá/đơn vị, thêm/bớt SP.
     Lưu lại order.items + freight + goods + weight. KHÔNG đụng phiếu in (vẫn giấu giá). */
  let _editItemsCode = null;
  window.editOrderItems = function (code) {
    const o = orders.find(x => x.code === code);
    if (!o) { window.toast && window.toast('Không tìm thấy đơn ' + code, 'warn'); return; }
    _editItemsCode = code;
    orderItems = (o.items || []).map(it => Object.assign({}, it));   /* clone — không sửa trực tiếp tới khi Lưu */
    const custId = o.cust || o.custId || '';
    orderTier = (typeof window.custPriceTier === 'function' && custId) ? (window.custPriceTier(custId) || '') : '';
    window.openModal('✏️ Sửa mặt hàng & giá — ' + code, `
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.55">
        KH: <b>${(o.custName || '').replace(/</g, '')}</b> · Sửa <b>số lượng</b>, <b>đơn giá</b>, đơn vị, hoặc thêm/bớt mặt hàng.
        <br>🔒 <b style="color:#15803D">Phiếu báo hàng vẫn KHÔNG hiện giá</b> — đây chỉ là khu vực quản trị nội bộ.
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">
        <div style="flex:2;min-width:200px"><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">Thêm sản phẩm</label>
          <input class="prodpick" id="oProd" data-pid="" placeholder="Gõ tên/mã SP… (↑↓ chọn · Enter thêm)" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:8px 11px;font-size:13px"></div>
        <div><label style="font-size:11px;color:var(--muted);display:block;margin-bottom:3px">SL</label>
          <input id="oProdQty" type="number" value="1" min="0" step="0.1" style="width:78px;border:1px solid var(--line);border-radius:7px;padding:8px"></div>
        <button type="button" class="btn btn-primary btn-sm" onclick="window.addOrderItem()">+ Thêm</button>
      </div>
      <div id="orderItemsBox" style="margin:4px 0"></div>
      <input type="hidden" id="oGoods"><input type="hidden" id="oWeight"><input type="hidden" id="oOtherUnits"><input type="hidden" id="oFreight">
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.submitEditOrderItems('${(code || '').replace(/'/g, "\\'")}')">💾 Lưu mặt hàng & giá</button>`,
      width: '780px', stack: true
    });
    renderOrderItems();
    setTimeout(() => {
      const oProdEl = document.getElementById('oProd');
      const oQtyEl = document.getElementById('oProdQty');
      const _focusQty = () => { if (oQtyEl) { oQtyEl.focus(); try { oQtyEl.select(); } catch (e) {} } };
      if (oProdEl && window.wireProductSearch) {
        window.wireProductSearch(oProdEl, {
          priceFn: priceForOrder, onPick: _focusQty,
          onEnterNoList: () => { if (!(oProdEl.value || '').trim()) return; oProdEl.dataset.pid = ''; oProdEl.style.background = '#FEF9C3'; oProdEl.style.fontWeight = '600'; _focusQty(); }
        });
      }
      if (oQtyEl) oQtyEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return; e.preventDefault();
        if (oProdEl && oProdEl.dataset.pid) { window.addOrderItem(); return; }
        const nm = (oProdEl && oProdEl.value || '').trim();
        if (nm) window._addOffItemFromForm(nm, parseFloat(oQtyEl.value) || 1);
      });
    }, 40);
  };

  window.submitEditOrderItems = function (code) {
    const o = orders.find(x => x.code === code);
    if (!o) return;
    const blank = orderItems.filter(x => x.custom && !(x.name || '').trim());
    if (blank.length) { window.toast && window.toast('Còn ' + blank.length + ' SP ngoài DM chưa gõ tên — nhập hoặc xoá dòng đó', 'warn'); return; }
    if (!orderItems.length) { window.toast && window.toast('Đơn phải có ít nhất 1 mặt hàng', 'warn'); return; }
    const freight = orderItems.reduce((s, x) => s + (+x.total || 0), 0);
    const goods = ((document.getElementById('oGoods') || {}).value || '').trim() || orderItems.map(x => x.name).join(', ');
    const weight = parseFloat((document.getElementById('oWeight') || {}).value) || 0;
    window.STORE.update('orders', code, { items: orderItems.slice(), freight, goods, weight });
    orderItems = []; orderTier = ''; _editItemsCode = null;
    window.closeModal();
    window.toast && window.toast('✓ Đã cập nhật mặt hàng & giá cho ' + code, 'success');
    if (typeof renderOrders === 'function') { try { renderOrders(); } catch (e) {} }
    setTimeout(() => { if (window.openOrder) window.openOrder(code); }, 60);
  };

  /* Xác nhận giá hàng loạt — tick hết các mã còn '!' */
  window.confirmAllPrices = function () {
    orderItems.forEach(it => { it.priceConfirmed = true; });
    renderOrderItems();
    window.toast?.('✓ Đã xác nhận giá cho ' + orderItems.length + ' mã', 'success');
  };
  /* Chọn/bỏ tất cả từ ô check header */
  window.toggleAllPrices = function (on) {
    orderItems.forEach(it => { it.priceConfirmed = !!on; });
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

  /* === Áp dụng list items {name, qty} vào orderItems ===
     Nguyên tắc: KHÔNG bỏ sót dòng nào, KHÔNG đoán bừa.
     - Khớp chắc chắn (từ điển KH / matcher chặt) → thêm SP trong DM.
     - Không khớp → thêm thành "SP ngoài danh mục" (giá để trống) + CẢNH BÁO. */
  const _rvEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /* Danh sách đơn vị (đọc master data, fallback bộ chuẩn) cho ô chọn ĐVT trong bảng duyệt */
  function _rvUnitList() {
    let u = ((window.MD && window.MD.get && window.MD.get('units')) || []).map(x => (x.label || x)).filter(Boolean);
    if (!u.length) u = ['kg', 'bó', 'mớ', 'củ', 'quả', 'bắp', 'hộp', 'túi', 'gói', 'cây', 'con', 'khay', 'chai', 'lạng'];
    return u;
  }
  function _rvUnitOpts(cur) {
    const c = String(cur || 'kg').toLowerCase();
    let list = _rvUnitList();
    if (cur && !list.some(u => String(u).toLowerCase() === c)) list = [cur].concat(list);
    return list.map(u => `<option ${String(u).toLowerCase() === c ? 'selected' : ''}>${_rvEsc(u)}</option>`).join('');
  }

  /* B1: đọc file → ĐOÁN sản phẩm (chưa áp vào đơn) → mở bảng DUYỆT để NV sửa trước. */
  function applyBulkItems(items, source) {
    const custId = window.formVal && window.formVal('#oCust');
    const products = window.STORE.get('products', window.PRODUCTS || []);
    const draft = [];
    (items || []).forEach(it => {
      const rawName = (it.name || '').toString().trim();
      if (!rawName) return;
      const qty = parseFloat(it.qty) || 0;
      let p = null;
      if (custId && window.CustPrefs) {
        const r = window.CustPrefs.resolveItem(custId, rawName);
        if (r) p = products.find(x => x.id === r.productId);
      }
      if (!p) p = window.matchProductSmart ? window.matchProductSmart(rawName, products) : matchProductByName(rawName);
      draft.push({ raw: rawName, qty: qty || 1, pid: p ? p.id : '', name: p ? p.name : rawName, unit: p ? (p.unit || 'kg') : (it.unit || 'kg'), matched: !!p });
    });
    if (!draft.length) { window.toast('Không đọc được mặt hàng nào từ ' + source, 'warn'); return; }
    showItemReview(draft, source, custId || '');
  }

  /* B2: bảng DUYỆT — mỗi dòng sửa được (chọn lại SP / gõ tay nếu ngoài DM), đổi SL, bỏ dòng. */
  function showItemReview(draft, source, custId) {
    const matchedN = draft.filter(d => d.matched).length;
    const offN = draft.length - matchedN;
    const rows = draft.map((d, i) => `
      <tr data-raw="${_rvEsc(d.raw)}">
        <td class="num" style="color:var(--muted)">${i + 1}</td>
        <td style="font-size:11.5px;color:#92400E">"${_rvEsc(d.raw)}"</td>
        <td>
          <input class="prodpick rv-pick" data-idx="${i}" value="${_rvEsc(d.name)}" data-pid="${d.pid}"
                 placeholder="Gõ tìm SP trong DM… (hoặc gõ tay nếu ngoài DM)"
                 style="width:100%;min-width:170px;border:1px solid ${d.matched ? 'var(--line)' : '#FCD34D'};border-radius:6px;padding:6px 9px;font-size:12.5px;background:${d.matched ? '#fff' : '#FEF9C3'}">
          <div class="rv-status" data-idx="${i}" style="font-size:10px;margin-top:2px;font-weight:700;color:${d.matched ? '#15803D' : '#B45309'}">${d.matched ? '✓ trong danh mục' : '✏️ ngoài DM — chọn lại hoặc giữ gõ tay'}</div>
        </td>
        <td><input type="number" class="rv-qty" data-idx="${i}" value="${d.qty}" min="0" step="0.1" style="width:68px;text-align:right;border:1px solid var(--line);border-radius:6px;padding:6px"></td>
        <td><select class="rv-unit-sel" data-idx="${i}" title="Đơn vị bán" style="width:64px;padding:5px 4px;border:1px solid var(--line);border-radius:6px;font-size:11.5px;background:#fff">${_rvUnitOpts(d.unit || 'kg')}</select></td>
        <td><button type="button" class="icon-btn" title="Bỏ dòng" onclick="this.closest('tr').remove()">🗑</button></td>
      </tr>`).join('');
    window.openModal('🔎 Duyệt ' + draft.length + ' mặt hàng đọc từ ' + source, `
      <div style="background:#EFF6FF;color:#1E40AF;padding:10px 12px;border-radius:8px;font-size:12px;margin-bottom:10px;line-height:1.55">
        Kiểm tra & sửa từng dòng <b>trước khi vào đơn</b>. <b style="color:#15803D">${matchedN}</b> khớp danh mục · <b style="color:#B45309">${offN}</b> chưa khớp.<br>
        • Nhận sai → gõ tìm & <b>chọn lại</b> SP đúng từ gợi ý. • SP <b>ngoài danh mục</b> → cứ gõ tên tay rồi để vậy (sẽ thêm dạng "SP ngoài DM", giá nhập sau). • Thừa → bấm 🗑.
      </div>
      <div style="max-height:50vh;overflow:auto;border:1px solid var(--line);border-radius:8px">
        <table class="mini-table" style="width:100%;margin:0"><thead><tr>
          <th style="width:30px">#</th><th style="width:120px">Đọc từ file</th><th>Sản phẩm (sửa được)</th><th style="width:64px" class="num">SL</th><th style="width:72px">ĐVT</th><th style="width:32px"></th>
        </tr></thead><tbody id="rvBody">${rows}</tbody></table>
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window._commitReviewedItems('${custId || ''}', '${_rvEsc(source).replace(/'/g, '')}')">✓ Thêm vào đơn</button>`,
      width: '740px', stack: true
    });
    /* Gắn ô tìm SP cho từng dòng + cập nhật nhãn trạng thái khi chọn/gõ */
    setTimeout(() => {
      const scope = document.querySelector('.modal-bg:last-of-type') || document;
      scope.querySelectorAll('input.rv-pick').forEach(inp => {
        window.wireProductSearch(inp, {
          priceFn: priceForOrder,
          onPick: (pk) => {
            const st = scope.querySelector('.rv-status[data-idx="' + inp.dataset.idx + '"]');
            if (st) { st.textContent = '✓ trong danh mục'; st.style.color = '#15803D'; }
            inp.style.background = '#fff'; inp.style.borderColor = 'var(--line)';
            const pp = window.productById(pk.id);
            const uEl = scope.querySelector('.rv-unit-sel[data-idx="' + inp.dataset.idx + '"]');
            if (uEl && pp && pp.unit) {
              const want = String(pp.unit).toLowerCase();
              if (![].some.call(uEl.options, o => o.value.toLowerCase() === want)) uEl.add(new Option(pp.unit, pp.unit));
              uEl.value = pp.unit;
            }
          }
        });
        inp.addEventListener('input', () => {
          if (!inp.dataset.pid) {
            const st = scope.querySelector('.rv-status[data-idx="' + inp.dataset.idx + '"]');
            if (st) { st.textContent = '✏️ ngoài DM — gõ tay'; st.style.color = '#B45309'; }
            inp.style.background = '#FEF9C3'; inp.style.borderColor = '#FCD34D';
          }
        });
      });
      /* Đổi ĐVT khác đơn vị gốc của SP trong DM → nhắc: giá kg không còn đúng, Sale nhập giá theo ĐVT mới */
      scope.querySelectorAll('select.rv-unit-sel').forEach(sel => {
        sel.addEventListener('change', () => {
          const idx = sel.dataset.idx;
          const inp = scope.querySelector('.rv-pick[data-idx="' + idx + '"]');
          const st = scope.querySelector('.rv-status[data-idx="' + idx + '"]');
          const pid = inp && inp.dataset.pid;
          if (!pid || !st) return;
          const p = window.productById(pid); if (!p) return;
          if (String(sel.value).toLowerCase() !== String(p.unit || '').toLowerCase()) {
            st.textContent = `✓ trong DM · ⚠ ĐVT khác gốc (${p.unit}) → Sale nhập giá theo "${sel.value}"`;
            st.style.color = '#B45309';
          } else {
            st.textContent = '✓ trong danh mục'; st.style.color = '#15803D';
          }
        });
      });
    }, 60);
  }

  /* B3: chốt — đọc các dòng đã duyệt → áp vào đơn (gộp trùng, học từ điển KH). */
  window._commitReviewedItems = function (custId, source) {
    const products = window.STORE.get('products', window.PRODUCTS || []);
    const scope = document.querySelector('.modal-bg:last-of-type') || document;
    let added = 0, updated = 0, off = 0;
    scope.querySelectorAll('#rvBody tr').forEach(tr => {
      const pick = tr.querySelector('.rv-pick'); if (!pick) return;
      const name = (pick.value || '').trim();
      const pid = pick.dataset.pid || '';
      const qty = parseFloat((tr.querySelector('.rv-qty') || {}).value) || 0;
      const unit = ((tr.querySelector('.rv-unit-sel') || {}).value || 'kg').trim();
      if (!name || !qty) return;
      const p = pid ? (window.productById(pid) || products.find(x => x.id === pid)) : null;
      if (p) {
        /* ĐVT khác đơn vị gốc (vd DM bán /kg nhưng đặt /mớ) → giá kg KHÔNG còn đúng:
           để trống giá + bắt Sale xác nhận giá theo ĐVT mới (tránh tính nhầm tổng). */
        const unitChanged = unit && p.unit && unit.toLowerCase() !== String(p.unit).toLowerCase();
        const price = unitChanged ? 0 : priceForOrder(p.id);
        const ex = orderItems.find(x => x.id === p.id && (x.unit || '').toLowerCase() === (unit || p.unit).toLowerCase());
        if (ex) { ex.qty = Math.round((ex.qty + qty) * 100) / 100; ex.total = Math.round(ex.qty * ex.price); updated++; }
        else { orderItems.push({ id: p.id, name: p.name, unit: unit || p.unit, img: p.img, qty, price, basePrice: price, priceConfirmed: false, total: Math.round(qty * price) }); added++; }
        const raw = (tr.dataset.raw || '').trim();
        if (custId && window.CustPrefs && raw && raw.toLowerCase() !== p.name.toLowerCase()) window.CustPrefs.addAlias(custId, raw, p.id);
      } else {
        const ex = orderItems.find(x => x.custom && (x.name || '').trim().toLowerCase() === name.toLowerCase());
        if (ex) { ex.qty = Math.round((ex.qty + qty) * 100) / 100; ex.total = Math.round(ex.qty * ex.price); updated++; }
        else { orderItems.push({ id: null, custom: true, fromAI: true, name, unit: unit || 'kg', img: '', qty, price: 0, basePrice: 0, priceConfirmed: false, total: 0 }); off++; }
      }
    });
    renderOrderItems();
    if (custId) renderCustPrefBox(custId);
    window.closeModal();
    window.toast(`✓ ${source}: +${added} mới · ${updated} cộng dồn${off ? ` · ${off} ngoài DM` : ''}`, (added + updated + off) ? 'success' : 'warn');
  };

  /* Cảnh báo + xử lý các SP AI đọc được nhưng CHƯA có trong danh mục */
  function warnOffCatalogItems(names, custId) {
    const uniq = [...new Set(names.map(s => (s || '').trim()).filter(Boolean))];
    if (!uniq.length) return;
    const c = custId ? window.STORE.get('customers', []).find(x => x.id === custId) : null;
    window.openModal('⚠️ ' + uniq.length + ' sản phẩm CHƯA có trong danh mục', `
      <div style="background:#FEF3C7;color:#92400E;padding:11px 13px;border-radius:8px;font-size:12.5px;margin-bottom:13px;line-height:1.55">
        Các mặt hàng dưới đây <b>không tìm thấy trong danh mục sản phẩm</b> nên đã được thêm vào đơn dưới dạng
        <b>“SP ngoài danh mục”</b> (giá để trống — Sale tự nhập). <b>Không mặt hàng nào bị bỏ sót.</b><br>
        👉 Nếu thực ra là SP đã có (khách gọi tên khác), gõ chọn đúng SP để <b>chuyển về SP trong DM</b>${c ? ' — và AI sẽ nhớ cho lần sau' : ''}. Để trống = giữ là hàng ngoài DM.
      </div>
      ${uniq.map((w, i) => `
        <div style="display:grid;grid-template-columns:1fr 1.6fr;gap:8px;margin-bottom:8px;align-items:center">
          <div style="font-weight:600;color:#92400E">🆕 "${(w || '').replace(/"/g, '&quot;')}"</div>
          <input class="prodpick" id="off_${i}" data-word="${(w || '').replace(/"/g, '&quot;')}" data-pid="" placeholder="(tuỳ chọn) gõ tên SP đúng trong DM…" style="border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12.5px">
        </div>`).join('')}
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Giữ là SP ngoài DM</button>
               <button class="btn btn-primary" onclick="window._resolveOffCatalog('${custId || ''}')">💾 Chuyển SP đã chọn về DM</button>`,
      width: '560px', stack: true
    });
    if (window.wireAllProductSearch) window.wireAllProductSearch(document.querySelector('.modal-bg:last-of-type') || document);
  }

  /* User map 1 vài SP ngoài DM về SP thật → chuyển dòng tại chỗ + dạy từ điển KH */
  window._resolveOffCatalog = function (custId) {
    let n = 0;
    document.querySelectorAll('input[id^=off_].prodpick').forEach(sel => {
      const word = sel.dataset.word, pid = sel.dataset.pid;
      if (!word || !pid) return;
      const p = window.productById(pid); if (!p) return;
      const line = orderItems.find(x => x.custom && x.fromAI && x.id === null
        && (x.name || '').trim().toLowerCase() === word.trim().toLowerCase());
      if (!line) return;
      const price = priceForOrder(pid);
      const dup = orderItems.find(x => x.id === pid);
      if (dup && dup !== line) {            /* đã có dòng cùng SP → gộp số lượng */
        dup.qty = Math.round((dup.qty + line.qty) * 100) / 100;
        dup.total = Math.round(dup.qty * dup.price);
        const idx = orderItems.indexOf(line); if (idx >= 0) orderItems.splice(idx, 1);
      } else {                              /* chuyển dòng off → SP trong DM */
        line.id = pid; line.custom = false; line.fromAI = false;
        line.name = p.name; line.unit = p.unit; line.img = p.img;
        line.price = price; line.basePrice = price; line.priceConfirmed = false;
        line.total = Math.round(line.qty * price);
      }
      if (custId && window.CustPrefs) window.CustPrefs.addAlias(custId, word, pid);
      n++;
    });
    renderOrderItems();
    if (custId) renderCustPrefBox(custId);
    window.closeModal();
    if (n) window.toast(`✓ Đã chuyển ${n} SP về danh mục${custId ? ' + AI đã nhớ' : ''}`, 'success');
  };

  /* Modal hỏi user map các tên AI không hiểu cho 1 KH */
  function askUserToMapUnmatched(custId, unmatchedNames) {
    const c = window.STORE.get('customers', []).find(x => x.id === custId);
    window.openModal('🤔 Có ' + unmatchedNames.length + ' từ AI không hiểu — bạn dạy hệ thống nhé?', `
      <div style="background:#FEF3C7;color:#92400E;padding:10px 12px;border-radius:7px;font-size:12.5px;margin-bottom:12px">
        💡 KH <b>${c?.name||custId}</b> có thể dùng từ riêng (vd "hành"="hành tây"). Gõ tên SP để tìm — map 1 lần, <b>lần sau AI tự hiểu</b>. Để trống = bỏ qua.
      </div>
      ${unmatchedNames.map((w, i) => `
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-bottom:8px;align-items:center">
          <div style="font-weight:600">"${w}"</div>
          <input class="prodpick" id="map_${i}" data-word="${(w||'').replace(/"/g,'&quot;')}" data-pid="" placeholder="Gõ tên SP để tìm…" style="border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12.5px">
        </div>
      `).join('')}
    `, {
      footer:`<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
              <button class="btn btn-primary" onclick="window._saveLearnedMaps('${custId}')">💾 Dạy hệ thống + thêm vào đơn</button>`,
      width:'520px', stack:true
    });
    if (window.wireAllProductSearch) window.wireAllProductSearch(document.querySelector('.modal-bg:last-of-type') || document);
  }

  window._saveLearnedMaps = function(custId) {
    const learned = [];
    document.querySelectorAll('input[id^=map_].prodpick').forEach(sel => {
      const word = sel.dataset.word;
      const pid = sel.dataset.pid;
      if (word && pid) {
        window.CustPrefs.addAlias(custId, word, pid);
        const p = window.productById(pid);
        if (p) {
          const price = priceForOrder(pid);
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
  window.addOrderItemsFromImage = async function () {
    if (!window.AI) { window.toast('Chưa tải module AI', 'warn'); return; }
    /* Lấy custId hiện tại trong form (nếu đã chọn) để chèn từ điển vào prompt */
    const custId = window.formVal && window.formVal('#oCust');
    const c = custId ? window.STORE.get('customers', []).find(x => x.id === custId) : null;
    const aliasCtx = (custId && window.CustPrefs) ? window.CustPrefs.aliasContextForAI(custId) : '';

    /* === FEW-SHOT: nạp 1-2 mẫu đơn cũ của KH (ảnh + kết quả đúng) để AI nhớ nét chữ === */
    let examples = [];
    if (custId && window.OrderSamples) {
      try {
        const samples = await window.OrderSamples.forCust(custId, 2);
        examples = samples.map(s => ({
          b64: s.b64, mime: s.mime,
          resultText: (s.note ? '(ghi chú: ' + s.note + ') ' : '') + (s.finalItems || []).map(it => `${it.name} = ${it.qty}`).join('; '),
        })).filter(e => e.b64 && e.resultText);
      } catch (e) { /* IndexedDB lỗi → bỏ qua, vẫn đọc bình thường */ }
    }

    /* Build catalog để AI ưu tiên match đúng — đưa TOÀN BỘ danh mục (cắt an toàn 300 SP) */
    const products = window.STORE.get('products', window.PRODUCTS || []);
    const catalogHint = products.slice(0, 800).map(p => p.name).join(', ');

    const basePrompt = `Đọc ảnh chứa danh sách mặt hàng nông sản đặt mua (tiếng Việt).
Trả JSON: {"items":[{"name":"tên mặt hàng","qty":<số lượng>}]}.
Số lượng là số nguyên/thập phân (vd 5, 2.5). KHÔNG bao gồm đơn vị "kg" trong qty.

⚠️ QUAN TRỌNG — ĐỌC ĐẦY ĐỦ, KHÔNG BỎ SÓT:
- Đọc HẾT MỌI DÒNG trong ảnh từ trên xuống dưới, KHÔNG được bỏ sót dòng nào.
- Kể cả chữ viết tay mờ, chữ nhỏ, nhiều cột, gạch đầu dòng, hay tin nhắn dài — liệt kê TẤT CẢ.
- Nếu ảnh có 30 món thì items phải đủ 30 phần tử. Thà thừa còn hơn thiếu.

⚠️ KHÔNG ĐƯỢC TỰ ĐỔI SANG SP KHÁC:
- Ghi ĐÚNG tên mặt hàng như trong ảnh. TUYỆT ĐỐI KHÔNG suy đoán/thay thế sang một mặt hàng khác chỉ vì nghe giống.
- Nếu mặt hàng KHÔNG có trong danh mục bên dưới → VẪN ghi đúng tên đọc được (hệ thống sẽ tự xử lý là "hàng ngoài danh mục"). KHÔNG bỏ qua, KHÔNG ép về SP gần giống.

${aliasCtx ? aliasCtx + '\n\n' : ''}DANH MỤC SP CỦA SHOP (chỉ để tham khảo CHÍNH TẢ tên, KHÔNG bắt buộc phải nằm trong list này): ${catalogHint}

QUY TẮC khi đọc tên:
1. Nếu có TỪ ĐIỂN RIÊNG của KH ở trên → DÙNG đúng tên SP đó (vd "hành" của KH này = "Hành tây trắng" thì viết "Hành tây trắng").
2. Nếu tên đọc được trùng/gần trùng 1 tên trong danh mục (chỉ khác chính tả/dấu) → dùng tên chuẩn trong danh mục.
3. Còn lại → giữ NGUYÊN tên KH viết.

CHỈ TRẢ JSON, không giải thích gì thêm.`;

    window.AI.openFillModal({
      task: 'order',
      title: '📷 Thêm mặt hàng từ ảnh (AI)' + (c ? ' — ' + c.name : '') + (examples.length ? ' · 🧠 ' + examples.length + ' mẫu nét chữ' : ''),
      guideHtml: `Đính kèm <b>ảnh chụp tin nhắn / list hàng / phiếu đặt</b>. AI đọc tên + số lượng từng món, tự match với danh mục SP và cộng vào đơn.
        ${c ? `<br>👤 <b>KH:</b> ${c.name} ${aliasCtx ? '— AI đã biết <b style="color:#15803D">'+Object.keys(window.CustPrefs.get(custId).aliases).length+' từ riêng</b> của KH này' : '— <span style="color:#92400E">chưa có từ điển riêng</span>'}`
                  : '<br>⚠️ <b>Chưa chọn KH</b> — AI không có context cá nhân hoá. Chọn KH trước khi đọc ảnh để chính xác hơn.'}
        ${examples.length ? `<br>🧠 <b style="color:#15803D">AI đang nhớ nét chữ:</b> dùng ${examples.length} mẫu đơn cũ của KH này để đọc chính xác hơn.` : (c ? '<br>💡 Sau khi lưu đơn này, hệ thống sẽ <b>nhớ nét chữ</b> KH để lần sau đọc đúng hơn.' : '')}
        <br><b>Cấu trúc gợi ý:</b> mỗi dòng "Tên món — số lượng" (vd: "Cà chua 5kg, Rau muống 3kg").`,
      prompt: basePrompt,
      examples,
      onResult: (d, meta) => {
        const items = (d && d.items) || [];
        if (!items.length) { window.toast('AI không đọc được mặt hàng nào', 'warn'); return; }
        applyBulkItems(items, 'AI' + (aliasCtx ? ' (có từ điển KH)' : '') + (examples.length ? ' +mẫu' : ''));
        /* Ghi nhớ ảnh để lưu thành "mẫu nét chữ" khi đơn được lưu (chỉ khi đã chọn KH) */
        if (custId && meta && meta.dataURL) {
          _pendingSample = { custId, custName: (c && c.name) || '', dataURL: meta.dataURL, rawItems: items.slice(), note: (meta && meta.note) || '' };
        }
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
        if (document.querySelector('.modal-bg[data-stack-hidden]')) window.closeModal(); /* đóng pre-modal Excel, lộ lại form đơn */
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
      width: '480px', stack: true,
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
    const freight = _moneyVal('#oFreight');
    const cost = parseInt(String(window.formVal('#oPartnerCost') || '').replace(/\D/g, ''), 10) || 0;
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
    /* gợi ý nhóm hàng chính theo KH — tích sẵn tất cả nhóm của KH (multi-select) */
    if (c && Array.isArray(c.mainCats) && c.mainCats.length && window.setOrderSvcIds) {
      window.setOrderSvcIds(c.mainCats);
    }
    /* === Tự áp NHÓM GIÁ theo hồ sơ KH (nguồn: KV custPriceTiers, fallback field) === */
    const tierSel = document.getElementById('oPriceTier');
    if (tierSel) {
      const t = (typeof window.custPriceTier === 'function') ? window.custPriceTier(custId) : ((c && c.priceTier != null) ? String(c.priceTier) : '');
      tierSel.value = t;
      applyOrderTier(t, { silent: true, fromCust: c, custTier: t });
    }
    /* === Cá nhân hoá: hiện gợi ý + nhắc nhở alias === */
    renderCustPrefBox(custId);
  };

  /* Đổi nhóm giá thủ công trên form đơn → tính lại giá các mặt hàng */
  window.onOrderTierChange = function (val) {
    applyOrderTier(val, { silent: false });
  };

  /* Áp nhóm giá: cập nhật orderTier, ghi chú, tính lại giá các mã (trừ SP ngoài DM),
     và làm mới nhãn giá trong dropdown chọn SP. */
  function applyOrderTier(val, opts) {
    opts = opts || {};
    orderTier = val || '';
    const note = document.getElementById('oTierNote');
    const tName = (typeof window.tierName === 'function' && orderTier) ? window.tierName(orderTier) : '';
    const t = (typeof window.priceTierById === 'function') ? window.priceTierById(orderTier) : null;
    const mk = t ? (+t.markup || 0) : 0;
    if (note) {
      if (!orderTier) {
        note.innerHTML = (opts.fromCust && !opts.custTier)
          ? '👤 KH chưa gán nhóm giá → dùng <b>Giá gốc</b>. Đổi tại đây nếu cần.'
          : 'Đang dùng <b>Giá gốc</b> (không markup).';
        note.style.color = 'var(--muted)';
      } else {
        note.innerHTML = `💲 Áp <b>${tName}</b> (${mk >= 0 ? '+' : ''}${mk}% so giá gốc)${opts.fromCust ? ' — theo hồ sơ KH' : ''}. Giá các mặt hàng đã tính lại.`;
        note.style.color = '#15803D';
      }
    }
    /* Tính lại giá các mã đã thêm theo nhóm mới — chỉ SP trong danh mục (có id), bỏ qua SP ngoài DM */
    let repriced = 0;
    orderItems.forEach(it => {
      if (it.custom || !it.id) return;
      const np = priceForOrder(it.id);
      if (np && np !== it.price) {
        it.price = np; it.basePrice = np;
        it.total = Math.round((+it.qty || 0) * np);
        it.priceConfirmed = false; /* để sale rà lại sau khi đổi nhóm giá */
        repriced++;
      }
    });
    /* Ô gõ-tìm SP hiện giá theo nhóm giá hiện tại tự động (priceFn đọc orderTier live) — không cần rebuild. */
    if (orderItems.length) renderOrderItems();
    if (!opts.silent && repriced) window.toast(`💲 Đã tính lại giá ${repriced} mặt hàng theo ${tName || 'Giá gốc'}`, 'success');
  }

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
      const price = priceForOrder(it.id);
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
    const price = priceForOrder(productId);
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
        <div><label style="font-size:11px;color:var(--muted)">= SP nào (gõ tìm)</label><input class="prodpick" id="alPid" data-pid="" placeholder="Gõ tên SP…" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px"></div>
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

      <h3 style="font-size:12px;color:var(--navy);text-transform:uppercase;margin:16px 0 6px">🧠 Mẫu nét chữ đã học</h3>
      <div id="custSampleBox" style="font-size:11.5px;color:var(--muted)">Đang tải…</div>
    `, {
      footer:`<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>`,
      width:'620px'
    });
    if (window.wireAllProductSearch) window.wireAllProductSearch(document.querySelector('.modal-bg:last-of-type') || document);
    if (window._renderAliasSamples) window._renderAliasSamples(custId);
  };

  /* Hiển thị mẫu nét chữ (ảnh) của KH trong modal Từ điển — async đọc IndexedDB */
  window._renderAliasSamples = async function (custId) {
    const box = document.getElementById('custSampleBox');
    if (!box) return;
    if (!window.OrderSamples) { box.innerHTML = '<span>Mở từ trang Đơn hàng để xem mẫu nét chữ.</span>'; return; }
    let samples = [];
    try { samples = await window.OrderSamples.listCust(custId); } catch (e) {}
    if (!samples.length) {
      box.innerHTML = 'Chưa có mẫu. Khi bạn dùng <b>📷 Từ ảnh</b> đọc đơn của KH này rồi lưu đơn → hệ thống tự lưu mẫu để AI nhớ nét chữ.';
      return;
    }
    box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
      ${samples.slice(0, 6).map(s => `<div style="position:relative">
        <img src="data:${s.mime};base64,${s.b64}" title="${(s.finalItems||[]).map(it=>it.name+' '+it.qty).join(', ')}" style="width:74px;height:74px;object-fit:cover;border-radius:6px;border:1px solid var(--line);cursor:zoom-in" onclick="window.open('order-samples.html?cust=${encodeURIComponent(custId)}','_blank')">
      </div>`).join('')}
    </div>
    <div style="margin-top:6px"><b style="color:#15803D">${samples.length} mẫu</b> — AI dùng 2 mẫu mới nhất khi đọc đơn KH này. <a href="order-samples.html?cust=${encodeURIComponent(custId)}" style="color:#1B5E20;font-weight:600">Quản lý →</a></div>`;
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
    const pid = document.getElementById('alPid').dataset.pid || '';
    const qty = parseFloat(document.getElementById('alQty').value) || 0;
    if (!w || !pid) { window.toast('Nhập từ + gõ chọn SP','warn'); return; }
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

  /* Nhóm hàng chính = MULTI-SELECT (checkbox). Tô màu chip khi tích. */
  window._oSvcToggle = function (chk) {
    const chip = chk.closest('.oSvc-chip'); if (!chip) return;
    chip.style.background = chk.checked ? '#DCFCE7' : '#fff';
    chip.style.borderColor = chk.checked ? '#16A34A' : 'var(--line)';
    chip.style.color = chk.checked ? '#15803D' : '';
    chip.style.fontWeight = chk.checked ? '600' : '';
  };
  window.getOrderSvcIds = function () {
    return Array.from(document.querySelectorAll('#oSvcBox .oSvcChk:checked')).map(c => c.value);
  };
  /* Tích sẵn 1 danh sách id nhóm hàng (dùng khi prefill theo KH) */
  window.setOrderSvcIds = function (ids) {
    const set = new Set((ids || []).filter(Boolean));
    document.querySelectorAll('#oSvcBox .oSvcChk').forEach(chk => {
      chk.checked = set.has(chk.value);
      window._oSvcToggle(chk);
    });
  };

  window.submitCreateOrder = function(initStatus) {
    const custId = window.formVal('#oCust');
    const goods = window.formVal('#oGoods');
    const freight = _moneyVal('#oFreight');
    if (!custId) { window.toast('Chọn khách hàng', 'warn'); return; }
    if (!goods) { window.toast('Nhập tên hàng hóa', 'warn'); return; }
    if (!freight) { window.toast('Nhập cước', 'warn'); return; }

    /* SP thủ công bỏ trống tên → loại bỏ hoặc cảnh báo */
    const blankCustom = orderItems.filter(x => x.custom && !(x.name || '').trim());
    if (blankCustom.length) {
      window.toast?.(`⚠ Còn ${blankCustom.length} dòng SP thủ công chưa gõ tên — nhập tên hoặc xóa dòng đó`, 'warn');
      return;
    }

    /* ===== Bắt sale xác nhận giá thủ công TRƯỚC khi tạo đơn ===== */
    const unconfirmed = orderItems.filter(x => x.priceConfirmed === false);
    if (unconfirmed.length > 0) {
      const names = unconfirmed.map(x => x.name).slice(0, 3).join(', ') + (unconfirmed.length > 3 ? `... (+${unconfirmed.length - 3})` : '');
      window.toast?.(`⚠ Còn ${unconfirmed.length} mã chưa xác nhận giá: ${names} · Tick ô ✓ ở cột "Đã xác nhận" trước khi tạo đơn`, 'warn');
      return;
    }

    const customers = window.STORE.get('customers', []);
    const drivers = window.STORE.get('shippers', window.DRIVERS || []);
    const cust = customers.find(c => c.id === custId);

    const drvId = window.formVal('#oDriver');
    const drv = drivers.find(d => d.id === drvId);
    const driver = drvId || '—';
    const driverName = drv ? drv.name : '—';
    const vehicle = drv ? (drv.primaryPlate || 'Xe máy') : '—';

    const svcIds = window.getOrderSvcIds ? window.getOrderSvcIds() : [];
    const newOrder = {
      code: window.formVal('#oCode'),
      date: new Date().toLocaleString('vi-VN'),
      createdAt: new Date().toISOString(),   /* dùng cho phân bổ ưu tiên đơn đặt trước */
      deliverDate: window.formVal('#oDeliverDate') || '',
      shipShift: window.formVal('#oShipShift') || '',
      shipTime: window.formVal('#oShipTime') || '',
      whStatus: 'new',   /* trạng thái kho: new → gathering → confirmed → released */
      cust: custId,            /* legacy field — backward compat */
      custId: custId,          /* canonical field — dùng bởi modules mới */
      source: 'manual',        /* nguồn đơn: tự tạo (vs 'web') */
      custName: cust ? cust.name : '—',
      custPhone: cust ? cust.phone : '',
      serviceType: svcIds.join(','),   /* nhiều nhóm hàng — chuỗi ghép id1,id2 (cột text, không cần schema mới) */
      transportMode: window.formVal('#oMode') || 'giao-ngay',
      pickup: 'Kho Tuấn Tú · 36 Tân Mai, Hoàng Mai, HN',
      drop: window.formVal('#oDrop') || (cust ? cust.address : '—'),
      goods,
      qty: parseInt(window.formVal('#oQty'), 10) || 1,
      weight: parseInt(window.formVal('#oWeight'), 10) || 0,
      unit: window.formVal('#oUnit') || 'kg',
      freight,
      cod: _moneyVal('#oCod'),
      payBy: window.formVal('#oPayBy'),
      driver, driverName, vehicle,
      external: false,
      status: initStatus,
      staff: window.formVal('#oStaff'),
      note: window.formVal('#oNote') || '',
      priceTier: orderTier || '',
      priceTierName: (orderTier && typeof window.tierName === 'function') ? window.tierName(orderTier) : '',
      items: orderItems.slice(),
    };
    window.STORE.add('orders', newOrder);
    /* === LƯU "MẪU NÉT CHỮ": nếu đơn này đọc từ ảnh AI → lưu ảnh + kết quả cuối (đã sửa tay) === */
    if (_pendingSample && window.OrderSamples && cust && _pendingSample.custId === cust.id) {
      const ps = _pendingSample;
      const finalItems = orderItems.map(it => ({ name: it.name, qty: it.qty, productId: it.id || null }));
      (async () => {
        try {
          const small = await window.OrderSamples.downscale(ps.dataURL, 1100, 0.72);
          await window.OrderSamples.add({
            custId: ps.custId, custName: ps.custName || (cust && cust.name) || '',
            b64: small.b64, mime: small.mime,
            rawItems: ps.rawItems, finalItems, note: ps.note || '',
          });
          window.toast && window.toast('🧠 Đã lưu mẫu nét chữ của KH — lần sau AI đọc đơn chính xác hơn', 'success');
        } catch (e) { console.warn('[order sample save]', e); }
      })();
    }
    _pendingSample = null;
    orderItems = [];
    orderTier = '';
    window.closeModal();
    const profitMsg = external ? ` · LN ${window.fmtShort(freight - partnerCost)}₫` : '';
    window.toast('✓ Đã tạo ' + newOrder.code + profitMsg, 'success');
    /* Auto-gửi PHIẾU BÁO HÀNG vào group kho/bếp (chỉ khi đã cấu hình kênh 'bao_hang') */
    if (window.sendBaoHangTelegram) {
      window.sendBaoHangTelegram(newOrder.code, true).then(r => {
        if (r && r.ok) window.toast?.('📋 Đã gửi phiếu báo hàng vào "' + r.channel + '"', 'success');
      }).catch(() => {});
    }
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
  /* Mở thẳng chi tiết 1 đơn khi tới từ trang khác (vd Gom hàng → ✏️ Sửa) */
  const openCode = urlParams.get('open');
  if (openCode) setTimeout(() => window.openOrder && window.openOrder(openCode), 300);

  /* Đếm số đơn web đang chờ duyệt → badge trên nút "🛒 Đơn web chờ duyệt" */
  window.refreshWebPendBadge = async function () {
    const badge = document.getElementById('webPendBadge');
    if (!badge || !window.SB) return;
    try {
      const { count, error } = await window.SB
        .from('web_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) return;
      if (count && count > 0) { badge.textContent = count; badge.style.display = ''; }
      else { badge.style.display = 'none'; }
    } catch (e) {}
  };
  setTimeout(() => window.refreshWebPendBadge(), 400);
})();
