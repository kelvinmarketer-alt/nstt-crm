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

  /* ===== Loại NCC (sỉ / lẻ / cả hai) — lưu kv 'supplierMeta' (cloud suppliers k có cột) ===== */
  const getSupMeta = () => S().get('supplierMeta', {}) || {};
  const supplyTypeOf = (supId) => { const m = getSupMeta()[supId]; return (m && m.type) || 'both'; };
  const TYPE_LABEL = { si: 'Sỉ', le: 'Lẻ', both: 'Sỉ+Lẻ' };

  /* Tất cả NCC cung cấp 1 SP — sắp theo SAO giảm dần (auto ưu tiên), rồi giá tăng dần */
  function suppliersForProduct(productId, productName) {
    const out = [];
    getSuppliers().filter(s => s.active !== false).forEach(s => {
      const p = (s.products || []).find(pp => (productId && pp.id === productId) || norm(pp.name) === norm(productName));
      if (p) out.push({ id: s.id, name: s.name, price: +p.price || 0, rating: +s.rating || 0, type: supplyTypeOf(s.id) });
    });
    return out.sort((a, b) => (b.rating - a.rating) || (a.price - b.price));
  }

  /* Auto phân bổ theo SAO: NCC sao cao nhất nhận TOÀN BỘ (người gom tự tách sau nếu NCC k đủ) */
  function autoStarAllocate(line) {
    const cands = suppliersForProduct(line.productId, line.name);
    if (cands.length) {
      const top = cands[0];
      line.allocations = [{ supplierId: top.id, supplierName: top.name, qty: line.totalQty, unitCost: top.price, confirmedQty: null }];
    } else if (!Array.isArray(line.allocations)) {
      line.allocations = [];
    }
  }
  /* Migrate dòng cũ (supplierId đơn) → allocations[]; đảm bảo luôn có mảng */
  function normalizeLine(l) {
    if (!Array.isArray(l.allocations)) l.allocations = [];
    if (!l.allocations.length && l.supplierId) {
      l.allocations = [{ supplierId: l.supplierId, supplierName: l.supplierName || '', qty: l.totalQty,
        unitCost: l.unitCost || 0, confirmedQty: (l.confirmedQty != null ? l.confirmedQty : null) }];
    }
    return l;
  }
  function normalizeRun(run) { if (run && Array.isArray(run.lines)) run.lines.forEach(normalizeLine); return run; }

  const allocOf = (l) => (l.allocations || []).reduce((s, a) => s + (+a.qty || 0), 0);            /* tổng đã phân bổ NCC */
  const remainOf = (l) => +((l.totalQty || 0) - allocOf(l)).toFixed(2);                            /* còn chưa phân bổ */
  const confirmedOf = (l) => (l.allocations || []).reduce((s, a) => s + (a.confirmedQty != null && a.confirmedQty !== '' ? +a.confirmedQty : (+a.qty || 0)), 0); /* tổng NCC giao thực */

  /* ===== Gom SL nhiều đơn → lines (gom theo MÃ HÀNG) ===== */
  function buildLines(orderCodes) {
    const orders = getOrders().filter(o => orderCodes.includes(o.code))
      .sort((a, b) => (a.createdAt || a.date || '') < (b.createdAt || b.date || '') ? -1 : 1);
    const products = getProducts();
    const prodByName = {};
    products.forEach(p => { prodByName[norm(p.name)] = p; });

    const map = new Map();
    orders.forEach(o => (o.items || []).forEach(it => {
      const prod = prodByName[norm(it.name)];
      const key = prod ? prod.id : 'x:' + norm(it.name);
      if (!map.has(key)) {
        map.set(key, {
          key, productId: prod ? prod.id : '', name: it.name, unit: it.unit || 'kg',
          totalQty: 0, breakdown: [], allocations: [], shortageReason: '', note: ''
        });
      }
      const g = map.get(key);
      g.totalQty = +(g.totalQty + (+it.qty || 0)).toFixed(2);
      g.breakdown.push({ code: o.code, custName: o.custName, qty: +it.qty || 0, createdAt: o.createdAt || o.date || '' });
    }));
    const lines = [...map.values()];
    lines.forEach(autoStarAllocate);  /* tự gán NCC sao cao nhất */
    return lines;
  }

  /* ===== Phân bổ phần thiếu: ƯU TIÊN ĐƠN ĐẶT TRƯỚC =====
     Tổng giao thực = Σ(giao thực từng NCC). Đơn tạo sớm nhận đủ trước; đơn sau gánh thiếu. */
  function allocateLine(line) {
    const hasAlloc = Array.isArray(line.allocations) && line.allocations.length;
    let avail = hasAlloc ? confirmedOf(line)
      : (line.confirmedQty != null && line.confirmedQty !== '' ? +line.confirmedQty : line.totalQty);
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
    const noSup = lines.filter(l => remainOf(l) > 0.001);  /* chưa phân bổ đủ NCC */
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

  /* ============ ② PHIÊN GOM (master-detail) ============ */
  function renderRuns() {
    const host = document.getElementById('pcRunList');
    if (!host) return;
    const runs = getRuns();
    if (!runs.length) {
      host.innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:24px;text-align:center;color:var(--muted);font-size:12.5px">Chưa có phiên gom.<br>Chọn đơn ở bước ① để tạo.</div>`;
      const det = document.getElementById('pcRunDetail');
      if (det) det.innerHTML = `<div class="pc-detail-empty">Chưa có phiên gom nào.</div>`;
      return;
    }
    const stLabel = { draft: ['Nháp', '#64748B'], sent: ['Đã gửi NCC', '#0EA5E9'], confirmed: ['Đã xác nhận', '#15803D'], closed: ['Đã xuất kho', '#1B5E20'] };
    host.innerHTML = runs.map(r => {
      const [lb, clr] = stLabel[r.status] || stLabel.draft;
      normalizeRun(r);
      const nNone = r.lines.filter(l => remainOf(l) > 0.001).length;
      const totalKg = r.lines.reduce((s, l) => s + l.totalQty, 0);
      const sel = window._pcActiveRun === r.id ? ' pc-sel' : '';
      return `<div class="run-card${sel}" data-runid="${r.id}" onclick="window.pcOpenRun('${r.id}')" style="padding:11px 13px">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          <div style="font-weight:800;font-size:14px;color:var(--navy)">${r.id}</div>
          <span class="tag" style="background:${clr}1f;color:${clr};font-weight:700;font-size:10.5px">${lb}</span>
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:5px">${r.orderCodes.length} đơn · ${r.lines.length} mã · ${fmtQty(totalKg)} kg</div>
        ${nNone > 0 ? `<div style="margin-top:6px"><span class="tag" style="background:#FEF3C7;color:#B45309;font-weight:700;font-size:10.5px">⚠ ${nNone} mã chưa phân bổ đủ NCC</span></div>` : `<div style="margin-top:6px"><span style="font-size:11px;color:#15803D;font-weight:700">✓ đã phân bổ đủ NCC</span></div>`}
      </div>`;
    }).join('');
    /* nếu phiên đang chọn không còn → mở phiên đầu */
    if (!window._pcActiveRun || !runs.find(r => r.id === window._pcActiveRun)) {
      /* giữ panel trống, để user tự chọn */
    }
  }

  function _supOpts(selId) {
    const sups = getSuppliers().filter(s => s.active !== false);
    return `<option value="">— Chọn NCC —</option>` +
      sups.map(s => `<option value="${s.id}" ${selId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  }

  /* Tổng hợp theo NCC từ allocations (cho phần "đặt hàng theo NCC" + summary) */
  function summarizeBySupplier(run) {
    const bySup = {};            /* supId → { id,name,type,rating, items:[{name,unit,qty,cost}], breakdown per cust } */
    run.lines.forEach(l => (l.allocations || []).forEach(a => {
      if (!a.supplierId || !(+a.qty)) return;
      const b = bySup[a.supplierId] = bySup[a.supplierId] || { id: a.supplierId, name: a.supplierName || a.supplierId, items: [], kg: 0, cost: 0 };
      b.items.push({ key: l.key, name: l.name, unit: l.unit, qty: +a.qty || 0, unitCost: +a.unitCost || 0, breakdown: l.breakdown });
      b.kg += +a.qty || 0; b.cost += (+a.qty || 0) * (+a.unitCost || 0);
    }));
    return bySup;
  }
  /* Mỗi ĐƠN dùng bao nhiêu NCC (distinct suppliers chạm vào mã hàng của đơn) */
  function suppliersPerOrder(run) {
    const res = {};   /* code → Set(supId) */
    run.lines.forEach(l => {
      const custCodes = new Set((l.breakdown || []).map(b => b.code));
      (l.allocations || []).forEach(a => { if (a.supplierId) custCodes.forEach(c => { (res[c] = res[c] || new Set()).add(a.supplierId); }); });
    });
    return res;
  }

  window.pcOpenRun = function (runId) {
    const runs = getRuns();
    const run = normalizeRun(runs.find(r => r.id === runId));
    if (!run) return;
    saveRuns(runs);  /* lưu migration allocations nếu có */
    const sups = getSuppliers().filter(s => s.active !== false);
    const supDL = `<datalist id="pcSupDL">${sups.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>`;
    const totalKg = run.lines.reduce((s, l) => s + l.totalQty, 0);
    const bySup = summarizeBySupplier(run);
    const perOrder = suppliersPerOrder(run);
    const nSup = Object.keys(bySup).length;
    const nIncomplete = run.lines.filter(l => remainOf(l) > 0.001).length;

    let body = supDL + `
      <div style="background:linear-gradient(135deg,#1B5E20,#2E7D32);color:#fff;padding:14px 18px;position:relative">
        <button onclick="window.pcCloseDetail()" title="Đóng" style="position:absolute;top:11px;right:13px;background:rgba(255,255,255,.18);border:none;color:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer">✕</button>
        <h2 style="margin:0;font-size:16px">${run.id} — Phiên gom hàng</h2>
        <div style="opacity:.9;font-size:12px;margin-top:3px">${run.orderCodes.length} đơn · ${run.lines.length} mã hàng · ${fmtQty(totalKg)} kg · ${nSup} NCC</div>
      </div>
      <div style="padding:14px 18px">`;

    /* ===== TỔNG QUAN SAU GOM ===== */
    body += `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px 14px;margin-bottom:14px">
      <div style="font-weight:800;color:#15803D;font-size:12.5px;margin-bottom:8px">📊 TỔNG QUAN SAU GOM</div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;margin-bottom:8px">
        <div><b style="font-size:16px;color:var(--navy)">${run.lines.length}</b> mã hàng</div>
        <div><b style="font-size:16px;color:var(--navy)">${fmtQty(totalKg)}</b> kg tổng</div>
        <div><b style="font-size:16px;color:var(--navy)">${nSup}</b> nhà cung cấp</div>
        ${nIncomplete ? `<div style="color:#B45309"><b>${nIncomplete}</b> mã chưa phân bổ đủ</div>` : '<div style="color:#15803D">✓ đã phân bổ đủ</div>'}
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px">Số NCC mỗi đơn:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${run.orderCodes.map(code => {
        const o = getOrders().find(x => x.code === code);
        const n = (perOrder[code] || new Set()).size;
        return `<span class="bd-chip">${code}${o ? ' · ' + esc(o.custName || '') : ''}: <b>${n} NCC</b></span>`;
      }).join('')}</div>
    </div>`;

    /* ===== PHÂN BỔ NCC THEO TỪNG MÃ (chia nhiều NCC được) ===== */
    body += `<div style="font-weight:800;color:var(--navy);font-size:12.5px;margin:4px 0 8px">🧮 PHÂN BỔ NCC THEO TỪNG MÃ <span style="font-weight:400;color:var(--muted)">(1 mã có thể chia nhiều NCC)</span></div>`;
    run.lines.forEach(l => {
      const cands = suppliersForProduct(l.productId, l.name);
      const alloc = allocateLine(l);
      const totalShort = alloc.reduce((s, a) => s + a.short, 0);
      const done = allocOf(l), remain = remainOf(l);
      const okAlloc = Math.abs(remain) < 0.001;
      body += `<div class="pc-line" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
          <div style="flex:1;min-width:130px"><b>${esc(l.name)}</b> <span style="color:var(--muted);font-size:11.5px">· cần <b style="color:var(--navy)">${fmtQty(l.totalQty)} ${l.unit}</b></span></div>
          <span class="tag" style="background:${okAlloc ? '#DCFCE7' : '#FEF3C7'};color:${okAlloc ? '#15803D' : '#B45309'};font-weight:700;font-size:10.5px">
            ${okAlloc ? '✓ đã phân bổ đủ' : `đã ${fmtQty(done)}/${fmtQty(l.totalQty)} · còn ${fmtQty(remain)} ${l.unit}`}</span>
          ${cands.length ? `<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 8px" onclick="window.pcAutoStar('${run.id}','${l.key}')" title="Tự gán NCC sao cao nhất">⭐ Tự chọn theo sao</button>` : `<span style="font-size:11px;color:#B45309">⚠ chưa NCC nào khai cung cấp mã này</span>`}
        </div>`;
      /* các dòng allocation (NCC + sl + giao thực) */
      (l.allocations || []).forEach((a, ai) => {
        body += `<div class="pc-alloc" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:3px 0 3px 6px">
          <span style="color:var(--muted);font-size:11px">↳</span>
          <input list="pcSupDL" value="${esc(a.supplierName || '')}" placeholder="Gõ tên NCC…"
            onchange="window.pcSetAllocSup('${run.id}','${l.key}',${ai},this.value)"
            style="font-size:11.5px;border:1px solid ${a.supplierId ? 'var(--line)' : '#F59E0B'};border-radius:5px;padding:3px 6px;width:150px;${a.supplierId ? '' : 'background:#FEF9C3'}">
          <input type="number" min="0" step="0.1" value="${a.qty != null ? a.qty : ''}" placeholder="SL"
            onchange="window.pcSetAllocQty('${run.id}','${l.key}',${ai},this.value)"
            style="width:64px;text-align:right;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 6px"> <span style="font-size:11px;color:var(--muted)">${l.unit}</span>
          <label style="font-size:11px;color:var(--muted)">giao thực:
            <input type="number" min="0" step="0.1" value="${a.confirmedQty != null ? a.confirmedQty : ''}" placeholder="${fmtQty(a.qty || 0)}"
              onchange="window.pcSetAllocConf('${run.id}','${l.key}',${ai},this.value)"
              style="width:60px;text-align:right;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 6px"></label>
          <button onclick="window.pcDelAlloc('${run.id}','${l.key}',${ai})" title="Xoá NCC này" style="background:none;border:none;color:#B91C1C;cursor:pointer;font-size:13px">✕</button>
        </div>`;
      });
      body += `<div style="margin:2px 0 6px 6px">
          <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px" onclick="window.pcAddAlloc('${run.id}','${l.key}')">➕ Thêm NCC chia phần</button>
          ${cands.length > 1 ? `<span style="font-size:10.5px;color:var(--muted);margin-left:6px">NCC bán mã này: ${cands.map(c => esc(c.name) + ' ' + '★'.repeat(Math.round(c.rating))).join(' · ')}</span>` : ''}
        </div>`;
      /* lý do thiếu + ghi chú + breakdown phân bổ về đơn */
      body += `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 0 6px">
          <select data-rkey="${l.key}" class="pc-reason" style="font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 6px">
            <option value="">— lý do thiếu —</option>
            ${['Trái mùa', 'Sai quy cách', 'Hàng thối/hỏng', 'NCC hết hàng', 'Khác'].map(r => `<option ${l.shortageReason === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <input type="text" data-rkey="${l.key}" class="pc-note" value="${esc(l.note || '')}" placeholder="Ghi chú..." style="flex:1;min-width:120px;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 8px">
        </div>
        <div style="margin:6px 0 0 6px">${alloc.map(a => `<span class="bd-chip ${a.short > 0 ? 'short' : ''}">${a.code}: ${fmtQty(a.give)}${a.short > 0 ? ' <b>(-' + fmtQty(a.short) + ')</b>' : ''}</span>`).join('')}
          ${totalShort > 0 ? `<span style="color:#B91C1C;font-size:11.5px;font-weight:700;margin-left:6px">⚠ Thiếu ${fmtQty(totalShort)} ${l.unit}</span>` : ''}</div>
      </div>`;
    });

    /* ===== TỔNG HỢP ĐẶT HÀNG THEO NCC ===== */
    if (nSup > 0) {
      body += `<div style="font-weight:800;color:var(--navy);font-size:12.5px;margin:14px 0 8px">🏭 ĐẶT HÀNG THEO NHÀ CUNG CẤP</div>`;
      Object.values(bySup).forEach(b => {
        const sObj = getSuppliers().find(s => s.id === b.id) || {};
        const typ = supplyTypeOf(b.id);
        const rating = +sObj.rating || 0;
        body += `<div class="sup-block" style="margin-bottom:12px">
          <div class="hd">🏭 ${esc(b.name)} <span style="opacity:.85;font-weight:400;font-size:11px">${'★'.repeat(Math.round(rating)) || ''} · ${TYPE_LABEL[typ]} · ${b.items.length} mã · ${fmtQty(b.kg)}kg${b.cost ? ' · ' + money(b.cost) + '₫' : ''}</span>
            <div style="flex:1"></div>
            <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="window.pcPrintSupReq('${run.id}','${b.id}')">🖨 In phiếu đặt</button>
            <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="window.pcCopySupReq('${run.id}','${b.id}')">📋 Copy Zalo</button>
          </div>
          <div style="padding:8px 12px">
          ${b.items.map(it => `<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #EEF2F0">
            <b>${esc(it.name)}</b>: ${fmtQty(it.qty)} ${it.unit}${it.unitCost ? ` <span style="color:var(--muted)">× ${money(it.unitCost)}₫</span>` : ''}
            ${typ === 'le' || typ === 'both' ? `<div style="font-size:10.5px;color:var(--muted);margin-top:1px">Chia khách: ${it.breakdown.map(bd => esc(bd.custName || bd.code) + ' ' + fmtQty(bd.qty) + it.unit).join(' · ')}</div>` : ''}
          </div>`).join('')}
          </div>
        </div>`;
      });
    }

    body += `<div style="position:sticky;bottom:0;background:#fff;padding-top:10px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-navy" onclick="window.pcSaveConfirm('${run.id}')">💾 Lưu</button>
        <button class="btn btn-primary" onclick="window.pcApplyAlloc('${run.id}')">✅ Chốt &amp; phân bổ về đơn + báo Sale</button>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">💡 Mỗi mã tự gán NCC sao cao nhất. Nếu 1 NCC không đủ → <b>➕ Thêm NCC chia phần</b>. <b>Tự cân:</b> sửa số kg 1 NCC thì NCC cuối tự nhận phần dư cho đủ tổng; muốn để dư cho NCC mới thì sửa ở dòng NCC cuối. "Giao thực" để trống = giao đủ.</div>
    </div>`;

    const dc = document.getElementById('pcRunDetail');
    if (dc) dc.innerHTML = body;
    window._pcActiveRun = runId;
    document.querySelectorAll('.run-card[data-runid]').forEach(c => c.classList.toggle('pc-sel', c.dataset.runid === runId));
  };

  window.pcCloseDetail = function () {
    window._pcActiveRun = null;
    const dc = document.getElementById('pcRunDetail');
    if (dc) dc.innerHTML = `<div class="pc-detail-empty">← Chọn một phiên gom bên trái để gán NCC & xác nhận hàng.</div>`;
    document.querySelectorAll('.run-card[data-runid]').forEach(c => c.classList.remove('pc-sel'));
  };

  /* Đọc lý do thiếu + ghi chú từ DOM (giao thực/SL NCC lưu trực tiếp qua onchange của allocation) */
  function readConfirmInputs(run) {
    document.querySelectorAll('.pc-reason').forEach(sel => {
      const l = run.lines.find(x => x.key === sel.dataset.rkey);
      if (l) l.shortageReason = sel.value;
    });
    document.querySelectorAll('.pc-note').forEach(inp => {
      const l = run.lines.find(x => x.key === inp.dataset.rkey);
      if (l) l.note = inp.value;
    });
  }
  const _line = (run, key) => run.lines.find(x => x.key === key);

  /* ===== Thao tác phân bổ NCC cho 1 mã ===== */
  /* Tự chọn NCC sao cao nhất nhận toàn bộ */
  window.pcAutoStar = function (runId, key) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l) return;
    autoStarAllocate(l);
    saveRuns(runs); renderRuns(); window.pcOpenRun(runId);
  };
  /* Thêm 1 dòng NCC chia phần (qty = phần còn thiếu) */
  window.pcAddAlloc = function (runId, key) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l) return;
    if (!Array.isArray(l.allocations)) l.allocations = [];
    l.allocations.push({ supplierId: '', supplierName: '', qty: Math.max(0, remainOf(l)), unitCost: 0, confirmedQty: null });
    saveRuns(runs); window.pcOpenRun(runId);
  };
  window.pcDelAlloc = function (runId, key, ai) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l || !l.allocations) return;
    l.allocations.splice(ai, 1);
    saveRuns(runs); window.pcOpenRun(runId);
  };
  window.pcSetAllocSup = function (runId, key, ai, name) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l || !l.allocations[ai]) return;
    const s = resolveOrCreateSupplier(name);
    const a = l.allocations[ai];
    a.supplierId = s ? s.id : ''; a.supplierName = s ? s.name : '';
    /* lấy giá nhập của NCC cho mã này (nếu có khai) */
    if (s) { const p = (s.products || []).find(pp => (l.productId && pp.id === l.productId) || norm(pp.name) === norm(l.name)); if (p) a.unitCost = +p.price || a.unitCost || 0; }
    saveRuns(runs); renderRuns(); window.pcOpenRun(runId);
  };
  window.pcSetAllocQty = function (runId, key, ai, val) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l || !l.allocations[ai]) return;
    l.allocations[ai].qty = val === '' ? 0 : +val;
    /* TỰ CÂN: sửa 1 NCC KHÔNG phải dòng cuối → DÒNG CUỐI tự nhận phần dư để đủ tổng.
       (Sửa chính dòng cuối → để dư hiển thị "còn thiếu", chờ thêm NCC mới hấp thụ.) */
    const last = l.allocations.length - 1;
    if (ai < last && l.allocations.length > 1) {
      const sumExceptLast = l.allocations.reduce((s, a, idx) => idx === last ? s : s + (+a.qty || 0), 0);
      l.allocations[last].qty = +Math.max(0, l.totalQty - sumExceptLast).toFixed(2);
    }
    saveRuns(runs); window.pcOpenRun(runId);
  };
  window.pcSetAllocConf = function (runId, key, ai, val) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l || !l.allocations[ai]) return;
    l.allocations[ai].confirmedQty = val === '' ? null : +val;
    saveRuns(runs); window.pcOpenRun(runId);
  };

  /* Tìm NCC theo tên (không phân biệt hoa/thường); nếu chưa có → tạo mới luôn */
  function resolveOrCreateSupplier(name) {
    name = (name || '').trim();
    if (!name) return null;
    const sups = getSuppliers();
    let s = sups.find(x => norm(x.name) === norm(name));
    if (!s) {
      s = { id: 'SUP' + Date.now().toString(36), name, active: true, products: [], phone: '', contact: '', address: '' };
      sups.push(s);
      S().set('suppliers', sups);
      window.toast?.('➕ Đã tạo NCC mới: ' + name, 'success');
    }
    return s;
  }

  /* Gán NCC cho 1 dòng SP — nhập tên (autocomplete), tạo mới nếu chưa có */
  window.pcSetLineSupByName = function (runId, key, name) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = run.lines.find(x => x.key === key); if (!l) return;
    const s = resolveOrCreateSupplier(name);
    l.supplierId = s ? s.id : ''; l.supplierName = s ? s.name : '';
    saveRuns(runs);
    renderRuns(); window.pcOpenRun(runId);
  };
  /* Giữ tương thích cũ (gán theo id) */
  window.pcSetLineSup = function (runId, key, supId) {
    const sup = getSuppliers().find(s => s.id === supId);
    window.pcSetLineSupByName(runId, key, sup ? sup.name : '');
  };
  /* Gán NCC hàng loạt cho SP chưa gán */
  window.pcBulkAssignSup = function (runId) {
    const inp = document.getElementById('pcBulkSup');
    const s = resolveOrCreateSupplier(inp ? inp.value : '');
    if (!s) { window.toast?.('Nhập tên NCC để gán', 'warn'); return; }
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    let n = 0;
    run.lines.forEach(l => { if (!l.supplierId) { l.supplierId = s.id; l.supplierName = s.name; n++; } });
    saveRuns(runs);
    window.toast?.('✓ Đã gán ' + n + ' SP cho ' + s.name, 'success');
    renderRuns(); window.pcOpenRun(runId);
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
  /* Chia khách theo từng dòng phân bổ NCC (ưu tiên đơn đặt trước lấp đầy NCC theo thứ tự).
     Trả về mảng cùng index với line.allocations: mỗi phần tử = [{code,custName,qty}] */
  function custSplitForLine(l) {
    const slots = (l.allocations || []).map(a => ({ cap: +a.qty || 0, items: [] }));
    const custs = [...(l.breakdown || [])].sort((a, b) => (a.createdAt || a.code) < (b.createdAt || b.code) ? -1 : 1);
    let ai = 0;
    custs.forEach(c => {
      let need = +c.qty || 0;
      while (need > 0.0001 && ai < slots.length) {
        if (slots[ai].cap <= 0.0001) { ai++; continue; }
        const take = Math.min(need, slots[ai].cap);
        slots[ai].items.push({ code: c.code, custName: c.custName, qty: +take.toFixed(2) });
        slots[ai].cap = +(slots[ai].cap - take).toFixed(3);
        need = +(need - take).toFixed(3);
        if (slots[ai].cap <= 0.0001) ai++;
      }
    });
    return slots.map(s => s.items);
  }
  /* Dữ liệu đặt hàng cho 1 NCC: gộp các mã NCC đó cung cấp + chia khách (cho NCC lẻ) */
  function supReqData(run, supId) {
    const sObj = getSuppliers().find(s => s.id === supId) || {};
    const supName = sObj.name || supId;
    const type = supplyTypeOf(supId);
    const items = [];
    run.lines.forEach(l => {
      const splits = custSplitForLine(l);
      let qty = 0, cost = 0; const custs = [];
      (l.allocations || []).forEach((a, ai) => {
        if (a.supplierId !== supId) return;
        qty += +a.qty || 0; cost += (+a.qty || 0) * (+a.unitCost || 0);
        (splits[ai] || []).forEach(x => custs.push(x));
      });
      if (qty > 0.0001) items.push({ name: l.name, unit: l.unit, qty: +qty.toFixed(2), unitCost: qty ? cost / qty : 0, custs });
    });
    return { lines: items, supName, type };
  }
  function company() {
    const ci = S().get('companyInfo', {}) || {};
    const origin = (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : 'https://app.nongsantuantuhanoi.vn';
    return { name: 'NÔNG SẢN TUẤN TÚ HÀ NỘI', addr: ci.address || '36/147A Tân Mai, Hoàng Mai, Hà Nội', phone: ci.hotline || '0836 676 086', logo: ci.logo || (origin + '/assets/logo.png') };
  }

  window.pcPrintSupReq = function (runId, supKey) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const { lines, supName, type } = supReqData(run, supKey);
    const c = company();
    const today = new Date().toLocaleDateString('vi-VN');
    const isLe = type === 'le' || type === 'both';
    const colHd = isLe ? 'Chia theo khách (NCC đóng sẵn)' : 'Chi tiết theo đơn';
    const rows = lines.map((l, i) => `<tr>
        <td class="stt">${i + 1}</td>
        <td><b>${esc(l.name)}</b></td>
        <td class="num"><b>${fmtQty(l.qty)}</b> ${l.unit}</td>
        <td style="font-size:11px;color:#555">${(l.custs || []).map(b => esc(isLe ? (b.custName || b.code) : b.code) + ': ' + fmtQty(b.qty)).join(' · ')}</td>
      </tr>`).join('');
    const totalKg = lines.reduce((s, l) => s + l.qty, 0);
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
<div class="meta"><div><b>Nhà cung cấp:</b> ${esc(supName)} <span style="font-weight:400;color:#555">(${TYPE_LABEL[type]})</span></div><div><b>Ngày:</b> ${today} · Phiên ${run.id}</div></div>
<table><thead><tr><th style="width:40px">STT</th><th>Sản phẩm</th><th style="width:110px">Số lượng</th><th>${colHd}</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="2" style="text-align:right">TỔNG</td><td class="num">${fmtQty(totalKg)} kg</td><td></td></tr></tfoot></table>
<div class="note">⚖️ Đơn vị tính: KILOGRAM (KG). ${isLe ? 'NCC <b>lẻ</b>: đóng gói SẴN theo từng khách như cột bên.' : 'NCC <b>sỉ</b>: đóng 1 lô theo tổng số lượng.'}<br>Đề nghị NCC xác nhận sản lượng có thể giao + báo sớm mặt hàng thiếu (trái mùa / hết hàng).</div>
</div></body></html>`;
    printViaIframe(html);
  };

  window.pcCopySupReq = function (runId, supKey) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const { lines, supName, type } = supReqData(run, supKey);
    const isLe = type === 'le' || type === 'both';
    const totalKg = lines.reduce((s, l) => s + l.qty, 0);
    const txt = `📋 PHIẾU YÊU CẦU HÀNG — ${run.id}\n🏭 NCC: ${supName} (${TYPE_LABEL[type]})\n📅 ${new Date().toLocaleDateString('vi-VN')}\n────────────\n`
      + lines.map((l, i) => `${i + 1}. ${l.name}: ${fmtQty(l.qty)} ${l.unit}` + (isLe && l.custs.length ? `\n   Chia khách: ${l.custs.map(b => (b.custName || b.code) + ' ' + fmtQty(b.qty) + l.unit).join(' · ')}` : '')).join('\n')
      + `\n────────────\n📦 Tổng: ${fmtQty(totalKg)} kg · đơn vị KG\n${isLe ? 'NCC LẺ: đóng gói sẵn theo từng khách như trên.' : 'NCC SỈ: đóng 1 lô theo tổng.'}\nĐề nghị NCC xác nhận + báo sớm hàng thiếu. Cảm ơn!\n— Nông Sản Tuấn Tú`;
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
