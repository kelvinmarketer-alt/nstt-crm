/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Trang Quản lý Khách hàng
   ========================================================= */
(function () {
  /* === Maps === */
  const STAFF_MAP = {
    KH001:'Trần Lan', KH002:'Tuấn Tú', KH003:'Trần Lan', KH004:'Hoàng Mai',
    KH005:'Phạm Hùng', KH006:'Phạm Hùng', KH007:'Tuấn Tú', KH008:'Phạm Hùng',
    KH009:'Trần Lan', KH010:'Phạm Hùng',
  };
  const LAST_CONTACT_MAP = {
    KH001:'12/05/2026', KH002:'15/05/2026', KH003:'14/05/2026', KH004:'16/05/2026',
    KH005:'10/05/2026', KH006:'08/05/2026', KH007:'11/05/2026', KH008:'14/05/2026',
    KH009:'10/01/2026', KH010:'15/05/2026',
  };
  /* === Helpers loại hình KH + tần suất + nhóm hàng === */
  function typeMeta(id) {
    return (window.MD.get('custTypes') || []).find(t => t.id === id) || { id: id, label: id || '—', color: '#6B7280' };
  }
  function freqLabel(id) {
    const f = (window.MD.get('orderFreq') || []).find(x => x.id === id);
    return f ? f.label : (id || '—');
  }
  function catLabels(ids) {
    const cats = window.SERVICE_TYPES || window.PRODUCT_CATEGORIES || [];
    return (ids || []).map(id => { const c = cats.find(x => x.id === id); return c ? (c.icon + ' ' + c.label) : id; }).join(', ') || '—';
  }
  window._custTypeMeta = typeMeta;

  /* Render Zalo/FB thành link an toàn: nhận SĐT / handle / URL → thẻ <a>. Escape nhãn chống XSS. */
  function _socialLink(kind, val) {
    val = (val || '').toString().trim();
    if (!val) return '<span class="empty">(chưa có)</span>';
    let href = val;
    if (!/^https?:\/\//i.test(val)) {
      if (kind === 'zalo') href = 'https://zalo.me/' + val.replace(/\s/g, '');
      else href = 'https://facebook.com/' + val.replace(/^@/, '').replace(/\s/g, '');
    }
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const label = val.length > 30 ? val.slice(0, 28) + '…' : val;
    return `<a href="${esc(href)}" target="_blank" rel="noopener" style="color:#339B21;text-decoration:none">${esc(label)} ↗</a>`;
  }

  /* Decorate: thêm field thiếu / chuẩn hoá schema cho mock data */
  function decorate(c) {
    return {
      ...c,
      staffOwner: c.staffOwner || STAFF_MAP[c.id] || 'Hoàng Mai',
      lastContact: c.lastContact || LAST_CONTACT_MAP[c.id] || c.lastOrder,
      zalo: c.zalo || (c.phone || '').replace(/\s/g, ''),
      type: c.type || 'nha-hang',
      orderFreq: c.orderFreq || 'hang-tuan',
      mainCats: c.mainCats || [],
    };
  }

  /* Load qua STORE (auto persist) */
  const initialData = (window.CUSTOMERS || []).map(decorate);
  let customers = window.STORE.get('customers', initialData);
  /* ❌ ĐÃ BỎ migration cũ (v369): nó XOÁ SẠCH danh sách khi thấy type='B2B'/'B2C' — nhưng nay
     có 42 KH thật để type 'B2B' + seed rỗng (window.CUSTOMERS=[]) → mỗi lần vào trang KH bị ghi
     đè về [] = "0 khách, phải bấm nhiều lần". Cloud là nguồn chuẩn, KHÔNG re-seed/wipe nữa. */
  /* Nếu đã từng load thì decorate lại đề phòng schema thay đổi */
  customers.forEach((c, i) => customers[i] = decorate(c));

  /* ============ ROW-LEVEL SCOPE: Sale chỉ thấy KH mình phụ trách ============
     Vai trò "xem tất cả" (admin/kế toán/nhân sự/marketing) → giữ nguyên cả danh sách.
     Vai trò bị giới hạn (Sale, CSKH...) → chỉ KH có staffOwner = chính mình. */
  function scopeCustomers(arr) {
    try {
      const A = window.AUTH;
      if (A && typeof A.seesAllCustomers === 'function' && !A.seesAllCustomers()) {
        const u = A.currentUser ? A.currentUser() : null;
        const myName = ((u && u.name) || (window.CURRENT_USER && window.CURRENT_USER.name) || '').toString().trim().toLowerCase();
        const myId = u && u.staffId;
        return (arr || []).filter(c => {
          const owner = (c.staffOwner || '').toString().trim().toLowerCase();
          return (myName && owner === myName) || (myId && ((c.staffOwnerId === myId) || ((c.staffOwner || '') === myId)));
        });
      }
    } catch (e) { console.warn('[customers scope]', e); }
    return arr || [];
  }
  /* Có đang bị giới hạn không (để khoá ô "NV phụ trách" + ép chủ sở hữu khi tạo) */
  function isScoped() {
    const A = window.AUTH;
    return !!(A && typeof A.seesAllCustomers === 'function' && !A.seesAllCustomers());
  }
  function myName() {
    const A = window.AUTH; const u = A && A.currentUser && A.currentUser();
    return (u && u.name) || (window.CURRENT_USER && window.CURRENT_USER.name) || '';
  }

  /* ====== SỔ CÔNG NỢ THẬT theo ngày (thay bảng giả) ======
     Lấy từ debtLedger (phát sinh từ đơn giao + phiếu thu). Số dư đầu kỳ tự khớp về c.debt
     để chạy số luôn kết thúc đúng tổng nợ hiện tại — kể cả khi sổ bắt đầu giữa chừng. */
  function renderDebtLedger(c) {
    const dtb = document.querySelector('#debtTable tbody');
    if (!dtb) return;
    const fmt = window.fmt;
    const ledger = (window.getDebtLedger ? window.getDebtLedger(c.id) : []).slice()
      .sort((a, b) => (a.ts || '') < (b.ts || '') ? -1 : 1);   /* cũ → mới */
    const totalDebt = +c.debt || 0;
    if (!ledger.length && totalDebt <= 0) {
      dtb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--ok)">✓ Không có công nợ.</td></tr>`;
      return;
    }
    const sumCharge = ledger.filter(e => e.type === 'charge').reduce((s, e) => s + (+e.amount || 0), 0);
    const sumMinus = ledger.filter(e => e.type !== 'charge').reduce((s, e) => s + (+e.amount || 0), 0);
    let bal = totalDebt - sumCharge + sumMinus;   /* số dư đầu kỳ */
    let rows = `<tr style="color:var(--muted)"><td>—</td><td>—</td><td><i>Số dư đầu kỳ</i></td><td class="num">—</td><td class="num">—</td><td class="num"><b>${fmt(Math.round(bal))}</b></td></tr>`;
    ledger.forEach(e => {
      const isCharge = e.type === 'charge';
      bal += isCharge ? (+e.amount || 0) : -(+e.amount || 0);
      rows += `<tr>
        <td>${e.date || ''}</td>
        <td style="font-family:ui-monospace,monospace;font-size:11px">${e.ref || '—'}</td>
        <td>${e.desc || (isCharge ? 'Phát sinh nợ' : 'Trả nợ')}</td>
        <td class="num" style="color:#B91C1C">${isCharge ? fmt(+e.amount || 0) : '—'}</td>
        <td class="num" style="color:#15803D">${!isCharge ? fmt(+e.amount || 0) : '—'}</td>
        <td class="num"><b>${fmt(Math.round(bal))}</b></td>
      </tr>`;
    });
    rows += `<tr style="background:#FEFBF3"><td><b>Hiện tại</b></td><td>—</td><td><b>Còn nợ</b></td><td class="num">—</td><td class="num">—</td><td class="num" style="color:var(--warn);font-weight:800">${fmt(totalDebt)}</td></tr>`;
    dtb.innerHTML = rows;
  }

  let currentQuick = 'all';
  let curPage = 1;
  let pageSize = 25;

  const tbody = document.getElementById('tbody');
  const rowCount = document.getElementById('rowCount');
  const footCount = document.getElementById('footCount');

  /* ============ STATS ĐỘNG: số đơn / doanh thu / công nợ tính TRỰC TIẾP từ module ĐƠN HÀNG ============
     Field orders/revenue/debt lưu trên hồ sơ KH đã cũ (=0). Luôn tính lại từ orders + debtLedger
     để trang KH KHỚP với Đơn hàng. KHÔNG ghi ngược về catalog/bảng giá. */
  let _cstats = {};
  function _ordDate(o) {
    const raw = o.deliverDate || o.createdAt || o.date || '';
    let m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
  }
  function _overdueFromCredits(id, credits, paid) {
    if (!credits || !credits.length) return 0;
    const days = (window.custCreditDays ? (+window.custCreditDays(id) || 0) : 0) || 7;
    const now = (window.todayDate ? window.todayDate() : new Date());
    const sorted = credits.slice().sort((a, b) => (a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0));
    let remain = paid, overdue = 0;
    sorted.forEach(cr => {
      let amt = cr.amount;
      if (remain > 0) { const used = Math.min(remain, amt); amt -= used; remain -= used; }
      if (amt > 0 && cr.date) { const age = (now - cr.date) / 86400000; if (age > days) overdue += amt; }
    });
    return Math.round(overdue);
  }
  let _lastOrdersRef = null, _lastLedgerRef = null;
  function rebuildCustStats() {
    const orders = window.STORE.get('orders', window.ORDERS || []) || [];
    const ledger = window.STORE.get('debtLedger', []) || [];
    /* MEMO: chỉ duyệt lại 900+ đơn khi mảng orders/ledger THỰC SỰ đổi (merge cloud thay reference).
       Render do tìm/lọc/phân trang KHÔNG đổi data → dùng lại _cstats (khỏi lặp nặng → hết giật/chậm). */
    if (orders === _lastOrdersRef && ledger === _lastLedgerRef && _cstats && Object.keys(_cstats).length) return;
    _lastOrdersRef = orders; _lastLedgerRef = ledger;
    const m = {};
    const g = id => m[id] || (m[id] = { orders: 0, revenue: 0, charge: 0, paid: 0, credits: [] });
    orders.forEach(o => {
      if (o.status === 'draft' || o.status === 'cancelled') return;
      const id = o.cust || o.custId; if (!id) return;
      const s = g(id);
      s.orders++;
      const amt = +o.freight || 0;
      s.revenue += amt;
      /* công nợ chỉ tính đơn trả bằng Công nợ (credit) */
      if (/nợ|cong no|credit/i.test(o.payBy || o.pay_by || '')) { s.charge += amt; s.credits.push({ date: _ordDate(o), amount: amt }); }
    });
    ledger.forEach(e => { const id = e.custId; if (id && e.type === 'payment') g(id).paid += +e.amount || 0; });
    Object.keys(m).forEach(id => { const s = m[id]; s.debt = Math.max(0, s.charge - s.paid); s.debtOverdue = _overdueFromCredits(id, s.credits, s.paid); });
    _cstats = m;
  }
  /* Ghi đè (trong RAM) số liệu hiển thị của KH = số tính từ đơn, RỒI ghi ngược cloud nếu lệch */
  function enrichCustomerStats() {
    /* orders CHƯA về (đang preload) → GIỮ số đã lưu trên KH (từ cloud), ĐỪNG ghi đè 0.
       → danh sách KH + số liệu hiện NGAY khi customers về, không phải chờ tải hết 900 đơn. */
    const ordersReady = !window.STORE.isPreloaded || window.STORE.isPreloaded('orders');
    if (!ordersReady) return;
    rebuildCustStats();
    (customers || []).forEach(c => {
      const s = _cstats[c.id];
      c.orders = s ? s.orders : 0;
      c.revenue = s ? s.revenue : 0;
      c.debt = s ? s.debt : 0;
      c.debtOverdue = s ? s.debtOverdue : 0;
    });
    persistCustStatsToCloud();
  }

  /* Ghi số đã tính (đơn/doanh thu/công nợ/quá hạn) NGƯỢC lại bảng customers trên cloud,
     CHỈ khi khác số đang lưu → bảng thô luôn đúng (web/export đọc trực tiếp không còn thấy 0).
     Tự hội tụ: ghi xong snapshot khớp → lần sau bỏ qua, KHÔNG gây vòng lặp realtime.
     So sánh với cloudSnapshot (số cloud thật), KHÔNG so với cache (đã bị RAM ghi đè). */
  let _lastPersistAt = 0;
  const _persistSig = {};   /* id -> chữ ký đã push trong phiên (chặn push trùng khi đang bay) */
  function persistCustStatsToCloud() {
    try {
      if (!window.STORE || !window.STORE.cloudSnapshot) return;
      if (!(window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.mode === 'supabase' && window.SB_DATA)) return;
      const now = Date.now();
      if (now - _lastPersistAt < 4000) return;   /* throttle: tối đa ~1 lần / 4 giây */
      const snap = window.STORE.cloudSnapshot('customers');
      if (!Array.isArray(snap)) return;           /* chưa có snapshot cloud → chờ sync xong */
      _lastPersistAt = now;
      const byId = {}; snap.forEach(r => { if (r && r.id != null) byId[r.id] = r; });
      let pushed = 0;
      (customers || []).forEach(c => {
        const cur = byId[c.id]; if (!cur) return;   /* chỉ cập nhật KH đã có trên cloud */
        const o = +c.orders || 0, rev = +c.revenue || 0, d = +c.debt || 0, ov = +c.debtOverdue || 0;
        const same = (+cur.orders || 0) === o && (+cur.revenue || 0) === rev
                  && (+cur.debt || 0) === d && (+cur.debtOverdue || 0) === ov;
        if (same) return;
        const sig = o + '|' + rev + '|' + d + '|' + ov;
        if (_persistSig[c.id] === sig) return;      /* đã push số này rồi, đang chờ realtime về */
        _persistSig[c.id] = sig;
        window.STORE.update('customers', c.id, { orders: o, revenue: rev, debt: d, debtOverdue: ov });
        pushed++;
      });
      if (pushed) console.log('[custStats→cloud] đồng bộ', pushed, 'KH');
    } catch (e) { console.warn('[persistCustStatsToCloud]', e); }
  }

  /* ============ Helper: cập nhật số đếm chip ============ */
  function updateChipCounts() {
    customers = scopeCustomers(window.STORE.get('customers', initialData));
    enrichCustomerStats();
    const counts = {
      all:   customers.length,
      b2b:   customers.filter(c => c.type !== 'ca-nhan').length,
      b2c:   customers.filter(c => c.type === 'ca-nhan').length,
      vip:   customers.filter(c => c.group === 'VIP').length,
      debt:  customers.filter(c => c.debt > 0).length,
      new:   customers.filter(c => c.group === 'Mới').length,
      inact: customers.filter(c => !c.active || c.group === 'Inactive').length,
    };
    const QUICK_LABELS = { all:'Tất cả', b2b:'🍽 Cơ sở KD', b2c:'👤 Cá nhân', vip:'⭐ VIP', debt:'⚠️ Có công nợ', new:'✨ Mới 30 ngày', inact:'💤 Không hoạt động' };
    Object.keys(counts).forEach(k => {
      const el = document.querySelector(`[data-cnt="${k}"]`);
      if (el) el.textContent = counts[k];
      const opt = document.querySelector(`#quickSelect option[value="${k}"]`);
      if (opt) opt.textContent = `${QUICK_LABELS[k] || k} (${counts[k]})`;
    });
    /* === Cập nhật KPI cards + sub-header (động từ data thật) === */
    const debtSum = customers.reduce((s, c) => s + (+c.debt || 0), 0);
    const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setTxt('kpiCustTotal', counts.all);
    setTxt('kpiCustNew',   counts.new);
    setTxt('kpiCustDebt',  counts.debt);
    setTxt('kpiCustVip',   counts.vip);
    setTxt('kpiCustInact', counts.inact);
    setTxt('kpiCustNewTrend', `+${counts.new} nhóm "Mới"`);
    setTxt('kpiCustDebtSum', `↓ Tổng ${window.fmtShort ? window.fmtShort(debtSum) : debtSum} ₫`);
    setTxt('custSubHead', `Theo dõi ${counts.all} khách hàng`);
  }

  /* ============ Render pagination ============ */
  function renderPager(total) {
    const pager = document.getElementById('custPager');
    if (!pager) return;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (curPage > totalPages) curPage = totalPages;
    let html = `<button ${curPage <= 1 ? 'disabled' : ''} onclick="window._custGoPage(${curPage - 1})">‹</button>`;
    /* Smart paginator: show first 1, last, current ±1 */
    const pages = new Set([1, totalPages, curPage - 1, curPage, curPage + 1]);
    const sorted = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    let prev = 0;
    sorted.forEach(p => {
      if (p - prev > 1) html += `<span style="padding:0 4px;color:var(--muted)">…</span>`;
      html += `<button class="${p === curPage ? 'active' : ''}" onclick="window._custGoPage(${p})">${p}</button>`;
      prev = p;
    });
    html += `<button ${curPage >= totalPages ? 'disabled' : ''} onclick="window._custGoPage(${curPage + 1})">›</button>`;
    pager.innerHTML = html;
  }
  window._custGoPage = function (p) { curPage = p; render(); };

  /* ============ RENDER ============ */
  function render() {
    customers = scopeCustomers(window.STORE.get('customers', initialData));
    updateChipCounts();
    populateStaffFilter();
    const rows = customers.filter(c => quickMatch(c) && filterMatch(c) && searchMatch(c))
      /* SẮP XẾP: khách thêm gần nhất LÊN ĐẦU (mã KH lớn = tạo sau, cloud-aware tăng dần) */
      .sort((a, b) => {
        const na = parseInt(String(a.id || a.code || '').replace(/\D/g, ''), 10) || 0;
        const nb = parseInt(String(b.id || b.code || '').replace(/\D/g, ''), 10) || 0;
        return nb - na;
      });
    rowCount.textContent = `Đang hiển thị ${rows.length} / ${customers.length} khách hàng`;

    /* Phân trang */
    const ps = document.getElementById('custPageSize');
    if (ps) pageSize = parseInt(ps.value) || 25;
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (curPage > totalPages) curPage = totalPages;
    const slice = rows.slice((curPage - 1) * pageSize, curPage * pageSize);
    footCount.textContent = slice.length;
    renderPager(rows.length);

    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="12" style="padding:40px;text-align:center;color:var(--muted)">Không có khách hàng nào khớp bộ lọc.</td></tr>`;
      return;
    }

    /* ⚠️ Cảnh báo TRÙNG ĐỊA CHỈ — tính ĐỘNG từ địa chỉ, KHÔNG ghi gì vào dữ liệu KH.
       Quét toàn bộ KH (không theo scope) để bắt cả trùng chéo giữa các NV.
       Bỏ qua các cặp ĐÃ XÁC NHẬN "không trùng" (KV addrDupOk) → xác nhận 1 lần, không hỏi lại. */
    const _okSet = new Set(window.STORE.get('addrDupOk', []) || []);
    const _allC = window.STORE.get('customers', []) || [];
    const _dupMap = {};
    for (let i = 0; i < _allC.length; i++) {
      for (let j = i + 1; j < _allC.length; j++) {
        if (_okSet.has(_pairKey(_allC[i].id, _allC[j].id))) continue;   /* đã xác nhận → bỏ */
        if (_addrLooksSame(_allC[i].address, _allC[j].address)) {
          (_dupMap[_allC[i].id] || (_dupMap[_allC[i].id] = [])).push(_allC[j].code || _allC[j].id);
          (_dupMap[_allC[j].id] || (_dupMap[_allC[j].id] = [])).push(_allC[i].code || _allC[i].id);
        }
      }
    }

    tbody.innerHTML = slice.map(c => {
      const ava = window.initials(c.name);
      const col = window.avatarColor(c.id);
      const _twins = _dupMap[c.id];
      const dupBadge = _twins
        ? ` <span onclick="event.stopPropagation();window.reviewAddrDup('${c.id}')" title="Trùng địa chỉ với: ${_twins.join(', ')} — bấm để xem / xác nhận không trùng" style="display:inline-block;margin-left:4px;padding:0 6px;border-radius:8px;background:#FEF3C7;color:#B45309;font-size:10px;font-weight:700;vertical-align:middle;cursor:pointer;white-space:nowrap">⚠️ nghi trùng</span>`
        : '';
      const groupTag = c.group === 'VIP' ? 'tag-vip'
                      : c.group === 'Mới' ? 'tag-moi'
                      : c.group === 'Inactive' ? 'tag-inact' : 'tag-thuong';
      const debtCls = c.debtOverdue > 0 ? 'danger' : c.debt > 0 ? 'warn' : 'ok';
      const debtVal = c.debt > 0 ? window.fmt(c.debt) : '—';
      const overdueBadge = c.debtOverdue > 0
        ? ' <span style="font-size:10px;background:var(--danger-bg);color:var(--danger);padding:0 4px;border-radius:3px">quá hạn</span>'
        : '';
      const phoneClean = (c.phone || '').replace(/\s/g,'');
      return `<tr data-id="${c.id}">
        <td class="hide-xs" onclick="event.stopPropagation()"><div class="checkbox" onclick="this.classList.toggle('on')"></div></td>
        <td data-field="name" title="Click để sửa tên KH">
          <div class="cust-cell">
            <div class="cust-ava" style="background:${col}">${ava}</div>
            <div class="cust-info">
              <div class="n1">${c.name}${dupBadge}</div>
              <div class="n2">${c.code} · ${c.phone}</div>
            </div>
          </div>
        </td>
        <td class="hide-md" data-field="address" title="Click để sửa địa chỉ" style="font-size:12px;color:var(--muted);max-width:280px;white-space:normal;line-height:1.35">${c.address || '—'}</td>
        <td class="hide-md" data-field="staffOwner"><span class="staff-pill">${c.staffOwner}</span></td>
        <td class="num" data-field="orders">${c.orders}</td>
        <td class="num" data-field="revenue">${window.fmt(c.revenue)}</td>
        <td class="num debt-cell ${debtCls}" data-field="debt">${debtVal}${overdueBadge}</td>
        <td class="hide-xs" onclick="event.stopPropagation()">
          <div class="row-actions">
            <button class="ra-zalo" title="Nhắn Zalo: ${c.phone}" data-act="zalo" data-id="${c.id}"><span style="font-size:13px;font-weight:700">Z</span></button>
            <button class="ra-call" title="Gọi: ${c.phone}" data-act="call" data-id="${c.id}">📞</button>
            <button title="Tạo đơn" data-act="order" data-id="${c.id}">📦</button>
            <button title="Sửa chi tiết (mở drawer)" data-act="edit" data-id="${c.id}">✏️</button>
            <button title="Xóa" data-act="del" data-id="${c.id}" style="color:var(--danger)">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    /* === Bulk operations: tick + xoá/export hàng loạt === */
    if (window.attachBulkOps) {
      const tbl = tbody.closest('table');
      if (tbl) {
        if (!tbl.id) tbl.id = 'tblCustomers';
        window.attachBulkOps({
          tableSelector: '#' + tbl.id,
          store: 'customers',
          label: 'KH',
          actions: {
            changeStatus: {
              label: '🔄 Đổi nhóm',
              field: 'group',
              options: [
                {id:'VIP', label:'⭐ VIP'},
                {id:'Thường', label:'👤 Thường'},
                {id:'Mới', label:'🆕 Mới'},
                {id:'Inactive', label:'⚫ Inactive'},
              ]
            },
            buttons: [
              { label: '🔗 Gộp công nợ', handler: (ids) => window.bulkMergeCustomers(ids) },
            ]
          }
        });
      }
    }

    /* === Inline edit: click cell = sửa nhanh === */
    if (window.attachInlineEdit) {
      const tbl = tbody.closest('table');
      if (tbl) {
        if (!tbl.id) tbl.id = 'tblCustomers';
        window.attachInlineEdit('#' + tbl.id, {
          store: 'customers',
          fields: {
            name:       { type: 'text', format: v => v },
            type:       { type: 'select',
                          options: () => window.MD.get('custTypes').map(t => ({ value: t.id, label: t.label })),
                          format: v => { const m = typeMeta(v); return `<span class="tag" style="background:${m.color}1f;color:${m.color}">${m.label}</span>`; } },
            group:      { type: 'select',
                          options: () => window.MD.get('custGroups').map(g => ({ value: g.id, label: g.label || g.id })),
                          format: v => { const cls = v==='VIP'?'tag-vip':v==='Mới'?'tag-moi':v==='Inactive'?'tag-inact':'tag-thuong'; return `<span class="tag ${cls}">${v}</span>`; } },
            address:    { type: 'text', format: v => v || '—' },
            staffOwner: { type: 'text', format: v => `<span class="staff-pill">${v||'—'}</span>` },
          }
        });
      }
    }

    /* Bind row clicks (mở drawer) + action buttons */
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.onclick = () => openCustomerDrawer(tr.dataset.id);
    });
    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const c = customers.find(x => x.id === btn.dataset.id);
        if (!c) return;
        const phone = (c.phone || '').replace(/\s/g,'');
        switch (btn.dataset.act) {
          case 'zalo': {
            /* Ưu tiên link/SĐT Zalo đã lưu; nếu trống thì dùng SĐT chính */
            const z = (c.zalo || '').trim();
            const url = /^https?:\/\//i.test(z) ? z : ('https://zalo.me/' + (z || phone).replace(/\s/g, ''));
            if (!z && !phone) { window.toast('KH chưa có Zalo/SĐT', 'warn'); break; }
            window.open(url, '_blank');
            window.toast('Mở Zalo: ' + (z || c.phone), 'info');
            break;
          }
          case 'call':
            if (!phone) { window.toast('KH chưa có SĐT', 'warn'); break; }
            window.location.href = 'tel:' + phone;
            window.toast('Đang gọi ' + c.phone, 'info');
            break;
          case 'order':
            window.location.href = 'orders.html?createFor=' + c.id;
            break;
          case 'edit':
            openEditCustomer(c.id);
            break;
          case 'del':
            window.confirmDelete('Xóa khách hàng ' + c.name + '?', () => {
              window.STORE.remove('customers', c.id);
              window.toast('Đã xóa ' + c.code, 'danger');
            });
            break;
        }
      };
    });
  }

  /* ============ FILTERS ============ */
  function quickMatch(c) {
    switch (currentQuick) {
      case 'b2b':   return c.type !== 'ca-nhan';
      case 'b2c':   return c.type === 'ca-nhan';
      case 'vip':   return c.group === 'VIP';
      case 'debt':  return c.debt > 0;
      case 'new':   return c.group === 'Mới';
      case 'inact': return !c.active || c.group === 'Inactive';
      default:      return true;
    }
  }
  function filterMatch(c) {
    const el = document.getElementById('fStaff');
    const nv = el ? el.value : '';
    if (nv && (c.staffOwner || '') !== nv) return false;
    return true;
  }
  /* Đổ danh sách NV phụ trách vào bộ lọc (chỉ NV thực sự có khách) — giữ lựa chọn hiện tại */
  function populateStaffFilter() {
    const el = document.getElementById('fStaff'); if (!el) return;
    const names = [...new Set((window.STORE.get('customers', []) || [])
      .map(c => (c.staffOwner || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi'));
    const key = names.join('|');
    if (el._key === key) return;   /* danh sách không đổi → khỏi dựng lại (giữ lựa chọn) */
    el._key = key;
    const cur = el.value;
    el.innerHTML = '<option value="">NV phụ trách (tất cả)</option>' +
      names.map(n => `<option${n === cur ? ' selected' : ''}>${n}</option>`).join('');
  }
  function searchMatch(c) {
    const raw = document.getElementById('qSearch').value.trim();
    if (!raw) return true;
    /* bỏ dấu + đ→d để gõ "le dai hanh" vẫn khớp "Lê Đại Hành" (broaden, không phá match cũ) */
    const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
    const q = strip(raw);
    return [c.name, c.code, c.phone, c.email, c.contact, c.company, c.address]
      .filter(Boolean).some(x => strip(x).includes(q));
  }

  /* ============ DRAWER ============ */
  window.openCustomerDrawer = function (id) {
    enrichCustomerStats();   /* số đơn/doanh thu/công nợ tươi từ module Đơn hàng */
    const c = customers.find(x => x.id === id);
    if (!c) return;

    document.getElementById('dAva').textContent = window.initials(c.name);
    document.getElementById('dAva').style.background = window.avatarColor(c.id);
    document.getElementById('dName').textContent = c.name;

    const tmD = typeMeta(c.type);
    const typeLab = tmD.label;
    const groupTag = c.group === 'VIP' ? 'tag-vip'
                    : c.group === 'Mới' ? 'tag-moi'
                    : c.group === 'Inactive' ? 'tag-inact' : 'tag-thuong';
    document.getElementById('dMeta').innerHTML = `
      <span class="tag" style="background:${tmD.color}1f;color:${tmD.color}">${typeLab}</span>
      <span class="tag ${groupTag}">${c.group}</span>
      <span>· ${c.code}</span>
      <span>· ${c.active ? '🟢 Đang hoạt động' : '⚫ Không hoạt động'}</span>
    `;
    document.getElementById('dLtv').textContent    = window.fmtVND(c.revenue);
    document.getElementById('dAov').textContent    = c.orders ? window.fmtVND(Math.round(c.revenue / c.orders)) : '—';
    document.getElementById('dOrders').textContent = c.orders;
    document.getElementById('dDebt').textContent   = c.debt ? window.fmtVND(c.debt) : '—';
    document.getElementById('dDebtSub').textContent = c.debtOverdue
      ? '⚠ ' + window.fmt(c.debtOverdue) + ' quá hạn' : 'Không quá hạn';

    document.getElementById('iCode').textContent    = c.code;
    document.getElementById('iContact').textContent = c.contact;
    document.getElementById('iPhone').innerHTML     = c.phone || '<span class="empty">(chưa có)</span>';
    document.getElementById('iEmail').innerHTML     = c.email || '<span class="empty">(chưa có)</span>';
    { const zEl = document.getElementById('iZalo'); if (zEl) zEl.innerHTML = _socialLink('zalo', c.zalo); }
    { const fEl = document.getElementById('iFb');   if (fEl) fEl.innerHTML = _socialLink('fb', c.fb); }
    document.getElementById('iAddr').textContent    = c.address;
    document.getElementById('iType').textContent    = typeLab;
    document.getElementById('iGroup').textContent   = c.group;
    document.getElementById('iService').textContent = freqLabel(c.orderFreq);
    document.getElementById('iRoute').textContent   = catLabels(c.mainCats);
    document.getElementById('iCreated').textContent = c.created;
    document.getElementById('iSource').textContent  = c.source;

    if (c.type !== 'ca-nhan') {
      document.getElementById('biSection').style.display = 'inline-block';
      document.getElementById('biGrid').style.display    = 'grid';
      document.getElementById('iCompany').textContent  = c.company || '—';
      document.getElementById('iTax').textContent      = c.tax || '—';
      document.getElementById('iRep').textContent      = c.rep || '—';
      document.getElementById('iContract').textContent = c.contract || '—';
    } else {
      document.getElementById('biSection').style.display = 'none';
      document.getElementById('biGrid').style.display    = 'none';
    }

    /* Lịch sử đơn — lấy từ STORE.orders nếu có */
    const allOrders = window.STORE.get('orders', window.ORDERS || []);
    const orderHistory = allOrders.filter(o => (o.custId||o.cust) === c.id);
    document.getElementById('tabOrdCnt').textContent = orderHistory.length || c.orders;
    const otb = document.querySelector('#ordersTable tbody');
    if (orderHistory.length) {
      otb.innerHTML = orderHistory.slice(0, 10).map(o => `<tr>
        <td><b>${o.code}</b></td><td>${o.date}</td>
        <td>${(o.drop || '—').split(',')[0]}</td>
        <td>${o.goods}</td>
        <td class="num">${window.fmt(o.freight)}</td>
        <td class="num">${o.cod ? window.fmt(o.cod) : '—'}</td>
        <td><span class="status-pill st-${o.status}">${o.status === 'delivered' ? 'Đã giao' : o.status === 'transit' ? 'Đang giao' : o.status === 'reconciled' ? 'Đối soát' : o.status === 'cancelled' ? 'Hủy' : 'Mới'}</span></td>
      </tr>`).join('');
    } else {
      otb.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--muted)">Chưa có đơn nào cho KH này.</td></tr>`;
    }

    /* Debt */
    document.getElementById('dbPaid').textContent = window.fmtVND(c.revenue - c.debt);
    document.getElementById('dbOwed').textContent = window.fmtVND(c.debt);
    document.getElementById('dbOver').textContent = window.fmtVND(c.debtOverdue);
    renderDebtLedger(c);

    /* Notes */
    const nlist = c.notes || [];
    document.getElementById('tabNoteCnt').textContent = nlist.length;
    renderNotes(c, nlist);

    /* Files */
    renderCustomerFiles(c);

    /* Preferences (Từ điển riêng + lịch sử SP) */
    renderCustomerPrefs(c);

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab[data-tab="info"]')?.classList.add('active');
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelector('.tab-pane[data-pane="info"]')?.classList.add('active');

    window.openDrawerBg();
    window._currentDrawerCust = c.id;
  };

  function renderNotes(c, nlist) {
    const nl = document.getElementById('noteList');
    nl.innerHTML = nlist.length
      ? nlist.map(n => `<div class="note-card">
          <div class="h"><span class="who">${n.who}</span><span class="when">${n.when}</span></div>
          <div class="b">${n.text}</div>
        </div>`).join('')
      : `<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">Chưa có ghi chú nào.</div>`;
  }

  /* Lưu ghi chú nội bộ KH — gọi từ onclick nút Lưu ghi chú */
  window.saveCustomerNote = function () {
    const ta = document.getElementById('custNoteInput') || document.querySelector('.note-input textarea');
    if (!ta) return;
    const text = ta.value.trim();
    if (!text) { window.toast('Nhập nội dung ghi chú', 'warn'); return; }
    const id = window._currentDrawerCust;
    const c = customers.find(x => x.id === id);
    if (!c) return;
    const newNote = {
      who: (window.CURRENT_USER && window.CURRENT_USER.name) || 'Tôi',
      when: new Date().toLocaleDateString('vi-VN'),
      text,
    };
    const notes = [newNote, ...(c.notes || [])];
    window.STORE.update('customers', id, { notes, lastContact: newNote.when });
    customers = window.STORE.get('customers');
    ta.value = '';
    window.toast('Đã lưu ghi chú', 'success');
    renderNotes(c, notes);
    const cnt = document.getElementById('tabNoteCnt'); if (cnt) cnt.textContent = notes.length;
  };

  /* === Export KH ra CSV === */
  window.exportCustomersCsv = function () {
    const data = customers.slice();
    const rows = [['Mã','Tên KH','Loại hình','SĐT','Email','Địa chỉ','NV phụ trách','Nguồn','Tổng đơn','Doanh thu (₫)','Công nợ (₫)','Quá hạn (₫)','Tần suất đặt','Lần đặt cuối']];
    data.forEach(c => rows.push([
      c.code || c.id, c.name || '', c.type || '', c.phone || '', c.email || '',
      c.address || '', c.staffOwner || '', c.source || '',
      c.orders || 0, c.revenue || 0, c.debt || 0, c.debtOverdue || 0,
      c.orderFreq || '', c.lastOrder || ''
    ]));
    const csv = rows.map(r => r.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'KhachHang-NSTT-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    window.toast('⬇ Đã xuất ' + data.length + ' KH (mở bằng Excel)', 'success');
  };

  /* ============ AI: thêm KH từ ảnh ============ */
  window.aiAddCustomer = function () {
    if (!window.AI) { window.toast('Chưa tải module AI', 'warn'); return; }
    window.AI.openFillModal({
      task: 'customer',
      title: '📷 Thêm khách hàng từ ảnh (AI)',
      guideHtml: 'Đính kèm <b>danh thiếp / ảnh chụp tin nhắn / giấy ghi thông tin KH</b>. AI đọc tên, SĐT, địa chỉ... rồi mở form đã điền sẵn để bạn kiểm tra & lưu.<br><b>Cấu trúc gợi ý:</b> Tên · SĐT · Địa chỉ · (Nhà hàng/Công ty hay Cá nhân).',
      prompt: 'Đọc ảnh chứa thông tin 1 khách hàng (tiếng Việt). Trả JSON: {"name":"tên người hoặc tên nhà hàng/công ty","phone":"số điện thoại","email":"","address":"địa chỉ đầy đủ","type":"B2B nếu là nhà hàng/công ty, B2C nếu cá nhân"}. Field thiếu để chuỗi rỗng. CHỈ trả JSON.',
      onResult: (d) => {
        window.openAddCustomerModal();
        setTimeout(() => {
          const set = (id, v) => { const e = document.getElementById(id); if (e && v) e.value = v; };
          set('addName', d.name); set('addPhone', d.phone); set('addEmail', d.email); set('addAddress', d.address);
          const typeEl = document.getElementById('addType');
          if (typeEl) {
            const t = window.AI.norm((d.type || '') + ' ' + (d.name || ''));
            let tv = 'nha-hang';
            if (/quan an|bun|pho|quan com|quan nhau|lau|nuong/.test(t)) tv = 'quan-an';
            if (/khach san|hotel|resort/.test(t)) tv = 'khach-san';
            if (/canteen|bep an|suat an|cong nghiep/.test(t)) tv = 'canteen';
            if (/cafe|ca phe|coffee|tra sua/.test(t)) tv = 'cafe';
            if (/cua hang|dai ly|tap hoa|sieu thi|mart/.test(t)) tv = 'cua-hang';
            if (/ca nhan|ho gia dinh|^anh |^chi |^co |^bac /.test(t)) tv = 'ca-nhan';
            typeEl.value = tv;
          }
          window.toast('🤖 AI đã điền thông tin KH — kiểm tra & lưu', 'success');
        }, 160);
      },
    });
  };

  /* ============ Add Customer Modal ============ */
  window.openAddCustomerModal = function () {
    const nextCode = window.STORE.nextId('customers', 'KH');
    window.openModal('+ Thêm khách hàng', `
      <div style="margin-bottom:14px;padding:10px 12px;background:#F3E8FF;border:1px solid #E9D5FF;border-radius:8px;font-size:12px;color:#7C3AED">
        💡 <b>Mẹo:</b> Dán chat từ Zalo vào ô bên dưới → AI tự điền form (sau khi cấu hình Telegram bot)
      </div>
      <div class="form-row wide"><label>📋 Dán chat (tùy chọn)</label>
        <textarea id="aiChat" rows="2" placeholder="VD: Anh Hùng - Cty An Phát, sđt 0913 222 333..."></textarea>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px">
        💡 Các trường dropdown đọc từ <b>Master Data</b> — sửa thêm/bớt option ở <a href="settings.html" style="color:var(--navy);text-decoration:underline">Cài đặt → Master data</a>
      </div>
      <div class="form-row">
        <div><label>Mã KH</label><input id="addCode" value="${nextCode}" readonly style="background:#FAFAFB"></div>
        <div><label>Loại hình KH</label>
          <select id="addType">${window.MD.options('custTypes')}</select></div>
      </div>
      <div class="form-row">
        <div><label>Tên KH / Tên Cty *</label><input id="addName" placeholder="VD: Anh Tuấn / Cty ABC"></div>
        <div><label>Nhóm</label>
          <select id="addGroup">${window.MD.options('custGroups', 'Mới')}</select></div>
      </div>
      <div class="form-row">
        <div><label>SĐT <span style="color:var(--muted);font-weight:400;font-size:11px">(không bắt buộc)</span></label><input id="addPhone" placeholder="0912 xxx xxx"></div>
        <div><label>Email</label><input id="addEmail" type="email"></div>
      </div>
      <div class="form-row">
        <div><label>Zalo <span style="color:var(--muted);font-weight:400;font-size:11px">(SĐT hoặc link)</span></label><input id="addZalo" placeholder="0912… hoặc https://zalo.me/..."></div>
        <div><label>Facebook <span style="color:var(--muted);font-weight:400;font-size:11px">(link)</span></label><input id="addFb" placeholder="https://facebook.com/..."></div>
      </div>
      <div class="form-row wide"><label>Địa chỉ</label><input id="addAddress" placeholder="Số nhà, đường, phường, quận, tỉnh" oninput="window._checkAddrDup&&window._checkAddrDup()">
        <div id="addAddrDupHint" style="font-size:11.5px;margin-top:5px;line-height:1.45"></div></div>
      <div class="form-row">
        <div><label>Tỉnh/TP</label>
          <select id="addProvince"><option value="">— Chọn —</option>${(window.MD.get('provinces')||[]).map(p=>{const v=(typeof p==='string'?p:(p.label||p.id||''));return `<option value="${v}">${v}</option>`;}).join('')}</select></div>
        <div><label>Tần suất đặt hàng</label>
          <select id="addFreq">${window.MD.options('orderFreq')}</select></div>
      </div>
      <div class="form-row">
        <div><label>Nhóm giá (bảng giá KH nhận)</label>
          <select id="addPriceTier">${window.priceTierOptions ? window.priceTierOptions('') : '<option value="">Mặc định</option>'}</select></div>
        <div><label>Hạn công nợ ${window.helpTip ? window.helpTip('Số ngày KH được nợ trước khi tính QUÁ HẠN. Chính sách Tuấn Tú: đơn ~50kg → 3 ngày · 50–100kg → 7 ngày · >200tr/tháng → 15 ngày.') : ''}</label>
          <select id="addCreditDays">${window.creditDaysOptions ? window.creditDaysOptions('') : '<option value="7">7 ngày</option>'}</select></div>
      </div>
      <div class="form-row">
        <div><label>NV phụ trách${isScoped() ? ' <span style="color:var(--muted);font-weight:400">(chính bạn)</span>' : ''}</label>
          <select id="addStaff" ${isScoped() ? 'disabled' : ''}>${
            (isScoped()
              ? [`<option selected>${myName()}</option>`]
              : (window.STORE.get('staff', []) || [])
                  .filter(s => s.status !== 'inactive')
                  .map(s => `<option ${s.name === myName() ? 'selected' : ''}>${s.name}</option>`)
            ).join('') || '<option>Tuấn Tú</option>'
          }</select></div>
        <div><label>Nguồn</label>
          <select id="addSource">${window.MD.options('sources')}</select></div>
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-ghost" onclick="window.submitAddCustomer(false)">💾 Chỉ lưu KH</button>
               <button class="btn btn-primary" onclick="window.submitAddCustomer(true)">💾 Lưu & Tạo đơn ngay 🚚</button>`,
      width: '620px'
    });
  };

  /* Options nhóm giá (đọc priceTiers; fallback 3 nhóm mặc định) */
  window.priceTierOptions = function (sel) {
    let tiers = window.STORE.get('priceTiers', null);
    const _old = Array.isArray(tiers) && tiers.length === 3 && tiers[0]?.name === 'Giá lẻ';
    if (!Array.isArray(tiers) || !tiers.length || _old) tiers = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: 'Nhóm ' + (i + 1) }));
    const ic = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
    return `<option value="">— Mặc định (Giá gốc) —</option>` + tiers.map(t => `<option value="${t.id}" ${String(sel) === String(t.id) ? 'selected' : ''}>${ic[(t.id - 1) % 8] || ''} ${t.name}</option>`).join('');
  };

  /* ===== CHỐNG NHIỀU TÊN KH CÙNG 1 ĐỊA CHỈ ===== */
  function _normAddr(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(so|nha|ngo|ngach|duong|pho|thon|xom|to|hn|ha noi)\b/g, ' ')   /* bỏ từ đệm */
      .replace(/\s+/g, ' ').trim();
  }
  function _addrLooksSame(a, b) {
    a = _normAddr(a); b = _normAddr(b);
    if (!a || !b || a.length < 6) return false;
    if (a === b) return true;
    const [sh, lo] = a.length <= b.length ? [a, b] : [b, a];
    if (sh.length >= 8 && lo.indexOf(sh) >= 0) return true;    /* 1 địa chỉ chứa trọn cái kia */
    const ta = new Set(a.split(' ').filter(w => w.length > 1));
    const common = b.split(' ').filter(w => w.length > 1 && ta.has(w)).length;
    const nA = a.match(/\d+/g) || [], nB = b.match(/\d+/g) || [];
    return common >= 3 && nA.some(n => nB.includes(n));        /* ≥3 từ chung + trùng SỐ nhà */
  }
  function _custsSameAddr(addr, excludeId) {
    if (!_normAddr(addr)) return [];
    return (window.STORE.get('customers', []) || []).filter(c =>
      (c.id || c.code) !== excludeId && _addrLooksSame(addr, c.address));
  }
  /* Cảnh báo LIVE ngay khi gõ địa chỉ trong form thêm KH */
  window._checkAddrDup = function () {
    const el = document.getElementById('addAddrDupHint'); if (!el) return;
    const dup = _custsSameAddr(window.formVal('#addAddress'));
    if (!dup.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<span style="color:#B45309">⚠️ Địa chỉ này đã có: </span>` +
      dup.slice(0, 4).map(c => `<b>${c.name}</b> (${c.code})`).join(', ') +
      (dup.length > 4 ? ` +${dup.length - 4}` : '') +
      ` — cân nhắc tạo đơn cho khách cũ thay vì tạo trùng.`;
  };

  /* ===== XÁC NHẬN cặp trùng địa chỉ "không phải trùng" → lưu KV addrDupOk (sync đa máy).
     Xác nhận 1 lần thì badge biến mất vĩnh viễn cho cặp đó, không cảnh báo lại. ===== */
  function _pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  window._ackDupPair = function (a, b) {
    if (!a || !b || a === b) return;
    const k = _pairKey(a, b);
    if (window.STORE.rmwKv) window.STORE.rmwKv('addrDupOk', arr => { if (!arr.includes(k)) arr.push(k); return arr; });
    else { const arr = window.STORE.get('addrDupOk', []) || []; if (!arr.includes(k)) { arr.push(k); window.STORE.set('addrDupOk', arr); } }
  };
  /* Twin CHƯA xác nhận của 1 KH (đã lọc addrDupOk) */
  function _unconfirmedTwins(custId) {
    const all = window.STORE.get('customers', []) || [];
    const c = all.find(x => x.id === custId); if (!c) return [];
    const ok = new Set(window.STORE.get('addrDupOk', []) || []);
    return all.filter(x => x.id !== custId && !ok.has(_pairKey(custId, x.id)) && _addrLooksSame(c.address, x.address));
  }
  window.reviewAddrDup = function (custId) {
    const all = window.STORE.get('customers', []) || [];
    const c = all.find(x => x.id === custId); if (!c) return;
    const twins = _unconfirmedTwins(custId);
    if (!twins.length) { window.closeModal && window.closeModal(); render(); return; }
    const rows = twins.map(t => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:9px;padding:9px 11px;margin-bottom:7px">
        <div style="min-width:0">
          <div style="font-weight:700">${t.name} <span style="color:var(--muted);font-weight:400;font-size:11px">· ${t.code}</span></div>
          <div style="font-size:11.5px;color:var(--muted)">📍 ${t.address || '—'} · nợ ${window.fmt(t.debt || 0)} · NV: ${t.staffOwner || '—'}</div>
        </div>
        <div style="display:flex;gap:6px;flex:0 0 auto">
          <button class="btn btn-primary btn-sm" onclick="window.bulkMergeCustomers(['${custId}','${t.id}'])" title="Gộp 2 khách này thành 1 (dồn đơn + công nợ)">🔗 Gộp</button>
          <button class="btn btn-ghost btn-sm" onclick="window._ackDup('${custId}','${t.id}')">✓ Không trùng</button>
        </div>
      </div>`).join('');
    window.openModal('⚠️ Trùng địa chỉ — ' + c.name + ' (' + c.code + ')', `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Địa chỉ: <b style="color:var(--text)">${c.address || '—'}</b><br>
      Các khách dưới đây CÙNG địa chỉ. Nếu đúng là <b>1 nhà hàng</b> → nên gộp về 1 mã; nếu đúng là <b>khách KHÁC</b> (toà nhà/nhiều hộ) → bấm <b>“✓ Không trùng”</b> để bỏ cảnh báo (sẽ không hỏi lại).</div>
      ${rows}
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-primary" onclick="window._ackDupAll('${custId}')">✓ Tất cả không trùng — bỏ cảnh báo</button>`,
      width: '560px',
    });
  };
  window._ackDup = function (a, b) {
    window._ackDupPair(a, b);
    window.toast && window.toast('✓ Đã bỏ cảnh báo trùng cặp này', 'success');
    render();
    window.reviewAddrDup(a);   /* làm mới modal — tự đóng nếu hết twin */
  };
  window._ackDupAll = function (custId) {
    _unconfirmedTwins(custId).forEach(t => window._ackDupPair(custId, t.id));
    window.closeModal && window.closeModal();
    window.toast && window.toast('✓ Đã bỏ cảnh báo trùng cho khách này', 'success');
    render();
  };

  /* ============ GỘP CÔNG NỢ KHÁCH TRÙNG (hard-merge: dời hết tham chiếu → xoá mã thừa) ============
     Dời ĐƠN (o.cust→keeper, cột cloud customer_id) + SỔ NỢ (debtLedger.custId) + KV map
     (custBrands/custPriceTiers/custCreditDays/cust_prefs) + quotes/recurring/invoices/web_orders
     sang KH GIỮ, RỒI STORE.remove các KH thừa (tombstone chống hồi sinh). THỨ TỰ: dời hết TRƯỚC,
     xoá SAU (FK ON DELETE SET NULL). Công nợ là DERIVED → reload để rebuildCustStats tính lại. */
  let _mergeIds = [], _mergeKeeper = null, _mergeSel = [], _mergeStat = {};
  const _mFmt = v => (+v || 0).toLocaleString('vi-VN');
  const _mEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  function _renderMergeRows() {
    return _mergeSel.map(c => {
      const st = _mergeStat[c.id] || { n: 0, debt: 0 }; const keep = c.id === _mergeKeeper;
      return `<label style="display:flex;gap:10px;align-items:flex-start;border:1px solid ${keep ? '#15803D' : 'var(--line)'};background:${keep ? '#F0FDF4' : '#fff'};border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer">
        <input type="radio" name="mkeep" value="${_mEsc(c.id)}" ${keep ? 'checked' : ''} onchange="window._pickMergeKeeper('${_mEsc(c.id)}')" style="margin-top:3px">
        <div style="min-width:0;flex:1">
          <div style="font-weight:700">${_mEsc(c.name)} <span style="color:var(--muted);font-weight:400;font-size:11px">· ${_mEsc(c.code)}</span> ${keep ? '<span style="font-size:10px;background:#15803D;color:#fff;padding:1px 6px;border-radius:6px">GIỮ LẠI</span>' : '<span style="font-size:10px;color:#B91C1C">sẽ xoá</span>'}</div>
          <div style="font-size:11.5px;color:var(--muted)">📍 ${_mEsc(c.address || '—')} · ${st.n} đơn · nợ ${_mFmt(st.debt)}đ${c.phone ? ' · ☎ ' + _mEsc(c.phone) : ''}</div>
        </div></label>`;
    }).join('');
  }
  function _renderMergePreview() {
    const el = document.getElementById('mergePreview'); if (!el) return;
    const keeper = _mergeSel.find(c => c.id === _mergeKeeper);
    const losers = _mergeIds.filter(x => x !== _mergeKeeper);
    const lset = new Set(losers);
    const orders = window.STORE.get('orders', []) || [];
    let n = 0; orders.forEach(o => { if (lset.has(o.cust || o.custId)) n++; });
    let debt = 0; losers.forEach(l => debt += (window.custDebt ? window.custDebt(l) : 0));
    if (keeper) el.innerHTML = `→ Giữ <b style="color:#15803D">${_mEsc(keeper.name)}</b> (${_mEsc(keeper.code)}). Dời <b>${n} đơn</b> + <b>${_mFmt(debt)}đ</b> nợ từ <b>${losers.length}</b> khách sang, rồi xoá ${losers.length} khách.`;
  }

  window.bulkMergeCustomers = function (ids) {
    ids = [...new Set((ids || []).filter(Boolean))];
    if (ids.length < 2) { window.toast?.('Chọn ít nhất 2 khách hàng để gộp', 'warn'); return; }
    const all = window.STORE.get('customers', []) || [];
    const orders = window.STORE.get('orders', []) || [];
    _mergeSel = ids.map(id => all.find(c => (c.id || c.code) === id)).filter(Boolean);
    if (_mergeSel.length < 2) { window.toast?.('Không tìm thấy đủ khách đã chọn', 'warn'); return; }
    _mergeIds = _mergeSel.map(c => c.id);
    _mergeStat = {};
    _mergeSel.forEach(c => { _mergeStat[c.id] = { n: 0, debt: (window.custDebt ? window.custDebt(c.id) : (+c.debt || 0)) }; });
    orders.forEach(o => { const k = o.cust || o.custId; if (_mergeStat[k]) _mergeStat[k].n++; });
    /* mặc định GIỮ khách nhiều đơn nhất (bản ghi vận hành chính) */
    _mergeKeeper = _mergeSel.slice().sort((a, b) => (_mergeStat[b.id].n - _mergeStat[a.id].n) || (_mergeStat[b.id].debt - _mergeStat[a.id].debt))[0].id;
    const totalN = _mergeSel.reduce((s, c) => s + _mergeStat[c.id].n, 0);
    const totalDebt = _mergeSel.reduce((s, c) => s + _mergeStat[c.id].debt, 0);
    window.openModal('🔗 Gộp công nợ khách hàng', `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Chọn <b>1 khách GIỮ LẠI</b>. Toàn bộ đơn + công nợ + dữ liệu của các khách còn lại sẽ được <b>dồn về khách giữ</b>, rồi các khách kia bị <b>xoá</b>.</div>
      <div id="mergeRows">${_renderMergeRows()}</div>
      <div id="mergePreview" style="font-size:12.5px;background:#F7FBF5;border:1px solid #CBD9C4;border-radius:8px;padding:9px 12px;margin-top:6px"></div>
      <div style="font-size:11px;color:#B45309;margin-top:8px">⚠ Chỉ gộp khi chắc chắn CÙNG 1 khách — thao tác không tự hoàn tác. Tổng: <b>${totalN} đơn · ${_mFmt(totalDebt)}đ</b>.</div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" id="mergeGoBtn" onclick="window.confirmMergeCustomers()">🔗 Gộp & xoá khách thừa</button>`,
      width: '560px',
    });
    _renderMergePreview();
  };

  window._pickMergeKeeper = function (id) {
    _mergeKeeper = id;
    const rows = document.getElementById('mergeRows');
    if (rows) rows.innerHTML = _renderMergeRows();
    _renderMergePreview();
  };

  window.confirmMergeCustomers = async function () {
    const btn = document.getElementById('mergeGoBtn');
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang gộp...'; }
    const keeperId = _mergeKeeper, loserIds = _mergeIds.filter(x => x !== keeperId);
    if (!keeperId || !loserIds.length) { window.toast?.('Chưa chọn khách giữ lại', 'warn'); if (btn) { btn.disabled = false; btn.textContent = '🔗 Gộp & xoá khách thừa'; } return; }
    try { await _doMergeCustomers(keeperId, loserIds); }
    catch (e) { console.error('[merge]', e); window.toast?.('Lỗi khi gộp: ' + (e.message || e), 'warn'); if (btn) { btn.disabled = false; btn.textContent = '🔗 Gộp & xoá khách thừa'; } }
  };

  async function _doMergeCustomers(keeperId, loserIds) {
    const S = window.STORE;
    const all = S.get('customers', []) || [];
    const keeper = all.find(c => c.id === keeperId);
    const keeperName = keeper ? keeper.name : '';
    const lset = new Set(loserIds);
    const orders = S.get('orders', []) || [];
    const toMove = orders.filter(o => lset.has(o.cust || o.custId));

    /* 1) DỜI ĐƠN → keeper (pending-tracked; rớt mạng thì self-heal đẩy lại) */
    window.toast?.(`Đang dời ${toMove.length} đơn...`, 'info');
    toMove.forEach(o => S.update('orders', o.code, { cust: keeperId, custId: keeperId, custName: keeperName }));

    /* 2) SỔ NỢ: đổi custId loser→keeper + DEDUP (custId,ref,type) tránh nhân đôi */
    if (S.rmwKv) S.rmwKv('debtLedger', arr => {
      const seen = new Set(); const out = [];
      (arr || []).forEach(e => {
        const ne = lset.has(e.custId) ? { ...e, custId: keeperId } : e;
        if (ne.ref) { const k = ne.custId + '|' + ne.ref + '|' + (ne.type || ''); if (seen.has(k)) return; seen.add(k); }
        out.push(ne);
      });
      return out;
    });

    /* 3) KV map keyed-by-custId: GIỮ giá trị keeper nếu đã có, else kế thừa của loser */
    ['custBrands', 'custPriceTiers', 'custCreditDays', 'cust_prefs'].forEach(kv => {
      if (!S.rmwKv) return;
      S.rmwKv(kv, m => {
        if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
        loserIds.forEach(lid => { if (m[lid] != null) { if (m[keeperId] == null) m[keeperId] = m[lid]; delete m[lid]; } });
        return m;
      });
    });

    /* 4) quotes + recurring (nay rỗng, code cho tương lai) */
    ['quotes', 'recurringOrders', 'recurring_orders'].forEach(k => {
      try {
        const list = S.get(k, []) || [];
        if (Array.isArray(list) && list.length) list.filter(q => lset.has(q.custId)).forEach(q => S.update(k, q.id, { custId: keeperId, custName: keeperName }));
      } catch (e) {}
    });
    /* 5) invoices — link theo TÊN → đổi cust của HĐ loser sang tên keeper */
    try {
      const inv = S.get('invoices', []) || [];
      const loserNames = new Set(loserIds.map(l => (all.find(c => c.id === l) || {}).name).filter(Boolean));
      if (inv.length) inv.filter(i => loserNames.has(i.cust)).forEach(i => S.update('invoices', i.no, { cust: keeperName }));
    } catch (e) {}
    /* 6) web_orders — bảng NGOÀI STORE → REST PATCH linked_cust */
    try { if (window.SB && window.SB.from) for (const lid of loserIds) await window.SB.from('web_orders').update({ linked_cust: keeperId }).eq('linked_cust', lid); } catch (e) {}

    /* 7) đợi PATCH đơn kịp lên cloud TRƯỚC khi xoá KH (giảm cửa sổ đua FK; self-heal lo phần còn lại) */
    await new Promise(r => setTimeout(r, 1500));

    /* 8) XOÁ khách thừa — STORE.remove (tombstone chống hồi sinh) */
    loserIds.forEach(lid => S.remove('customers', lid));

    /* 9) dọn addrDupOk chứa loser + flush KV lên cloud */
    if (S.rmwKv) S.rmwKv('addrDupOk', arr => (Array.isArray(arr) ? arr.filter(k => !String(k).split('|').some(x => lset.has(x))) : arr));
    try { window.STORE._flushAllRmw && window.STORE._flushAllRmw(); } catch (e) {}

    window.closeModal && window.closeModal();
    window.toast?.(`✓ Đã gộp ${loserIds.length} khách vào "${keeperName}". Đang tải lại...`, 'success');
    /* reload để rebuildCustStats tính lại công nợ/đơn cho keeper (memo theo reference mảng) */
    setTimeout(() => location.reload(), 1200);
  }

  function _readAddForm() {
    return {
      name: window.formVal('#addName'), phone: window.formVal('#addPhone'),
      type: window.formVal('#addType'), group: window.formVal('#addGroup'),
      priceTier: window.formVal('#addPriceTier'), email: window.formVal('#addEmail'),
      zalo: window.formVal('#addZalo'), fb: window.formVal('#addFb'),
      address: window.formVal('#addAddress'), province: window.formVal('#addProvince'),
      orderFreq: window.formVal('#addFreq'), staff: window.formVal('#addStaff'),
      source: window.formVal('#addSource'), creditDays: window.formVal('#addCreditDays'),
    };
  }
  let _addCap = null;   /* dữ liệu form đã bắt trước khi modal cảnh báo THAY thế form */

  window.submitAddCustomer = async function (thenCreateOrder, forced) {
    /* chống double-click → tạo 2 KH; forced ("Vẫn tạo khách mới" từ modal trùng địa chỉ) được đi tiếp */
    if (window.__busyAddCust && !forced) return; window.__busyAddCust = true; setTimeout(() => { window.__busyAddCust = false; }, 2500);
    const f = (forced && _addCap) ? _addCap : _readAddForm();
    if (!f.name) { window.toast('Tên KH là bắt buộc', 'warn'); return; }

    /* CẢNH BÁO TRÙNG ĐỊA CHỈ — tránh nhiều tên KH chung 1 địa chỉ (như vụ KH001) */
    if (!forced && f.address) {
      const dup = _custsSameAddr(f.address);
      if (dup.length) {
        _addCap = f;   /* modal cảnh báo sẽ thay form → phải lưu dữ liệu để nút "Vẫn tạo" dùng lại */
        const list = dup.slice(0, 6).map(c => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:9px;padding:9px 11px;margin-bottom:7px">
            <div style="min-width:0"><div style="font-weight:700">${c.name} <span style="color:var(--muted);font-weight:400;font-size:11px">· ${c.code}</span></div>
              <div style="font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📍 ${c.address || ''}${c.phone ? ' · ☎ ' + c.phone : ''}</div></div>
            <button class="btn btn-primary btn-sm" style="flex:0 0 auto" onclick="window.location.href='orders.html?createFor=${c.id || c.code}'">🚚 Tạo đơn</button>
          </div>`).join('');
        window.openModal('⚠️ Địa chỉ này đã có khách hàng', `
          <div style="font-size:13px;margin-bottom:12px">Đã có <b>${dup.length}</b> khách ở địa chỉ <b>“${f.address}”</b>. Có phải bạn muốn <b>tạo đơn cho khách này</b> thay vì tạo một khách mới trùng địa chỉ không?</div>
          ${list}
          <div style="font-size:11.5px;color:var(--muted);margin-top:4px">Nếu đúng là khách KHÁC (vd toà nhà/chung cư nhiều hộ) thì bấm “Vẫn tạo khách mới”.</div>
        `, {
          footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
                   <button class="btn btn-ghost" onclick="window.submitAddCustomer(${thenCreateOrder ? 'true' : 'false'}, true)">Vẫn tạo khách mới</button>`,
          width: '540px',
        });
        return;
      }
    }
    _addCap = null;

    /* Mã KH CLOUD-AWARE tại lúc LƯU (né trùng nếu danh sách local tụt lại) */
    const code = (window.STORE.nextCustCodeSafe ? await window.STORE.nextCustCodeSafe() : null) || window.STORE.nextId('customers', 'KH');
    const newCust = decorate({
      id: code, code,
      type: f.type, group: f.group, priceTier: f.priceTier,
      name: f.name, contact: f.name,
      phone: f.phone, email: f.email, zalo: f.zalo, fb: f.fb,
      address: f.address, province: f.province, orderFreq: f.orderFreq, mainCats: [],
      /* Sale tạo KH → BẮT BUỘC chủ sở hữu = chính mình (nếu không sẽ không thấy lại KH vừa tạo) */
      staffOwner: isScoped() ? myName() : f.staff,
      source: f.source,
      created: new Date().toLocaleDateString('vi-VN'),
      lastContact: new Date().toLocaleDateString('vi-VN'),
      lastOrder: '—', active: true,
      orders: 0, revenue: 0, debt: 0, debtOverdue: 0, ordersList: [], notes: [],
    });
    window.STORE.add('customers', newCust);
    /* NV cố ý "Vẫn tạo khách mới" dù trùng địa chỉ → tự XÁC NHẬN các cặp (không cảnh báo lại) */
    if (forced && f.address && window._ackDupPair) {
      _custsSameAddr(f.address, code).forEach(t => window._ackDupPair(code, t.id || t.code));
    }
    /* Nhóm giá KH → KV custPriceTiers (sync đa máy; cloud customers không có cột price_tier) */
    if (window.setCustPriceTier) window.setCustPriceTier(code, f.priceTier);
    if (window.setCustCreditDays) window.setCustCreditDays(code, f.creditDays);
    window.closeModal();
    window.toast('✓ Đã thêm khách hàng ' + code, 'success');

    /* Nếu user bấm "Lưu & Tạo đơn ngay" → nhảy sang Orders với prefill */
    if (thenCreateOrder) setTimeout(() => { window.location.href = 'orders.html?createFor=' + code; }, 500);
  };

  /* ============ Edit Customer ============ */
  window.openEditCustomer = openEditCustomer;
  function openEditCustomer(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    /* created (dd/mm/yyyy hoặc ISO) → yyyy-mm-dd cho <input type=date> */
    const _toDI = (s) => { s = String(s || '').trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : ''; };
    const _biz = c.type !== 'ca-nhan';
    window.openModal('✏️ Sửa khách hàng — ' + c.code, `
      <div class="form-row">
        <div><label>Loại KH</label>
          <select id="eType">${window.MD.options('custTypes', c.type)}</select></div>
        <div><label>Nhóm</label>
          <select id="eGroup">${window.MD.options('custGroups', c.group)}</select></div>
      </div>
      <div class="form-row">
        <div><label>Tên KH</label><input id="eName" value="${c.name}"></div>
        <div><label>SĐT</label><input id="ePhone" value="${c.phone}"></div>
      </div>
      <div class="form-row">
        <div><label>Zalo <span style="color:var(--muted);font-weight:400;font-size:11px">(SĐT hoặc link)</span></label><input id="eZalo" value="${(c.zalo||'').replace(/"/g,'&quot;')}" placeholder="0912… hoặc https://zalo.me/..."></div>
        <div><label>Facebook <span style="color:var(--muted);font-weight:400;font-size:11px">(link)</span></label><input id="eFb" value="${(c.fb||'').replace(/"/g,'&quot;')}" placeholder="https://facebook.com/..."></div>
      </div>
      <div class="form-row">
        <div><label>Email</label><input id="eEmail" value="${c.email||''}"></div>
        <div><label>NV phụ trách</label>
          <select id="eStaff">${
            ((window.STORE.get('staff', []) || []).filter(s => s.status !== 'inactive').map(s => s.name).length
              ? (window.STORE.get('staff', []) || []).filter(s => s.status !== 'inactive').map(s => s.name)
              : ['Trần Lan','Phạm Hùng','Hoàng Mai','Tuấn Tú']
            ).map(s=>`<option ${c.staffOwner===s?'selected':''}>${s}</option>`).join('')
          }</select></div>
      </div>
      <div class="form-row">
        <div><label>Nhóm giá (bảng giá KH nhận)</label>
          <select id="ePriceTier">${window.priceTierOptions ? window.priceTierOptions((window.custPriceTier ? window.custPriceTier(c.id) : c.priceTier) || '') : '<option value="">Mặc định</option>'}</select></div>
        <div><label>Hạn công nợ ${window.helpTip ? window.helpTip('Số ngày KH được nợ trước khi tính QUÁ HẠN. Chính sách: ~50kg→3 ngày · 50–100kg→7 ngày · >200tr/tháng→15 ngày.') : ''}</label>
          <select id="eCreditDays">${window.creditDaysOptions ? window.creditDaysOptions(window.custCreditDays ? window.custCreditDays(c.id) : '') : '<option value="7">7 ngày</option>'}</select></div>
      </div>
      <div class="form-row wide"><label>Địa chỉ</label><input id="eAddress" value="${c.address}"></div>
      <div class="form-row">
        <div><label>Nguồn khách (đến từ đâu) *</label>
          <select id="eSource">${(window.srcGroup && window.srcGroup(c.source) === 'other' && c.source) ? `<option value="${String(c.source).replace(/"/g,'&quot;')}" selected>Giữ nguyên: ${c.source}</option>` : ''}${window.MD.options('sources', window.srcGroup ? window.srcGroup(c.source) : c.source)}</select></div>
        <div><label>Tần suất đặt</label>
          <select id="eFreq">${window.MD.options('orderFreq', c.orderFreq)}</select></div>
      </div>
      <div class="form-row">
        <div><label>Tỉnh/TP</label>
          <select id="eProvince"><option value="">— Chọn —</option>${(window.MD.get('provinces')||[]).map(p=>{const v=(typeof p==='string'?p:(p.label||p.id||''));return `<option value="${v}" ${c.province===v?'selected':''}>${v}</option>`;}).join('')}</select></div>
        <div><label>Ngày tạo (ngày KH đến) ${window.helpTip?window.helpTip('Quyết định doanh thu MKT của khách này cộng vào NGÀY nào trong báo cáo Chi phí Ads.'):''}</label>
          <input id="eCreated" type="date" value="${_toDI(c.created)}"></div>
      </div>
      ${_biz ? `
      <div class="section-h" style="margin:10px 0 4px">🏢 Thông tin doanh nghiệp</div>
      <div class="form-row">
        <div><label>Tên công ty</label><input id="eCompany" value="${(c.company||'').replace(/"/g,'&quot;')}"></div>
        <div><label>Mã số thuế</label><input id="eTax" value="${(c.tax||'').replace(/"/g,'&quot;')}"></div>
      </div>
      <div class="form-row">
        <div><label>Người đại diện</label><input id="eRep" value="${(c.rep||'').replace(/"/g,'&quot;')}"></div>
        <div><label>Hợp đồng</label><input id="eContract" value="${(c.contract||'').replace(/"/g,'&quot;')}"></div>
      </div>` : ''}
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-navy" onclick="window.submitEditCustomer('${id}')">💾 Lưu thay đổi</button>`,
      width: '620px'
    });
  }
  window.submitEditCustomer = function(id) {
    const patch = {
      type: window.formVal('#eType'),
      group: window.formVal('#eGroup'),
      priceTier: window.formVal('#ePriceTier'),
      name: window.formVal('#eName'),
      contact: window.formVal('#eName'),
      phone: window.formVal('#ePhone'),
      email: window.formVal('#eEmail'),
      zalo: window.formVal('#eZalo'),
      fb: window.formVal('#eFb'),
      staffOwner: window.formVal('#eStaff'),
      address: window.formVal('#eAddress'),
      source: window.formVal('#eSource'),
      orderFreq: window.formVal('#eFreq'),
      province: window.formVal('#eProvince'),
    };
    /* Ngày tạo (yyyy-mm-dd → dd/mm/yyyy) — quyết định doanh thu MKT cộng vào ngày nào ở báo cáo Ads */
    const cr = window.formVal('#eCreated');
    if (cr) { const [y,m,d] = cr.split('-'); patch.created = `${d}/${m}/${y}`; }
    /* Thông tin DN (chỉ khi có trên form = KH doanh nghiệp) */
    const gv = (sel) => { const el = document.querySelector(sel); return el ? el.value.trim() : undefined; };
    ['company:#eCompany','tax:#eTax','rep:#eRep','contract:#eContract'].forEach(pair => {
      const [f, s] = pair.split(':'); const v = gv(s); if (v !== undefined) patch[f] = v;
    });
    window.STORE.update('customers', id, patch);
    /* Nhóm giá KH → KV custPriceTiers (sync đa máy) */
    if (window.setCustPriceTier) window.setCustPriceTier(id, window.formVal('#ePriceTier'));
    if (window.setCustCreditDays) window.setCustCreditDays(id, window.formVal('#eCreditDays'));
    window.closeModal();
    window.toast('✓ Đã cập nhật ' + id, 'success');
  };

  /* ============ Wire events ============ */
  window.setQuickFilter = function (v) {
    currentQuick = v;
    curPage = 1;
    document.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x.dataset.quick === v));
    const sel = document.getElementById('quickSelect');
    if (sel && sel.value !== v) sel.value = v;
    render();
  };
  document.querySelectorAll('.chip').forEach(ch => {
    ch.addEventListener('click', () => window.setQuickFilter(ch.dataset.quick));
  });
  ['qSearch', 'fStaff'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => { curPage = 1; render(); });
    document.getElementById(id)?.addEventListener('change', () => { curPage = 1; render(); });
  });
  document.getElementById('custPageSize')?.addEventListener('change', () => { curPage = 1; render(); });
  window.clearFilters = function () {
    ['fStaff'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const q = document.getElementById('qSearch'); if (q) q.value = '';
    render();
  };

  /* ============ NHẬP CSV ============ */
  window.importCustomersCsv = function () {
    document.getElementById('custCsvFile').click();
  };
  window.handleCustCsvFile = function (e) {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '').replace(/^﻿/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { window.toast('File rỗng hoặc thiếu dữ liệu', 'warn'); return; }
      /* Parse CSV with naive quote handling */
      function parseLine(s) {
        const out = []; let cur = '', inQ = false;
        for (let i = 0; i < s.length; i++) {
          const ch = s[i];
          if (ch === '"') { if (inQ && s[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
          else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
          else cur += ch;
        }
        out.push(cur); return out;
      }
      const header = parseLine(lines[0]).map(h => h.trim().toLowerCase());
      /* Mapping: chấp nhận header tiếng Việt hoặc tiếng Anh */
      const colIdx = (keys) => header.findIndex(h => keys.some(k => h.includes(k)));
      const ix = {
        code: colIdx(['mã','code']),
        name: colIdx(['tên kh','tên','name']),
        type: colIdx(['loại hình','type']),
        phone: colIdx(['sđt','phone','dien thoai']),
        email: colIdx(['email']),
        address: colIdx(['địa chỉ','address']),
        staff: colIdx(['nv phụ trách','staff']),
        source: colIdx(['nguồn','source']),
        revenue: colIdx(['doanh thu','revenue']),
        debt: colIdx(['công nợ','debt']),
        orders: colIdx(['tổng đơn','số đơn','orders']),
      };
      if (ix.name < 0) { window.toast('CSV phải có cột "Tên KH"', 'danger'); return; }
      let added = 0, updated = 0, skipped = 0;
      const all = window.STORE.get('customers', window.CUSTOMERS || []).slice();
      const nextNum = () => {
        let max = 0;
        all.forEach(c => { const n = parseInt((c.code || c.id || '').replace(/\D/g, ''), 10); if (n > max) max = n; });
        return max + 1;
      };
      for (let r = 1; r < lines.length; r++) {
        const row = parseLine(lines[r]);
        const name = (row[ix.name] || '').trim();
        if (!name) { skipped++; continue; }
        const codeRaw = ix.code >= 0 ? (row[ix.code] || '').trim() : '';
        const code = codeRaw || ('KH' + String(nextNum()).padStart(3, '0'));
        const existing = all.find(c => c.code === code || c.id === code);
        const data = {
          id: code, code,
          name,
          type: ix.type >= 0 ? (row[ix.type] || '').trim() : (existing?.type || ''),
          phone: ix.phone >= 0 ? (row[ix.phone] || '').trim() : (existing?.phone || ''),
          email: ix.email >= 0 ? (row[ix.email] || '').trim() : (existing?.email || ''),
          address: ix.address >= 0 ? (row[ix.address] || '').trim() : (existing?.address || ''),
          staffOwner: ix.staff >= 0 ? (row[ix.staff] || '').trim() : (existing?.staffOwner || ''),
          source: ix.source >= 0 ? (row[ix.source] || '').trim() : (existing?.source || ''),
          revenue: ix.revenue >= 0 ? (parseInt(row[ix.revenue], 10) || 0) : (existing?.revenue || 0),
          debt: ix.debt >= 0 ? (parseInt(row[ix.debt], 10) || 0) : (existing?.debt || 0),
          orders: ix.orders >= 0 ? (parseInt(row[ix.orders], 10) || 0) : (existing?.orders || 0),
          status: existing?.status || 'active',
          created: existing?.created || new Date().toLocaleDateString('vi-VN'),
        };
        if (existing) { Object.assign(existing, data); updated++; }
        else { all.push(data); added++; }
      }
      window.STORE.set('customers', all);
      customers = window.STORE.get('customers');
      window.toast(`✓ Đã nhập: ${added} mới · ${updated} cập nhật · ${skipped} bỏ qua`, 'success');
      e.target.value = '';
    };
    reader.readAsText(f, 'utf-8');
  };

  /* ============ CỘT HIỂN THỊ ============ */
  const COL_DEFS = [
    { idx: 2, key: 'address',   label: 'Địa chỉ' },
    { idx: 3, key: 'staff',     label: 'NV phụ trách' },
    { idx: 4, key: 'orders',    label: 'Số đơn' },
    { idx: 5, key: 'revenue',   label: 'Doanh thu' },
    { idx: 6, key: 'debt',      label: 'Công nợ' },
  ];
  function getColPrefs() {
    const p = window.STORE.get('custColPrefs', null);
    if (!p) { const def = {}; COL_DEFS.forEach(c => def[c.key] = true); return def; }
    return p;
  }
  function applyColPrefs() {
    const p = getColPrefs();
    COL_DEFS.forEach(c => {
      const sel = `table thead tr th:nth-child(${c.idx + 1}), table tbody tr td:nth-child(${c.idx + 1})`;
      document.querySelectorAll(sel).forEach(el => { el.style.display = p[c.key] === false ? 'none' : ''; });
    });
  }
  window.openCustColPicker = function () {
    const p = getColPrefs();
    const html = `<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Bỏ tick để ẩn cột. Cài đặt lưu vào trình duyệt.</div>
      ${COL_DEFS.map(c => `<label class="check-item"><input type="checkbox" data-col="${c.key}" ${p[c.key] !== false ? 'checked' : ''}> <span>${c.label}</span></label>`).join('')}`;
    window.openModal('⚙ Cột hiển thị', html, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-primary" onclick="window.saveCustColPrefs()">Áp dụng</button>`,
      width: '360px',
    });
  };
  window.saveCustColPrefs = function () {
    const prefs = {};
    document.querySelectorAll('input[data-col]').forEach(cb => { prefs[cb.dataset.col] = cb.checked; });
    window.STORE.set('custColPrefs', prefs);
    window.closeModal();
    applyColPrefs();
    window.toast('✓ Đã cập nhật cột hiển thị', 'success');
  };

  /* ============ SẮP XẾP ============ */
  let custSort = window.STORE.get('custSort', { by: 'name', dir: 'asc' });
  window.openCustSortPicker = function () {
    const html = `<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Chọn cột sắp xếp + thứ tự.</div>
      <div class="form-row">
        <div><label>Sắp xếp theo</label>
          <select id="srtBy">
            <option value="name" ${custSort.by==='name'?'selected':''}>Tên KH (A-Z)</option>
            <option value="code" ${custSort.by==='code'?'selected':''}>Mã KH</option>
            <option value="revenue" ${custSort.by==='revenue'?'selected':''}>Doanh thu</option>
            <option value="debt" ${custSort.by==='debt'?'selected':''}>Công nợ</option>
            <option value="orders" ${custSort.by==='orders'?'selected':''}>Số đơn</option>
            <option value="lastContact" ${custSort.by==='lastContact'?'selected':''}>Liên hệ cuối</option>
          </select></div>
        <div><label>Thứ tự</label>
          <select id="srtDir">
            <option value="asc" ${custSort.dir==='asc'?'selected':''}>↑ Tăng dần</option>
            <option value="desc" ${custSort.dir==='desc'?'selected':''}>↓ Giảm dần</option>
          </select></div>
      </div>`;
    window.openModal('↕ Sắp xếp', html, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-primary" onclick="window.applyCustSort()">Áp dụng</button>`,
      width: '420px',
    });
  };
  window.applyCustSort = function () {
    custSort = { by: document.getElementById('srtBy').value, dir: document.getElementById('srtDir').value };
    window.STORE.set('custSort', custSort);
    window.closeModal();
    render();
    window.toast('✓ Đã sắp xếp', 'success');
  };
  /* Hook sort vào render() — patch sau khi render xong */
  const origRender = render;
  /* không thể override do scope IIFE — thay vào đó monkey-patch tbody sort */
  function sortCustomers(arr) {
    const a = arr.slice();
    const by = custSort.by, dir = custSort.dir === 'desc' ? -1 : 1;
    a.sort((x, y) => {
      let xv = x[by], yv = y[by];
      if (by === 'name' || by === 'code' || by === 'lastContact') {
        xv = String(xv || ''); yv = String(yv || '');
        return xv.localeCompare(yv) * dir;
      }
      return ((xv || 0) - (yv || 0)) * dir;
    });
    return a;
  }
  /* Wrap render: sau khi tbody render xong, sort rows */
  window.STORE.subscribe('customers', () => setTimeout(() => sortAndReorderTbody(), 0));
  function sortAndReorderTbody() {
    const tbody = document.getElementById('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr[data-id]'));
    if (!rows.length) return;
    const map = new Map(rows.map(r => [r.dataset.id, r]));
    const sorted = sortCustomers(customers.filter(c => map.has(c.id))).map(c => map.get(c.id));
    sorted.forEach(r => tbody.appendChild(r));
    applyColPrefs();
  }

  /* ============ FILE ĐÍNH KÈM ============ */
  window.uploadCustomerFiles = function (e) {
    const files = Array.from(e.target.files || []);
    const id = window._currentDrawerCust;
    if (!id) return;
    const c = customers.find(x => x.id === id); if (!c) return;
    const attachments = (c.attachments || []).slice();
    let processed = 0;
    files.forEach(f => {
      if (f.size > 2 * 1024 * 1024) { window.toast(`${f.name}: quá 2MB, bỏ qua`, 'warn'); processed++; if (processed === files.length) finish(); return; }
      const reader = new FileReader();
      reader.onload = () => {
        attachments.unshift({
          id: 'F' + Date.now() + Math.random().toString(36).slice(2, 6),
          name: f.name, type: f.type || 'application/octet-stream',
          size: f.size, dataUrl: reader.result,
          uploadedAt: new Date().toLocaleString('vi-VN'),
          uploadedBy: (window.CURRENT_USER && window.CURRENT_USER.name) || 'Tôi',
        });
        processed++;
        if (processed === files.length) finish();
      };
      reader.readAsDataURL(f);
    });
    function finish() {
      window.STORE.update('customers', id, { attachments });
      customers = window.STORE.get('customers');
      const cu = customers.find(x => x.id === id);
      renderCustomerFiles(cu);
      window.toast(`✓ Đã tải ${files.length} file`, 'success');
      e.target.value = '';
    }
  };
  function renderCustomerFiles(c) {
    const list = document.getElementById('custFileList');
    if (!list) return;
    const files = (c && c.attachments) || [];
    const cnt = document.getElementById('tabFileCnt'); if (cnt) cnt.textContent = files.length;
    if (!files.length) {
      list.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:13px;background:#FAFAFB;border-radius:10px">📂 Chưa có file nào.<br><span style="font-size:11px">Bấm "Tải file lên" để bắt đầu.</span></div>`;
      return;
    }
    function sizeFmt(b) { if (b < 1024) return b+' B'; if (b<1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(2)+' MB'; }
    function icon(t) { if (t.includes('pdf')) return '📄'; if (t.includes('image')) return '🖼'; if (t.includes('word')||t.includes('document')) return '📝'; if (t.includes('sheet')||t.includes('excel')) return '📊'; return '📎'; }
    list.innerHTML = files.map(f => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px">
      <div style="font-size:24px">${icon(f.type)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
        <div style="font-size:11px;color:var(--muted)">${sizeFmt(f.size)} · ${f.uploadedAt} · ${f.uploadedBy}</div>
      </div>
      <a class="btn btn-sm btn-ghost" href="${f.dataUrl}" download="${f.name}">⬇</a>
      <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="window.removeCustomerFile('${f.id}')">🗑</button>
    </div>`).join('');
  }
  window.removeCustomerFile = function (fid) {
    const id = window._currentDrawerCust; if (!id) return;
    if (!confirm('Xóa file này?')) return;
    const c = customers.find(x => x.id === id); if (!c) return;
    const attachments = (c.attachments || []).filter(f => f.id !== fid);
    window.STORE.update('customers', id, { attachments });
    customers = window.STORE.get('customers');
    renderCustomerFiles(customers.find(x => x.id === id));
    window.toast('Đã xóa file', 'danger');
  };

  /* === Render tab "Từ điển riêng" cho 1 KH === */
  function renderCustomerPrefs(c) {
    const host = document.getElementById('prefContent');
    if (!host || !window.CustPrefs) return;
    const p = window.CustPrefs.get(c.id);
    const products = window.STORE.get('products', window.PRODUCTS || []) || [];
    const aliasCount = Object.keys(p.aliases || {}).length;
    /* Update tab badge */
    const badge = document.getElementById('tabPrefCnt');
    if (badge) badge.textContent = aliasCount;
    const tabHelp = document.getElementById('tabPrefHelp');
    if (tabHelp && window.helpTip) tabHelp.innerHTML = window.helpTip('Lưu từ điển riêng cho KH này — vd "hành" = "Hành tây trắng". AI dùng để parse ảnh đơn chính xác. Tự học khi bạn map thủ công các từ AI không hiểu.');

    let html = `<div style="background:#EFF6FF;border-left:3px solid #1E40AF;padding:10px 12px;border-radius:6px;font-size:12.5px;color:#1E40AF;margin-bottom:14px;line-height:1.55">
      💡 <b>Vấn đề thật:</b> KH "${c.name}" hay nhắn ngắn (vd <i>"hành 50kg"</i>) nhưng kho có nhiều loại hành (tây/ta/lá). Dạy hệ thống <b>1 lần</b> — AI sẽ tự hiểu mọi lần sau.
    </div>`;

    /* Section: Từ điển */
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <h4 style="margin:0;font-size:13px;color:var(--navy);text-transform:uppercase">📖 Từ điển hiện có (${aliasCount})</h4>
      <div style="flex:1"></div>
      <button class="btn btn-primary btn-sm" onclick="window.openCustAliasMgr('${c.id}')">+ Quản lý chi tiết</button>
    </div>`;
    if (aliasCount) {
      html += `<table class="mini-table" style="width:100%;margin-bottom:14px">
        <thead><tr><th>Khi KH viết</th><th>= SP nào</th><th>SL TB</th></tr></thead>
        <tbody>${Object.entries(p.aliases).map(([w, pid]) => {
          const prod = products.find(x => x.id === pid);
          return `<tr><td><b>"${w}"</b></td><td>${prod ? prod.name + ' <span style="color:var(--muted);font-family:monospace;font-size:11px">'+pid+'</span>' : '<i style="color:#DC2626">SP không còn</i>'}</td><td>${p.defaultQty[pid] || '—'}</td></tr>`;
        }).join('')}</tbody>
      </table>`;
    } else {
      html += `<div style="padding:14px;background:#FAFBFC;border:1px dashed var(--line);border-radius:7px;text-align:center;color:var(--muted);font-size:12.5px;margin-bottom:14px">
        Chưa có từ điển nào. Bấm <b>+ Quản lý chi tiết</b> để thêm thủ công — hoặc tạo đơn từ ảnh, AI sẽ tự hỏi học.
      </div>`;
    }

    /* Section: SP hay đặt */
    html += `<h4 style="margin:14px 0 8px;font-size:13px;color:var(--navy);text-transform:uppercase">⭐ Top SP KH này hay đặt</h4>`;
    if (p.favorites && p.favorites.length) {
      html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">${p.favorites.map(pid => {
        const prod = products.find(x => x.id === pid);
        if (!prod) return '';
        return `<span style="background:#F0FDF4;color:#15803D;padding:4px 10px;border-radius:99px;font-size:12px;font-weight:600">${prod.name}${p.defaultQty[pid] ? ' · ~' + p.defaultQty[pid] + prod.unit : ''}</span>`;
      }).join('')}</div>`;
    } else {
      html += `<div style="color:var(--muted);font-size:12px;margin-bottom:14px">Chưa đủ dữ liệu — sau vài đơn hệ thống sẽ tự tổng hợp.</div>`;
    }

    /* Section: Đơn gần nhất */
    html += `<h4 style="margin:14px 0 8px;font-size:13px;color:var(--navy);text-transform:uppercase">🕐 Đơn gần nhất (cache để gợi ý)</h4>`;
    if (p.lastOrderItems && p.lastOrderItems.length) {
      html += `<table class="mini-table" style="width:100%">
        <thead><tr><th>SP</th><th>SL</th><th>Đơn giá</th></tr></thead>
        <tbody>${p.lastOrderItems.map(it => `<tr><td>${it.name}</td><td>${it.qty} ${it.unit||''}</td><td>${window.fmt(it.price||0)}</td></tr>`).join('')}</tbody>
      </table>`;
    } else {
      html += `<div style="color:var(--muted);font-size:12px">Chưa có đơn nào.</div>`;
    }

    /* Section: Lịch sử 20 đơn */
    if (p.history && p.history.length) {
      html += `<h4 style="margin:14px 0 8px;font-size:13px;color:var(--navy);text-transform:uppercase">📅 Lịch sử ${p.history.length} đơn gần nhất</h4>
        <div style="font-size:11.5px;color:var(--muted)">${p.history.slice(0,5).map(h => `${h.date}: ${h.items.length} SP`).join(' · ')}</div>`;
    }

    host.innerHTML = html;
  }

  /* === Quick-action: tạo đơn / mẫu định kỳ / báo giá cho KH đang xem === */
  window.createOrderForCurrentCust = function() {
    const id = window._currentDrawerCust;
    if (!id) return;
    window.location.href = 'orders.html?createFor=' + id;
  };
  window.createRecurringForCurrentCust = function() {
    const id = window._currentDrawerCust;
    if (!id) return;
    const c = customers.find(x => x.id === id);
    sessionStorage.setItem('_pendingRO', JSON.stringify({
      custId: id, custName: c?.name || '',
      items: [], fromCustomer: true,
    }));
    window.location.href = 'recurring.html';
  };
  window.createQuoteForCurrentCust = function() {
    const id = window._currentDrawerCust;
    if (!id) return;
    sessionStorage.setItem('_pendingQuote', JSON.stringify({ custId: id }));
    window.location.href = 'quotes.html';
  };

  /* Gộp nhiều lần re-render (customers/orders/debtLedger về gần nhau) thành 1 khung hình → hết giật */
  let _rafPending = false;
  function scheduleRender() {
    if (_rafPending) return;
    _rafPending = true;
    const run = () => { _rafPending = false; render(); };
    if (window.requestAnimationFrame) requestAnimationFrame(run); else setTimeout(run, 16);
  }
  /* Subscribe re-render when STORE.customers changes */
  window.STORE.subscribe('customers', scheduleRender);
  /* Đơn hàng / sổ công nợ đổi → tính lại số đơn·doanh thu·công nợ trên trang KH */
  window.STORE.subscribe('orders', scheduleRender);
  window.STORE.subscribe('debtLedger', scheduleRender);
  window.STORE.subscribe('__preloaded__', k => { if (k === 'orders' || k === 'debtLedger' || k === 'customers') scheduleRender(); });

  /* Init */
  window.renderAppShell('customers', 'Quản lý khách hàng');
  window.bindTabs();
  render();
  /* Nạp orders + sổ công nợ (cho cột số đơn/doanh thu/công nợ) HOÃN 1 nhịp để danh sách KH
     hiện TRƯỚC — customers (nhẹ, ~vài chục dòng) không phải tranh DB/CPU với ~900 đơn (nặng). */
  setTimeout(() => { window.STORE.get('orders', window.ORDERS || []); window.STORE.get('debtLedger', []); }, 350);
  setTimeout(() => { sortAndReorderTbody(); applyColPrefs(); }, 100);
  /* WATCHDOG: chuyển module mà getAll lỗi → khách KHÔNG hiện; ép nạp lại từ cloud vài lần (hết phải F5) */
  [1500, 4000, 8000].forEach(t => setTimeout(() => {
    if (window.STORE.reloadIfStale) window.STORE.reloadIfStale('customers', 1).then(did => { if (did) scheduleRender(); });
  }, t));
})();
