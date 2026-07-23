/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — BẢNG GIAO HÀNG (cho Shipper)
   Kho GIAO SHIPPER ở Gom hàng → ③ Xuất kho (đơn thành "Đang giao").
   Bảng này CHỈ hiển thị đơn ĐANG GIAO → shipper bấm:
     [✅ Giao xong] → Đã giao (công nợ khách chốt)
     [↩️ Trả]       → popup chọn từng mặt hàng + SL + tình trạng (xấu/đẹp) + ghi chú → phiếu chờ kế toán duyệt
   ?mode=ship[&me=Tên] → giao diện rút gọn cho shipper (lọc theo tên).
   ========================================================= */
(function () {
  const S = () => window.STORE;
  const qs = new URLSearchParams(location.search);
  const SHIP_TOKEN = (qs.get('ship') || '').trim();          /* link bảo mật riêng mỗi shipper */
  const SHIP_MODE = qs.get('mode') === 'ship' || !!SHIP_TOKEN;
  /* Chỉ người ĐĂNG NHẬP tài khoản (mở board đầy đủ) mới được gán/đổi shipper.
     Vào bằng link shipper (SHIP_MODE) → KHÔNG có nút gán (tránh shipper tự chuyển đơn cho người khác). */
  const CAN_ASSIGN = !SHIP_MODE;

  const nowISO = () => new Date().toISOString();
  const fmt = n => (window.fmt ? window.fmt(n) : Number(n || 0).toLocaleString('vi-VN'));
  const ordList = () => (S().get('orders', window.ORDERS || []) || []);
  /* Nhân viên có vị trí SHIP (phần Nhân sự: dept/role = Ship / giao hàng / vận hành) */
  const _isShipStaff = s => /ship|giao\s*h[àa]ng|v[ậa]n\s*h[àa]nh/i.test((s.dept || '') + ' ' + (s.role || ''));
  /* Token link riêng mỗi shipper — LƯU KV 'shipperTokens' {id: token} (staff/shippers KHÔNG có cột link_token → phải KV) */
  const shipTokenMap = () => (S().get('shipperTokens', {}) || {});
  /* Danh sách shipper = SHIP CỐ ĐỊNH (Nhân sự phòng Ship) + SHIP NGOÀI (guest). Token lấy từ KV. */
  const shippers = () => {
    const tk = shipTokenMap();
    const staff = (S().get('staff', window.STAFF || []) || [])
      .filter(s => s && s.name && s.status !== 'inactive' && _isShipStaff(s))
      .map(s => ({ id: s.id, name: s.name, linkToken: tk[s.id], guest: false }));
    const guests = (S().get('shippers', window.DRIVERS || []) || [])
      .filter(s => s && s.name && s.guest)
      .map(s => ({ id: s.id, name: s.name, linkToken: tk[s.id], guest: true }));
    return staff.concat(guests);
  };
  const ordByCode = code => ordList().find(o => o.code === code);
  const isTransit = o => o.status === 'transit' || o.status === 'pickup';   /* pickup = đơn cũ đã dispatch trước bản v455 */
  /* Đã nạp xong dữ liệu để tra token chưa (tránh báo "hết hạn" oan khi đang tải) */
  const _tokReady = () => { const st = S(); return st.isPreloaded ? (st.isPreloaded('shipperTokens') && (st.isPreloaded('staff') || st.isPreloaded('shippers'))) : (Object.keys(shipTokenMap()).length > 0); };
  /* Shipper đang xem: ưu tiên TOKEN (?ship=), fallback ?me= (link cũ). */
  function resolveMe() {
    if (SHIP_TOKEN) {
      const tk = shipTokenMap();
      const id = Object.keys(tk).find(k => tk[k] === SHIP_TOKEN);
      if (id) {
        const sp = shippers().find(x => x.id === id);
        if (sp) return { name: sp.name };
        return _tokReady() ? { name: '', invalid: true } : { name: '', loading: true };   /* NV nghỉ/xoá → invalid */
      }
      return _tokReady() ? { name: '', invalid: true } : { name: '', loading: true };
    }
    return { name: (qs.get('me') || '').trim() };
  }
  const _norm = s => String(s || '').trim().toLowerCase();
  /* Đơn CHƯA có shipper nào nhận (để trống hoặc gạch ngang) → mọi shipper thấy để tự nhận */
  const _unclaimed = o => { const d = String(o.driverName || '').trim(); return !d || d === '—'; };
  const _isMine = (o, me) => _norm(o.driverName) === _norm(me.name);
  const mineOnly = o => {
    const me = resolveMe();
    if (me.invalid || me.loading) return false;
    if (!me.name) return true;                     /* kho / điều phối xem TẤT CẢ */
    /* shipper: thấy đơn CỦA MÌNH + đơn CHƯA ai nhận (nhận rồi → chỉ người nhận thấy) */
    return _isMine(o, me) || _unclaimed(o);
  };

  function itemsSummary(o) {
    const its = Array.isArray(o.items) ? o.items : [];
    if (!its.length) return (o.qty ? o.qty + ' kiện' : '—');
    const by = {};
    its.forEach(x => { const u = (x.unit || 'kg').toString().trim().toLowerCase() || 'kg'; by[u] = (by[u] || 0) + (+x.qty || 0); });
    return Object.keys(by).sort((a, b) => a === 'kg' ? -1 : b === 'kg' ? 1 : a.localeCompare(b, 'vi'))
      .map(u => `${Number.isInteger(by[u]) ? by[u] : Math.round(by[u] * 100) / 100} ${u}`).join(' · ') + ` · ${its.length} mã`;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shortAddr = a => { a = String(a || '').trim(); return a.length > 46 ? a.slice(0, 44) + '…' : (a || '—'); };

  /* ===== 1 dòng đơn ĐANG GIAO ===== */
  function cardHtml(o, me) {
    me = me || resolveMe();
    const cust = esc(o.custName || o.custId || 'Khách');
    const money = o.freight ? ` · <span class="gh-money">${fmt(o.freight)}₫</span>` : '';
    const ship = o.driverName ? `<span class="gh-ship">🛵 ${esc(o.driverName)}</span>` : `<span class="gh-ship gh-noship">🛵 chưa ai nhận</span>`;
    const podN = ((S().get('pod_photos', {}) || {})[o.code] || []).length;
    /* Nút GÁN chỉ hiện cho người ĐĂNG NHẬP tài khoản (kho/điều phối) — shipper vào bằng link KHÔNG được gán */
    const gan = CAN_ASSIGN ? `<a href="javascript:void(0)" onclick="ghAssignShipper('${esc(o.code)}')" style="color:#0EA5E9;font-size:11px;margin-left:6px;white-space:nowrap">✎ gán</a>` : '';
    /* SHIP MODE + đơn CHƯA nhận → chỉ hiện nút "Nhận đơn" (phải nhận rồi mới giao/trả được) */
    const claimable = SHIP_MODE && me.name && _unclaimed(o);
    const actions = claimable
      ? `<button class="gh-btn gh-claim" onclick="ghClaim('${esc(o.code)}')" title="Nhận đơn này về cho mình — shipper khác sẽ không thấy nữa">🙋 Nhận đơn này</button>`
      : `<button class="gh-btn gh-photo" onclick="ghAddPhoto('${esc(o.code)}')" title="Chụp mới hoặc chọn ảnh trong máy làm bằng chứng giao hàng">📷 Chụp/Chọn ảnh giao${podN ? ' · ' + podN + ' ảnh' : ''}</button>
        <div class="gh-act-row">
          <button class="gh-btn gh-done" onclick="ghGiaoXong('${esc(o.code)}')">✅ Giao xong</button>
          <button class="gh-btn gh-ret" onclick="ghBaoTra('${esc(o.code)}')">↩️ Trả</button>
        </div>`;
    return `<div class="gh-row${claimable ? ' gh-unclaimed' : ''}">
      <div class="gh-main">
        <div class="gh-title"><span class="gh-code">#${esc(o.code)}</span><b class="gh-cust">${cust}</b>${claimable ? '<span class="gh-flag">chưa ai nhận</span>' : ''}</div>
        <div class="gh-meta">📍 ${esc(shortAddr(o.drop))} · 📦 ${esc(itemsSummary(o))}${money} · ${ship}${gan}</div>
      </div>
      <div class="gh-act">${actions}</div>
    </div>`;
  }

  function render() {
    const host = document.getElementById('ghBoard'); if (!host) return;
    const me = resolveMe();
    if (SHIP_MODE) { const _hn = document.getElementById('ghShipName'); if (_hn) _hn.textContent = me.name ? ('🛵 ' + me.name) : (me.invalid ? '⚠ Link lỗi' : '🛵 Shipper'); }
    if (me.invalid) {   /* token sai / shipper đã bị xoá */
      host.innerHTML = `<div class="gh-empty">⚠ Link không hợp lệ hoặc đã hết hạn.<br><span style="font-size:12px">Liên hệ kho để lấy link mới.</span></div>`;
      const tE = document.getElementById('ghTabs'); if (tE) tE.innerHTML = '';
      return;
    }
    if (me.loading) { host.innerHTML = `<div class="gh-empty">Đang tải…</div>`; return; }
    let list = ordList().filter(o => isTransit(o) && mineOnly(o))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    /* Shipper: đơn CỦA MÌNH lên trên, đơn CHƯA nhận (tự nhận được) xuống dưới */
    const isShipper = SHIP_MODE && !!me.name;
    if (isShipper) list.sort((a, b) => (_unclaimed(a) ? 1 : 0) - (_unclaimed(b) ? 1 : 0));
    const nMine = isShipper ? list.filter(o => _isMine(o, me)).length : 0;
    const nOpen = isShipper ? list.filter(o => _unclaimed(o)).length : 0;
    const tabsEl = document.getElementById('ghTabs');
    if (tabsEl) tabsEl.innerHTML = `<div class="gh-count">🚚 Đang giao: <b>${list.length}</b> đơn${isShipper ? ` · của tôi <b>${nMine}</b> · chưa ai nhận <b style="color:#B45309">${nOpen}</b>` : (me.name ? ' · ' + esc(me.name) : '')}</div>`;
    if (!list.length) {
      host.innerHTML = `<div class="gh-empty">${me.name
        ? `Không có đơn đang giao cho "<b>${esc(me.name)}</b>", cũng chưa có đơn nào chờ nhận.`
        : '✓ Không có đơn nào đang giao.<br><span style="font-size:12px">Kho giao shipper ở <b>Gom hàng → ③ Xuất kho</b>, đơn sẽ hiện ở đây.</span>'}</div>`;
      return;
    }
    host.innerHTML = list.map(o => cardHtml(o, me)).join('');
  }
  window._ghRender = render;

  /* ===== SHIPPER TỰ NHẬN đơn chưa ai nhận → gán mình làm shipper ===== */
  window.ghClaim = async function (code) {
    const o = ordByCode(code); if (!o) return;
    const me = resolveMe();
    if (!me.name) { window.toast && window.toast('Không xác định được shipper (mở bằng link riêng của bạn)', 'warn'); return; }
    if (!_unclaimed(o)) { window.toast && window.toast('Đơn này đã có người nhận rồi', 'info'); render(); return; }
    if (!(await window.uiConfirm(`Nhận đơn #${code} về cho bạn?\nKhách: ${o.custName || ''}\n\n→ Đơn thành của bạn, shipper khác sẽ không thấy nữa.`, { title: '🙋 Nhận đơn', okText: '🙋 Nhận đơn' }))) return;
    const sp = shippers().find(x => _norm(x.name) === _norm(me.name));
    S().update('orders', code, { driver: sp ? sp.id : '', driverName: me.name });
    window.toast && window.toast('🙋 Đã nhận đơn ' + code + ' — chúc đi giao thuận lợi!', 'success');
    if (window.sendTgMessage) window.sendTgMessage('alert', `🙋 ${me.name} đã NHẬN đơn\n📦 ${code} · ${o.custName || ''}`);
    render();
  };

  /* ===== Gán / đổi shipper cho đơn (nhập tên → gợi ý) — KHÔNG đổi trạng thái ===== */
  window.ghAssignShipper = function (code) {
    const o = ordByCode(code); if (!o) return;
    const list = shippers();
    const dl = list.map(s => `<option value="${esc(s.name)}"></option>`).join('');
    const hint = list.length ? '' : '<div style="font-size:11.5px;color:#B45309;margin-top:6px">⚠ Chưa có shipper — thêm nhân viên vị trí <b>Ship</b> ở <a href="staff.html">Nhân sự</a>, hoặc tạo ship ngoài ở nút 🔗 Link.</div>';
    window.openModal('🛵 Gán shipper — ' + esc(code), `
      <div style="font-size:13px;color:#334155;margin-bottom:12px">Đơn <b>#${esc(code)}</b> · ${esc(o.custName || '')}</div>
      <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">Shipper phụ trách (gõ tên → chọn gợi ý)</label>
      <input id="ghShipInp" list="ghShipDL" value="${esc(o.driverName || '')}" placeholder="Gõ tên shipper…" autocomplete="off" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--line);border-radius:8px;font-size:14px">
      <datalist id="ghShipDL">${dl}</datalist>${hint}
      <div style="font-size:11.5px;color:var(--muted);margin-top:8px">Gán để shipper thấy đúng đơn của mình qua link riêng. Để trống = bỏ gán.</div>
    `, {
      width: '420px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
               <button class="btn btn-primary" onclick="window._ghConfirmShipper('${esc(code)}')">Lưu</button>`
    });
  };
  window._ghConfirmShipper = function (code) {
    const o = ordByCode(code); if (!o) return;
    const inp = document.getElementById('ghShipInp');
    const nm = inp ? inp.value.trim() : '';
    const norm = s => String(s || '').trim().toLowerCase();
    const s = nm ? shippers().find(x => norm(x.name) === norm(nm)) : null;
    S().update('orders', code, { driver: s ? s.id : '', driverName: s ? s.name : nm });
    window.closeModal && window.closeModal();
    window.toast && window.toast(nm ? ('🛵 Gán ' + (s ? s.name : nm) + ' cho ' + code + (s ? '' : ' (tên tự do)')) : ('Bỏ gán shipper ' + code), 'success');
    render();
  };

  /* ===== SHIP: Giao xong → Đã giao (công nợ chốt) ===== */
  window.ghGiaoXong = async function (code) {
    const o = ordByCode(code); if (!o) return;
    if (!(await window.uiConfirm(`Xác nhận GIAO XONG đơn ${code}?\nKhách: ${o.custName || ''}\n\n→ Đơn thành "Đã giao", công nợ khách được chốt.`, { title: '✅ Giao xong', okText: '✅ Giao xong' }))) return;
    S().update('orders', code, { status: 'delivered', deliveredAt: nowISO() });
    window.toast && window.toast('✓ Đã giao xong ' + code, 'success');
    if (window.sendTgMessage) window.sendTgMessage('alert', `✅ GIAO THÀNH CÔNG\n📦 ${code} · ${o.custName || ''}`);
    render();
  };

  /* ===== SHIP: Báo trả → popup chọn từng mặt hàng + SL + tình trạng + ghi chú RIÊNG mỗi SP ===== */
  window.ghBaoTra = async function (code) {
    const o = ordByCode(code); if (!o) return;
    let items = Array.isArray(o.items) ? o.items.slice() : [];
    if (!items.length && window.SB_DATA && window.SB_DATA.getOrderItems) {
      try { const its = await window.SB_DATA.getOrderItems(code); if (Array.isArray(its)) items = its; } catch (e) {}
    }
    window._ghTra = { code, items, custName: o.custName || '', cust: o.cust || '', freight: +o.freight || 0 };
    const rows = items.length ? items.map((it, i) => {
      const unit = esc(it.unit || 'kg');
      return `<div class="ght-item">
        <div class="ght-row">
          <div class="ght-info"><b>${esc(it.name || it.id)}</b><div class="ght-sub">đã giao ${fmt(it.qty || 0)} ${unit}${it.price ? ` · ${fmt(it.price)}₫/${unit}` : ''}</div></div>
          <input type="number" class="ght-q" data-i="${i}" min="0" max="${it.qty || 0}" step="0.1" value="" placeholder="0" inputmode="decimal" oninput="window._ghToggleDetail(${i})">
          <span class="ght-unit">${unit}</span>
        </div>
        <div class="ght-detail" id="ghtD${i}" style="display:none">
          <select class="ght-cond" data-i="${i}">
            <option value="bad">🗑 Hàng xấu/lỗi (trả NCC)</option>
            <option value="good">🏬 Hàng đẹp (giữ lại kho)</option>
          </select>
          <input class="ght-note" data-i="${i}" placeholder="Ghi chú riêng SP này (vd: dập nát)…">
        </div>
      </div>`;
    }).join('') : `<div style="color:#B45309;font-size:12.5px;padding:8px 0">Đơn chưa tải chi tiết mặt hàng — sẽ tạo phiếu trả <b>toàn bộ đơn</b> để kế toán kiểm lại.</div>`;
    window.openModal('↩️ Báo trả hàng — #' + esc(code), `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Khách: <b>${esc(o.custName || '')}</b>. Nhập số lượng <b>TRẢ</b> cho mặt hàng nào bị trả (để 0 nếu không trả). Gõ SL &gt; 0 sẽ hiện ô chọn <b>tình trạng + ghi chú riêng</b> cho SP đó.</div>
      <div id="ghTraList">${rows}</div>
      ${items.length ? `<button class="btn btn-ghost btn-sm" onclick="window._ghTraAll()" style="margin-top:8px">↩️ Trả toàn bộ đơn</button>` : ''}
    `, {
      width: '520px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
               <button class="btn" style="background:#EA580C;color:#fff;border-color:#EA580C" onclick="window._ghConfirmTra()">↩️ Tạo phiếu trả</button>`
    });
  };
  window._ghToggleDetail = function (i) {
    const q = parseFloat((document.querySelector(`.ght-q[data-i="${i}"]`) || {}).value) || 0;
    const d = document.getElementById('ghtD' + i);
    if (d) d.style.display = q > 0 ? 'flex' : 'none';
  };
  window._ghTraAll = function () {
    document.querySelectorAll('#ghTraList .ght-q').forEach(inp => {
      inp.value = inp.getAttribute('max') || 0;
      window._ghToggleDetail(+inp.getAttribute('data-i'));
    });
  };
  window._ghConfirmTra = function () {
    const T = window._ghTra; if (!T) return;
    const picked = [];
    document.querySelectorAll('#ghTraList .ght-q').forEach(inp => {
      const i = +inp.getAttribute('data-i'); const it = T.items[i]; if (!it) return;
      const q = Math.min(parseFloat(inp.value) || 0, (+it.qty > 0 ? +it.qty : (parseFloat(inp.value) || 0)));
      if (q > 0) {
        const cond = (document.querySelector(`.ght-cond[data-i="${i}"]`) || {}).value || 'bad';
        const note = ((document.querySelector(`.ght-note[data-i="${i}"]`) || {}).value || '').trim();
        picked.push({ id: it.id, name: it.name, unit: it.unit || 'kg', qty: q, price: +it.price || 0, total: Math.round(q * (+it.price || 0)), cond, note });
      }
    });
    if (T.items.length && !picked.length) { window.toast && window.toast('Nhập số lượng trả cho ít nhất 1 mặt hàng', 'warn'); return; }
    const anyBad = picked.some(x => x.cond === 'bad') || !picked.length;
    const refundTotal = picked.reduce((s, x) => s + x.total, 0) || (T.items.length ? 0 : T.freight);
    const first = picked[0] || null;
    const noteAll = picked.map(x => x.note ? `${x.name}: ${x.note}` : '').filter(Boolean).join(' · ');
    const rec = {
      id: (function(){const rs=window.STORE.get('returns',[])||[];let mx=0;rs.forEach(r=>{const m=String(r.id||'').match(/^TH0*(\d+)$/);if(m)mx=Math.max(mx,+m[1]);});return 'TH'+String(mx+1).padStart(4,'0');})(),
      orderCode: T.code, custId: T.cust, custName: T.custName,
      date: (window.viToday ? window.viToday() : new Date().toLocaleDateString('vi-VN')),
      items: picked,
      item: first ? { id: first.id, name: first.name, unit: first.unit, price: first.price } : null,
      qtyReturn: first ? first.qty : 0,
      reason: noteAll || (anyBad ? 'Hàng xấu/lỗi' : 'Khách trả'),
      caseType: 'onsite', resolution: 'refund',
      disposition: picked.length && picked.every(x => x.cond === 'good') ? 'restock' : 'discard',  /* tổng quát; xử lý theo từng SP khi duyệt */
      fault: anyBad ? 'supplier' : 'customer',
      refundMode: 'debt', supplierId: '', supplierName: '', supClaimAmount: 0,
      refundTotal, note: noteAll, status: 'pending', fromShip: true,
      handledBy: (window.CURRENT_USER && window.CURRENT_USER.name) || 'shipper', reportedAt: nowISO(),
    };
    window.STORE.add('returns', rec);
    S().update('orders', T.code, { status: 'delivered', deliveredAt: nowISO() });
    window.closeModal && window.closeModal();
    window.toast && window.toast('↩️ Đã tạo phiếu trả — chờ kế toán duyệt', 'success');
    if (window.sendTgMessage) {
      const lines = picked.length ? picked.map(x => `• ${x.name}: ${x.qty}${x.unit} (${x.cond === 'good' ? 'đẹp' : 'xấu'})${x.note ? ' — ' + x.note : ''}`).join('\n') : '• (toàn bộ đơn)';
      window.sendTgMessage('alert', `↩️ PHIẾU TRẢ HÀNG (chờ duyệt)\n📦 ${T.code} · ${T.custName}\n${lines}\n👉 Kế toán duyệt ở module Trả hàng.`);
    }
    render();
  };

  /* ===== Link giao hàng RIÊNG mỗi shipper — dùng TOKEN bảo mật (không đoán/sửa được) ===== */
  function _mkToken() {
    const c = 'abcdefghijkmnpqrstuvwxyz23456789'; let t = '';
    for (let i = 0; i < 12; i++) t += c[Math.floor(Math.random() * c.length)];
    return 'shp_' + t;
  }
  window.ghShipLinks = function () {
    const base = location.origin + location.pathname;
    const item = (label, url, guestId) => `<div style="display:flex;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #EEF2F0">
        <div style="flex:1;min-width:0"><b>${label}</b><div style="font-size:11px;color:var(--muted);word-break:break-all;margin-top:1px">${esc(url)}</div></div>
        <button class="btn btn-ghost btn-sm" data-u="${esc(url)}" onclick="window._ghCopy(this.getAttribute('data-u'))" style="flex-shrink:0">📋 Copy</button>
        ${guestId ? `<button class="btn btn-ghost btn-sm" onclick="window.ghRemoveGuest('${guestId}')" title="Xoá ship ngoài (link hết hiệu lực)" style="flex-shrink:0;color:#DC2626">🗑</button>` : ''}
      </div>`;
    const list = shippers();
    const tk = shipTokenMap();
    /* Token CỐ ĐỊNH trong KV (sinh 1 lần, giữ mãi). Sinh cho ai chưa có rồi lưu 1 lần qua rmwKv. */
    const withTok = list.map(s => ({ id: s.id, name: s.name, tok: tk[s.id] || _mkToken(), guest: !!s.guest }));
    const need = withTok.filter(x => !tk[x.id]);
    if (need.length && S().rmwKv) {
      S().rmwKv('shipperTokens', m => { m = m || {}; withTok.forEach(x => { if (!m[x.id]) m[x.id] = x.tok; }); return m; }, {});
    }
    const perm = withTok.filter(s => !s.guest);
    const guests = withTok.filter(s => s.guest);
    const permRows = perm.length ? perm.map(s => item('🛵 ' + esc(s.name), base + '?ship=' + s.tok)).join('')
      : '<div style="color:var(--muted);padding:6px 0;font-size:12px">Chưa có nhân viên phòng <b>Ship</b> — thêm ở <a href="staff.html">Nhân sự</a> (vị trí Ship).</div>';
    const guestRows = guests.map(s => item('🧑‍🔧 ' + esc(s.name) + ' <span style="font-size:10px;color:#B45309;background:#FEF3C7;padding:0 6px;border-radius:10px;font-weight:700">ngoài</span>', base + '?ship=' + s.tok, s.id)).join('');
    window.openModal('🔗 Link giao hàng cho shipper', `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Mỗi shipper 1 link <b>RIÊNG có mã bảo mật</b> — chỉ thấy + xác nhận đơn <b>của mình</b>, không xem được đơn người khác. Gửi Zalo/SMS, bảo họ ⭐ lưu.</div>
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin-bottom:2px;font-weight:700">🛵 Shipper cố định</div>
      ${permRows}
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;margin:14px 0 2px;font-weight:700">🧑‍🔧 Ship ngoài (thuê tạm lúc nhiều đơn)</div>
      ${guestRows}
      <div style="display:flex;gap:6px;margin:8px 0 3px">
        <input id="ghGuestName" placeholder="Tên ship ngoài (vd: A Hùng xe ôm - 09xx)" autocomplete="off" style="flex:1;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px">
        <button class="btn btn-primary btn-sm" onclick="window.ghAddGuestShipper()" style="white-space:nowrap">➕ Tạo link</button>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:10px">Tạo xong link hiện ngay ở trên → copy gửi họ. Rồi vào từng đơn bấm <b>✎ gán</b> chọn tên người này để đơn hiện trên link của họ. Giao xong xoá 🗑 cho gọn.</div>
      ${item('🏬 Link kho (xem TẤT CẢ đơn đang giao)', base + '?mode=ship')}
    `, { width: '540px', footer: `<button class="btn btn-primary" onclick="window.closeModal()">Xong</button>` });
  };
  window.ghAddGuestShipper = function () {
    const el = document.getElementById('ghGuestName');
    const name = el ? el.value.trim() : '';
    if (!name) { window.toast && window.toast('Nhập tên ship ngoài', 'warn'); return; }
    const id = 'SHPG' + Date.now().toString(36).toUpperCase();
    S().add('shippers', { id, name, phone: '', active: true, guest: true, createdAt: nowISO() });
    if (S().rmwKv) S().rmwKv('shipperTokens', m => { m = m || {}; if (!m[id]) m[id] = _mkToken(); return m; }, {});   /* token vào KV (giữ mãi) */
    window.toast && window.toast('➕ Đã tạo ship ngoài: ' + name, 'success');
    if (window.closeModal) window.closeModal();
    setTimeout(() => window.ghShipLinks(), 200);   /* mở lại modal để hiện link mới */
  };
  window.ghRemoveGuest = function (id) {
    if (!confirm('Xoá ship ngoài này? Link của họ sẽ hết hiệu lực.')) return;
    S().remove('shippers', id);
    if (S().rmwKv) S().rmwKv('shipperTokens', m => { if (m) delete m[id]; return m || {}; }, {});   /* thu hồi token */
    window.toast && window.toast('Đã xoá ship ngoài', 'info');
    if (window.closeModal) window.closeModal();
    setTimeout(() => window.ghShipLinks(), 150);
  };
  window._ghCopy = function (t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(() => window.toast && window.toast('📋 Đã copy link', 'success'), () => window.prompt('Copy link (Ctrl+C):', t));
    } else { window.prompt('Copy link (Ctrl+C):', t); }
  };


  /* ===== POD: shipper chụp/chọn ảnh lúc giao (lưu pod_photos[orderCode]) =====
     Mở popup QUẢN LÝ ảnh: xem preview, bấm ảnh xem to, ✕ xoá ảnh up nhầm, ➕ thêm ảnh. */
  window.ghAddPhoto = function (code) { _ghPhotoManager(code); };
  function _ghPhotoManager(code) {
    const list = ((S().get('pod_photos', {}) || {})[code] || []);
    const thumbs = list.length ? list.map((p, idx) => `
      <div style="position:relative;width:98px;height:98px">
        <img src="${p.dataURL}" onclick="window.openImgPreview(this.src,'Đơn ${esc(code)}${p.by ? ' · ' + esc(p.by) : ''}')" title="Bấm xem ảnh to" style="width:98px;height:98px;object-fit:cover;border-radius:9px;border:1px solid var(--line);cursor:pointer">
        <button onclick="window.ghDelPhoto('${esc(code)}',${idx})" title="Xoá ảnh này (up nhầm)" style="position:absolute;top:-7px;right:-7px;width:23px;height:23px;border-radius:50%;background:#DC2626;color:#fff;border:2px solid #fff;font-size:12px;font-weight:700;cursor:pointer;line-height:1;padding:0">✕</button>
        ${p.by ? `<div style="position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);color:#fff;font-size:8.5px;padding:1px 4px;border-radius:0 0 9px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.by)}</div>` : ''}
      </div>`).join('') : '<div style="color:var(--muted);font-size:13px;padding:18px 4px;width:100%;text-align:center">Chưa có ảnh nào. Bấm <b>📷 Chụp / Chọn ảnh</b> để thêm bằng chứng giao hàng.</div>';
    window.openModal('📷 Ảnh giao hàng — ' + esc(code), `
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Bấm vào ảnh để <b>xem to</b> · bấm dấu <b style="color:#DC2626">✕</b> góc ảnh để <b>xoá ảnh up nhầm</b>.</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">${thumbs}</div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-primary" onclick="window.ghPickMore('${esc(code)}')">📷 Chụp / Chọn ảnh</button>`
    });
  }
  window.ghPickMore = function (code) {
    window._ghPhotoCode = code;
    const inp = document.getElementById('ghPhoto');
    if (inp) { inp.value = ''; inp.click(); }
  };
  window.ghDelPhoto = function (code, idx) {
    if (S().rmwKv) {
      S().rmwKv('pod_photos', pods => { pods = pods || {}; if (Array.isArray(pods[code])) pods[code].splice(idx, 1); return pods; }, {});
    } else {
      const pods = S().get('pod_photos', {}) || {}; if (Array.isArray(pods[code])) pods[code].splice(idx, 1); S().set('pod_photos', pods);
    }
    window.toast && window.toast('🗑 Đã xoá ảnh', 'info');
    setTimeout(() => { _ghPhotoManager(code); render(); }, 90);
  };
  function _resizeImg(file, cb) {
    const fr = new FileReader();
    fr.onload = e => {
      const img = new Image();
      img.onload = () => {
        const max = 1000; let w = img.width, h = img.height;
        if (w > max || h > max) { if (w >= h) { h = Math.round(h * max / w); w = max; } else { w = Math.round(w * max / h); h = max; } }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        try { cb(cv.toDataURL('image/jpeg', 0.6)); } catch (_) { cb(e.target.result); }
      };
      img.onerror = () => cb(e.target.result);
      img.src = e.target.result;
    };
    fr.readAsDataURL(file);
  }
  function _ghPhotoPicked(ev) {
    const code = window._ghPhotoCode; const files = Array.from(ev.target.files || []);
    if (!code || !files.length) return;
    const urls = []; let done = 0;
    files.forEach(f => _resizeImg(f, dataURL => {
      urls.push(dataURL); done++;
      if (done !== files.length) return;
      const ts = (window.viToday ? window.viToday() : new Date().toLocaleDateString('vi-VN'));
      const by = (window.CURRENT_USER && window.CURRENT_USER.name) || 'shipper';
      const add = urls.map(u => ({ dataURL: u, ts, by }));
      /* rmwKv: áp vào giá trị cloud mới nhất → KHÔNG ghi đè ảnh của đơn khác (pod_photos là KV) */
      if (S().rmwKv) {
        S().rmwKv('pod_photos', pods => { pods = pods || {}; if (!Array.isArray(pods[code])) pods[code] = []; pods[code].push(...add); return pods; }, {});
      } else {
        const pods = S().get('pod_photos', {}) || {}; if (!Array.isArray(pods[code])) pods[code] = []; pods[code].push(...add); S().set('pod_photos', pods);
      }
      window.toast && window.toast('📷 Đã lưu ' + add.length + ' ảnh giao cho ' + code, 'success');
      setTimeout(() => { render(); _ghPhotoManager(code); }, 80);   /* mở lại popup để xem preview + xoá nếu nhầm */
    }));
  }

  /* ===== Init ===== */
  function init() {
    if (SHIP_MODE) {
      document.documentElement.classList.add('embed');
      const hEl = document.getElementById('ghShipHead');
      if (hEl) hEl.style.display = 'flex';   /* tên shipper do render() điền (sau khi token resolve) */
    } else if (window.renderAppShell) {
      window.renderAppShell('giao-hang', 'Bảng giao hàng');
    }
    const _ghp = document.getElementById('ghPhoto'); if (_ghp) _ghp.onchange = _ghPhotoPicked;
    render();
    S().subscribe('orders', render);
    S().subscribe('staff', render);      /* ship CỐ ĐỊNH lấy từ Nhân sự (phòng Ship) */
    S().subscribe('shippers', render);   /* ship NGOÀI (guest) */
    S().subscribe('shipperTokens', render);   /* token link (KV) về → tra ra tên shipper */
    S().subscribe('pod_photos', render);   /* cập nhật số đếm 📷 Ảnh (N) */
    S().subscribe('__preloaded__', k => { if (['orders', 'staff', 'shippers', 'shipperTokens', 'pod_photos'].includes(k)) render(); });
    setTimeout(() => { S().get('orders', window.ORDERS || []); S().get('staff', window.STAFF || []); S().get('shippers', window.DRIVERS || []); S().get('shipperTokens', {}); S().get('pod_photos', {}); }, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
