/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Dashboard executive cho sếp
   ─────────────────────────────────────────────────────────
   Gom dữ liệu từ 5 phòng ban:
   - Sales (orders/customers)
   - Vận hành (shippers + chấm công)
   - Tài chính (lãi gộp/ròng + công nợ)
   - Nhân sự (staff + payroll)
   - Marketing (adspend)
   ========================================================= */
(function () {
  const TODAY_VI = window.todayVN();
  const TODAY_ISO = window.todayISO();
  const MONTH_VI = '05/2026';

  function parseViDate(s) {
    const m = (s || '').match(/(\d+)\/(\d+)\/(\d+)/);
    return m ? { d: +m[1], mo: +m[2], y: +m[3] } : null;
  }
  function isThisMonth(o) {
    const d = parseViDate(o.date);
    return d && d.mo === 5 && d.y === 2026;
  }
  function buyPriceFor(p, viDate) {
    if (!p || !p.priceHistory || !p.priceHistory.length) return null;
    const od = parseViDate(viDate); if (!od) return p.priceHistory[p.priceHistory.length - 1].buy;
    const odDate = new Date(od.y, od.mo - 1, od.d);
    let best = null;
    p.priceHistory.forEach(h => {
      const hd = new Date(h.date);
      if (hd <= odDate && (!best || hd > new Date(best.date))) best = h;
    });
    return (best || p.priceHistory[0]).buy;
  }

  /* ========== COMPUTE ALL KPIs ========== */
  function calcAll() {
    const orders    = window.STORE.get('orders', window.ORDERS || []) || [];
    const customers = window.STORE.get('customers', window.CUSTOMERS || []) || [];
    const products  = window.STORE.get('products', window.PRODUCTS || []) || [];
    const staff     = window.STORE.get('staff', window.STAFFS || []) || [];
    const drivers   = window.STORE.get('shippers', window.DRIVERS || []) || [];
    const ads       = window.STORE.get('adspend', window.ADSPEND || []) || [];
    const timesheet = window.STORE.get('timesheet', window.TIMESHEET || []) || [];

    /* === SALES === */
    const todayOrders = orders.filter(o => (o.date || '').startsWith(TODAY_VI) && o.status !== 'cancelled');
    const todayRev = todayOrders.reduce((s, o) => s + (o.freight || 0), 0);
    const todayCod = todayOrders.reduce((s, o) => s + (o.cod || 0), 0);

    const monthOrders = orders.filter(o => isThisMonth(o) && o.status !== 'cancelled');
    const monthRev = monthOrders.reduce((s, o) => s + (o.freight || 0), 0);
    const monthAov = monthOrders.length ? monthRev / monthOrders.length : 0;

    /* === VẬN HÀNH === */
    const activeOrders   = todayOrders.filter(o => o.status === 'pickup' || o.status === 'transit');
    const doneToday      = todayOrders.filter(o => o.status === 'delivered' || o.status === 'reconciled');
    const pendingDispatch = orders.filter(o => o.status === 'confirmed' && (!o.driver || o.driver === '—')).length;

    /* Shipper status hôm nay */
    const todaySh = window.todayDate();
    const todayDay = todaySh.getDate();
    const _curMonth = todaySh.toISOString().slice(0, 7);
    function todayAtt(staffId) {
      if (!staffId) return null;
      const sh = timesheet.find(t => t.staffId === staffId && t.month === _curMonth);
      return sh ? sh.days[todayDay - 1] : 'X';
    }
    const shippersLive = drivers.map(d => {
      const myActive = activeOrders.filter(o => o.driver === d.id).length;
      const att = d.staffId ? todayAtt(d.staffId) : null;
      let code;
      if (myActive > 0) code = 'busy';
      else if (d.freelancer) code = 'freelance';
      else if (att === 'X' || att === 'L') code = 'idle';
      else if (att === 'P' || att === 'H') code = 'leave';
      else if (att === 'V') code = 'absent';
      else if (att === '_') code = 'off';
      else code = 'idle';
      return { ...d, code, activeCount: myActive };
    });
    const shipperBusy = shippersLive.filter(s => s.code === 'busy').length;
    const shipperIdle = shippersLive.filter(s => s.code === 'idle' || s.code === 'freelance').length;
    const shipperOff  = shippersLive.filter(s => s.code === 'leave' || s.code === 'absent' || s.code === 'off').length;

    /* === NHÂN SỰ === */
    const activeStaff = staff.filter(s => s.status === 'active');
    let onDuty = 0, onLeave = 0, absent = 0;
    activeStaff.forEach(s => {
      const att = todayAtt(s.id);
      if (att === 'X' || att === 'L') onDuty++;
      else if (att === 'P' || att === 'H') onLeave++;
      else if (att === 'V') absent++;
    });
    const totalSalary = activeStaff.reduce((s, x) => s + (x.salary || 0), 0);

    /* === TÀI CHÍNH === */
    let monthCogs = 0;
    monthOrders.forEach(o => {
      (o.items || []).forEach(it => {
        const p = products.find(x => x.id === it.id);
        const bp = p ? (buyPriceFor(p, o.date) || it.price * 0.8) : it.price * 0.8;
        monthCogs += (bp || 0) * (it.qty || 0);
      });
    });
    const monthAds = ads.filter(a => (a.date || '').startsWith('2026-05')).reduce((s, a) => s + (a.spend || 0), 0);
    const grossProfit = monthRev - monthCogs;
    const grossMargin = monthRev ? grossProfit / monthRev * 100 : 0;
    /* Lương ước cho tháng = lương cơ bản (full) — simplified */
    const netProfit = grossProfit - monthAds - totalSalary;
    const netMargin = monthRev ? netProfit / monthRev * 100 : 0;

    const totalDebt = customers.reduce((s, c) => s + (c.debt || 0), 0);
    const overdueDebt = customers.reduce((s, c) => s + (c.debtOverdue || 0), 0);

    /* === MARKETING === */
    const adsMonth = ads.filter(a => (a.date || '').startsWith('2026-05'));
    const adsSale = adsMonth.filter(a => a.objective === 'ban-hang');
    const adsRecruit = adsMonth.filter(a => a.objective === 'tuyen-dung');
    const adSpendSale = adsSale.reduce((s, a) => s + (a.spend || 0), 0);
    const adSpendRecruit = adsRecruit.reduce((s, a) => s + (a.spend || 0), 0);
    const adCusts = adsSale.reduce((s, a) => s + (a.custs || 0), 0);
    const adCpc = adCusts ? Math.round(adSpendSale / adCusts) : 0;

    /* === TOP SP === */
    const byProd = {};
    monthOrders.forEach(o => (o.items || []).forEach(it => {
      const k = it.id || it.name;
      const b = byProd[k] || (byProd[k] = { name: it.name, qty: 0, rev: 0 });
      b.qty += (it.qty || 0);
      b.rev += (it.total || 0);
    }));
    const topProducts = Object.values(byProd).sort((a, b) => b.rev - a.rev).slice(0, 5);

    /* === TOP NV bán === */
    const byStaff = {};
    monthOrders.forEach(o => {
      const b = byStaff[o.staff] || (byStaff[o.staff] = { name: o.staff, orders: 0, rev: 0 });
      b.orders++; b.rev += (o.freight || 0);
    });
    const topStaffSales = Object.values(byStaff).sort((a, b) => b.rev - a.rev).slice(0, 5);

    return {
      todayOrders, todayRev, todayCod, monthOrders, monthRev, monthAov,
      activeOrders, doneToday, pendingDispatch,
      shippersLive, shipperBusy, shipperIdle, shipperOff,
      activeStaff, onDuty, onLeave, absent, totalSalary,
      monthCogs, grossProfit, grossMargin, monthAds, netProfit, netMargin,
      totalDebt, overdueDebt,
      adsSale, adsRecruit, adSpendSale, adSpendRecruit, adCusts, adCpc,
      topProducts, topStaffSales,
    };
  }

  function render() {
    const k = calcAll();

    /* === KPI strip 1: Vận hành + Sales hôm nay === */
    const ops = document.getElementById('kpisOps');
    if (ops) ops.innerHTML = `
      <div class="kpi k-1"><div class="kpi-label">Đơn hôm nay</div><div class="kpi-value">${k.todayOrders.length}</div><div class="kpi-trend">${k.doneToday.length} xong · ${k.activeOrders.length} đang giao</div><div class="kpi-icon">📦</div></div>
      <div class="kpi k-2"><div class="kpi-label">Doanh thu hôm nay</div><div class="kpi-value">${window.fmtShort(k.todayRev)}</div><div class="kpi-trend up">AOV ${window.fmtShort(k.todayOrders.length ? k.todayRev / k.todayOrders.length : 0)}/đơn</div><div class="kpi-icon">💰</div></div>
      <div class="kpi k-3"><div class="kpi-label">COD chưa thu</div><div class="kpi-value">${window.fmtShort(k.todayCod)}</div><div class="kpi-trend ${k.pendingDispatch?'down':''}">${k.pendingDispatch} đơn chưa gán shipper</div><div class="kpi-icon">⚠️</div></div>
      <div class="kpi k-4"><div class="kpi-label">🛵 Shipper đang giao</div><div class="kpi-value">${k.shipperBusy}</div><div class="kpi-trend">${k.shipperIdle} rảnh · ${k.shipperOff} nghỉ</div><div class="kpi-icon">🚛</div></div>
      <div class="kpi k-5"><div class="kpi-label">🧑‍💼 NV đi làm</div><div class="kpi-value">${k.onDuty}/${k.activeStaff.length}</div><div class="kpi-trend">${k.onLeave} phép · ${k.absent} vắng</div><div class="kpi-icon">✓</div></div>
    `;

    /* === KPI strip 2: Tài chính + Nhân sự + MKT tháng === */
    const fin = document.getElementById('kpisFin');
    if (fin) fin.innerHTML = `
      <div class="kpi k-1"><div class="kpi-label">💰 Doanh thu tháng</div><div class="kpi-value">${window.fmtShort(k.monthRev)}</div><div class="kpi-trend up">${k.monthOrders.length} đơn · AOV ${window.fmtShort(k.monthAov)}</div><div class="kpi-icon">💵</div></div>
      <div class="kpi k-2"><div class="kpi-label">📈 Lãi gộp tháng</div><div class="kpi-value">${window.fmtShort(k.grossProfit)}</div><div class="kpi-trend up">Biên ${k.grossMargin.toFixed(1)}% · COGS ${window.fmtShort(k.monthCogs)}</div><div class="kpi-icon">📊</div></div>
      <div class="kpi k-4"><div class="kpi-label">💎 Lãi ròng (− Ads − Lương)</div><div class="kpi-value" style="color:${k.netProfit >= 0 ? 'var(--ok)' : 'var(--danger)'}">${window.fmtShort(k.netProfit)}</div><div class="kpi-trend">Biên ${k.netMargin.toFixed(1)}% · Lương ${window.fmtShort(k.totalSalary)}</div><div class="kpi-icon">🏆</div></div>
      <div class="kpi k-3"><div class="kpi-label">📉 Công nợ phải thu</div><div class="kpi-value">${window.fmtShort(k.totalDebt)}</div><div class="kpi-trend down">${window.fmtShort(k.overdueDebt)} quá hạn</div><div class="kpi-icon">💸</div></div>
      <div class="kpi k-5"><div class="kpi-label">📣 Chi phí Ads tháng</div><div class="kpi-value">${window.fmtShort(k.monthAds)}</div><div class="kpi-trend">Bán hàng ${window.fmtShort(k.adSpendSale)} · TD ${window.fmtShort(k.adSpendRecruit)}</div><div class="kpi-icon">📲</div></div>
    `;

    /* === Recent orders === */
    const orders = (window.STORE.get('orders', window.ORDERS || []) || []).slice(0, 8);
    const rc = document.getElementById('recentOrders');
    if (rc) {
      rc.innerHTML = orders.map(o => {
        const c = window.avatarColor(o.code);
        const ini = window.initials(o.custName);
        const stLab = { delivered:'Đã giao', transit:'Đang giao', pickup:'Đang lấy', reconciled:'Đối soát', cancelled:'Hủy', returned:'Đã trả', confirmed:'Mới' }[o.status] || o.status;
        return `<div class="mini-row" onclick="window.location.href='orders.html'">
          <div class="av" style="background:${c}">${ini}</div>
          <div class="lbl">
            <div class="n1">${o.code} · ${o.custName}</div>
            <div class="n2">${(o.drop||'').split(',')[0]} · <span class="status-pill st-${o.status}">${stLab}</span></div>
          </div>
          <div class="v">${window.fmt(o.freight)} ₫</div>
        </div>`;
      }).join('') || `<div style="padding:30px;text-align:center;color:var(--muted)">Chưa có đơn hàng nào.</div>`;
    }

    /* === Shipper hôm nay === */
    const shTd = document.getElementById('shipperToday');
    if (shTd) {
      const ST = { busy: ['🚚 Đang giao', '#16A34A'], idle: ['🟡 Rảnh', '#A16207'], freelance: ['🤝 Sẵn sàng', '#7C3AED'], leave: ['🟠 Phép', '#C2410C'], absent: ['⚪ Vắng', '#B91C1C'], off: ['⏸ CN', 'var(--muted)'] };
      shTd.innerHTML = k.shippersLive.map(s => {
        const [lbl, col] = ST[s.code] || ['—', 'var(--muted)'];
        return `<div class="mini-row" onclick="window.location.href='shippers.html'">
          <div class="av" style="background:${window.avatarColor(s.name)};position:relative">${window.initials(s.name)}<span style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;background:${col};border:2px solid #fff"></span></div>
          <div class="lbl">
            <div class="n1">${s.name}</div>
            <div class="n2">${s.primaryPlate || ''} · ${s.activeCount ? `<b style="color:var(--ok)">${s.activeCount} đơn đang giao</b>` : 'không có đơn'}</div>
          </div>
          <div class="v" style="color:${col};font-size:11.5px">${lbl}</div>
        </div>`;
      }).join('') || `<div style="padding:20px;text-align:center;color:var(--muted)">Chưa có shipper.</div>`;
    }

    /* === Top SP === */
    const tp = document.getElementById('topProducts');
    if (tp) {
      tp.innerHTML = k.topProducts.map((p, i) => `<div class="mini-row" onclick="window.location.href='products.html'">
        <div style="font-weight:800;color:var(--muted);width:18px;text-align:center;font-size:12px">${i + 1}</div>
        <div style="font-size:18px">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🥬'}</div>
        <div class="lbl"><div class="n1">${p.name}</div><div class="n2">${window.fmt(p.qty)}kg đã bán</div></div>
        <div class="v">${window.fmt(p.rev)} ₫</div>
      </div>`).join('') || `<div style="padding:20px;text-align:center;color:var(--muted)">Chưa có dữ liệu.</div>`;
    }

    /* === Cảnh báo === */
    const customers = window.STORE.get('customers', []) || [];
    const overdueKH = customers.filter(c => (c.debtOverdue || 0) > 0).sort((a, b) => b.debtOverdue - a.debtOverdue);
    const alerts = [];
    overdueKH.slice(0, 2).forEach(c => alerts.push({ type: 'danger', icon: '🚨', title: c.name + ' — công nợ quá hạn', desc: window.fmt(c.debtOverdue) + ' ₫ quá hạn', href: 'debt.html' }));
    if (k.pendingDispatch) alerts.push({ type: 'warn', icon: '🛵', title: k.pendingDispatch + ' đơn mới chưa gán shipper', desc: 'Vào Đơn hàng phân công ngay', href: 'orders.html' });
    if (k.netProfit < 0) alerts.push({ type: 'danger', icon: '📉', title: 'Lãi ròng tháng đang ÂM', desc: window.fmt(k.netProfit) + ' ₫ · cần review chi phí Ads/Lương', href: 'reports.html' });
    if (k.adCpc > 100000) alerts.push({ type: 'warn', icon: '📣', title: 'Cost/KH Ads cao bất thường', desc: window.fmt(k.adCpc) + ' ₫/KH (nên < 100k)', href: 'adspend.html' });
    const al = document.getElementById('alerts');
    if (al) {
      al.innerHTML = alerts.map(a => `<div class="alert-row ${a.type}" onclick="window.location.href='${a.href}'">
        <div class="ic">${a.icon}</div>
        <div class="lbl"><div><b>${a.title}</b></div><div class="n2">${a.desc}</div></div>
        <span style="font-size:14px;color:var(--muted)">›</span>
      </div>`).join('') || `<div style="padding:30px;text-align:center;color:var(--ok);font-size:13px">✓ Không có cảnh báo. Mọi thứ ổn định.</div>`;
    }

    /* === Top KH === */
    const topCust = [...customers].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const tc = document.getElementById('topCust');
    if (tc) {
      tc.innerHTML = topCust.map((c, i) => {
        const col = window.avatarColor(c.id);
        const ini = window.initials(c.name);
        const groupTag = c.group === 'VIP' ? 'tag-vip' : c.group === 'Mới' ? 'tag-moi' : 'tag-thuong';
        return `<div class="mini-row" onclick="window.location.href='customers.html'">
          <div style="font-weight:800;color:var(--muted);width:18px;text-align:center;font-size:12px">${i + 1}</div>
          <div class="av" style="background:${col}">${ini}</div>
          <div class="lbl"><div class="n1">${c.name}</div><div class="n2">${c.code} · <span class="tag ${groupTag}">${c.group}</span></div></div>
          <div class="v">${window.fmtShort(c.revenue)}</div>
        </div>`;
      }).join('') || `<div style="padding:20px;text-align:center;color:var(--muted)">Chưa có dữ liệu.</div>`;
    }

    /* === Top NV bán hàng === */
    const ts = document.getElementById('topStaff');
    if (ts) {
      ts.innerHTML = k.topStaffSales.map((s, i) => `<div class="mini-row" onclick="window.location.href='reports.html'">
        <div style="font-weight:800;color:var(--muted);width:18px;text-align:center;font-size:12px">${i + 1}</div>
        <div class="av" style="background:${window.avatarColor(s.name)}">${window.initials(s.name)}</div>
        <div class="lbl"><div class="n1">${s.name}</div><div class="n2">${s.orders} đơn tháng này</div></div>
        <div class="v">${window.fmtShort(s.rev)}</div>
      </div>`).join('') || `<div style="padding:20px;text-align:center;color:var(--muted)">Chưa có dữ liệu.</div>`;
    }

    /* === Marketing summary === */
    const mkt = document.getElementById('mktSummary');
    if (mkt) {
      const totAds = k.adSpendSale + k.adSpendRecruit;
      const pctSale = totAds ? Math.round(k.adSpendSale / totAds * 100) : 0;
      mkt.innerHTML = `
        <div style="padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="padding:10px;background:#F0FDF4;border-radius:7px;border-left:3px solid var(--ok)">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">🛒 Bán hàng</div>
            <div style="font-size:18px;font-weight:800;color:var(--ok)">${window.fmtShort(k.adSpendSale)}</div>
            <div style="font-size:11px;color:var(--muted)">${k.adsSale.length} chiến dịch · ${pctSale}%</div>
          </div>
          <div style="padding:10px;background:#F5F3FF;border-radius:7px;border-left:3px solid #7C3AED">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">👥 Tuyển dụng</div>
            <div style="font-size:18px;font-weight:800;color:#7C3AED">${window.fmtShort(k.adSpendRecruit)}</div>
            <div style="font-size:11px;color:var(--muted)">${k.adsRecruit.length} chiến dịch · ${100-pctSale}%</div>
          </div>
        </div>
        <div style="padding:10px 14px;border-top:1px solid #F1F3F5;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:12px;color:var(--muted)">KH từ Ads bán hàng: <b style="color:var(--navy)">${k.adCusts}</b></div>
          <div style="font-size:12px;color:var(--muted)">Cost/KH: <b style="color:${k.adCpc>100000?'var(--danger)':'var(--ok)'}">${window.fmt(k.adCpc)} ₫</b></div>
        </div>`;
    }
  }

  /* === Revenue chart 7 ngày === */
  function renderChart() {
    const orders = window.STORE.get('orders', window.ORDERS || []) || [];
    const days = [];
    const today = window.todayDate();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const vi = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      const rev = orders.filter(o => (o.date || '').startsWith(vi) && o.status !== 'cancelled').reduce((s, o) => s + (o.freight || 0), 0);
      days.push({ d: i === 0 ? 'Hôm nay' : (d.getDate() + '/' + (d.getMonth() + 1)), v: rev });
    }
    const chart = document.getElementById('revChart');
    if (!chart) return;
    const max = Math.max(1, ...days.map(x => x.v));
    chart.innerHTML = days.map((d, i) => {
      const h = Math.max(8, (d.v / max) * 180);
      const isToday = i === days.length - 1;
      return `<div class="chart-bar" style="height:${h}px;${isToday ? 'background:linear-gradient(180deg,#E8A33D 0%,#B45309 100%)' : ''}" title="${window.fmtVND(d.v)}">
        <div class="v">${window.fmtShort(d.v)}</div>
        <div class="x">${d.d}</div>
      </div>`;
    }).join('');
  }

  /* Subscribe data changes */
  ['orders', 'customers', 'staff', 'drivers', 'timesheet', 'adspend', 'products'].forEach(k => window.STORE.subscribe(k, render));

  /* Init */
  window.renderAppShell('dashboard', 'Dashboard');
  render();
  renderChart();

  /* Welcome banner — real data + thời gian thật + tên user thật */
  function renderWelcome() {
    const k = calcAll();
    const user = window.CURRENT_USER || {};
    const now = new Date();
    const h = now.getHours();
    const greet = h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    const dayName = ['CN','T2','T3','T4','T5','T6','T7'][window.todayDate().getDay()];
    const dayLabel = dayName === 'CN' ? 'Chủ Nhật' : 'thứ ' + dayName.slice(1);
    /* Đếm cảnh báo */
    let alerts = 0;
    const custs = window.STORE.get('customers', []) || [];
    if (custs.filter(c => (c.debtOverdue||0) > 0).length) alerts++;
    if (k.pendingDispatch) alerts++;
    if (k.netProfit < 0) alerts++;
    if (k.adCpc > 100000) alerts++;

    const g = document.getElementById('welGreet'); if (g) g.textContent = greet;
    const n = document.getElementById('welName');
    if (n) n.innerHTML = `${user.name || 'Bạn'} 👋 ${window.helpTip ? window.helpTip('Tên hiển thị lấy từ tài khoản đang đăng nhập. Thay trong Cài đặt → Bảo mật.') : ''}`;
    const s = document.getElementById('welSub');
    if (s) s.innerHTML = `Hôm nay <b>${dayLabel}, ${TODAY_VI}</b> · <b>${k.todayOrders.length} đơn mới</b>, <b>${k.activeOrders.length} đơn đang giao</b>, <b style="color:${alerts ? '#FFD9A1' : '#A7F3D0'}">${alerts} cảnh báo</b> cần xử lý`;
  }
  setTimeout(renderWelcome, 100);
  ['orders','customers','adspend'].forEach(k => window.STORE.subscribe(k, renderWelcome));
})();
