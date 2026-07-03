/* =========================================================
   Recurring Orders — mẫu đơn lặp lại + auto-generator
   ─────────────────────────────────────────────────────────
   - Mẫu RO chứa: KH, items, daysOfWeek, deliverAt, nextRun
   - Generator: chạy mỗi lần page load, nếu nextRun ≤ today + active
     → tạo 1 đơn thật trong window.STORE.orders, set nextRun = ngày kế
   ========================================================= */
(function () {
  function getRO() { return window.STORE.get('recurring_orders', window.RECURRING_ORDERS || []) || []; }
  function getCust(id) { return (window.STORE.get('customers', window.CUSTOMERS || []) || []).find(c => c.id === id); }
  const DAY_LABELS = ['CN','T2','T3','T4','T5','T6','T7'];
  const TODAY = window.todayDate();

  function parseVi(s) { const m = (s||'').match(/(\d+)\/(\d+)\/(\d+)/); return m ? new Date(+m[3],+m[2]-1,+m[1]) : null; }
  function fmtVi(d) { return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; }

  /* Tính ngày chạy kế tiếp dựa trên daysOfWeek + ngày bắt đầu */
  function nextRunFrom(startDate, daysOfWeek) {
    if (!daysOfWeek || !daysOfWeek.length) return startDate;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(startDate); d.setDate(startDate.getDate() + i);
      if (daysOfWeek.includes(d.getDay())) return d;
    }
    return startDate;
  }

  /* === Shipper mặc định của mẫu định kỳ — lưu KV (roaming đa máy; recurring_orders không có cột driver) === */
  const _roDrvMap = () => (window.STORE.get('recurringDrivers', {}) || {});
  function roDriverOf(ro) { const kv = _roDrvMap()[ro.id]; return kv || { id: ro.driver || '', name: ro.driverName || '' }; }
  function setRoDriver(roId, id, name) {
    window.STORE.rmwKv('recurringDrivers', m => {   /* chống đè: áp set/xoá theo roId lên bản cloud mới nhất */
      m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
      if (id) m[roId] = { id, name: name || '' }; else delete m[roId];
      return m;
    });
  }

  /* === Auto-assign: tìm shipper rảnh nhất (ít đơn confirmed/pickup/transit hôm nay nhất) === */
  function findFreeShipper() {
    const drivers = window.STORE.get('shippers', window.DRIVERS || []) || [];
    const activeDrivers = drivers.filter(d => !d.freelancer || d.freelancer);  /* All including freelance */
    if (!activeDrivers.length) return null;
    const orders = window.STORE.get('orders', []) || [];
    const TODAY_VI = window.todayVN();
    const todayOrders = orders.filter(o => (o.date||'').startsWith(TODAY_VI) && o.status !== 'cancelled');
    /* Đếm đơn hôm nay per shipper */
    const loadByShipper = {};
    todayOrders.forEach(o => {
      if (o.driver) loadByShipper[o.driver] = (loadByShipper[o.driver]||0) + 1;
    });
    /* Sắp xếp: ít đơn nhất + ưu tiên NV (không freelance) */
    const sorted = activeDrivers
      .map(d => ({ d, load: loadByShipper[d.id] || 0 }))
      .sort((a, b) => {
        if (a.load !== b.load) return a.load - b.load;
        if (a.d.freelancer && !b.d.freelancer) return 1;
        if (!a.d.freelancer && b.d.freelancer) return -1;
        return 0;
      });
    return sorted[0]?.d || null;
  }

  /* Generator: sinh đơn nếu nextRun ≤ TODAY */
  function runGenerator() {
    /* DỪNG HẲN theo yêu cầu: CHỈ tự sinh đơn khi autoRecurring.enabled === true (mặc định TẮT).
       Bật lại: vào cấu hình "Tự tạo đơn định kỳ" bật enabled (hoặc setAutoCfg(true, giờ)). */
    const _autoCfg = window.STORE.get('autoRecurring', { enabled: false }) || {};
    if (!_autoCfg.enabled) return;
    if (!window.STORE.isPreloaded('recurring_orders') || !window.STORE.isPreloaded('orders')) return;
    const ros = getRO();
    const orders = window.STORE.get('orders', window.ORDERS || []) || [];
    const TODAY_VN = window.todayVN();
    let created = 0, autoAssigned = 0;
    ros.forEach(ro => {
      if (!ro.active) return;
      const next = parseVi(ro.nextRun);
      if (!next || next > TODAY) return;
      /* Idempotent: đã sinh cho mẫu này hôm nay rồi thì bỏ qua */
      if (ro.generatedFor === TODAY_VN) return;
      /* Idempotent lớp 2: orders đã có đơn recurring cùng KH + hôm nay */
      if (orders.some(o => o.source === 'recurring' && o.custId === ro.custId && (o.date || '').startsWith(TODAY_VN))) {
        ro.generatedFor = TODAY_VN;
        return;
      }
      /* Tạo đơn */
      const code = window.STORE.nextOrderCode();
      const items = ro.items.map(it => ({
        id: it.productId, name: it.name, qty: it.qty,
        price: window.priceOn ? window.priceOn(it.productId, window.todayISO()) : 15000,
        total: 0,
      }));
      items.forEach(it => it.total = it.qty * it.price);
      const freight = items.reduce((s,i) => s + i.total, 0);
      const c = getCust(ro.custId);

      /* === AUTO-ASSIGN shipper nếu mẫu chưa gán (đọc shipper mặc định từ KV roaming) === */
      const _rd = roDriverOf(ro);
      let driver = _rd.id || '';
      let driverName = _rd.name || '';
      let isAutoAssigned = false;
      if (!driver) {
        const auto = findFreeShipper();
        if (auto) {
          driver = auto.id;
          driverName = auto.name;
          isAutoAssigned = true;
          autoAssigned++;
        }
      }

      orders.push({
        code,
        cust: ro.custId, custId: ro.custId,
        custName: ro.custName,
        custPhone: c?.phone || '', drop: c?.address || '',
        date: fmtVi(TODAY), status: 'confirmed',
        deliverDate: TODAY_VN,
        whStatus: 'new',
        shipTime: ro.deliverAt || '',
        items, freight, cod: freight,
        staff: ro.staffOwner,
        driver, driverName,
        autoAssignedDriver: isAutoAssigned,
        source: 'recurring',
        note: `🔁 Tự sinh từ mẫu ${ro.id}${ro.deliverAt?' · Giao '+ro.deliverAt:''}${isAutoAssigned?' · 🤖 Shipper auto-assigned':''}${ro.note?' · '+ro.note:''}`,
      });
      ro.lastRun = fmtVi(TODAY);
      ro.nextRun = fmtVi(nextRunFrom(TODAY, ro.daysOfWeek));
      ro.generatedFor = TODAY_VN;
      created++;
    });
    if (created) {
      window.STORE.set('orders', orders);
      window.STORE.set('recurring_orders', ros);
      if (window.audit) window.audit.log('recurring.run', `Tự sinh ${created} đơn từ mẫu định kỳ${autoAssigned ? ' · ' + autoAssigned + ' auto-assigned shipper' : ''}`);
      window.toast(`🔁 Đã sinh ${created} đơn${autoAssigned ? ' · 🤖 ' + autoAssigned + ' auto-gán shipper rảnh' : ''}`, 'success');
    } else {
      window.toast('Chưa có mẫu nào đến lịch chạy', 'info');
    }
  }

  function renderKpis() {
    const list = getRO();
    const active = list.filter(r => r.active).length;
    const today = list.filter(r => r.active && r.nextRun === window.todayVN()).length;
    const orders = window.STORE.get('orders', []) || [];
    const fromRo = orders.filter(o => o.source === 'recurring').length;
    const totalQty = list.filter(r => r.active).reduce((s,r) => s + (r.items||[]).length, 0);
    document.getElementById('roKpis').innerHTML = `
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">Mẫu đang chạy ${window.helpTip('Mẫu định kỳ active sẽ tự sinh đơn mới khi đến lịch (nextRun).')}</div><div style="font-size:24px;font-weight:800;color:var(--navy);margin-top:4px">${active}/${list.length}</div></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">📅 Đến lịch hôm nay ${window.helpTip('Mẫu có nextRun = hôm nay. Bấm "▶ Chạy ngay" để generator tạo đơn ngay lập tức.')}</div><div style="font-size:24px;font-weight:800;color:#F59E0B;margin-top:4px">${today}</div></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">📦 Đơn đã tự sinh ${window.helpTip('Tổng số đơn được tạo từ recurring trong lịch sử.')}</div><div style="font-size:24px;font-weight:800;color:var(--ok);margin-top:4px">${fromRo}</div></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">🥬 Σ SP trong mẫu ${window.helpTip('Tổng số dòng SP trong tất cả mẫu đang chạy.')}</div><div style="font-size:24px;font-weight:800;color:var(--navy);margin-top:4px">${totalQty}</div></div>
    `;
  }

  function render() {
    renderKpis();
    const q = (document.getElementById('roQ').value || '').toLowerCase();
    const st = document.getElementById('roSt').value;
    let rows = getRO();
    if (q) rows = rows.filter(r => (r.custName||'').toLowerCase().includes(q));
    if (st === 'active') rows = rows.filter(r => r.active);
    if (st === 'paused') rows = rows.filter(r => !r.active);
    const host = document.getElementById('roList');
    if (!rows.length) { host.innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:40px;text-align:center;color:var(--muted)">Chưa có mẫu định kỳ nào. Bấm "+ Tạo mẫu" để bắt đầu.</div>`; return; }
    const drivers = window.STORE.get('shippers', window.DRIVERS || []) || [];
    host.innerHTML = rows.map(r => {
      const days = [0,1,2,3,4,5,6].map(d => `<span class="day-chip ${(r.daysOfWeek||[]).includes(d) ? 'on' : 'off'}">${DAY_LABELS[d]}</span>`).join('');
      const items = (r.items||[]).slice(0,6).map(it => `<span class="ro-item-pill">${it.name} ${it.qty}kg</span>`).join('');
      const more = r.items.length > 6 ? `<span class="ro-item-pill" style="background:#F1F5F9;color:#475569">+${r.items.length-6} mặt nữa</span>` : '';
      const freqLabel = { daily:'Hàng ngày', weekly:'Hàng tuần', biweekly:'2 tuần/lần', monthly:'Hàng tháng' };

      /* Inline shipper dropdown — shipper mặc định đọc từ KV roaming */
      const _rdrv = roDriverOf(r);
      const driverOpts = `<option value="">🤖 Auto-assign (chưa gán)</option>` +
        drivers.map(d => `<option value="${d.id}" data-name="${d.name}" ${_rdrv.id===d.id?'selected':''}>${d.freelancer?'🤝':'👨‍💼'} ${d.name}${d.primaryPlate?' · '+d.primaryPlate:''}</option>`).join('');
      const driverLabel = _rdrv.id
        ? `🛵 <b style="color:#15803D">${_rdrv.name||_rdrv.id}</b>`
        : `<span style="color:#D97706;font-weight:600">🤖 Auto-assign khi sinh đơn</span>`;

      return `<div class="ro-card ${r.active?'':'paused'}">
        <div class="ro-head" onclick="window.openRoDrawer('${r.id}')" style="cursor:pointer">
          <div class="ro-av" style="background:${window.avatarColor(r.custId)}">${window.initials(r.custName)}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:14px">${r.custName} ${r.active ? '<span class="tag" style="background:#DCFCE7;color:#15803D;font-size:10px">● Đang chạy</span>' : '<span class="tag" style="background:#FEE2E2;color:#B91C1C;font-size:10px">⏸ Tạm dừng</span>'}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">${r.id} · ${freqLabel[r.frequency]} · giao lúc <b>${r.deliverAt}</b> · 👤 ${r.staffOwner || '—'}</div>
            <div style="margin-top:6px">${days}</div>
          </div>
          <div style="text-align:right;font-size:12px">
            <div style="color:var(--muted)">Lần kế tiếp</div>
            <div style="font-weight:700;color:var(--navy)">${r.nextRun}</div>
            <div style="color:var(--muted);font-size:11px;margin-top:2px">Lần trước: ${r.lastRun}</div>
          </div>
        </div>

        <!-- Inline shipper dropdown — đổi nhanh không cần mở modal -->
        <div class="ro-ship-row hide-xs" style="display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 10px;background:${r.driver?'#F0FDF4':'#FEF3C7'};border-radius:7px;border-left:3px solid ${r.driver?'#16A34A':'#D97706'}" onclick="event.stopPropagation()">
          <span style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:0.3px">🛵 Shipper:</span>
          <select onchange="window.roInlineChangeDriver('${r.id}', this.value, this.options[this.selectedIndex].dataset.name||'')"
            style="flex:1;border:1px solid ${r.driver?'#16A34A':'#D97706'};background:#fff;color:${r.driver?'#15803D':'#92400E'};font-weight:600;font-size:12px;padding:4px 10px;border-radius:5px;cursor:pointer">
            ${driverOpts}
          </select>
          ${r.driver ? '' : `<span style="font-size:10.5px;color:#92400E;font-style:italic">(rỗng = tự gán ship rảnh nhất khi sinh đơn)</span>`}
        </div>

        <div class="ro-items">${items}${more}</div>
        ${r.note ? `<div style="font-size:11.5px;color:var(--muted);margin-top:6px;font-style:italic">💬 ${r.note}</div>` : ''}
      </div>`;
    }).join('');
  }

  /* Inline đổi shipper từ card (không cần mở modal sửa) */
  window.roInlineChangeDriver = function(roId, driverId, driverName) {
    const list = getRO();
    const i = list.findIndex(x => x.id === roId);
    if (i < 0) return;
    list[i].driver = driverId || '';
    list[i].driverName = driverId ? driverName : '';
    window.STORE.set('recurring_orders', list);
    setRoDriver(roId, driverId, driverName);   /* KV roaming — bảng recurring_orders không có cột driver */
    window.audit && window.audit.log('recurring.changeDriver', `${roId}: ${driverId || 'Auto-assign'} (${driverName||'?'})`);
    window.toast(`✓ Cập nhật shipper cho mẫu ${roId}`, 'success');
  };

  window.openRoDrawer = function (id) {
    const r = getRO().find(x => x.id === id);
    if (!r) return;
    const dc = document.getElementById('drawerContent');
    dc.innerHTML = `
      <div style="background:linear-gradient(135deg,${window.avatarColor(r.custId)} 0%,#1B5E20 100%);color:#fff;padding:20px;position:relative">
        <button onclick="closeDrawer()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:30px;height:30px;border-radius:6px;cursor:pointer">✕</button>
        <h2 style="margin:0;font-size:18px">${r.custName}</h2>
        <div style="opacity:0.85;font-size:12.5px;margin-top:2px">${r.id} · ${r.frequency} · ${r.deliverAt}</div>
      </div>
      <div style="padding:18px 20px">
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px">
          <thead><tr style="background:#FAFBFC"><th style="text-align:left;padding:6px 8px;font-size:11px">SP</th><th style="text-align:right;padding:6px 8px;font-size:11px">SL/lần</th></tr></thead>
          <tbody>${(r.items||[]).map(it => `<tr style="border-top:1px solid #F1F5F9"><td style="padding:6px 8px">${it.name}</td><td style="text-align:right;padding:6px 8px;font-weight:600">${it.qty}</td></tr>`).join('')}</tbody>
        </table>
        <div style="background:#FAFBFC;padding:10px;border-radius:8px;font-size:12.5px;line-height:1.7">
          <div><b>Ngày giao:</b> ${(r.daysOfWeek||[]).map(d => DAY_LABELS[d]).join(', ')}</div>
          <div><b>Giờ giao:</b> ${r.deliverAt}</div>
          <div><b>NV phụ trách:</b> ${r.staffOwner}</div>
          <div><b>Lần kế tiếp:</b> ${r.nextRun}</div>
          <div><b>Ghi chú:</b> ${r.note||'—'}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn btn-ghost" style="flex:1" onclick="window.toggleRo('${r.id}')">${r.active ? '⏸ Tạm dừng' : '▶ Kích hoạt'}</button>
          <button class="btn btn-primary" style="flex:1" onclick="window.openRoModal('${r.id}')">✏️ Sửa</button>
        </div>
        <button class="btn btn-ghost" style="width:100%;margin-top:8px;color:var(--danger)" onclick="window.deleteRo('${r.id}')">🗑 Xóa mẫu này</button>
      </div>`;
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerBg').classList.add('open');
  };

  window.closeDrawer = function () {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBg').classList.remove('open');
  };

  window.toggleRo = function (id) {
    const list = getRO();
    const i = list.findIndex(x => x.id === id);
    list[i].active = !list[i].active;
    if (list[i].active && (!list[i].nextRun || list[i].nextRun === '—')) {
      list[i].nextRun = fmtVi(nextRunFrom(TODAY, list[i].daysOfWeek));
    }
    window.STORE.set('recurring_orders', list);
    window.toast(list[i].active ? 'Đã kích hoạt' : 'Đã tạm dừng', 'info');
    window.closeDrawer();
  };

  window.deleteRo = function (id) {
    if (!confirm('Xóa mẫu định kỳ này? KHÔNG xóa các đơn đã sinh ra trước đó.')) return;
    const list = getRO().filter(x => x.id !== id);
    window.STORE.set('recurring_orders', list);
    window.audit && window.audit.log('recurring.delete', id);
    window.toast('Đã xóa', 'danger');
    window.closeDrawer();
  };

  window.openRoModal = function (id) {
    const isEdit = !!id;
    const ro = isEdit ? getRO().find(x => x.id === id) : {
      id:'RO' + String(getRO().length+1).padStart(3,'0'),
      custId:'', custName:'', frequency:'daily', daysOfWeek:[1,2,3,4,5,6], deliverAt:'06:00',
      active:true, items:[], note:'', staffOwner: window.CURRENT_USER?.name || ''
    };
    const custs = window.STORE.get('customers', window.CUSTOMERS || []) || [];
    const prods = window.STORE.get('products', window.PRODUCTS || []) || [];
    const drivers = window.STORE.get('shippers', window.DRIVERS || []) || [];
    const staff = window.STORE.get('staff', window.STAFFS || []) || [];
    const salesStaff = staff.filter(s => s.department === 'Sales' || s.position?.includes('Sale') || s.position?.includes('Kinh doanh') || s.position?.includes('Chủ DN'));
    if (!salesStaff.length) salesStaff.push(...['Trần Lan','Phạm Hùng','Hoàng Mai','Tuấn Tú'].map(n => ({name:n})));

    window.openModal((isEdit?'✏️ Sửa':'+ Tạo') + ' mẫu định kỳ', `
      <div style="background:#EFF6FF;color:#1E40AF;padding:9px 12px;border-radius:7px;font-size:12px;margin-bottom:12px">
        💡 <b>Mẹo:</b> Dùng cho KH B2B đặt rau định kỳ (nhà hàng, bếp ăn). Hệ thống sẽ <b>tự sinh đơn</b> mỗi ngày trong tuần đã chọn — bạn không cần tạo thủ công nữa. Mỗi đơn sinh ra sẽ <b>tự gán shipper</b> mặc định bên dưới.
      </div>

      <h4 style="font-size:11.5px;color:var(--navy);text-transform:uppercase;margin:0 0 6px;letter-spacing:0.4px">👤 KHÁCH HÀNG & NV PHỤ TRÁCH</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">Khách hàng * ${window.helpTip ? window.helpTip('Gõ tên/SĐT/mã KH — danh sách tự lọc theo bạn gõ. Ấn ↑↓ để chọn, Enter để xác nhận.') : ''}</label>
          <div id="ro_cust_box"></div>
          <input type="hidden" id="ro_cust" value="${ro.custId||''}">
        </div>
        <div><label style="font-size:12px;color:var(--muted)">NV phụ trách (Sale) ${window.helpTip('NV được ghi vào đơn auto-sinh để theo dõi KPI doanh số.')}</label>
          <select id="ro_owner" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px">
            ${salesStaff.map(s => `<option ${ro.staffOwner===s.name?'selected':''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div><label style="font-size:12px;color:var(--muted)">🛵 Shipper mặc định ${window.helpTip('Mỗi đơn auto-sinh sẽ tự gán shipper này. Sếp có thể đổi sau ở module Đơn hàng nếu shipper bận.')}</label>
          <select id="ro_driver" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px">
            <option value="">— Tự phân bổ (chưa gán) —</option>
            ${drivers.map(d => `<option value="${d.id}" data-name="${d.name}" ${ro.driver===d.id?'selected':''}>${d.name}${d.primaryPlate?' · '+d.primaryPlate:''}${d.freelancer?' · Freelance':''}</option>`).join('')}
          </select>
        </div>
      </div>

      <h4 style="font-size:11.5px;color:var(--navy);text-transform:uppercase;margin:0 0 6px;letter-spacing:0.4px">📅 LỊCH GIAO</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div><label style="font-size:12px;color:var(--muted)">Tần suất ${window.helpTip('Hàng ngày = T2-CN. Hàng tuần = chỉ 1-2 ngày/tuần.')}</label>
          <select id="ro_freq" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px">
            <option value="daily" ${ro.frequency==='daily'?'selected':''}>Hàng ngày</option>
            <option value="weekly" ${ro.frequency==='weekly'?'selected':''}>Hàng tuần</option>
            <option value="biweekly" ${ro.frequency==='biweekly'?'selected':''}>2 tuần/lần</option>
          </select>
        </div>
        <div><label style="font-size:12px;color:var(--muted)">Giờ giao ${window.helpTip('Giờ ghi vào ghi chú đơn để shipper biết lịch.')}</label><input id="ro_time" type="time" value="${ro.deliverAt}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">Ngày trong tuần (chọn ngày sẽ giao)</label>
          <div style="display:flex;gap:4px;margin-top:4px">
            ${DAY_LABELS.map((d,i) => `<label style="cursor:pointer;display:flex;align-items:center;flex-direction:column;gap:3px;font-size:10px"><input type="checkbox" data-dow="${i}" ${(ro.daysOfWeek||[]).includes(i)?'checked':''}> ${d}</label>`).join('')}
          </div>
        </div>
      </div>

      <h4 style="font-size:11.5px;color:var(--navy);text-transform:uppercase;margin:0 0 6px;letter-spacing:0.4px;display:flex;align-items:center;gap:8px">
        🥬 MẶT HÀNG
        <span style="flex:1"></span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.roCopyFromLastOrder()" title="Copy items từ đơn gần nhất của KH này" style="font-size:11px;padding:3px 8px">↻ Từ đơn cũ</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.roBulkExcel()" title="Import items từ Excel hàng loạt" style="font-size:11px;padding:3px 8px">📥 Excel</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.roBulkAI()" title="Đọc ảnh AI: chụp list SP/đơn cũ" style="font-size:11px;padding:3px 8px">📷 Ảnh AI</button>
      </h4>
      <div id="ro_items" style="margin-top:4px"></div>
      <button class="btn btn-ghost btn-sm" onclick="window._roAddItem()" style="margin-top:5px">+ Thêm 1 SP</button>

      <label style="font-size:12px;color:var(--muted);display:block;margin-top:14px">Ghi chú (sẽ điền vào mỗi đơn auto-sinh)</label>
      <textarea id="ro_note" rows="2" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px" placeholder="VD: Giao trước 7h, hàng tươi, tránh hành tỏi">${ro.note||''}</textarea>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window._roSave(${isEdit?'true':'false'},'${ro.id}')">Lưu mẫu</button>`,
      width:'620px'
    });
    window._roPRODS = prods;
    (ro.items || [{}]).forEach(it => window._roAddItem(it));

    /* Mount autocomplete cho KH */
    if (window.CustSearchBox) {
      window._roSelectedCust = null;
      window.CustSearchBox.mount('ro_cust_box', {
        initialId: ro.custId || null,
        placeholder: 'Gõ tên / SĐT / mã KH (vd: "Á Đông", "0912", "KH001")...',
        onSelect: (c) => {
          window._roSelectedCust = c;
          document.getElementById('ro_cust').value = c ? c.id : '';
        },
      });
    }
  };

  /* === Bulk thêm items === */
  function _roApplyBulkItems(items) {
    const products = window._roPRODS || window.STORE.get('products', []) || [];
    function norm(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d'); }
    function matchProd(name) {
      const n = norm(name);
      let p = products.find(x => norm(x.name) === n);
      if (p) return p;
      p = products.find(x => { const xn = norm(x.name); return xn.includes(n) || n.includes(xn); });
      return p;
    }
    let added = 0, unmatched = [];
    items.forEach(it => {
      const qty = parseFloat(it.qty) || 0;
      if (!qty) return;
      const p = matchProd(it.name);
      if (!p) { unmatched.push(it.name); return; }
      window._roAddItem({ productId: p.id, name: p.name, qty });
      added++;
    });
    window.toast(`✓ Thêm ${added} mặt hàng${unmatched.length ? ' · ' + unmatched.length + ' không khớp: ' + unmatched.slice(0,3).join(', ') : ''}`, added ? 'success' : 'warn');
  }

  window.roBulkExcel = function() {
    if (!window.BulkImport) { window.toast('BulkImport chưa load','warn'); return; }
    window.BulkImport.fromExcel({
      entityName: 'Mặt hàng định kỳ',
      templateColumns: ['name','qty'],
      templateRow: ['Cải bó xôi', '10'],
      mapRow: (row) => ({ name: row[0], qty: row[1] }),
      onParsed: (recs) => _roApplyBulkItems(recs),
    });
  };
  window.roBulkAI = function() {
    if (!window.BulkImport) { window.toast('BulkImport chưa load','warn'); return; }
    const custId = document.getElementById('ro_cust')?.value;
    const aliasHint = (custId && window.CustPrefs)
      ? window.CustPrefs.aliasContextForAI(custId)
      : '';
    window.BulkImport.fromImage({
      entityName: 'Mặt hàng định kỳ',
      promptHint: 'list rau định kỳ KH hay đặt (vd từ tin nhắn, đơn cũ)',
      fields: ['name','qty'],
      aiTask: 'order',
      customPrompt: `Đọc ảnh chứa list mặt hàng nông sản đặt mua (tiếng Việt, có thể VIẾT TAY). Trả JSON: {"items":[{"name":"tên SP","qty":<số>}]}. KHÔNG ghi đơn vị "kg" trong qty.

⚠️ QUAN TRỌNG — ĐỌC ĐẦY ĐỦ: đọc HẾT MỌI DÒNG từ trên xuống dưới, KHÔNG bỏ sót dòng nào — kể cả chữ viết tay mờ, chữ nhỏ, nhiều cột, gạch đầu dòng, tin nhắn dài. Nếu ảnh có 30 món thì items phải đủ 30 phần tử. Thà đoán còn hơn bỏ sót.

${aliasHint || ''}

CHỈ TRẢ JSON.`,
      onParsed: (recs) => _roApplyBulkItems(recs),
    });
  };

  /* Copy items từ đơn gần nhất của KH đã chọn */
  window.roCopyFromLastOrder = function() {
    const custId = document.getElementById('ro_cust')?.value;
    if (!custId) { window.toast('Chọn KH trước','warn'); return; }
    const orders = (window.STORE.get('orders', []) || [])
      .filter(o => (o.custId === custId || o.cust === custId) && o.status !== 'cancelled')
      .sort((a,b) => (b.date||'').localeCompare(a.date||''));
    if (!orders.length) { window.toast('KH này chưa có đơn nào','warn'); return; }
    const lastOrder = orders[0];
    if (!confirm(`Copy ${lastOrder.items?.length||0} mặt hàng từ đơn ${lastOrder.code} (${lastOrder.date})?`)) return;
    const items = (lastOrder.items || []).map(it => ({ name: it.name, qty: it.qty }));
    _roApplyBulkItems(items);
  };

  window._roAddItem = function (it) {
    const host = document.getElementById('ro_items');
    const prods = window._roPRODS || [];
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 80px 28px;gap:6px;margin-bottom:4px';
    row.innerHTML = `
      <select class="ri_pid" style="border:1px solid var(--line);border-radius:5px;padding:5px;font-size:12px"><option value="">— SP —</option>${prods.map(p => `<option value="${p.id}" data-name="${p.name}" ${(it&&it.productId===p.id)?'selected':''}>${p.name}</option>`).join('')}</select>
      <input type="number" placeholder="SL" class="ri_qty" value="${(it&&it.qty)||''}" style="border:1px solid var(--line);border-radius:5px;padding:5px;font-size:12px">
      <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:var(--danger)">✕</button>
    `;
    host.appendChild(row);
  };

  window._roSave = function (isEdit, id) {
    const custId = document.getElementById('ro_cust').value;
    const c = window._roSelectedCust || (window.STORE.get('customers', []) || []).find(x => x.id === custId);
    const driverSel = document.getElementById('ro_driver');
    const driverId = driverSel?.value || '';
    const driverName = driverId ? driverSel.options[driverSel.selectedIndex]?.dataset.name : '';
    const obj = {
      id: id,
      custId: custId,
      custName: c ? c.name : '',
      frequency: document.getElementById('ro_freq').value,
      deliverAt: document.getElementById('ro_time').value,
      daysOfWeek: [...document.querySelectorAll('[data-dow]:checked')].map(x => +x.dataset.dow),
      active: true,
      note: document.getElementById('ro_note').value,
      items: [],
      staffOwner: document.getElementById('ro_owner')?.value || window.CURRENT_USER?.name || '',
      driver: driverId,
      driverName: driverName,
    };
    document.querySelectorAll('#ro_items > div').forEach(r => {
      const s = r.querySelector('.ri_pid');
      const q = parseFloat(r.querySelector('.ri_qty').value) || 0;
      if (s.value && q > 0) obj.items.push({ productId: s.value, name: s.options[s.selectedIndex].dataset.name, qty: q });
    });
    if (!obj.custId) { window.toast('Chọn KH','warn'); return; }
    if (!obj.items.length) { window.toast('Thêm ít nhất 1 SP','warn'); return; }
    if (!obj.daysOfWeek.length) { window.toast('Chọn ngày trong tuần','warn'); return; }
    obj.nextRun = fmtVi(nextRunFrom(TODAY, obj.daysOfWeek));
    obj.lastRun = '—';
    obj.createdAt = fmtVi(TODAY);

    const list = getRO();
    if (isEdit) {
      const idx = list.findIndex(x => x.id === obj.id);
      list[idx] = { ...list[idx], ...obj };
    } else {
      list.push(obj);
    }
    window.STORE.set('recurring_orders', list);
    setRoDriver(obj.id, driverId, driverName);   /* shipper mặc định roaming qua KV */
    window.audit && window.audit.log(isEdit ? 'recurring.update' : 'recurring.create', `${obj.id} · ${obj.custName}`);
    window.toast('✓ Đã lưu mẫu', 'success');
    window.closeModal();
  };

  window.roRunNow = function () {
    runGenerator();
  };

  /* === Cấu hình tự tạo đơn (admin chỉnh giờ) — lưu KV autoRecurring, cron đọc === */
  window.saveAutoCfg = function () {
    const enabled = !!document.getElementById('auto_enabled')?.checked;
    const time = document.getElementById('auto_time')?.value || '21:00';
    window.STORE.set('autoRecurring', { enabled, time });
    window.toast && window.toast(enabled ? `🤖 Đã bật tự tạo đơn lúc ${time} mỗi ngày` : '⏸ Đã tắt tự tạo đơn', enabled ? 'success' : 'info');
  };
  function loadAutoCfg() {
    const cfg = window.STORE.get('autoRecurring', { enabled: false, time: '21:00' }) || {};
    const cb = document.getElementById('auto_enabled'); if (cb) cb.checked = !!cfg.enabled;
    const tm = document.getElementById('auto_time'); if (tm && cfg.time) tm.value = cfg.time;
  }

  /* Init */
  window.renderAppShell('recurring', 'Đơn định kỳ');
  loadAutoCfg();
  window.STORE.subscribe('autoRecurring', loadAutoCfg);
  document.getElementById('hbHost').innerHTML = window.helpBanner(
    '🔁 Đơn định kỳ là gì?',
    'Mẫu đơn lặp lại cho KH B2B đặt theo lịch (rau hằng ngày cho nhà hàng, hàng tuần cho bếp ăn...). Hệ thống <b>tự sinh đơn mới mỗi ngày</b> trong tuần đã cài. Không cần tạo thủ công — tiết kiệm 80% thao tác. Cần dừng giao thì bấm "⏸ Tạm dừng".',
    {id:'hb-ro', icon:'🔁'}
  );
  document.getElementById('hbT').innerHTML = window.helpTip('Generator chạy mỗi khi page được load. Triển khai production nên gắn cron / serverless function để chạy lúc 00:00 mỗi ngày.', {size:'lg'});

  ['roQ','roSt'].forEach(id => document.getElementById(id).oninput = render);
  window.STORE.subscribe('recurring_orders', render);
  render();
  /* Auto-run generator khi dữ liệu đã preload xong (chống chạy trên data rỗng) */
  window.STORE.subscribe('__preloaded__', k => { if (k === 'orders' || k === 'recurring_orders') runGenerator(); });
  setTimeout(runGenerator, 800);

  /* === Pre-fill từ Order form: nếu có sessionStorage._pendingRO → mở modal === */
  setTimeout(() => {
    const pending = sessionStorage.getItem('_pendingRO');
    if (pending) {
      try {
        const p = JSON.parse(pending);
        sessionStorage.removeItem('_pendingRO');
        /* Mở modal với prefill */
        window.openRoModal();
        setTimeout(() => {
          /* Set KH */
          if (window.CustSearchBox && p.custId) {
            window.CustSearchBox.setValue('ro_cust_box', p.custId);
          }
          /* Clear default empty row + đẩy items vào */
          const host = document.getElementById('ro_items');
          if (host) host.innerHTML = '';
          p.items.forEach(it => window._roAddItem(it));
          window.toast('✓ Đã prefill từ ' + (p.fromOrder ? 'Order' : 'KH'), 'success');
        }, 200);
      } catch (e) { console.warn('Pending RO prefill failed', e); }
    }
  }, 600);
})();
