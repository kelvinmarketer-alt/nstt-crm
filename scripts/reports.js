/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Báo cáo (Filter động + Export)
   ========================================================= */
(function () {
  /* === FILTER STATE === */
  let filters = window.STORE.get('reportFilters', {
    dateRange: 'month',
    from: null, to: null,
    custs: [], svcs: [], modes: [], staff: [], vehTypes: [], statuses: [],
    metrics: ['revenue','orders','aov','cust']
  });

  /* === Filter panel UI === */
  window.toggleFilterPanel = function() {
    const panel = document.getElementById('filterPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') populateFilterOptions();
  };

  function populateFilterOptions() {
    const custs = window.STORE.get('customers', window.CUSTOMERS || []);
    document.getElementById('filCust').innerHTML =
      custs.map(c => `<option value="${c.id}">${c.code} · ${c.name}</option>`).join('');
    document.getElementById('filSvc').innerHTML =
      window.MD.get('services').map(s => `<option value="${s.id}">${s.icon} ${s.label}</option>`).join('');
    document.getElementById('filMode').innerHTML =
      window.MD.get('transportModes').map(m => `<option value="${m.id}">${m.icon} ${m.label}</option>`).join('');
  }

  window.onDateRangeChange = function() {
    const v = document.getElementById('filDateRange').value;
    document.getElementById('customDateWrap').style.display = v === 'custom' ? '' : 'none';
  };

  window.applyFilters = function() {
    filters = {
      dateRange: document.getElementById('filDateRange').value,
      from: document.getElementById('filFrom').value,
      to: document.getElementById('filTo').value,
      custs: Array.from(document.getElementById('filCust').selectedOptions).map(o => o.value).filter(Boolean),
      svcs: Array.from(document.getElementById('filSvc').selectedOptions).map(o => o.value),
      modes: Array.from(document.getElementById('filMode').selectedOptions).map(o => o.value),
      staff: Array.from(document.getElementById('filStaff').selectedOptions).map(o => o.value),
      statuses: Array.from(document.getElementById('filStatus').selectedOptions).map(o => o.value),
      metrics: Object.keys(METRIC_LABEL).filter(k => document.getElementById('m_' + k)?.checked),
    };
    window.STORE.set('reportFilters', filters);

    /* Hiện badge filter */
    const desc = describeFilters(filters);
    document.getElementById('filterDesc').textContent = desc;
    document.getElementById('activeFilterBadge').style.display = desc ? 'block' : 'none';
    document.getElementById('filterSummary').textContent = desc || 'Không có lọc nào';

    /* Recalc + redraw */
    recalculate();
    window.toast('🔍 Đã áp dụng bộ lọc: ' + desc, 'info');
  };

  window.resetFilters = function() {
    window.STORE.reset('reportFilters');
    filters = {
      dateRange: 'month', from: null, to: null,
      custs: [], svcs: [], modes: [], staff: [], vehTypes: [], statuses: [],
      metrics: ['revenue','orders','aov','cust']
    };
    document.getElementById('activeFilterBadge').style.display = 'none';
    recalculate();
    if (document.getElementById('filterPanel').style.display !== 'none') populateFilterOptions();
    window.toast('↺ Đã reset bộ lọc', 'info');
  };

  window.savePreset = function() {
    const name = prompt('Đặt tên preset (VD: "Báo cáo tháng - KH VIP"):');
    if (!name) return;
    const presets = window.STORE.get('reportPresets', []);
    presets.push({ name, savedAt: new Date().toLocaleString('vi-VN'), filters: {...filters} });
    window.STORE.set('reportPresets', presets);
    window.toast('💾 Đã lưu preset "' + name + '"', 'success');
  };

  const METRIC_LABEL = {
    revenue:'Doanh thu', orders:'Số đơn', aov:'Giá trị đơn TB',
    cust:'Số KH'
  };

  function describeFilters(f) {
    const parts = [];
    const dateLabels = {today:'Hôm nay', yesterday:'Hôm qua', week:'Tuần này', month:'Tháng này',
                       lastMonth:'Tháng trước', quarter:'Quý này', year:'Năm 2026', custom:'Tùy chỉnh'};
    if (f.dateRange) parts.push('📅 ' + dateLabels[f.dateRange]);
    if (f.custs.length) parts.push('👥 ' + f.custs.length + ' KH');
    if (f.svcs.length) parts.push('🚚 ' + f.svcs.length + ' DV');
    if (f.modes.length) parts.push('🛣 ' + f.modes.length + ' PT');
    if (f.staff.length) parts.push('👤 ' + f.staff.length + ' NV');
    if (f.vehTypes.length) parts.push('🚛 ' + f.vehTypes.length + ' loại xe');
    if (f.statuses.length) parts.push('🚥 ' + f.statuses.length + ' trạng thái');
    return parts.join(' · ');
  }

  /* === Recalculate KPIs từ filter === */
  function recalculate() {
    const orders = window.STORE.get('orders', window.ORDERS || []);
    const filtered = orders.filter(o => {
      if (filters.custs.length && !filters.custs.includes(o.cust)) return false;
      if (filters.svcs.length && !filters.svcs.includes(o.serviceType)) return false;
      if (filters.modes.length && o.transportMode && !filters.modes.includes(o.transportMode)) return false;
      if (filters.staff.length && !filters.staff.includes(o.staff)) return false;
      if (filters.statuses.length && !filters.statuses.includes(o.status)) return false;
      return true;
    });

    const total = filtered.reduce((s,o)=>s+(o.freight||0),0);
    const aov = filtered.length ? total/filtered.length : 0;
    const custIds = new Set(filtered.map(o => o.cust)); const custCount = custIds.size;
    const routes = {};
    filtered.forEach(o => {
      const r = (o.pickup||'').split(',')[0] + ' → ' + (o.drop||'').split(',')[0];
      routes[r] = (routes[r]||0) + 1;
    });
    const topRoutes = Object.entries(routes).sort((a,b)=>b[1]-a[1]).slice(0,5);

    /* Update KPI strip Doanh thu */
    const kpiEl = document.querySelector('#paneRevenue .kpis');
    if (kpiEl && filters.metrics) {
      const metricCards = [];
      if (filters.metrics.includes('revenue'))
        metricCards.push(`<div class="kpi k-1"><div class="kpi-label">Doanh thu (lọc)</div><div class="kpi-value">${window.fmtShort(total)}</div><div class="kpi-trend">${filtered.length} đơn</div><div class="kpi-icon">💰</div></div>`);
      if (filters.metrics.includes('orders'))
        metricCards.push(`<div class="kpi k-2"><div class="kpi-label">Số đơn</div><div class="kpi-value">${filtered.length}</div><div class="kpi-trend">/${orders.length} tổng</div><div class="kpi-icon">📦</div></div>`);
      if (filters.metrics.includes('aov'))
        metricCards.push(`<div class="kpi k-4"><div class="kpi-label">AOV</div><div class="kpi-value">${window.fmtShort(aov)}</div><div class="kpi-trend">/đơn TB</div><div class="kpi-icon">🧮</div></div>`);
      if (filters.metrics.includes('cust'))
        metricCards.push(`<div class="kpi k-5"><div class="kpi-label">Số KH (lọc)</div><div class="kpi-value">${custCount}</div><div class="kpi-trend">khác nhau</div><div class="kpi-icon">👥</div></div>`);
      kpiEl.innerHTML = metricCards.join('') || '<div style="padding:20px;color:var(--muted)">Chọn ít nhất 1 chỉ số trong filter</div>';
    }

    /* Update top routes nếu được chọn */
    if (filters.metrics.includes('route')) {
      const routesTable = document.querySelector('#paneRoutes table tbody');
      if (routesTable && topRoutes.length) {
        routesTable.innerHTML = topRoutes.map(([r, count], i) => {
          const ordersOnRoute = filtered.filter(o => (o.pickup||'').split(',')[0] + ' → ' + (o.drop||'').split(',')[0] === r);
          const rev = ordersOnRoute.reduce((s,o)=>s+(o.freight||0),0);
          return `<tr><td><b>${r}</b></td><td class="num">${count}</td><td class="num">${window.fmtShort(rev)} ₫</td><td class="num">${window.fmtShort(rev*0.65)} ₫</td><td class="num" style="color:var(--ok)"><b>65%</b></td></tr>`;
        }).join('');
      }
    }
  }

  /* 12-month revenue bar chart — compute từ orders thật */
  function renderChart() {
    const orders = window.STORE.get('orders', window.ORDERS || []);
    const today = window.todayDate();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const yy = d.getFullYear(), mm = d.getMonth() + 1;
      const v = orders.filter(o => {
        if (o.status === 'cancelled') return false;
        const m = (o.date || '').match(/(\d+)\/(\d+)\/(\d+)/);
        return m && +m[2] === mm && +m[3] === yy;
      }).reduce((s, o) => s + (o.freight || 0), 0);
      months.push({ m: 'T' + mm + '/' + String(yy).slice(2), v });
    }
    const max = Math.max(1, ...months.map(x => x.v));
    document.getElementById('chartRev').innerHTML = months.map((d, i) => {
      const h = Math.max(8, (d.v / max) * 160);
      const cur = i === months.length - 1;
      return `<div class="bar" style="height:${h}px;background:${cur ? 'var(--red)' : 'var(--navy)'}" title="${window.fmtVND(d.v)}">
        <div class="v">${window.fmtShort(d.v)}</div>
        <div class="x">${d.m}</div>
      </div>`;
    }).join('');
  }

  window.switchTab = function(e, k) {
    document.querySelectorAll('.rpt-tab').forEach(t => { t.classList.remove('active'); t.style.background = ''; t.style.color = ''; });
    e.target.classList.add('active');
    /* Overview tab giữ style xanh đậm khi active */
    if (k === 'overview') { e.target.style.background = '#1B5E20'; e.target.style.color = '#fff'; }
    ['Overview','Revenue','Profit','Customers','Sales','Debt','Daily','Forecast','Variance'].forEach(p => {
      const el = document.getElementById('pane' + p);
      if (el) el.style.display = (p.toLowerCase() === k) ? 'block' : 'none';
    });
    if (k === 'overview') renderOverview();
    if (k === 'debt') renderDebtReport();
    if (k === 'sales') renderSalesReport();
    if (k === 'daily') renderDailyReport();
    if (k === 'profit') renderProfitReport();
    if (k === 'forecast') renderForecast();
    if (k === 'variance') renderVariance();
  };

  /* ============ FORECAST + COHORT ============ */
  function renderForecast() {
    if (!window.Forecasting) return;
    const hb = document.getElementById('hbFcHost');
    if (hb && window.helpBanner) hb.innerHTML = window.helpBanner(
      '🔮 Dự báo & Cohort',
      'Dự báo dùng <b>linear regression</b> trên doanh thu 12 tháng gần nhất. Không chính xác 100% nhưng đủ để lên kế hoạch (tồn kho, tuyển NV). <b>Cohort</b> = phân nhóm KH theo tháng đầu đặt, xem % còn quay lại các tháng sau — đo độ trung thành.',
      {id:'hb-fc', icon:'🔮'}
    );
    document.getElementById('hbFc1').innerHTML = window.helpTip ? window.helpTip('Mô hình tuyến tính đơn giản — tốt khi xu hướng ổn định, kém khi có mùa vụ mạnh.') : '';
    document.getElementById('hbFc2').innerHTML = window.helpTip ? window.helpTip('Hàng KH = nhóm theo tháng đặt đầu tiên. Cột = tháng sau đó. Số = % KH còn active.') : '';

    /* Dự báo */
    const { labels, values } = window.Forecasting.monthlyRevSeries();
    const forecast = window.Forecasting.linearNext(values, 3);
    const all = [...values, ...forecast];
    const allLabels = [...labels];
    /* Generate forecast labels */
    if (labels.length) {
      const last = labels[labels.length-1].split('-').map(Number);
      let y = last[0], m = last[1];
      for (let i = 0; i < 3; i++) {
        m++; if (m > 12) { m = 1; y++; }
        allLabels.push(`${y}-${String(m).padStart(2,'0')}`);
      }
    }
    const max = Math.max(1, ...all);
    document.getElementById('fcChart').innerHTML = all.map((v, i) => {
      const isForecast = i >= values.length;
      const h = Math.max(8, (v/max) * 160);
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;position:relative">
        <div style="font-size:9.5px;color:var(--muted);font-weight:600">${window.fmtShort(v)}</div>
        <div style="width:100%;height:${h}px;background:${isForecast ? 'repeating-linear-gradient(45deg,#F59E0B,#F59E0B 4px,#FCD34D 4px,#FCD34D 8px)' : 'linear-gradient(180deg,#16A34A,#1B5E20)'};border-radius:5px 5px 0 0" title="${allLabels[i]}: ${window.fmt(v)}"></div>
        <div style="font-size:9.5px;color:${isForecast?'#92400E':'var(--muted)'};font-weight:${isForecast?700:500}">${allLabels[i].slice(5)}/${allLabels[i].slice(2,4)}</div>
      </div>`;
    }).join('');
    const avgGrowth = values.length > 1 ? ((forecast[2] / values[values.length-1] - 1) * 100).toFixed(1) : 0;
    document.getElementById('fcSummary').innerHTML = `
      <b>📊 Tóm tắt:</b> 12 tháng qua DT trung bình <b>${window.fmtShort(values.reduce((a,b)=>a+b,0)/values.length)}/tháng</b>.
      Dự báo 3 tháng tới: ${forecast.map((v,i)=>`<b style="color:#92400E">${window.fmtShort(v)}</b>`).join(' → ')}.
      Tăng trưởng dự kiến: <b style="color:${avgGrowth>=0?'var(--ok)':'var(--danger)'}">${avgGrowth>=0?'+':''}${avgGrowth}%</b>.
    `;

    /* Cohort */
    const matrix = window.Cohort.byMonth();
    let tbl = `<table style="width:100%;border-collapse:collapse;font-size:11.5px">
      <thead><tr style="background:#FAFBFC"><th style="padding:6px;text-align:left;font-size:10px;color:var(--muted)">Cohort</th><th style="padding:6px;text-align:right;font-size:10px;color:var(--muted)">Size</th>${[0,1,2,3,4,5].map(i=>`<th style="padding:6px;text-align:right;font-size:10px;color:var(--muted)">M+${i}</th>`).join('')}</tr></thead><tbody>`;
    matrix.forEach(row => {
      tbl += `<tr style="border-top:1px solid #F1F5F9"><td style="padding:6px;font-weight:600">${row.cohort}</td><td style="padding:6px;text-align:right;color:var(--muted)">${row.size}</td>`;
      row.months.forEach((v,i) => {
        if (v === null) { tbl += `<td style="padding:6px"></td>`; return; }
        const intensity = v / 100;
        const bg = `rgba(22,163,74,${0.1 + intensity*0.7})`;
        const fg = intensity > 0.5 ? '#fff' : '#0F172A';
        tbl += `<td style="padding:6px;text-align:right;background:${bg};color:${fg};font-weight:${i===0?700:500}">${v}%</td>`;
      });
      tbl += `</tr>`;
    });
    tbl += `</tbody></table>`;
    document.getElementById('cohortTbl').innerHTML = tbl || '<div style="padding:20px;color:var(--muted)">Chưa đủ data</div>';
  }

  /* ============ VARIANCE — Plan vs Actual ============ */
  function renderVariance() {
    if (!window.Variance) return;
    const hb = document.getElementById('hbVrHost');
    if (hb && window.helpBanner) hb.innerHTML = window.helpBanner(
      '📊 Plan vs Actual',
      'So sánh thực tế (Actual) với mục tiêu/ngân sách (Budget) đã đặt đầu tháng. Giúp sếp thấy ngay <b>vượt/thiếu</b> ở từng chỉ số — phân tích nguyên nhân để hiệu chỉnh.',
      {id:'hb-vr', icon:'📊'}
    );
    const rows = window.Variance.compare();
    let html = `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#FAFBFC">
        <th style="text-align:left;padding:12px;font-size:11px;color:var(--muted);text-transform:uppercase">Chỉ số</th>
        <th style="text-align:right;padding:12px;font-size:11px;color:var(--muted);text-transform:uppercase">Budget ${window.helpTip ? window.helpTip('Ngân sách / mục tiêu đặt đầu tháng.') : ''}</th>
        <th style="text-align:right;padding:12px;font-size:11px;color:var(--muted);text-transform:uppercase">Actual ${window.helpTip ? window.helpTip('Số thực tế đến hôm nay.') : ''}</th>
        <th style="text-align:right;padding:12px;font-size:11px;color:var(--muted);text-transform:uppercase">Chênh lệch</th>
        <th style="padding:12px;font-size:11px;color:var(--muted);text-transform:uppercase">Đánh giá</th>
      </tr></thead><tbody>`;
    rows.forEach(r => {
      const diff = r.actual - r.budget;
      const pct = r.budget ? (diff / r.budget * 100) : 0;
      const isGood = r.higherIsBetter ? diff >= 0 : diff <= 0;
      const verdict = isGood ? '✓ Tốt' : '⚠ Cần chú ý';
      const color = isGood ? '#16A34A' : '#DC2626';
      html += `<tr style="border-top:1px solid #F1F5F9">
        <td style="padding:12px;font-weight:600">${r.label}</td>
        <td style="text-align:right;padding:12px;color:var(--muted)">${window.fmt(r.budget)} ₫</td>
        <td style="text-align:right;padding:12px;font-weight:700">${window.fmt(r.actual)} ₫</td>
        <td style="text-align:right;padding:12px;color:${color};font-weight:700">${diff>=0?'+':''}${window.fmt(diff)} (${pct>=0?'+':''}${pct.toFixed(1)}%)</td>
        <td style="padding:12px;color:${color};font-weight:700">${verdict}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    document.getElementById('varianceTbl').innerHTML = html;
  }

  window.openBudgetModal = function() {
    const b = window.Variance.getBudget();
    window.openModal('⚙️ Cấu hình Budget T5/2026', `
      <div style="background:#EFF6FF;color:#1E40AF;padding:9px 12px;border-radius:7px;font-size:12px;margin-bottom:12px">
        💡 Đặt mục tiêu tháng. Tab "Plan vs Actual" sẽ so với số thực tế và đánh giá tốt/cần chú ý.
      </div>
      <label style="font-size:12px;color:var(--muted)">🎯 DT mục tiêu (₫)</label>
      <input id="bg_rev" type="number" value="${b.monthlyRevTarget}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:8px;margin-bottom:8px">
      <label style="font-size:12px;color:var(--muted)">📦 COGS budget (₫)</label>
      <input id="bg_cogs" type="number" value="${b.monthlyCogsBudget}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:8px;margin-bottom:8px">
      <label style="font-size:12px;color:var(--muted)">📣 Ads budget (₫)</label>
      <input id="bg_ads" type="number" value="${b.monthlyAdsBudget}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:8px;margin-bottom:8px">
      <label style="font-size:12px;color:var(--muted)">💼 Lương budget (₫)</label>
      <input id="bg_sal" type="number" value="${b.monthlySalaryBudget}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:8px">
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window._bgSave()">Lưu Budget</button>`,
      width: '420px',
    });
  };
  window._bgSave = function() {
    window.Variance.setBudget({
      monthlyRevTarget:   parseInt(document.getElementById('bg_rev').value) || 0,
      monthlyCogsBudget:  parseInt(document.getElementById('bg_cogs').value) || 0,
      monthlyAdsBudget:   parseInt(document.getElementById('bg_ads').value) || 0,
      monthlySalaryBudget: parseInt(document.getElementById('bg_sal').value) || 0,
    });
    window.toast('✓ Đã lưu Budget','success');
    window.closeModal();
    renderVariance();
  };


  /* === BÁO CÁO HÔM NAY (doanh thu + công nợ + chi phí ads) === */
  const DAILY_VI = window.todayVN();     // "hôm nay" demo (khớp dashboard)
  const DAILY_ISO = window.todayISO();
  function dailyData() {
    const orders = window.STORE.get('orders', window.ORDERS || []);
    const customers = window.STORE.get('customers', window.CUSTOMERS || []);
    const ads = window.STORE.get('adspend', window.ADSPEND || []);
    const todayOrders = orders.filter(o => (o.date || '').startsWith(DAILY_VI) && o.status !== 'cancelled');
    const revenue = todayOrders.reduce((s, o) => s + (o.freight || 0), 0);
    const cod = todayOrders.reduce((s, o) => s + (o.cod || 0), 0);
    const debt = customers.reduce((s, c) => s + (c.debt || 0), 0);
    const overdue = customers.reduce((s, c) => s + (c.debtOverdue || 0), 0);
    const todayAds = ads.filter(a => a.date === DAILY_ISO);
    const adSpend = todayAds.reduce((s, a) => s + (a.spend || 0), 0);
    return { todayOrders, revenue, cod, debt, overdue, todayAds, adSpend };
  }

  function renderDailyReport() {
    const d = dailyData();
    document.getElementById('dailyTitle').textContent = `Báo cáo vận hành ngày ${DAILY_VI}`;
    document.getElementById('dailyKpis').innerHTML = `
      <div class="kpi k-1"><div class="kpi-label">Doanh thu hôm nay</div><div class="kpi-value">${window.fmtShort(d.revenue)}</div><div class="kpi-trend">${d.todayOrders.length} đơn</div><div class="kpi-icon">💰</div></div>
      <div class="kpi k-3"><div class="kpi-label">COD thu hộ</div><div class="kpi-value">${window.fmtShort(d.cod)}</div><div class="kpi-trend">trong ngày</div><div class="kpi-icon">💵</div></div>
      <div class="kpi k-2"><div class="kpi-label">Công nợ phải thu</div><div class="kpi-value">${window.fmtShort(d.debt)}</div><div class="kpi-trend down">quá hạn ${window.fmtShort(d.overdue)}</div><div class="kpi-icon">📉</div></div>
      <div class="kpi k-4"><div class="kpi-label">Chi phí Ads hôm nay</div><div class="kpi-value">${window.fmtShort(d.adSpend)}</div><div class="kpi-trend">${d.todayAds.length} chiến dịch</div><div class="kpi-icon">📣</div></div>
      <div class="kpi k-5"><div class="kpi-label">Lãi gộp tạm tính</div><div class="kpi-value">${window.fmtShort(d.revenue - d.adSpend)}</div><div class="kpi-trend">DT − Ads</div><div class="kpi-icon">🧮</div></div>`;

    document.getElementById('dailyOrders').innerHTML = d.todayOrders.length
      ? `<table class="mini-table"><thead><tr><th>Mã</th><th>Khách</th><th class="num">Tiền hàng</th><th>TT</th></tr></thead><tbody>${d.todayOrders.map(o => `<tr><td><b>${o.code}</b></td><td>${o.custName}</td><td class="num">${window.fmt(o.freight)}</td><td><span class="status-pill st-${o.status}">${o.status}</span></td></tr>`).join('')}</tbody></table>`
      : `<div style="padding:18px;text-align:center;color:var(--muted)">Chưa có đơn hôm nay.</div>`;

    const CH = window.AD_CHANNELS || [];
    document.getElementById('dailyAds').innerHTML = d.todayAds.length
      ? `<table class="mini-table"><thead><tr><th>Kênh</th><th>Mục đích</th><th class="num">Chi tiêu</th><th class="num">KQ</th></tr></thead><tbody>${d.todayAds.map(a => {
          const ch = CH.find(c => c.id === a.channel) || { label: a.channel, icon: '📣' };
          const obj = (window.AD_OBJECTIVES || []).find(o => o.id === a.objective) || { label: a.objective };
          const res = a.objective === 'tuyen-dung' ? (a.candidates + ' UV') : (a.custs + ' KH');
          return `<tr><td>${ch.icon} ${ch.label}</td><td style="font-size:12px">${obj.label}</td><td class="num">${window.fmt(a.spend)}</td><td class="num">${res}</td></tr>`;
        }).join('')}</tbody></table>`
      : `<div style="padding:18px;text-align:center;color:var(--muted)">Chưa nhập chi phí ads hôm nay.</div>`;
  }

  window.sendDailyReport = async function () {
    /* Dùng builder customizable + multi-channel routing ('daily_report' purpose) */
    const built = window.buildDailyReport({ dateVi: DAILY_VI, dateIso: DAILY_ISO });
    const msg = built.text;
    try { await navigator.clipboard.writeText(msg); } catch (e) {}
    const result = await window.sendTgMessage('daily_report', msg);
    if (result.ok) {
      window.toast(`✓ Đã gửi báo cáo → ${result.channel || 'Telegram'} + copy clipboard`, 'success');
    } else if (result.error.includes('Chưa cấu hình')) {
      window.openModal('📊 Báo cáo ngày ' + DAILY_VI, `
        <p style="font-size:13px;color:var(--muted);margin-bottom:8px">Đã copy — dán vào Zalo/nhóm. Cấu hình Telegram ở Cài đặt → Telegram Bot để gửi tự động.</p>
        <textarea rows="9" style="width:100%;font-family:ui-monospace,monospace;font-size:12px;padding:10px;border:1px solid var(--line);border-radius:8px">${msg}</textarea>
      `, { footer: `<button class="btn btn-primary" onclick="closeModal()">Đóng</button>`, width: '520px' });
    } else {
      window.toast('Telegram lỗi (' + result.error + ') — đã copy clipboard', 'warn');
    }
  };

  /* === HIỆU QUẢ NHÂN VIÊN KINH DOANH === */
  function renderSalesReport() {
    const orders = window.STORE.get('orders', window.ORDERS || []);
    const customers = window.STORE.get('customers', window.CUSTOMERS || []);
    const byStaff = {};
    orders.forEach(o => {
      if (o.status === 'cancelled') return;
      const k = o.staff || 'Khác';
      const b = byStaff[k] || (byStaff[k] = { orders: 0, rev: 0, custs: new Set() });
      b.orders++; b.rev += (o.freight || 0); if (o.cust) b.custs.add(o.cust);
    });
    const debtByStaff = {};
    customers.forEach(c => { const k = c.staffOwner || 'Khác'; debtByStaff[k] = (debtByStaff[k] || 0) + (c.debt || 0); });
    const rows = Object.entries(byStaff).sort((a, b) => b[1].rev - a[1].rev);
    const totalRev = rows.reduce((s, [, d]) => s + d.rev, 0);
    const totalOrders = rows.reduce((s, [, d]) => s + d.orders, 0);
    const best = rows[0];

    const kp = document.getElementById('salesKpis');
    if (kp) kp.innerHTML = `
      <div class="kpi k-1"><div class="kpi-label">Tổng doanh thu</div><div class="kpi-value">${window.fmtShort(totalRev)}</div><div class="kpi-trend">${totalOrders} đơn · ${rows.length} NV</div><div class="kpi-icon">💰</div></div>
      <div class="kpi k-2"><div class="kpi-label">NV bán tốt nhất</div><div class="kpi-value" style="font-size:17px">${best ? best[0] : '—'}</div><div class="kpi-trend up">${best ? window.fmtShort(best[1].rev) + ' ₫' : ''}</div><div class="kpi-icon">🏆</div></div>
      <div class="kpi k-4"><div class="kpi-label">DT TB / NV</div><div class="kpi-value">${window.fmtShort(rows.length ? totalRev / rows.length : 0)}</div><div class="kpi-trend">bình quân</div><div class="kpi-icon">🧮</div></div>
      <div class="kpi k-3"><div class="kpi-label">Đơn TB / NV</div><div class="kpi-value">${rows.length ? Math.round(totalOrders / rows.length) : 0}</div><div class="kpi-trend">đơn</div><div class="kpi-icon">📦</div></div>`;

    const body = document.getElementById('salesBody');
    if (body) body.innerHTML = rows.map(([name, d], i) => {
      const pct = totalRev ? Math.round(d.rev / totalRev * 100) : 0;
      const debt = debtByStaff[name] || 0;
      const aov = d.orders ? d.rev / d.orders : 0;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      return `<tr>
        <td class="num">${medal}</td>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div class="av" style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:11px;font-weight:700;background:${window.avatarColor(name)}">${window.initials(name)}</div>
          <b>${name}</b></div></td>
        <td class="num">${d.orders}</td>
        <td class="num"><b>${window.fmtShort(d.rev)}</b></td>
        <td class="num">${pct}%</td>
        <td class="num">${d.custs.size}</td>
        <td class="num" style="color:${debt > 0 ? 'var(--danger)' : 'var(--muted)'}">${debt > 0 ? window.fmtShort(debt) : '—'}</td>
        <td class="num">${window.fmtShort(aov)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--muted)">Chưa có dữ liệu.</td></tr>`;
  }

  /* === DEBT REPORT === */
  function overdueDays(c) {
    if (c.id === 'KH003') return 35;
    if (c.id === 'KH008') return 65;
    return 0;
  }

  function renderDebtReport() {
    const customers = window.STORE.get('customers', window.CUSTOMERS || []);
    const debtors = customers.filter(c => c.debt > 0).map(c => ({...c, overdue: overdueDays(c)}));
    const cashEntries = window.STORE.get('cashEntries', []);
    const recentReceipts = cashEntries.filter(e =>
      e.type === 'in' && (e.desc||'').toLowerCase().includes('công nợ')
    );
    const collected = recentReceipts.reduce((s,e) => s+e.amount, 0);

    /* Aging buckets */
    const buckets = { '0-30':[], '31-60':[], '61-90':[], '91+':[], 'baddebt':[] };
    debtors.forEach(c => {
      if (c.overdue === 0) buckets['0-30'].push(c);
      else if (c.overdue <= 60) buckets['31-60'].push(c);
      else if (c.overdue <= 90) buckets['61-90'].push(c);
      else buckets['91+'].push(c);
    });
    const totalDebt = debtors.reduce((s,c) => s+c.debt, 0);
    const totalOverdue = debtors.filter(c => c.overdue > 0).reduce((s,c) => s+c.debt, 0);
    const overdueCount = debtors.filter(c => c.overdue > 0).length;

    /* KPI */
    document.getElementById('rDebtTotal').textContent = window.fmtShort(totalDebt);
    document.getElementById('rDebtCustCount').textContent = debtors.length + ' KH đang nợ';
    document.getElementById('rDebtOverdue').textContent = window.fmtShort(totalOverdue);
    document.getElementById('rDebtOverdueCount').textContent = overdueCount + ' KH quá hạn';
    const totalReceivable = collected + totalDebt;
    const recoveryRate = totalReceivable ? Math.round(collected/totalReceivable*100) : 0;
    document.getElementById('rRecovery').textContent = recoveryRate + '%';
    const avgOverdue = debtors.length ? Math.round(debtors.reduce((s,c)=>s+c.overdue,0)/debtors.length) : 0;
    document.getElementById('rDso').textContent = avgOverdue + 'd';
    const totalReminds = customers.reduce((s,c) => s + (c.remindCount||0), 0);
    document.getElementById('rRemind30').textContent = totalReminds;

    /* Aging cards */
    const agingData = [
      { key:'0-30', label:'Trong hạn', color:'var(--ok)' },
      { key:'31-60', label:'31-60 ngày', color:'#3B82F6' },
      { key:'61-90', label:'61-90 ngày', color:'var(--warn)' },
      { key:'91+', label:'> 90 ngày', color:'#EA580C' },
      { key:'baddebt', label:'Khó đòi', color:'var(--danger)' },
    ];
    document.getElementById('agingChart').innerHTML = agingData.map(b => {
      const list = buckets[b.key];
      const sum = list.reduce((s,c) => s+c.debt, 0);
      const pct = totalDebt ? Math.round(sum/totalDebt*100) : 0;
      return `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;border-left:4px solid ${b.color}">
        <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">${b.label}</div>
        <div style="font-size:20px;font-weight:800;color:var(--navy);margin-top:2px">${window.fmtShort(sum)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${list.length} KH · ${pct}%</div>
      </div>`;
    }).join('');

    /* Aging bar */
    const segments = agingData.filter(b => buckets[b.key].length > 0).map(b => {
      const sum = buckets[b.key].reduce((s,c) => s+c.debt, 0);
      const pct = totalDebt ? (sum/totalDebt*100) : 0;
      return `<div style="background:${b.color};width:${pct}%;height:100%" title="${b.label}: ${window.fmtVND(sum)}"></div>`;
    }).join('');
    document.getElementById('agingBar').innerHTML = `
      <div style="display:flex;height:14px;border-radius:99px;overflow:hidden;background:var(--line)">${segments}</div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:11.5px;color:var(--muted);margin-top:8px;justify-content:space-between">
        ${agingData.filter(b => buckets[b.key].length > 0).map(b => {
          const sum = buckets[b.key].reduce((s,c) => s+c.debt, 0);
          const pct = totalDebt ? Math.round(sum/totalDebt*100) : 0;
          return `<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${b.color};vertical-align:middle"></span> ${b.label} ${pct}%</span>`;
        }).join('')}
      </div>`;

    /* Top debtors */
    const top5 = [...debtors].sort((a,b) => b.debt - a.debt).slice(0,5);
    const maxDebt = top5[0]?.debt || 1;
    document.getElementById('topDebtors').innerHTML = top5.map((c, i) => {
      const pct = c.debt / maxDebt * 100;
      const col = window.avatarColor(c.id);
      return `<div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <div style="width:24px;height:24px;border-radius:6px;background:${col};color:#fff;display:grid;place-items:center;font-size:10px;font-weight:700">${window.initials(c.name)}</div>
          <div style="flex:1;font-size:13px"><b>${c.name}</b><span style="font-size:11px;color:var(--muted)"> · ${c.code}${c.overdue>0?` · ⏰ ${c.overdue}d quá hạn`:''}</span></div>
          <div style="font-weight:700;color:var(--danger)">${window.fmt(c.debt)} ₫</div>
        </div>
        <div style="height:6px;background:var(--line);border-radius:99px;overflow:hidden">
          <div style="height:100%;background:${c.overdue>30?'var(--danger)':c.overdue>0?'var(--warn)':'var(--info)'};width:${pct}%"></div>
        </div>
      </div>`;
    }).join('') || '<div style="text-align:center;color:var(--muted);padding:20px">Không có KH nợ nào.</div>';

    /* Theo NV phụ trách */
    const byStaff = {};
    debtors.forEach(c => {
      const s = c.staffOwner || 'Khác';
      if (!byStaff[s]) byStaff[s] = { total:0, count:0, overdue:0 };
      byStaff[s].total += c.debt;
      byStaff[s].count += 1;
      if (c.overdue > 0) byStaff[s].overdue += c.debt;
    });
    const staffArr = Object.entries(byStaff).sort((a,b) => b[1].total - a[1].total);
    document.getElementById('debtByStaff').innerHTML = staffArr.map(([name, d]) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px dashed var(--line)">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--gold);color:#fff;display:grid;place-items:center;font-weight:700;font-size:11px">${window.initials(name)}</div>
        <div style="flex:1;line-height:1.3">
          <div style="font-weight:600;font-size:13px">${name}</div>
          <div style="font-size:11.5px;color:var(--muted)">${d.count} KH${d.overdue?` · <span style="color:var(--danger)">⏰ ${window.fmtShort(d.overdue)} quá hạn</span>`:''}</div>
        </div>
        <div style="font-weight:700;color:var(--navy)">${window.fmtShort(d.total)} ₫</div>
      </div>
    `).join('') || '<div style="text-align:center;color:var(--muted);padding:20px">Không có dữ liệu.</div>';

    /* Lịch sử nhắc nợ */
    const allReminders = [];
    customers.forEach(c => {
      (c.reminders||[]).forEach(r => allReminders.push({...r, custName: c.name, custCode: c.code, custDebt: c.debt}));
    });
    allReminders.sort((a,b) => {
      const da = new Date(a.date.split(/[\/\s:,]/).filter(Boolean).slice(0,3).reverse().join('-'));
      const db = new Date(b.date.split(/[\/\s:,]/).filter(Boolean).slice(0,3).reverse().join('-'));
      return db - da;
    });
    const channelLabel = { call:'📞 Gọi', zalo:'💬 Zalo', sms:'📱 SMS', email:'📧 Email', onsite:'🚶 Đến nơi', telegram:'✈️ TG' };
    const respLabel = { promise:'Hứa TT', paid:'💰 Đã TT', negotiate:'Xin gia hạn', excuse:'Đưa lý do', 'no-answer':'Không bắt máy', refuse:'Từ chối' };
    document.getElementById('remindHistory').innerHTML = allReminders.slice(0,15).map(r => `
      <tr>
        <td style="font-size:12px">${r.date}</td>
        <td><b>${r.custName}</b><div style="font-size:11px;color:var(--muted)">${r.custCode} · nợ ${window.fmtShort(r.custDebt)}</div></td>
        <td>${channelLabel[r.channel]||r.channel}</td>
        <td style="font-size:12px">${r.by}</td>
        <td>${r.response ? `<span class="status-pill ${r.response==='paid'?'st-delivered':r.response==='promise'?'st-confirmed':'st-pickup'}">${respLabel[r.response]}</span>` : '<span style="color:var(--muted);font-size:11px">Chưa cập nhật</span>'}</td>
        <td style="font-size:11.5px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.message}">${r.message.slice(0,40)}${r.message.length>40?'...':''}</td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--muted)">Chưa có lịch sử nhắc nợ. Vào trang Công nợ → click 📞 hoặc Z trên 1 KH.</td></tr>`;

    /* Phiếu thu gần đây */
    document.getElementById('recentReceipts').innerHTML = recentReceipts.slice(0,10).map(e => `
      <tr>
        <td style="font-size:12px">${e.date}</td>
        <td><b>${e.no}</b></td>
        <td>${e.party}</td>
        <td class="num" style="color:var(--ok)"><b>+${window.fmt(e.amount)}</b></td>
        <td><span class="staff-pill">${e.account}</span></td>
        <td style="font-size:12px;color:var(--muted)">${e.staff}</td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--muted)">Chưa có phiếu thu nợ nào.</td></tr>`;
  }

  /* === Print + Export === */
  window.printReport = function() {
    window.print();
  };

  window.exportReport = function() {
    const orders = window.STORE.get('orders', window.ORDERS || []);
    const rows = [['Mã đơn','Ngày','KH','Nhóm hàng','Giao đến','Tiền hàng','COD','Trạng thái','NV phụ trách','Shipper']];
    orders.forEach(o => rows.push([
      o.code, o.date, o.custName, o.serviceType, o.drop || '',
      o.freight, o.cod||0, o.status, o.staff, o.driverName || ''
    ]));
    const csv = rows.map(r => r.map(x => '"' + String(x).replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'BaoCao-NSTT-' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    window.toast('⬇ Đã xuất ' + orders.length + ' dòng (CSV mở được bằng Excel)', 'success');
  };

  /* =========================================================
     BÁO CÁO LỢI NHUẬN — ngày / tuần / tháng / quý / năm
     Chỉ render nếu user có perm 'reports.profit'.
     ========================================================= */
  let profitPeriod = 'month';
  /* "Hôm nay" demo neo vào ngày dữ liệu mock (giữ đồng bộ dashboard / báo cáo ngày) */
  const TODAY = window.todayDate();   /* 18/05/2026 */

  function parseViDate(s) {
    const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  }

  function periodRange(p) {
    const t = new Date(TODAY); t.setHours(0, 0, 0, 0);
    const todayEnd = new Date(t); todayEnd.setHours(23, 59, 59);
    let from, to, label;
    if (p === 'day') {
      from = new Date(t); to = todayEnd;
      label = 'Ngày ' + t.toLocaleDateString('vi-VN');
    } else if (p === 'week') {
      const day = t.getDay() || 7;            /* T2=1..CN=7 */
      from = new Date(t); from.setDate(t.getDate() - day + 1);
      to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59);
      label = 'Tuần ' + from.toLocaleDateString('vi-VN') + ' → ' + to.toLocaleDateString('vi-VN');
    } else if (p === 'month') {
      from = new Date(t.getFullYear(), t.getMonth(), 1);
      to = new Date(t.getFullYear(), t.getMonth() + 1, 0, 23, 59, 59);
      label = 'Tháng ' + (t.getMonth() + 1) + '/' + t.getFullYear();
    } else if (p === 'quarter') {
      const q = Math.floor(t.getMonth() / 3);
      from = new Date(t.getFullYear(), q * 3, 1);
      to = new Date(t.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
      label = 'Quý ' + (q + 1) + '/' + t.getFullYear();
    } else {                                  /* year */
      from = new Date(t.getFullYear(), 0, 1);
      to = new Date(t.getFullYear(), 11, 31, 23, 59, 59);
      label = 'Năm ' + t.getFullYear();
    }
    /* CAP to ≤ hôm nay — chi phí lương không tính cho thời gian chưa đến */
    if (to > todayEnd) to = todayEnd;
    return { from, to, label };
  }

  /* Tra giá vốn (buy) gần nhất của 1 SP tại thời điểm orderDate */
  function buyPriceAt(prod, orderDate) {
    if (!prod || !prod.priceHistory || !prod.priceHistory.length) return null;
    const od = parseViDate(orderDate);
    if (!od) return prod.priceHistory[prod.priceHistory.length - 1].buy;
    let best = null;
    prod.priceHistory.forEach(h => {
      const hd = new Date(h.date);
      if (hd <= od && (!best || hd > new Date(best.date))) best = h;
    });
    return (best ? best.buy : prod.priceHistory[0].buy);
  }

  /* Số ngày trong khoảng — phân bổ lương theo ngày */
  function daysBetween(from, to) {
    return Math.max(1, Math.round((to - from) / 86400000) + 1);
  }

  /* Tổng lương tháng (theo bảng lương đã tính trong scripts/payroll.js) */
  function monthlyPayroll(yy, mm) {
    const staffs = (window.STORE.get('staff', window.STAFFS || []) || [])
      .filter(s => s.status === 'active');
    const sheets = window.STORE.get('timesheet', window.TIMESHEET || []) || [];
    const extra = window.STORE.get('payrollExtra', {}) || {};
    const monthKey = yy + '-' + String(mm).padStart(2, '0');
    /* NC chuẩn = số ngày trong tháng trừ Chủ nhật */
    const last = new Date(yy, mm, 0).getDate();
    let wd = 0;
    for (let d = 1; d <= last; d++) if (new Date(yy, mm - 1, d).getDay() !== 0) wd++;
    let total = 0;
    staffs.forEach(s => {
      const sh = sheets.find(t => t.staffId === s.id && t.month === monthKey);
      const days = sh ? sh.days : [];
      let cong = 0;
      days.forEach(v => { if (v === 'X' || v === 'P') cong++; });
      if (!sh) cong = wd;   /* chưa chấm → mặc định đủ công */
      const luongNgay = wd ? Math.round((s.salary || 0) / wd) : 0;
      const e = extra[s.id] || { bonus: 0, deduction: 0 };
      total += luongNgay * cong + (e.bonus || 0) - (e.deduction || 0);
    });
    return total;
  }

  function payrollForRange(r) {
    /* Cộng lương từng tháng chạm vào khoảng, prorate theo số ngày trong tháng nằm trong khoảng */
    let total = 0;
    const cur = new Date(r.from.getFullYear(), r.from.getMonth(), 1);
    while (cur <= r.to) {
      const yy = cur.getFullYear(), mm = cur.getMonth() + 1;
      const monthFirst = new Date(yy, mm - 1, 1);
      const monthLast  = new Date(yy, mm, 0);
      const lo = r.from > monthFirst ? r.from : monthFirst;
      const hi = r.to   < monthLast  ? r.to   : monthLast;
      const inMonth = daysBetween(monthFirst, monthLast);
      const inRange = daysBetween(lo, hi);
      const monthly = monthlyPayroll(yy, mm);
      total += Math.round(monthly * inRange / inMonth);
      cur.setMonth(cur.getMonth() + 1);
    }
    return total;
  }

  function computeProfit(period) {
    const r = periodRange(period);
    const orders = window.STORE.get('orders', window.ORDERS || []) || [];
    const products = window.STORE.get('products', window.PRODUCTS || []) || [];
    const ads = window.STORE.get('adspend', window.ADSPEND || []) || [];

    const inRange = (od) => { const d = parseViDate(od); return d && d >= r.from && d <= r.to; };

    const filtered = orders.filter(o => o.status !== 'cancelled' && inRange(o.date));
    let revenue = 0, cogs = 0;
    const byProd = {};   /* pid → { name, qty, rev, cogs } */
    const byStaff = {};
    filtered.forEach(o => {
      const orderRev = o.freight || 0;
      revenue += orderRev;
      let orderCogs = 0;
      (o.items || []).forEach(it => {
        const p = products.find(x => x.id === it.id);
        const buy = p ? (buyPriceAt(p, o.date) || it.price * 0.8) : it.price * 0.8;
        const itemCogs = (buy || 0) * (it.qty || 0);
        orderCogs += itemCogs;
        const k = it.id || it.name || 'misc';
        const b = byProd[k] || (byProd[k] = { name: it.name || (p && p.name) || k, qty: 0, rev: 0, cogs: 0 });
        b.qty += (it.qty || 0); b.rev += (it.total || 0); b.cogs += itemCogs;
      });
      cogs += orderCogs;
      const sk = o.staff || '—';
      const sb = byStaff[sk] || (byStaff[sk] = { name: sk, orders: 0, rev: 0, cogs: 0 });
      sb.orders++; sb.rev += orderRev; sb.cogs += orderCogs;
    });

    const adSpend = ads.filter(a => {
      const d = new Date(a.date);
      return d >= r.from && d <= r.to;
    }).reduce((s, a) => s + (a.spend || 0), 0);

    const payroll = payrollForRange(r);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - adSpend - payroll;
    const grossMargin = revenue ? grossProfit / revenue * 100 : 0;
    const netMargin   = revenue ? netProfit   / revenue * 100 : 0;
    return { range: r, revenue, cogs, grossProfit, adSpend, payroll, netProfit,
             grossMargin, netMargin, byProd, byStaff, orders: filtered };
  }

  function renderProfitReport() {
    if (!window.AUTH || !window.AUTH.hasPerm('reports.profit')) {
      document.getElementById('paneProfit').innerHTML = `
        <div style="background:#FEE2E2;border:1px solid var(--danger);border-radius:10px;padding:24px;text-align:center;color:var(--danger);font-weight:600">
          🔒 Bạn không có quyền xem báo cáo lợi nhuận (giá vốn, lãi gộp/ròng).<br>
          <span style="font-weight:400;font-size:12.5px;color:var(--muted)">Liên hệ chủ doanh nghiệp để được cấp quyền <code>reports.profit</code>.</span>
        </div>`;
      return;
    }
    const d = computeProfit(profitPeriod);
    document.getElementById('pfPeriodLabel').textContent = d.range.label +
      ' · ' + d.orders.length + ' đơn';
    document.querySelectorAll('#pfSeg button').forEach(b => {
      b.classList.toggle('active', b.dataset.p === profitPeriod);
    });

    document.getElementById('pfKpis').innerHTML = `
      <div class="kpi k-1"><div class="kpi-label">Doanh thu kỳ</div><div class="kpi-value">${window.fmtShort(d.revenue)}</div><div class="kpi-trend">${d.orders.length} đơn</div><div class="kpi-icon">💰</div></div>
      <div class="kpi k-3"><div class="kpi-label">Giá vốn (COGS)</div><div class="kpi-value">${window.fmtShort(d.cogs)}</div><div class="kpi-trend down">−${d.revenue ? Math.round(d.cogs / d.revenue * 100) : 0}% DT</div><div class="kpi-icon">🥕</div></div>
      <div class="kpi k-4"><div class="kpi-label">Lãi gộp</div><div class="kpi-value">${window.fmtShort(d.grossProfit)}</div><div class="kpi-trend up">Biên ${d.grossMargin.toFixed(1)}%</div><div class="kpi-icon">📈</div></div>
      <div class="kpi k-2"><div class="kpi-label">Lãi ròng</div><div class="kpi-value" style="color:${d.netProfit >= 0 ? 'var(--ok)' : 'var(--danger)'}">${window.fmtShort(d.netProfit)}</div><div class="kpi-trend">Biên ${d.netMargin.toFixed(1)}%</div><div class="kpi-icon">💎</div></div>
      <div class="kpi k-5"><div class="kpi-label">Chi phí cố định</div><div class="kpi-value">${window.fmtShort(d.adSpend + d.payroll)}</div><div class="kpi-trend">Ads ${window.fmtShort(d.adSpend)} · Lương ${window.fmtShort(d.payroll)}</div><div class="kpi-icon">🧾</div></div>`;

    /* Waterfall */
    document.getElementById('pfWaterfall').innerHTML = `
      <div class="pf-row plus"><div class="lab"><div class="ic" style="background:#DCFCE7">💰</div>Doanh thu</div><div class="val">${window.fmt(d.revenue)} ₫</div></div>
      <div class="pf-row minus"><div class="lab"><div class="ic" style="background:#FEE2E2">🥕</div>− Giá vốn hàng bán</div><div class="val">−${window.fmt(d.cogs)} ₫</div></div>
      <div class="pf-row plus" style="background:#F0FDF4"><div class="lab"><div class="ic" style="background:#BBF7D0">📈</div><b>= Lãi gộp</b></div><div class="val"><b>${window.fmt(d.grossProfit)} ₫</b> · ${d.grossMargin.toFixed(1)}%</div></div>
      <div class="pf-row minus"><div class="lab"><div class="ic" style="background:#FEE2E2">📣</div>− Chi phí quảng cáo</div><div class="val">−${window.fmt(d.adSpend)} ₫</div></div>
      <div class="pf-row minus"><div class="lab"><div class="ic" style="background:#FEE2E2">👨‍💼</div>− Chi phí lương kỳ</div><div class="val">−${window.fmt(d.payroll)} ₫</div></div>
      <div class="pf-row total ${d.netProfit >= 0 ? 'plus' : 'minus'}"><div class="lab"><div class="ic" style="background:${d.netProfit >= 0 ? '#BBF7D0' : '#FCA5A5'}">💎</div><b>LÃI RÒNG</b></div><div class="val"><b>${window.fmt(d.netProfit)} ₫</b> · ${d.netMargin.toFixed(1)}%</div></div>`;

    /* 12-month gross profit chart */
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
      const yy = m.getFullYear(), mm = m.getMonth() + 1;
      const r = { from: m, to: new Date(yy, mm, 0, 23, 59, 59), label: '' };
      const saved = profitPeriod; profitPeriod = '__tmp';
      /* Tạm reuse computeProfit bằng cách patch periodRange — gọn hơn: compute riêng */
      profitPeriod = saved;
      const orders = (window.STORE.get('orders', window.ORDERS || []) || []).filter(o => {
        if (o.status === 'cancelled') return false;
        const d = parseViDate(o.date); return d && d >= r.from && d <= r.to;
      });
      const products = window.STORE.get('products', window.PRODUCTS || []) || [];
      let rev = 0, c = 0;
      orders.forEach(o => {
        rev += (o.freight || 0);
        (o.items || []).forEach(it => {
          const p = products.find(x => x.id === it.id);
          const buy = p ? (buyPriceAt(p, o.date) || it.price * 0.8) : it.price * 0.8;
          c += (buy || 0) * (it.qty || 0);
        });
      });
      months.push({ m: 'T' + mm + '/' + String(yy).slice(2), v: rev - c, rev });
    }
    const maxV = Math.max(1, ...months.map(x => x.v));
    document.getElementById('pfChart12m').innerHTML = months.map((mo, i) => {
      const cur = i === months.length - 1;
      const h = Math.max(8, mo.v / maxV * 160);
      const col = mo.v < 0 ? 'var(--danger)' : (cur ? 'var(--red)' : 'var(--ok)');
      return `<div class="bar" style="height:${h}px;background:${col}" title="DT ${window.fmtShort(mo.rev)} · Lãi gộp ${window.fmtShort(mo.v)}">
        <div class="v">${window.fmtShort(mo.v)}</div><div class="x">${mo.m}</div>
      </div>`;
    }).join('');

    /* Top product */
    const topProds = Object.values(d.byProd)
      .map(p => ({ ...p, profit: p.rev - p.cogs, margin: p.rev ? (p.rev - p.cogs) / p.rev * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit).slice(0, 10);
    document.getElementById('pfTopProd').innerHTML = topProds.map((p, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td><b>${p.name}</b></td>
        <td class="num">${window.fmt(p.qty)}</td>
        <td class="num">${window.fmt(p.rev)}</td>
        <td class="num" style="color:var(--muted)">${window.fmt(Math.round(p.cogs))}</td>
        <td class="num"><b style="color:${p.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">${window.fmt(Math.round(p.profit))}</b></td>
        <td class="num"><b>${p.margin.toFixed(1)}%</b></td>
      </tr>`).join('') ||
      `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--muted)">Không có đơn nào trong kỳ.</td></tr>`;

    /* Theo NV */
    const staffRows = Object.values(d.byStaff)
      .map(s => ({ ...s, profit: s.rev - s.cogs, margin: s.rev ? (s.rev - s.cogs) / s.rev * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit);
    document.getElementById('pfByStaff').innerHTML = staffRows.map(s => `
      <tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:50%;background:${window.avatarColor(s.name)};color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700">${window.initials(s.name)}</div>
          <b>${s.name}</b></div></td>
        <td class="num">${s.orders}</td>
        <td class="num">${window.fmt(s.rev)}</td>
        <td class="num" style="color:var(--muted)">${window.fmt(Math.round(s.cogs))}</td>
        <td class="num"><b style="color:${s.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">${window.fmt(Math.round(s.profit))}</b></td>
        <td class="num"><b>${s.margin.toFixed(1)}%</b></td>
      </tr>`).join('') ||
      `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--muted)">Không có dữ liệu.</td></tr>`;
  }

  window.setProfitPeriod = function (p) { profitPeriod = p; renderProfitReport(); };

  /* ============================================================
     OVERVIEW — Tổng quan toàn DN (executive view cho sếp)
     ============================================================ */
  function renderOverview() {
    const orders    = window.STORE.get('orders', window.ORDERS || []) || [];
    const customers = window.STORE.get('customers', window.CUSTOMERS || []) || [];
    const products  = window.STORE.get('products', window.PRODUCTS || []) || [];
    const staff     = window.STORE.get('staff', window.STAFFS || []) || [];
    const drivers   = window.STORE.get('shippers', window.DRIVERS || []) || [];
    const ads       = window.STORE.get('adspend', window.ADSPEND || []) || [];
    const timesheet = window.STORE.get('timesheet', window.TIMESHEET || []) || [];

    const isInMonth = (o, mo, y) => {
      const m = (o.date || '').match(/(\d+)\/(\d+)\/(\d+)/);
      return m && +m[2] === mo && +m[3] === y;
    };
    const t5 = orders.filter(o => o.status !== 'cancelled' && isInMonth(o, 5, 2026));
    const t4 = orders.filter(o => o.status !== 'cancelled' && isInMonth(o, 4, 2026));
    const rev5 = t5.reduce((s, o) => s + (o.freight || 0), 0);
    const rev4 = t4.reduce((s, o) => s + (o.freight || 0), 0);
    const cogs5 = (() => {
      let c = 0;
      t5.forEach(o => (o.items || []).forEach(it => {
        const p = products.find(x => x.id === it.id);
        const bp = p ? (buyPriceAt(p, o.date) || it.price * 0.8) : it.price * 0.8;
        c += (bp || 0) * (it.qty || 0);
      }));
      return c;
    })();
    const gross5 = rev5 - cogs5;
    const adsT5 = ads.filter(a => (a.date || '').startsWith('2026-05')).reduce((s, a) => s + (a.spend || 0), 0);
    const activeStaff = staff.filter(s => s.status === 'active');
    const totalSalary = activeStaff.reduce((s, x) => s + (x.salary || 0), 0);
    const net5 = gross5 - adsT5 - totalSalary;

    /* === 1. SALES === */
    const newCust = customers.filter(c => c.group === 'Mới').length;
    const activeCust = new Set(t5.map(o => o.cust)).size;
    document.getElementById('ovSales').innerHTML = `
      <h3 style="margin:0 0 10px;display:flex;align-items:center;gap:8px;color:#15803D">💰 SALES — Bán hàng tháng 5</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12.5px">
        <div><div style="color:var(--muted);font-size:11px">Doanh thu</div><div style="font-size:18px;font-weight:800;color:#15803D">${window.fmtShort(rev5)}</div></div>
        <div><div style="color:var(--muted);font-size:11px">Số đơn</div><div style="font-size:18px;font-weight:800;color:var(--navy)">${t5.length}</div></div>
        <div><div style="color:var(--muted);font-size:11px">AOV</div><div style="font-weight:700">${window.fmtShort(t5.length ? rev5 / t5.length : 0)}</div></div>
        <div><div style="color:var(--muted);font-size:11px">KH đặt tháng</div><div style="font-weight:700">${activeCust}/${customers.length}</div></div>
        <div><div style="color:var(--muted);font-size:11px">KH mới 30d</div><div style="font-weight:700;color:var(--ok)">${newCust} KH</div></div>
        <div><div style="color:var(--muted);font-size:11px">vs T4</div><div style="font-weight:700;color:${rev5>=rev4?'var(--ok)':'var(--danger)'}">${rev5>=rev4?'+':''}${Math.round((rev5-rev4)/rev4*100)}%</div></div>
      </div>
    `;

    /* === 2. OPS === */
    const activeShOrders = orders.filter(o => o.status === 'pickup' || o.status === 'transit');
    const pendingDispatch = orders.filter(o => o.status === 'confirmed' && (!o.driver || o.driver === '—')).length;
    const overdueDelivery = orders.filter(o => {
      if (o.status !== 'pickup' && o.status !== 'transit') return false;
      const m = (o.date || '').match(/(\d+)\/(\d+)\/(\d+)/);
      if (!m) return false;
      const today = window.todayDate();
      const d = new Date(+m[3], +m[2]-1, +m[1]);
      return (today - d) / 86400000 > 1;
    }).length;
    document.getElementById('ovOps').innerHTML = `
      <h3 style="margin:0 0 10px;display:flex;align-items:center;gap:8px;color:#0369A1">🛵 VẬN HÀNH — Shipper hôm nay</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12.5px">
        <div><div style="color:var(--muted);font-size:11px">Tổng shipper</div><div style="font-size:18px;font-weight:800;color:var(--navy)">${drivers.length}</div></div>
        <div><div style="color:var(--muted);font-size:11px">Đang giao</div><div style="font-size:18px;font-weight:800;color:#0369A1">${activeShOrders.length}</div></div>
        <div><div style="color:var(--muted);font-size:11px">Đơn chưa gán</div><div style="font-weight:700;color:${pendingDispatch?'var(--warn)':'var(--ok)'}">${pendingDispatch}</div></div>
        <div><div style="color:var(--muted);font-size:11px">Đơn quá hạn giao</div><div style="font-weight:700;color:${overdueDelivery?'var(--danger)':'var(--ok)'}">${overdueDelivery}</div></div>
      </div>
    `;

    /* === 3. FINANCE === */
    const totalDebt = customers.reduce((s, c) => s + (c.debt || 0), 0);
    const overdueDebt = customers.reduce((s, c) => s + (c.debtOverdue || 0), 0);
    document.getElementById('ovFinance').innerHTML = `
      <h3 style="margin:0 0 10px;display:flex;align-items:center;gap:8px;color:#B91C1C">💎 TÀI CHÍNH — Lãi lỗ + Công nợ T5</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12.5px">
        <div><div style="color:var(--muted);font-size:11px">Lãi gộp</div><div style="font-size:18px;font-weight:800;color:var(--ok)">${window.fmtShort(gross5)}</div><div style="font-size:10.5px;color:var(--muted)">Biên ${rev5?(gross5/rev5*100).toFixed(1):0}%</div></div>
        <div><div style="color:var(--muted);font-size:11px">Lãi ròng</div><div style="font-size:18px;font-weight:800;color:${net5>=0?'var(--ok)':'var(--danger)'}">${window.fmtShort(net5)}</div><div style="font-size:10.5px;color:var(--muted)">Biên ${rev5?(net5/rev5*100).toFixed(1):0}%</div></div>
        <div><div style="color:var(--muted);font-size:11px">Tổng phải thu</div><div style="font-weight:700;color:var(--navy)">${window.fmtShort(totalDebt)}</div></div>
        <div><div style="color:var(--muted);font-size:11px">Quá hạn</div><div style="font-weight:700;color:${overdueDebt?'var(--danger)':'var(--ok)'}">${window.fmtShort(overdueDebt)}</div></div>
      </div>
    `;

    /* === 4. HR === */
    function todayAtt(staffId) {
      if (!staffId) return null;
      const sh = timesheet.find(t => t.staffId === staffId && t.month === '2026-05');
      return sh ? sh.days[17] : 'X';   /* day 18 = index 17 */
    }
    let onDuty = 0, onLeave = 0, absent = 0;
    activeStaff.forEach(s => {
      const att = todayAtt(s.id);
      if (att === 'X' || att === 'L') onDuty++;
      else if (att === 'P' || att === 'H') onLeave++;
      else if (att === 'V') absent++;
    });
    document.getElementById('ovHr').innerHTML = `
      <h3 style="margin:0 0 10px;display:flex;align-items:center;gap:8px;color:#A16207">🧑‍💼 NHÂN SỰ — Hôm nay 18/05</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12.5px">
        <div><div style="color:var(--muted);font-size:11px">Tổng NV active</div><div style="font-size:18px;font-weight:800;color:var(--navy)">${activeStaff.length}</div></div>
        <div><div style="color:var(--muted);font-size:11px">Đi làm hôm nay</div><div style="font-size:18px;font-weight:800;color:var(--ok)">${onDuty}</div></div>
        <div><div style="color:var(--muted);font-size:11px">Phép / vắng</div><div style="font-weight:700">${onLeave}P · ${absent}V</div></div>
        <div><div style="color:var(--muted);font-size:11px">Quỹ lương cb</div><div style="font-weight:700;color:#A16207">${window.fmtShort(totalSalary)}</div></div>
      </div>
    `;

    /* === 5. MARKETING === */
    const adsSale = ads.filter(a => (a.date || '').startsWith('2026-05') && a.objective === 'ban-hang');
    const adsRecruit = ads.filter(a => (a.date || '').startsWith('2026-05') && a.objective === 'tuyen-dung');
    const adSpendSale = adsSale.reduce((s, a) => s + (a.spend || 0), 0);
    const adSpendRec = adsRecruit.reduce((s, a) => s + (a.spend || 0), 0);
    const adCusts = adsSale.reduce((s, a) => s + (a.custs || 0), 0);
    const adCpc = adCusts ? Math.round(adSpendSale / adCusts) : 0;
    document.getElementById('ovMarketing').innerHTML = `
      <h3 style="margin:0 0 10px;display:flex;align-items:center;gap:8px;color:#6D28D9">📣 MARKETING — Chi phí quảng cáo T5</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12.5px">
        <div><div style="color:var(--muted);font-size:11px">Bán hàng</div><div style="font-size:16px;font-weight:800;color:var(--ok)">${window.fmtShort(adSpendSale)}</div><div style="font-size:10.5px;color:var(--muted)">${adsSale.length} chiến dịch</div></div>
        <div><div style="color:var(--muted);font-size:11px">Tuyển dụng</div><div style="font-size:16px;font-weight:800;color:#7C3AED">${window.fmtShort(adSpendRec)}</div><div style="font-size:10.5px;color:var(--muted)">${adsRecruit.length} chiến dịch</div></div>
        <div><div style="color:var(--muted);font-size:11px">KH từ Ads</div><div style="font-weight:700">${adCusts}</div></div>
        <div><div style="color:var(--muted);font-size:11px">Cost/KH</div><div style="font-weight:700;color:${adCpc>100000?'var(--danger)':'var(--ok)'}">${window.fmt(adCpc)}đ</div></div>
      </div>
    `;

    /* === 6. ALERTS === */
    const alerts = [];
    if (net5 < 0) alerts.push({ icon: '📉', title: 'Lãi ròng T5 ÂM', desc: window.fmt(net5) + 'đ · cần review' });
    if (overdueDebt > 0) alerts.push({ icon: '⏰', title: 'Công nợ quá hạn', desc: window.fmtShort(overdueDebt) + ' từ KH' });
    if (pendingDispatch > 0) alerts.push({ icon: '🛵', title: pendingDispatch + ' đơn chưa gán shipper', desc: 'Cần điều phối ngay' });
    if (overdueDelivery > 0) alerts.push({ icon: '🚨', title: overdueDelivery + ' đơn quá hạn giao', desc: 'Liên hệ shipper' });
    if (adCpc > 100000) alerts.push({ icon: '📣', title: 'Cost/KH ads quá cao', desc: window.fmt(adCpc) + 'đ (nên < 100k)' });
    document.getElementById('ovAlerts').innerHTML = `
      <h3 style="margin:0 0 10px;display:flex;align-items:center;gap:8px;color:#B91C1C">⚠️ CẢNH BÁO — Cần xử lý ngay</h3>
      ${alerts.length ? alerts.map(a => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#FEF2F2;border-radius:7px;margin-bottom:6px">
          <div style="font-size:18px">${a.icon}</div>
          <div style="flex:1"><div style="font-weight:700;font-size:13px;color:var(--navy)">${a.title}</div><div style="font-size:11.5px;color:var(--muted)">${a.desc}</div></div>
        </div>
      `).join('') : `<div style="padding:20px;text-align:center;color:var(--ok);font-size:13px">🎉 Không có cảnh báo. Mọi thứ ổn định.</div>`}
    `;

    /* === Heatmap đơn theo ngày === */
    const byDay = {};
    t5.forEach(o => { const d = (o.date || '').match(/(\d+)\/05\/2026/); if (d) byDay[+d[1]] = (byDay[+d[1]] || 0) + 1; });
    const maxDay = Math.max(1, ...Object.values(byDay));
    const heatmap = [];
    for (let d = 1; d <= 31; d++) {
      const cnt = byDay[d] || 0;
      const dow = new Date(2026, 4, d).getDay();
      const intensity = cnt === 0 ? 0 : Math.ceil(cnt / maxDay * 4);
      const colors = ['#FAFAFB', '#F0FDF4', '#BBF7D0', '#86EFAC', '#22C55E', '#15803D'];
      const bg = dow === 0 ? '#FEE2E2' : dow === 6 ? '#FEF3C7' : colors[intensity];
      const txtColor = intensity >= 3 ? '#fff' : 'var(--muted)';
      heatmap.push(`<div style="aspect-ratio:1;background:${bg};border-radius:4px;display:grid;place-items:center;font-size:9px;color:${txtColor};font-weight:700" title="Ngày ${d}: ${cnt} đơn">${d}<br>${cnt || ''}</div>`);
    }
    const hm = document.getElementById('ovHeatmap'); if (hm) hm.innerHTML = heatmap.join('');

    /* === So sánh tháng === */
    let cogs4 = 0;
    t4.forEach(o => (o.items || []).forEach(it => {
      const p = products.find(x => x.id === it.id);
      const bp = p ? (buyPriceAt(p, o.date) || it.price * 0.8) : it.price * 0.8;
      cogs4 += (bp || 0) * (it.qty || 0);
    }));
    const rows = [
      { label: '💰 Doanh thu', v4: rev4, v5: rev5, fmt: 'money' },
      { label: '📦 Số đơn',    v4: t4.length, v5: t5.length, fmt: 'num' },
      { label: '🥕 Giá vốn (COGS)', v4: cogs4, v5: cogs5, fmt: 'money', invert: true },
      { label: '📈 Lãi gộp',  v4: rev4 - cogs4, v5: gross5, fmt: 'money' },
      { label: '👥 KH đặt',   v4: new Set(t4.map(o=>o.cust)).size, v5: activeCust, fmt: 'num' },
    ];
    const tbody = document.querySelector('#ovCompareTbl tbody');
    if (tbody) tbody.innerHTML = rows.map(r => {
      const delta = r.v5 - r.v4;
      const pct = r.v4 ? Math.round(delta / r.v4 * 100) : 0;
      const good = r.invert ? delta < 0 : delta > 0;
      const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
      const f = r.fmt === 'money' ? (n => window.fmtShort(n)) : (n => window.fmt(n));
      return `<tr>
        <td><b>${r.label}</b></td>
        <td class="num">${f(r.v4)}</td>
        <td class="num"><b>${f(r.v5)}</b></td>
        <td class="num" style="color:${good ? 'var(--ok)' : 'var(--danger)'}">${arrow} ${pct >= 0 ? '+' : ''}${pct}%</td>
        <td><span style="font-size:11px;padding:2px 8px;border-radius:99px;background:${good?'#DCFCE7':'#FEE2E2'};color:${good?'var(--ok)':'var(--danger)'};font-weight:600">${good ? 'Tốt' : 'Giảm'}</span></td>
      </tr>`;
    }).join('');
  }
  window.renderOverview = renderOverview;

  /* === Toggle Hướng dẫn cách tính === */
  window.togglePfGuide = function () {
    const body = document.getElementById('pfGuideBody');
    const btn  = document.getElementById('pfGuideToggle');
    if (!body) return;
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    if (btn) btn.textContent = open ? '▾ Mở' : '▴ Đóng';
  };

  /* === GATE tab Lợi nhuận theo perm === */
  function gateProfitTab() {
    const has = window.AUTH && window.AUTH.hasPerm('reports.profit');
    document.querySelectorAll('.tab-profit-lock').forEach(t => {
      t.style.display = has ? '' : 'none';
    });
  }

  window.renderAppShell('reports', 'Báo cáo & Phân tích');
  renderChart();
  recalculate();
  gateProfitTab();
  /* Render Overview ngay vì là tab mặc định */
  setTimeout(() => { try { renderOverview(); } catch (e) { console.warn('renderOverview', e); } }, 50);

  /* Restore badge nếu có filter đã lưu */
  const desc = describeFilters(filters);
  if (desc && desc !== '📅 Tháng này') {
    document.getElementById('filterDesc').textContent = desc;
    document.getElementById('activeFilterBadge').style.display = 'block';
  }
})();
