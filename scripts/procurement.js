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
  /* Ghi CẢ danh sách phiên, nhưng KHÔNG ghi đè: upsert theo id lên bản cloud mới nhất, và chỉ
     xoá đúng những phiên user vừa xoá (so với bản đang cầm) → phiên NV khác vừa tạo giữ nguyên.
     Idempotent. Nhờ vậy 16 chỗ gọi saveRuns() cũ tự an toàn, không phải sửa từng chỗ. */
  const saveRuns = (r) => {
    r = Array.isArray(r) ? r : [];
    if (!S().rmwKv) { S().set('procurementRuns', r); return; }
    const keep = new Set(r.map(x => x && x.id));
    const removed = getRuns().map(x => x && x.id).filter(id => id && !keep.has(id));
    S().rmwKv('procurementRuns', arr => {
      arr = Array.isArray(arr) ? arr : [];
      r.forEach(run => { const i = arr.findIndex(x => x && x.id === run.id); if (i >= 0) arr[i] = run; else arr.unshift(run); });
      return removed.length ? arr.filter(x => x && removed.indexOf(x.id) < 0) : arr;
    }, []);
  };
  /* Lưu 1 PHIÊN qua RMW (idempotent upsert theo run.id) → 2 NV sửa 2 phiên cùng lúc KHÔNG đè của nhau.
     Dùng cho các thao tác biết chắc run.id (tạo/gán SL/xác nhận/chốt). saveRuns() giữ cho xóa/bulk. */
  const saveRun = (run) => window.STORE.rmwKv('procurementRuns', arr => {
    arr = Array.isArray(arr) ? arr : [];
    const i = arr.findIndex(x => x.id === run.id);
    if (i >= 0) arr[i] = run; else arr.unshift(run);
    return arr;
  });
  const getOrders = () => S().get('orders', window.ORDERS || []) || [];
  const getSuppliers = () => S().get('suppliers', []) || [];
  const getProducts = () => S().get('products', window.PRODUCTS || []) || [];

  const norm = s => (s || '').toString().trim().toLowerCase();
  const fmtQty = q => (+q || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  const money = n => (window.fmt ? window.fmt(n) : (+n || 0).toLocaleString('vi-VN'));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Ngày giao → khoá so sánh 'YYYYMMDD' (nhận cả ISO 2026-07-06 lẫn dd/mm/yyyy). Rỗng → '' */
  function _dateKey(v) {
    if (!v) return '';
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);              /* ISO YYYY-MM-DD */
    if (m) return m[1] + m[2] + m[3];
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);        /* dd/mm/yyyy */
    if (m) return m[3] + String(m[2]).padStart(2, '0') + String(m[1]).padStart(2, '0');
    return '';
  }
  const _todayKey = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };

  /* Đơn đủ điều kiện gom: chưa giao/hủy, chưa xuất kho, VÀ ngày giao CHƯA QUA (>= hôm nay).
     Đơn quá ngày giao thì không cần gom/ship nữa → ẩn. includePast=true để đếm số đã ẩn. */
  function eligibleOrders(includePast) {
    const today = _todayKey();
    return getOrders().filter(o => {
      const st = o.status;
      if (st === 'cancelled' || st === 'returned' || st === 'delivered' || st === 'reconciled') return false;
      if (o.whStatus === 'released' || o.whStatus === 'confirmed') return false;
      /* Quá NGÀY GIAO → ẩn (giữ đơn hôm nay + tương lai + đơn chưa đặt ngày giao). */
      if (!includePast) { const dk = _dateKey(o.deliverDate); if (dk && dk < today) return false; }
      /* Danh sách đơn KHÔNG kéo cột `items` (tối ưu tải ~21×) → KHÔNG đòi o.items ở đây,
         nếu không MỌI đơn bị lọc sạch → "không có đơn nào cần gom". Chỉ cần đơn CÓ hàng:
         items (đơn vừa tạo còn trong RAM) HOẶC goods/qty/weight (đơn tải nhẹ từ cloud).
         Items thật sẽ nạp lazy trong buildLines khi bấm Tạo phiên gom. */
      return (Array.isArray(o.items) && o.items.length) ||
        (o.goods && String(o.goods).trim()) || (+o.qty > 0) || (+o.weight > 0);
    });
  }

  /* ===== Loại NCC (sỉ / lẻ / cả hai) — lưu kv 'supplierMeta' (cloud suppliers k có cột) ===== */
  const getSupMeta = () => S().get('supplierMeta', {}) || {};
  const supplyTypeOf = (supId) => { const m = getSupMeta()[supId]; return (m && m.type) || 'both'; };
  const TYPE_LABEL = { si: 'Sỉ', le: 'Lẻ', both: 'Sỉ+Lẻ' };

  /* NCC mặc định đã GHI NHỚ cho từng mã (kv 'whProcure'.prodSupplier) → lần gom sau tự gán.
     Bấm chip NCC = ghi nhớ luôn; hết hàng thì thêm NCC khác chia sản lượng. */
  const _whCfg = () => { const v = S().get('whProcure', null); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; };
  const defaultSupOf = pid => (_whCfg().prodSupplier || {})[pid] || '';
  function rememberSup(pid, supId) {
    if (!pid || !S().rmwKv) return;
    S().rmwKv('whProcure', c => {
      c = (c && typeof c === 'object' && !Array.isArray(c)) ? c : {};
      c.prodSupplier = c.prodSupplier || {};
      if (supId) c.prodSupplier[pid] = supId; else delete c.prodSupplier[pid];
      return c;
    }, {});
  }

  /* NCC bán 1 mã — NCC ĐÃ NHỚ luôn lên đầu (kể cả chưa khai giá), rồi tới nhà có giá, rẻ hơn. */
  function suppliersForProduct(productId, productName) {
    const def = defaultSupOf(productId);
    const out = [];
    getSuppliers().filter(s => s.active !== false).forEach(s => {
      const p = (s.products || []).find(pp => (productId && pp.id === productId) || norm(pp.name) === norm(productName));
      const isDef = s.id === def;
      if (p || isDef) out.push({ id: s.id, name: s.name, price: p ? (+p.price || 0) : 0, type: supplyTypeOf(s.id), isDefault: isDef, hasPrice: !!p });
    });
    return out.sort((a, b) => (b.isDefault - a.isDefault) || (b.hasPrice - a.hasPrice) || (a.price - b.price) || String(a.name).localeCompare(String(b.name), 'vi'));
  }

  /* Auto gán: NCC đã nhớ (hoặc rẻ nhất) nhận TOÀN BỘ; người gom thêm NCC khác nếu cần chia. */
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

  /* ===== Gom SL nhiều đơn → lines (gom theo MÃ HÀNG) =====
     ASYNC: danh sách đơn không kéo `items` (tối ưu tải) → nạp lazy items cho CÁC ĐƠN ĐƯỢC GOM
     qua getOrderItems (song song). Nếu không có items thì mọi line totalQty = 0 → gom rỗng. */
  async function buildLines(orderCodes) {
    const base = getOrders().filter(o => orderCodes.includes(o.code))
      .sort((a, b) => (a.createdAt || a.date || '') < (b.createdAt || b.date || '') ? -1 : 1);
    const _fail = [];
    const orders = await Promise.all(base.map(async o => {
      let items = (Array.isArray(o.items) && o.items.length) ? o.items : null;
      if (!items && window.SB_DATA && window.SB_DATA.getOrderItems) {
        const its = await window.SB_DATA.getOrderItems(o.code);
        if (Array.isArray(its)) items = its;   /* [] = đơn rỗng thật (hợp lệ) */
        else _fail.push(o.code);               /* null = TẢI LỖI (timeout/mạng) */
      }
      return Object.assign({}, o, { items: items || [] });   /* copy — không đụng STORE */
    }));
    /* Tải lỗi 1 đơn → NÉM để pcMakeRun bắt & báo; KHÔNG âm thầm bỏ SL đơn đó →
       tránh tạo phiên gom THIẾU sản lượng (đặt NCC hụt hàng mà tưởng đã đủ). */
    if (_fail.length) throw new Error('Chưa tải được mặt hàng của đơn: ' + _fail.join(', ') + ' — thử lại (tránh gom thiếu sản lượng).');
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

  /* ============ SUB-TAB (tab-trong-tab): chỉ hiện 1 pane ============ */
  window.pcSwitch = function (tab) {
    const valid = ['gather', 'runs', 'release', 'history'];
    if (valid.indexOf(tab) < 0) tab = 'gather';
    document.querySelectorAll('.pc-subtab').forEach(b => b.classList.toggle('active', b.dataset.pst === tab));
    document.querySelectorAll('.pc-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
  };
  function renderAll() { renderGather(); renderRuns(); renderRunHistory(); renderRelease(); }

  /* ============ ① CHỌN ĐƠN → GOM ============ */
  let picked = new Set();
  function renderGather() {
    const host = document.getElementById('pcGather');
    const orders = eligibleOrders();                         /* hôm nay + tương lai + chưa đặt ngày */
    const nPast = eligibleOrders(true).length - orders.length; /* số đơn đã QUÁ ngày giao (ẩn) */
    /* nhóm theo ngày giao */
    const byDate = {};
    orders.forEach(o => { const d = o.deliverDate || '(chưa đặt ngày giao)'; (byDate[d] = byDate[d] || []).push(o); });
    const dates = Object.keys(byDate).sort();
    let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <span style="font-size:12.5px;color:var(--muted)">Tick các đơn cùng đợt giao → bấm <b>Tạo phiên gom</b>. Phiên gom mở ra → <b>gán NCC cho từng mặt hàng</b> + xác nhận đủ/thiếu.</span>
        ${nPast ? `<span title="Đơn có ngày giao trước hôm nay — đã qua nên không gom/ship nữa" style="font-size:11.5px;color:#B45309;background:#FEF3C7;padding:3px 9px;border-radius:6px;font-weight:600">🕐 Ẩn ${nPast} đơn quá ngày giao</span>` : ''}
        <div style="flex:1"></div>
        <button class="btn btn-primary btn-sm" id="pcMakeRun" onclick="window.pcMakeRun()" disabled>🧺 Tạo phiên gom (<span id="pcSelN">0</span>)</button>
      </div>`;
    if (!orders.length) {
      html += `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:40px;text-align:center;color:var(--muted)">Không có đơn nào cần gom cho hôm nay trở đi.${nPast ? ` (${nPast} đơn quá ngày giao đã ẩn.)` : ' Đơn mới do Sale tạo sẽ hiện ở đây.'}</div>`;
    } else {
      dates.forEach(d => {
        html += `<div style="margin:14px 0 6px;font-weight:700;color:var(--navy);font-size:13px;display:flex;align-items:center;gap:8px">
          📅 Giao: ${esc(d)} <span style="font-weight:400;color:var(--muted);font-size:12px">(${byDate[d].length} đơn)</span>
          <button class="btn btn-ghost btn-sm" onclick="window.pcPickDate('${esc(d)}')">Chọn cả ngày</button></div>`;
        byDate[d].forEach(o => {
          /* Danh sách đơn không kéo items → đếm mã từ `goods` (phẩy) + kg từ `weight`,
             giống trang Đơn hàng. Đơn vừa tạo (còn items trong RAM) thì dùng items. */
          const hasItems = Array.isArray(o.items) && o.items.length;
          const nItems = hasItems ? o.items.length : (o.goods || '').split(',').filter(s => s.trim()).length;
          const kg = hasItems ? o.items.reduce((s, it) => s + (+it.qty || 0), 0) : (+o.weight || 0);
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
  window.pcMakeRun = async function () {
    if (!picked.size) return;
    const codes = [...picked];
    const btn = document.getElementById('pcMakeRun');
    if (btn) { btn.disabled = true; btn.dataset._t = btn.textContent; btn.textContent = '⏳ Đang nạp hàng…'; }
    let lines;
    try {
      lines = await buildLines(codes);   /* nạp lazy items cho các đơn được gom */
    } catch (e) {
      console.error('[pcMakeRun buildLines]', e);
      window.toast?.('⚠ Lỗi nạp mặt hàng của đơn: ' + (e.message || 'unknown'), 'warn');
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset._t || '🧺 Tạo phiên gom'; }
      return;
    }
    const noSup = lines.filter(l => remainOf(l) > 0.001);  /* chưa phân bổ đủ NCC */
    const runs = getRuns();
    /* ID theo SỐ LỚN NHẤT đang có +1, và bump tới khi CHƯA TRÙNG.
       (KHÔNG dùng runs.length: xoá 1 phiên giữa chừng → length < số max → trùng id →
        saveRun upsert-theo-id ĐÈ mất phiên cũ, phiên mới biến mất, đơn kẹt 'gathering' không ra ③.) */
    let _seqN = runs.reduce((m, r) => { const n = parseInt(String(r.id || '').replace(/\D/g, ''), 10) || 0; return n > m ? n : m; }, 0);
    let _rid;
    do { _seqN++; _rid = 'GOM-' + String(_seqN).padStart(3, '0'); } while (runs.some(r => r.id === _rid));
    const run = {
      id: _rid,
      createdAt: new Date().toISOString(),
      createdBy: (window.AUTH?.currentUser?.()?.name) || 'Kho',
      orderCodes: codes,
      lines,
      status: 'draft'
    };
    runs.unshift(run);
    saveRun(run);
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
  /* Phiên ĐÃ CHỐT & phân bổ (applied) hoặc đã xuất kho (closed) → rời danh sách gom, vào "Lịch sử".
     LƯU Ý: 'confirmed' = phiên cũ (đã xác nhận) cũng coi là đã gom → vào lịch sử. */
  const _isDoneRun = (r) => r.status === 'applied' || r.status === 'closed' || r.status === 'confirmed';

  /* ===== Chọn/xoá phiên (đơn lẻ + hàng loạt) ===== */
  window._pcRunSel = window._pcRunSel || new Set();
  /* checkbox + nút xoá trên 1 thẻ phiên */
  function _runCardCtrls(rid) {
    return `<input type="checkbox" class="pc-run-cb" ${window._pcRunSel.has(rid) ? 'checked' : ''} onclick="event.stopPropagation();window._pcToggleRunSel('${rid}',this.checked)" title="Chọn để xoá hàng loạt" style="width:15px;height:15px;flex-shrink:0;cursor:pointer">`;
  }
  function _runDelBtn(rid) {
    return `<button onclick="event.stopPropagation();window.pcDeleteRun('${rid}')" title="Xoá phiên (đơn trả về giai đoạn ①)" style="background:none;border:none;color:#B91C1C;cursor:pointer;font-size:14px">🗑</button>`;
  }
  /* Thanh hành động hàng loạt — hiện khi có phiên được chọn */
  function _bulkBar() {
    const n = window._pcRunSel.size;
    if (!n) return '';
    return `<div style="display:flex;align-items:center;gap:10px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px 11px;margin-bottom:8px">
      <span style="font-size:12px;font-weight:700;color:#B91C1C">Đã chọn ${n} phiên</span>
      <div style="flex:1"></div>
      <button class="btn btn-ghost btn-sm" onclick="window._pcClearRunSel()">Bỏ chọn</button>
      <button class="btn btn-sm" style="background:#DC2626;color:#fff" onclick="window.pcBulkDeleteRuns()">🗑 Xoá ${n} phiên đã chọn</button>
    </div>`;
  }
  window._pcToggleRunSel = function (rid, on) { if (on) window._pcRunSel.add(rid); else window._pcRunSel.delete(rid); renderRuns(); renderRunHistory(); };
  window._pcClearRunSel = function () { window._pcRunSel.clear(); renderRuns(); renderRunHistory(); };

  /* Xoá 1 phiên gom → trả các đơn về giai đoạn ① (chọn đơn → gom) */
  window.pcDeleteRun = function (runId, skipConfirm) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    if (!skipConfirm && !confirm(`Xoá phiên ${runId}?\nCác đơn trong phiên sẽ trả về giai đoạn ① (chọn đơn → gom).`)) return;
    const orders = getOrders(); let och = false;
    (run.orderCodes || []).forEach(code => {
      const o = orders.find(x => x.code === code);
      if (o && (o.whStatus === 'gathering' || o.whStatus === 'confirmed')) { o.whStatus = ''; och = true; }
    });
    if (och) S().set('orders', orders);
    saveRuns(runs.filter(r => r.id !== runId));
    window._pcRunSel.delete(runId);
    if (window._pcActiveRun === runId) { window._pcActiveRun = null; window.pcCloseDetail && window.pcCloseDetail(); }
    if (!skipConfirm) { window.toast?.('🗑 Đã xoá phiên ' + runId + ' · đơn trả về giai đoạn ①', 'danger'); renderAll(); }
  };
  window.pcBulkDeleteRuns = function () {
    const ids = [...window._pcRunSel];
    if (!ids.length) return;
    if (!confirm(`Xoá ${ids.length} phiên đã chọn?\nTất cả đơn trong các phiên này sẽ trả về giai đoạn ①.`)) return;
    ids.forEach(id => window.pcDeleteRun(id, true));
    window._pcRunSel.clear();
    window.toast?.(`🗑 Đã xoá ${ids.length} phiên · đơn trả về giai đoạn ①`, 'danger');
    renderAll();
  };
  /* Trả 1 đơn từ ③ Xuất kho về ② Phiên gom (gán lại NCC) */
  window.pcReturnToGom = function (code) {
    const orders = getOrders(); const o = orders.find(x => x.code === code); if (!o) return;
    const runs = getRuns(); const run = runs.find(r => Array.isArray(r.orderCodes) && r.orderCodes.includes(code));
    if (run) {
      if (!confirm(`Trả đơn ${code} về giai đoạn ② (phiên ${run.id}) để gán lại NCC?`)) return;
      run.status = 'draft'; saveRuns(runs);
      o.whStatus = 'gathering';
    } else {
      if (!confirm(`Đơn ${code} không còn thuộc phiên gom nào.\nTrả về giai đoạn ① (chọn đơn → gom)?`)) return;
      o.whStatus = '';
    }
    S().set('orders', orders);
    window.toast?.(run ? `↩ Đã trả ${code} về giai đoạn ② (phiên ${run.id})` : `↩ Đã trả ${code} về giai đoạn ①`, 'info');
    renderAll();
  };

  /* Trả CẢ PHIÊN đã chốt về bước gán NCC để kiểm/sửa (lỡ tay chốt).
     Đơn về "đang gom"; gỡ các phiếu nhập nháp (chưa nhận) mà phiên tự tạo. Phiếu ĐÃ NHẬN giữ nguyên. */
  window.pcReopenRun = function (runId, skipConfirm) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    if (!skipConfirm && !confirm(`Trả phiên ${run.id} về bước gán NCC để sửa?\n• Đơn về trạng thái "đang gom".\n• Các phiếu nhập nháp phiên tự tạo (CHƯA nhận) sẽ được gỡ, chốt lại sẽ tạo mới.\n• Phiếu đã "✓ Đã nhận" vẫn giữ nguyên.`)) return;
    run.status = 'draft'; saveRuns(runs);
    const orders = getOrders();
    (run.orderCodes || []).forEach(code => { const o = orders.find(x => x.code === code); if (o && o.whStatus === 'confirmed') o.whStatus = 'gathering'; });
    S().set('orders', orders);
    const pur = S().get('purchases', []) || [];
    pur.filter(p => _isGomPhieuOf(p, runId) && p.status === 'ordered').forEach(p => S().remove('purchases', p.id));
    window._pcActiveRun = null;
    renderRuns(); renderRunHistory(); renderRelease();
    window.toast?.(`↩ Đã trả phiên ${run.id} về bước gán NCC — kiểm/sửa rồi chốt lại`, 'info');
    window.pcOpenRun(runId);
  };

  function renderRunHistory() {
    const host = document.getElementById('pcRunHistory');
    if (!host) return;
    const hist = getRuns().filter(_isDoneRun);
    /* sub-tab điều khiển ẩn/hiện section; ở đây chỉ lo nội dung + empty-state */
    if (!hist.length) {
      host.innerHTML = '<div class="pc-detail-empty" style="border:1px dashed var(--line);border-radius:12px">Chưa có phiên gom nào được chốt &amp; phân bổ.</div>';
      return;
    }
    /* mới chốt lên đầu */
    hist.sort((a, b) => (a.confirmedAt || '') < (b.confirmedAt || '') ? 1 : -1);
    host.innerHTML = _bulkBar() + hist.map(r => {
      normalizeRun(r);
      const totalKg = r.lines.reduce((s, l) => s + l.totalQty, 0);
      const st = r.status === 'closed' ? ['Đã xuất kho', '#1B5E20'] : ['Đã chốt', '#15803D'];
      const when = r.confirmedAt ? new Date(r.confirmedAt).toLocaleString('vi-VN') : '';
      return `<div class="run-card" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer" onclick="window.pcOpenRun('${r.id}')">
        ${_runCardCtrls(r.id)}
        <div style="font-weight:800;color:var(--navy)">${r.id}</div>
        <span class="tag" style="background:${st[1]}1f;color:${st[1]};font-weight:700;font-size:10.5px">${st[0]}</span>
        <span style="font-size:11.5px;color:var(--muted)">${r.orderCodes.length} đơn · ${r.lines.length} mã · ${fmtQty(totalKg)} kg${when ? ' · ' + when : ''}</span>
        <div style="flex:1"></div>
        ${r.status === 'applied' ? `<button class="btn btn-ghost btn-sm" style="color:#B45309" onclick="event.stopPropagation();window.pcReopenRun('${r.id}')" title="Lỡ chốt? Trả cả phiên về bước gán NCC để sửa">↩ Trả về sửa</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window.pcOpenRun('${r.id}')">👁 Xem lại</button>
        ${_runDelBtn(r.id)}
      </div>`;
    }).join('');
  }

  function renderRuns() {
    const host = document.getElementById('pcRunList');
    if (!host) return;
    const allRuns = getRuns();
    const runs = allRuns.filter(r => !_isDoneRun(r));   /* chỉ phiên ĐANG gom */
    if (!runs.length) {
      const doneNote = allRuns.length ? '<br><span style="font-size:11px">Các phiên đã chốt xem ở <b>Lịch sử đã gom</b> bên dưới.</span>' : '';
      host.innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:24px;text-align:center;color:var(--muted);font-size:12.5px">Chưa có phiên gom đang xử lý.<br>Chọn đơn ở bước ① để tạo.${doneNote}</div>`;
      const det = document.getElementById('pcRunDetail');
      if (det && !window._pcActiveRun) det.innerHTML = `<div class="pc-detail-empty">← Tạo / chọn một phiên gom để gán NCC.</div>`;
      return;
    }
    const stLabel = { draft: ['Nháp', '#64748B'], sent: ['Đã gửi NCC', '#0EA5E9'], confirmed: ['Đã xác nhận', '#15803D'], closed: ['Đã xuất kho', '#1B5E20'] };
    host.innerHTML = _bulkBar() + runs.map(r => {
      const [lb, clr] = stLabel[r.status] || stLabel.draft;
      normalizeRun(r);
      const nNone = r.lines.filter(l => remainOf(l) > 0.001).length;
      const totalKg = r.lines.reduce((s, l) => s + l.totalQty, 0);
      const sel = window._pcActiveRun === r.id ? ' pc-sel' : '';
      return `<div class="run-card${sel}" data-runid="${r.id}" onclick="window.pcOpenRun('${r.id}')" style="padding:11px 13px">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          ${_runCardCtrls(r.id)}
          <div style="font-weight:800;font-size:14px;color:var(--navy)">${r.id}</div>
          <span class="tag" style="background:${clr}1f;color:${clr};font-weight:700;font-size:10.5px">${lb}</span>
          <div style="flex:1"></div>
          ${_runDelBtn(r.id)}
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
      b.items.push({ key: l.key, productId: l.productId, name: l.name, unit: l.unit, qty: +a.qty || 0, unitCost: +a.unitCost || 0, breakdown: l.breakdown });
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

  /* Tab trong màn phiên gom: 'assign' = gán NCC theo mã · 'order' = đặt hàng theo NCC.
     Giữ qua các lần re-render (bấm chip → render lại vẫn ở tab đang xem). */
  let _pcDetailTab = 'assign';
  let _pcAddSupKey = null;   /* line.key đang mở ô "thêm NCC" gọn — null = không mở ô nào */
  let _pcAddSupFocus = false; /* chỉ tự focus ô nhập 1 lần lúc mới mở (tránh giật focus khi re-render vì thao tác mã khác) */
  window.pcDetailTab = function (tab) {
    _pcDetailTab = (tab === 'order') ? 'order' : 'assign';
    document.querySelectorAll('.pc-dpane').forEach(p => { p.style.display = (p.dataset.dpane === _pcDetailTab) ? 'block' : 'none'; });
    document.querySelectorAll('.pc-dtab').forEach(b => b.classList.toggle('on', b.dataset.dtab === _pcDetailTab));
    const dc = document.getElementById('pcRunDetail'); if (dc) dc.scrollTop = 0;
  };
  /* Gập/mở phần "chi tiết" của 1 mã (chia NCC / giao thực / lý do thiếu / chia khách).
     Toggle THẲNG trên DOM (không re-render) → không mất trạng thái đang nhập. */
  window.pcToggleAdv = function (btn) {
    const line = btn.closest('.pc-line'); if (!line) return;
    const adv = line.querySelector('.pc-adv'); if (!adv) return;
    const open = adv.style.display !== 'none';
    adv.style.display = open ? 'none' : 'block';
    btn.textContent = open ? '⚙ chi tiết ▾' : '⚙ thu gọn ▲';
  };
  window.pcOpenRun = function (runId) {
    const runs = getRuns();
    const run = normalizeRun(runs.find(r => r.id === runId));
    if (!run) return;
    if (window._pcActiveRun !== runId) { _pcDetailTab = 'assign'; _pcAddSupKey = null; }   /* mở phiên KHÁC → về tab Gán NCC + đóng ô thêm NCC */
    saveRuns(runs);  /* lưu migration allocations nếu có */
    const sups = getSuppliers().filter(s => s.active !== false);
    const supDL = `<datalist id="pcSupDL">${sups.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>`;
    const totalKg = run.lines.reduce((s, l) => s + l.totalQty, 0);
    const bySup = summarizeBySupplier(run);
    const perOrder = suppliersPerOrder(run);
    const nSup = Object.keys(bySup).length;
    const nIncomplete = run.lines.filter(l => remainOf(l) > 0.001).length;
    const nExt = run.lines.filter(l => suppliersForProduct(l.productId, l.name).length === 0).length;

    let body = supDL + `
      <style>
        .pc-dtab{flex:1;padding:11px 8px;font-size:12.5px;font-weight:700;cursor:pointer;border:none;background:#F1F5F9;color:#64748B;border-bottom:3px solid transparent;white-space:nowrap}
        .pc-dtab.on{background:#fff;color:#15803D;border-bottom-color:#15803D}
        .pc-dtab .b{display:inline-block;margin-left:5px;font-size:10px;font-weight:700;border-radius:8px;padding:0 6px;vertical-align:middle}
      </style>
      <div style="background:linear-gradient(135deg,#1B5E20,#2E7D32);color:#fff;padding:14px 18px;position:relative">
        <button onclick="window.pcCloseDetail()" title="Đóng" style="position:absolute;top:11px;right:13px;background:rgba(255,255,255,.18);border:none;color:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer">✕</button>
        <h2 style="margin:0;font-size:16px">${run.id} — Phiên gom hàng</h2>
        <div style="opacity:.9;font-size:12px;margin-top:3px">${run.orderCodes.length} đơn · ${run.lines.length} mã hàng · ${fmtQty(totalKg)} kg · ${nSup} NCC</div>
      </div>
      <div class="pc-dtabs" style="display:flex;gap:0;background:#F1F5F9;position:sticky;top:0;z-index:8">
        <button class="pc-dtab${_pcDetailTab === 'assign' ? ' on' : ''}" data-dtab="assign" onclick="window.pcDetailTab('assign')">🧮 Chọn NCC cho các mã hàng${nIncomplete ? `<span class="b" style="background:#FEF3C7;color:#B45309">${nIncomplete} thiếu</span>` : ''}</button>
        <button class="pc-dtab${_pcDetailTab === 'order' ? ' on' : ''}" data-dtab="order" onclick="window.pcDetailTab('order')">📞 Gọi hàng<span class="b" style="background:#DCFCE7;color:#15803D">${nSup}</span>${nExt ? `<span class="b" style="background:#FEF3C7;color:#B45309">🛒${nExt}</span>` : ''}</button>
      </div>
      <div style="padding:14px 18px">
      <div class="pc-dpane" data-dpane="assign" style="display:${_pcDetailTab === 'order' ? 'none' : 'block'}">`;

    /* ===== TỔNG QUAN SAU GOM ===== */
    body += `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px 14px;margin-bottom:14px">
      <div style="font-weight:800;color:#15803D;font-size:12.5px;margin-bottom:8px">📊 TỔNG QUAN SAU GOM</div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;margin-bottom:8px">
        <div><b style="font-size:16px;color:var(--navy)">${run.lines.length}</b> mã hàng</div>
        <div><b style="font-size:16px;color:var(--navy)">${fmtQty(totalKg)}</b> kg tổng</div>
        <div><b style="font-size:16px;color:var(--navy)">${nSup}</b> nhà cung cấp</div>
        ${nIncomplete ? `<div style="color:#B45309"><b>${nIncomplete}</b> mã chưa phân bổ đủ</div>` : '<div style="color:#15803D">✓ đã phân bổ đủ</div>'}
        ${nExt ? `<div style="color:#B45309">🛒 <b>${nExt}</b> mã thu mua ngoài</div>` : ''}
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px">Số NCC mỗi đơn:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${run.orderCodes.map(code => {
        const o = getOrders().find(x => x.code === code);
        const n = (perOrder[code] || new Set()).size;
        return `<span class="bd-chip">${code}${o ? ' · ' + esc(o.custName || '') : ''}: <b>${n} NCC</b></span>`;
      }).join('')}</div>
    </div>`;

    /* ===== PHÂN BỔ NCC THEO TỪNG MÃ (chia nhiều NCC được) ===== */
    body += `<div style="font-weight:800;color:var(--navy);font-size:12.5px;margin:4px 0 8px">🧮 GÁN NHÀ CUNG CẤP <span style="font-weight:400;color:var(--muted)">— mỗi mã tự gán NCC quen; hết hàng thì bấm thêm NCC để chia</span></div>`;
    run.lines.forEach(l => {
      const cands = suppliersForProduct(l.productId, l.name);
      const alloc = allocateLine(l);
      const totalShort = alloc.reduce((s, a) => s + a.short, 0);
      const done = allocOf(l), remain = remainOf(l);
      const okAlloc = Math.abs(remain) < 0.001;
      const pickedIds = new Set((l.allocations || []).map(a => a.supplierId).filter(Boolean));
      const hasUnassigned = (l.allocations || []).some(a => !a.supplierId);
      /* Mặc định GỌN: chỉ hiện tên+SL+status+chip NCC. Phần "chi tiết" (chia NCC/giao thực/
         lý do thiếu/ghi chú/chia khách) GẬP lại — chỉ tự mở khi CÓ việc (chia ≥2 NCC, thiếu,
         có ghi chú, hoặc đang gõ NCC ngoài DS). */
      const showAdv = (l.allocations && l.allocations.length > 1) || !!l.shortageReason || !!l.note || totalShort > 0 || hasUnassigned;
      /* === THẺ 1 MÃ === */
      body += `<div class="pc-line" style="border:1px solid #E6ECE4;border-radius:9px;padding:9px 11px;margin-bottom:8px;background:#fff">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
          <div style="flex:1;min-width:120px"><b style="font-size:13px">${esc(l.name)}</b> <span style="color:var(--muted);font-size:12px">· ${fmtQty(l.totalQty)} ${l.unit}</span></div>
          <span class="tag" style="background:${okAlloc ? '#DCFCE7' : '#FEF3C7'};color:${okAlloc ? '#15803D' : '#B45309'};font-weight:700;font-size:10.5px;white-space:nowrap">${okAlloc ? '✓ đủ' : `còn ${fmtQty(remain)} ${l.unit}`}</span>
        </div>`;
      /* ===== CHIP chọn NCC (1 chạm) · ＋ thêm NCC gõ tên · ⚙ chi tiết ===== */
      if (!_isDoneRun(run)) {
        if (_pcAddSupKey === l.key) {
          /* Ô THÊM NCC gọn — 1 việc duy nhất: gõ tên → Lưu. Không lẫn qty/giao thực/ghi chú. */
          body += `<div style="margin-top:8px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:10px 12px">
            <div style="font-size:11.5px;color:#1D4ED8;font-weight:700;margin-bottom:7px">🏭 Nhà cung cấp cho «${esc(l.name)}»</div>
            <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
              <input id="pcAddSup_${l.key}" list="pcSupDL" placeholder="Gõ tên NCC…" autocomplete="off"
                onkeydown="if(event.key==='Enter'){event.preventDefault();window.pcConfirmAddSup('${run.id}','${l.key}')}else if(event.key==='Escape'){window.pcCancelAddSup('${run.id}')}"
                style="flex:1;min-width:160px;font-size:13.5px;border:1.5px solid #93C5FD;border-radius:8px;padding:8px 12px;background:#fff;outline:none">
              <button onclick="window.pcConfirmAddSup('${run.id}','${l.key}')" style="border:none;background:#15803D;color:#fff;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer">✓ Lưu</button>
              <button onclick="window.pcCancelAddSup('${run.id}')" style="border:1px solid #D1D5DB;background:#fff;color:#6B7280;border-radius:8px;padding:8px 13px;font-size:13px;cursor:pointer">Huỷ</button>
            </div>
            <div style="font-size:10.5px;color:#64748B;margin-top:6px">↵ Enter để lưu · gõ tên có sẵn để chọn nhanh, tên mới sẽ tự tạo NCC.</div>
          </div>`;
        } else if (cands.length) {
          body += `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:7px">
            ${cands.map(c => { const on = pickedIds.has(c.id);
              return `<button onclick="window.pcPickAllocSup('${run.id}','${l.key}','${c.id}')" title="Gán ${esc(c.name)} (1 chạm)"
                style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid ${on ? '#15803D' : '#D1D5DB'};background:${on ? '#DCFCE7' : '#fff'};color:${on ? '#166534' : '#374151'};border-radius:16px;padding:4px 11px;font-size:12px;cursor:pointer;font-weight:${on ? '700' : '500'}">
                ${on ? '✓ ' : ''}${esc(c.name)}${c.isDefault ? '<span title="NCC quen của mã này" style="font-size:9px;color:#fff;background:#15803D;border-radius:5px;padding:0 5px;line-height:1.7">quen</span>' : ''}${c.price ? `<span style="font-size:10px;color:#6B7280">${money(c.price)}₫</span>` : ''}<span style="font-size:9px;color:#fff;background:${c.type === 'si' ? '#2563EB' : c.type === 'le' ? '#D97706' : '#64748B'};border-radius:5px;padding:0 5px;line-height:1.7">${TYPE_LABEL[c.type]}</span></button>`;
            }).join('')}
            <button onclick="window.pcStartAddSup('${run.id}','${l.key}')" title="NCC khác ngoài danh sách" style="border:1px dashed #9CA3AF;background:#fff;color:#6B7280;border-radius:16px;padding:4px 11px;font-size:11.5px;cursor:pointer">＋ NCC khác</button>
            <div style="flex:1;min-width:6px"></div>
            <button onclick="window.pcToggleAdv(this)" style="border:none;background:none;color:#2563EB;font-size:11px;cursor:pointer;white-space:nowrap" title="Chia 2 NCC · báo thiếu · xem chia khách">⚙ ${showAdv ? 'thu gọn ▲' : 'chi tiết ▾'}</button>
          </div>`;
        } else {
          body += `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:7px">
            <span style="display:inline-flex;align-items:center;gap:6px;background:#FEF3C7;border:1px solid #FCD34D;color:#92400E;border-radius:16px;padding:4px 12px;font-size:12px;font-weight:700">🛒 Thu mua ngoài</span>
            <span style="font-size:11px;color:var(--muted)">chưa NCC nào bán mã này — kho tự đi mua</span>
            <button onclick="window.pcStartAddSup('${run.id}','${l.key}')" style="border:1px dashed #9CA3AF;background:#fff;color:#6B7280;border-radius:16px;padding:3px 11px;font-size:11.5px;cursor:pointer">＋ có NCC? gõ tên</button>
          </div>`;
        }
      }
      /* ===== CHI TIẾT (gập) ===== */
      body += `<div class="pc-adv" style="display:${showAdv ? 'block' : 'none'};margin-top:7px;padding-top:7px;border-top:1px dashed #EEF2F0">`;
      (l.allocations || []).forEach((a, ai) => {
        const supField = a.supplierId
          ? `<span style="display:inline-flex;align-items:center;gap:5px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:3px 9px;font-size:12px;font-weight:600;color:#166534">🏭 ${esc(a.supplierName)}${a.unitCost ? ` <span style="font-weight:400;color:#6B7280">${money(a.unitCost)}₫</span>` : ''}</span>`
          : `<input list="pcSupDL" value="${esc(a.supplierName || '')}" placeholder="Gõ tên NCC…" onchange="window.pcSetAllocSup('${run.id}','${l.key}',${ai},this.value)" style="font-size:11.5px;border:1px solid #F59E0B;border-radius:5px;padding:3px 6px;width:160px;background:#FEF9C3">`;
        body += `<div class="pc-alloc" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:3px 0">
          <span style="color:var(--muted);font-size:11px">↳</span>
          ${supField}
          ${l.allocations.length > 1 ? `<input type="number" min="0" step="0.1" value="${a.qty != null ? a.qty : ''}" placeholder="SL" onchange="window.pcSetAllocQty('${run.id}','${l.key}',${ai},this.value)" style="width:60px;text-align:right;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 6px" title="Số ${l.unit} NCC này"> <span style="font-size:11px;color:var(--muted)">${l.unit}</span>` : ''}
          <label style="font-size:11px;color:var(--muted)">giao thực: <input type="number" min="0" step="0.1" value="${a.confirmedQty != null ? a.confirmedQty : ''}" placeholder="${fmtQty(a.qty || 0)}" onchange="window.pcSetAllocConf('${run.id}','${l.key}',${ai},this.value)" style="width:56px;text-align:right;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 6px"></label>
          <button onclick="window.pcDelAlloc('${run.id}','${l.key}',${ai})" title="Bỏ NCC này" style="background:none;border:none;color:#B91C1C;cursor:pointer;font-size:13px">✕</button>
        </div>`;
      });
      const _addLbl = (l.allocations && l.allocations.length) ? '➕ Chia cho NCC thứ 2' : '＋ Gõ tên NCC';
      body += `<div style="margin:2px 0 5px 0">
          <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px" onclick="window.pcAddAlloc('${run.id}','${l.key}')">${_addLbl}</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0">
          <select data-rkey="${l.key}" class="pc-reason" style="font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 6px">
            <option value="">— lý do thiếu —</option>
            ${['Trái mùa', 'Sai quy cách', 'Hàng thối/hỏng', 'NCC hết hàng', 'Khác'].map(r => `<option ${l.shortageReason === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <input type="text" data-rkey="${l.key}" class="pc-note" value="${esc(l.note || '')}" placeholder="Ghi chú..." style="flex:1;min-width:120px;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 8px">
        </div>
        <div style="margin:5px 0 0 0;font-size:11px;color:var(--muted)">Chia khách: ${alloc.map(a => `<span class="bd-chip ${a.short > 0 ? 'short' : ''}">${a.code}: ${fmtQty(a.give)}${a.short > 0 ? ' <b>(-' + fmtQty(a.short) + ')</b>' : ''}</span>`).join(' ')}
          ${totalShort > 0 ? `<span style="color:#B91C1C;font-size:11.5px;font-weight:700;margin-left:6px">⚠ Thiếu ${fmtQty(totalShort)} ${l.unit}</span>` : ''}</div>
      </div></div>`;
    });

    /* ===== Đóng pane "Gán NCC" → mở pane "Đặt hàng NCC" (tab riêng, khỏi lướt dài) ===== */
    body += `</div><div class="pc-dpane" data-dpane="order" style="display:${_pcDetailTab === 'order' ? 'block' : 'none'}">`;
    /* ===== GỌI HÀNG — tách 🛵 LẺ (chia mô theo khách) và 📦 SỈ (giao cả lô) ===== */
    const _supBlock = (b) => {
      const typ = supplyTypeOf(b.id);
      const isLe = typ === 'le' || typ === 'both';
      const bags = isLe ? supReqByCust(run, b.id) : [];
      const siLines = isLe ? [] : supReqSiLines(run, b.id);
      const called = !!(run.supCalled && run.supCalled[b.id]);
      return `<div class="sup-block" style="margin-bottom:12px;${called ? 'opacity:.6' : ''}">
        <div class="hd">${isLe ? '🛵' : '📦'} ${esc(b.name)} <span style="opacity:.85;font-weight:400;font-size:11px">${b.items.length} mã · ${fmtQty(b.kg)}kg${b.cost ? ' · ' + money(b.cost) + '₫' : ''}</span>
          <select onchange="window.pcSetSupType('${b.id}',this.value)" title="Loại gọi hàng NCC này" style="margin-left:6px;font-size:11px;border-radius:5px;border:none;padding:2px 4px;background:rgba(255,255,255,.92);color:#111;cursor:pointer">
            <option value="le"${typ === 'le' ? ' selected' : ''}>🛵 Lẻ</option>
            <option value="si"${typ === 'si' ? ' selected' : ''}>📦 Sỉ</option>
            <option value="both"${typ === 'both' ? ' selected' : ''}>Sỉ+Lẻ</option>
          </select>
          <div style="flex:1"></div>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:#fff;cursor:pointer;margin-right:8px;background:${called ? 'rgba(34,197,94,.45)' : 'rgba(255,255,255,.15)'};padding:3px 9px;border-radius:6px" title="Đánh dấu đã gọi hàng NCC này">
            <input type="checkbox" ${called ? 'checked' : ''} onchange="window.pcSetSupCalled('${run.id}','${b.id}',this.checked)" style="cursor:pointer;accent-color:#16A34A"> ${called ? '✓ Đã gọi' : 'Đã gọi hàng'}</label>
          <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="window.pcCopySupReq('${run.id}','${b.id}')" title="${isLe ? 'Chép gộp cả nhà 1 tin' : 'Chép cú pháp sỉ theo thùng'}">📋 ${isLe ? 'Cả nhà' : 'Copy'}</button>
        </div>
        <div style="padding:8px 12px">
        ${isLe ? `${supReqData(run, b.id).lines.map(it => `<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #EEF2F0">
          <b>${esc(it.name)}</b>: tổng ${fmtQty(it.qty)} ${it.unit}${it.unitCost ? ` <span style="color:var(--muted)">× ${money(it.unitCost)}₫</span>` : ''}
        </div>`).join('')}
        ${bags.length ? `<div style="margin-top:9px;padding-top:8px;border-top:1px solid #E5E7EB">
          <div style="font-size:11px;font-weight:700;color:#15803D;margin-bottom:5px">📨 Copy theo TỪNG TÚI — mỗi khách 1 tin gửi NCC</div>
          ${bags.map((bag, i) => `<div style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-bottom:1px dashed #EEF2F0">
            <button class="btn btn-ghost btn-sm" style="flex:0 0 auto;padding:3px 9px;font-size:12px;background:#DCFCE7;color:#15803D;border:1px solid #86EFAC" onclick="window.pcCopySupCust('${run.id}','${b.id}',${i})" title="Chép riêng túi này">📋</button>
            <div style="font-size:12px;line-height:1.5"><b>${esc(bag.cust)}</b><br><span style="color:#374151">${bag.items.map(it => esc(it.name) + ' ' + fmtQty(it.qty) + it.unit).join(' · ')}</span></div>
          </div>`).join('')}
        </div>` : ''}`
        : `<div style="font-size:10.5px;color:var(--muted);margin-bottom:6px">📦 Gọi theo thùng/bọc — chỉnh <b>số thùng</b> &amp; <b>sản lượng (kg)</b> rồi bấm 📋 Copy gửi NCC.</div>
        ${siLines.map(row => `<div style="display:flex;gap:6px;align-items:center;padding:5px 0;border-bottom:1px dashed #EEF2F0;flex-wrap:wrap">
          <b style="flex:1;min-width:104px;font-size:12px">${esc(row.name)}</b>
          <input type="number" data-money="0" min="0" step="1" value="${row.cases}" onchange="window.pcSetSupPack('${run.id}','${b.id}','${row.key}','cases',this.value)" style="width:50px;text-align:right;font-size:12px;border:1px solid var(--line);border-radius:5px;padding:3px 6px" title="Số thùng/bọc">
          <select onchange="window.pcSetSupPack('${run.id}','${b.id}','${row.key}','unit',this.value)" style="font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 4px">
            ${['thùng', 'bọc', 'bao', 'khay', 'túi'].map(u => `<option value="${u}"${row.caseUnit === u ? ' selected' : ''}>${u}</option>`).join('')}
          </select>
          <input type="number" data-money="0" min="0" step="0.1" value="${row.kg}" onchange="window.pcSetSupPack('${run.id}','${b.id}','${row.key}','kg',this.value)" style="width:64px;text-align:right;font-size:12px;border:1px solid var(--line);border-radius:5px;padding:3px 6px" title="Sản lượng (kg)">
          <span style="font-size:11px;color:var(--muted)">${esc(row.unit || 'kg')}</span>
        </div>`).join('')}`}
        </div>
      </div>`;
    };
    if (nSup > 0) {
      const supArr = Object.values(bySup);
      const leArr = supArr.filter(b => supplyTypeOf(b.id) !== 'si');   /* lẻ + chưa rõ */
      const siArr = supArr.filter(b => supplyTypeOf(b.id) === 'si');
      if (leArr.length) body += `<div style="font-weight:800;color:#15803D;font-size:12.5px;margin:0 0 8px">🛵 GỌI HÀNG LẺ <span style="font-weight:400;color:var(--muted);font-size:11px">— NCC chia mô sẵn theo khách · bấm 📋 chép cú pháp gửi Zalo</span></div>` + leArr.map(_supBlock).join('');
      if (siArr.length) body += `<div style="font-weight:800;color:#1E40AF;font-size:12.5px;margin:14px 0 8px">📦 GỌI HÀNG SỈ <span style="font-weight:400;color:var(--muted);font-size:11px">— gọi theo thùng/bọc, chỉnh số thùng &amp; sản lượng · bấm 📋 chép gửi NCC</span></div>` + siArr.map(_supBlock).join('');
    }

    /* ===== THU MUA NGOÀI (mã chưa có NCC) ===== */
    const extData = extReqData(run);
    if (extData.lines.length) {
      const extKg = extData.lines.reduce((s, l) => s + l.qty, 0);
      body += `<div style="font-weight:800;color:#B45309;font-size:12.5px;margin:14px 0 8px">🛒 THU MUA NGOÀI <span style="font-weight:400;color:var(--muted)">(mã chưa NCC nào cung cấp — thu mua đi chợ/ngoài)</span></div>
        <div class="sup-block" style="margin-bottom:12px;border:1px solid #FDE68A">
          <div class="hd" style="background:linear-gradient(135deg,#B45309,#D97706)">🛒 Danh sách thu mua ngoài <span style="opacity:.85;font-weight:400;font-size:11px">${extData.lines.length} mã · ${fmtQty(extKg)}kg</span>
            <div style="flex:1"></div>
            <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="window.pcCopyExtImage('${run.id}')">📸 Copy ảnh phiếu</button>
          </div>
          <div style="padding:8px 12px">
          ${extData.lines.map(it => `<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #EEF2F0">
            <b>${esc(it.name)}</b>: ${fmtQty(it.qty)} ${it.unit}
            ${it.custs.length ? `<div style="font-size:10.5px;color:var(--muted);margin-top:1px">Cho: ${it.custs.map(b => esc(b.custName || b.code) + ' ' + fmtQty(b.qty) + it.unit).join(' · ')}</div>` : ''}
          </div>`).join('')}
          </div>
          <div style="padding:0 12px 10px;font-size:11px;color:#92400E">💡 Bấm <b>✅ Chốt phiên</b> → các mã này <b>TỰ tạo phiếu</b> ở <b>Tài chính → Phiếu nhập</b> (theo từng phiên/ngày). Kho vào đó <b>bấm phiếu → điền giá thật từng mã → ✓ Đã nhận</b> → vào sổ quỹ + giá vốn.</div>
        </div>`;
    }

    /* Pane Đặt hàng rỗng (chưa gán NCC + không có mã mua ngoài) → nhắc sang tab Gán NCC */
    if (!nSup && !extData.lines.length) body += `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12.5px">Chưa gán NCC cho mã nào.<br>Sang tab <b>🧮 Chọn NCC cho các mã hàng</b> để chọn NCC → phần đặt hàng sẽ hiện ở đây.</div>`;
    body += `</div>`;   /* đóng pane "Đặt hàng NCC" */

    if (_isDoneRun(run)) {
      /* Phiên đã chốt (xem lại từ Lịch sử) — không cho chốt lại, chỉ xem + in phiếu NCC */
      body += `<div style="position:sticky;bottom:0;background:#fff;padding-top:10px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px">
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:10px 12px;font-size:12px;color:#15803D">
          ✓ <b>Phiên đã chốt &amp; phân bổ</b>${run.confirmedAt ? ' lúc ' + new Date(run.confirmedAt).toLocaleString('vi-VN') : ''}. Đã tự tạo <b>phiếu nhập cho từng NCC + thu mua ngoài</b> ở <b>Tài chính → Phiếu nhập</b> (điền giá thật → ✓ Đã nhận). Xuất kho → giao shipper ở <b>bước ③</b>.
        </div>
        ${run.status === 'applied' ? `<button class="btn btn-ghost" style="color:#B45309;border:1px solid #FDE68A" onclick="window.pcReopenRun('${run.id}')">↩ Lỡ chốt? Trả phiên về bước gán NCC để sửa</button>` : ''}
      </div>
    </div>`;
    } else {
      body += `<div style="position:sticky;bottom:0;background:#fff;padding-top:10px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-navy" onclick="window.pcSaveConfirm('${run.id}')">💾 Lưu</button>
        <button class="btn btn-primary" onclick="window.pcApplyAlloc('${run.id}')">✅ Chốt &amp; phân bổ về đơn + báo Sale</button>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">💡 Bấm <b>chip NCC</b> để gán (1 chạm) — app <b>ghi nhớ</b> để lần sau tự gán. Nhà đó hết hàng → <b>➕ Chia cho NCC thứ 2</b> rồi nhập số kg. "Giao thực" để trống = giao đủ.</div>
    </div>`;
    }

    const dc = document.getElementById('pcRunDetail');
    if (dc) dc.innerHTML = body;
    window._pcActiveRun = runId;
    document.querySelectorAll('.run-card[data-runid]').forEach(c => c.classList.toggle('pc-sel', c.dataset.runid === runId));
    if (_pcAddSupKey && _pcAddSupFocus) { const _ai = document.getElementById('pcAddSup_' + _pcAddSupKey); if (_ai) { _ai.focus(); _ai.select && _ai.select(); } _pcAddSupFocus = false; }
  };

  window.pcCloseDetail = function () {
    window._pcActiveRun = null;
    _pcAddSupKey = null;
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

  /* (Đã gỡ cụm "gán NCC hàng loạt theo dòng tick": pcAutoStar / pcUpdateSelCount / pcToggleAllLines /
     _selectedLineKeys / pcBulkAssign / pcAutoStarSelected — UI checkbox .pc-linechk/pcBulkSup không còn
     render ở template nào (đã thay bằng phân bổ alloc: pcAddAlloc/pcSetAllocSup/pcApplyAlloc). Không caller.) */

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
    if (s) rememberSup(l.productId, s.id);   /* ghi nhớ → suppliersForProduct thấy mã đã có NCC (hết badge "thu mua ngoài" + không tạo phiếu trùng) */
    saveRuns(runs); renderRuns(); window.pcOpenRun(runId);
  };
  /* Chip 1-chạm: gán NCC (theo id) cho ô phân bổ ĐẦU của mã. Giá lấy theo khai của NCC. */
  window.pcPickAllocSup = function (runId, key, supId) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l) return;
    const s = getSuppliers().find(x => x.id === supId); if (!s) return;
    const p = (s.products || []).find(pp => (l.productId && pp.id === l.productId) || norm(pp.name) === norm(l.name));
    const price = p ? (+p.price || 0) : 0;
    if (!Array.isArray(l.allocations) || !l.allocations.length) {
      l.allocations = [{ supplierId: s.id, supplierName: s.name, qty: l.totalQty, unitCost: price, confirmedQty: null }];
    } else {
      const a = l.allocations[0];
      a.supplierId = s.id; a.supplierName = s.name; a.unitCost = price;
      if (!(+a.qty > 0)) a.qty = l.totalQty;   /* ô đầu chưa có SL → nhận full */
    }
    rememberSup(l.productId, s.id);   /* ghi nhớ → lần gom sau tự gán mã này cho NCC vừa chọn */
    saveRuns(runs); window.pcOpenRun(runId);
  };
  /* "＋ NCC khác": xoá NCC ở ô đầu → hiện ô GÕ TÊN (gán NCC ngoài danh sách bán mã này). */
  window.pcRevealFreeSup = function (runId, key) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l) return;
    if (!Array.isArray(l.allocations) || !l.allocations.length) {
      l.allocations = [{ supplierId: '', supplierName: '', qty: l.totalQty, unitCost: 0, confirmedQty: null }];
    } else { const a = l.allocations[0]; a.supplierId = ''; a.supplierName = ''; }
    saveRuns(runs); window.pcOpenRun(runId);
  };
  /* ===== Ô "Thêm NCC" gọn (1 việc: gõ tên → Lưu) — tách khỏi pane chi tiết cho dễ nhìn ===== */
  window.pcStartAddSup = function (runId, key) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run); saveRuns(runs);   /* giữ ghi chú/lý do đang gõ trước khi re-render */
    _pcAddSupKey = key; _pcAddSupFocus = true;
    window.pcOpenRun(runId);
  };
  window.pcCancelAddSup = function (runId) {
    _pcAddSupKey = null;
    window.pcOpenRun(runId);
  };
  window.pcConfirmAddSup = function (runId, key) {
    const inp = document.getElementById('pcAddSup_' + key);
    const name = inp ? String(inp.value || '').trim() : '';
    if (!name) { inp && inp.focus(); window.toast && window.toast('Nhập tên nhà cung cấp', 'warn'); return; }
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l) return;
    const s = resolveOrCreateSupplier(name);
    if (!s) { window.toast && window.toast('Không tạo được NCC', 'error'); return; }
    const p = (s.products || []).find(pp => (l.productId && pp.id === l.productId) || norm(pp.name) === norm(l.name));
    const price = p ? (+p.price || 0) : 0;
    if (!Array.isArray(l.allocations) || !l.allocations.length) {
      l.allocations = [{ supplierId: s.id, supplierName: s.name, qty: l.totalQty, unitCost: price, confirmedQty: null }];
    } else {
      const a = l.allocations[0];
      a.supplierId = s.id; a.supplierName = s.name; a.unitCost = price;
      if (!(+a.qty > 0)) a.qty = l.totalQty;
    }
    rememberSup(l.productId, s.id);   /* ghi nhớ → lần gom sau tự gán mã này cho NCC vừa nhập */
    _pcAddSupKey = null;
    saveRuns(runs); window.pcOpenRun(runId);
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
    saveRun(run); window.pcOpenRun(runId);
  };
  window.pcSetAllocConf = function (runId, key, ai, val) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l || !l.allocations[ai]) return;
    l.allocations[ai].confirmedQty = val === '' ? null : +val;
    saveRun(run); window.pcOpenRun(runId);
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

  /* (Đã gỡ pcSetLineSupByName / pcSetLineSup / pcBulkAssignSup — gán NCC theo dòng/hàng loạt kiểu cũ,
     không caller; nay dùng phân bổ alloc.) */

  window.pcSaveConfirm = function (runId) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    /* CHỈ lưu tiến độ — KHÔNG đổi status (giữ phiên ở danh sách đang gom).
       Chỉ "Chốt & phân bổ" mới đẩy sang Lịch sử. */
    if (_isDoneRun(run)) run.status = 'draft';   /* lỡ ở trạng thái done mà bấm Lưu lại → kéo về active */
    saveRuns(runs);
    window.toast?.('💾 Đã lưu tiến độ gán NCC cho ' + runId, 'success');
    window.pcOpenRun(runId);
  };

  /* Chốt: ghi SL phân bổ về từng đơn + note thiếu + báo Sale */
  const _applyBusy = new Set();   /* chống double-click chốt: pcApplyAlloc async (có await getOrderItems) */
  window.pcApplyAlloc = async function (runId) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    /* GATE: đơn chưa tải xong từ cloud → KHÔNG ghi (tránh áp phân bổ lên cache rỗng rồi đè cloud). */
    if (!window.STORE.isPreloaded('orders')) {
      window.toast && window.toast('Đang tải dữ liệu đơn, thử lại sau vài giây', 'warn');
      return;
    }
    /* Chống double-click: phiên đang chốt → bỏ lần bấm thứ 2 (nếu không: ghi note thiếu 2 lần
       + gửi Telegram báo thiếu 2 lần, do status chỉ đổi 'applied' SAU await). */
    if (_applyBusy.has(runId)) return;
    _applyBusy.add(runId);
    try {
    readConfirmInputs(run);
    const orders = getOrders();
    /* Danh sách đơn KHÔNG kéo cột `items` (tối ưu tải) → PHẢI nạp items thật cho các đơn của
       phiên TRƯỚC khi ghi. Nếu không: it (line dưới) undefined → không ghi SL phân bổ, và
       freight = Σ items = 0 → XOÁ TIỀN đơn. Nạp lỗi 1 đơn nào đó → HỦY (không ghi sai). */
    const _fail = [];
    await Promise.all((run.orderCodes || []).map(async code => {
      const o = orders.find(x => x.code === code);
      if (!o) return;
      if (Array.isArray(o.items) && o.items.length) return;            /* đã có items (đơn vừa tạo) */
      const its = window.SB_DATA && window.SB_DATA.getOrderItems ? await window.SB_DATA.getOrderItems(code) : null;
      if (Array.isArray(its) && its.length) o.items = its;
      else _fail.push(code);
    }));
    if (_fail.length) {
      window.toast?.('⚠ Chưa tải được mặt hàng của đơn: ' + _fail.join(', ') + ' — thử lại (tránh ghi sai tiền/hàng).', 'warn');
      return;
    }
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
    run.status = 'applied';                       /* CHỐT & phân bổ xong → vào Lịch sử đã gom */
    run.confirmedAt = new Date().toISOString();
    saveRun(run);
    _pcAutoPurchases(run);                         /* mã NCC + thu mua ngoài → tự tạo phiếu ở Tài chính → Phiếu nhập */

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
    window.toast?.(`✅ Đã chốt ${run.id}: ghi SL về ${run.orderCodes.length} đơn` + (shortCodes.length ? ` · ${shortCodes.length} đơn thiếu` : ' · đủ hàng') + ' · đã chuyển sang Lịch sử đã gom', 'success');
    /* Phiên rời danh sách đang gom → vào Lịch sử; mở bước ③ để xuất kho */
    window._pcActiveRun = null;
    renderRuns(); renderRunHistory(); renderRelease();
    window.pcCloseDetail && window.pcCloseDetail();
    } finally { _applyBusy.delete(runId); }
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
  /* Nhãn AN TOÀN gửi NCC: NGƯỜI ĐẶT (customer.contact) → mã KH → mã đơn. TUYỆT ĐỐI không dùng
     tên nhà hàng (custName) để NCC không biết hàng về nhà hàng nào (tránh NCC bán thẳng cho khách). */
  const getCustomers = () => S().get('customers', window.CUSTOMERS || []) || [];
  function _supCustLabel(x) {
    const o = getOrders().find(r => r.code === x.code);
    const cid = o && (o.cust || o.customer_id);
    const c = cid ? getCustomers().find(k => k.id === cid) : null;
    const contact = c && c.contact != null ? String(c.contact).trim() : '';
    return contact || cid || x.code || '?';
  }
  /* Gộp phần chia theo NGƯỜI ĐẶT (ẩn tên nhà hàng); 1 khách có thể nằm ở >1 slot NCC → 1 dòng túi/khách */
  function _mergeCusts(custs) {
    const m = new Map();
    (custs || []).forEach(x => { const k = _supCustLabel(x); m.set(k, (m.get(k) || 0) + (+x.qty || 0)); });
    return [...m.entries()].map(([name, qty]) => ({ name, qty: +qty.toFixed(2) }));
  }
  /* Chia đơn 1 NCC theo TỪNG TÚI (khách/người đặt) → [{cust, items:[{name,qty,unit}]}].
     Dùng cho cả hiển thị per-túi lẫn copy cú pháp từng túi (thứ tự khách deterministic → idx khớp). */
  function supReqByCust(run, supId) {
    const { lines } = supReqData(run, supId);
    const byCust = new Map();
    lines.forEach(l => _mergeCusts(l.custs).forEach(bd => {
      if (!byCust.has(bd.name)) byCust.set(bd.name, []);
      byCust.get(bd.name).push({ name: l.name, qty: bd.qty, unit: l.unit });
    }));
    return [...byCust.entries()].map(([cust, items]) => ({ cust, items }));
  }
  /* Cú pháp 1 túi: tên khách + từng dòng SP (KHÔNG chữ ký) — gửi thẳng NCC. */
  function _bagSyntax(bag) {
    return `${bag.cust}\n${bag.items.map(it => `${it.name} ${fmtQty(it.qty)}${it.unit}`).join('\n')}`;
  }
  /* SỈ: gọi theo THÙNG/BỌC. Mỗi mã: số thùng (mặc định 1) + sản lượng kg (mặc định = tổng gom),
     chỉnh tay lưu run.supPack[supId][lineKey] = {cases, unit, kg}. */
  function supReqSiLines(run, supId) {
    const { lines } = supReqData(run, supId);
    const pack = (run.supPack && run.supPack[supId]) || {};
    return lines.map(l => {
      const pk = pack[l.key] || {};
      return {
        key: l.key, name: l.name, unit: l.unit,
        cases: pk.cases != null ? pk.cases : 1,
        caseUnit: pk.unit || 'thùng',
        kg: pk.kg != null ? pk.kg : l.qty,
      };
    });
  }
  const _siSyntax = row => `${row.name} - ${fmtQty(row.cases)} ${row.caseUnit} - ${fmtQty(row.kg)}${row.unit || 'kg'}`;
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
      if (qty > 0.0001) items.push({ key: l.key, name: l.name, unit: l.unit, qty: +qty.toFixed(2), unitCost: qty ? cost / qty : 0, custs });
    });
    return { lines: items, supName, type };
  }
  /* Mã "thu mua ngoài" = KHÔNG NCC nào bán (catalog) VÀ chưa được gán NCC thật nào (allocation).
     (Nếu gán tay NCC qua "＋ NCC khác" thì thôi tính mua ngoài — tránh tạo TRÙNG phiếu.) */
  const _isExtLine = (l) => suppliersForProduct(l.productId, l.name).length === 0
    && !(l.allocations || []).some(a => a.supplierId && a.supplierId !== 'EXT-MARKET' && +a.qty > 0);
  /* ===== THU MUA NGOÀI: các mã KHÔNG NCC nào cung cấp → bộ phận thu mua đi chợ/ngoài ===== */
  function extReqData(run) {
    const lines = (run.lines || [])
      .filter(_isExtLine)
      .map(l => ({
        name: l.name, unit: l.unit, qty: +(+l.totalQty || 0).toFixed(2),
        custs: (l.breakdown || []).map(b => ({ code: b.code, custName: b.custName, qty: +(+b.qty || 0).toFixed(2) })),
      }));
    return { lines };
  }
  /* ===== TỰ tạo/cập nhật PHIẾU NHẬP khi CHỐT phiên gom =====
     - 1 phiếu / NCC (id PN-<runId>-<supId>), giá điền sẵn theo giá NCC khai (sửa được) → nhận thì sinh CÔNG NỢ NCC.
     - 1 phiếu THU MUA NGOÀI (id TMN-<runId>) cho mã chưa NCC nào cung cấp, giá để trống → nhận thì chi tiền mặt.
     Idempotent: chốt lại → cập nhật (GIỮ giá kho đã điền); phiếu đã "nhận" → không đụng;
     NCC/mã rời khỏi phiên → gỡ phiếu nháp (chưa nhận) không còn cần. */
  function _pcAutoPurchases(run, _retry) {
    if (!run || !S()) return;
    if (S().isPreloaded && !S().isPreloaded('purchases') && !_retry) {
      S().get('purchases'); setTimeout(() => _pcAutoPurchases(run, true), 1500); return;
    }
    const list = S().get('purchases', []) || [];
    const today = (window.todayVN ? window.todayVN() : new Date().toLocaleDateString('vi-VN'));
    const desired = {};   /* pid → { supplierId, items:[{productId,name,unit,qty,price,total}] } */
    /* 1 phiếu / NCC (giá khai sẵn) */
    const bySup = summarizeBySupplier(run);
    Object.values(bySup).forEach(b => {
      const isSi = supplyTypeOf(b.id) === 'si';
      const pack = (run.supPack && run.supPack[b.id]) || {};
      const items = b.items.filter(it => +it.qty > 0).map(it => {
        const price = +it.unitCost || 0;
        const pk = pack[it.key] || {};
        /* SỈ: NHẬP nguyên THÙNG theo sản lượng đã chỉnh (supPack.kg) → công nợ NCC + kho tính đủ thùng.
           Mặc định = nhu cầu gom (it.qty). demandQty = phần khách thật cần (để tính hàng dư vào kho). */
        const qty = +(+(isSi && pk.kg != null ? pk.kg : it.qty)).toFixed(2);
        const o = { productId: it.productId || null, name: it.name, unit: it.unit, qty, price, total: Math.round(qty * price) };
        if (isSi) { o.cases = pk.cases != null ? pk.cases : 1; o.caseUnit = pk.unit || 'thùng'; o.demandQty = +(+it.qty).toFixed(2); }
        return o;
      });
      if (items.length) desired['PN-' + run.id + '-' + b.id] = { supplierId: b.id, items };
    });
    /* 1 phiếu THU MUA NGOÀI (mã chưa gán NCC nào — dùng _isExtLine để KHÔNG trùng phiếu NCC) */
    const extLines = (run.lines || []).filter(_isExtLine);
    if (extLines.length) desired['TMN-' + run.id] = { supplierId: 'EXT-MARKET', items: extLines.map(l => {
      const qty = +(+l.totalQty || 0).toFixed(2);
      return { productId: l.productId || null, name: l.name, unit: l.unit, qty, price: 0, total: 0 };
    }) };

    let changed = false;
    Object.keys(desired).forEach(pid => {
      const d = desired[pid];
      const idx = list.findIndex(p => p.id === pid);
      if (idx >= 0 && list[idx].status !== 'ordered') return;   /* đã nhận → giữ nguyên */
      const prevItems = (idx >= 0 ? list[idx].items : []) || [];
      const items = d.items.map(it => {
        const prev = prevItems.find(x => (it.productId && x.productId === it.productId) || norm(x.name) === norm(it.name));
        const price = (prev && +prev.price > 0) ? +prev.price : (+it.price || 0);   /* GIỮ giá kho đã điền */
        return { ...it, price, total: Math.round((+it.qty || 0) * price) };
      });
      const obj = {
        id: pid, supplierId: d.supplierId, date: today, status: 'ordered',
        total: items.reduce((s, i) => s + (+i.total || 0), 0), paid: 0,
        items, noStock: true, gomRunId: run.id,
        note: 'Tự tạo từ phiên gom ' + run.id + ' — kiểm/điền giá thật rồi bấm ✓ Đã nhận',
      };
      if (idx >= 0) list[idx] = { ...list[idx], ...obj }; else list.push(obj);
      changed = true;
    });
    if (changed) S().set('purchases', list);
    /* NCC/thu-mua-ngoài rời khỏi phiên → gỡ phiếu nháp (chưa nhận) không còn cần.
       Khớp theo MÃ phiếu (gom_run_id bị strip trên cloud) để reload vẫn gỡ đúng. */
    list.filter(p => _isGomPhieuOf(p, run.id) && p.status === 'ordered' && !desired[p.id]).forEach(p => S().remove('purchases', p.id));
  }
  /* Phiếu tự tạo của 1 phiên gom — nhận biết qua mã (PN-<runId>-<supId> / TMN-<runId>) */
  function _isGomPhieuOf(p, runId) {
    if (!p) return false;
    return p.gomRunId === runId || p.id === 'TMN-' + runId || String(p.id || '').startsWith('PN-' + runId + '-');
  }
  window.pcCopyExtReq = function (runId) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    const { lines } = extReqData(run);
    if (!lines.length) { window.toast && window.toast('Không có mã thu mua ngoài', 'info'); return; }
    const totalKg = lines.reduce((s, l) => s + l.qty, 0);
    const txt = `🛒 DANH SÁCH THU MUA NGOÀI — ${run.id}\n📅 ${new Date().toLocaleDateString('vi-VN')}\n────────────\n`
      + lines.map((l, i) => `${i + 1}. ${l.name}: ${fmtQty(l.qty)} ${l.unit}` + (l.custs.length ? `\n   Cho: ${l.custs.map(b => (b.custName || b.code) + ' ' + fmtQty(b.qty) + l.unit).join(' · ')}` : '')).join('\n')
      + `\n────────────\n📦 Tổng: ${fmtQty(totalKg)} kg\n⚠ Mua xong GHI RÕ GIÁ từng mã để cuối ngày nhập sổ (Phiếu nhập → Thu mua ngoài). Cảm ơn!`;
    copyText(txt, 'danh sách thu mua ngoài');
  };
  /* 📸 Chụp danh sách thu mua ngoài thành ẢNH → copy clipboard (dán thẳng Zalo). Lỗi → fallback copy chữ. */
  window.pcCopyExtImage = async function (runId) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    const { lines } = extReqData(run);
    if (!lines.length) { window.toast && window.toast('Không có mã thu mua ngoài', 'info'); return; }
    const totalKg = lines.reduce((s, l) => s + l.qty, 0);
    const _x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const W = 560, rowH = 30, H = 132 + lines.length * rowH + 70;
    const today = new Date().toLocaleDateString('vi-VN');
    const rowsHtml = lines.map((it, i) => `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid #EFE9DC;font-size:16px"><span style="color:#1B5E20"><b>${i + 1}.</b> ${_x(it.name)}</span><span style="font-weight:700;color:#B45309;white-space:nowrap;padding-left:12px">${_x(fmtQty(it.qty))} ${_x(it.unit || 'kg')}</span></div>`).join('');
    const html = `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;box-sizing:border-box;padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;background:#ffffff;color:#1f2937">`
      + `<div style="display:flex;align-items:center;gap:10px;border-bottom:2px solid #1B5E20;padding-bottom:10px;margin-bottom:12px"><div style="font-size:24px">🛒</div><div><div style="font-size:18px;font-weight:800;color:#1B5E20">NÔNG SẢN TUẤN TÚ</div><div style="font-size:13px;color:#6b7280">PHIẾU THU MUA NGOÀI · ${today}</div></div></div>`
      + rowsHtml
      + `<div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:2px solid #1B5E20;font-size:16px;font-weight:800;color:#1B5E20"><span>TỔNG</span><span>${lines.length} mã · ${_x(fmtQty(totalKg))} kg</span></div>`
      + `<div style="font-size:12px;color:#92400E;margin-top:8px">⚠ Mua xong ghi rõ GIÁ từng mã để nhập sổ.</div></div>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
    const renderBlob = async () => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('svg load')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const scale = 2, cv = document.createElement('canvas'); cv.width = W * scale; cv.height = H * scale;
      const ctx = cv.getContext('2d'); ctx.scale(scale, scale); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png')); if (!blob) throw new Error('no blob'); return blob;
    };
    try {
      if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('no clipboard-image support');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderBlob() })]);
      window.toast && window.toast('📸 Đã copy ảnh phiếu — dán vào Zalo (Ctrl/⌘+V)', 'success');
    } catch (e) {
      console.warn('[pcCopyExtImage] lỗi copy ảnh → fallback chữ:', e);
      window.pcCopyExtReq(runId);
      window.toast && window.toast('Máy không copy được ảnh → đã copy CHỮ thay thế', 'warn');
    }
  };
  /* 📥 "Phiếu về": mở Phiếu nhập → 🛒 Thu mua ngoài, điền sẵn các mã (kho nhập GIÁ THẬT → vào sổ quỹ + giá vốn) */
  window.pcExtToPurchase = function (runId) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    const { lines } = extReqData(run);
    if (!lines.length) { window.toast && window.toast('Không có mã thu mua ngoài', 'info'); return; }
    const items = lines.map(l => ({ name: l.name, qty: l.qty, price: '' }));
    /* Phiếu nhập là tab trong Tài chính (việc kế toán) → mở Tài chính, tab Phiếu nhập,
       modal thu mua ngoài điền sẵn. sessionStorage giữ qua điều hướng + iframe purchases
       cùng origin đọc được. */
    const top = window.top || window;
    try { top.sessionStorage.setItem('pn_prefill_items', JSON.stringify(items)); }
    catch (e) { try { sessionStorage.setItem('pn_prefill_items', JSON.stringify(items)); } catch (e2) {} }
    try { top.location.href = 'purchases.html?createForSup=EXT-MARKET'; }
    catch (e) { location.href = 'purchases.html?createForSup=EXT-MARKET'; }
  };
  window.pcPrintExtReq = function (runId) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    const { lines } = extReqData(run);
    if (!lines.length) { window.toast && window.toast('Không có mã thu mua ngoài', 'info'); return; }
    const c = company();
    const today = new Date().toLocaleDateString('vi-VN');
    const rows = lines.map((l, i) => `<tr>
        <td class="stt">${i + 1}</td>
        <td><b>${esc(l.name)}</b></td>
        <td class="num"><b>${fmtQty(l.qty)}</b> ${l.unit}</td>
        <td style="font-size:11px;color:#555">${(l.custs || []).map(b => esc(b.custName || b.code) + ': ' + fmtQty(b.qty)).join(' · ')}</td>
        <td class="num" style="width:120px"></td>
      </tr>`).join('');
    const totalKg = lines.reduce((s, l) => s + l.qty, 0);
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PHIẾU THU MUA NGOÀI</title>
<style>@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
body{color:#1a1a1a;font-size:13px}.wrap{max-width:780px;margin:0 auto}
.top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #B45309;padding-bottom:10px}
.top img{width:150px;height:auto;object-fit:contain}.brand h1{font-size:19px;color:#B45309;font-weight:800}.brand .sub{font-size:11px;color:#555;margin-top:4px}
.title{text-align:center;font-size:21px;font-weight:800;color:#B45309;letter-spacing:1px;margin:14px 0 2px}
.meta{display:flex;justify-content:space-between;font-size:12.5px;margin:8px 2px}.meta b{color:#B45309}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}th,td{border:1px solid #E5C99B;padding:7px 9px}
th{background:#B45309;color:#fff;font-size:12px;text-transform:uppercase}td.stt{text-align:center;width:40px;color:#777}td.num{text-align:center;font-weight:700;color:#B45309}
tbody tr:nth-child(even){background:#FFFBEB}tfoot td{background:#FEF3C7;font-weight:800;color:#B45309}
.note{font-size:11.5px;color:#555;margin-top:14px;line-height:1.6}</style></head><body><div class="wrap">
<div class="top"><img src="${c.logo}" onerror="this.style.display='none'"><div class="brand"><h1>${c.name}</h1><div class="sub">${esc(c.addr)} · ☎ ${esc(c.phone)}</div></div></div>
<div class="title">PHIẾU THU MUA NGOÀI</div>
<div class="meta"><div><b>Bộ phận:</b> Thu mua (chợ/vãng lai)</div><div><b>Ngày:</b> ${today} · Phiên ${run.id}</div></div>
<table><thead><tr><th style="width:40px">STT</th><th>Sản phẩm</th><th style="width:100px">Cần mua</th><th>Cho khách</th><th style="width:120px">Giá mua (₫/kg)</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="2" style="text-align:right">TỔNG</td><td class="num">${fmtQty(totalKg)} kg</td><td></td><td></td></tr></tfoot></table>
<div class="note">⚖️ Đơn vị tính: KILOGRAM (KG). Đây là các mặt hàng <b>chưa có NCC cố định</b> → mua ngoài.<br><b>Lưu ý:</b> điền GIÁ MUA thực tế từng mã ở cột cuối → cuối ngày nhập vào app (Phiếu nhập → 🛒 Thu mua ngoài) để vào sổ quỹ + tính giá vốn.</div>
</div></body></html>`;
    printViaIframe(html);
  };

  function company() {
    const ci = S().get('companyInfo', {}) || {};
    const origin = (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : 'https://app.nongsantuantuhanoi.vn';
    return { name: 'NÔNG SẢN TUẤN TÚ HÀ NỘI', addr: ci.address || '36/147A Tân Mai, Hoàng Mai, Hà Nội', phone: ci.hotline || '0836 676 086', logo: ci.logo || (origin + '/assets/logo-name.png?v=486') };
  }

  window.pcPrintSupReq = function (runId, supKey) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const { lines, supName, type } = supReqData(run, supKey);
    const c = company();
    const today = new Date().toLocaleDateString('vi-VN');
    const isLe = type === 'le' || type === 'both';
    const colHd = isLe ? 'Túi theo khách (NCC đóng sẵn)' : 'Chi tiết theo đơn';
    const rows = lines.map((l, i) => `<tr>
        <td class="stt">${i + 1}</td>
        <td><b>${esc(l.name)}</b></td>
        <td class="num"><b>${fmtQty(l.qty)}</b> ${l.unit}</td>
        <td style="font-size:11px;color:#555">${isLe
          ? _mergeCusts(l.custs).map(b => esc(b.name) + ' - ' + fmtQty(b.qty) + l.unit).join(' · ')
          : (l.custs || []).map(b => esc(b.code) + ': ' + fmtQty(b.qty)).join(' · ')}</td>
      </tr>`).join('');
    const totalKg = lines.reduce((s, l) => s + l.qty, 0);
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PHIẾU YÊU CẦU HÀNG</title>
<style>@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
body{color:#1a1a1a;font-size:13px}.wrap{max-width:780px;margin:0 auto}
.top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1B5E20;padding-bottom:10px}
.top img{width:150px;height:auto;object-fit:contain}.brand h1{font-size:19px;color:#1B5E20;font-weight:800}.brand .sub{font-size:11px;color:#555;margin-top:4px}
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
    const { lines, type } = supReqData(run, supKey);
    const isLe = type === 'le' || type === 'both';
    /* Cú pháp GỌN: LẺ gom THEO KHÁCH (mỗi khách 1 túi); SỈ theo THÙNG/BỌC (SP - N thùng - kg).
       KHÔNG chữ ký cuối. */
    const txt = isLe
      ? supReqByCust(run, supKey).map(_bagSyntax).join('\n\n')
      : supReqSiLines(run, supKey).map(_siSyntax).join('\n');
    if (!txt) { window.toast && window.toast('Chưa có mã cho NCC này', 'info'); return; }
    copyText(txt, isLe ? 'cú pháp gọi hàng (cả nhà)' : 'cú pháp gọi sỉ');
  };
  /* Đổi loại gọi hàng NCC (sỉ/lẻ/cả hai) — lưu kv supplierMeta (như trang Nhà cung cấp), re-render phiên. */
  window.pcSetSupType = function (supId, type) {
    if (['si', 'le', 'both'].indexOf(type) < 0) return;
    window.STORE.rmwKv('supplierMeta', m => { m = m || {}; m[supId] = { ...(m[supId] || {}), type }; return m; }, {});
    if (window._pcActiveRun) window.pcOpenRun(window._pcActiveRun);
    window.toast && window.toast('✓ Đổi loại NCC → ' + (type === 'si' ? 'Sỉ' : type === 'le' ? 'Lẻ' : 'Sỉ+Lẻ'), 'success');
  };
  /* Tích "đã gọi hàng" cho 1 NCC trong phiên — lưu run.supCalled, block mờ + ✓ Đã gọi. */
  window.pcSetSupCalled = function (runId, supId, on) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    run.supCalled = run.supCalled || {};
    if (on) run.supCalled[supId] = true; else delete run.supCalled[supId];
    saveRun(run);
    window.pcOpenRun(runId);
  };
  /* Chỉnh số thùng/bọc + sản lượng kg cho 1 mã của NCC sỉ — lưu run.supPack (KHÔNG re-render → khỏi mất focus). */
  window.pcSetSupPack = function (runId, supId, lineKey, field, value) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    run.supPack = run.supPack || {};
    run.supPack[supId] = run.supPack[supId] || {};
    const pk = run.supPack[supId][lineKey] || (run.supPack[supId][lineKey] = {});
    if (field === 'unit') pk.unit = value;
    else pk[field] = (value === '' || value == null) ? null : +value;
    saveRun(run);
  };
  /* Chép cú pháp CHỈ 1 TÚI (1 khách) của NCC — mỗi khách 1 tin gửi riêng, không chữ ký. */
  window.pcCopySupCust = function (runId, supKey, idx) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const bag = supReqByCust(run, supKey)[idx];
    if (!bag) { window.toast && window.toast('Không tìm thấy túi', 'info'); return; }
    copyText(_bagSyntax(bag), 'túi ' + bag.cust);
  };

  /* ============ ③ XUẤT KHO → SHIP ============ */
  const _relSel = new Set();   /* mã đơn đang chọn ở ③ Xuất kho để giao/ xoá hàng loạt */
  function _syncRelBar() {
    const bar = document.getElementById('pcRelBulk');
    if (bar) { bar.style.display = _relSel.size ? 'flex' : 'none'; const c = bar.querySelector('[data-relcount]'); if (c) c.textContent = _relSel.size; }
    const all = document.getElementById('pcRelSelAll');
    const total = document.querySelectorAll('.pc-rel-sel').length;
    if (all) all.checked = total > 0 && _relSel.size === total;
  }
  window.pcRelToggleSel = function (code, on) { if (on) _relSel.add(code); else _relSel.delete(code); _syncRelBar(); };
  window.pcRelToggleAll = function (on) {
    document.querySelectorAll('.pc-rel-sel').forEach(cb => { cb.checked = on; const c = cb.dataset.code; if (on) _relSel.add(c); else _relSel.delete(c); });
    _syncRelBar();
  };

  function renderRelease() {
    const host = document.getElementById('pcRelease');
    /* đơn đã chốt hàng (confirmed) chờ xuất kho */
    const orders = getOrders().filter(o => o.whStatus === 'confirmed' && o.status !== 'cancelled');
    /* dọn selection: chỉ giữ mã còn trong danh sách */
    const codeSet = new Set(orders.map(o => o.code));
    Array.from(_relSel).forEach(c => { if (!codeSet.has(c)) _relSel.delete(c); });
    if (!orders.length) { host.innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:40px;text-align:center;color:var(--muted)">Chưa có đơn nào đã chốt hàng. Hoàn tất xác nhận NCC ở tab ② trước.</div>`; return; }
    const sel = _relSel.size;
    host.innerHTML = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;position:sticky;top:0;background:var(--bg,#F5F6F8);z-index:5;padding:4px 0">
        <div style="font-size:12.5px;color:var(--muted)">Đơn đã chốt sản lượng — chọn để <b>giao shipper hàng loạt</b>, hoặc làm từng đơn.</div>
        <label style="font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="pcRelSelAll" onclick="window.pcRelToggleAll(this.checked)" ${sel && sel === orders.length ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;accent-color:#E8A33D">Chọn tất cả</label>
        <div style="flex:1"></div>
        <div id="pcRelBulk" style="display:${sel ? 'flex' : 'none'};gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:12.5px;color:var(--muted)">Đã chọn <b data-relcount>${sel}</b> đơn</span>
          <button class="btn btn-primary btn-sm" onclick="window.pcDispatchBulk()">🛵 Giao shipper hàng loạt</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.pcDelBulk()">🗑 Xoá</button>
        </div>
      </div>` +
      orders.map(o => {
        /* Danh sách đơn không kéo items → kg từ `weight`, mã từ `goods` (đơn đã chốt) */
        const hasItems = Array.isArray(o.items) && o.items.length;
        const kg = hasItems ? o.items.reduce((s, it) => s + (+it.qty || 0), 0) : (+o.weight || 0);
        const nMa = hasItems ? o.items.length : (o.goods || '').split(',').filter(s => s.trim()).length;
        const hasShort = o.shortages && o.shortages.length;
        return `<div class="run-card" style="cursor:default">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <input type="checkbox" class="pc-rel-sel" data-code="${esc(o.code)}" onclick="window.pcRelToggleSel('${esc(o.code)}',this.checked)" ${_relSel.has(o.code) ? 'checked' : ''} title="Chọn để giao/xoá hàng loạt" style="width:17px;height:17px;cursor:pointer;accent-color:#E8A33D">
            <div style="font-weight:800;color:var(--navy)">${o.code}</div>
            <span style="font-size:12.5px;color:var(--muted)">${esc(o.custName || '')}</span>
            ${o.shipShift ? `<span class="tag" style="background:#FEF3C7;color:#92400E">Ca ${esc(o.shipShift)}${o.shipTime ? ' · ' + esc(o.shipTime) : ''}</span>` : ''}
            ${hasShort ? `<span class="tag" style="background:#FEE2E2;color:#B91C1C">⚠ thiếu ${o.shortages.length} mã</span>` : ''}
            <div style="flex:1"></div>
            <span style="font-size:12px;color:var(--muted)">${nMa} mã · ${fmtQty(kg)} kg</span>
            <button class="btn btn-ghost btn-sm" onclick="window.pcReturnToGom('${o.code}')" title="Trả đơn về giai đoạn ② (gán lại NCC)">↩ Trả về gom</button>
            <button class="btn btn-ghost btn-sm" onclick="window.pcEditOrder('${o.code}')" title="Sửa đơn (nhập sai)">✏️ Sửa</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.pcDeleteOrder('${o.code}')" title="Xoá hẳn đơn này">🗑 Xoá</button>
            <button class="btn btn-navy btn-sm" onclick="window.pcPrintRelease('${o.code}')">🖨 Phiếu xuất kho</button>
            <button class="btn btn-primary btn-sm" onclick="window.pcDispatch('${o.code}')">🛵 Giao shipper</button>
          </div>
        </div>`;
      }).join('');
  }

  /* Sửa đơn (nhập sai) → mở chi tiết đơn ở trang Đơn hàng */
  window.pcEditOrder = function (code) {
    window.location.href = 'orders.html?open=' + encodeURIComponent(code);
  };
  /* Xoá hẳn đơn nhập sai — gỡ khỏi mọi phiên gom + xoá khỏi store */
  window.pcDeleteOrder = async function (code) {
    const o = getOrders().find(x => x.code === code); if (!o) return;
    if (!(await window.uiConfirm(`Xoá HẲN đơn ${code}${o.custName ? ' — ' + o.custName : ''}?\nKhông khôi phục được. Dùng khi đơn nhập sai.`, { title: '🗑 Xoá đơn', okText: 'Xoá đơn', danger: true }))) return;
    /* gỡ đơn khỏi các phiên gom (orderCodes + breakdown + tính lại totalQty) */
    const runs = getRuns();
    if (_detachOrderFromRuns(runs, code)) saveRuns(runs);
    window.STORE.remove('orders', code);
    window.toast?.('🗑 Đã xoá đơn ' + code, 'danger');
    renderAll();
  };

  /* Gỡ 1 đơn khỏi các phiên gom (dùng chung cho xoá lẻ + xoá hàng loạt) */
  function _detachOrderFromRuns(runs, code) {
    let rch = false;
    runs.forEach(r => {
      if (Array.isArray(r.orderCodes) && r.orderCodes.includes(code)) {
        r.orderCodes = r.orderCodes.filter(c => c !== code);
        (r.lines || []).forEach(l => {
          if (Array.isArray(l.breakdown)) {
            const before = l.breakdown.length;
            l.breakdown = l.breakdown.filter(b => b.code !== code);
            if (l.breakdown.length !== before) l.totalQty = +l.breakdown.reduce((s, b) => s + (+b.qty || 0), 0).toFixed(2);
          }
        });
        rch = true;
      }
    });
    return rch;
  }

  /* ===== GIAO SHIPPER HÀNG LOẠT (③ Xuất kho) ===== */
  window.pcDispatchBulk = function () {
    const codes = Array.from(_relSel);
    if (!codes.length) { window.toast?.('Chưa chọn đơn nào', 'warn'); return; }
    const list = _shipperList();
    const opts = list.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.guest ? ' (ngoài)' : ''}</option>`).join('');
    const noShip = list.length ? '' : '<div style="font-size:11.5px;color:#B45309;margin-top:6px">⚠ Chưa có shipper — thêm NV vị trí <b>Ship</b> ở Nhân sự.</div>';
    window.openModal('🛵 Giao shipper hàng loạt — ' + codes.length + ' đơn', `
      <div style="font-size:13px;color:#334155;margin-bottom:14px">Áp cho <b>${codes.length} đơn</b> đã chọn.</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="border:1.5px solid var(--line);border-radius:11px;padding:13px">
          <div style="font-weight:800;color:var(--navy);margin-bottom:9px">① Gán 1 shipper cho tất cả</div>
          <select id="pcBulkShipSel" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--line);border-radius:8px;font-size:14px">
            <option value="">— Chọn shipper —</option>${opts}
          </select>${noShip}
          <button class="btn btn-primary" style="margin-top:11px;width:100%" onclick="window._pcDispatchBulkTo()">🛵 Giao ${codes.length} đơn cho shipper đã chọn</button>
        </div>
        <div style="border:1.5px dashed var(--line);border-radius:11px;padding:13px;background:#FAFBFA">
          <div style="font-weight:800;color:var(--navy);margin-bottom:6px">② Đưa tất cả lên bảng — shipper tự nhận</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:11px">${codes.length} đơn hiện ở Bảng giao hàng cho mọi shipper tự nhận.</div>
          <button class="btn btn-navy" style="width:100%" onclick="window._pcDispatchBulkOpen()">📋 Đưa ${codes.length} đơn lên bảng</button>
        </div>
      </div>
    `, { width: '460px' });
  };
  function _pcDispatchMany(codes, driverId, driverName) {
    const orders = getOrders();
    const done = [];
    codes.forEach(code => {
      const o = orders.find(x => x.code === code);
      if (!o || o.whStatus !== 'confirmed' || o.status === 'cancelled') return;
      o.whStatus = 'released'; o.status = 'transit'; o.transitAt = new Date().toISOString();
      o.driver = driverId || ''; o.driverName = driverName || '';
      done.push(o);
    });
    _relSel.clear();
    S().set('orders', orders);
    window.closeModal && window.closeModal();
    if (window.sendShipperDispatch) done.forEach(o => { try { window.sendShipperDispatch(o).catch(() => {}); } catch (e) {} });
    window.toast?.(driverName ? `🛵 Đã giao ${done.length} đơn cho ${driverName}` : `📋 Đã đưa ${done.length} đơn lên bảng — chờ shipper nhận`, 'success');
    renderRelease();
  }
  window._pcDispatchBulkTo = function () {
    const sel = document.getElementById('pcBulkShipSel'); const id = sel ? sel.value : '';
    if (!id) { window.toast?.('Chọn shipper trước, hoặc dùng cách ② đưa lên bảng', 'warn'); return; }
    const sp = _shipperList().find(x => String(x.id) === String(id));
    _pcDispatchMany(Array.from(_relSel), id, sp ? sp.name : '');
  };
  window._pcDispatchBulkOpen = function () { _pcDispatchMany(Array.from(_relSel), '', ''); };

  /* ===== XOÁ HÀNG LOẠT (③ Xuất kho) ===== */
  window.pcDelBulk = async function () {
    const codes = Array.from(_relSel);
    if (!codes.length) { window.toast?.('Chưa chọn đơn nào', 'warn'); return; }
    if (!(await window.uiConfirm(`Xoá HẲN ${codes.length} đơn đã chọn?\nKhông khôi phục được. Dùng khi đơn nhập sai.`, { title: '🗑 Xoá đơn hàng loạt', okText: 'Xoá ' + codes.length + ' đơn', danger: true }))) return;
    const runs = getRuns(); let rch = false;
    codes.forEach(code => { if (_detachOrderFromRuns(runs, code)) rch = true; });
    if (rch) saveRuns(runs);
    codes.forEach(code => window.STORE.remove('orders', code));
    _relSel.clear();
    window.toast?.('🗑 Đã xoá ' + codes.length + ' đơn', 'danger');
    renderAll();
  };

  let _printBusy = false;
  window.pcPrintRelease = async function (code) {
    if (_printBusy) return;   /* chống double-click: async (await getOrderItems) → tránh mở 2 cửa in */
    _printBusy = true;
    try {
    const o = getOrders().find(x => x.code === code); if (!o) return;
    const c = company();
    /* Danh sách đơn không kéo items → nạp lazy để phiếu xuất kho không in rỗng */
    let items = (Array.isArray(o.items) && o.items.length) ? o.items : null;
    if (!items && window.SB_DATA && window.SB_DATA.getOrderItems) {
      const its = await window.SB_DATA.getOrderItems(code);
      items = Array.isArray(its) ? its : [];
    }
    items = items || [];
    const totalKg = items.reduce((s, it) => s + (+it.qty || 0), 0);
    const rows = items.map((it, i) => `<tr><td class="stt">${i + 1}</td><td><b>${esc(it.name)}</b></td><td class="num">${fmtQty(it.qty)} ${it.unit || 'kg'}</td></tr>`).join('');
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PHIẾU XUẤT KHO</title>
<style>@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
body{color:#1a1a1a;font-size:13px}.wrap{max-width:780px;margin:0 auto}
.top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1B5E20;padding-bottom:10px}
.top img{width:150px;height:auto;object-fit:contain}.brand h1{font-size:19px;color:#1B5E20;font-weight:800}.brand .sub{font-size:11px;color:#555;margin-top:4px}
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
    } finally { _printBusy = false; }
  };

  /* Danh sách shipper = NV phòng Ship (staff) + ship ngoài (guest trong 'shippers') */
  const _isShipStaff = s => /ship|giao\s*h[àa]ng|v[ậa]n\s*h[àa]nh/i.test((s.dept || '') + ' ' + (s.role || ''));
  function _shipperList() {
    const staff = (S().get('staff', window.STAFF || []) || [])
      .filter(s => s && s.name && s.status !== 'inactive' && _isShipStaff(s))
      .map(s => ({ id: s.id, name: s.name, guest: false }));
    const guests = (S().get('shippers', window.DRIVERS || []) || [])
      .filter(s => s && s.name && s.guest)
      .map(s => ({ id: s.id, name: s.name, guest: true }));
    return staff.concat(guests);
  }

  /* Giao shipper: 2 CÁCH — ① kho chọn shipper luôn, ② đưa lên bảng cho shipper tự nhận */
  window.pcDispatch = function (code) {
    const orders = getOrders(); const o = orders.find(x => x.code === code); if (!o) return;
    const list = _shipperList();
    const opts = list.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.guest ? ' (ngoài)' : ''}</option>`).join('');
    const noShip = list.length ? '' : '<div style="font-size:11.5px;color:#B45309;margin-top:6px">⚠ Chưa có shipper — thêm NV vị trí <b>Ship</b> ở Nhân sự, hoặc tạo ship ngoài ở Bảng giao hàng.</div>';
    window.openModal('🛵 Giao shipper — ' + esc(code), `
      <div style="font-size:13px;color:#334155;margin-bottom:14px">Đơn <b>#${esc(code)}</b> · ${esc(o.custName || '')}${o.drop ? ' · 📍 ' + esc(String(o.drop).slice(0, 48)) : ''}</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="border:1.5px solid var(--line);border-radius:11px;padding:13px">
          <div style="font-weight:800;color:var(--navy);margin-bottom:9px">① Kho phân bổ shipper luôn</div>
          <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">Chọn shipper phụ trách</label>
          <select id="pcShipSel" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--line);border-radius:8px;font-size:14px">
            <option value="">— Chọn shipper —</option>${opts}
          </select>${noShip}
          <button class="btn btn-primary" style="margin-top:11px;width:100%" onclick="window._pcDispatchTo('${esc(code)}')">🛵 Giao cho shipper đã chọn</button>
        </div>
        <div style="border:1.5px dashed var(--line);border-radius:11px;padding:13px;background:#FAFBFA">
          <div style="font-weight:800;color:var(--navy);margin-bottom:6px">② Đưa lên bảng — shipper tự nhận</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:11px">Đơn hiện ở Bảng giao hàng cho <b>mọi shipper</b>. Ai rảnh bấm <b>“Nhận đơn”</b> thì đơn thành của người đó — shipper khác không thấy nữa.</div>
          <button class="btn btn-navy" style="width:100%" onclick="window._pcDispatchOpen('${esc(code)}')">📋 Đưa lên bảng (chưa gán shipper)</button>
        </div>
      </div>
    `, { width: '460px' });
  };
  /* Thực hiện chuyển đơn sang "Đang giao" + báo group. driverName đã set (hoặc rỗng = chưa gán). */
  function _pcDoDispatch(code, driverId, driverName) {
    const orders = getOrders(); const o = orders.find(x => x.code === code); if (!o) return;
    o.whStatus = 'released';
    o.status = 'transit';   /* Giao shipper = đơn sang "Đang giao" (hiện ở Bảng giao hàng) */
    o.transitAt = new Date().toISOString();
    o.driver = driverId || '';
    o.driverName = driverName || '';
    S().set('orders', orders);
    window.closeModal && window.closeModal();
    /* CHỈ TẠI ĐÂY (gom xong → giao shipper) mới bắn group + phân đơn shipper. */
    if (window.sendShipperDispatch) {
      window.sendShipperDispatch(o).then(r => {
        const okMsg = driverName ? ('🛵 Đã giao ' + code + ' cho ' + driverName + ' (đã báo group)') : ('📋 Đã đưa ' + code + ' lên bảng — chờ shipper nhận (đã báo group)');
        window.toast?.(r && r.ok ? (r.dup ? '🛵 ' + code + ' đã phân giao trước đó' : okMsg) : ('Đã chuyển ' + code + ' sang giao' + (driverName ? ' cho ' + driverName : '') + ' (chưa cấu hình TG shipper)'), r && r.ok ? 'success' : 'info');
      });
    } else {
      window.toast?.(driverName ? ('🛵 Đã giao ' + code + ' cho ' + driverName) : ('📋 Đã đưa ' + code + ' lên bảng — chờ shipper nhận'), 'success');
    }
    renderRelease();
  }
  window._pcDispatchTo = function (code) {
    const sel = document.getElementById('pcShipSel'); const id = sel ? sel.value : '';
    if (!id) { window.toast?.('Chọn shipper trước, hoặc dùng cách ② đưa lên bảng', 'warn'); return; }
    const sp = _shipperList().find(x => String(x.id) === String(id));
    _pcDoDispatch(code, id, sp ? sp.name : '');
  };
  window._pcDispatchOpen = function (code) { _pcDoDispatch(code, '', ''); };

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
    try { S().get('purchases'); } catch (e) {}   /* warm-load: chốt gom sẽ tự tạo phiếu nhập */
    renderAll();
    /* refresh khi STORE đổi (realtime) */
    S().subscribe?.('orders', () => { renderGather(); renderRelease(); });
    S().subscribe?.('procurementRuns', () => { renderRuns(); renderRelease(); });
    /* ?reopen=<runId> từ nút "↩ Về phiên gom" bên Phiếu nhập → trả phiên về bước gán NCC
       (retry chờ procurementRuns nạp xong từ cloud) */
    try {
      const rid = new URLSearchParams(location.search).get('reopen');
      if (rid) {
        let tries = 0;
        const tryReopen = () => {
          if (getRuns().some(r => r.id === rid)) window.pcReopenRun(rid, true);
          else if (tries++ < 20) setTimeout(tryReopen, 300);
        };
        setTimeout(tryReopen, 300);
      }
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
