/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — THƯỞNG HỖ TRỢ Kho & Ship
   Sổ ghi hàng ngày → tự tính tiền theo quy tắc → tự cộng vào phiếu lương.
   - Kho: Hỗ trợ ship (đơn theo kg, tier) · Trực kho (/buổi)
   - Ship: Hỗ trợ ship chiều (/lần) · Đơn xa (danh mục thêm/sửa/xoá)
   Lưu KV: bonusRules (mức) + bonusLog (mảng dòng ghi). Đồng bộ đa máy.
   ========================================================= */
(function () {
  const S = () => window.STORE;
  const fmt = n => (window.fmt ? window.fmt(n) : (+n || 0).toLocaleString('vi-VN'));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let _uidN = 0;
  const uid = () => 'BN' + (Date.now ? '' : '') + (_uidN++) + Math.random().toString(36).slice(2, 7);

  /* ===== QUY TẮC (mức thưởng) — sửa được ===== */
  const DEFAULT_RULES = {
    khoShipTiers: [{ min: 31, max: 99, amount: 30000 }],   /* Kho hỗ trợ ship: đơn 31-99kg → 30k */
    khoTruc: 50000,        /* Kho trực kho / buổi */
    shipChieu: 50000,      /* Ship sáng hỗ trợ ship chiều / lần */
    shipFar: [             /* Ship đơn xa (thêm/sửa/xoá) */
      { id: 'f_lb', name: 'Lấy hàng Long Biên', amount: 120000 },
      { id: 'f_zone', name: 'Zone', amount: 50000 },
      { id: 'f_th', name: 'Tạ Hiện', amount: 50000 },
      { id: 'f_ldh', name: 'Lê Đại Hành', amount: 20000 },
      { id: 'f_panda', name: 'Panda', amount: 20000 },
    ],
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  function getRules() {
    const r = S().get('bonusRules', null);
    if (!r || typeof r !== 'object') return clone(DEFAULT_RULES);
    return Object.assign(clone(DEFAULT_RULES), r);
  }
  function saveRules(r) { S().set('bonusRules', r); }

  /* ===== SỔ GHI ===== */
  function getLog() { const a = S().get('bonusLog', []); return Array.isArray(a) ? a : []; }
  function saveLog(a) { S().set('bonusLog', a); }

  /* ===== NHIỆM VỤ ===== */
  const TASKS = {
    'kho-ship':   { dept: 'Kho', label: 'Hỗ trợ ship', icon: '🛵', needsOrder: true },
    'kho-truc':   { dept: 'Kho', label: 'Trực kho', icon: '🏭' },
    'ship-chieu': { dept: 'Ship', label: 'Hỗ trợ ship chiều', icon: '🌤️' },
    'ship-far':   { dept: 'Ship', label: 'Đơn xa', icon: '📍', needsFar: true },
  };
  const tasksForDept = dept => Object.keys(TASKS).filter(k => TASKS[k].dept === dept);

  /* ===== TÍNH TIỀN 1 dòng theo quy tắc ===== */
  function computeAmount(entry, rules) {
    rules = rules || getRules();
    switch (entry.task) {
      case 'kho-ship': {
        const w = +entry.weight || 0;
        const tier = (rules.khoShipTiers || []).find(t => w >= (+t.min || 0) && w <= (+t.max || 0));
        return tier ? (+tier.amount || 0) : 0;
      }
      case 'kho-truc':   return +rules.khoTruc || 0;
      case 'ship-chieu': return +rules.shipChieu || 0;
      case 'ship-far': {
        const f = (rules.shipFar || []).find(x => x.id === entry.farId);
        return f ? (+f.amount || 0) : 0;
      }
      default: return 0;
    }
  }

  /* ===== Tổng thưởng hỗ trợ 1 NV trong 1 tháng (dùng cho phiếu lương) ===== */
  function helperFor(staffId, month) {
    const rules = getRules();
    const entries = getLog()
      .filter(e => e.staffId === staffId && String(e.date || '').slice(0, 7) === month)
      .map(e => ({ ...e, amount: (e.amount != null ? +e.amount : computeAmount(e, rules)) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const total = entries.reduce((s, e) => s + (+e.amount || 0), 0);
    return { total, entries };
  }

  /* ===== Helpers dữ liệu ===== */
  const KHO_SHIP = () => (S().get('staff', window.STAFFS || []) || [])
    .filter(s => s.status === 'active' && /^(Kho|Ship)$/.test(String(s.dept || '')));
  const staffById = id => (S().get('staff', window.STAFFS || []) || []).find(s => s.id === id) || {};
  const _labelOf = e => {
    const t = TASKS[e.task] || {};
    if (e.task === 'kho-ship') return `${t.label} · ${esc(e.orderName || e.orderCode || '?')}${e.weight ? ' (' + e.weight + 'kg)' : ''}`;
    if (e.task === 'ship-far') { const f = (getRules().shipFar || []).find(x => x.id === e.farId); return `${t.label} · ${esc(f ? f.name : '?')}`; }
    return t.label || e.task;
  };

  /* ===== STATE ===== */
  let _bMonth = null;

  /* ===== RENDER TAB ===== */
  function renderBonusTab() {
    if (!_bMonth) _bMonth = (document.getElementById('payMonth') || {}).value || (window.todayISO ? window.todayISO().slice(0, 7) : '2026-07');
    const host = document.getElementById('payView');
    if (!host) return;
    const rules = getRules();
    const monthLog = getLog().filter(e => String(e.date || '').slice(0, 7) === _bMonth);
    /* gom theo NV để tổng nhanh */
    const byStaff = {};
    monthLog.forEach(e => { const a = (e.amount != null ? +e.amount : computeAmount(e, rules)); (byStaff[e.staffId] = byStaff[e.staffId] || { total: 0, n: 0 }); byStaff[e.staffId].total += a; byStaff[e.staffId].n++; });
    const grandTotal = Object.values(byStaff).reduce((s, x) => s + x.total, 0);

    const rowsHtml = monthLog
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map(e => {
        const st = staffById(e.staffId);
        const amt = (e.amount != null ? +e.amount : computeAmount(e, rules));
        const t = TASKS[e.task] || {};
        return `<tr>
          <td style="white-space:nowrap">${esc((e.date || '').split('-').reverse().join('/'))}</td>
          <td><b>${esc(st.name || e.staffName || '?')}</b><div style="font-size:11px;color:var(--muted)">${esc(st.dept || t.dept || '')}</div></td>
          <td>${t.icon || ''} ${_labelOf(e)}</td>
          <td class="num" style="font-weight:700;color:#15803D;white-space:nowrap">${amt ? '+' + fmt(amt) : '<span style="color:#B45309">0 · chưa đủ ĐK</span>'}</td>
          <td style="font-size:12px;color:var(--muted)">${esc(e.note || '')}</td>
          <td class="num" style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" style="padding:2px 7px" onclick="window.BONUS.openEntry('${e.id}')" title="Sửa">✏️</button>
            <button class="btn btn-ghost btn-sm" style="padding:2px 7px;color:#B91C1C" onclick="window.BONUS.delEntry('${e.id}')" title="Xoá">🗑</button>
          </td>
        </tr>`;
      }).join('');

    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div style="font-size:12.5px;color:var(--muted)">Sổ thưởng hỗ trợ tháng <b style="color:var(--navy)">${_bMonth.slice(5)}/${_bMonth.slice(0, 4)}</b> · ${monthLog.length} khoản · Σ <b style="color:#15803D">${fmt(grandTotal)}đ</b> → tự cộng vào phiếu lương.</div>
        <div style="flex:1"></div>
        <button class="btn btn-ghost" onclick="window.BONUS.openRules()" title="Sửa mức thưởng">⚙ Cấu hình mức thưởng</button>
        <button class="btn btn-primary" onclick="window.BONUS.openBatch()">➕ Ghi phiếu thưởng</button>
      </div>
      <div style="overflow:auto;border:1px solid var(--line);border-radius:10px;background:#fff">
        <table class="mini-table" style="width:100%;border-collapse:separate;border-spacing:0">
          <thead><tr style="background:#F9FAFB">
            <th style="text-align:left;padding:10px 12px">Ngày</th>
            <th style="text-align:left;padding:10px 12px">Nhân sự</th>
            <th style="text-align:left;padding:10px 12px">Nhiệm vụ</th>
            <th class="num" style="padding:10px 12px">Số tiền</th>
            <th style="text-align:left;padding:10px 12px">Ghi chú</th>
            <th class="num" style="padding:10px 12px">Sửa</th>
          </tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="6" style="padding:34px;text-align:center;color:var(--muted)">Chưa có khoản thưởng nào tháng này. Bấm <b>➕ Ghi khoản thưởng</b> để thêm.</td></tr>`}</tbody>
        </table>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:10px">💡 Ghi hằng ngày ai hỗ trợ việc gì — hệ thống tự tính tiền theo mức đã cấu hình. Cuối tháng tổng của mỗi NV tự vào cột <b>Thưởng</b> ở bảng lương (mở phiếu lương xem chi tiết từng ngày).</div>`;
  }

  /* ===== MODAL: Ghi / sửa khoản thưởng ===== */
  function openEntry(id) {
    const rules = getRules();
    const ent = id ? getLog().find(e => e.id === id) : null;
    const cur = ent || { date: (document.getElementById('payMonth') || {}).value ? _bMonth + '-' + String(new Date().getDate()).padStart(2, '0') : '', staffId: '', task: '', note: '' };
    if (!cur.date && window.todayISO) cur.date = window.todayISO().slice(0, 10);
    const curStaffName = cur.staffId ? (staffById(cur.staffId).name || '') : '';

    const farOpts = (rules.shipFar || []).map(f => `<option value="${f.id}" ${cur.farId === f.id ? 'selected' : ''}>${esc(f.name)} (+${fmt(f.amount)})</option>`).join('');
    const html = `
      <style>
        .be-ac{position:absolute;left:0;right:0;top:100%;z-index:60;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);max-height:250px;overflow:auto;display:none;margin-top:2px}
        .be-ac-grp{padding:5px 10px;font-size:10px;font-weight:700;color:#15803D;background:#F0FDF4;text-transform:uppercase;letter-spacing:.3px;position:sticky;top:0}
        .be-ac-item{padding:7px 11px;font-size:13px;cursor:pointer}
        .be-ac-item:hover{background:#EFF9F0}
      </style>
      <div style="display:grid;gap:11px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Ngày</label>
            <input type="date" id="beDate" value="${esc(cur.date || '')}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px"></div>
          <div style="position:relative"><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Nhân sự (Kho / Ship) — gõ tên để tìm</label>
            <input id="beStaff" autocomplete="off" value="${esc(curStaffName)}" placeholder="Gõ tên NV… (bỏ trống = xem theo phòng)"
              oninput="window.BONUS._acStaff(this.value)" onfocus="window.BONUS._acStaff(this.value)" onblur="window.BONUS._hideAc('beStaffSug')"
              style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px">
            <input type="hidden" id="beStaffId" value="${esc(cur.staffId || '')}">
            <div id="beStaffSug" class="be-ac"></div></div>
        </div>
        <div><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Nhiệm vụ</label>
          <select id="beTask" onchange="window.BONUS._onStaffTask()" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px">
            <option value="">— chọn nhiệm vụ —</option>
            ${Object.keys(TASKS).map(k => `<option value="${k}" data-dept="${TASKS[k].dept}" ${cur.task === k ? 'selected' : ''}>${TASKS[k].icon} ${TASKS[k].dept} · ${TASKS[k].label}</option>`).join('')}
          </select></div>
        <div id="beOrderWrap" style="display:none;grid-template-columns:2fr 1fr;gap:10px">
          <div style="position:relative"><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Tên/mã đơn — gõ để tìm (tự lấy kg), hoặc gõ tay</label>
            <input id="beOrder" autocomplete="off" value="${esc(cur.orderCode || cur.orderName || '')}" placeholder="Gõ mã/tên đơn…"
              oninput="window.BONUS._acOrder(this.value)" onfocus="window.BONUS._acOrder(this.value)" onblur="window.BONUS._hideAc('beOrderSug')"
              style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px">
            <div id="beOrderSug" class="be-ac"></div></div>
          <div><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Trọng lượng (kg)</label>
            <input id="beWeight" type="number" min="0" step="0.1" value="${cur.weight != null ? cur.weight : ''}" placeholder="kg" oninput="window.BONUS._calc()" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px;text-align:right;font-weight:700"></div>
        </div>
        <div id="beFarWrap" style="display:none">
          <label style="font-size:11.5px;font-weight:600;color:var(--muted)">Loại đơn xa</label>
          <select id="beFar" onchange="window.BONUS._calc()" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px"><option value="">— chọn —</option>${farOpts}</select>
        </div>
        <div><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Ghi chú</label>
          <input id="beNote" value="${esc(cur.note || '')}" placeholder="(tuỳ chọn)" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px"></div>
        <div id="beAmt" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:10px 12px;font-size:13px;font-weight:700;color:#15803D">Số tiền thưởng: <span id="beAmtVal">0đ</span></div>
      </div>`;
    window.openModal(id ? '✏️ Sửa khoản thưởng' : '➕ Ghi khoản thưởng hỗ trợ', html, {
      width: '560px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
               <button class="btn btn-primary" onclick="window.BONUS._save('${id || ''}')">💾 Lưu khoản</button>`,
    });
    setTimeout(() => { _onStaffTask(); _calc(); }, 30);
  }
  /* Hiện/ẩn ô theo nhiệm vụ + lọc nhiệm vụ theo phòng NV đang chọn */
  function _onStaffTask() {
    const task = (document.getElementById('beTask') || {}).value || '';
    const t = TASKS[task] || {};
    const ow = document.getElementById('beOrderWrap'); if (ow) ow.style.display = t.needsOrder ? 'grid' : 'none';
    const fw = document.getElementById('beFarWrap'); if (fw) fw.style.display = t.needsFar ? 'block' : 'none';
    _calc();
  }
  /* Chọn đơn thật → tự lấy kg */
  const _norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
  function _hideAc(id) { setTimeout(() => { const b = document.getElementById(id); if (b) b.style.display = 'none'; }, 160); }
  /* Autocomplete NHÂN SỰ: gõ tên → gợi ý; bỏ trống → nhóm theo phòng ban */
  function _acStaff(q) {
    const box = document.getElementById('beStaffSug'); if (!box) return;
    const nq = _norm(q);
    const list = KHO_SHIP().sort((a, b) => String(a.dept).localeCompare(String(b.dept)) || String(a.name).localeCompare(String(b.name)));
    const fil = nq ? list.filter(s => _norm(s.name).includes(nq) || _norm(s.role).includes(nq)) : list;
    if (!fil.length) { box.innerHTML = '<div class="be-ac-item" style="color:var(--muted)">Không thấy NV khớp</div>'; box.style.display = 'block'; return; }
    const g = {}; fil.forEach(s => { (g[s.dept] = g[s.dept] || []).push(s); });
    box.innerHTML = Object.keys(g).map(d => `<div class="be-ac-grp">${esc(d)}</div>` + g[d].map(s => `<div class="be-ac-item" onmousedown="window.BONUS._pickStaff('${s.id}')">${esc(s.name)} <span style="color:var(--muted);font-size:11px">· ${esc(s.role || '')}</span></div>`).join('')).join('');
    box.style.display = 'block';
  }
  function _pickStaff(id) {
    const s = staffById(id);
    const inp = document.getElementById('beStaff'); if (inp) inp.value = s.name || '';
    const hid = document.getElementById('beStaffId'); if (hid) hid.value = id;
    const box = document.getElementById('beStaffSug'); if (box) box.style.display = 'none';
    _onStaffTask();
  }
  /* Autocomplete ĐƠN HÀNG: gõ mã/tên → gợi ý; bỏ trống → 12 đơn mới nhất. Chọn → tự lấy kg */
  function _acOrder(q) {
    const box = document.getElementById('beOrderSug'); if (!box) return;
    const nq = _norm(q);
    let list = (S().get('orders', []) || []).filter(o => o.status !== 'draft' && o.status !== 'cancelled');
    list.sort((a, b) => String(b.code).localeCompare(String(a.code)));
    list = (nq ? list.filter(o => _norm(String(o.code) + ' ' + (o.custName || '')).includes(nq)) : list).slice(0, nq ? 30 : 12);
    if (!list.length) { box.style.display = 'none'; return; }
    box.innerHTML = list.map(o => `<div class="be-ac-item" onmousedown="window.BONUS._pickOrder('${esc(String(o.code))}')"><b>${esc(o.code)}</b> <span style="color:var(--muted);font-size:11px">· ${esc(o.custName || '')}${o.weight ? ' · ' + o.weight + 'kg' : ''}</span></div>`).join('');
    box.style.display = 'block';
  }
  function _pickOrder(code) {
    const o = (S().get('orders', []) || []).find(x => String(x.code) === code);
    const inp = document.getElementById('beOrder'); if (inp) inp.value = code;
    if (o && o.weight && document.getElementById('beWeight')) document.getElementById('beWeight').value = o.weight;
    const box = document.getElementById('beOrderSug'); if (box) box.style.display = 'none';
    _calc();
  }
  /* Tính lại số tiền hiển thị */
  function _calc() {
    const task = (document.getElementById('beTask') || {}).value || '';
    const entry = { task, weight: (document.getElementById('beWeight') || {}).value, farId: (document.getElementById('beFar') || {}).value };
    const amt = computeAmount(entry, getRules());
    const el = document.getElementById('beAmtVal');
    if (el) {
      el.textContent = amt ? '+' + fmt(amt) + 'đ' : (task === 'kho-ship' ? '0đ — đơn không nằm trong 31–99kg (chưa đủ điều kiện)' : '0đ');
      el.parentElement.style.background = amt ? '#F0FDF4' : '#FEF3C7';
      el.parentElement.style.borderColor = amt ? '#BBF7D0' : '#FDE68A';
      el.style.color = amt ? '#15803D' : '#B45309';
    }
  }
  function _save(id) {
    const staffId = (document.getElementById('beStaffId') || {}).value;
    const task = (document.getElementById('beTask') || {}).value;
    const date = (document.getElementById('beDate') || {}).value;
    if (!date || !staffId || !task) { window.toast?.('Điền đủ Ngày · Nhân sự · Nhiệm vụ', 'warn'); return; }
    const t = TASKS[task];
    const st = staffById(staffId);
    if (st.dept && t.dept && st.dept !== t.dept) { window.toast?.(`NV ${st.name} thuộc ${st.dept} — không khớp nhiệm vụ ${t.dept}`, 'warn'); return; }
    const orderCode = (document.getElementById('beOrder') || {}).value || '';
    const weight = t.needsOrder ? (+((document.getElementById('beWeight') || {}).value) || 0) : null;
    const farId = t.needsFar ? ((document.getElementById('beFar') || {}).value || '') : null;
    if (t.needsFar && !farId) { window.toast?.('Chọn loại đơn xa', 'warn'); return; }
    const entry = { task, weight, farId, orderCode };
    const amount = computeAmount(entry, getRules());
    const rec = {
      id: id || uid(), date, staffId, staffName: st.name || '', dept: st.dept || t.dept,
      task, orderCode: t.needsOrder ? orderCode : '', orderName: t.needsOrder ? orderCode : '',
      weight, farId, amount, note: (document.getElementById('beNote') || {}).value || '',
      updatedAt: new Date().toISOString(),
    };
    const log = getLog();
    const ix = log.findIndex(e => e.id === rec.id);
    if (ix >= 0) log[ix] = Object.assign(log[ix], rec); else log.unshift(rec);
    saveLog(log);
    window.closeModal?.();
    window.toast?.(amount ? `✓ Ghi thưởng +${fmt(amount)}đ cho ${rec.staffName}` : '✓ Đã ghi (0đ — chưa đủ điều kiện)', amount ? 'success' : 'warn');
    renderBonusTab();
    window.renderPayrollPublic && window.renderPayrollPublic();
  }
  function delEntry(id) {
    if (!confirm('Xoá khoản thưởng này?')) return;
    saveLog(getLog().filter(e => e.id !== id));
    window.toast?.('🗑 Đã xoá', 'danger');
    renderBonusTab();
  }

  /* ===== MODAL: GHI PHIẾU (nhiều khoản 1 lần cho 1 NV) =====
     Chọn NV 1 lần → thêm nhiều DÒNG (mỗi dòng: ngày · nhiệm vụ · đơn/kg/đơn xa) → lưu tất cả. */
  let _rowSeq = 0;
  function openBatch() {
    _rowSeq = 0;
    const html = `
      <style>
        .be-ac{position:absolute;left:0;right:0;top:100%;z-index:60;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);max-height:220px;overflow:auto;display:none;margin-top:2px}
        .be-ac-grp{padding:5px 10px;font-size:10px;font-weight:700;color:#15803D;background:#F0FDF4;text-transform:uppercase;position:sticky;top:0}
        .be-ac-item{padding:7px 11px;font-size:13px;cursor:pointer}.be-ac-item:hover{background:#EFF9F0}
      </style>
      <div style="display:grid;gap:11px">
        <div style="position:relative"><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Nhân sự (Kho / Ship) — gõ tên</label>
          <input id="beStaff" autocomplete="off" placeholder="Gõ tên NV… (bỏ trống = xem theo phòng)"
            oninput="window.BONUS._acStaff(this.value)" onfocus="window.BONUS._acStaff(this.value)" onblur="window.BONUS._hideAc('beStaffSug')"
            style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px">
          <input type="hidden" id="beStaffId" value="">
          <div id="beStaffSug" class="be-ac"></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
          <b style="font-size:12.5px;color:var(--navy)">Các khoản hỗ trợ</b>
          <button class="btn btn-ghost btn-sm" style="font-size:12px" onclick="window.BONUS._addRow()">➕ Thêm dòng</button>
        </div>
        <div id="beRows"></div>
        <div id="beBatchTotal" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:9px 12px;font-size:13px;color:#15803D">Tổng phiếu: <b>+0đ</b> · <b>0</b> khoản</div>
      </div>`;
    window.openModal('➕ Ghi phiếu thưởng hỗ trợ (nhiều khoản)', html, {
      width: '660px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
               <button class="btn btn-primary" onclick="window.BONUS._saveBatch()">💾 Lưu tất cả</button>`,
    });
    setTimeout(() => { _addRow(); _addRow(); }, 30);   /* mở sẵn 2 dòng */
  }
  function _rowHtml(idx, date) {
    const far = (getRules().shipFar || []).map(f => `<option value="${f.id}">${esc(f.name)} (+${fmt(f.amount)})</option>`).join('');
    const inp = 'padding:6px;border:1px solid var(--line);border-radius:6px;font-size:12px';
    return `<div class="be-row" data-idx="${idx}" style="border:1px solid #E6ECE4;border-radius:8px;padding:8px 10px;margin-bottom:8px;background:#fff">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input type="date" class="be-r-date" value="${esc(date)}" style="${inp}">
        <select class="be-r-task" onchange="window.BONUS._rowTask(${idx})" style="${inp}">
          <option value="">— nhiệm vụ —</option>
          ${Object.keys(TASKS).map(k => `<option value="${k}">${TASKS[k].icon} ${TASKS[k].dept}·${TASKS[k].label}</option>`).join('')}
        </select>
        <div class="be-r-order" style="display:none;position:relative;flex:1;min-width:150px">
          <input class="be-r-ord" autocomplete="off" placeholder="Gõ mã/tên đơn…" oninput="window.BONUS._acOrderRow(${idx})" onfocus="window.BONUS._acOrderRow(${idx})" onblur="window.BONUS._hideAcEl(this.nextElementSibling)" style="width:100%;${inp}">
          <div class="be-r-ordsug be-ac"></div>
        </div>
        <input type="number" class="be-r-wt" min="0" step="0.1" placeholder="kg" oninput="window.BONUS._rowCalc(${idx})" style="display:none;width:62px;text-align:right;${inp}">
        <select class="be-r-far" onchange="window.BONUS._rowCalc(${idx})" style="display:none;${inp}"><option value="">— đơn xa —</option>${far}</select>
        <span class="be-r-amt" style="font-weight:700;color:#15803D;min-width:62px;text-align:right;font-size:12.5px">+0đ</span>
        <button onclick="window.BONUS._removeRow(${idx})" title="Xoá dòng" style="border:none;background:none;color:#B91C1C;cursor:pointer;font-size:14px">✕</button>
      </div>
      <input class="be-r-note" placeholder="ghi chú (tuỳ chọn)" style="width:100%;margin-top:5px;${inp}">
    </div>`;
  }
  function _addRow() {
    const box = document.getElementById('beRows'); if (!box) return;
    const idx = _rowSeq++;
    const date = window.todayISO ? window.todayISO().slice(0, 10) : '';
    const d = document.createElement('div'); d.innerHTML = _rowHtml(idx, date);
    box.appendChild(d.firstElementChild);
  }
  function _rowOf(idx) { return document.querySelector('.be-row[data-idx="' + idx + '"]'); }
  function _rowTask(idx) {
    const row = _rowOf(idx); if (!row) return;
    const t = TASKS[row.querySelector('.be-r-task').value] || {};
    row.querySelector('.be-r-order').style.display = t.needsOrder ? 'block' : 'none';
    row.querySelector('.be-r-wt').style.display = t.needsOrder ? 'block' : 'none';
    row.querySelector('.be-r-far').style.display = t.needsFar ? 'block' : 'none';
    _rowCalc(idx);
  }
  function _rowEntry(row) {
    return { task: row.querySelector('.be-r-task').value, weight: row.querySelector('.be-r-wt').value, farId: row.querySelector('.be-r-far').value };
  }
  function _rowCalc(idx) {
    const row = _rowOf(idx); if (!row) return;
    const e = _rowEntry(row); const amt = computeAmount(e, getRules());
    const el = row.querySelector('.be-r-amt');
    el.textContent = amt ? '+' + fmt(amt) : (e.task === 'kho-ship' ? '0 (ngoài 31-99kg)' : '0');
    el.style.color = amt ? '#15803D' : '#B45309';
    _batchTotal();
  }
  function _batchTotal() {
    let total = 0, n = 0; const rules = getRules();
    document.querySelectorAll('.be-row').forEach(row => { const e = _rowEntry(row); if (!e.task) return; total += computeAmount(e, rules); n++; });
    const el = document.getElementById('beBatchTotal');
    if (el) el.innerHTML = `Tổng phiếu: <b style="color:#15803D">+${fmt(total)}đ</b> · <b>${n}</b> khoản`;
  }
  function _removeRow(idx) { const row = _rowOf(idx); if (row) row.remove(); _batchTotal(); }
  function _hideAcEl(el) { setTimeout(() => { if (el) el.style.display = 'none'; }, 160); }
  function _acOrderRow(idx) {
    const row = _rowOf(idx); if (!row) return;
    const inp = row.querySelector('.be-r-ord'); const box = row.querySelector('.be-r-ordsug');
    const nq = _norm(inp.value);
    let list = (S().get('orders', []) || []).filter(o => o.status !== 'draft' && o.status !== 'cancelled');
    list.sort((a, b) => String(b.code).localeCompare(String(a.code)));
    list = (nq ? list.filter(o => _norm(String(o.code) + ' ' + (o.custName || '')).includes(nq)) : list).slice(0, nq ? 30 : 12);
    if (!list.length) { box.style.display = 'none'; return; }
    box.innerHTML = list.map(o => `<div class="be-ac-item" onmousedown="window.BONUS._pickOrderRow(${idx},'${esc(String(o.code))}')"><b>${esc(o.code)}</b> <span style="color:var(--muted);font-size:11px">· ${esc(o.custName || '')}${o.weight ? ' · ' + o.weight + 'kg' : ''}</span></div>`).join('');
    box.style.display = 'block';
  }
  function _pickOrderRow(idx, code) {
    const row = _rowOf(idx); if (!row) return;
    const o = (S().get('orders', []) || []).find(x => String(x.code) === code);
    row.querySelector('.be-r-ord').value = code;
    if (o && o.weight) row.querySelector('.be-r-wt').value = o.weight;
    row.querySelector('.be-r-ordsug').style.display = 'none';
    _rowCalc(idx);
  }
  function _saveBatch() {
    const staffId = (document.getElementById('beStaffId') || {}).value;
    if (!staffId) { window.toast?.('Chọn nhân sự trước (gõ tên)', 'warn'); return; }
    const st = staffById(staffId);
    const rules = getRules();
    const toAdd = []; let skip = 0;
    document.querySelectorAll('.be-row').forEach(row => {
      const date = row.querySelector('.be-r-date').value;
      const task = row.querySelector('.be-r-task').value;
      if (!date || !task) { skip++; return; }
      const t = TASKS[task];
      if (st.dept && t.dept && st.dept !== t.dept) { skip++; return; }
      const weight = t.needsOrder ? (+row.querySelector('.be-r-wt').value || 0) : null;
      const farId = t.needsFar ? (row.querySelector('.be-r-far').value || '') : null;
      if (t.needsFar && !farId) { skip++; return; }
      const orderCode = t.needsOrder ? (row.querySelector('.be-r-ord').value || '') : '';
      toAdd.push({
        id: uid(), date, staffId, staffName: st.name || '', dept: st.dept || t.dept,
        task, orderCode, orderName: orderCode, weight, farId,
        amount: computeAmount({ task, weight, farId }, rules),
        note: row.querySelector('.be-r-note').value || '', updatedAt: new Date().toISOString(),
      });
    });
    if (!toAdd.length) { window.toast?.('Chưa có dòng hợp lệ — điền Ngày + Nhiệm vụ (khớp phòng NV)', 'warn'); return; }
    const log = getLog(); toAdd.forEach(r => log.unshift(r)); saveLog(log);
    window.closeModal?.();
    const total = toAdd.reduce((s, r) => s + r.amount, 0);
    window.toast?.(`✓ Lưu ${toAdd.length} khoản cho ${st.name} (+${fmt(total)}đ)${skip ? ` · bỏ ${skip} dòng thiếu/lệch phòng` : ''}`, 'success');
    renderBonusTab();
    window.renderPayrollPublic && window.renderPayrollPublic();
  }

  /* ===== MODAL: cấu hình mức thưởng ===== */
  function openRules() {
    const r = getRules();
    const tierRows = (r.khoShipTiers || []).map((t, i) => `<div class="br-tier" style="display:grid;grid-template-columns:1fr 1fr 1.2fr 30px;gap:6px;align-items:center;margin-bottom:5px">
        <input type="number" class="br-min" value="${t.min}" placeholder="từ kg" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right">
        <input type="number" class="br-max" value="${t.max}" placeholder="đến kg" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right">
        <input type="number" class="br-amt" value="${t.amount}" placeholder="thưởng" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700">
        <button onclick="this.closest('.br-tier').remove()" style="border:none;background:none;color:#B91C1C;cursor:pointer">✕</button>
      </div>`).join('');
    const farRows = (r.shipFar || []).map(f => `<div class="br-far" data-id="${f.id}" style="display:grid;grid-template-columns:2fr 1.2fr 30px;gap:6px;align-items:center;margin-bottom:5px">
        <input type="text" class="br-far-name" value="${esc(f.name)}" placeholder="Tên tuyến/điểm" style="padding:6px;border:1px solid var(--line);border-radius:6px">
        <input type="number" class="br-far-amt" value="${f.amount}" placeholder="thưởng" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700">
        <button onclick="this.closest('.br-far').remove()" style="border:none;background:none;color:#B91C1C;cursor:pointer">✕</button>
      </div>`).join('');
    const html = `
      <div style="display:grid;gap:14px;font-size:13px">
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:9px;padding:11px 13px">
          <div style="font-weight:800;color:#15803D;margin-bottom:8px">📦 KHO</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:5px">Hỗ trợ ship — theo trọng lượng đơn (từ–đến kg → thưởng/đơn):</div>
          <div id="brTiers">${tierRows}</div>
          <button class="btn btn-ghost btn-sm" onclick="window.BONUS._addTier()" style="font-size:11.5px;margin-bottom:8px">➕ Thêm mốc kg</button>
          <div style="display:flex;align-items:center;gap:8px"><label style="flex:1">Trực kho (/buổi)</label>
            <input type="number" id="brTruc" value="${r.khoTruc}" style="width:130px;padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700"></div>
        </div>
        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:9px;padding:11px 13px">
          <div style="font-weight:800;color:#1E40AF;margin-bottom:8px">🛵 SHIP</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><label style="flex:1">Ship sáng hỗ trợ ship chiều (/lần)</label>
            <input type="number" id="brChieu" value="${r.shipChieu}" style="width:130px;padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700"></div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:5px">Đơn xa — danh mục (thêm/sửa/xoá):</div>
          <div id="brFar">${farRows}</div>
          <button class="btn btn-ghost btn-sm" onclick="window.BONUS._addFar()" style="font-size:11.5px">➕ Thêm tuyến đơn xa</button>
        </div>
      </div>`;
    window.openModal('⚙ Cấu hình mức thưởng hỗ trợ', html, {
      width: '600px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
               <button class="btn btn-primary" onclick="window.BONUS._saveRules()">💾 Lưu mức thưởng</button>`,
    });
  }
  function _addTier() {
    const w = document.getElementById('brTiers'); if (!w) return;
    const d = document.createElement('div'); d.innerHTML = `<div class="br-tier" style="display:grid;grid-template-columns:1fr 1fr 1.2fr 30px;gap:6px;align-items:center;margin-bottom:5px">
      <input type="number" class="br-min" placeholder="từ kg" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right">
      <input type="number" class="br-max" placeholder="đến kg" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right">
      <input type="number" class="br-amt" placeholder="thưởng" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700">
      <button onclick="this.closest('.br-tier').remove()" style="border:none;background:none;color:#B91C1C;cursor:pointer">✕</button></div>`;
    w.appendChild(d.firstElementChild);
  }
  function _addFar() {
    const w = document.getElementById('brFar'); if (!w) return;
    const d = document.createElement('div'); d.innerHTML = `<div class="br-far" data-id="f_${uid()}" style="display:grid;grid-template-columns:2fr 1.2fr 30px;gap:6px;align-items:center;margin-bottom:5px">
      <input type="text" class="br-far-name" placeholder="Tên tuyến/điểm" style="padding:6px;border:1px solid var(--line);border-radius:6px">
      <input type="number" class="br-far-amt" placeholder="thưởng" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700">
      <button onclick="this.closest('.br-far').remove()" style="border:none;background:none;color:#B91C1C;cursor:pointer">✕</button></div>`;
    w.appendChild(d.firstElementChild);
  }
  function _saveRules() {
    const tiers = Array.from(document.querySelectorAll('#brTiers .br-tier')).map(el => ({
      min: +el.querySelector('.br-min').value || 0, max: +el.querySelector('.br-max').value || 0, amount: +el.querySelector('.br-amt').value || 0,
    })).filter(t => t.max > 0 && t.amount > 0);
    const shipFar = Array.from(document.querySelectorAll('#brFar .br-far')).map(el => ({
      id: el.dataset.id, name: el.querySelector('.br-far-name').value.trim(), amount: +el.querySelector('.br-far-amt').value || 0,
    })).filter(f => f.name);
    const r = {
      khoShipTiers: tiers.length ? tiers : DEFAULT_RULES.khoShipTiers,
      khoTruc: +document.getElementById('brTruc').value || 0,
      shipChieu: +document.getElementById('brChieu').value || 0,
      shipFar,
    };
    saveRules(r);
    window.closeModal?.();
    window.toast?.('✓ Đã lưu mức thưởng', 'success');
    renderBonusTab();
    window.renderPayrollPublic && window.renderPayrollPublic();
  }

  function setBonusMonth(m) { _bMonth = m; renderBonusTab(); }

  window.BONUS = {
    getRules, saveRules, getLog, saveLog, computeAmount, helperFor, TASKS,
    renderBonusTab, openEntry, delEntry, openRules, setBonusMonth,
    _onStaffTask, _calc, _save, _addTier, _addFar, _saveRules,
    _acStaff, _pickStaff, _acOrder, _pickOrder, _hideAc,
    openBatch, _addRow, _rowTask, _rowCalc, _removeRow, _acOrderRow, _pickOrderRow, _hideAcEl, _saveBatch,
    labelOf: _labelOf,
  };
})();
