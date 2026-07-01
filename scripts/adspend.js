/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Chi phí quảng cáo theo ngày/kênh/mục đích
   Mẫu báo cáo (cột + KPI) đổi theo "mục đích chạy".
   ========================================================= */
(function () {
  const OBJS = window.AD_OBJECTIVES || [];
  const CHANS = window.AD_CHANNELS || [];
  const objMeta = id => OBJS.find(o => o.id === id) || OBJS[0];
  const chanMeta = id => CHANS.find(c => c.id === id) || { label: id, icon: '📣', color: '#666' };

  let objective = (OBJS[0] || {}).id || 'ban-hang';
  let channel = 'all';
  /* Tháng đang xem: NHỚ tháng chọn gần nhất (localStorage) → reload KHÔNG nhảy về tháng hiện tại
     làm "mất" data tháng vừa nhập khỏi màn hình. Chưa có lưu → tháng hiện tại. */
  const _MONTH_KEY = 'vty_adsMonth';
  let month = (function () {
    try { const s = localStorage.getItem(_MONTH_KEY); if (s && /^\d{4}-\d{2}$/.test(s)) return s; } catch (e) {}
    return (window.todayDate ? window.todayDate() : new Date()).toISOString().slice(0, 7);
  })();
  window.setAdsMonth = function (m) { if (m) { month = m; try { localStorage.setItem(_MONTH_KEY, m); } catch (e) {} render(); } };

  const all = () => window.STORE.get('adspend', window.ADSPEND || []);
  const fmtD = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}`; };
  const cp = (spend, n) => n > 0 ? Math.round(spend / n) : 0;

  function entries() {
    return all().filter(e => e.objective === objective
      && (channel === 'all' || e.channel === channel)
      && e.date.startsWith(month))
      .sort((a, b) => a.date < b.date ? -1 : 1);
  }

  function render() {
    const obj = objMeta(objective);
    const list = entries();

    /* tabs mục đích */
    document.getElementById('objTabs').innerHTML = OBJS.map(o =>
      `<div class="rpt-tab ${o.id === objective ? 'active' : ''}" onclick="window.setObjective('${o.id}')">${o.icon} ${o.label}</div>`).join('');

    /* filter kênh — chip (desktop) + dropdown (điện thoại, ẩn/hiện qua CSS) */
    document.getElementById('chanFilter').innerHTML =
      `<select id="chanSelect" class="chan-select" onchange="window.setChan(this.value)">` +
        `<option value="all" ${channel === 'all' ? 'selected' : ''}>Tất cả kênh</option>` +
        CHANS.map(c => `<option value="${c.id}" ${channel === c.id ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('') +
      `</select>` +
      `<button class="chip ${channel === 'all' ? 'active' : ''}" onclick="window.setChan('all')">Tất cả kênh</button>` +
      CHANS.map(c => `<button class="chip ${channel === c.id ? 'active' : ''}" onclick="window.setChan('${c.id}')" style="${channel === c.id ? 'background:' + c.color + ';color:#fff;border-color:' + c.color : ''}">${c.icon} ${c.label}</button>`).join('');

    /* tổng hợp */
    const sum = list.reduce((a, e) => {
      a.spend += e.spend || 0; a.units += e.units || 0; a.leads += e.leads || 0;
      a.custs += e.custs || 0; a.candidates += e.candidates || 0; a.revenue += e.revenue || 0;
      return a;
    }, { spend: 0, units: 0, leads: 0, custs: 0, candidates: 0, revenue: 0 });
    const lastStep = obj.steps[obj.steps.length - 1];
    const lastCount = sum[lastStep.key] || 0;
    const roas = sum.spend ? (sum.revenue / sum.spend) : 0;

    const kpis = [
      `<div class="kpi k-1"><div class="kpi-label">Tổng chi tiêu (${month.slice(5)}/${month.slice(0,4)})</div><div class="kpi-value">${window.fmtShort(sum.spend)}</div><div class="kpi-trend">${list.length} ngày chạy</div><div class="kpi-icon">💸</div></div>`,
      /* Thẻ Tổng Inbox chỉ hiện khi mục đích còn theo dõi Inbox (vd Tuyển dụng) — Bán hàng đã bỏ */
      obj.steps.some(s => s.key === 'units') ? `<div class="kpi k-2"><div class="kpi-label">Tổng Inbox</div><div class="kpi-value">${window.fmt(sum.units)}</div><div class="kpi-trend">CP ${window.fmt(cp(sum.spend, sum.units))}/inbox</div><div class="kpi-icon">💬</div></div>` : '',
      `<div class="kpi k-4"><div class="kpi-label">Tổng SĐT</div><div class="kpi-value">${window.fmt(sum.leads)}</div><div class="kpi-trend">CP ${window.fmt(cp(sum.spend, sum.leads))}/SĐT</div><div class="kpi-icon">📞</div></div>`,
      `<div class="kpi k-3"><div class="kpi-label">${lastStep.label}</div><div class="kpi-value">${window.fmt(lastCount)}</div><div class="kpi-trend">${lastStep.cp} ${window.fmt(cp(sum.spend, lastCount))}</div><div class="kpi-icon">${objective === 'tuyen-dung' ? '🧑‍💼' : '🛒'}</div></div>`,
    ].filter(Boolean);
    if (obj.hasRevenue) {
      kpis.push(`<div class="kpi k-5"><div class="kpi-label">Doanh thu · ROAS</div><div class="kpi-value">${window.fmtShort(sum.revenue)}</div><div class="kpi-trend ${roas >= 1 ? 'up' : 'down'}">ROAS ${roas.toFixed(2)}x</div><div class="kpi-icon">📈</div></div>`);
      /* === KPI thực tế từ DATA KH: nguồn ≠ Sales chủ động → tính là MKT === */
      const customers = window.STORE.get('customers', window.CUSTOMERS || []);
      const [my, mm] = [parseInt(month.slice(0, 4), 10), parseInt(month.slice(5), 10)];
      const mktCusts = customers.filter(c => {
        if (!c.source || /sales\s*chủ\s*động|sales-chu-dong/i.test(c.source)) return false;
        const m = (c.created || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        return m && parseInt(m[2], 10) === mm && parseInt(m[3], 10) === my;
      });
      const bySrc = {};
      mktCusts.forEach(c => { bySrc[c.source] = (bySrc[c.source] || 0) + 1; });
      const top = Object.entries(bySrc).sort((a, b) => b[1] - a[1])[0];
      const reportedVsReal = sum.custs > 0 ? Math.round(mktCusts.length / sum.custs * 100) : 0;
      kpis.push(`<div class="kpi k-2" style="border-left:3px solid var(--ok)"><div class="kpi-label">KH MKT thực tế (data KH)</div><div class="kpi-value">${mktCusts.length}</div><div class="kpi-trend up">${top ? top[0] + ' (' + top[1] + ')' : 'nguồn ≠ Sales chủ động'} · vs ads ${reportedVsReal}%</div><div class="kpi-icon">📣</div></div>`);
    }
    document.getElementById('adKpis').innerHTML = kpis.join('');

    /* bảng theo ngày — cột đổi theo mục đích */
    const stepCols = obj.steps.map(s => `<th class="num">${s.label}</th><th class="num">${s.cp}</th>`).join('');
    const revCols = obj.hasRevenue ? `<th class="num">Doanh thu</th><th class="num">ROAS</th>` : '';
    const head = `<tr><th style="width:32px"><input type="checkbox" onchange="window.adsToggleAll(this.checked)" title="Chọn tất cả dòng đang hiện"></th><th>Ngày</th><th>Kênh</th><th>Hình thức</th><th class="num">Chi tiêu</th>${stepCols}${revCols}<th></th></tr>`;

    const rows = list.map(e => {
      const ch = chanMeta(e.channel);
      const stepCells = obj.steps.map(s => {
        const n = e[s.key] || 0;
        return `<td class="num">${window.fmt(n)}</td><td class="num" style="color:var(--muted)">${window.fmt(cp(e.spend, n))}</td>`;
      }).join('');
      const revCells = obj.hasRevenue
        ? `<td class="num">${window.fmtShort(e.revenue || 0)}</td><td class="num" style="color:${(e.revenue / (e.spend || 1)) >= 1 ? 'var(--ok)' : 'var(--danger)'}"><b>${(e.revenue / (e.spend || 1)).toFixed(2)}x</b></td>`
        : '';
      return `<tr>
        <td><input type="checkbox" class="ads-cb" value="${e.id}" onchange="window.adsSelChange()"></td>
        <td><b>${fmtD(e.date)}</b></td>
        <td><span class="tag" style="background:${ch.color}20;color:${ch.color}">${ch.icon} ${ch.label}</span></td>
        <td style="font-size:12.5px;color:var(--muted)">${e.form || '—'}</td>
        <td class="num"><b>${window.fmt(e.spend)}</b></td>
        ${stepCells}${revCells}
        <td class="num">
          <button class="icon-btn" title="Sửa" onclick="window.editAd('${e.id}')">✏️</button>
          <button class="icon-btn" title="Xóa" style="color:var(--danger)" onclick="window.deleteAd('${e.id}')">🗑</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="13" style="padding:26px;text-align:center;color:var(--muted)">Chưa có dữ liệu chi tiêu cho mục đích này. Bấm "+ Nhập chi phí ngày".</td></tr>`;

    document.getElementById('adTable').innerHTML = `<thead>${head}</thead><tbody>${rows}</tbody>`;
    if (window.adsSelChange) window.adsSelChange();   /* reset thanh chọn hàng loạt sau mỗi lần vẽ */
  }

  window.setObjective = function (id) { objective = id; render(); };
  window.setChan = function (id) { channel = id; render(); };

  function form(e) {
    const obj = objMeta(e ? e.objective : objective);
    const chanOpts = CHANS.map(c => `<option value="${c.id}" ${e && e.channel === c.id ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('');
    const objOpts = OBJS.map(o => `<option value="${o.id}" ${(e ? e.objective : objective) === o.id ? 'selected' : ''}>${o.icon} ${o.label}</option>`).join('');
    const formOpts = (window.AD_FORMS || []).map(f => `<option ${e && e.form === f ? 'selected' : ''}>${f}</option>`).join('');
    const stepInputs = obj.steps.map(s =>
      `<div><label>${s.label}</label><input id="ad_${s.key}" type="number" min="0" value="${e ? (e[s.key] || '') : ''}" placeholder="0"></div>`).join('');
    const revInput = obj.hasRevenue
      ? `<div><label>Doanh thu (₫)</label><input id="ad_revenue" type="number" min="0" value="${e ? (e.revenue || '') : ''}" placeholder="0"></div>` : '';
    return `
      <div class="form-row">
        <div><label>Ngày *</label><input id="ad_date" type="date" value="${e ? e.date : window.todayISO()}"></div>
        <div><label>Mục đích chạy *</label><select id="ad_obj" onchange="window.adFormReload(this.value)">${objOpts}</select></div>
      </div>
      <div class="form-row">
        <div><label>Kênh *</label><select id="ad_chan">${chanOpts}</select></div>
        <div><label>Hình thức</label><select id="ad_form">${formOpts}</select></div>
      </div>
      <div class="form-row">
        <div><label>Chi tiêu (₫) *</label><input id="ad_spend" type="number" min="0" value="${e ? e.spend : ''}" placeholder="0"></div>
        <div></div>
      </div>
      <div class="section-h" style="margin:10px 0 6px">📊 Kết quả (${obj.label})</div>
      <div class="form-row">${stepInputs.slice(0, stepInputs.length)}</div>
      <div class="form-row">${revInput}</div>`;
  }

  /* đổi form khi đổi mục đích trong modal */
  window.adFormReload = function (objId) {
    const cur = readForm(); cur.objective = objId;
    const e = { ...cur, id: window._editAdId || null };
    document.querySelector('#modal-bg .modal-body').innerHTML = form(window._editAdId ? { ...e, id: window._editAdId } : e);
  };

  function readForm() {
    const objId = window.formVal('#ad_obj') || objective;
    const obj = objMeta(objId);
    const o = {
      date: window.formVal('#ad_date'), objective: objId,
      channel: window.formVal('#ad_chan'), form: window.formVal('#ad_form'),
      spend: parseInt(window.formVal('#ad_spend'), 10) || 0,
      units: 0, leads: 0, custs: 0, candidates: 0, revenue: 0,
    };
    obj.steps.forEach(s => { const el = document.getElementById('ad_' + s.key); if (el) o[s.key] = parseInt(el.value, 10) || 0; });
    const rev = document.getElementById('ad_revenue'); if (rev) o.revenue = parseInt(rev.value, 10) || 0;
    return o;
  }

  /* ====== AI: nhập chi phí ads từ ảnh báo cáo ====== */
  function normDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
    if (m) { let y = m[3] || '2026'; if (y.length === 2) y = '20' + y; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return null;
  }
  const toInt = v => parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10) || 0;

  window.aiFillAds = function () {
    if (!window.AI) { window.toast('Chưa tải module AI', 'warn'); return; }
    const obj = objMeta(objective);
    window.AI.openFillModal({
      task: 'adspend',
      title: '📷 Nhập chi phí Ads từ ảnh',
      guideHtml: `Đính kèm <b>ảnh bảng báo cáo</b> theo ngày. App đọc <b>tên cột</b> rồi tự gán vào đúng field (Chi tiêu · Inbox · SĐT · Khách · Doanh thu) cho mục đích <b>${obj.label}</b> — cột phái sinh (CP/Inbox, $/SĐT) tự bỏ, cột nào ảnh không có thì để 0.`,
      /* Bắt AI CHỈ chép nguyên bảng (tên cột + giá trị) → APP tự map cột theo tên (chắc hơn để AI tự gán) */
      prompt: `Đọc BẢNG trong ảnh (báo cáo quảng cáo theo từng ngày, tiếng Việt). CHỈ CHÉP LẠI Y NGUYÊN, KHÔNG tự suy diễn hay đổi cột. Trả JSON đúng dạng:
{"headers":["tên cột 1","tên cột 2", ...],"rows":[["ô ngày","ô cột 2", ...], ...]}
- "headers" = tên TIÊU ĐỀ các cột đúng như trong ảnh, từ trái sang phải (vd: "Ngày","Chi tiêu ngày","Inbox","CP/Inbox","SDT","$/SDT","SLKH","Doanh thu").
- "rows" = mỗi phần tử là 1 NGÀY; số ô trong mỗi row = ĐÚNG số cột headers, giữ nguyên thứ tự trái→phải. Ô trống để "".
- Giữ nguyên giá trị số (có thể còn dấu chấm/đơn vị). CHỈ trả JSON, không giải thích.`,
      onResult: applyAIAds,
    });
  };

  function applyAIAds(data) {
    /* AI trả BẢNG THÔ {headers, rows} → APP tự map cột theo TÊN (chắc hơn để AI tự gán field).
       Bỏ cột phái sinh (CP/Inbox, $/SĐT, CP/Khách — chứa 'cp' hoặc '$') → SĐT không nhảy sang Inbox. */
    if (data && Array.isArray(data.headers) && Array.isArray(data.rows)) {
      const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const isCost = s => /\$|cp/i.test(String(s || ''));
      const col = re => data.headers.findIndex(h => !isCost(h) && re.test(norm(h)));
      const cD = col(/ngay|date/), cS = col(/chi tieu|chi phi|so tien|amount|spend/);
      const cU = col(/inbox|tin nhan|mess|tro chuyen|messaging/);
      const cL = col(/sdt|dien thoai|phone/);
      const cK = col(/slkh|khach|so don|don hang/);
      const cR = col(/doanh thu|revenue/);
      data = data.rows.map(r => ({
        date: cD >= 0 ? r[cD] : '', spend: cS >= 0 ? r[cS] : 0,
        units: cU >= 0 ? r[cU] : 0, leads: cL >= 0 ? r[cL] : 0,
        custs: cK >= 0 ? r[cK] : 0, candidates: 0, revenue: cR >= 0 ? r[cR] : 0,
      }));
    }
    const list = Array.isArray(data) ? data : (data.items || data.data || data.rows || []);
    if (!list.length) { window.toast('Không đọc được dòng chi phí nào từ ảnh', 'warn'); return; }
    const obj = objMeta(objective);
    const ch = channel === 'all' ? 'fb' : channel;
    const cur = all();
    const _bt = Date.now(); let n = 0, jumpMonth = null;   /* _bt = mã LÔ nhập (chung cả đợt) → xoá lô */
    list.forEach(it => {
      const date = normDate(it.date); if (!date) return;
      const spend = toInt(it.spend); if (!spend) return;
      if (!jumpMonth) jumpMonth = date.slice(0, 7);
      const rec = { date, objective, channel: ch, form: it.form || 'Mess', spend, units: 0, leads: 0, custs: 0, candidates: 0, revenue: 0 };
      obj.steps.forEach(s => { rec[s.key] = toInt(it[s.key]); });
      if (obj.hasRevenue) rec.revenue = toInt(it.revenue);
      const ex = cur.find(x => x.date === date && x.objective === objective && x.channel === ch);
      if (ex) window.STORE.update('adspend', ex.id, rec);
      else { rec.id = 'AD-imp-' + _bt + '-' + n + '-' + Math.random().toString(36).slice(2, 6); window.STORE.add('adspend', rec); }
      n++;
    });
    if (jumpMonth && jumpMonth !== month) {
      month = jumpMonth;
      try { localStorage.setItem(_MONTH_KEY, month); } catch (e) {}
      const el = document.getElementById('adsMonth'); if (el) el.value = month;
    }
    window.toast(`🤖 AI đã nhập ${n} ngày chi phí (${obj.label} · ${ch.toUpperCase()})${jumpMonth ? ' · xem tháng ' + jumpMonth.slice(5) + '/' + jumpMonth.slice(0,4) : ''}.`, n ? 'success' : 'warn');
    render();
  }

  window.openAddAd = function () {
    window._editAdId = null;
    window.openModal('+ Nhập chi phí quảng cáo ngày', form(null), {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.submitAd()">💾 Lưu</button>`,
      width: '600px',
    });
  };

  window.editAd = function (id) {
    const e = all().find(x => x.id === id); if (!e) return;
    window._editAdId = id;
    window.openModal('Sửa chi phí ' + fmtD(e.date), form(e), {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.submitAd('${id}')">💾 Cập nhật</button>`,
      width: '600px',
    });
  };

  window.submitAd = function (id) {
    const o = readForm();
    if (!o.date) { window.toast('Chọn ngày', 'warn'); return; }
    if (!o.spend) { window.toast('Nhập chi tiêu', 'warn'); return; }
    if (id) {
      window.STORE.update('adspend', id, o);
      window.toast('✓ Đã cập nhật chi phí ' + fmtD(o.date), 'success');
    } else {
      o.id = 'AD-' + Date.now();
      window.STORE.add('adspend', o);
      window.toast('✓ Đã lưu chi phí ' + fmtD(o.date), 'success');
    }
    objective = o.objective;
    window.closeModal();
    render();
  };

  window.deleteAd = function (id) {
    window.confirmDelete('Xóa dòng chi phí này?', () => {
      window.STORE.remove('adspend', id);
      window.toast('Đã xóa', 'danger');
      render();
    });
  };

  /* ============================================================
     NHẬP EXCEL CHI PHÍ ADS — auto-detect mục đích từ tên chiến dịch
     ============================================================ */
  const RECRUIT_KEYWORDS = /tuyển|recruit|hiring|HR|nhân sự|ứng viên|tuyen.dung|JD|tuyendung/i;

  function detectObjective(campaignName) {
    if (!campaignName) return 'ban-hang';
    return RECRUIT_KEYWORDS.test(campaignName) ? 'tuyen-dung' : 'ban-hang';
  }

  function detectChannel(name) {
    const s = (name || '').toLowerCase();
    if (/facebook|fb|meta|instagram|ig/.test(s)) return 'facebook';
    if (/google|gg|adwords|gads/.test(s)) return 'google';
    if (/zalo/.test(s)) return 'zalo';
    if (/tiktok|tt/.test(s)) return 'tiktok';
    if (/youtube|yt/.test(s)) return 'youtube';
    if (/shopee/.test(s)) return 'shopee';
    return 'facebook';
  }

  window.downloadAdsTemplate = function () {
    if (!window.XLSX) { window.toast('SheetJS chưa load', 'warn'); return; }
    const headers = ['Ngày (yyyy-mm-dd)','Kênh','Tên chiến dịch','Chi tiêu (₫)','Số KH','Số ứng viên','Mục đích (auto)','Ghi chú'];
    const samples = [
      ['2026-05-18','Facebook Ads','Bán rau củ T5 - Hà Nội',          850000, 6, 0, '(để trống → auto detect)', 'Targeting nhà hàng'],
      ['2026-05-18','Google Ads',  'Tuyển dụng shipper nội thành',     320000, 0, 4, '(để trống → auto detect)', 'JD đăng lên careerbuilder'],
      ['2026-05-18','Zalo',        'Combo nông sản B2B - khuyến mãi',  180000, 2, 0, '(để trống → auto detect)', ''],
      ['2026-05-16','Facebook Ads','Recruit kế toán part-time',         95000, 0, 1, '(để trống → auto detect)', ''],
    ];
    const ws = window.XLSX.utils.aoa_to_sheet([headers, ...samples]);
    ws['!cols'] = [{wch:14},{wch:14},{wch:32},{wch:14},{wch:10},{wch:10},{wch:18},{wch:30}];
    for (let i = 0; i < headers.length; i++) {
      const c = ws[window.XLSX.utils.encode_cell({r:0,c:i})];
      if (c) c.s = { font: { bold: true } };
    }
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Chi phí ads');

    const guide = window.XLSX.utils.aoa_to_sheet([
      ['HƯỚNG DẪN NHẬP CHI PHÍ QUẢNG CÁO'],
      [''],
      ['Cách điền các cột:'],
      ['1. "Ngày": format yyyy-mm-dd, vd 2026-05-18 (mặc định = hôm nay nếu trống)'],
      ['2. "Kênh": tên kênh chạy ads — Facebook Ads / Google Ads / Zalo / TikTok / YouTube / Shopee'],
      ['   → App tự nhận diện kênh từ tên kênh nhập'],
      ['3. "Tên chiến dịch": tên đầy đủ chiến dịch (copy từ Ads Manager)'],
      ['4. "Chi tiêu": số tiền VNĐ (vd: 850000 = 850k)'],
      ['5. "Số KH": số khách hàng phát sinh từ ads (cho mục đích bán hàng)'],
      ['6. "Số ứng viên": số ứng viên ứng tuyển (cho mục đích tuyển dụng)'],
      ['7. "Mục đích": ĐỂ TRỐNG — app sẽ TỰ PHÂN LOẠI dựa tên chiến dịch:'],
      ['   → Tên chứa "tuyển | recruit | HR | ứng viên | nhân sự | JD" → MỤC ĐÍCH: Tuyển dụng'],
      ['   → Ngược lại → MỤC ĐÍCH: Bán hàng'],
      ['   Hoặc nhập tay: "ban-hang" / "tuyen-dung" để override'],
      ['8. "Ghi chú": tùy chọn'],
      [''],
      ['Sau khi điền xong, lưu file và upload lại qua nút "📥 Nhập Excel".'],
      ['App sẽ append vào danh sách chi phí ads hiện tại + tự tổng hợp vào báo cáo.'],
    ]);
    guide['!cols'] = [{wch:90}];
    window.XLSX.utils.book_append_sheet(wb, guide, 'Hướng dẫn');

    window.XLSX.writeFile(wb, 'mau-nhap-chi-phi-ads-NSTT.xlsx');
    window.toast('⬇ Đã tải file mẫu', 'success');
  };

  window.openAdsExcelImport = function () {
    window.openModal('📥 Nhập chi phí quảng cáo từ Excel', `
      <div style="font-size:13px;line-height:1.6;margin-bottom:14px">
        Upload file <code>.xlsx</code> / <code>.csv</code>. App tự phân loại
        <b style="color:#16A34A">bán hàng</b> vs <b style="color:#7C3AED">tuyển dụng</b> dựa tên chiến dịch.
      </div>

      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;color:#15803D;margin-bottom:6px">📋 Bước 1: Tải file mẫu</div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">File mẫu có 4 dòng demo + sheet "Hướng dẫn" chi tiết.</div>
        <button class="btn btn-navy btn-sm" onclick="window.downloadAdsTemplate()">⬇ Tải mau-nhap-chi-phi-ads-NSTT.xlsx</button>
      </div>

      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;color:#A16207;margin-bottom:6px">📤 Bước 2: Upload file đã điền</div>
        <input type="file" id="impAdsFile" accept=".xlsx,.xls,.csv" style="display:block;width:100%;padding:8px;border:1px solid var(--line);border-radius:7px;font-size:13px;background:#fff">
      </div>

      <div id="impAdsPreview" style="font-size:12.5px;min-height:30px"></div>

      <div style="font-size:11.5px;color:var(--muted);margin-top:10px;padding:10px 12px;background:#F5F3FF;border-radius:6px;border-left:3px solid #7C3AED">
        🤖 <b>Auto-phân loại mục đích từ tên chiến dịch:</b><br>
        • Chứa từ "<b>tuyển</b>", "<b>recruit</b>", "<b>HR</b>", "<b>ứng viên</b>", "<b>nhân sự</b>", "<b>JD</b>" → <b style="color:#7C3AED">Tuyển dụng</b><br>
        • Còn lại → <b style="color:#16A34A">Bán hàng</b><br>
        Hoặc ghi đè bằng cách điền cột "Mục đích" với <code>ban-hang</code> / <code>tuyen-dung</code>.
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" id="impAdsApply" onclick="window.applyAdsImport()" disabled>📥 Nhập danh sách</button>`,
      width: '640px',
    });

    document.getElementById('impAdsFile').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!window.XLSX) {
        document.getElementById('impAdsPreview').innerHTML = '<div style="color:var(--danger)">❌ SheetJS chưa load</div>';
        return;
      }
      try {
        const buf = await f.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        window._impAdsData = data;

        /* Preview classification */
        const header = (data[0] || []).map(h => String(h || '').toLowerCase().trim());
        const ix = (keys) => header.findIndex(h => keys.some(k => h.includes(k)));
        const C = {
          campaign: ix(['chiến dịch','campaign']),
          spend: ix(['chi tiêu','spend','tiền']),
          objective: ix(['mục đích','objective']),
        };
        let bh = 0, td = 0, bhSum = 0, tdSum = 0;
        for (let r = 1; r < data.length; r++) {
          const row = data[r]; if (!row || !row.length) continue;
          const camp = C.campaign >= 0 ? String(row[C.campaign] || '') : '';
          const sp = C.spend >= 0 ? (parseInt(String(row[C.spend]).replace(/\D/g, ''), 10) || 0) : 0;
          let obj = C.objective >= 0 ? String(row[C.objective] || '').trim() : '';
          if (!obj || !/ban|tuyen/i.test(obj)) obj = detectObjective(camp);
          if (/tuyen/i.test(obj)) { td++; tdSum += sp; }
          else { bh++; bhSum += sp; }
        }
        document.getElementById('impAdsPreview').innerHTML = `
          <div style="font-weight:700;color:var(--ok);margin-bottom:8px">✓ Đọc được ${data.length - 1} dòng dữ liệu</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="padding:12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px">
              <div style="font-size:11px;color:#15803D;text-transform:uppercase;font-weight:700">🛒 Bán hàng (auto)</div>
              <div style="font-size:20px;font-weight:800;color:#15803D">${bh} chiến dịch</div>
              <div style="font-size:12px;color:var(--muted)">Tổng ${bhSum.toLocaleString('vi-VN')} ₫</div>
            </div>
            <div style="padding:12px;background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px">
              <div style="font-size:11px;color:#6D28D9;text-transform:uppercase;font-weight:700">👥 Tuyển dụng (auto)</div>
              <div style="font-size:20px;font-weight:800;color:#6D28D9">${td} chiến dịch</div>
              <div style="font-size:12px;color:var(--muted)">Tổng ${tdSum.toLocaleString('vi-VN')} ₫</div>
            </div>
          </div>`;
        document.getElementById('impAdsApply').disabled = false;
      } catch (err) {
        document.getElementById('impAdsPreview').innerHTML = '<div style="color:var(--danger)">❌ Lỗi đọc file: ' + err.message + '</div>';
      }
    });
  };

  window.applyAdsImport = function () {
    const data = window._impAdsData;
    if (!data || data.length < 2) { window.toast('File rỗng', 'warn'); return; }
    const header = data[0].map(h => String(h || '').toLowerCase().trim());
    const ix = (keys) => header.findIndex(h => keys.some(k => h.includes(k)));
    const C = {
      date: ix(['ngày','date']),
      channel: ix(['kênh','channel']),
      campaign: ix(['chiến dịch','campaign']),
      spend: ix(['chi tiêu','spend','tiền']),
      custs: ix(['số kh','khách']),
      candidates: ix(['ứng viên','candidate']),
      objective: ix(['mục đích','objective']),
      note: ix(['ghi chú','note']),
    };
    if (C.spend < 0) { window.toast('Phải có cột "Chi tiêu"', 'danger'); return; }

    const ads = window.STORE.get('adspend', window.ADSPEND || []).slice();
    const _bt = Date.now();   /* mã LÔ nhập Excel (chung cả đợt) → xoá lô */
    let added = 0, skipped = 0, jumpMonth = null;
    for (let r = 1; r < data.length; r++) {
      const row = data[r]; if (!row || !row.length) continue;
      const sp = parseInt(String(row[C.spend] || '').replace(/\D/g, ''), 10);
      if (!sp) { skipped++; continue; }
      const camp = C.campaign >= 0 ? String(row[C.campaign] || '').trim() : '(không tên)';
      let obj = C.objective >= 0 ? String(row[C.objective] || '').trim() : '';
      if (!obj || !/ban|tuyen/i.test(obj)) obj = detectObjective(camp);
      if (/tuyen/i.test(obj)) obj = 'tuyen-dung'; else obj = 'ban-hang';
      const channelRaw = C.channel >= 0 ? String(row[C.channel] || '').trim() : '';
      const channelId = detectChannel(channelRaw || camp);
      let date = C.date >= 0 ? String(row[C.date] || '').trim() : '';
      /* Excel date sometime as number → convert */
      if (date && /^\d+$/.test(date)) {
        const d = new Date(Math.round((Number(date) - 25569) * 86400 * 1000));
        date = d.toISOString().slice(0, 10);
      }
      if (!date) date = new Date().toISOString().slice(0, 10);
      if (!jumpMonth) jumpMonth = date.slice(0, 7);
      ads.unshift({
        id: 'AD-imp-' + _bt + '-' + r + '-' + Math.random().toString(36).slice(2, 5),
        date, channel: channelId,
        campaign: camp,
        spend: sp,
        objective: obj,
        custs: C.custs >= 0 ? (parseInt(row[C.custs], 10) || 0) : 0,
        candidates: C.candidates >= 0 ? (parseInt(row[C.candidates], 10) || 0) : 0,
        note: C.note >= 0 ? String(row[C.note] || '').trim() : '',
        source: 'excel-import',
      });
      added++;
    }
    window.STORE.set('adspend', ads);
    /* Nhảy tới tháng của data vừa nhập để user thấy ngay */
    if (jumpMonth && jumpMonth !== month) {
      month = jumpMonth;
      try { localStorage.setItem(_MONTH_KEY, month); } catch (e) {}
      const el = document.getElementById('adsMonth'); if (el) el.value = month;
    }
    window.closeModal();
    render();
    window.toast(`✓ Đã nhập ${added} chiến dịch · ${skipped} bỏ qua${jumpMonth ? ' · đang xem tháng ' + jumpMonth.slice(5) + '/' + jumpMonth.slice(0,4) : ''}`, 'success');
  };

  /* ===== XOÁ LÔ NHẬP chi phí ads (undo cả đợt up nhầm — gom theo mã lô trong id AD-imp-<bt>-) ===== */
  window.openAdsBatches = function () {
    const map = {};
    all().forEach(e => {
      const m = String(e.id || '').match(/^AD-imp-(\d+)-/); if (!m) return;
      const bt = m[1];
      const b = map[bt] || (map[bt] = { bt: +bt, n: 0, spend: 0, dates: new Set(), chans: new Set() });
      b.n++; b.spend += (+e.spend || 0); b.dates.add(e.date); b.chans.add(e.channel);
    });
    const batches = Object.values(map).sort((a, b) => b.bt - a.bt);
    const fmt = v => (+v || 0).toLocaleString('vi-VN');
    const tISO = ms => { const d = new Date(ms); return isNaN(d) ? '—' : d.toLocaleString('vi-VN'); };
    const rows = batches.length ? batches.map(b => {
      const chans = [...b.chans].map(c => (chanMeta(c) || {}).label || c).join(', ');
      return `<tr>
        <td style="white-space:nowrap">${tISO(b.bt)}</td>
        <td class="num"><b>${b.n}</b> dòng · <span style="color:var(--muted)">${b.dates.size} ngày</span></td>
        <td class="num">${fmt(b.spend)}đ</td>
        <td style="font-size:11px;color:var(--muted);max-width:150px">${chans}</td>
        <td><button class="btn btn-sm" style="background:#B91C1C;color:#fff" onclick="window._delAdsBatch('${b.bt}')">🗑 Xoá lô</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--muted)">Chưa có lô nhập nào (chỉ có dòng nhập tay).</td></tr>';
    window.openModal('🗑 Xoá lô nhập chi phí ads', `
      <div style="background:#FEF2F2;color:#991B1B;padding:9px 11px;border-radius:8px;font-size:12px;margin-bottom:10px;line-height:1.5">
        Mỗi dòng = <b>1 lần nhập</b> (ảnh AI / Excel). Xoá lô = xoá <b>tất cả dòng chi phí của lô đó</b>. <b>Không hoàn tác.</b>
      </div>
      <div style="max-height:380px;overflow:auto;border:1px solid var(--line);border-radius:8px">
        <table class="mini-table" style="margin:0;font-size:12px;width:100%">
          <thead><tr><th>Thời điểm nhập</th><th class="num">Số dòng</th><th class="num">Tổng chi</th><th>Kênh</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
    `, { width: '640px', footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>` });
  };
  window._delAdsBatch = function (bt) {
    const ids = all().filter(e => String(e.id || '').startsWith('AD-imp-' + bt + '-')).map(e => e.id);
    if (!ids.length) { window.toast('Lô không còn dòng nào — reload.', 'warn'); return; }
    if (!window.confirm(`Xoá LÔ này?\n\n• ${ids.length} dòng chi phí\n\nKHÔNG hoàn tác được.`)) return;
    ids.forEach(id => window.STORE.remove('adspend', id));
    window.toast(`✓ Đã xoá lô ${ids.length} dòng chi phí.`, 'success');
    setTimeout(() => { window.openAdsBatches(); render(); }, 350);
  };

  /* ===== CHỌN / SỬA / XOÁ HÀNG LOẠT ===== */
  function _adsSelIds() { return [...document.querySelectorAll('#adTable .ads-cb:checked')].map(cb => cb.value); }
  window.adsToggleAll = function (on) {
    document.querySelectorAll('#adTable .ads-cb').forEach(cb => cb.checked = on);
    window.adsSelChange();
  };
  window.adsSelChange = function () {
    const bar = document.getElementById('adsBulkBar'); if (!bar) return;
    const n = _adsSelIds().length;
    if (!n) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    const el = bar.querySelector('.ads-sel-n'); if (el) el.textContent = n;
    const sel = bar.querySelector('.ads-bulk-chan');
    if (sel && !sel.dataset.filled) {
      sel.innerHTML = '<option value="">— Đổi kênh cho dòng đã chọn… —</option>' + CHANS.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('');
      sel.dataset.filled = '1';
    }
  };
  window.adsDeleteSelected = function () {
    const ids = _adsSelIds(); if (!ids.length) return;
    if (!window.confirm(`Xoá ${ids.length} dòng chi phí đã chọn?\n\nKHÔNG hoàn tác.`)) return;
    ids.forEach(id => window.STORE.remove('adspend', id));
    window.toast(`✓ Đã xoá ${ids.length} dòng`, 'success');
    render();
  };
  window.adsBulkChannel = function (chId) {
    if (!chId) return;
    const ids = _adsSelIds(); if (!ids.length) return;
    ids.forEach(id => window.STORE.update('adspend', id, { channel: chId }));
    window.toast(`✓ Đã đổi kênh ${ids.length} dòng`, 'success');
    render();
  };

  /* init */
  window.STORE.subscribe('adspend', render);
  window.renderAppShell('adspend', 'Chi phí quảng cáo');
  /* Set giá trị input tháng = tháng hiện tại */
  setTimeout(() => { const el = document.getElementById('adsMonth'); if (el) el.value = month; }, 0);
  render();
})();
