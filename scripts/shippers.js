/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Quản lý Shipper (CRUD)
   Dùng chung STORE key 'shippers' với dropdown gán shipper ở Đơn hàng.
   (data/fleet.js vẫn export window.DRIVERS làm fallback cho mock-data.)
   ========================================================= */
(function () {
  let currentFilter = 'all';

  function shippers() { return window.STORE.get('shippers', window.DRIVERS || []); }

  /* ============================================================
     LIVE STATUS — Logic ƯU TIÊN từ trên xuống:
     ============================================================
     1. activeOrders > 0  → 🚚 Đang giao (bất kể chấm công)
     2. Freelance         → 🤝 (chờ chia đơn / xong ca tùy đã giao gì)
     3. Đi làm (X/L) + 0 đơn active → 🟡 Rảnh chờ chia đơn
     4. Phép (P/H)        → 🟠 Phép
     5. Vắng (V)          → ⚪ Vắng
     6. CN (_)            → ⏸ Nghỉ CN
     7. Không link staff  → ? Unknown
     ============================================================ */
  const ST = {
    busy:       { label: '🚚 Đang giao',                color: '#16A34A', bg: '#DCFCE7' },
    idle:       { label: '🟡 Rảnh — sẵn sàng nhận đơn', color: '#A16207', bg: '#FEF3C7' },
    done_today: { label: '✓ Đã xong ca',                color: '#15803D', bg: '#DCFCE7' },
    paid_leave: { label: '🟠 Phép',                     color: '#C2410C', bg: '#FFEDD5' },
    absent:     { label: '⚪ Vắng',                     color: '#B91C1C', bg: '#FEE2E2' },
    off_sunday: { label: '⏸ Nghỉ CN',                   color: 'var(--muted)', bg: '#F3F4F6' },
    unknown:    { label: '— Chưa rõ',                   color: 'var(--muted)', bg: '#F3F4F6' },
    /* Backward compat */
    running:    { label: '🟢 Đang giao',                color: 'var(--ok)', bg: '#DCFCE7' },
    off:        { label: '⚪ Nghỉ',                     color: 'var(--muted)', bg: '#F3F4F6' },
  };

  /* === Find staff record link với shipper ===
     Ưu tiên qua staffId (link chính thức), fallback match by name. */
  function staffForShipper(s) {
    const staffList = window.STORE.get('staff', window.STAFFS || []);
    if (s.staffId) {
      const byId = staffList.find(st => st.id === s.staffId);
      if (byId) return byId;
    }
    return staffList.find(st => st.name === s.name) || null;
  }

  /* === Get today timesheet status for a staff === */
  function todayTimesheetStatus(staffId, todayDate) {
    const sheets = window.STORE.get('timesheet', window.TIMESHEET || []);
    const today = todayDate || new Date(2026, 4, 18);    /* demo today */
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = today.getDate();
    const monthKey = yyyy + '-' + mm;
    const sh = sheets.find(t => t.staffId === staffId && t.month === monthKey);
    if (!sh) return 'X';   /* mặc định đi làm nếu chưa chấm */
    return sh.days[dd - 1] || 'X';
  }

  /* === Compute live status cho 1 shipper === */
  function liveStatus(s, todayOrders) {
    const myOrders = todayOrders.filter(o =>
      (o.driver === s.id || o.driverName === s.name) &&
      o.status !== 'cancelled'
    );
    /* Breakdown đơn theo trạng thái */
    const cnt = { confirmed: 0, pickup: 0, transit: 0, delivered: 0, reconciled: 0, returned: 0 };
    myOrders.forEach(o => { if (cnt[o.status] !== undefined) cnt[o.status]++; });
    const active = cnt.pickup + cnt.transit;            /* đang giao */
    const done   = cnt.delivered + cnt.reconciled;       /* đã giao xong */
    const wait   = cnt.confirmed;                        /* chờ pickup / mới gán */
    const ret    = cnt.returned;

    const staff = staffForShipper(s);
    const attCode = staff ? todayTimesheetStatus(staff.id) : null;

    /* === LOGIC ƯU TIÊN === */
    let stCode;
    if (active > 0) {
      stCode = 'busy';                            /* có đơn đang chạy → ưu tiên */
    } else if (s.freelancer) {
      stCode = (done + ret) > 0 ? 'done_today' : 'idle';   /* freelance gộp chung idle */
    } else if (attCode === 'X' || attCode === 'L') {
      stCode = 'idle';
    } else if (attCode === 'P' || attCode === 'H') {
      stCode = 'paid_leave';
    } else if (attCode === 'V') {
      stCode = 'absent';
    } else if (attCode === '_') {
      stCode = 'off_sunday';
    } else {
      stCode = 'unknown';
    }

    return {
      code: stCode,
      ...ST[stCode],
      cnt, active, done, wait, ret,
      todayCount: myOrders.length,
      attCode,
    };
  }

  function render() {
    const all = shippers();
    /* Pre-load today orders để compute status nhanh */
    const orders = window.STORE.get('orders', window.ORDERS || []);
    const TODAY_VI = '18/05/2026';
    const todayOrders = orders.filter(o => (o.date || '').startsWith(TODAY_VI));

    /* Compute status cho mỗi shipper */
    const withLive = all.map(s => ({ ...s, live: liveStatus(s, todayOrders) }));

    const list = withLive.filter(s => currentFilter === 'all' || s.live.code === currentFilter);
    const cnt = {
      all: withLive.length,
      busy: withLive.filter(s => s.live.code === 'busy').length,
      idle: withLive.filter(s => s.live.code === 'idle').length,
      done_today: withLive.filter(s => s.live.code === 'done_today').length,
      paid_leave: withLive.filter(s => s.live.code === 'paid_leave').length,
      absent: withLive.filter(s => s.live.code === 'absent').length,
      off_sunday: withLive.filter(s => s.live.code === 'off_sunday').length,
    };
    const totalActiveOrders = todayOrders.filter(o => o.status === 'pickup' || o.status === 'transit').length;
    const totalDoneToday = todayOrders.filter(o => (o.status === 'delivered' || o.status === 'reconciled') && o.driver && o.driver !== '—').length;
    const totalTodayOrders = todayOrders.filter(o => o.status !== 'cancelled' && o.driver && o.driver !== '—').length;

    // KPIs
    const kpis = document.querySelector('.kpis');
    if (kpis) kpis.innerHTML = `
      <div class="kpi k-1"><div class="kpi-label">Tổng shipper</div><div class="kpi-value">${cnt.all}</div><div class="kpi-trend">${withLive.filter(s=>!s.freelancer).length} NV · ${withLive.filter(s=>s.freelancer).length} freelance</div><div class="kpi-icon">🛵</div></div>
      <div class="kpi k-2"><div class="kpi-label">🚚 Đang giao</div><div class="kpi-value">${cnt.busy}</div><div class="kpi-trend up">${totalActiveOrders} đơn trên đường</div><div class="kpi-icon">🟢</div></div>
      <div class="kpi k-3"><div class="kpi-label">🟡 Rảnh chờ</div><div class="kpi-value">${cnt.idle}</div><div class="kpi-trend">sẵn sàng nhận đơn</div><div class="kpi-icon">⏳</div></div>
      <div class="kpi k-4"><div class="kpi-label">Nghỉ / phép</div><div class="kpi-value">${cnt.paid_leave + cnt.absent + cnt.off_sunday}</div><div class="kpi-trend">${cnt.paid_leave}P · ${cnt.absent}V · ${cnt.off_sunday}CN</div><div class="kpi-icon">🌴</div></div>
      <div class="kpi k-5"><div class="kpi-label">Đơn hôm nay</div><div class="kpi-value">${totalTodayOrders}</div><div class="kpi-trend up">${totalDoneToday} xong · ${totalActiveOrders} đang chạy</div><div class="kpi-icon">📦</div></div>`;

    // chips — filter theo live status
    const chips = document.getElementById('shipChips');
    if (chips) chips.innerHTML = `
      <button class="chip ${currentFilter === 'all' ? 'active' : ''}" onclick="window.filterShip('all')">Tất cả <span class="cnt">${cnt.all}</span></button>
      <button class="chip ${currentFilter === 'busy' ? 'active' : ''}" onclick="window.filterShip('busy')">🚚 Đang giao <span class="cnt">${cnt.busy}</span></button>
      <button class="chip ${currentFilter === 'idle' ? 'active' : ''}" onclick="window.filterShip('idle')">🟡 Rảnh chờ <span class="cnt">${cnt.idle}</span></button>
      <button class="chip ${currentFilter === 'done_today' ? 'active' : ''}" onclick="window.filterShip('done_today')">✓ Xong ca <span class="cnt">${cnt.done_today}</span></button>
      <button class="chip ${currentFilter === 'paid_leave' ? 'active' : ''}" onclick="window.filterShip('paid_leave')">🟠 Phép <span class="cnt">${cnt.paid_leave}</span></button>
      <button class="chip ${currentFilter === 'absent' ? 'active' : ''}" onclick="window.filterShip('absent')">⚪ Vắng <span class="cnt">${cnt.absent}</span></button>
      <button class="chip ${currentFilter === 'off_sunday' ? 'active' : ''}" onclick="window.filterShip('off_sunday')">⏸ CN <span class="cnt">${cnt.off_sunday}</span></button>`;

    /* Pre-compute tổng đơn đã nhận (ever) + tháng + ngày breakdown per driver */
    const allOrders = window.STORE.get('orders', window.ORDERS || []);
    const totalByDriver = {};
    const monthByDriver = {};   /* T5/2026 */
    const todayBreakByDriver = {};  /* {assigned, pending, running, done, returned} */
    allOrders.forEach(o => {
      if (!o.driver || o.driver === '—') return;
      const isMonth = (o.date||'').includes('/05/2026') && o.status !== 'cancelled';
      const isToday = (o.date||'').startsWith(TODAY_VI);
      if (o.status !== 'cancelled') totalByDriver[o.driver] = (totalByDriver[o.driver] || 0) + 1;
      if (isMonth) monthByDriver[o.driver] = (monthByDriver[o.driver] || 0) + 1;
      if (isToday) {
        const br = todayBreakByDriver[o.driver] || (todayBreakByDriver[o.driver] = { assigned:0, pending:0, running:0, done:0, returned:0, cancelled:0 });
        br.assigned++;
        if (o.status === 'confirmed') br.pending++;        /* nhận nhưng chưa lấy hàng */
        else if (o.status === 'pickup' || o.status === 'transit') br.running++;  /* đang chạy */
        else if (o.status === 'delivered' || o.status === 'reconciled') br.done++;
        else if (o.status === 'returned') br.returned++;
        else if (o.status === 'cancelled') br.cancelled++;
      }
    });

    /* Update KPI strip với số liệu sản lượng ngày */
    const totalKgToday = todayOrders.filter(o => o.status === 'delivered' || o.status === 'reconciled')
      .reduce((s,o) => s + (o.items||[]).reduce((ss,it) => ss + (+it.qty||0), 0), 0);
    const totalRevToday = todayOrders.filter(o => o.status === 'delivered' || o.status === 'reconciled')
      .reduce((s,o) => s + (o.freight||0), 0);
    /* Update kpi cuối với sản lượng kg */
    const lastKpi = document.querySelector('.kpis .kpi.k-5 .kpi-trend');
    if (lastKpi) lastKpi.innerHTML = `${totalDoneToday} xong · ${totalActiveOrders} đang chạy · <b>${window.fmt(totalKgToday)}kg</b> · ${window.fmtShort(totalRevToday)}`;

    const rows = list.map(s => {
      const live = s.live;
      /* Today breakdown */
      let todayHtml;
      if (live.todayCount === 0) {
        todayHtml = '<span style="color:var(--muted);font-size:12px;font-style:italic">Chưa có đơn</span>';
      } else {
        const parts = [];
        if (live.done) parts.push(`<span style="color:#15803D">✓${live.done}</span>`);
        if (live.active) parts.push(`<span style="color:#0EA5E9">🚚${live.active}</span>`);
        if (live.wait) parts.push(`<span style="color:#A16207">📋${live.wait}</span>`);
        if (live.ret) parts.push(`<span style="color:#EA580C">↩${live.ret}</span>`);
        todayHtml = `<div style="display:flex;align-items:baseline;gap:8px">
          <b style="font-size:17px;color:var(--navy);line-height:1">${live.todayCount}</b>
          <span style="font-size:10.5px;color:var(--muted);font-weight:600">đơn</span>
        </div>
        <div style="font-size:11px;margin-top:2px;font-weight:700;display:flex;gap:6px">${parts.join('<span style="color:var(--line)">·</span>')}</div>`;
      }
      const typeBadge = s.freelancer
        ? '<span style="font-size:9.5px;padding:1px 5px;border-radius:3px;background:#FEF3C7;color:#A16207;font-weight:700;letter-spacing:0.3px">🤝 FREELANCE</span>'
        : '<span style="font-size:9.5px;padding:1px 5px;border-radius:3px;background:#DCFCE7;color:#15803D;font-weight:700;letter-spacing:0.3px">👨‍💼 NV</span>';
      const attTip = live.attCode === null ? 'Freelance (không chấm công)' : 'Chấm công hôm nay: ' + live.attCode;
      const codeTip = s.staffId ? `Mã shipper ${s.code || s.id} · link với NV ${s.staffId}` : 'Mã shipper ' + (s.code || s.id);
      const totalReceived = totalByDriver[s.id] || 0;
      const monthCount = monthByDriver[s.id] || 0;
      const br = todayBreakByDriver[s.id] || { assigned:0, pending:0, running:0, done:0, returned:0 };

      /* Sản lượng kg hôm nay của shipper này */
      const myKgToday = todayOrders
        .filter(o => o.driver === s.id && (o.status === 'delivered' || o.status === 'reconciled'))
        .reduce((sum, o) => sum + (o.items||[]).reduce((ss, it) => ss + (+it.qty||0), 0), 0);
      const myRevToday = todayOrders
        .filter(o => o.driver === s.id && (o.status === 'delivered' || o.status === 'reconciled'))
        .reduce((sum, o) => sum + (o.freight||0), 0);

      return `<tr>
        <td style="font-size:12.5px;font-weight:600;color:var(--navy)" title="${codeTip}">${s.code || s.id}</td>
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="av" style="width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:12.5px;font-weight:700;background:${window.avatarColor(s.name)};position:relative;flex-shrink:0">
              ${window.initials(s.name)}
              <span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:${live.color};border:2px solid #fff" title="${live.label}"></span>
            </div>
            <div style="min-width:0">
              <div style="display:flex;align-items:center;gap:6px"><b style="font-size:13.5px">${s.name}</b>${typeBadge}</div>
              <div style="color:var(--muted);font-size:11.5px;margin-top:1px">${s.phone || '—'} · ${s.primaryPlate || ''}</div>
            </div>
          </div>
        </td>
        <td style="min-width:200px">
          <!-- KPI ngày: 4 con số nhận / chưa / đang / xong -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:11px">
            <div style="background:#F1F5F9;padding:5px 6px;border-radius:5px;text-align:center" title="Tổng đơn được phân công hôm nay">
              <div style="font-weight:800;font-size:13px;color:#0F172A">${br.assigned}</div>
              <div style="color:#475569;font-size:9.5px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600">Nhận</div>
            </div>
            <div style="background:#FEF3C7;padding:5px 6px;border-radius:5px;text-align:center" title="Chưa lấy hàng (status: confirmed)">
              <div style="font-weight:800;font-size:13px;color:#92400E">${br.pending}</div>
              <div style="color:#92400E;font-size:9.5px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600">Chưa</div>
            </div>
            <div style="background:#EDE9FE;padding:5px 6px;border-radius:5px;text-align:center" title="Đang giao (pickup/transit)">
              <div style="font-weight:800;font-size:13px;color:#7C3AED">${br.running}</div>
              <div style="color:#7C3AED;font-size:9.5px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600">Đang</div>
            </div>
            <div style="background:#DCFCE7;padding:5px 6px;border-radius:5px;text-align:center" title="Đã giao xong (delivered/reconciled)">
              <div style="font-weight:800;font-size:13px;color:#15803D">${br.done}</div>
              <div style="color:#15803D;font-size:9.5px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600">Xong</div>
            </div>
          </div>
          ${myKgToday > 0 ? `<div style="font-size:10.5px;color:var(--muted);margin-top:4px;text-align:center">📦 <b style="color:#1B5E20">${window.fmt(myKgToday)}kg</b> · 💰 <b style="color:#1B5E20">${window.fmtShort(myRevToday)}</b></div>` : ''}
        </td>
        <td class="num">
          <b style="font-size:15px;color:var(--navy)">${window.fmt(monthCount)}</b>
          <div style="font-size:10px;color:var(--muted);margin-top:1px">đơn / T5</div>
        </td>
        <td class="num">
          <b style="font-size:15px;color:#15803D">${window.fmt(totalReceived)}</b>
          <div style="font-size:10px;color:var(--muted);margin-top:1px">tổng đã nhận</div>
        </td>
        <td>
          <span style="font-weight:700;color:${live.color};background:${live.bg};padding:6px 12px;border-radius:7px;display:inline-block;font-size:12.5px;white-space:nowrap" title="${attTip}">${live.label}</span>
        </td>
        <td class="num" style="white-space:nowrap">
          <button class="icon-btn" title="Sửa" onclick="window.editShipper('${s.id}')">✏️</button>
          <button class="icon-btn" title="Xóa" style="color:var(--danger)" onclick="window.deleteShipper('${s.id}')">🗑</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--muted)">Không có shipper nào khớp filter.</td></tr>`;

    document.getElementById('shipBody').innerHTML = rows;
  }

  window.filterShip = function (f) { currentFilter = f; render(); };

  function form(s) {
    return `
      <div class="form-row">
        <div><label>Tên shipper *</label><input id="sName" value="${s ? s.name : ''}" placeholder="VD: Lê Văn B"></div>
        <div><label>Số điện thoại *</label><input id="sPhone" value="${s ? (s.phone || '') : ''}" placeholder="09xx xxx xxx"></div>
      </div>
      <div class="form-row">
        <div><label>Phương tiện / Biển số</label><input id="sPlate" value="${s ? (s.primaryPlate || '') : ''}" placeholder="VD: 29-X1 456.78"></div>
        <div><label>Khu vực phụ trách</label><input id="sArea" value="${s ? (s.address || '') : ''}" placeholder="VD: Hoàng Mai, Hà Nội"></div>
      </div>
      <div class="form-row">
        <div><label>Ngày vào làm</label><input id="sJoin" value="${s ? (s.joinDate || '') : ''}" placeholder="dd/mm/yyyy"></div>
        <div><label>Trạng thái <span style="font-size:10px;color:var(--muted);font-weight:400">(auto từ chấm công + đơn)</span></label>
          <div style="padding:9px 12px;background:#FAFAFB;border:1px dashed var(--line);border-radius:7px;font-size:12.5px;color:var(--muted)">
            🔁 Tự động: <b>${s && s.live ? s.live.label : '🟡 Rảnh chờ đơn'}</b>
          </div>
          <input type="hidden" id="sStatus" value="${s ? (s.status || 'running') : 'running'}">
        </div>
      </div>

      <div class="section-h" style="margin-top:14px">📞 Kênh nhận thông báo đơn</div>
      <div class="form-row">
        <div><label>Email</label><input id="sEmail" type="email" value="${s ? (s.email || '') : ''}" placeholder="shipper@nongsantuantu.com"></div>
        <div>
          <label class="help-label">Telegram Chat ID
            <span class="help-mini" onclick="window.openHelpGuide&&window.openHelpGuide('tg-group-chat-id')" title="Hướng dẫn">?</span>
          </label>
          <input id="sTgChat" value="${s ? (s.telegramChatId || '') : ''}" placeholder="VD: 123456789 (DM cá nhân)">
        </div>
      </div>
      <div style="font-size:11px;color:var(--muted);padding:8px 10px;background:#FAFAFB;border-radius:6px">
        💡 <b>Cách lấy Telegram Chat ID:</b> Shipper mở Telegram → tìm bot của bạn → /start →
        sau đó gửi tin nhắn bất kỳ vào bot →
        Bạn vào <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> để xem chat.id của shipper.
      </div>${s ? renderShipperScheduleHTML(s) : ''}`;
  }

  /* === LỊCH SHIP HÔM NAY của shipper === */
  function renderShipperScheduleHTML(s) {
    const orders = window.STORE.get('orders', window.ORDERS || []);
    const TODAY_VI = '18/05/2026';
    const myOrders = orders.filter(o =>
      (o.driver === s.id || o.driverName === s.name) &&
      (o.date || '').startsWith(TODAY_VI) &&
      o.status !== 'cancelled'
    );
    const totalQty = myOrders.reduce((sum, o) => sum + (o.qty || 0), 0);
    const totalRev = myOrders.reduce((sum, o) => sum + (o.freight || 0), 0);
    const totalCod = myOrders.reduce((sum, o) => sum + (o.cod || 0), 0);
    const rowsHtml = myOrders.length ? myOrders.map((o, i) => {
      const st = { confirmed:'🆕 Mới', pickup:'📦 Lấy', transit:'🚚 Giao', delivered:'✓ Xong', reconciled:'💰 Soát', returned:'↩ Trả' };
      return `<tr>
        <td><b>${i+1}</b></td>
        <td><b style="color:var(--navy)">${o.code}</b><div style="font-size:10.5px;color:var(--muted)">${o.date.slice(11) || ''}</div></td>
        <td>${o.custName}<div style="font-size:10.5px;color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${o.drop || ''}">${o.drop || ''}</div></td>
        <td class="num">${o.qty}${o.unit||'kg'}</td>
        <td class="num">${(o.freight||0).toLocaleString('vi-VN')}</td>
        <td><span style="font-size:11px;padding:2px 6px;border-radius:4px;background:#FAFAFB">${st[o.status] || o.status}</span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--muted)">Không có đơn nào hôm nay.</td></tr>';

    return `
      <div class="section-h" style="margin-top:14px">📅 Lịch ship hôm nay (${TODAY_VI})</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px">
        <div style="padding:8px 10px;background:#E0F2FE;border-radius:6px"><div style="font-size:10.5px;color:#0369A1;font-weight:700;text-transform:uppercase">Đơn</div><div style="font-size:16px;font-weight:800;color:#0369A1">${myOrders.length}</div></div>
        <div style="padding:8px 10px;background:#F0FDF4;border-radius:6px"><div style="font-size:10.5px;color:#15803D;font-weight:700;text-transform:uppercase">Trọng lượng</div><div style="font-size:16px;font-weight:800;color:#15803D">${totalQty}kg</div></div>
        <div style="padding:8px 10px;background:#FFFBEB;border-radius:6px"><div style="font-size:10.5px;color:#A16207;font-weight:700;text-transform:uppercase">Tổng tiền</div><div style="font-size:16px;font-weight:800;color:#A16207">${(totalRev/1e6).toFixed(1)}tr</div></div>
        <div style="padding:8px 10px;background:#FEE2E2;border-radius:6px"><div style="font-size:10.5px;color:#B91C1C;font-weight:700;text-transform:uppercase">Thu hộ COD</div><div style="font-size:16px;font-weight:800;color:#B91C1C">${(totalCod/1e6).toFixed(2)}tr</div></div>
      </div>
      <div style="max-height:280px;overflow-y:auto;border:1px solid var(--line);border-radius:7px">
        <table class="mini-table" style="width:100%;font-size:12px">
          <thead><tr><th>#</th><th>Mã đơn</th><th>KH / Địa chỉ</th><th class="num">SL</th><th class="num">Tiền</th><th>TT</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      ${myOrders.length ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-navy btn-sm" onclick="window.sendShipperSchedule('${s.id}')">📤 Gửi lịch ngày cho shipper</button>
        <button class="btn btn-ghost btn-sm" onclick="window.printShipperSchedule('${s.id}')">🖨 In lịch</button>
      </div>` : ''}
    `;
  }

  /* === Build text lịch ngày cho shipper === */
  function buildShipperScheduleMsg(s) {
    const orders = window.STORE.get('orders', window.ORDERS || []);
    const customers = window.STORE.get('customers', window.CUSTOMERS || []);
    const TODAY_VI = '18/05/2026';
    const myOrders = orders.filter(o =>
      (o.driver === s.id || o.driverName === s.name) &&
      (o.date || '').startsWith(TODAY_VI) &&
      o.status !== 'cancelled'
    );
    const totalRev = myOrders.reduce((sum, o) => sum + (o.freight || 0), 0);
    const totalCod = myOrders.reduce((sum, o) => sum + (o.cod || 0), 0);
    let msg = `📅 LỊCH GIAO HÀNG NGÀY ${TODAY_VI}\n👤 ${s.name} · ${s.primaryPlate}\n`;
    msg += `\n🛒 ${myOrders.length} đơn · 💵 Tổng ${totalRev.toLocaleString('vi-VN')}đ`;
    if (totalCod) msg += ` · 🟡 COD ${totalCod.toLocaleString('vi-VN')}đ`;
    msg += `\n${'─'.repeat(30)}\n`;
    myOrders.forEach((o, i) => {
      const c = customers.find(x => x.id === o.cust) || {};
      msg += `\n${i+1}. ${o.code} (${o.date.slice(11) || ''})\n`;
      msg += `   👤 ${o.custName}${c.phone ? ' · ☎ ' + c.phone : ''}\n`;
      msg += `   📍 ${o.drop || '—'}\n`;
      msg += `   📦 ${o.qty}${o.unit||'kg'} · 💵 ${(o.freight||0).toLocaleString('vi-VN')}đ`;
      if (o.cod) msg += ` · 🟡 COD ${o.cod.toLocaleString('vi-VN')}đ`;
      msg += '\n';
    });
    msg += `\n— CRM Nông Sản Tuấn Tú`;
    return msg;
  }

  window.sendShipperSchedule = async function (sid) {
    const s = shippers().find(x => x.id === sid); if (!s) return;
    const msg = buildShipperScheduleMsg(s);
    const tg = window.STORE.get('int_telegram', {});
    /* 1. Ưu tiên Telegram cá nhân nếu shipper có chat ID */
    if (tg.botToken && s.telegramChatId) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: s.telegramChatId, text: msg }),
        });
        const j = await r.json();
        if (j.ok) { window.toast('✅ Đã gửi lịch ngày cho ' + s.name + ' qua Telegram (cá nhân)', 'success'); return; }
        window.toast('❌ Telegram lỗi: ' + (j.description || 'fail') + ' — thử group...', 'warn');
      } catch (e) { window.toast('Network lỗi — thử group...', 'warn'); }
    }
    /* 2. Fallback group "shipper_dispatch" nếu có cấu hình */
    const r2 = await window.sendTgMessage('shipper_dispatch', `📅 Lịch ship riêng cho ${s.name}:\n\n` + msg);
    if (r2.ok) { window.toast(`✅ Đã gửi lịch ${s.name} → group ${r2.channel}`, 'success'); return; }
    /* 3. Email */
    if (s.email) {
      const subject = 'Lịch ship ngày ' + new Date().toLocaleDateString('vi-VN');
      window.location.href = `mailto:${s.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
      return;
    }
    try {
      await navigator.clipboard.writeText(msg);
      window.toast('✓ Đã copy lịch — paste vào chat Zalo/Telegram cho ' + s.name, 'success');
    } catch (e) {
      alert(msg);
    }
  };

  window.printShipperSchedule = function (sid) {
    const s = shippers().find(x => x.id === sid); if (!s) return;
    const msg = buildShipperScheduleMsg(s);
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) { window.toast('Trình duyệt chặn popup', 'warn'); return; }
    w.document.write(`<html><head><title>Lịch ship ${s.name}</title>
      <style>body{font-family:'Segoe UI',Arial;padding:20px;white-space:pre-wrap;font-size:13px;line-height:1.6}</style></head><body>${msg.replace(/&/g,'&amp;').replace(/</g,'&lt;')}<script>setTimeout(()=>window.print(),200)<\/script></body></html>`);
    w.document.close();
  };

  window.openAddShipper = function () {
    window.openModal('+ Thêm shipper', form(null), {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.submitShipper()">💾 Lưu</button>`,
    });
  };

  window.editShipper = function (id) {
    const s = shippers().find(x => x.id === id);
    if (!s) return;
    /* Compute live status để hiển thị trong form */
    const orders = window.STORE.get('orders', window.ORDERS || []);
    const TODAY_VI = '18/05/2026';
    const todayOrders = orders.filter(o => (o.date || '').startsWith(TODAY_VI));
    s.live = liveStatus(s, todayOrders);
    window.openModal('Sửa shipper: ' + s.name, form(s), {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.submitShipper('${id}')">💾 Cập nhật</button>`,
      width: '720px',
    });
  };

  window.submitShipper = function (id) {
    const name = window.formVal('#sName');
    const phone = window.formVal('#sPhone');
    if (!name) { window.toast('Nhập tên shipper', 'warn'); return; }
    if (!phone) { window.toast('Nhập số điện thoại', 'warn'); return; }
    const patch = {
      name, phone,
      primaryPlate: window.formVal('#sPlate'),
      address: window.formVal('#sArea'),
      status: window.formVal('#sStatus') || 'running',
      joinDate: window.formVal('#sJoin'),
      email: window.formVal('#sEmail') || '',
      telegramChatId: window.formVal('#sTgChat') || '',
    };
    if (id) {
      window.STORE.update('shippers', id, patch);
      window.toast('✓ Đã cập nhật ' + name, 'success');
    } else {
      const all = shippers();
      window.STORE.add('shippers', {
        id: 'DR' + String(Date.now()).slice(-6),
        code: window.STORE.nextId('shippers', 'TX'),
        ...patch, canDrive: [], trips30d: 0, revenue30d: 0, rating: 5.0, recentTrips: [],
      });
      window.toast('✓ Đã thêm shipper ' + name, 'success');
    }
    window.closeModal();
    render();
  };

  window.deleteShipper = function (id) {
    const s = shippers().find(x => x.id === id);
    window.confirmDelete('Xóa shipper "' + (s ? s.name : id) + '"?', () => {
      window.STORE.remove('shippers', id);
      window.toast('Đã xóa', 'danger');
      render();
    });
  };

  /* init */
  window.STORE.subscribe('shippers', render);
  window.STORE.subscribe('orders', render);       /* đơn đổi → status đổi */
  window.STORE.subscribe('timesheet', render);    /* chấm công đổi → status đổi */
  window.STORE.subscribe('staff', render);
  window.renderAppShell('shippers', 'Shipper');
  render();
})();
