/* =========================================================
   Suppliers (Nhà cung cấp) — CRUD + công nợ NCC + lịch sử nhập
   ========================================================= */
(function () {
  const escH = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* Viết hoa chữ đầu mỗi từ — CHỈ để hiển thị, KHÔNG sửa dữ liệu gốc trong DB.
     "chú TÝ" → "Chú Tý" · "vụ hành tỏi" → "Vụ Hành Tỏi" · "00852 tuấn tú" → "00852 Tuấn Tú". */
  const tcName = v => String(v == null ? '' : v).trim().toLowerCase().replace(/(^|[\s(\/-])(\S)/g, (m, sp, ch) => sp + ch.toUpperCase());
  function getSup() { return window.STORE.get('suppliers', window.SUPPLIERS || []) || []; }
  function getPur() { return window.STORE.get('purchases', window.PURCHASES || []) || []; }
  const getCash = () => window.STORE.get('cashEntries', []) || [];
  const getClaims = () => window.STORE.get('supplierClaims', []) || [];
  const _dmyToISO = dmy => { const m = String(dmy || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : ''; };
  /* CÔNG NỢ NCC = DẪN XUẤT: Σ nhập(received) − Σ phiếu chi tiền mặt − Σ trả hàng. (suppliers KHÔNG có cột debt) */
  function _supNhap(id) { return getPur().filter(p => p.status === 'received' && p.supplierId === id && p.supplierId !== 'EXT-MARKET').reduce((s, p) => s + (+p.total || 0), 0); }
  function _supPaidCash(id) { const nm = (getSup().find(s => s.id === id) || {}).name || ''; return getCash().filter(e => e && e.type === 'out' && (e.supplierId === id || e.party === nm || (e.desc && String(e.desc).includes(id)))).reduce((s, e) => s + (+e.amount || 0), 0); }
  function _supClaims(id) { return getClaims().filter(c => c && c.supplierId === id && c.status !== 'settled' && c.status !== 'cancelled').reduce((s, c) => s + (+c.amount || 0), 0); }
  function _supDebt(id) { return Math.max(0, _supNhap(id) - _supPaidCash(id) - _supClaims(id)); }
  /* Loại NCC (sỉ/lẻ/cả hai) — cloud suppliers không có cột → lưu kv 'supplierMeta' */
  const getSupMeta = () => window.STORE.get('supplierMeta', {}) || {};
  const supplyTypeOf = id => { const m = getSupMeta()[id]; return (m && m.type) || 'both'; };
  const TYPE_LABEL = { si: 'Sỉ', le: 'Lẻ', both: 'Sỉ + Lẻ' };
  const TYPE_DESC = { si: 'Bán sỉ — đóng 1 lô lớn theo tổng', le: 'Bán lẻ — chia sẵn theo từng khách', both: 'Cả sỉ và lẻ' };
  /* Trạng thái NHẬP HÀNG (khác cột `active` = còn dùng NCC hay không).
     'paused' = ngừng nhập → không hiện ở lệnh gọi hàng của Kho, nhưng giữ nguyên lịch sử & công nợ. */
  const supplyStatusOf = id => { const m = getSupMeta()[id]; return (m && m.status) || 'active'; };
  const ST_LABEL = { active: 'Đang nhập', paused: 'Ngừng nhập' };
  function saveSupplyMeta(id, patch) {
    window.STORE.rmwKv('supplierMeta', m => {   /* chống đè: set theo id lên bản cloud mới nhất */
      m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
      m[id] = Object.assign({}, m[id] || {}, patch);
      return m;
    }, {});
  }
  const CATS = { 'rau-ta':'Rau ta', 'rau-dalat':'Rau Đà Lạt', 'nam':'Nấm',
                 'rau-vung-mien':'Rau vùng miền', 'rau-gia-vi':'Rau gia vị', 'hai-san':'Hải sản' };


  const _isActive = s => s.active !== false && supplyStatusOf(s.id) !== 'paused';
  function groupOf(s) {                       /* 'si' | 'le' | 'other' */
    if (!_isActive(s)) return 'other';
    const t = supplyTypeOf(s.id);
    return (t === 'si' || t === 'le') ? t : 'other';
  }

  function renderKpis() {
    const list = getSup();
    const si = list.filter(s => groupOf(s) === 'si').length;
    const le = list.filter(s => groupOf(s) === 'le').length;
    const totalDebt = list.reduce((s, x) => s + _supDebt(x.id), 0);
    const nDebt = list.filter(s => _supDebt(s.id) > 0).length;
    document.getElementById('supKpis').innerHTML = `
      <div class="ik-kpi" style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">📦 Nhà cung cấp SỈ ${window.helpTip('Giao cả lô theo tổng — kho tự chia cho từng khách.')}</div>
        <div style="font-size:24px;font-weight:800;color:#1E40AF;margin-top:4px">${si}</div></div>
      <div class="ik-kpi" style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">🛵 Nhà cung cấp LẺ ${window.helpTip('Chia mô sẵn theo từng khách — nhận về là túi đã có tên.')}</div>
        <div style="font-size:24px;font-weight:800;color:#15803D;margin-top:4px">${le}</div></div>
      <div class="ik-kpi" style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">💸 Công nợ phải trả ${window.helpTip('Tiền còn nợ NCC (phiếu nhập NET chưa thanh toán).')}</div>
        <div style="font-size:24px;font-weight:800;color:#DC2626;margin-top:4px">${window.fmtShort(totalDebt)}</div>
        <div style="font-size:11.5px;color:var(--muted)">${nDebt} NCC đang nợ</div></div>`;
  }

  /* Thứ tự hiển thị = thứ tự trong file NCC gốc (mã NCC001..NCC0xx tăng dần) để rà soát cho dễ.
     Lấy phần số trong mã; NCC không theo mã số thì xếp cuối (giữ thứ tự tương đối). */
  function supOrder(s) { const m = String(s && s.id || '').match(/(\d+)/); return m ? +m[1] : 1e9; }
  function render() {
    renderKpis();
    const _tab = window.__supTab === 'le' ? 'le' : 'si';   /* tab đang chọn: Sỉ / Lẻ */
    const pur = getPur();
    const all = getSup().slice().sort((a, b) => supOrder(a) - supOrder(b));
    const si = all.filter(s => groupOf(s) === 'si');
    const le = all.filter(s => groupOf(s) === 'le');
    const other = all.filter(s => groupOf(s) === 'other');

    const has = v => v && String(v).trim() && String(v).trim().toLowerCase() !== 'null';
    const dash = '<span style="color:var(--muted);opacity:.5">—</span>';
    const money = n => (+n > 0) ? window.fmt(n) + ' ₫' : '<span style="color:var(--muted)">—</span>';

    /* 1 nhà = 1 accordion full-width. Bấm dòng → xổ sản phẩm cung cấp. */
    const accRow = s => {
      const prods = s.products || [];
      const paused = supplyStatusOf(s.id) === 'paused';
      const search = (s.name + ' ' + (s.phone || '')).toLowerCase().replace(/"/g, '');
      const prodSummary = prods.length
        ? prods.map(p => escH(p.name)).join(' · ')
        : '<span style="opacity:.65;font-style:italic">chưa gán sản phẩm</span>';
      /* Bấm cả dòng → mở drawer chi tiết + sửa luôn (không xổ dropdown) */
      return `<div class="sup-acc" data-search="${escH(search)}" onclick="window.openSupDrawer('${s.id}')" title="Bấm để xem chi tiết & sửa" style="display:flex;align-items:center;gap:12px;padding:11px 14px;cursor:pointer;border-bottom:1px solid #EFF2EE">
          <span style="flex:1;min-width:0">
            <div style="font-weight:700;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${has(s.name) ? escH(tcName(s.name)) : '(chưa đặt tên)'}
              ${paused ? '<span class="tag" style="background:#FEE2E2;color:#B91C1C;font-weight:700;margin-left:6px">Ngừng nhập</span>' : ''}
            </div>
            <div style="font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">${prodSummary}</div>
          </span>
          <span style="flex:0 0 58px;text-align:center">
            <span style="display:inline-block;min-width:22px;padding:1px 7px;background:${prods.length ? '#EFF6FF' : '#F1F5F9'};color:${prods.length ? '#1E40AF' : '#94A3B8'};border-radius:20px;font-weight:700;font-size:12px;font-variant-numeric:tabular-nums">${prods.length}</span>
          </span>
          <span class="mobile-hide" style="flex:0 0 128px;font-variant-numeric:tabular-nums;color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${has(s.phone) ? escH(s.phone) : dash}</span>
          <span style="flex:0 0 150px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:${_supDebt(s.id) > 0 ? '700' : '400'};color:${_supDebt(s.id) > 0 ? '#DC2626' : 'var(--muted)'}">${money(_supDebt(s.id))} <button onclick="event.stopPropagation();event.preventDefault();window.supPayHistory('${s.id}')" title="Lịch sử thanh toán NCC" style="background:#fff;border:1px solid var(--line);border-radius:6px;padding:2px 6px;font-size:11px;cursor:pointer;vertical-align:middle">📜</button></span>
        </div>`;
    };

    /* Panel full-width: header (tiêu đề + ô tìm riêng) · hàng cột · danh sách accordion */
    const panel = (group, title, sub, color, bg, arr) => `
      <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff;margin-bottom:16px">
        <div style="background:${bg};padding:11px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="min-width:0">
            <div style="display:flex;align-items:baseline;gap:8px">
              <b style="color:${color};font-size:14px">${title}</b>
              <span style="background:#fff;border:1px solid ${color}33;color:${color};font-weight:800;font-size:12px;border-radius:20px;padding:1px 10px">${arr.length}</span>
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${sub}</div>
          </div>
          <div style="flex:1"></div>
          <div style="position:relative;min-width:220px;flex:0 1 300px">
            <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#94A3B8;font-size:13px;pointer-events:none">🔍</span>
            <input type="text" oninput="window.supFilterPanel('${group}',this.value)" placeholder="Tìm nhà cung cấp trong nhóm này…"
              style="width:100%;box-sizing:border-box;padding:8px 11px 8px 32px;border:1px solid var(--line);border-radius:8px;font-size:12.5px;background:#fff">
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:7px 14px;background:#FAFBFA;border-bottom:1px solid var(--line);font-size:10.5px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.3px">
          <span style="flex:0 0 12px"></span>
          <span style="flex:1;min-width:0">Tên nhà cung cấp <span style="text-transform:none;font-weight:400;opacity:.75">· sản phẩm cung cấp</span></span>
          <span style="flex:0 0 58px;text-align:center" title="Số lượng sản phẩm cung cấp">SL SP</span>
          <span style="flex:0 0 128px">SĐT liên hệ</span>
          <span style="flex:0 0 150px;text-align:right">Công nợ phải trả</span>
        </div>
        <div id="supBody-${group}" style="max-height:none">
          ${arr.length ? arr.map(accRow).join('') : ''}
          <div id="supEmpty-${group}" style="display:${arr.length ? 'none' : 'block'};padding:26px;text-align:center;color:var(--muted);font-size:12px">Không có nhà cung cấp nào</div>
        </div>
      </div>`;

    document.getElementById('supList').innerHTML = `
      ${other.length
        ? `<div style="display:flex;align-items:center;gap:8px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:7px 12px;margin-bottom:13px;font-size:12.5px;color:#92400E">
             <span>🔔</span><span style="flex:1"><b>${other.length}</b> nhà cung cấp chưa được xếp vào nhóm Sỉ / Lẻ.</span>
             <a href="javascript:void 0" onclick="window.supOpenUnassigned()" style="color:#B45309;font-weight:700;white-space:nowrap">Xếp ngay →</a>
           </div>`
        : `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:6px 12px;margin-bottom:13px;font-size:12px;color:#15803D">✓ Tất cả nhà cung cấp đã được xếp nhóm.</div>`}
      <div style="display:flex;gap:8px;margin-bottom:13px">
        <button onclick="window.supSetTab('si')" style="flex:1;padding:11px 8px;border-radius:9px;border:1.5px solid ${_tab === 'si' ? '#1E40AF' : 'var(--line)'};background:${_tab === 'si' ? '#EFF6FF' : '#fff'};color:${_tab === 'si' ? '#1E40AF' : '#64748B'};font-weight:800;font-size:13.5px;cursor:pointer">📦 NCC Sỉ <span style="background:${_tab === 'si' ? '#1E40AF' : '#94A3B8'};color:#fff;border-radius:20px;padding:1px 8px;font-size:11.5px;margin-left:4px">${si.length}</span></button>
        <button onclick="window.supSetTab('le')" style="flex:1;padding:11px 8px;border-radius:9px;border:1.5px solid ${_tab === 'le' ? '#15803D' : 'var(--line)'};background:${_tab === 'le' ? '#F0FDF4' : '#fff'};color:${_tab === 'le' ? '#15803D' : '#64748B'};font-weight:800;font-size:13.5px;cursor:pointer">🛵 NCC Lẻ <span style="background:${_tab === 'le' ? '#15803D' : '#94A3B8'};color:#fff;border-radius:20px;padding:1px 8px;font-size:11.5px;margin-left:4px">${le.length}</span></button>
      </div>
      ${_tab === 'si'
        ? panel('si', '📦 NHÀ CUNG CẤP SỈ', 'Giao cả lô theo tổng — kho tự chia cho từng khách', '#1E40AF', '#EFF6FF', si)
        : panel('le', '🛵 NHÀ CUNG CẤP LẺ', 'Chia mô sẵn theo từng khách — nhận về là túi có tên', '#15803D', '#F0FDF4', le)}`;
  }
  window.supSetTab = function (t) { window.__supTab = (t === 'le' ? 'le' : 'si'); render(); };

  /* Tìm trong 1 nhóm — lọc tại chỗ (không dựng lại cả trang, giữ ô đang gõ + accordion đang mở) */
  window.supFilterPanel = function (group, q) {
    q = String(q || '').trim().toLowerCase();
    const body = document.getElementById('supBody-' + group);
    if (!body) return;
    let shown = 0;
    body.querySelectorAll(".sup-acc").forEach(d => {
      const hit = !q || (d.getAttribute('data-search') || '').includes(q);
      d.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    const empty = document.getElementById('supEmpty-' + group);
    if (empty) { empty.style.display = shown ? 'none' : 'block'; empty.textContent = q ? 'Không có nhà cung cấp nào khớp “' + q + '”' : 'Không có nhà cung cấp nào'; }
  };

  /* ===== POPUP xếp nhóm — sổ ra khi bấm nút thông báo ===== */
  window.supOpenUnassigned = function () {
    window.openModal('🗂 Xếp nhóm nhà cung cấp', _unassignedBody(), {
      width: '480px',
      footer: `<button class="btn btn-primary" onclick="window.closeModal()">Xong</button>`,
    });
  };
  function _unassignedBody() {
    const list = getSup().filter(s => groupOf(s) === 'other');
    if (!list.length) return '<div id="uaList" style="padding:34px;text-align:center;color:var(--ok);font-size:14px;font-weight:700">✓ Đã xếp nhóm xong tất cả!</div>';
    return `<div style="font-size:12.5px;color:var(--muted);margin-bottom:11px">Chọn <b style="color:#1E40AF">📦 Sỉ</b> (giao cả lô) hoặc <b style="color:#15803D">🛵 Lẻ</b> (chia sẵn theo khách) cho từng nhà:</div>
      <div id="uaList" style="display:grid;gap:6px;max-height:58vh;overflow:auto">
        ${list.map(s => `<div id="uarow-${s.id}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:8px">
          <div style="flex:1;min-width:0"><b>${escH(tcName(s.name))}</b><div style="font-size:11px;color:var(--muted)">${escH(s.phone) || '— chưa có SĐT'}</div></div>
          <button class="btn btn-ghost btn-sm" style="border:1px solid #BFDBFE;color:#1E40AF;white-space:nowrap" onclick="window.supAssignInPopup('${s.id}','si')">📦 Sỉ</button>
          <button class="btn btn-ghost btn-sm" style="border:1px solid #BBF7D0;color:#15803D;white-space:nowrap" onclick="window.supAssignInPopup('${s.id}','le')">🛵 Lẻ</button>
        </div>`).join('')}
      </div>`;
  }
  window.supAssignInPopup = function (id, type) {
    saveSupplyMeta(id, { type });          /* chỉ đặt nhóm, giữ nguyên trạng thái nhập */
    render();                               /* cập nhật lưới chính + badge */
    const row = document.getElementById('uarow-' + id);
    if (row) row.remove();
    const box = document.getElementById('uaList');
    if (box && !box.querySelector('[id^="uarow-"]')) {
      box.innerHTML = '<div style="padding:26px;text-align:center;color:var(--ok);font-size:14px;font-weight:700">✓ Đã xếp nhóm xong tất cả!</div>';
    }
  };

  window.openSupDrawer = function (id) {
    const s = getSup().find(x => x.id === id);
    if (!s) return;
    const pur = getPur().filter(p => p.supplierId === id);
    const typ = supplyTypeOf(s.id);
    const paused = supplyStatusOf(s.id) === 'paused';
    const prods = s.products || [];
    const dc = document.getElementById('drawerContent');

    /* CHỈ hiện: tên · SĐT · công nợ · sản phẩm cung cấp.
       Địa chỉ, người liên hệ, điều khoản TT, tổng chi, ghi chú → ẩn (vẫn còn trong DB, sửa ở form). */
    dc.innerHTML = `
      <div style="background:linear-gradient(135deg,${window.avatarColor(s.id)} 0%,#1B5E20 100%);color:#fff;padding:20px;position:relative">
        <button onclick="closeDrawer()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,.15);border:none;color:#fff;width:30px;height:30px;border-radius:6px;cursor:pointer">✕</button>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:54px;height:54px;border-radius:11px;background:rgba(255,255,255,.2);display:grid;place-items:center;font-size:22px;font-weight:800">${window.initials(s.name)}</div>
          <div style="min-width:0">
            <h2 style="margin:0;font-size:18px;line-height:1.25">${escH(tcName(s.name))}</h2>
            <div style="opacity:.9;font-size:13px;margin-top:3px">📞 ${s.phone || '— chưa có số'}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">
          <span style="background:rgba(255,255,255,.2);border-radius:20px;padding:2px 10px;font-size:11.5px;font-weight:700">${typ === 'si' ? '📦 Sỉ' : typ === 'le' ? '🛵 Lẻ' : '⚠ Chưa xếp nhóm'}</span>
          ${paused ? '<span style="background:rgba(220,38,38,.55);border-radius:20px;padding:2px 10px;font-size:11.5px;font-weight:700">Ngừng nhập</span>' : ''}
        </div>
      </div>

      <div style="padding:18px 20px">
        <div style="padding:12px 14px;border-radius:9px;background:${_supDebt(s.id) > 0 ? '#FEE2E2' : '#F0FDF4'};border:1px solid ${_supDebt(s.id) > 0 ? '#FECACA' : '#BBF7D0'};margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <div><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">Công nợ phải trả ${window.helpTip('Σ nhập (đã nhận) − Σ phiếu chi tiền mặt − Σ trả hàng.')}</div>
            <div style="font-size:21px;font-weight:800;color:${_supDebt(s.id) > 0 ? '#DC2626' : 'var(--ok)'};margin-top:2px">${_supDebt(s.id) > 0 ? window.fmt(_supDebt(s.id)) + ' ₫' : '— Hết nợ'}</div></div>
            <button class="btn btn-ghost btn-sm" onclick="window.supPayHistory('${s.id}')" title="Lịch sử thanh toán — đã trả bao nhiêu, tuổi nợ">📜 Lịch sử trả nợ</button>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin:0 0 8px">
          <h3 style="margin:0;flex:1;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">🥬 Sản phẩm cung cấp (${prods.length}) <span style="text-transform:none;font-weight:400;color:#94A3B8">— sửa tên/giá · ✕ xoá</span></h3>
          <button onclick="window.supBulkPaste('${s.id}')" title="Dán danh sách tên SP từ Google Sheet (mỗi dòng 1 SP) — tự báo SP nào đã có, thêm SP mới" style="border:1px solid #93C5FD;background:#EFF6FF;color:#1E40AF;border-radius:7px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">📋 Dán hàng loạt</button>
        </div>
        <datalist id="supProdDL_${s.id}">${_catalogProds().map(p => `<option value="${escH(p.name)}">`).join('')}</datalist>
        <div style="border:1px solid var(--line);border-radius:9px;overflow:hidden">
          ${prods.map((p, i) => `<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid #F1F5F9">
            <input value="${escH(p.name)}" onchange="window.supEditProdName('${s.id}',${i},this.value)" title="Sửa tên SP" style="flex:1;min-width:0;border:1px solid transparent;border-radius:5px;padding:6px 8px;font-size:12.5px;font-weight:600;background:#F6FAF6">
            <input type="number" min="0" step="1000" value="${p.price || ''}" placeholder="giá" onchange="window.supEditProdPrice('${s.id}',${i},this.value)" title="Giá nhập (₫)" style="width:88px;text-align:right;border:1px solid var(--line);border-radius:5px;padding:6px 8px;font-size:12px">
            <button onclick="window.supDelProd('${s.id}',${i})" title="Xoá SP này" style="border:none;background:none;color:#B91C1C;cursor:pointer;font-size:15px;padding:0 4px">✕</button>
          </div>`).join('') || '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">Chưa có SP — thêm ở dòng dưới</div>'}
          <div style="display:flex;align-items:center;gap:6px;padding:8px;background:#F0FDF4">
            <input id="supAddName_${s.id}" list="supProdDL_${s.id}" placeholder="➕ Thêm SP (gõ tên)…" autocomplete="off"
              onkeydown="if(event.key==='Enter'){event.preventDefault();window.supAddProd('${s.id}')}"
              style="flex:1;min-width:0;border:1px solid #86EFAC;border-radius:5px;padding:7px 8px;font-size:12.5px;background:#fff">
            <input id="supAddPrice_${s.id}" type="number" min="0" step="1000" placeholder="giá" style="width:88px;text-align:right;border:1px solid #86EFAC;border-radius:5px;padding:7px 8px;font-size:12px;background:#fff">
            <button onclick="window.supAddProd('${s.id}')" style="border:none;background:#15803D;color:#fff;border-radius:6px;padding:7px 13px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">＋ Thêm</button>
          </div>
        </div>

        <details style="margin-top:14px">
          <summary style="cursor:pointer;font-size:12px;color:var(--muted);font-weight:600">📦 Lịch sử nhập hàng (${pur.length})</summary>
          <div style="border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-top:8px">
            ${pur.length ? pur.map(p => `<a href="purchases.html?focus=${p.id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #F1F5F9;text-decoration:none;color:inherit;font-size:12.5px">
              <div style="flex:1"><b>${p.id}</b><div style="font-size:11px;color:var(--muted)">${p.date} · ${(p.items || []).length} mặt hàng · ${p.status === 'received' ? '✓ Đã nhận' : '⏳ Đang chờ'}</div></div>
              <div style="font-weight:700;color:var(--navy)">${window.fmt(p.total)} ₫</div>
            </a>`).join('') : '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">Chưa có phiếu nhập nào</div>'}
          </div>
        </details>

        <button class="btn btn-primary" style="width:100%;margin-top:18px" onclick="window.openSupModal('${s.id}')">✏️ Sửa nhà cung cấp</button>
        ${_supDebt(s.id) > 0 ? `<button class="btn btn-ghost" style="width:100%;margin-top:8px;color:var(--ok)" onclick="window.paySupplier('${s.id}')">💰 Ghi thanh toán NCC</button>` : ''}
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-ghost" style="flex:1;border:1px solid var(--line);color:${paused ? '#15803D' : '#B45309'};font-weight:700" onclick="window.supTogglePause('${s.id}')" title="${paused ? 'Mở lại — NCC hiện trở lại ở lệnh gọi hàng' : 'Ngừng nhập — ẩn khỏi lệnh gọi hàng, giữ lịch sử & công nợ'}">${paused ? '▶ Mở lại nhập hàng' : '⏸ Ngừng nhập hàng'}</button>
          <button class="btn btn-ghost" style="flex:1;border:1px solid #FECACA;color:var(--danger);font-weight:700" onclick="window.supDelete('${s.id}')" title="Xoá hẳn nhà cung cấp này (không hoàn tác)">🗑 Xoá NCC</button>
        </div>
      </div>`;
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerBg').classList.add('open');
  };

  /* ===== Thêm/Sửa/Xoá SP ngay trong popup NCC (lưu vào suppliers.products → sync cloud) ===== */
  const _pn = v => String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  const _catalogProds = () => window.STORE.get('products', window.PRODUCTS || []) || [];
  function _saveSupProds(id, prods, rerender) {
    const list = getSup(); const s = list.find(x => x.id === id); if (!s) return;
    s.products = prods;
    window.STORE.set('suppliers', list);
    render();
    if (rerender) window.openSupDrawer(id);
  }
  window.supDelProd = function (id, idx) {
    const s = getSup().find(x => x.id === id); if (!s) return;
    const prods = (s.products || []).slice(); if (idx < 0 || idx >= prods.length) return;
    prods.splice(idx, 1);
    _saveSupProds(id, prods, true);
  };
  window.supEditProdName = function (id, idx, val) {
    const s = getSup().find(x => x.id === id); if (!s || !(s.products || [])[idx]) return;
    val = String(val || '').trim(); if (!val) { window.openSupDrawer(id); return; }   /* rỗng → khôi phục */
    const cat = _catalogProds().find(p => _pn(p.name) === _pn(val));
    const prods = s.products.slice();
    prods[idx] = { ...prods[idx], name: cat ? cat.name : val, id: cat ? cat.id : (prods[idx].id || '') };
    _saveSupProds(id, prods, false);
  };
  window.supEditProdPrice = function (id, idx, val) {
    const s = getSup().find(x => x.id === id); if (!s || !(s.products || [])[idx]) return;
    const prods = s.products.slice();
    prods[idx] = { ...prods[idx], price: val === '' ? 0 : (+val || 0) };
    _saveSupProds(id, prods, false);
  };
  window.supAddProd = function (id) {
    const s = getSup().find(x => x.id === id); if (!s) return;
    const nameEl = document.getElementById('supAddName_' + id);
    const priceEl = document.getElementById('supAddPrice_' + id);
    const name = nameEl ? String(nameEl.value || '').trim() : '';
    if (!name) { nameEl && nameEl.focus(); window.toast && window.toast('Nhập tên sản phẩm', 'warn'); return; }
    const price = (priceEl && priceEl.value !== '') ? (+priceEl.value || 0) : 0;
    const cat = _catalogProds().find(p => _pn(p.name) === _pn(name));
    const prods = (s.products || []).slice();
    if (prods.some(p => (cat && p.id && p.id === cat.id) || _pn(p.name) === _pn(name))) {
      window.toast && window.toast('SP đã có trong danh sách', 'info'); return;
    }
    prods.push({ id: cat ? cat.id : '', name: cat ? cat.name : name, price });
    _saveSupProds(id, prods, true);
  };

  /* ===== DÁN HÀNG LOẠT SP cho NCC (copy 1 cột tên SP từ Sheet) — báo đã có / thêm mới ===== */
  window.supBulkPaste = function (id) {
    const s = getSup().find(x => x.id === id); if (!s) return;
    window.openModal('📋 Dán hàng loạt SP — ' + tcName(s.name), `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">Copy <b>1 cột tên SP</b> từ Google Sheet → dán vào ô dưới (mỗi dòng 1 SP). Hệ tự báo SP nào <b style="color:#94A3B8">đã có</b> (bỏ qua), SP nào <b style="color:#15803D">mới</b> để thêm.</div>
      <textarea id="supBulkTA" rows="9" placeholder="Cà Chua Đại&#10;Xà Lách Xoăn&#10;Bắp Cải Đà Lạt&#10;..." style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:9px;font-size:13px;resize:vertical"></textarea>
      <div id="supBulkResult" style="margin-top:10px"></div>
    `, {
      width: '520px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-primary" onclick="window._supBulkPreview('${id}')">🔍 Kiểm tra</button>`,
    });
    setTimeout(() => { const t = document.getElementById('supBulkTA'); if (t) t.focus(); }, 60);
  };
  window._supBulkPreview = function (id) {
    const s = getSup().find(x => x.id === id); if (!s) return;
    const ta = document.getElementById('supBulkTA');
    const raw = (ta ? ta.value : '').split(/[\n\r]+/).map(x => x.replace(/\t.*$/, '').trim()).filter(Boolean);
    const seen = new Set(), uniq = [];
    raw.forEach(n => { const k = _pn(n); if (k && !seen.has(k)) { seen.add(k); uniq.push(n); } });
    const have = new Set((s.products || []).map(p => _pn(p.name)));
    const catByName = {}; _catalogProds().forEach(p => { catByName[_pn(p.name)] = p; });
    const dup = [], newInCat = [], newFree = [];
    uniq.forEach(n => {
      const k = _pn(n);
      if (have.has(k)) dup.push(n);
      else if (catByName[k]) newInCat.push({ name: catByName[k].name, id: catByName[k].id });
      else newFree.push(n);
    });
    window._supBulkPending = { id, newInCat, newFree };
    const nNew = newInCat.length + newFree.length;
    const chip = (t, color, bg) => `<span style="display:inline-block;background:${bg};color:${color};border-radius:5px;padding:2px 7px;font-size:11.5px;margin:2px 3px 0 0">${t}</span>`;
    const box = document.getElementById('supBulkResult'); if (!box) return;
    box.innerHTML = `
      <div style="font-size:12.5px;line-height:1.7">
        <div><b style="color:#15803D">➕ Thêm mới: ${nNew}</b>${newFree.length ? ` <span style="color:#B45309">(${newFree.length} ngoài danh mục SP — vẫn thêm được)</span>` : ''}</div>
        <div><b style="color:#94A3B8">⏭ Đã có (bỏ qua): ${dup.length}</b> · Tổng dán: ${uniq.length}</div>
      </div>
      ${nNew ? `<div style="margin-top:6px;max-height:130px;overflow:auto;border:1px solid #DCFCE7;border-radius:7px;padding:6px;background:#F0FDF4">${newInCat.map(p => chip(escH(p.name), '#166534', '#DCFCE7')).join('')}${newFree.map(n => chip('⚠ ' + escH(n), '#92400E', '#FEF3C7')).join('')}</div>
        <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="window._supBulkAdd('${id}')">➕ Thêm ${nNew} SP mới vào NCC</button>`
        : '<div style="margin-top:6px;color:var(--muted);font-size:12px">✓ Tất cả SP dán vào đều đã có — không cần thêm.</div>'}
      ${dup.length ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Xem ${dup.length} SP đã có</summary><div style="margin-top:4px;max-height:90px;overflow:auto">${dup.map(n => chip(escH(n), '#64748B', '#F1F5F9')).join('')}</div></details>` : ''}
    `;
  };
  window._supBulkAdd = function (id) {
    const P = window._supBulkPending; if (!P || P.id !== id) return;
    const s = getSup().find(x => x.id === id); if (!s) return;
    const prods = (s.products || []).slice();
    const have = new Set(prods.map(p => _pn(p.name)));
    let n = 0;
    P.newInCat.forEach(p => { if (!have.has(_pn(p.name))) { prods.push({ id: p.id, name: p.name, price: 0 }); have.add(_pn(p.name)); n++; } });
    P.newFree.forEach(nm => { if (!have.has(_pn(nm))) { prods.push({ id: '', name: nm, price: 0 }); have.add(_pn(nm)); n++; } });
    delete window._supBulkPending;
    window.closeModal && window.closeModal();
    _saveSupProds(id, prods, true);   /* lưu + vẽ lại drawer */
    window.toast && window.toast(`➕ Đã thêm ${n} SP cho ${tcName(s.name)}`, 'success');
  };

  window.closeDrawer = function () {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBg').classList.remove('open');
  };

  /* ===== NGỪNG NHẬP / MỞ LẠI (đóng NCC không nhập hàng — giữ lịch sử & công nợ) ===== */
  window.supTogglePause = async function (id) {
    const s = getSup().find(x => x.id === id); if (!s) return;
    const paused = supplyStatusOf(id) === 'paused';
    if (!paused && window.uiConfirm && !(await window.uiConfirm(
      `Ngừng nhập hàng từ "${tcName(s.name)}"?\n\n→ NCC này sẽ KHÔNG hiện ở lệnh gọi hàng của Kho.\nLịch sử nhập & công nợ GIỮ NGUYÊN. Mở lại bất cứ lúc nào.`,
      { title: '⏸ Ngừng nhập hàng', okText: 'Ngừng nhập' }))) return;
    saveSupplyMeta(id, { status: paused ? 'active' : 'paused' });
    window.toast && window.toast(paused ? '▶ Đã mở lại nhập từ ' + tcName(s.name) : '⏸ Đã ngừng nhập từ ' + tcName(s.name), 'success');
    render();
    window.openSupDrawer(id);   /* vẽ lại drawer để đổi nhãn nút + badge */
  };

  /* ===== XOÁ NCC (không hoàn tác) — cảnh báo nếu còn nợ ===== */
  window.supDelete = async function (id) {
    const s = getSup().find(x => x.id === id); if (!s) return;
    const debt = _supDebt(id);
    let msg = `Xoá hẳn nhà cung cấp "${tcName(s.name)}"?\n\n⚠️ Thao tác KHÔNG hoàn tác.`;
    if (debt > 0) msg += `\n\n❗ NCC này ĐANG CÒN NỢ ${window.fmt(debt)}₫ — nên thanh toán/đối chiếu trước. Cân nhắc "Ngừng nhập" thay vì xoá.`;
    if (window.uiConfirm && !(await window.uiConfirm(msg, { title: '🗑 Xoá nhà cung cấp', okText: 'Xoá hẳn' }))) return;
    window.STORE.remove('suppliers', id);
    window.STORE.rmwKv('supplierMeta', m => { if (m && typeof m === 'object') delete m[id]; return m || {}; }, {});   /* dọn meta nhóm/trạng thái */
    window.closeDrawer && window.closeDrawer();
    window.toast && window.toast('🗑 Đã xoá NCC ' + tcName(s.name), 'success');
    render();
  };

  window.openSupModal = function (id) {
    const s = id ? getSup().find(x => x.id === id) : { id:'NCC' + String(getSup().length+1).padStart(3,'0'),
      name:'', contact:'', phone:'', address:'', category:[], paymentTerm:'COD', debt:0, totalSpend:0, rating:4.5, note:'', active:true };
    const isEdit = !!id;
    const prods = window.STORE.get('products', window.PRODUCTS || []) || [];
    const esc = v => String(v == null ? '' : v).replace(/"/g, '&quot;');
    const normN = v => String(v || '').toLowerCase();
    window.openModal((isEdit?'✏️ Sửa':'+ Thêm') + ' Nhà cung cấp', `
      <div style="background:#EFF6FF;color:#1E40AF;padding:9px 12px;border-radius:7px;font-size:12px;margin-bottom:12px">
        💡 NCC là đối tác cung cấp đầu vào (rau/nấm/hải sản...). Sau khi tạo, vào tab "Phiếu nhập" để ghi nhận từng đợt lấy hàng.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="font-size:12px;color:var(--muted)">Mã NCC</label><input id="sf_id" value="${s.id}" ${isEdit?'disabled':''} style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div><label style="font-size:12px;color:var(--muted)">Tên NCC *</label><input id="sf_name" value="${s.name}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div><label style="font-size:12px;color:var(--muted)">Người liên hệ</label><input id="sf_contact" value="${s.contact}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div><label style="font-size:12px;color:var(--muted)">SĐT</label><input id="sf_phone" value="${s.phone}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">Địa chỉ</label><input id="sf_addr" value="${s.address}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div><label style="font-size:12px;color:var(--muted)">Điều khoản TT ${window.helpTip('Công nợ 30/45 ngày = trả trong 30/45 ngày sau khi nhận hàng.')}</label><select id="sf_term" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"><option value="NET 30" ${s.paymentTerm !== 'NET 45' ? 'selected' : ''}>Công nợ 30 ngày</option><option value="NET 45" ${s.paymentTerm === 'NET 45' ? 'selected' : ''}>Công nợ 45 ngày</option></select></div>
        <div><label style="font-size:12px;color:var(--muted)">Trạng thái nhập hàng ${window.helpTip('Ngừng nhập = KHÔNG hiện ở lệnh gọi hàng của Kho. Lịch sử và công nợ giữ nguyên.')}</label>
          <select id="sf_supplyStatus" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px">
            ${[['active','Đang nhập hàng'],['paused','Ngừng nhập hàng']].map(([v,lb])=>`<option value="${v}" ${supplyStatusOf(s.id)===v?'selected':''}>${lb}</option>`).join('')}
          </select></div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">Loại cung cấp ${window.helpTip('Sỉ = đóng 1 lô lớn theo tổng (vd gom 100kg → đóng 100kg). Lẻ = chia sẵn theo từng khách (vd khách A 20kg, B 30kg...).')}</label>
          <select id="sf_supplyType" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px">
            ${[['si', '📦 Sỉ (đóng 1 lô theo tổng)'], ['le', '🛵 Lẻ (chia sẵn theo từng khách)']].map(([v, lb]) => `<option value="${v}" ${supplyTypeOf(s.id) === v ? 'selected' : ''}>${lb}</option>`).join('')}
          </select></div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">Sản phẩm cung cấp <span style="color:var(--navy);font-weight:600">(${prods.length} SP từ "Sản phẩm &amp; Giá")</span> ${window.helpTip('Danh sách này LẤY TRỰC TIẾP từ module Sản phẩm & Giá. Thêm/bớt SP ở đó thì danh sách này tự cập nhật. Tick SP + nhập giá nhập riêng nếu muốn.')}</label>
          <input id="sf_prodSearch" placeholder="🔍 Gõ tên SP để lọc nhanh..." oninput="window._supFilterProds(this.value)" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px;margin-top:4px">
          <!-- Thanh thao tác hàng loạt: chọn tất cả + đặt giá + bỏ chọn -->
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:6px;padding:7px 9px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:7px;font-size:12px">
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-weight:700;color:#15803D"><input type="checkbox" id="sf_selAll" onclick="window._supToggleAllProds(this.checked)" style="cursor:pointer"> Chọn tất cả <span style="font-weight:400;color:var(--muted)">(đang hiện)</span></label>
            <span id="sf_selCount" style="color:var(--muted)">${(s.products||[]).length} đã chọn</span>
            <div style="flex:1;min-width:6px"></div>
            <input type="number" id="sf_bulkPrice" min="0" step="100" placeholder="giá nhập" style="width:92px;border:1px solid var(--line);border-radius:5px;padding:4px 6px;font-size:12px">
            <button type="button" class="btn btn-ghost btn-sm" style="font-size:11.5px;padding:3px 8px" onclick="window._supBulkPrice()" title="Áp giá nhập cho mọi SP đã tick">💲 Đặt giá cho SP đã tick</button>
            <button type="button" class="btn btn-ghost btn-sm" style="font-size:11.5px;padding:3px 8px;color:var(--danger)" onclick="window._supClearProds()" title="Bỏ tick toàn bộ">✕ Bỏ tick tất cả</button>
            <button type="button" class="btn btn-ghost btn-sm" style="font-size:11.5px;padding:3px 8px;color:#1E40AF;border:1px solid #93C5FD" onclick="window._supModalBulkPaste()" title="Dán 1 cột tên SP từ Sheet → tự tick SP khớp">📋 Dán hàng loạt</button>
          </div>
          <div id="sf_pasteBox" style="display:none;margin-top:8px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:9px">
            <div style="font-size:11.5px;color:#1E40AF;margin-bottom:6px">Dán 1 cột tên SP từ Google Sheet (mỗi dòng 1 SP) → tự <b>tick</b> SP khớp trong danh mục.</div>
            <textarea id="sf_pasteTA" rows="4" placeholder="Cà Chua Đại&#10;Xà Lách Xoăn&#10;..." style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px;resize:vertical"></textarea>
            <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><button type="button" class="btn btn-primary btn-sm" onclick="window._supModalBulkApply()">✓ Tick SP khớp</button><span id="sf_pasteResult" style="font-size:12px"></span></div>
          </div>
          <div id="sf_prodList" style="max-height:210px;overflow:auto;border:1px solid var(--line);border-radius:6px;margin-top:6px;padding:4px">
            ${prods.length ? prods.map(p => {
              const sel = (s.products || []).find(x => x.id === p.id);
              return `<label class="sf-prow" data-name="${esc(normN(p.name))}">
                <input type="checkbox" data-prod="${p.id}" data-pname="${esc(p.name)}" ${sel?'checked':''} onchange="window._supUpdateProdCount()">
                <span>${p.name} <span style="color:var(--muted);font-size:11px">/${p.unit||'kg'}</span></span>
                <input type="number" min="0" step="100" data-pprice="${p.id}" value="${sel&&sel.price?sel.price:''}" placeholder="giá nhập" onclick="event.stopPropagation()">
              </label>`;
            }).join('') : '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">Chưa có sản phẩm nào trong danh mục. Vào "Sản phẩm & Giá" để thêm.</div>'}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px">Tick SP mà NCC này cung cấp · nhập <b>giá nhập riêng</b> từng SP nếu có. <span id="sf_prodCount"></span></div>
        </div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">Ghi chú</label><textarea id="sf_note" rows="2" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px">${s.note||''}</textarea></div>
        <div style="grid-column:span 2"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="sf_active" ${s.active?'checked':''}> Đang hợp tác</label></div>
      </div>
    `, {
      footer:`<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
              <button class="btn btn-primary" onclick="window._supSave(${isEdit?'true':'false'})">${isEdit?'Lưu':'Thêm NCC'}</button>`,
      width:'640px'
    });
  };

  /* Lọc nhanh danh sách SP trong form NCC */
  window._supFilterProds = function (q) {
    const nq = (q || '').toLowerCase().trim();
    document.querySelectorAll('#sf_prodList .sf-prow').forEach(row => {
      row.style.display = (!nq || (row.dataset.name || '').includes(nq)) ? '' : 'none';
    });
  };

  /* ===== Thao tác HÀNG LOẠT sản phẩm cung cấp ===== */
  window._supUpdateProdCount = function () {
    const checked = document.querySelectorAll('#sf_prodList input[data-prod]:checked').length;
    const total = document.querySelectorAll('#sf_prodList input[data-prod]').length;
    const el = document.getElementById('sf_selCount'); if (el) el.textContent = checked + ' đã chọn';
    /* tick "chọn tất cả" nếu mọi dòng ĐANG HIỆN đều đã tick */
    const visible = [...document.querySelectorAll('#sf_prodList .sf-prow')].filter(r => r.style.display !== 'none');
    const visChecked = visible.filter(r => r.querySelector('input[data-prod]')?.checked).length;
    const sa = document.getElementById('sf_selAll'); if (sa) sa.checked = visible.length > 0 && visChecked === visible.length;
  };
  /* Tick / bỏ tick tất cả SP ĐANG HIỆN (tôn trọng bộ lọc tìm) */
  window._supToggleAllProds = function (on) {
    document.querySelectorAll('#sf_prodList .sf-prow').forEach(row => {
      if (row.style.display === 'none') return;
      const cb = row.querySelector('input[data-prod]'); if (cb) cb.checked = on;
    });
    window._supUpdateProdCount();
  };
  /* Bỏ tick toàn bộ (kể cả đang ẩn do lọc) */
  window._supClearProds = function () {
    document.querySelectorAll('#sf_prodList input[data-prod]:checked').forEach(cb => { cb.checked = false; });
    window._supUpdateProdCount();
  };
  /* Dán hàng loạt trong modal Sửa NCC → tự TICK SP khớp tên (không phân biệt hoa/dấu) */
  window._supModalBulkPaste = function () {
    const b = document.getElementById('sf_pasteBox'); if (!b) return;
    b.style.display = b.style.display === 'none' ? 'block' : 'none';
    if (b.style.display === 'block') { const t = document.getElementById('sf_pasteTA'); if (t) t.focus(); }
  };
  window._supModalBulkApply = function () {
    const ta = document.getElementById('sf_pasteTA'); if (!ta) return;
    const names = ta.value.split(/[\n\r]+/).map(x => x.replace(/\t.*$/, '').trim()).filter(Boolean);
    if (!names.length) return;
    const want = new Set(names.map(_pn));
    const matched = new Set();
    let ticked = 0, already = 0;
    document.querySelectorAll('#sf_prodList .sf-prow input[data-prod]').forEach(cb => {
      const rn = _pn(cb.getAttribute('data-pname') || '');
      if (want.has(rn)) { matched.add(rn); if (cb.checked) already++; else { cb.checked = true; ticked++; } }
    });
    const notfound = names.filter(n => !matched.has(_pn(n)));
    window._supUpdateProdCount && window._supUpdateProdCount();
    const res = document.getElementById('sf_pasteResult');
    if (res) res.innerHTML = `<b style="color:#15803D">✓ Tick thêm ${ticked}</b>${already ? ` · sẵn ${already}` : ''}${notfound.length ? ` · <b style="color:#B45309">${notfound.length} ngoài danh mục</b>` : ''}`;
  };
  /* Đặt 1 giá nhập cho MỌI SP đã tick (để trống ô giá = xoá giá) */
  window._supBulkPrice = function () {
    const raw = (document.getElementById('sf_bulkPrice') || {}).value;
    const v = parseInt(raw, 10) || 0;
    const checked = [...document.querySelectorAll('#sf_prodList input[data-prod]:checked')];
    if (!checked.length) { window.toast('Chưa tick SP nào — tick các SP cần đặt giá trước', 'warn'); return; }
    let n = 0;
    checked.forEach(cb => {
      const priceEl = document.querySelector('#sf_prodList [data-pprice="' + cb.dataset.prod + '"]');
      if (priceEl) { priceEl.value = v > 0 ? v : ''; n++; }
    });
    window.toast(`✓ Đặt giá ${v > 0 ? window.fmt(v) + 'đ' : '(trống)'} cho ${n} SP đã tick`, 'success');
  };

  window._supSave = function (isEdit) {
    /* Đọc sản phẩm NCC cung cấp + giá nhập riêng từng SP */
    const products = [...document.querySelectorAll('#sf_prodList input[data-prod]:checked')].map(cb => {
      const pid = cb.dataset.prod;
      const priceEl = document.querySelector('#sf_prodList [data-pprice="' + pid + '"]');
      return { id: pid, name: cb.dataset.pname, price: +(priceEl && priceEl.value) || 0 };
    });
    const obj = {
      id: document.getElementById('sf_id').value,
      name: document.getElementById('sf_name').value.trim(),
      contact: document.getElementById('sf_contact').value.trim(),
      phone: document.getElementById('sf_phone').value.trim(),
      address: document.getElementById('sf_addr').value.trim(),
      products: products,
      paymentTerm: document.getElementById('sf_term').value,
      /* `rating` không còn hiện trên giao diện — giữ nguyên giá trị cũ trong DB, không xoá cột */
      note: document.getElementById('sf_note').value,
      active: document.getElementById('sf_active').checked,
    };
    if (!obj.name) { window.toast('Nhập tên NCC','warn'); return; }
    /* Loại sỉ/lẻ + trạng thái nhập → kv supplierMeta (bảng suppliers không có 2 cột này) */
    const _stEl = document.getElementById('sf_supplyType');
    const _ssEl = document.getElementById('sf_supplyStatus');
    const _patch = {};
    if (_stEl) _patch.type = _stEl.value;
    if (_ssEl) _patch.status = _ssEl.value;
    if (Object.keys(_patch).length) saveSupplyMeta(obj.id, _patch);
    const list = getSup();
    if (isEdit) {
      const idx = list.findIndex(x => x.id === obj.id);
      if (idx < 0) {
        /* Không tìm thấy (id lệch) → thêm mới thay vì ghi list[-1] */
        obj.debt = obj.debt || 0; obj.totalSpend = obj.totalSpend || 0;
        list.push(obj);
      } else {
        list[idx] = { ...list[idx], ...obj };
      }
    } else {
      obj.debt = 0; obj.totalSpend = 0;
      obj.rating = 5;   /* cột `rating` vẫn còn trong DB (đã ẩn khỏi giao diện) — đừng ghi null */
      list.push(obj);
    }
    window.STORE.set('suppliers', list);
    if (window.audit) window.audit.log(isEdit ? 'supplier.update' : 'supplier.create', obj.name);
    window.toast(isEdit ? '✓ Đã cập nhật NCC' : '✓ Đã thêm NCC', 'success');
    window.closeModal();
    if (typeof closeDrawer === 'function') closeDrawer();
    render();
  };

  /* Thanh toán NCC — popup nhập số tiền (công nợ DẪN XUẤT, chỉ ghi phiếu chi) */
  window.paySupplier = function (id) {
    const s = getSup().find(x => x.id === id) || { name: id };
    const debt = _supDebt(id);
    if (!(debt > 0)) { window.toast && window.toast('NCC này không còn nợ', 'info'); return; }
    const _i = 'width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:10px;font-size:16px;margin-top:4px';
    window.openModal('💵 Thanh toán công nợ — ' + escH(s.name), `
      <div style="font-size:13px;margin-bottom:10px">Đang nợ: <b style="color:#DC2626">${window.fmt(debt)}₫</b></div>
      <label style="font-size:12px;color:var(--muted)">Số tiền trả (₫)</label>
      <input id="supPayAmt" type="number" inputmode="numeric" value="${debt}" style="${_i}">
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('supPayAmt').value=${debt}">Trả hết</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('supPayAmt').value=${Math.round(debt / 2)}">Trả 50%</button>
      </div>
    `, { width: '420px', footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button><button class="btn btn-primary" onclick="window._supDoPay('${id}')">💵 Ghi thanh toán</button>` });
  };
  window._supDoPay = function (id) {
    const s = getSup().find(x => x.id === id) || { name: id };
    const debt = _supDebt(id);
    let amt = parseFloat(String((document.getElementById('supPayAmt') || {}).value || '').replace(/[^\d.]/g, '')) || 0;
    amt = Math.min(Math.max(0, Math.round(amt)), debt);
    if (!(amt > 0)) { window.toast && window.toast('Nhập số tiền > 0', 'warn'); return; }
    const cash = getCash();
    const _pcMax = cash.reduce((m, e) => { const n = parseInt(String(e.no || '').replace(/^PC/, ''), 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
    cash.unshift({ no: 'PC' + String(_pcMax + 1).padStart(4, '0'), date: window.todayVN(), type: 'out', amount: amt, account: 'Tiền mặt', supplierId: id, party: s.name, desc: 'Thanh toán công nợ NCC ' + id, staff: (window.CURRENT_USER && window.CURRENT_USER.name) || '' });
    window.STORE.set('cashEntries', cash);
    if (window.audit) window.audit.log('supplier.pay', `Trả ${window.fmt(amt)} ₫ cho ${s.name}`);
    const remainAfter = _supDebt(id);
    window.toast && window.toast('✓ Đã ghi phiếu chi ' + window.fmt(amt) + ' ₫' + (remainAfter > 0 ? ' · còn nợ ' + window.fmt(remainAfter) : ' · hết nợ'), 'success');
    window.closeModal && window.closeModal();
    render();
  };

  /* Lịch sử thanh toán 1 NCC — các lần trả (ngày/tiền) + đợt nhập (tuổi nợ 30–45 ngày) */
  window.supPayHistory = function (id) {
    const s = getSup().find(x => x.id === id) || { name: id };
    const nm = s.name, f = v => (Math.round(+v || 0)).toLocaleString('vi-VN');
    const cash = getCash().filter(e => e && e.type === 'out' && (e.supplierId === id || e.party === nm || (e.desc && String(e.desc).includes(id)))).sort((a, b) => (_dmyToISO(a.date) < _dmyToISO(b.date) ? 1 : -1));
    const nhap = _supNhap(id), paid = _supPaidCash(id), claims = _supClaims(id), remain = _supDebt(id);
    const phieu = getPur().filter(p => p.status === 'received' && p.supplierId === id).sort((a, b) => (_dmyToISO(a.date) < _dmyToISO(b.date) ? -1 : 1));
    const today = window.todayISO ? window.todayISO() : new Date().toISOString().slice(0, 10);
    const ageOf = iso => iso ? Math.round((new Date(today + 'T00:00:00') - new Date(iso + 'T00:00:00')) / 86400000) : 0;
    const payHtml = cash.length ? cash.map(e => `<tr style="border-top:1px solid #F1F5F9"><td style="padding:5px 8px">${escH(e.date)}</td><td style="padding:5px 8px">${escH(e.no || '')}</td><td style="padding:5px 8px;text-align:right;font-weight:700;color:#15803D">${f(e.amount)}₫</td></tr>`).join('') : '<tr><td colspan="3" style="padding:12px;text-align:center;color:var(--muted)">Chưa có lần thanh toán nào</td></tr>';
    const nhapHtml = phieu.length ? phieu.map(p => { const dd = ageOf(_dmyToISO(p.date)); const c = dd >= 45 ? '#DC2626' : dd >= 30 ? '#B45309' : 'var(--muted)'; return `<tr style="border-top:1px solid #F1F5F9"><td style="padding:5px 8px">${escH(p.date)}</td><td style="padding:5px 8px"><a href="purchases.html?focus=${encodeURIComponent(p.id)}" target="_blank" style="color:var(--navy);text-decoration:none;border-bottom:1px dotted var(--navy)">${escH(p.id)} ↗</a></td><td style="padding:5px 8px;text-align:right">${f(p.total)}₫</td><td style="padding:5px 8px;text-align:right;color:${c};font-size:11.5px">${dd} ngày${dd >= 30 ? ' ⚠' : ''}</td></tr>`; }).join('') : '<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--muted)">Chưa có đợt nhập</td></tr>';
    window.openModal('📜 Lịch sử thanh toán — ' + escH(nm), `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <div style="flex:1;min-width:100px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:8px 10px"><div style="font-size:10.5px;color:var(--muted)">Tổng nhập</div><div style="font-weight:800">${f(nhap)}₫</div></div>
        <div style="flex:1;min-width:100px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:8px 10px"><div style="font-size:10.5px;color:var(--muted)">Đã trả</div><div style="font-weight:800;color:#15803D">${f(paid)}₫</div></div>
        ${claims ? `<div style="flex:1;min-width:100px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:8px 10px"><div style="font-size:10.5px;color:var(--muted)">Trừ trả hàng</div><div style="font-weight:800;color:#B45309">−${f(claims)}₫</div></div>` : ''}
        <div style="flex:1;min-width:100px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px 10px"><div style="font-size:10.5px;color:var(--muted)">Còn nợ</div><div style="font-weight:800;color:#DC2626">${f(remain)}₫</div></div>
      </div>
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;margin:2px 0 4px">💵 Lịch sử thanh toán (${cash.length} lần)</div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:14px"><thead><tr style="background:#F0FDF4;color:var(--muted);font-size:11px"><th style="padding:6px 8px;text-align:left">Ngày trả</th><th style="padding:6px 8px;text-align:left">Số PC</th><th style="padding:6px 8px;text-align:right">Số tiền</th></tr></thead><tbody>${payHtml}</tbody></table>
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;margin:2px 0 4px">📦 Các đợt nhập (cũ → mới) · tuổi nợ</div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;border:1px solid var(--line);border-radius:8px;overflow:hidden"><thead><tr style="background:#F8FAF8;color:var(--muted);font-size:11px"><th style="padding:6px 8px;text-align:left">Ngày nhập</th><th style="padding:6px 8px;text-align:left">Mã phiếu</th><th style="padding:6px 8px;text-align:right">Tiền nhập</th><th style="padding:6px 8px;text-align:right">Tuổi nợ</th></tr></thead><tbody>${nhapHtml}</tbody></table>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">⚠ Tuổi nợ ≥ 30 ngày (vàng), ≥ 45 ngày (đỏ) — NCC thường thanh toán ở 30–45 ngày.</div>
    `, { width: '620px', footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>${remain > 0 ? `<button class="btn btn-primary" onclick="window.closeModal();window.paySupplier('${id}')">💵 Thanh toán</button>` : ''}` });
  };

  window.exportSupCsv = function () {
    const list = getSup();
    const head = 'Mã,Tên,Liên hệ,SĐT,Địa chỉ,Nhóm hàng,Điều khoản,Nợ,Lifetime spend,Đánh giá,Ghi chú\n';
    const rows = list.map(s => [s.id, `"${s.name}"`, `"${s.contact}"`, s.phone, `"${s.address}"`, `"${(s.category||[]).join(';')}"`, s.paymentTerm, _supDebt(s.id), s.totalSpend, s.rating, `"${(s.note||'').replace(/"/g,'""')}"`].join(','));
    const blob = new Blob(['﻿'+head+rows.join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `nha-cung-cap-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  /* Init */
  window.renderAppShell('suppliers', 'Nhà cung cấp');
  document.getElementById('hbHost').innerHTML = window.helpBanner(
    '🏭 Module Nhà cung cấp làm gì?',
    'Quản lý danh bạ NCC đầu vào (HTX rau, trang trại, vựa hải sản...). Theo dõi <b>công nợ phải trả</b> + lịch sử nhập + đánh giá chất lượng. Khi tạo phiếu nhập, công nợ tự cộng — khi ghi thanh toán, công nợ tự trừ.',
    {id:'hb-sup', icon:'🏭'}
  );
  document.getElementById('hbTitle').innerHTML = window.helpTip('NCC khác Khách hàng: NCC là người bán cho mình, KH là người mua từ mình. Mã NCC bắt đầu bằng NCC.', {size:'lg'});

  /* Tìm kiếm nay nằm TRONG từng nhóm (supFilterPanel), không còn ô tổng ở toolbar */
  window.STORE.get('cashEntries', []); window.STORE.get('supplierClaims', []);   /* warm-load cho công nợ dẫn xuất */
  ['suppliers','purchases','cashEntries','supplierClaims'].forEach(k => window.STORE.subscribe(k, render));
  /* Preload SẢN PHẨM (cho bộ chọn SP trong form NCC) — lấy từ module Sản phẩm & Giá.
     Gọi sớm để cloud sync xong trước khi user mở form. */
  window.STORE.get('products', window.PRODUCTS || []);
  window.STORE.subscribe('products', () => {});  /* giữ products cache cập nhật realtime */
  render();

  /* ============ BULK IMPORT NCC ============ */
  function _supSaveImported(records, src) {
    const list = getSup();
    let added = 0;
    records.forEach((r, i) => {
      if (!r.name || !String(r.name).trim()) return;
      list.push({
        id: 'NCC' + String(list.length + 1 + i).padStart(3, '0'),
        name: r.name, contact: r.contact || '', phone: r.phone || '',
        address: r.address || '',
        category: r.category ? String(r.category).split(/[,;]/).map(s=>s.trim()).filter(Boolean) : [],
        paymentTerm: r.paymentTerm || 'COD',
        debt: 0, totalSpend: 0,
        rating: parseFloat(r.rating) || 4.5,
        note: r.note || ('Import từ ' + src),
        active: true,
      });
      added++;
    });
    window.STORE.set('suppliers', list);
    window.audit && window.audit.log('supplier.bulkImport', `+${added} NCC từ ${src}`);
    window.toast(`✓ Đã thêm ${added} NCC từ ${src}`, 'success');
  }

  window.supImportExcel = function() {
    window.BulkImport.fromExcel({
      entityName: 'Nhà cung cấp',
      templateColumns: ['name','contact','phone','address','category','paymentTerm','rating','note'],
      templateRow: ['HTX Rau Vân Nội','Anh Hùng','0912000001','Đông Anh, Hà Nội','rau-ta','NET 7','4.8','NCC chính rau ta'],
      mapRow: (row, headers) => ({
        name:row[0], contact:row[1], phone:row[2], address:row[3],
        category:row[4], paymentTerm:row[5] || 'COD',
        rating:row[6], note:row[7]
      }),
      onParsed: (recs) => _supSaveImported(recs, 'Excel'),
    });
  };
  window.supImportAI = function() {
    window.BulkImport.fromImage({
      entityName: 'Nhà cung cấp',
      promptHint: 'danh thiếp NCC / list contact / màn hình chat với NCC',
      fields: ['name','contact','phone','address','category','paymentTerm','note'],
      aiTask: 'customer',
      onParsed: (recs) => _supSaveImported(recs, 'Ảnh AI'),
    });
  };
})();
