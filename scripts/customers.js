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
  /* Migration: localStorage còn dữ liệu KH theo schema cũ (logistics B2B/B2C, service/route)
     → seed lại bộ KH nông sản mới */
  if (customers.some(c => c.type === 'B2B' || c.type === 'B2C' || c.service || c.route)) {
    window.STORE.set('customers', initialData);
    customers = initialData;
  }
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

  let currentQuick = 'all';
  let curPage = 1;
  let pageSize = 25;

  const tbody = document.getElementById('tbody');
  const rowCount = document.getElementById('rowCount');
  const footCount = document.getElementById('footCount');

  /* ============ Helper: cập nhật số đếm chip ============ */
  function updateChipCounts() {
    customers = scopeCustomers(window.STORE.get('customers', initialData));
    const counts = {
      all:   customers.length,
      b2b:   customers.filter(c => c.type !== 'ca-nhan').length,
      b2c:   customers.filter(c => c.type === 'ca-nhan').length,
      vip:   customers.filter(c => c.group === 'VIP').length,
      debt:  customers.filter(c => c.debt > 0).length,
      new:   customers.filter(c => c.group === 'Mới').length,
      inact: customers.filter(c => !c.active || c.group === 'Inactive').length,
    };
    Object.keys(counts).forEach(k => {
      const el = document.querySelector(`[data-cnt="${k}"]`);
      if (el) el.textContent = counts[k];
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
    const rows = customers.filter(c => quickMatch(c) && filterMatch(c) && searchMatch(c));
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

    tbody.innerHTML = slice.map(c => {
      const ava = window.initials(c.name);
      const col = window.avatarColor(c.id);
      const groupTag = c.group === 'VIP' ? 'tag-vip'
                      : c.group === 'Mới' ? 'tag-moi'
                      : c.group === 'Inactive' ? 'tag-inact' : 'tag-thuong';
      const tm = typeMeta(c.type);
      const debtCls = c.debtOverdue > 0 ? 'danger' : c.debt > 0 ? 'warn' : 'ok';
      const debtVal = c.debt > 0 ? window.fmt(c.debt) : '—';
      const overdueBadge = c.debtOverdue > 0
        ? ' <span style="font-size:10px;background:var(--danger-bg);color:var(--danger);padding:0 4px;border-radius:3px">quá hạn</span>'
        : '';
      const phoneClean = (c.phone || '').replace(/\s/g,'');
      return `<tr data-id="${c.id}">
        <td onclick="event.stopPropagation()"><div class="checkbox" onclick="this.classList.toggle('on')"></div></td>
        <td data-field="name" title="Click để sửa tên KH">
          <div class="cust-cell">
            <div class="cust-ava" style="background:${col}">${ava}</div>
            <div class="cust-info">
              <div class="n1">${c.name}</div>
              <div class="n2">${c.code} · ${c.phone}</div>
            </div>
          </div>
        </td>
        <td class="hide-sm" data-field="type"><span class="tag" style="background:${tm.color}1f;color:${tm.color}">${tm.label}</span></td>
        <td class="hide-sm" data-field="group"><span class="tag ${groupTag}">${c.group}</span></td>
        <td class="hide-md" data-field="province">${c.province}</td>
        <td class="hide-md" data-field="orderFreq" style="font-size:12px;color:var(--muted)">${freqLabel(c.orderFreq)}</td>
        <td class="hide-md" data-field="staffOwner"><span class="staff-pill">${c.staffOwner}</span></td>
        <td class="num">${c.orders}</td>
        <td class="num">${window.fmt(c.revenue)}</td>
        <td class="num debt-cell ${debtCls}">${debtVal}${overdueBadge}</td>
        <td class="hide-md" style="font-size:12px;color:var(--muted)">${c.lastContact}</td>
        <td onclick="event.stopPropagation()">
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
            }
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
            province:   { type: 'select',
                          options: () => (window.MD.get('provinces')||[]).map(p => typeof p==='string'?p:p.label||p.id),
                          format: v => v || '—' },
            orderFreq:  { type: 'select',
                          options: () => window.MD.get('orderFreq').map(o => ({ value: o.id, label: o.label })),
                          format: v => freqLabel(v) },
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
          case 'zalo':
            window.open('https://zalo.me/' + phone, '_blank');
            window.toast('Mở Zalo: ' + c.phone, 'info');
            break;
          case 'call':
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
    const g  = document.getElementById('fGroup').value;
    const p  = document.getElementById('fProvince').value;
    const s  = document.getElementById('fService').value;
    const st = document.getElementById('fStatus').value;
    if (g && c.group !== g) return false;
    if (p && c.province !== p) return false;
    if (s && c.type !== s) return false;
    if (st === 'active' && !c.active) return false;
    if (st === 'inactive' && c.active) return false;
    return true;
  }
  function searchMatch(c) {
    const q = document.getElementById('qSearch').value.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.code, c.phone, c.email, c.contact, c.company]
      .filter(Boolean).some(x => x.toLowerCase().includes(q));
  }

  /* ============ DRAWER ============ */
  window.openCustomerDrawer = function (id) {
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
    document.getElementById('iPhone').textContent   = c.phone;
    document.getElementById('iEmail').innerHTML     = c.email || '<span class="empty">(chưa có)</span>';
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
    const dtb = document.querySelector('#debtTable tbody');
    if (c.debt > 0) {
      dtb.innerHTML = `
        <tr><td>01/04/2026</td><td>VAT-04A-128</td><td>Tiền hàng tháng 4</td>
            <td class="num">${window.fmt(c.debt + 8_000_000)}</td>
            <td class="num">—</td>
            <td class="num">${window.fmt(c.debt + 8_000_000)}</td></tr>
        <tr><td>15/04/2026</td><td>UNC-2604</td><td>Thanh toán đợt 1</td>
            <td class="num">—</td>
            <td class="num">${window.fmt(8_000_000)}</td>
            <td class="num">${window.fmt(c.debt)}</td></tr>
        <tr style="background:#FEFBF3"><td><b>Hiện tại</b></td><td>—</td><td>Số dư còn lại</td>
            <td class="num">—</td><td class="num">—</td>
            <td class="num" style="color:var(--warn);font-weight:700">${window.fmt(c.debt)}</td></tr>
      `;
    } else {
      dtb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--ok)">✓ Không có công nợ.</td></tr>`;
    }

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
        <div><label>SĐT chính *</label><input id="addPhone" placeholder="0912 xxx xxx"></div>
        <div><label>Email</label><input id="addEmail" type="email"></div>
      </div>
      <div class="form-row wide"><label>Địa chỉ</label><input id="addAddress" placeholder="Số nhà, đường, phường, quận, tỉnh"></div>
      <div class="form-row">
        <div><label>Tỉnh/TP</label>
          <select id="addProvince"><option value="">— Chọn —</option>${(window.MD.get('provinces')||[]).map(p=>{const v=(typeof p==='string'?p:(p.label||p.id||''));return `<option value="${v}">${v}</option>`;}).join('')}</select></div>
        <div><label>Tần suất đặt hàng</label>
          <select id="addFreq">${window.MD.options('orderFreq')}</select></div>
      </div>
      <div class="form-row">
        <div><label>Nhóm giá (bảng giá KH nhận)</label>
          <select id="addPriceTier">${window.priceTierOptions ? window.priceTierOptions('') : '<option value="">Mặc định</option>'}</select></div>
        <div></div>
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

  window.submitAddCustomer = function(thenCreateOrder) {
    const name = window.formVal('#addName');
    const phone = window.formVal('#addPhone');
    if (!name) { window.toast('Tên KH là bắt buộc', 'warn'); return; }
    if (!phone) { window.toast('SĐT là bắt buộc', 'warn'); return; }

    const code = window.formVal('#addCode');
    const newCust = decorate({
      id: code, code,
      type: window.formVal('#addType'),
      group: window.formVal('#addGroup'),
      priceTier: window.formVal('#addPriceTier'),
      name, contact: name,
      phone, email: window.formVal('#addEmail'),
      address: window.formVal('#addAddress'),
      province: window.formVal('#addProvince'),
      orderFreq: window.formVal('#addFreq'),
      mainCats: [],
      /* Sale tạo KH → BẮT BUỘC chủ sở hữu = chính mình (nếu không sẽ không thấy lại KH vừa tạo) */
      staffOwner: isScoped() ? myName() : window.formVal('#addStaff'),
      source: window.formVal('#addSource'),
      created: new Date().toLocaleDateString('vi-VN'),
      lastContact: new Date().toLocaleDateString('vi-VN'),
      lastOrder: '—',
      active: true,
      orders: 0, revenue: 0, debt: 0, debtOverdue: 0,
      ordersList: [], notes: [],
    });
    window.STORE.add('customers', newCust);
    window.closeModal();
    window.toast('✓ Đã thêm khách hàng ' + code, 'success');

    /* Nếu user bấm "Lưu & Tạo đơn ngay" → nhảy sang Orders với prefill */
    if (thenCreateOrder) {
      setTimeout(() => {
        window.location.href = 'orders.html?createFor=' + code;
      }, 500);
    }
  };

  /* ============ Edit Customer ============ */
  window.openEditCustomer = openEditCustomer;
  function openEditCustomer(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
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
          <select id="ePriceTier">${window.priceTierOptions ? window.priceTierOptions(c.priceTier || '') : '<option value="">Mặc định</option>'}</select></div>
        <div></div>
      </div>
      <div class="form-row wide"><label>Địa chỉ</label><input id="eAddress" value="${c.address}"></div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-navy" onclick="window.submitEditCustomer('${id}')">💾 Lưu thay đổi</button>`
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
      staffOwner: window.formVal('#eStaff'),
      address: window.formVal('#eAddress'),
    };
    window.STORE.update('customers', id, patch);
    window.closeModal();
    window.toast('✓ Đã cập nhật ' + id, 'success');
  };

  /* ============ Wire events ============ */
  document.querySelectorAll('.chip').forEach(ch => {
    ch.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
      ch.classList.add('active');
      currentQuick = ch.dataset.quick;
      curPage = 1;
      render();
    });
  });
  ['qSearch', 'fGroup', 'fProvince', 'fService', 'fStatus'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => { curPage = 1; render(); });
  });
  document.getElementById('custPageSize')?.addEventListener('change', () => { curPage = 1; render(); });
  window.clearFilters = function () {
    ['fGroup', 'fProvince', 'fService', 'fStatus'].forEach(id => {
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
    { idx: 2, key: 'type',      label: 'Loại hình' },
    { idx: 3, key: 'group',     label: 'Nhóm' },
    { idx: 4, key: 'province',  label: 'Tỉnh/TP' },
    { idx: 5, key: 'freq',      label: 'Tần suất đặt' },
    { idx: 6, key: 'staff',     label: 'NV phụ trách' },
    { idx: 7, key: 'orders',    label: 'Số đơn' },
    { idx: 8, key: 'revenue',   label: 'Doanh thu' },
    { idx: 9, key: 'debt',      label: 'Công nợ' },
    { idx: 10, key: 'lastContact', label: 'Liên hệ cuối' },
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

  /* Subscribe re-render when STORE.customers changes */
  window.STORE.subscribe('customers', render);

  /* Init */
  window.renderAppShell('customers', 'Quản lý khách hàng');
  window.bindTabs();
  render();
  setTimeout(() => { sortAndReorderTbody(); applyColPrefs(); }, 100);
})();
