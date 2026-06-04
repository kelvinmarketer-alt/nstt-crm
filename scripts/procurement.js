/* =========================================================
   GOM HÀNG → ĐẶT NCC  (Procurement / demand aggregation)
   Quy trình Kho:
     ① Chọn loạt đơn (theo ngày giao) → Gom SL theo từng NCC
     ② Phiếu yêu cầu NCC (in/copy Zalo) — có truy vết đơn nào bao nhiêu
        → nhập SL NCC xác nhận + lý do thiếu
        → phân bổ phần thiếu (ƯU TIÊN ĐƠN ĐẶT TRƯỚC) → ghi về đơn + báo Sale
     ③ Phiếu xuất kho cho shipper (có ca/giờ giao)
   Dữ liệu: kv_store 'procurementRuns'
   ========================================================= */
(function () {
  const S = () => window.STORE;
  const getRuns = () => S().get('procurementRuns', []) || [];
  const saveRuns = (r) => S().set('procurementRuns', r);
  const getOrders = () => S().get('orders', window.ORDERS || []) || [];
  const getSuppliers = () => S().get('suppliers', []) || [];
  const getProducts = () => S().get('products', window.PRODUCTS || []) || [];

  const norm = s => (s || '').toString().trim().toLowerCase();
  const fmtQty = q => (+q || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  const money = n => (window.fmt ? window.fmt(n) : (+n || 0).toLocaleString('vi-VN'));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Đơn đủ điều kiện gom: chưa giao/hủy, chưa xuất kho */
  function eligibleOrders() {
    return getOrders().filter(o => {
      const st = o.status;
      if (st === 'cancelled' || st === 'returned' || st === 'delivered' || st === 'reconciled') return false;
      if (o.whStatus === 'released' || o.whStatus === 'confirmed') return false;
      return Array.isArray(o.items) && o.items.length;
    });
  }

  /* ===== Gom SL nhiều đơn → lines theo từng NCC ===== */
  function buildLines(orderCodes) {
    const orders = getOrders().filter(o => orderCodes.includes(o.code))
      .sort((a, b) => (a.createdAt || a.date || '') < (b.createdAt || b.date || '') ? -1 : 1);
    const products = getProducts();
    const suppliers = getSuppliers();
    /* productId → NCC cung cấp (NCC đầu tiên có gán SP đó) */
    const supByProd = {};
    suppliers.forEach(s => (s.products || []).forEach(p => {
      if (!supByProd[p.id]) supByProd[p.id] = { id: s.id, name: s.name, price: p.price || 0 };
    }));
    const prodByName = {};
    products.forEach(p => { prodByName[norm(p.name)] = p; });

    const map = new Map();
    orders.forEach(o => (o.items || []).forEach(it => {
      const prod = prodByName[norm(it.name)];
      const key = prod ? prod.id : 'x:' + norm(it.name);
      if (!map.has(key)) {
        const sup = prod ? supByProd[prod.id] : null;
        map.set(key, {
          key, productId: prod ? prod.id : '', name: it.name, unit: it.unit || 'kg',
          supplierId: sup ? sup.id : '', supplierName: sup ? sup.name : '',
          unitCost: sup ? sup.price : 0,
          totalQty: 0, breakdown: [], confirmedQty: null, shortageReason: '', note: ''
        });
      }
      const g = map.get(key);
      g.totalQty = +(g.totalQty + (+it.qty || 0)).toFixed(2);
      g.breakdown.push({ code: o.code, custName: o.custName, qty: +it.qty || 0, createdAt: o.createdAt || o.date || '' });
    }));
    return [...map.values()];
  }

  /* ===== Phân bổ phần thiếu: ƯU TIÊN ĐƠN ĐẶT TRƯỚC =====
     Đơn tạo sớm được nhận đủ trước; đơn sau gánh phần thiếu. */
  function allocateLine(line) {
    let avail = line.confirmedQty != null && line.confirmedQty !== '' ? +line.confirmedQty : line.totalQty;
    const sorted = [...line.breakdown].sort((a, b) => (a.createdAt || a.code) < (b.createdAt || b.code) ? -1 : 1);
    return sorted.map(b => {
      const give = Math.min(b.qty, Math.max(0, avail));
      avail = +(avail - give).toFixed(3);
      return { code: b.code, custName: b.custName, want: b.qty, give: +give.toFixed(2), short: +(b.qty - give).toFixed(2) };
    });
  }

  /* ============ SCROLL TO SECTION (trang cuộn dọc, không còn tab) ============ */
  window.pcSwitch = function (tab) {
    const map = { gather: 'stepGather', runs: 'stepRuns', release: 'stepRelease' };
    const el = document.getElementById(map[tab] || 'stepGather');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  function renderAll() { renderGather(); renderRuns(); renderRelease(); }

  /* ============ ① CHỌN ĐƠN → GOM ============ */
  let picked = new Set();
  function renderGather() {
    const host = document.getElementById('pcGather');
    const orders = eligibleOrders();
    /* nhóm theo ngày giao */
    const byDate = {};
    orders.forEach(o => { const d = o.deliverDate || '(chưa đặt ngày giao)'; (byDate[d] = byDate[d] || []).push(o); });
    const dates = Object.keys(byDate).sort();
    let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <span style="font-size:12.5px;color:var(--muted)">Tick các đơn cùng đợt giao → bấm <b>Tạo phiên gom</b>. Phiên gom mở ra → <b>gán NCC cho từng mặt hàng</b> + xác nhận đủ/thiếu.</span>
        <div style="flex:1"></div>
        <button class="btn btn-primary btn-sm" id="pcMakeRun" onclick="window.pcMakeRun()" disabled>🧺 Tạo phiên gom (<span id="pcSelN">0</span>)</button>
      </div>`;
    if (!orders.length) {
      html += `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:40px;text-align:center;color:var(--muted)">Không có đơn nào cần gom. Đơn mới do Sale tạo sẽ hiện ở đây.</div>`;
    } else {
      dates.forEach(d => {
        html += `<div style="margin:14px 0 6px;font-weight:700;color:var(--navy);font-size:13px;display:flex;align-items:center;gap:8px">
          📅 Giao: ${esc(d)} <span style="font-weight:400;color:var(--muted);font-size:12px">(${byDate[d].length} đơn)</span>
          <button class="btn btn-ghost btn-sm" onclick="window.pcPickDate('${esc(d)}')">Chọn cả ngày</button></div>`;
        byDate[d].forEach(o => {
          const nItems = (o.items || []).length;
          const kg = (o.items || []).reduce((s, it) => s + (+it.qty || 0), 0);
          html += `<div class="ord-pick ${picked.has(o.code) ? 'sel' : ''}" data-code="${o.code}" onclick="window.pcTogglePick('${o.code}')">
            <input type="checkbox" ${picked.has(o.code) ? 'checked' : ''} style="width:16px;height:16px;pointer-events:none">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px">${o.code} · ${esc(o.custName || '')}</div>
              <div style="font-size:11.5px;color:var(--muted)">${nItems} mã · ${fmtQty(kg)} kg ${o.shipShift ? '· ca ' + esc(o.shipShift) : ''} ${o.shipTime ? '· ' + esc(o.shipTime) : ''}</div>
            </div>
            <span class="tag" style="background:#DBEAFE;color:#1E40AF">${o.whStatus === 'gathering' ? 'Đang gom' : 'Mới'}</span>
          </div>`;
        });
      });
    }
    host.innerHTML = html;
    updatePickBtn();
  }
  function updatePickBtn() {
    const n = picked.size;
    const el = document.getElementById('pcSelN'); if (el) el.textContent = n;
    const btn = document.getElementById('pcMakeRun'); if (btn) btn.disabled = n === 0;
  }
  window.pcTogglePick = function (code) {
    if (picked.has(code)) picked.delete(code); else picked.add(code);
    const row = document.querySelector(`.ord-pick[data-code="${code}"]`);
    if (row) { row.classList.toggle('sel', picked.has(code)); const cb = row.querySelector('input'); if (cb) cb.checked = picked.has(code); }
    updatePickBtn();
  };
  window.pcPickDate = function (d) {
    eligibleOrders().filter(o => (o.deliverDate || '(chưa đặt ngày giao)') === d).forEach(o => picked.add(o.code));
    renderGather();
  };
  window.pcMakeRun = function () {
    if (!picked.size) return;
    const codes = [...picked];
    const lines = buildLines(codes);
    const noSup = lines.filter(l => !l.supplierId);
    const runs = getRuns();
    const seq = String(runs.length + 1).padStart(3, '0');
    const run = {
      id: 'GOM-' + seq,
      createdAt: new Date().toISOString(),
      createdBy: (window.AUTH?.currentUser?.()?.name) || 'Kho',
      orderCodes: codes,
      lines,
      status: 'draft'
    };
    runs.unshift(run);
    saveRuns(runs);
    /* đánh dấu đơn đang gom */
    const orders = getOrders();
    codes.forEach(c => { const o = orders.find(x => x.code === c); if (o) o.whStatus = 'gathering'; });
    S().set('orders', orders);
    picked.clear();
    window.toast?.(`✓ Tạo ${run.id} · ${codes.length} đơn · ${lines.length} mặt hàng` + (noSup.length ? ` · ⚠ ${noSup.length} SP chưa gán NCC` : ''), noSup.length ? 'warn' : 'success');
    renderGather(); renderRuns();
    window.pcSwitch('runs');
    setTimeout(() => window.pcOpenRun(run.id), 100);
  };

  /* ============ ② PHIÊN GOM ============ */
  function renderRuns() {
    const host = document.getElementById('pcRuns');
    const runs = getRuns();
    if (!runs.length) { host.innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:40px;text-align:center;color:var(--muted)">Chưa có phiên gom nào. Sang tab ① chọn đơn để tạo.</div>`; return; }
    const stLabel = { draft: ['Nháp', '#64748B'], sent: ['Đã gửi NCC', '#0EA5E9'], confirmed: ['Đã xác nhận', '#15803D'], closed: ['Đã xuất kho', '#1B5E20'] };
    host.innerHTML = runs.map(r => {
      const [lb, clr] = stLabel[r.status] || stLabel.draft;
      const sups = [...new Set(r.lines.filter(l => l.supplierId).map(l => l.supplierName))];
      const nNone = r.lines.filter(l => !l.supplierId).length;
      const totalKg = r.lines.reduce((s, l) => s + l.totalQty, 0);
      return `<div class="run-card" onclick="window.pcOpenRun('${r.id}')">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="font-weight:800;font-size:15px;color:var(--navy)">${r.id}</div>
          <span class="tag" style="background:${clr}1f;color:${clr};font-weight:700">${lb}</span>
          ${nNone > 0 ? `<span class="tag" style="background:#FEF3C7;color:#B45309;font-weight:700">⚠ ${nNone} SP chưa gán NCC</span>` : ''}
          <div style="flex:1"></div>
          <div style="font-size:11.5px;color:var(--muted)">${new Date(r.createdAt).toLocaleString('vi-VN')} · ${r.createdBy}</div>
        </div>
        <div style="font-size:12.5px;color:var(--muted);margin-top:6px">${r.orderCodes.length} đơn · ${r.lines.length} mã · ${fmtQty(totalKg)} kg${sups.length ? ' · NCC: ' + sups.map(esc).join(', ') : ''}</div>
        <div style="margin-top:9px"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();window.pcOpenRun('${r.id}')">🏭 ${nNone > 0 ? 'Gán NCC & xác nhận' : 'Mở · xác nhận hàng'} →</button></div>
      </div>`;
    }).join('');
  }

  function _supOpts(selId) {
    const sups = getSuppliers().filter(s => s.active !== false);
    return `<option value="">— Chọn NCC —</option>` +
      sups.map(s => `<option value="${s.id}" ${selId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  }

  window.pcOpenRun = function (runId) {
    const run = getRuns().find(r => r.id === runId);
    if (!run) return;
    /* group lines by supplier */
    const bySup = {};
    run.lines.forEach(l => { const k = l.supplierId || '__none__'; (bySup[k] = bySup[k] || { name: l.supplierName || '⚠ Chưa gán NCC', id: l.supplierId, lines: [] }).lines.push(l); });
    /* đưa nhóm "chưa gán" lên đầu */
    const supKeys = Object.keys(bySup).sort((a, b) => (a === '__none__' ? -1 : b === '__none__' ? 1 : 0));
    const nNone = (bySup['__none__'] || { lines: [] }).lines.length;
    let body = `
      <div style="background:linear-gradient(135deg,#1B5E20,#2E7D32);color:#fff;padding:16px 20px;position:relative">
        <button onclick="closeDrawer()" style="position:absolute;top:12px;right:14px;background:rgba(255,255,255,.18);border:none;color:#fff;width:30px;height:30px;border-radius:6px;cursor:pointer">✕</button>
        <h2 style="margin:0;font-size:17px">${run.id} — Phiên gom hàng</h2>
        <div style="opacity:.9;font-size:12px;margin-top:3px">${run.orderCodes.length} đơn · ${run.lines.length} mặt hàng</div>
      </div>
      <div style="padding:14px 18px">`;

    if (nNone > 0) {
      body += `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:9px;padding:10px 12px;margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:12.5px;color:#92400E;font-weight:600">⚠ ${nNone} SP chưa gán NCC.</span>
        <span style="font-size:12px;color:#92400E">Gán nhanh tất cả cho:</span>
        <select id="pcBulkSup" style="font-size:12.5px;border:1px solid #FDE68A;border-radius:6px;padding:5px 8px;min-width:160px">${_supOpts('')}</select>
        <button class="btn btn-primary btn-sm" onclick="window.pcBulkAssignSup('${run.id}')">⚡ Gán hàng loạt</button>
      </div>`;
    }

    supKeys.forEach(sk => {
      const sup = bySup[sk];
      const isNone = sk === '__none__';
      body += `<div class="sup-block" style="margin-bottom:14px">
        <div class="hd" style="${isNone ? 'background:#B45309' : ''}">🏭 ${esc(sup.name)} <span style="opacity:.8;font-weight:400;font-size:11.5px">(${sup.lines.length} SP)</span>
          <div style="flex:1"></div>
          ${isNone ? '' : `<button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="window.pcPrintSupReq('${run.id}','${sk}')">🖨 In phiếu</button>
          <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="window.pcCopySupReq('${run.id}','${sk}')">📋 Copy Zalo</button>`}
        </div>`;
      sup.lines.forEach(l => {
        const alloc = allocateLine(l);
        const totalShort = alloc.reduce((s, a) => s + a.short, 0);
        body += `<div class="pc-line">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:7px">
            <div style="flex:1;min-width:130px"><b>${esc(l.name)}</b> <span style="color:var(--muted);font-size:11.5px">· cần <b style="color:var(--navy)">${fmtQty(l.totalQty)} ${l.unit}</b></span></div>
            <label style="font-size:11px;color:var(--muted);display:flex;align-items:center;gap:4px">NCC:
              <select class="pc-sup" data-rkey="${l.key}" onchange="window.pcSetLineSup('${run.id}','${l.key}',this.value)" style="font-size:11.5px;border:1px solid ${l.supplierId ? 'var(--line)' : '#F59E0B'};border-radius:5px;padding:3px 6px;max-width:150px;${l.supplierId ? '' : 'background:#FEF9C3'}">${_supOpts(l.supplierId)}</select>
            </label>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <label style="font-size:11.5px;color:var(--muted)">Giao thực:
              <input type="number" min="0" step="0.1" value="${l.confirmedQty != null ? l.confirmedQty : ''}" placeholder="${fmtQty(l.totalQty)}" data-rkey="${l.key}" class="pc-conf" style="width:70px;text-align:right;border:1px solid var(--line);border-radius:5px;padding:3px 6px;margin-left:4px"> ${l.unit}</label>
            <select data-rkey="${l.key}" class="pc-reason" style="font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 6px">
              <option value="">— lý do thiếu —</option>
              ${['Trái mùa', 'Sai quy cách', 'Hàng thối/hỏng', 'NCC hết hàng', 'Khác'].map(r => `<option ${l.shortageReason === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
            <input type="text" data-rkey="${l.key}" class="pc-note" value="${esc(l.note || '')}" placeholder="Ghi chú..." style="flex:1;min-width:120px;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 8px">
          </div>
          <div style="margin-top:6px">${alloc.map(a => `<span class="bd-chip ${a.short > 0 ? 'short' : ''}">${a.code}: ${fmtQty(a.give)}${a.short > 0 ? ' <b>(-' + fmtQty(a.short) + ')</b>' : ''}</span>`).join('')}
            ${totalShort > 0 ? `<span style="color:#B91C1C;font-size:11.5px;font-weight:700;margin-left:6px">⚠ Thiếu ${fmtQty(totalShort)} ${l.unit}</span>` : ''}</div>
        </div>`;
      });
      body += `</div>`;
    });

    body += `<div style="position:sticky;bottom:0;background:#fff;padding-top:10px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-navy" onclick="window.pcSaveConfirm('${run.id}')">💾 Lưu</button>
        <button class="btn btn-primary" onclick="window.pcApplyAlloc('${run.id}')">✅ Chốt &amp; phân bổ về đơn + báo Sale</button>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">💡 Gán NCC cho từng SP (hoặc gán hàng loạt). Bỏ trống "Giao thực" = giao đủ. Điền nhỏ hơn = thiếu → tự cắt theo ưu tiên đơn đặt trước.</div>
    </div>`;

    const dc = document.getElementById('drawerContent');
    dc.innerHTML = body;
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerBg').classList.add('open');
  };

  function readConfirmInputs(run) {
    document.querySelectorAll('.pc-conf').forEach(inp => {
      const l = run.lines.find(x => x.key === inp.dataset.rkey);
      if (l) l.confirmedQty = inp.value === '' ? null : +inp.value;
    });
    document.querySelectorAll('.pc-reason').forEach(sel => {
      const l = run.lines.find(x => x.key === sel.dataset.rkey);
      if (l) l.shortageReason = sel.value;
    });
    document.querySelectorAll('.pc-note').forEach(inp => {
      const l = run.lines.find(x => x.key === inp.dataset.rkey);
      if (l) l.note = inp.value;
    });
  }

  /* Gán NCC cho 1 dòng SP */
  window.pcSetLineSup = function (runId, key, supId) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = run.lines.find(x => x.key === key); if (!l) return;
    const sup = getSuppliers().find(s => s.id === supId);
    l.supplierId = supId || ''; l.supplierName = sup ? sup.name : '';
    saveRuns(runs);
    window.pcOpenRun(runId);
  };
  /* Gán NCC hàng loạt cho SP chưa gán */
  window.pcBulkAssignSup = function (runId) {
    const supId = document.getElementById('pcBulkSup') && document.getElementById('pcBulkSup').value;
    if (!supId) { window.toast?.('Chọn NCC để gán', 'warn'); return; }
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const sup = getSuppliers().find(s => s.id === supId);
    let n = 0;
    run.lines.forEach(l => { if (!l.supplierId) { l.supplierId = supId; l.supplierName = sup ? sup.name : ''; n++; } });
    saveRuns(runs);
    window.toast?.('✓ Đã gán ' + n + ' SP cho ' + (sup ? sup.name : 'NCC'), 'success');
    window.pcOpenRun(runId);
  };

  window.pcSaveConfirm = function (runId) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    run.status = 'confirmed';
    saveRuns(runs);
    window.toast?.('💾 Đã lưu xác nhận NCC cho ' + runId, 'success');
    window.pcOpenRun(runId);
  };

  /* Chốt: ghi SL phân bổ về từng đơn + note thiếu + báo Sale */
  window.pcApplyAlloc = function (runId) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const orders = getOrders();
    const shortByOrder = {};   /* code → [ {name, short, reason} ] */
    run.lines.forEach(l => {
      const alloc = allocateLine(l);
      alloc.forEach(a => {
        const o = orders.find(x => x.code === a.code);
        if (!o) return;
        const it = (o.items || []).find(x => norm(x.name) === norm(l.name));
        if (it) {
          it.qty = a.give;
          it.total = Math.round(a.give * (+it.price || 0));
        }
        if (a.short > 0) {
          (shortByOrder[a.code] = shortByOrder[a.code] || []).push({ name: l.name, short: a.short, unit: l.unit, reason: (l.shortageReason || 'thiếu hàng') + (l.note ? ' — ' + l.note : '') });
        }
      });
    });
    /* cập nhật đơn: tổng tiền, note thiếu, whStatus */
    run.orderCodes.forEach(code => {
      const o = orders.find(x => x.code === code);
      if (!o) return;
      o.freight = (o.items || []).reduce((s, it) => s + (+it.total || 0), 0);
      o.whStatus = 'confirmed';
      const sh = shortByOrder[code];
      if (sh && sh.length) {
        o.shortages = sh;
        const txt = 'THIẾU: ' + sh.map(s => `${s.name} -${fmtQty(s.short)}${s.unit} (${s.reason})`).join('; ');
        o.note = (o.note ? o.note + ' · ' : '') + txt;
      }
    });
    S().set('orders', orders);
    run.status = 'confirmed';
    saveRuns(runs);

    /* Báo Sale: gom theo đơn → 1 tin Telegram (kênh 'alert') */
    const shortCodes = Object.keys(shortByOrder);
    if (shortCodes.length && window.sendTgMessage) {
      const msg = `⚠️ BÁO THIẾU HÀNG — phiên ${run.id}\n` + shortCodes.map(code => {
        const o = orders.find(x => x.code === code);
        return `\n📦 ${code} · ${o ? o.custName : ''}\n` + shortByOrder[code].map(s => `   • ${s.name}: thiếu ${fmtQty(s.short)}${s.unit} — ${s.reason}`).join('\n');
      }).join('\n') + `\n\n👉 Sale báo lại khách + điều chỉnh nếu cần.`;
      window.sendTgMessage('alert', msg).then(r => {
        if (r.ok) window.toast?.('📨 Đã báo Sale ' + shortCodes.length + ' đơn thiếu vào "' + r.channel + '"', 'success');
      });
    }
    window.toast?.(`✅ Đã chốt ${run.id}: ghi SL về ${run.orderCodes.length} đơn` + (shortCodes.length ? ` · ${shortCodes.length} đơn thiếu` : ' · đủ hàng'), 'success');
    window.pcOpenRun(runId);
    closeDrawerSoft();
  };
  function closeDrawerSoft() { /* giữ drawer mở để xem; no-op */ }

  /* ===== Phiếu yêu cầu NCC ===== */
  function supReqData(run, supKey) {
    const lines = run.lines.filter(l => (l.supplierId || '__none__') === supKey);
    const supName = lines[0] ? (lines[0].supplierName || '(chưa gán NCC)') : '';
    return { lines, supName };
  }
  function company() {
    const ci = S().get('companyInfo', {}) || {};
    const origin = (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : 'https://app.nongsantuantuhanoi.vn';
    return { name: 'NÔNG SẢN TUẤN TÚ HÀ NỘI', addr: ci.address || '36/147A Tân Mai, Hoàng Mai, Hà Nội', phone: ci.hotline || '0836 676 086', logo: ci.logo || (origin + '/assets/logo.png') };
  }

  window.pcPrintSupReq = function (runId, supKey) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const { lines, supName } = supReqData(run, supKey);
    const c = company();
    const today = new Date().toLocaleDateString('vi-VN');
    const rows = lines.map((l, i) => `<tr>
        <td class="stt">${i + 1}</td>
        <td><b>${esc(l.name)}</b></td>
        <td class="num"><b>${fmtQty(l.totalQty)}</b> ${l.unit}</td>
        <td style="font-size:11px;color:#555">${l.breakdown.map(b => esc(b.code) + ': ' + fmtQty(b.qty)).join(' · ')}</td>
      </tr>`).join('');
    const totalKg = lines.reduce((s, l) => s + l.totalQty, 0);
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PHIẾU YÊU CẦU HÀNG</title>
<style>@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
body{color:#1a1a1a;font-size:13px}.wrap{max-width:780px;margin:0 auto}
.top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1B5E20;padding-bottom:10px}
.top img{width:64px;height:64px;object-fit:contain}.brand h1{font-size:19px;color:#1B5E20;font-weight:800}.brand .sub{font-size:11px;color:#555;margin-top:4px}
.title{text-align:center;font-size:21px;font-weight:800;color:#1B5E20;letter-spacing:1px;margin:14px 0 2px}
.meta{display:flex;justify-content:space-between;font-size:12.5px;margin:8px 2px}.meta b{color:#1B5E20}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}th,td{border:1px solid #B6C9B0;padding:7px 9px}
th{background:#1B5E20;color:#fff;font-size:12px;text-transform:uppercase}td.stt{text-align:center;width:40px;color:#777}td.num{text-align:center;width:110px;font-weight:700;color:#1B5E20}
tbody tr:nth-child(even){background:#F4FAF2}tfoot td{background:#E8F5E9;font-weight:800;color:#1B5E20}
.note{font-size:11.5px;color:#555;margin-top:14px;line-height:1.6}</style></head><body><div class="wrap">
<div class="top"><img src="${c.logo}" onerror="this.style.display='none'"><div class="brand"><h1>${c.name}</h1><div class="sub">${esc(c.addr)} · ☎ ${esc(c.phone)}</div></div></div>
<div class="title">PHIẾU YÊU CẦU HÀNG</div>
<div class="meta"><div><b>Nhà cung cấp:</b> ${esc(supName)}</div><div><b>Ngày:</b> ${today} · Phiên ${run.id}</div></div>
<table><thead><tr><th style="width:40px">STT</th><th>Sản phẩm</th><th style="width:110px">Số lượng</th><th>Chi tiết theo đơn</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="2" style="text-align:right">TỔNG</td><td class="num">${fmtQty(totalKg)} kg</td><td></td></tr></tfoot></table>
<div class="note">⚖️ Đơn vị tính: KILOGRAM (KG). Cột "Chi tiết theo đơn" để đối chiếu khi giao thiếu.<br>Đề nghị NCC xác nhận sản lượng có thể giao + báo sớm mặt hàng thiếu (trái mùa / hết hàng).</div>
</div></body></html>`;
    printViaIframe(html);
  };

  window.pcCopySupReq = function (runId, supKey) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const { lines, supName } = supReqData(run, supKey);
    const totalKg = lines.reduce((s, l) => s + l.totalQty, 0);
    const txt = `📋 PHIẾU YÊU CẦU HÀNG — ${run.id}\n🏭 NCC: ${supName}\n📅 ${new Date().toLocaleDateString('vi-VN')}\n────────────\n`
      + lines.map((l, i) => `${i + 1}. ${l.name}: ${fmtQty(l.totalQty)} ${l.unit}\n   (${l.breakdown.map(b => b.code + ':' + fmtQty(b.qty)).join(' · ')})`).join('\n')
      + `\n────────────\n📦 Tổng: ${fmtQty(totalKg)} kg · đơn vị KG\nĐề nghị NCC xác nhận + báo sớm hàng thiếu. Cảm ơn!\n— Nông Sản Tuấn Tú`;
    copyText(txt, 'phiếu yêu cầu NCC');
  };

  /* ============ ③ XUẤT KHO → SHIP ============ */
  function renderRelease() {
    const host = document.getElementById('pcRelease');
    /* đơn đã chốt hàng (confirmed) chờ xuất kho */
    const orders = getOrders().filter(o => o.whStatus === 'confirmed' && o.status !== 'cancelled');
    if (!orders.length) { host.innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:40px;text-align:center;color:var(--muted)">Chưa có đơn nào đã chốt hàng. Hoàn tất xác nhận NCC ở tab ② trước.</div>`; return; }
    host.innerHTML = `<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Đơn đã chốt sản lượng — tạo phiếu xuất kho (có ca/giờ giao) rồi giao shipper.</div>` +
      orders.map(o => {
        const kg = (o.items || []).reduce((s, it) => s + (+it.qty || 0), 0);
        const hasShort = o.shortages && o.shortages.length;
        return `<div class="run-card" style="cursor:default">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="font-weight:800;color:var(--navy)">${o.code}</div>
            <span style="font-size:12.5px;color:var(--muted)">${esc(o.custName || '')}</span>
            ${o.shipShift ? `<span class="tag" style="background:#FEF3C7;color:#92400E">Ca ${esc(o.shipShift)}${o.shipTime ? ' · ' + esc(o.shipTime) : ''}</span>` : ''}
            ${hasShort ? `<span class="tag" style="background:#FEE2E2;color:#B91C1C">⚠ thiếu ${o.shortages.length} mã</span>` : ''}
            <div style="flex:1"></div>
            <span style="font-size:12px;color:var(--muted)">${(o.items || []).length} mã · ${fmtQty(kg)} kg</span>
            <button class="btn btn-navy btn-sm" onclick="window.pcPrintRelease('${o.code}')">🖨 Phiếu xuất kho</button>
            <button class="btn btn-primary btn-sm" onclick="window.pcDispatch('${o.code}')">🛵 Giao shipper</button>
          </div>
        </div>`;
      }).join('');
  }

  window.pcPrintRelease = function (code) {
    const o = getOrders().find(x => x.code === code); if (!o) return;
    const c = company();
    const items = o.items || [];
    const totalKg = items.reduce((s, it) => s + (+it.qty || 0), 0);
    const rows = items.map((it, i) => `<tr><td class="stt">${i + 1}</td><td><b>${esc(it.name)}</b></td><td class="num">${fmtQty(it.qty)} ${it.unit || 'kg'}</td></tr>`).join('');
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PHIẾU XUẤT KHO</title>
<style>@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
body{color:#1a1a1a;font-size:13px}.wrap{max-width:780px;margin:0 auto}
.top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1B5E20;padding-bottom:10px}
.top img{width:64px;height:64px;object-fit:contain}.brand h1{font-size:19px;color:#1B5E20;font-weight:800}.brand .sub{font-size:11px;color:#555;margin-top:4px}
.title{text-align:center;font-size:21px;font-weight:800;color:#1B5E20;letter-spacing:1px;margin:14px 0 2px}
.metabox{border:1px solid #CBD9C4;border-radius:8px;padding:10px 14px;margin:8px 0;background:#F7FBF5}
.meta{display:flex;justify-content:space-between;gap:18px;font-size:12.5px;line-height:1.9}.meta b{color:#1B5E20}
.ship{background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;color:#92400E;margin:6px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #B6C9B0;padding:7px 10px}
th{background:#1B5E20;color:#fff;font-size:12px;text-transform:uppercase}td.stt{text-align:center;width:46px;color:#777}td.num{text-align:center;width:120px;font-weight:700;color:#1B5E20}
tbody tr:nth-child(even){background:#F4FAF2}tfoot td{background:#E8F5E9;font-weight:800;color:#1B5E20}
.sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:34px;text-align:center;font-size:11.5px}.sig .role{font-weight:700;color:#1B5E20}.sig .l{margin-top:46px;border-top:1px dotted #aaa}</style></head><body><div class="wrap">
<div class="top"><img src="${c.logo}" onerror="this.style.display='none'"><div class="brand"><h1>${c.name}</h1><div class="sub">${esc(c.addr)} · ☎ ${esc(c.phone)}</div></div></div>
<div class="title">PHIẾU XUẤT KHO</div>
<div class="metabox"><div class="meta"><div><b>Khách hàng:</b> ${esc(o.custName || '')}</div><div><b>Mã đơn:</b> ${o.code}</div></div>
<div class="meta"><div><b>Giao đến:</b> ${esc(o.drop || '')}</div><div><b>SĐT:</b> ${esc(o.custPhone || '')}</div></div></div>
<div class="ship">🚚 Giao: ${esc(o.deliverDate || '...')} · Ca ${esc(o.shipShift || '...')}${o.shipTime ? ' · ' + esc(o.shipTime) : ''} · Shipper: ${esc(o.driverName || '............')}</div>
<table><thead><tr><th style="width:46px">STT</th><th>Sản phẩm</th><th style="width:120px">Số lượng</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="2" style="text-align:right">TỔNG SẢN LƯỢNG</td><td class="num">${fmtQty(totalKg)} kg</td></tr></tfoot></table>
${o.shortages && o.shortages.length ? `<div style="margin-top:10px;font-size:11.5px;color:#B91C1C"><b>⚠ Lưu ý thiếu:</b> ${o.shortages.map(s => esc(s.name) + ' -' + fmtQty(s.short) + s.unit + ' (' + esc(s.reason) + ')').join('; ')}</div>` : ''}
<div class="sig"><div><div class="role">Thủ kho xuất</div><div class="l"></div></div><div><div class="role">Shipper nhận</div><div class="l"></div></div><div><div class="role">Khách nhận</div><div class="l"></div></div></div>
</div></body></html>`;
    printViaIframe(html);
  };

  window.pcDispatch = function (code) {
    const orders = getOrders(); const o = orders.find(x => x.code === code); if (!o) return;
    o.whStatus = 'released';
    o.status = 'pickup';   /* vào pipeline giao hàng */
    S().set('orders', orders);
    /* gửi shipper qua kênh điều phối */
    if (window.sendTgMessage) {
      const items = (o.items || []).map(it => `   • ${it.name}: ${fmtQty(it.qty)} ${it.unit || 'kg'}`).join('\n');
      const msg = `🛵 ĐIỀU PHỐI GIAO — ${o.code}\n👤 KH: ${o.custName || ''}\n📍 ${o.drop || ''}\n☎ ${o.custPhone || ''}\n🚚 Giao: ${o.deliverDate || ''} · Ca ${o.shipShift || ''}${o.shipTime ? ' · ' + o.shipTime : ''}\n────────\n${items}\n────────\n💵 ${money(o.freight)} ₫${o.cod ? '\n🟡 COD: ' + money(o.cod) + ' ₫' : ''}`;
      window.sendTgMessage('shipper_dispatch', msg).then(r => {
        window.toast?.(r.ok ? '🛵 Đã giao shipper ' + code + ' (gửi "' + r.channel + '")' : 'Đã chuyển ' + code + ' sang giao (chưa cấu hình TG shipper)', r.ok ? 'success' : 'info');
      });
    } else {
      window.toast?.('Đã chuyển ' + code + ' sang Đang giao', 'success');
    }
    renderRelease();
  };

  /* ===== Helpers in/copy ===== */
  function printViaIframe(html) {
    const old = document.getElementById('pcPrintFrame'); if (old) old.remove();
    const f = document.createElement('iframe');
    f.id = 'pcPrintFrame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentWindow.document; doc.open(); doc.write(html); doc.close();
    const fire = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { } };
    const img = doc.querySelector('img');
    if (img && !img.complete) { img.onload = () => setTimeout(fire, 120); img.onerror = () => setTimeout(fire, 120); }
    else setTimeout(fire, 250);
    window.toast?.('🖨 Mở hộp in — bỏ tick "Headers and footers" để ẩn ngày/URL', 'info');
  }
  function copyText(txt, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => window.toast?.('📋 Đã copy ' + label + ' — dán vào Zalo/SMS', 'success'))
        .catch(() => fallbackCopy(txt, label));
    } else fallbackCopy(txt, label);
  }
  function fallbackCopy(txt, label) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); window.toast?.('📋 Đã copy ' + label, 'success'); } catch (e) { window.toast?.('Không copy được — bôi đen thủ công', 'warn'); }
    ta.remove();
  }
  window.closeDrawer = function () {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBg').classList.remove('open');
  };

  /* ===== Init ===== */
  function init() {
    if (window.renderAppShell) window.renderAppShell('procurement', 'Gom hàng → NCC');
    renderAll();
    /* refresh khi STORE đổi (realtime) */
    S().subscribe?.('orders', () => { renderGather(); renderRelease(); });
    S().subscribe?.('procurementRuns', () => { renderRuns(); renderRelease(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
