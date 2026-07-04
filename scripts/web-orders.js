/* =========================================================
   Đơn từ web — nhận đơn website (bảng web_orders) → duyệt thành
   Khách hàng + Đơn chính thức trong CRM.
   ========================================================= */
(function () {
  const fmt = n => (Number(n) || 0).toLocaleString('vi-VN');
  const esc = s => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const PAY_LABEL = { cod: 'COD', bank: 'Chuyển khoản', momo: 'Momo', vnpay: 'VNPay' };

  let STATE = { filter: 'pending' };
  let ROWS = {};                       // id → row (đang hiển thị)

  const root = () => document.getElementById('woRoot');

  function card(r) {
    const items = Array.isArray(r.items) ? r.items : [];
    const itemsHtml = items.map(it => `
      <tr><td>${esc(it.name)}</td>
          <td class="num">${fmt(it.qty)} ${esc((it.unit || 'kg').replace('đ/', ''))}</td>
          <td class="num">${fmt(it.price)}đ</td>
          <td class="num"><b>${fmt(it.subtotal != null ? it.subtotal : it.price * it.qty)}đ</b></td></tr>`).join('');
    const pay = (r.payment || 'cod').toLowerCase();
    const tags = `
      <span class="pill ${pay}">${PAY_LABEL[pay] || pay}</span>
      ${r.recurring ? `<span class="pill recur">🔁 ${esc(r.recurring)}</span>` : ''}
      ${r.web_code ? `<span class="pill">${esc(r.web_code)}</span>` : ''}`;
    const when = r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '';

    let actions = '';
    if (r.status === 'pending') {
      actions = `<div class="wo-actions">
        <button class="btn btn-ghost" onclick="window.woReject('${r.id}')">✕ Từ chối</button>
        <button class="btn btn-primary" onclick="window.woConfirm('${r.id}')">✓ Duyệt → tạo đơn</button></div>`;
    } else if (r.status === 'confirmed') {
      actions = `<div class="wo-actions"><span class="pill recur">✓ Đã tạo đơn ${esc(r.linked_order || '')}${r.linked_cust ? ' · KH ' + esc(r.linked_cust) : ''}</span></div>`;
    } else {
      actions = `<div class="wo-actions"><span class="pill">✕ Đã từ chối${r.handled_by ? ' · ' + esc(r.handled_by) : ''}</span></div>`;
    }

    return `<div class="wo-card ${r.status === 'pending' ? 'pending' : ''}">
      <div class="wo-top">
        <div>
          <div class="who">${esc(r.cust_name)} · ☎ ${esc(r.cust_phone)}</div>
          <div class="meta">📍 ${esc(r.cust_address || '—')}${r.cust_email ? ' · ✉ ' + esc(r.cust_email) : ''}<br>🕐 ${esc(when)}${r.note ? ' · 📝 ' + esc(r.note) : ''}</div>
        </div>
        <div class="total">${fmt(r.total)}đ</div>
      </div>
      <div class="wo-tags">${tags}</div>
      <div class="wo-items"><table>${itemsHtml}</table></div>
      ${actions}
    </div>`;
  }

  function render(rows) {
    ROWS = {};
    rows.forEach(r => ROWS[r.id] = r);
    if (!rows.length) {
      root().innerHTML = `<div class="wo-empty">Không có đơn ở mục "${STATE.filter === 'pending' ? 'Chờ duyệt' : STATE.filter === 'confirmed' ? 'Đã duyệt' : 'Từ chối'}".</div>`;
    } else {
      root().innerHTML = rows.map(card).join('');
    }
  }

  async function load() {
    if (!window.SB) {
      root().innerHTML = `<div class="wo-empty">⚠ Chưa kết nối Supabase — kiểm tra cấu hình.</div>`;
      return;
    }
    root().innerHTML = `<div class="wo-empty">Đang tải…</div>`;
    const { data, error } = await window.SB.from('web_orders')
      .select('*').eq('status', STATE.filter).order('created_at', { ascending: false });
    if (error) { root().innerHTML = `<div class="wo-empty">Lỗi tải đơn: ${esc(error.message)}</div>`; return; }
    render(data || []);
    // cập nhật số "chờ duyệt" trên nút lọc
    if (STATE.filter === 'pending') {
      const c = document.getElementById('cPending');
      if (c) c.textContent = (data && data.length) ? `(${data.length})` : '';
    }
  }
  window.woReload = load;

  /* ---- Duyệt: tạo KH (nếu mới) + Đơn chính thức ---- */
  window.woConfirm = async function (id) {
    if (window.__busyWoConfirm) return; window.__busyWoConfirm = true; setTimeout(() => { window.__busyWoConfirm = false; }, 2500);   /* chống double-click duyệt đơn web → tạo trùng */
    const r = ROWS[id];
    if (!r) return;
    if (!confirm(`Duyệt đơn của "${r.cust_name}" → tạo Khách hàng (nếu mới) + Đơn hàng chính thức?`)) return;

    // 1) Khách hàng — tìm theo SĐT, chưa có thì tạo
    const norm = s => (s || '').replace(/\D/g, '');
    const custs = window.STORE.get('customers', []) || [];
    let cust = custs.find(c => norm(c.phone) && norm(c.phone) === norm(r.cust_phone));
    let custId;
    if (cust) {
      custId = cust.id;
    } else {
      custId = (window.STORE.nextCustCodeSafe ? await window.STORE.nextCustCodeSafe() : null) || window.STORE.nextId('customers', 'KH');
      window.STORE.add('customers', {
        id: custId, code: custId, type: '', group: 'Mới',
        name: r.cust_name, contact: r.cust_name,
        phone: r.cust_phone, email: r.cust_email || '',
        address: r.cust_address || '', province: r.province || '',
        orderFreq: r.recurring || '', mainCats: [], staffOwner: '', source: 'website',
        created: new Date().toLocaleDateString('vi-VN'),
        lastContact: new Date().toLocaleDateString('vi-VN'),
        lastOrder: '—', active: true,
        orders: 0, revenue: 0, debt: 0, debtOverdue: 0, ordersList: [], notes: [],
      });
    }

    // 2) Đơn hàng chính thức
    const items = (Array.isArray(r.items) ? r.items : []).map(it => ({
      id: it.slug || '', name: it.name, unit: (it.unit || 'kg').replace('đ/', ''),
      qty: it.qty, price: it.price, total: it.subtotal != null ? it.subtotal : (it.price || 0) * (it.qty || 0),
    }));
    const total = r.total != null ? r.total : items.reduce((s, it) => s + (it.total || 0), 0);
    let code;
    try {
      code = (window.SB_DATA && window.SB_DATA.nextCloudOrderCode)
        ? await window.SB_DATA.nextCloudOrderCode()
        : window.STORE.nextOrderCode();
    } catch (e) { code = window.STORE.nextOrderCode(); }
    const me = (window.CURRENT_USER || {}).name || '';
    window.STORE.add('orders', {
      code, date: new Date().toLocaleString('vi-VN'),
      cust: custId, custId: custId, custName: r.cust_name, custPhone: r.cust_phone,
      serviceType: '', transportMode: 'giao-ngay',
      pickup: 'Kho Tuấn Tú · 36 Tân Mai, Hoàng Mai, HN',
      drop: r.cust_address || '—',
      goods: items.map(it => it.name).join(', '),
      qty: items.reduce((s, it) => s + (it.qty || 0), 0), weight: 0, unit: 'kg',
      freight: total, cod: ((r.payment || 'cod') === 'cod' ? total : 0),
      payBy: (PAY_LABEL[(r.payment || 'cod')] || r.payment || 'COD'),
      external: false, status: 'confirmed', staff: me,
      source: 'web', createdAt: new Date().toISOString(),
      note: 'Đơn từ web' + (r.web_code ? ' · ' + r.web_code : '') + (r.note ? ' · ' + r.note : ''),
      items,
    });

    // 3) Đánh dấu đơn web đã duyệt
    const { error } = await window.SB.from('web_orders').update({
      status: 'confirmed', linked_order: code, linked_cust: custId,
      handled_by: me, handled_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { window.toast?.('Lưu trạng thái lỗi: ' + error.message, 'warn'); return; }

    window.toast?.(`✓ Đã tạo đơn ${code}${cust ? '' : ' + KH ' + custId}`, 'success');
    load();
    window.refreshWebOrdersBadge && window.refreshWebOrdersBadge();
  };

  window.woReject = async function (id) {
    const r = ROWS[id];
    if (!r) return;
    if (!confirm(`Từ chối đơn của "${r.cust_name}"?`)) return;
    const me = (window.CURRENT_USER || {}).name || '';
    const { error } = await window.SB.from('web_orders').update({
      status: 'rejected', handled_by: me, handled_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { window.toast?.('Lỗi: ' + error.message, 'warn'); return; }
    window.toast?.('Đã từ chối đơn', 'success');
    load();
    window.refreshWebOrdersBadge && window.refreshWebOrdersBadge();
  };

  /* ---- Boot ---- */
  window.renderAppShell('orders', 'Đơn từ web');

  document.getElementById('woFilter').addEventListener('click', e => {
    const b = e.target.closest('button[data-st]');
    if (!b) return;
    document.querySelectorAll('#woFilter button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    STATE.filter = b.dataset.st;
    load();
  });

  load();

  // Realtime: đơn web mới / đổi trạng thái → tải lại
  if (window.SB_DATA) window.SB_DATA.subscribe('web_orders', () => load());
})();
