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

  /* ===== QUY TẮC (mức thưởng) — TÁCH RIÊNG 2 KHỐI: KHO và SHIP ===== */
  const DEFAULT_KHO = {
    khoShipTiers: [{ min: 31, max: 99, amount: 30000 }],   /* Kho hỗ trợ ship: đơn 31-99kg → 30k */
    khoTruc: 50000,        /* Trực kho / BUỔI (sáng hoặc chiều) */
  };
  const DEFAULT_SHIP = {
    shipChieu: 50000,      /* Ship sáng hỗ trợ ship chiều / lần */
    shipFar: [             /* Ship đơn xa (thêm/sửa/xoá) */
      { id: 'f_lb', name: 'Lấy hàng Long Biên', amount: 120000 },
      { id: 'f_zone', name: 'Zone', amount: 50000 },
      { id: 'f_th', name: 'Tạ Hiện', amount: 50000 },
      { id: 'f_ldh', name: 'Lê Đại Hành', amount: 20000 },
      { id: 'f_panda', name: 'Panda', amount: 20000 },
    ],
  };
  const DEFAULT_OF = { kho: DEFAULT_KHO, ship: DEFAULT_SHIP };
  const GROUPS = ['kho', 'ship'];
  const GROUP_LABEL = { kho: '📦 Kho', ship: '🛵 Ship' };
  const DEFAULT_RULES = Object.assign({}, DEFAULT_KHO, DEFAULT_SHIP);   /* chỉ dùng cho gợi ý UI */

  const clone = o => JSON.parse(JSON.stringify(o));
  const _pid = () => 'qc' + (_uidN++) + Math.random().toString(36).slice(2, 6);
  const _today = () => (window.todayISO ? window.todayISO() : new Date().toISOString()).slice(0, 10);

  /* ===== QUY CHẾ THƯỞNG — mỗi quy chế có KHOẢNG NGÀY hiệu lực =====
     Lưu KV bonusRules = { schema:3, kho:[...], ship:[...] }
     · Kho và Ship là 2 danh sách quy chế ĐỘC LẬP (ngày hiệu lực riêng, mức riêng).
     · from/to rỗng = mở vô hạn phía đó · bao gồm cả 2 đầu (inclusive)
     · Tiền của 1 khoản LUÔN tra theo quy chế phủ NGÀY của khoản đó
       → sửa mức hôm nay KHÔNG làm đổi tiền của các ngày thuộc quy chế cũ. */
  function _normPolicy(p, group) {
    return {
      id: p.id || _pid(),
      name: p.name || 'Quy chế',
      from: p.from || '',
      to: p.to || '',
      rules: Object.assign(clone(DEFAULT_OF[group]), p.rules || {}),
    };
  }
  function getPolicies(group) {
    group = GROUPS.indexOf(group) >= 0 ? group : 'kho';
    const raw = S().get('bonusRules', null);

    /* schema 3 — đã tách Kho/Ship */
    if (raw && Array.isArray(raw[group]) && raw[group].length) {
      return raw[group].map(p => _normPolicy(p, group));
    }
    /* MIGRATE schema 2 (1 danh sách chung, mỗi quy chế chứa cả mức Kho lẫn Ship)
       → nhân đôi sang 2 khối, GIỮ NGUYÊN ngày hiệu lực + mức của từng khối.
       Tiền tính ra không đổi một đồng nào. */
    if (raw && Array.isArray(raw.policies) && raw.policies.length) {
      return raw.policies.map(p => _normPolicy({
        id: (p.id || _pid()) + '_' + group,
        name: p.name, from: p.from, to: p.to,
        rules: p.rules || {},
      }, group));
    }
    /* MIGRATE schema 1 (1 bộ mức phẳng, không ngày) → 1 quy chế mở vô hạn 2 đầu */
    const flat = (raw && typeof raw === 'object') ? raw : {};
    return [_normPolicy({ id: 'qc_base_' + group, name: 'Quy chế gốc', from: '', to: '', rules: flat }, group)];
  }
  /* Ghi cả 2 khối (khối không truyền thì giữ nguyên bản đang có) */
  function saveAllPolicies(map) {
    S().set('bonusRules', {
      schema: 3,
      kho:  (map && map.kho)  || getPolicies('kho'),
      ship: (map && map.ship) || getPolicies('ship'),
    });
  }
  /* Nhiệm vụ nào thuộc khối quy chế nào */
  const GROUP_OF_TASK = { 'kho-ship': 'kho', 'kho-truc': 'kho', 'ship-chieu': 'ship', 'ship-far': 'ship' };

  /* Quy chế áp dụng cho MỘT NGÀY trong MỘT KHỐI. Nhiều quy chế cùng phủ → lấy cái BẮT ĐẦU MUỘN NHẤT. */
  function policyForDate(date, group) {
    const d = String(date || '').slice(0, 10);
    if (!d) return null;
    const hits = getPolicies(group).filter(p => (!p.from || d >= p.from) && (!p.to || d <= p.to));
    if (!hits.length) return null;                       /* ngày trống → 0đ + cảnh báo (không tự đoán) */
    return hits.sort((a, b) => ((a.from || '') < (b.from || '') ? -1 : 1)).pop();
  }
  function rulesForDate(date, group) { const p = policyForDate(date, group); return p ? p.rules : null; }
  const policyForEntry = e => policyForDate(e && e.date, GROUP_OF_TASK[e && e.task]);
  /* Mức ĐANG hiệu lực hôm nay (gộp 2 khối) — chỉ dùng làm gợi ý mặc định trên UI */
  function getRules() {
    return Object.assign({}, clone(DEFAULT_RULES),
      rulesForDate(_today(), 'kho') || {}, rulesForDate(_today(), 'ship') || {});
  }
  /* Trực kho: mức /buổi theo quy chế KHO của ngày đó (null = ngày chưa có quy chế) */
  function khoTrucRateOn(date) {
    const r = rulesForDate(date, 'kho');
    return r ? (+r.khoTruc || 0) : null;
  }
  /* Gộp danh mục "đơn xa" của MỌI quy chế SHIP → dropdown luôn chọn được;
     số tiền vẫn tính theo quy chế của NGÀY (id không có trong quy chế đó → 0đ). */
  function allFarList() {
    const seen = new Map();
    getPolicies('ship').forEach(p => (p.rules.shipFar || []).forEach(f => { if (f && f.id) seen.set(f.id, f); }));
    return Array.from(seen.values());
  }

  /* ===== SỔ GHI ===== */
  function getLog() { const a = S().get('bonusLog', []); return Array.isArray(a) ? a : []; }
  function saveLog(a) { S().set('bonusLog', a); }

  /* ===== NHIỆM VỤ ===== */
  const TASKS = {
    'kho-ship':   { dept: 'Kho', label: 'Hỗ trợ ship', icon: '🛵', needsOrder: true },
    /* manual:false → KHÔNG cho nhập tay nữa. Tiền trực kho sinh 100% từ tab "🏭 Lịch trực kho"
       (nguồn duy nhất) → không thể cộng trùng. */
    'kho-truc':   { dept: 'Kho', label: 'Trực kho', icon: '🏭', manual: false },
    'ship-chieu': { dept: 'Ship', label: 'Hỗ trợ ship chiều', icon: '🌤️' },
    'ship-far':   { dept: 'Ship', label: 'Đơn xa', icon: '📍', needsFar: true },
  };
  const manualTasks = () => Object.keys(TASKS).filter(k => TASKS[k].manual !== false);
  const tasksForDept = dept => manualTasks().filter(k => TASKS[k].dept === dept);

  /* ===== TÍNH TIỀN 1 dòng — theo QUY CHẾ phủ NGÀY của dòng đó =====
     Bỏ trống `rules` → tự tra theo entry.date. Không quy chế nào phủ → 0đ. */
  function computeAmount(entry, rules) {
    if (rules === undefined) rules = rulesForDate(entry && entry.date, GROUP_OF_TASK[entry && entry.task]);
    if (!rules) return 0;
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

  /* ===== Tổng thưởng hỗ trợ 1 NV trong 1 tháng (dùng cho phiếu lương) =====
     LUÔN tính lại theo quy chế phủ NGÀY của từng dòng (quy chế = nguồn sự thật duy nhất).
     Số `amount` lưu trong sổ chỉ là bản cache để hiển thị nhanh/offline. */
  function helperFor(staffId, month) {
    /* (1) Sổ ghi tay (hỗ trợ ship, ship chiều, đơn xa) */
    const manual = getLog()
      .filter(e => e.staffId === staffId && String(e.date || '').slice(0, 7) === month)
      .filter(e => TASKS[e.task] && TASKS[e.task].manual !== false)   /* bỏ 'kho-truc' cũ nếu còn sót */
      .map(e => {
        const pol = policyForEntry(e);
        return { ...e, amount: pol ? computeAmount(e, pol.rules) : 0, policyName: pol ? pol.name : null, noPolicy: !pol };
      });
    /* (2) Trực kho — sinh từ LỊCH TRỰC (nguồn duy nhất, không nhập tay) */
    const duty = (window.KHODUTY && window.KHODUTY.bonusEntries)
      ? window.KHODUTY.bonusEntries(staffId, month).map(e => {
          const pol = policyForEntry(e);
          return { ...e, amount: pol ? computeAmount(e, pol.rules) : 0, policyName: pol ? pol.name : null, noPolicy: !pol };
        })
      : [];
    const entries = manual.concat(duty).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const total = entries.reduce((s, e) => s + (+e.amount || 0), 0);
    const noPolicy = entries.filter(e => e.noPolicy).length;
    return { total, entries, noPolicy };
  }

  /* ===== Helpers dữ liệu ===== */
  const KHO_SHIP = () => (S().get('staff', window.STAFFS || []) || [])
    .filter(s => s.status === 'active' && /^(Kho|Ship)$/.test(String(s.dept || '')));
  const staffById = id => (S().get('staff', window.STAFFS || []) || []).find(s => s.id === id) || {};
  const _labelOf = e => {
    const t = TASKS[e.task] || {};
    if (e.task === 'kho-ship') return `${t.label} · ${esc(e.orderName || e.orderCode || '?')}${e.weight ? ' (' + e.weight + 'kg)' : ''}`;
    if (e.task === 'ship-far') { const f = allFarList().find(x => x.id === e.farId); return `${t.label} · ${esc(f ? f.name : '?')}`; }
    if (e.task === 'kho-truc') return `${t.label} · ca ${e.buoi === 'chieu' ? 'chiều' : 'sáng'}`;
    return t.label || e.task;
  };

  /* ===== STATE ===== */
  let _bMonth = null;

  /* ===== RENDER TAB ===== */
  function renderBonusTab() {
    if (!_bMonth) _bMonth = (document.getElementById('payMonth') || {}).value || (window.todayISO ? window.todayISO().slice(0, 7) : '2026-07');
    const host = document.getElementById('payView');
    if (!host) return;
    /* Sổ ghi tay + ca trực sinh từ LỊCH TRỰC KHO (chỉ đọc, sửa ở tab Lịch trực) */
    const manualLog = getLog()
      .filter(e => String(e.date || '').slice(0, 7) === _bMonth)
      .filter(e => TASKS[e.task] && TASKS[e.task].manual !== false);
    const dutyLog = (window.KHODUTY && window.KHODUTY.bonusEntriesMonth)
      ? window.KHODUTY.bonusEntriesMonth(_bMonth) : [];
    const monthLog = manualLog.concat(dutyLog);
    /* Tiền LUÔN tính lại theo quy chế (đúng khối Kho/Ship) phủ NGÀY của từng dòng */
    const calc = e => { const pol = policyForEntry(e); return { pol, amt: pol ? computeAmount(e, pol.rules) : 0 }; };
    const grandTotal = monthLog.reduce((s, e) => s + calc(e).amt, 0);
    const nNoPolicy = monthLog.filter(e => !policyForEntry(e)).length;

    const rowsHtml = monthLog
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map(e => {
        const st = staffById(e.staffId);
        const { pol, amt } = calc(e);
        const t = TASKS[e.task] || {};
        const amtCell = !pol
          ? '<span style="color:#B91C1C" title="Ngày này không nằm trong quy chế nào — khai bổ sung ở ⚙ Quy chế thưởng">⚠ 0 · chưa có quy chế</span>'
          : amt ? '+' + fmt(amt) : '<span style="color:#B45309">0 · chưa đủ ĐK</span>';
        return `<tr>
          <td style="white-space:nowrap">${esc((e.date || '').split('-').reverse().join('/'))}</td>
          <td><b>${esc(st.name || e.staffName || '?')}</b><div style="font-size:11px;color:var(--muted)">${esc(st.dept || t.dept || '')}</div></td>
          <td>${t.icon || ''} ${_labelOf(e)}</td>
          <td style="font-size:11px;color:var(--muted);white-space:nowrap">${pol ? esc(pol.name) : '<span style="color:#B91C1C">—</span>'}</td>
          <td class="num" style="font-weight:700;color:#15803D;white-space:nowrap">${amtCell}</td>
          <td style="font-size:12px;color:var(--muted)">${esc(e.note || '')}</td>
          <td class="num" style="white-space:nowrap">
            ${e.source === 'duty'
              ? `<button class="btn btn-ghost btn-sm" style="padding:2px 7px" onclick="window.setPayTab && window.setPayTab('duty')" title="Ca trực sinh từ Lịch trực kho — sửa ở tab đó">🏭 Lịch trực</button>`
              : `<button class="btn btn-ghost btn-sm" style="padding:2px 7px" onclick="window.BONUS.openEntry('${e.id}')" title="Sửa">✏️</button>
                 <button class="btn btn-ghost btn-sm" style="padding:2px 7px;color:#B91C1C" onclick="window.BONUS.delEntry('${e.id}')" title="Xoá">🗑</button>`}
          </td>
        </tr>`;
      }).join('');

    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div style="font-size:12.5px;color:var(--muted)">Sổ thưởng hỗ trợ tháng <b style="color:var(--navy)">${_bMonth.slice(5)}/${_bMonth.slice(0, 4)}</b> · ${monthLog.length} khoản · Σ <b style="color:#15803D">${fmt(grandTotal)}đ</b> → tự cộng vào phiếu lương.</div>
        <div style="flex:1"></div>
        <button class="btn btn-ghost" onclick="window.BONUS.openPolicies()" title="Quy chế thưởng theo giai đoạn">⚙ Quy chế thưởng</button>
        <button class="btn btn-primary" onclick="window.BONUS.openBatch()">➕ Ghi phiếu thưởng</button>
      </div>
      ${nNoPolicy ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:9px;padding:10px 13px;margin-bottom:10px;font-size:12.5px;color:#B91C1C">
        ⚠ <b>${nNoPolicy} khoản</b> rơi vào ngày <b>không thuộc quy chế nào</b> → đang tính <b>0đ</b>.
        Bấm <b>⚙ Quy chế thưởng</b> để khai giai đoạn còn thiếu.
      </div>` : ''}
      <div style="overflow:auto;border:1px solid var(--line);border-radius:10px;background:#fff">
        <table class="mini-table" style="width:100%;border-collapse:separate;border-spacing:0">
          <thead><tr style="background:#F9FAFB">
            <th style="text-align:left;padding:10px 12px">Ngày</th>
            <th style="text-align:left;padding:10px 12px">Nhân sự</th>
            <th style="text-align:left;padding:10px 12px">Nhiệm vụ</th>
            <th style="text-align:left;padding:10px 12px">Quy chế áp dụng</th>
            <th class="num" style="padding:10px 12px">Số tiền</th>
            <th style="text-align:left;padding:10px 12px">Ghi chú</th>
            <th class="num" style="padding:10px 12px">Sửa</th>
          </tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="7" style="padding:34px;text-align:center;color:var(--muted)">Chưa có khoản thưởng nào tháng này. Bấm <b>➕ Ghi phiếu thưởng</b> để thêm.</td></tr>`}</tbody>
        </table>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:10px">💡 Tiền thưởng của mỗi dòng tra theo <b>quy chế đang hiệu lực NGÀY đó</b> — sửa mức hôm nay không làm đổi tiền của giai đoạn trước. Cuối tháng tổng của mỗi NV tự vào cột <b>Thưởng</b> ở bảng lương.</div>`;
  }

  /* ===== MODAL: Ghi / sửa khoản thưởng ===== */
  function openEntry(id) {
    const ent = id ? getLog().find(e => e.id === id) : null;
    const cur = ent || { date: (document.getElementById('payMonth') || {}).value ? _bMonth + '-' + String(new Date().getDate()).padStart(2, '0') : '', staffId: '', task: '', note: '' };
    if (!cur.date && window.todayISO) cur.date = window.todayISO().slice(0, 10);
    const curStaffName = cur.staffId ? (staffById(cur.staffId).name || '') : '';

    /* Danh mục đơn xa gộp từ MỌI quy chế → chọn được; tiền vẫn tính theo quy chế của NGÀY */
    const farOpts = allFarList().map(f => `<option value="${f.id}" ${cur.farId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
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
            <input type="date" id="beDate" value="${esc(cur.date || '')}" onchange="window.BONUS._calc()" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px"></div>
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
            ${manualTasks().map(k => `<option value="${k}" data-dept="${TASKS[k].dept}" ${cur.task === k ? 'selected' : ''}>${TASKS[k].icon} ${TASKS[k].dept} · ${TASKS[k].label}</option>`).join('')}
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
    const date = (document.getElementById('beDate') || {}).value || '';
    const entry = { task, date, weight: (document.getElementById('beWeight') || {}).value, farId: (document.getElementById('beFar') || {}).value };
    const pol = task ? policyForEntry(entry) : null;
    const amt = pol ? computeAmount(entry, pol.rules) : 0;
    const el = document.getElementById('beAmtVal');
    if (!el) return;
    if (date && !pol) {
      el.textContent = '0đ — ⚠ ngày này chưa có quy chế nào áp dụng';
    } else if (amt) {
      el.textContent = '+' + fmt(amt) + 'đ' + (pol ? ` · theo “${pol.name}”` : '');
    } else {
      el.textContent = '0đ — chưa đủ điều kiện của quy chế' + (pol ? ` “${pol.name}”` : '');
    }
    const bad = !amt;
    el.parentElement.style.background = bad ? '#FEF3C7' : '#F0FDF4';
    el.parentElement.style.borderColor = bad ? '#FDE68A' : '#BBF7D0';
    el.style.color = bad ? '#B45309' : '#15803D';
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
    const entry = { task, weight, farId, orderCode, date };
    const amount = computeAmount(entry);   /* theo quy chế phủ NGÀY của dòng */
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
    const far = allFarList().map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
    const inp = 'padding:6px;border:1px solid var(--line);border-radius:6px;font-size:12px';
    return `<div class="be-row" data-idx="${idx}" style="border:1px solid #E6ECE4;border-radius:8px;padding:8px 10px;margin-bottom:8px;background:#fff">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input type="date" class="be-r-date" value="${esc(date)}" style="${inp}">
        <select class="be-r-task" onchange="window.BONUS._rowTask(${idx})" style="${inp}">
          <option value="">— nhiệm vụ —</option>
          ${manualTasks().map(k => `<option value="${k}">${TASKS[k].icon} ${TASKS[k].dept}·${TASKS[k].label}</option>`).join('')}
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
    return { date: row.querySelector('.be-r-date').value, task: row.querySelector('.be-r-task').value, weight: row.querySelector('.be-r-wt').value, farId: row.querySelector('.be-r-far').value };
  }
  function _rowCalc(idx) {
    const row = _rowOf(idx); if (!row) return;
    const e = _rowEntry(row);
    const pol = e.task ? policyForEntry(e) : null;
    const amt = pol ? computeAmount(e, pol.rules) : 0;
    const el = row.querySelector('.be-r-amt');
    el.textContent = (e.date && !pol) ? '⚠ chưa có quy chế' : (amt ? '+' + fmt(amt) : '0 (chưa đủ ĐK)');
    el.title = pol ? 'Quy chế: ' + pol.name : (e.date ? 'Ngày này không thuộc quy chế nào' : '');
    el.style.color = amt ? '#15803D' : (e.date && !pol ? '#B91C1C' : '#B45309');
    _batchTotal();
  }
  function _batchTotal() {
    let total = 0, n = 0;
    document.querySelectorAll('.be-row').forEach(row => { const e = _rowEntry(row); if (!e.task) return; total += computeAmount(e); n++; });
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
        amount: computeAmount({ task, weight, farId, date }),   /* cache; helperFor vẫn tính lại theo quy chế */
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
  /* ===== QUY CHẾ THƯỞNG — 2 KHỐI ĐỘC LẬP: Kho & Ship ===== */
  function _nextDay(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const _tierRow = t => `<div class="br-tier" style="display:grid;grid-template-columns:1fr 1fr 1.2fr 30px;gap:6px;align-items:center;margin-bottom:5px">
      <input type="number" class="br-min" value="${t ? t.min : ''}" placeholder="từ kg" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right">
      <input type="number" class="br-max" value="${t ? t.max : ''}" placeholder="đến kg" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right">
      <input type="number" class="br-amt" value="${t ? t.amount : ''}" placeholder="thưởng" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700">
      <button onclick="this.closest('.br-tier').remove()" style="border:none;background:none;color:#B91C1C;cursor:pointer">✕</button>
    </div>`;
  const _farRow = f => `<div class="br-far" data-id="${f ? f.id : 'f_' + uid()}" style="display:grid;grid-template-columns:2fr 1.2fr 30px;gap:6px;align-items:center;margin-bottom:5px">
      <input type="text" class="br-far-name" value="${f ? esc(f.name) : ''}" placeholder="Tên tuyến/điểm" style="padding:6px;border:1px solid var(--line);border-radius:6px">
      <input type="number" class="br-far-amt" value="${f ? f.amount : ''}" placeholder="thưởng" style="padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700">
      <button onclick="this.closest('.br-far').remove()" style="border:none;background:none;color:#B91C1C;cursor:pointer">✕</button>
    </div>`;

  /* Thân quy chế — mức của KHO khác mức của SHIP */
  function _rulesEditor(group, r, i) {
    if (group === 'kho') {
      return `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:9px;padding:10px 12px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:5px">Hỗ trợ ship — theo trọng lượng đơn (từ–đến kg → thưởng/đơn):</div>
        <div class="qc-tiers">${(r.khoShipTiers || []).map(_tierRow).join('')}</div>
        <button class="btn btn-ghost btn-sm" onclick="window.BONUS._polAddTier('kho',${i})" style="font-size:11.5px;margin-bottom:8px">➕ Thêm mốc kg</button>
        <div style="display:flex;align-items:center;gap:8px"><label style="flex:1">Trực kho (/buổi — sáng hoặc chiều)</label>
          <input type="number" class="qc-truc" value="${r.khoTruc}" style="width:130px;padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700"></div>
        <div style="font-size:11px;color:var(--muted);margin-top:5px">Ca trực nhập ở tab <b>🏭 Lịch trực kho</b>, tiền tự tính theo mức này.</div>
      </div>`;
    }
    return `<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:9px;padding:10px 12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px"><label style="flex:1">Ship sáng hỗ trợ ship chiều (/lần)</label>
        <input type="number" class="qc-chieu" value="${r.shipChieu}" style="width:130px;padding:6px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700"></div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:5px">Đơn xa — danh mục:</div>
      <div class="qc-far">${(r.shipFar || []).map(_farRow).join('')}</div>
      <button class="btn btn-ghost btn-sm" onclick="window.BONUS._polAddFar('ship',${i})" style="font-size:11.5px">➕ Thêm tuyến đơn xa</button>
    </div>`;
  }

  function _polCard(p, group, i, open) {
    return `<div class="qc-card" data-id="${p.id}" style="border:1px solid var(--line);border-radius:10px;margin-bottom:10px;background:#fff;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:9px 11px;background:#F9FAFB;border-bottom:1px solid var(--line);cursor:pointer" onclick="window.BONUS._polToggle('${group}',${i})">
        <span class="qc-chev" style="color:#15803D;width:12px">${open ? '▾' : '▸'}</span>
        <b style="flex:1;font-size:13px">${esc(p.name)}</b>
        <span style="font-size:11.5px;color:var(--muted)">${p.from ? p.from.split('-').reverse().join('/') : '−∞'} → ${p.to ? p.to.split('-').reverse().join('/') : 'nay'}</span>
        <button onclick="event.stopPropagation();window.BONUS._polRemove('${group}',${i})" style="border:none;background:none;color:#B91C1C;cursor:pointer;font-size:15px" title="Xoá quy chế">🗑</button>
      </div>
      <div class="qc-body" style="padding:11px 13px;display:${open ? 'block' : 'none'}">
        <div style="display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:8px;margin-bottom:11px">
          <div><label style="font-size:11px;color:var(--muted);font-weight:600">Tên quy chế</label>
            <input type="text" class="qc-name" value="${esc(p.name)}" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:6px;box-sizing:border-box"></div>
          <div><label style="font-size:11px;color:var(--muted);font-weight:600">Áp dụng từ</label>
            <input type="date" class="qc-from" value="${p.from}" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:6px;box-sizing:border-box"></div>
          <div><label style="font-size:11px;color:var(--muted);font-weight:600">Đến hết (trống = nay)</label>
            <input type="date" class="qc-to" value="${p.to}" style="width:100%;padding:6px;border:1px solid var(--line);border-radius:6px;box-sizing:border-box"></div>
        </div>
        ${_rulesEditor(group, p.rules, i)}
      </div>
    </div>`;
  }

  let _qcGroup = 'kho';
  function _groupSection(group) {
    const pols = getPolicies(group).sort((a, b) => ((a.from || '') < (b.from || '') ? -1 : 1));
    const last = pols.length - 1;
    return `<div id="qcPane-${group}" style="display:${_qcGroup === group ? 'block' : 'none'}">
      <div id="qcList-${group}">${pols.map((p, i) => _polCard(p, group, i, i === last)).join('')}</div>
      <button class="btn btn-ghost" onclick="window.BONUS._polAdd('${group}')" style="width:100%;margin-top:4px">➕ Thêm quy chế ${GROUP_LABEL[group]} (chép mức từ quy chế cuối)</button>
    </div>`;
  }
  function openPolicies(group) {
    _qcGroup = GROUPS.indexOf(group) >= 0 ? group : 'kho';
    const tabBtn = g => `<button onclick="window.BONUS._qcTab('${g}')" id="qcTab-${g}"
      style="flex:1;padding:9px;border:1.5px solid ${_qcGroup === g ? '#15803D' : 'var(--line)'};background:${_qcGroup === g ? '#DCFCE7' : '#fff'};color:${_qcGroup === g ? '#15803D' : 'var(--navy)'};border-radius:8px;font-weight:700;cursor:pointer;font-size:13px">${GROUP_LABEL[g]}</button>`;
    window.openModal('⚙ Quy chế thưởng hỗ trợ', `
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:9px;padding:10px 12px;font-size:12.5px;color:#1E40AF;line-height:1.65;margin-bottom:12px">
        💡 Quy chế <b>Kho</b> và <b>Ship</b> hoàn toàn <b>tách biệt</b> — ngày hiệu lực và mức thưởng riêng.
        Tiền của mỗi khoản tra theo quy chế phủ <b>NGÀY</b> của khoản đó → sửa mức hôm nay <b>không</b> làm đổi tiền giai đoạn trước.<br>
        Để trống <b>“Đến hết”</b> = đang áp dụng tới hiện tại. Ngày không thuộc quy chế nào → khoản đó tính <b>0đ</b>.
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px">${tabBtn('kho')}${tabBtn('ship')}</div>
      ${_groupSection('kho')}
      ${_groupSection('ship')}
    `, {
      width: '660px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
               <button class="btn btn-primary" onclick="window.BONUS._savePolicies()">💾 Lưu cả 2 khối</button>`,
    });
  }
  function _qcTab(g) {
    _qcGroup = g;
    GROUPS.forEach(x => {
      const pane = document.getElementById('qcPane-' + x);
      const btn = document.getElementById('qcTab-' + x);
      if (pane) pane.style.display = x === g ? 'block' : 'none';
      if (btn) {
        btn.style.border = '1.5px solid ' + (x === g ? '#15803D' : 'var(--line)');
        btn.style.background = x === g ? '#DCFCE7' : '#fff';
        btn.style.color = x === g ? '#15803D' : 'var(--navy)';
      }
    });
  }
  const _cards = group => Array.from(document.querySelectorAll('#qcList-' + group + ' .qc-card'));
  function _polToggle(group, i) {
    const card = _cards(group)[i]; if (!card) return;
    const body = card.querySelector('.qc-body');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    card.querySelector('.qc-chev').textContent = open ? '▾' : '▸';
  }
  function _polAddTier(group, i) {
    const box = _cards(group)[i] && _cards(group)[i].querySelector('.qc-tiers'); if (!box) return;
    const d = document.createElement('div'); d.innerHTML = _tierRow(null); box.appendChild(d.firstElementChild);
  }
  function _polAddFar(group, i) {
    const box = _cards(group)[i] && _cards(group)[i].querySelector('.qc-far'); if (!box) return;
    const d = document.createElement('div'); d.innerHTML = _farRow(null); box.appendChild(d.firstElementChild);
  }
  function _repaint(group, arr) {
    const list = document.getElementById('qcList-' + group);
    if (list) list.innerHTML = arr.map((p, i) => _polCard(p, group, i, i === arr.length - 1)).join('');
  }
  function _polRemove(group, i) {
    if (_cards(group).length <= 1) { window.toast?.('Mỗi khối phải còn ít nhất 1 quy chế', 'warn'); return; }
    if (!confirm('Xoá quy chế này? Các khoản rơi vào giai đoạn đó sẽ thành 0đ nếu không quy chế nào phủ.')) return;
    const arr = _readPolicies(group);
    arr.splice(i, 1);
    _repaint(group, arr);
  }
  function _polAdd(group) {
    const arr = _readPolicies(group);
    const lastP = arr[arr.length - 1];
    arr.push({
      id: _pid(),
      name: 'Quy chế ' + (arr.length + 1),
      from: (lastP && lastP.to) ? _nextDay(lastP.to) : _today(),
      to: '',
      rules: lastP ? clone(lastP.rules) : clone(DEFAULT_OF[group]),
    });
    _repaint(group, arr);
  }
  /* Đọc quy chế của 1 khối đang hiển thị trong modal */
  function _readPolicies(group) {
    return _cards(group).map(card => {
      const rules = {};
      if (group === 'kho') {
        rules.khoShipTiers = Array.from(card.querySelectorAll('.qc-tiers .br-tier')).map(el => ({
          min: +el.querySelector('.br-min').value || 0,
          max: +el.querySelector('.br-max').value || 0,
          amount: +el.querySelector('.br-amt').value || 0,
        })).filter(t => t.max > 0 && t.amount > 0);   /* rỗng = không thưởng mốc kg nào (hợp lệ) */
        rules.khoTruc = +card.querySelector('.qc-truc').value || 0;
      } else {
        rules.shipChieu = +card.querySelector('.qc-chieu').value || 0;
        rules.shipFar = Array.from(card.querySelectorAll('.qc-far .br-far')).map(el => ({
          id: el.dataset.id,
          name: el.querySelector('.br-far-name').value.trim(),
          amount: +el.querySelector('.br-far-amt').value || 0,
        })).filter(f => f.name);
      }
      return {
        id: card.dataset.id,
        name: card.querySelector('.qc-name').value.trim() || 'Quy chế',
        from: card.querySelector('.qc-from').value || '',
        to: card.querySelector('.qc-to').value || '',
        rules,
      };
    });
  }
  function _validate(group, arr) {
    const warns = [];
    for (const p of arr) {
      if (p.from && p.to && p.from > p.to) return { err: `${GROUP_LABEL[group]} · "${p.name}": ngày bắt đầu sau ngày kết thúc` };
    }
    const sorted = arr.slice().sort((a, b) => ((a.from || '') < (b.from || '') ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      if (!prev.to) { warns.push(`${GROUP_LABEL[group]}: “${prev.name}” không có ngày kết thúc nên chồng “${cur.name}” — ngày trùng tính theo “${cur.name}”.`); continue; }
      if (cur.from && prev.to >= cur.from) warns.push(`${GROUP_LABEL[group]}: “${prev.name}” và “${cur.name}” chồng ngày — ngày trùng tính theo “${cur.name}”.`);
      else if (cur.from && _nextDay(prev.to) < cur.from) warns.push(`${GROUP_LABEL[group]}: trống từ ${_nextDay(prev.to).split('-').reverse().join('/')} đến trước ${cur.from.split('-').reverse().join('/')} — khoản ghi trong khoảng này = 0đ.`);
    }
    return { warns };
  }
  function _savePolicies() {
    const kho = _readPolicies('kho');
    const ship = _readPolicies('ship');
    if (!kho.length || !ship.length) { window.toast?.('Mỗi khối phải có ít nhất 1 quy chế', 'warn'); return; }
    let warns = [];
    for (const [g, arr] of [['kho', kho], ['ship', ship]]) {
      const v = _validate(g, arr);
      if (v.err) { window.toast?.(v.err, 'warn'); return; }
      warns = warns.concat(v.warns);
    }
    saveAllPolicies({ kho, ship });
    window.closeModal?.();
    window.toast?.(`✓ Đã lưu quy chế: Kho ${kho.length} · Ship ${ship.length}` + (warns.length ? ` · ${warns.length} cảnh báo` : ''), warns.length ? 'warn' : 'success');
    if (warns.length) setTimeout(() => window.toast?.('⚠ ' + warns[0], 'warn'), 900);
    renderBonusTab();
    if (window.KHODUTY && window.KHODUTY.rerender) window.KHODUTY.rerender();
    window.renderPayrollPublic && window.renderPayrollPublic();
  }

  function setBonusMonth(m) { _bMonth = m; renderBonusTab(); }

  window.BONUS = {
    getRules, getLog, saveLog, computeAmount, helperFor, TASKS,
    /* Quy chế theo giai đoạn, TÁCH khối Kho/Ship (v421) */
    getPolicies, saveAllPolicies, policyForDate, policyForEntry, rulesForDate,
    khoTrucRateOn, allFarList, GROUPS, GROUP_OF_TASK,
    renderBonusTab, openEntry, delEntry, setBonusMonth,
    openPolicies, openRules: openPolicies,   /* alias tương thích */
    _qcTab, _polToggle, _polAdd, _polRemove, _polAddTier, _polAddFar, _savePolicies,
    _onStaffTask, _calc, _save,
    _acStaff, _pickStaff, _acOrder, _pickOrder, _hideAc,
    openBatch, _addRow, _rowTask, _rowCalc, _removeRow, _acOrderRow, _pickOrderRow, _hideAcEl, _saveBatch,
    labelOf: _labelOf,
  };
})();
