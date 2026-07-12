/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — BẢNG GIAO HÀNG (Kho + Shipper)
   Màn hình bấm nhanh, KHÔNG cần vào chi tiết đơn:
     Chờ giao ──[🚚 Giao shipper]──▶ Đang giao ──┬─[✅ Giao xong]──▶ Đã giao (công nợ chốt)
                                                  └─[↩️ Trả]──▶ Đã giao + cờ "ship báo trả"
   Ship báo trả THÔ → Kho phân loại + Kế toán chốt tiền ở module Trả hàng.
   ?mode=ship[&me=Tên]  → giao diện rút gọn cho shipper (chỉ tab Đang giao, lọc theo tên).
   ========================================================= */
(function () {
  const S = () => window.STORE;
  const qs = new URLSearchParams(location.search);
  const SHIP_MODE = qs.get('mode') === 'ship';
  const ME = (qs.get('me') || '').trim().toLowerCase();   /* lọc theo tên shipper (ship mode) */
  let TAB = 'wait';                                        /* 'wait' = Chờ giao · 'transit' = Đang giao */
  if (SHIP_MODE) TAB = 'transit';

  const nowISO = () => new Date().toISOString();
  const fmt = n => (window.fmt ? window.fmt(n) : Number(n || 0).toLocaleString('vi-VN'));
  const ordList = () => (S().get('orders', window.ORDERS || []) || []);
  const shippers = () => (S().get('shippers', window.DRIVERS || []) || []).filter(s => s && s.name);
  const ordByCode = code => ordList().find(o => o.code === code);

  /* ===== Phân nhóm trạng thái (giữ enum cũ, gộp hiển thị) ===== */
  const WAIT_ST = ['confirmed', 'pickup', 'new', ''];          /* Chờ giao */
  const isWait = o => WAIT_ST.includes(o.status || '') && o.status !== 'draft' && o.status !== 'cancelled';
  const isTransit = o => o.status === 'transit';

  /* Lọc theo shipper (chỉ ở ship mode & có ?me=) */
  const mineOnly = o => !ME || String(o.driverName || '').trim().toLowerCase() === ME;

  /* ===== Tóm tắt mặt hàng 1 dòng ===== */
  function itemsSummary(o) {
    const its = Array.isArray(o.items) ? o.items : [];
    if (!its.length) return (o.qty ? o.qty + ' kiện' : '—');
    const by = {};
    its.forEach(x => { const u = (x.unit || 'kg').toString().trim().toLowerCase() || 'kg'; by[u] = (by[u] || 0) + (+x.qty || 0); });
    const parts = Object.keys(by).sort((a, b) => a === 'kg' ? -1 : b === 'kg' ? 1 : a.localeCompare(b, 'vi'))
      .map(u => `${Number.isInteger(by[u]) ? by[u] : Math.round(by[u] * 100) / 100} ${u}`);
    return parts.join(' · ') + ` · ${its.length} mã`;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shortAddr = a => { a = String(a || '').trim(); return a.length > 46 ? a.slice(0, 44) + '…' : (a || '—'); };

  /* ===== Card 1 đơn ===== */
  function cardHtml(o) {
    const cust = esc(o.custName || o.custId || 'Khách');
    const money = o.freight ? `<span class="gh-money">${fmt(o.freight)}₫</span>` : '';
    const ship = o.driverName ? `<span class="gh-ship">🛵 ${esc(o.driverName)}</span>` : `<span class="gh-ship gh-noship">🛵 chưa gán</span>`;
    const flag = o.returnPending ? `<span class="gh-flag">🚩 đã báo trả</span>` : '';
    const top = `<div class="gh-top"><span class="gh-code">#${esc(o.code)}</span><span class="gh-cust">${cust}</span>${flag}</div>`;
    const info = `<div class="gh-line">📍 ${esc(shortAddr(o.drop))}</div>
                  <div class="gh-line gh-items">📦 ${esc(itemsSummary(o))} ${money}</div>`;
    if (TAB === 'wait') {
      return `<div class="gh-card">${top}${info}
        <button class="gh-btn gh-go" onclick="ghGiaoShipper('${esc(o.code)}')">🚚 GIAO SHIPPER</button>
      </div>`;
    }
    /* Đang giao */
    return `<div class="gh-card">${top}${info}<div class="gh-line">${ship}</div>
      <div class="gh-actions">
        <button class="gh-btn gh-done" onclick="ghGiaoXong('${esc(o.code)}')">✅ GIAO XONG</button>
        <button class="gh-btn gh-ret" onclick="ghBaoTra('${esc(o.code)}')">↩️ TRẢ</button>
      </div></div>`;
  }

  /* ===== Render toàn bảng ===== */
  function render() {
    const host = document.getElementById('ghBoard'); if (!host) return;
    const all = ordList();
    const waitList = all.filter(isWait);
    const transitList = all.filter(o => isTransit(o) && mineOnly(o));
    const list = (TAB === 'wait' ? waitList : transitList)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    /* Tabs (ẩn tab "Chờ giao" ở ship mode) */
    const tabsEl = document.getElementById('ghTabs');
    if (tabsEl) {
      if (SHIP_MODE) { tabsEl.style.display = 'none'; }
      else {
        tabsEl.innerHTML =
          `<button class="gh-tab ${TAB === 'wait' ? 'active' : ''}" onclick="ghTab('wait')">🟡 Chờ giao <b>${waitList.length}</b></button>
           <button class="gh-tab ${TAB === 'transit' ? 'active' : ''}" onclick="ghTab('transit')">🔵 Đang giao <b>${all.filter(isTransit).length}</b></button>`;
      }
    }

    if (!list.length) {
      host.innerHTML = `<div class="gh-empty">${TAB === 'wait'
        ? '✓ Không còn đơn nào chờ giao.'
        : (ME ? `Không có đơn đang giao cho "<b>${esc(qs.get('me'))}</b>".` : '✓ Không có đơn nào đang giao.')}</div>`;
      return;
    }
    host.innerHTML = list.map(cardHtml).join('');
  }
  window._ghRender = render;
  window.ghTab = function (t) { TAB = t; render(); };

  /* ===== KHO: Giao cho shipper → Đang giao ===== */
  window.ghGiaoShipper = function (code) {
    const o = ordByCode(code); if (!o) return;
    const opts = shippers().map(s => `<option value="${esc(s.id)}" ${o.driver === s.id || o.driverName === s.name ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    window.openModal('🚚 Giao cho shipper — ' + esc(code), `
      <div style="font-size:13px;color:#334155;margin-bottom:12px">Đơn <b>#${esc(code)}</b> · ${esc(o.custName || '')}</div>
      <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">Chọn shipper</label>
      <select id="ghShipSel" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;font-size:14px">
        <option value="">— chưa gán (giao sau) —</option>${opts}
      </select>
      <div style="font-size:11.5px;color:var(--muted);margin-top:8px">Bấm xác nhận → đơn chuyển sang <b>Đang giao</b>, shipper sẽ thấy trên máy của mình.</div>
    `, {
      width: '420px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
               <button class="btn btn-primary" onclick="window._ghConfirmShipper('${esc(code)}')">🚚 Bắt đầu giao</button>`
    });
  };
  window._ghConfirmShipper = function (code) {
    const o = ordByCode(code); if (!o) return;
    const sel = document.getElementById('ghShipSel');
    const sid = sel ? sel.value : '';
    const sName = sid ? (shippers().find(s => s.id === sid) || {}).name || '' : '';
    const patch = { status: 'transit', transitAt: nowISO() };
    if (sid) { patch.driver = sid; patch.driverName = sName; }
    S().update('orders', code, patch);
    window.closeModal && window.closeModal();
    window.toast && window.toast('🚚 Đang giao ' + code + (sName ? ' · ' + sName : ''), 'success');
    if (window.sendTgMessage) window.sendTgMessage('alert', `🚚 BẮT ĐẦU GIAO\n📦 ${code} · ${o.custName || ''}${sName ? '\n🛵 ' + sName : ''}`);
    render();
  };

  /* ===== SHIP: Giao xong → Đã giao (công nợ chốt) ===== */
  window.ghGiaoXong = function (code) {
    const o = ordByCode(code); if (!o) return;
    if (!confirm(`Xác nhận GIAO XONG đơn ${code}?\nKhách: ${o.custName || ''}\n\n→ Đơn thành "Đã giao", công nợ khách được chốt.`)) return;
    S().update('orders', code, { status: 'delivered', deliveredAt: nowISO() });
    window.toast && window.toast('✓ Đã giao xong ' + code, 'success');
    if (window.sendTgMessage) window.sendTgMessage('alert', `✅ GIAO THÀNH CÔNG\n📦 ${code} · ${o.custName || ''}`);
    render();
  };

  /* ===== SHIP: Báo trả (THÔ) → Đã giao + cờ chờ kho/KT xử lý ===== */
  window.ghBaoTra = function (code) {
    const o = ordByCode(code); if (!o) return;
    const raw = prompt(`↩️ Ship báo TRẢ HÀNG đơn ${code}\nGhi chú (mặt hàng nào / lý do — tuỳ chọn):`, '');
    if (raw === null) return;   /* bấm Huỷ/Escape → KHÔNG đánh dấu, KHÔNG báo trả */
    const note = raw.trim();
    S().update('orders', code, {
      status: 'delivered', deliveredAt: nowISO(),
      returnPending: true,
      returnReportedBy: (window.CURRENT_USER && window.CURRENT_USER.name) || 'shipper',
      returnReportedAt: nowISO(),
      returnNote: note
    });
    window.toast && window.toast('↩️ Đã báo trả ' + code + ' — kho/kế toán sẽ chốt', 'warn');
    if (window.sendTgMessage) window.sendTgMessage('alert', `↩️ SHIP BÁO TRẢ HÀNG\n📦 ${code} · ${o.custName || ''}${note ? '\n📝 ' + note : ''}\n👉 Kho phân loại + Kế toán chốt ở module Trả hàng.`);
    render();
  };

  /* ===== Init ===== */
  function init() {
    if (SHIP_MODE) {
      document.documentElement.classList.add('embed');   /* ẩn sidebar/topbar → màn hình ship gọn */
      const hEl = document.getElementById('ghShipHead');
      if (hEl) { hEl.style.display = 'flex'; hEl.querySelector('#ghShipName').textContent = qs.get('me') ? ('🛵 ' + qs.get('me')) : '🛵 Shipper'; }
    } else if (window.renderAppShell) {
      window.renderAppShell('giao-hang', 'Bảng giao hàng');
    }
    render();
    S().subscribe('orders', render);
    S().subscribe('__preloaded__', k => { if (k === 'orders' || k === 'shippers') render(); });
    /* mồi tải orders từ cloud */
    setTimeout(() => S().get('orders', window.ORDERS || []), 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
