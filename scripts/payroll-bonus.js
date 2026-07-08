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
        <button class="btn btn-primary" onclick="window.BONUS.openEntry()">➕ Ghi khoản thưởng</button>
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
    const staff = KHO_SHIP().sort((a, b) => String(a.dept).localeCompare(b.dept) || String(a.name).localeCompare(b.name));
    const orders = (S().get('orders', []) || []).filter(o => o.status !== 'draft' && o.status !== 'cancelled').slice(0, 400);
    const orderDL = orders.map(o => `<option value="${esc(o.code)}">${esc(o.code)} — ${esc(o.custName || '')}${o.weight ? ' · ' + o.weight + 'kg' : ''}</option>`).join('');
    const cur = ent || { date: (document.getElementById('payMonth') || {}).value ? _bMonth + '-' + String(new Date().getDate()).padStart(2, '0') : '', staffId: '', task: '', note: '' };
    if (!cur.date && window.todayISO) cur.date = window.todayISO().slice(0, 10);

    const farOpts = (rules.shipFar || []).map(f => `<option value="${f.id}" ${cur.farId === f.id ? 'selected' : ''}>${esc(f.name)} (+${fmt(f.amount)})</option>`).join('');
    const html = `
      <div style="display:grid;gap:11px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Ngày</label>
            <input type="date" id="beDate" value="${esc(cur.date || '')}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px"></div>
          <div><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Nhân sự (Kho / Ship)</label>
            <select id="beStaff" onchange="window.BONUS._onStaffTask()" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px">
              <option value="">— chọn NV —</option>
              ${staff.map(s => `<option value="${s.id}" data-dept="${esc(s.dept)}" ${cur.staffId === s.id ? 'selected' : ''}>${esc(s.name)} · ${esc(s.dept)}</option>`).join('')}
            </select></div>
        </div>
        <div><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Nhiệm vụ</label>
          <select id="beTask" onchange="window.BONUS._onStaffTask()" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px">
            <option value="">— chọn nhiệm vụ —</option>
            ${Object.keys(TASKS).map(k => `<option value="${k}" data-dept="${TASKS[k].dept}" ${cur.task === k ? 'selected' : ''}>${TASKS[k].icon} ${TASKS[k].dept} · ${TASKS[k].label}</option>`).join('')}
          </select></div>
        <div id="beOrderWrap" style="display:none;grid-template-columns:2fr 1fr;gap:10px">
          <div><label style="font-size:11.5px;font-weight:600;color:var(--muted)">Tên/mã đơn (chọn đơn thật → tự lấy kg, hoặc gõ tay)</label>
            <input id="beOrder" list="beOrderDL" value="${esc(cur.orderCode || cur.orderName || '')}" placeholder="NSTT-… hoặc tên đơn" onchange="window.BONUS._onOrder()" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px">
            <datalist id="beOrderDL">${orderDL}</datalist></div>
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
  function _onOrder() {
    const v = (document.getElementById('beOrder') || {}).value || '';
    const o = (S().get('orders', []) || []).find(x => String(x.code) === v.trim());
    if (o && o.weight && document.getElementById('beWeight')) document.getElementById('beWeight').value = o.weight;
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
    const staffId = (document.getElementById('beStaff') || {}).value;
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
    _onStaffTask, _onOrder, _calc, _save, _addTier, _addFar, _saveRules,
    labelOf: _labelOf,
  };
})();
