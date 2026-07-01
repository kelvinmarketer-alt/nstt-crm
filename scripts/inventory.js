/* =========================================================
   Inventory module logic
   ─────────────────────────────────────────────────────────
   - Hiển thị tồn kho theo SP, ngưỡng cảnh báo
   - Auto-trừ kho khi orders chuyển sang delivered (subscribe orders)
   - Auto-cộng kho khi purchase chuyển sang received
   - Kiểm kê thủ công (adjust) + ghi movement
   ========================================================= */
(function () {
  /* ====== Helpers ====== */
  function getInv()     { return window.STORE.get('inventory', window.INVENTORY || []) || []; }
  function getProds()   { return window.STORE.get('products', window.PRODUCTS || []) || []; }
  function getMoves()   { return window.STORE.get('inv_movements', []) || []; }
  function setMoves(m)  { window.STORE.set('inv_movements', m); }
  function findProd(id) { return getProds().find(p => p.id === id); }
  function findInv(productId) { return getInv().find(i => i.productId === productId); }

  function stockLevel(item) {
    if (item.stock <= 0) return 'out';
    if (item.stock < item.minStock) return 'low';
    if (item.stock < item.minStock * 1.5) return 'warn';
    return 'ok';
  }

  function daysLeft(item) {
    if (!item.avgDaily) return '∞';
    return Math.floor(item.stock / item.avgDaily);
  }

  /* Ghi 1 movement (vào/ra/điều chỉnh) */
  window.invRecordMovement = function (productId, qty, type, note, refId) {
    const moves = getMoves();
    moves.unshift({
      id: 'MV' + Date.now().toString(36),
      ts: new Date().toISOString(),
      productId,
      qty,       /* dương = nhập, âm = xuất */
      type,      /* 'purchase' | 'sale' | 'adjust' | 'return' */
      note: note || '',
      refId: refId || '',
      user: (window.CURRENT_USER || {}).name || 'Hệ thống',
    });
    if (moves.length > 500) moves.length = 500;
    setMoves(moves);
  };

  /* Apply 1 movement vào stock (không ghi log — log ở chỗ gọi) */
  window.invApply = function (productId, deltaQty) {
    const item = getInv().find(i => i.productId === productId);
    const today = window.todayDate();
    const vi = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
    if (!item) {
      /* STORE.add → insert thẳng lên cloud (tránh bug same-reference của STORE.set) */
      window.STORE.add('inventory', {
        id: 'INV' + Date.now().toString(36), productId,
        stock: Math.max(0, deltaQty), minStock: 10, maxStock: 100, avgDaily: 5,
        lastIn: deltaQty > 0 ? vi : '', lastOut: deltaQty < 0 ? vi : '', location: 'Kho A1',
      });
      return;
    }
    const patch = { stock: Math.max(0, (item.stock || 0) + deltaQty) };
    if (deltaQty > 0) patch.lastIn = vi; else patch.lastOut = vi;
    window.STORE.update('inventory', item.id, patch);
  };

  /* Auto-áp tồn kho khi orders/purchases đổi trạng thái đã chuyển sang
     cross-module-hooks.js (nguồn DUY NHẤT, có guard mvHas + ready).
     Ở đây không tự áp kho nữa để tránh áp trùng. Việc vẽ lại inventory
     khi orders/purchases thay đổi đã do subscribe render-only ở cuối file lo. */

  /* ====== Render ====== */
  function fmtQty(n) { return (n || 0).toLocaleString('vi-VN'); }

  function renderKpis() {
    const inv = getInv();
    const total = inv.length;
    const out  = inv.filter(i => stockLevel(i) === 'out').length;
    const low  = inv.filter(i => stockLevel(i) === 'low').length;
    const warn = inv.filter(i => stockLevel(i) === 'warn').length;
    const totalValue = inv.reduce((s, i) => {
      const p = findProd(i.productId);
      const bp = p && p.priceHistory && p.priceHistory[p.priceHistory.length-1] ? p.priceHistory[p.priceHistory.length-1].buy : 0;
      return s + (i.stock * bp);
    }, 0);
    const wrap = document.getElementById('invKpis');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="ik-kpi"><div class="lab">Tổng SP đang quản lý ${window.helpTip('Số mã SP có hồ sơ tồn kho. SP chưa có hồ sơ sẽ tự tạo khi nhập hàng lần đầu.')}</div><div class="val">${total}</div><div class="sub">mã SP</div></div>
      <div class="ik-kpi"><div class="lab">⛔ Hết hàng ${window.helpTip('Tồn = 0kg. Cần nhập gấp — đơn mới có SP này sẽ bị từ chối.')}</div><div class="val" style="color:#7F1D1D">${out}</div><div class="sub">cần nhập gấp</div></div>
      <div class="ik-kpi"><div class="lab">🔴 Dưới ngưỡng ${window.helpTip('Tồn < ngưỡng tối thiểu (minStock). Nên đặt phiếu nhập NCC trong 1-2 ngày tới.')}</div><div class="val" style="color:#DC2626">${low}</div><div class="sub">SP cần nhập sớm</div></div>
      <div class="ik-kpi"><div class="lab">🟠 Sắp hết ${window.helpTip('Tồn < 1.5 lần ngưỡng. Cân nhắc lên kế hoạch nhập.')}</div><div class="val" style="color:#D97706">${warn}</div><div class="sub">SP cần theo dõi</div></div>
      <div class="ik-kpi"><div class="lab">💰 Giá trị tồn ${window.helpTip('Tổng = Σ(tồn × giá nhập gần nhất). Đây là vốn đang nằm ở kho — càng cao càng kẹt vốn.')}</div><div class="val" style="color:var(--ok)">${window.fmtShort(totalValue)}</div><div class="sub">₫ theo giá vốn</div></div>
    `;
  }

  function render() {
    renderKpis();
    const inv = getInv();
    /* Build locations */
    const locs = [...new Set(inv.map(i => i.location).filter(Boolean))];
    const loSel = document.getElementById('invLoc');
    const cur = loSel.value;
    loSel.innerHTML = '<option value="">Tất cả kho</option>' + locs.map(l => `<option ${l===cur?'selected':''}>${l}</option>`).join('');

    const q = (document.getElementById('invQ').value || '').toLowerCase();
    const f = document.getElementById('invFilter').value;
    const lo = document.getElementById('invLoc').value;
    const tb = document.getElementById('invBody');

    let rows = inv.map(i => {
      const p = findProd(i.productId);
      return { ...i, prod: p, level: stockLevel(i), days: daysLeft(i) };
    });
    if (q) rows = rows.filter(r => (r.prod?.name || '').toLowerCase().includes(q) || r.productId.toLowerCase().includes(q));
    if (f) rows = rows.filter(r => r.level === f);
    if (lo) rows = rows.filter(r => r.location === lo);

    /* Sắp xếp: low/out lên đầu */
    const order = { out:0, low:1, warn:2, ok:3 };
    rows.sort((a, b) => order[a.level] - order[b.level] || (a.prod?.name||'').localeCompare(b.prod?.name||''));

    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="11" style="padding:36px;text-align:center;color:var(--muted)">Không có SP nào khớp bộ lọc.</td></tr>`;
      return;
    }

    tb.innerHTML = rows.map(r => {
      const pct = Math.min(100, (r.stock / Math.max(r.maxStock, 1)) * 100);
      const colors = { out:'#7F1D1D', low:'#DC2626', warn:'#D97706', ok:'#16A34A' };
      const lvlLabels = { out:'⛔ Hết hàng', low:'🔴 Dưới ngưỡng', warn:'🟠 Sắp hết', ok:'🟢 Đủ' };
      const cls = 'lvl-' + r.level;
      return `<tr data-id="${r.id}">
        <td class="hide-xs"><div class="checkbox" onclick="this.classList.toggle('on')"></div></td>
        <td data-field="title"><b>${r.prod?.name || r.productId}</b><div style="font-size:11px;color:var(--muted)">${r.prod?.cat || ''}</div></td>
        <td data-field="code"><code style="font-size:11.5px;color:var(--muted)">${r.productId}</code></td>
        <td class="hide-xs"><span class="tag" style="background:#F1F5F9;color:#475569">${r.location}</span></td>
        <td class="num" data-field="stock"><b class="${cls}">${fmtQty(r.stock)} ${r.prod?.unit || ''}</b></td>
        <td class="hide-xs">
          <div class="stock-bar">
            <div class="bar"><div class="fill" style="width:${pct}%;background:${colors[r.level]}"></div></div>
            <div class="pct">${Math.round(pct)}%</div>
          </div>
          <div style="font-size:10.5px;color:var(--muted);margin-top:2px">Min ${r.minStock} · Max ${r.maxStock}</div>
        </td>
        <td class="num hide-xs">${fmtQty(r.avgDaily)} / ngày</td>
        <td class="num hide-xs"><span class="${cls}">${r.days === '∞' ? '∞' : r.days + ' ngày'}</span></td>
        <td class="hide-xs" style="font-size:12px">${r.lastIn || '—'}</td>
        <td data-field="level" class="inv-lvl-cell"><span class="${cls}" style="font-size:12px">${lvlLabels[r.level] || ''}</span></td>
        <td class="hide-xs">
          <button class="btn btn-ghost btn-sm" onclick="window.openInvAdjust('${r.productId}')" title="Điều chỉnh thủ công">⚖️ KK</button>
          <button class="btn btn-ghost btn-sm" onclick="window.location.href='purchases.html?createFor=${r.productId}'" title="Tạo phiếu nhập">+ Nhập</button>
        </td>
      </tr>`;
    }).join('');

    /* Bulk ops: chọn / đổi kho / đặt tồn / xóa hàng loạt */
    if (window.attachBulkOps) {
      const tbl = tb.closest('table');
      if (tbl) {
        if (!tbl.id) tbl.id = 'tblInv';
        const locOpts = [...new Set(getInv().map(i => i.location).filter(Boolean))];
        ['Kho A1', 'Kho A2', 'Kho B1', 'Kho lạnh'].forEach(l => { if (!locOpts.includes(l)) locOpts.push(l); });
        window.attachBulkOps({
          tableSelector: '#tblInv',
          selectAllSelector: '#invSelectAll',
          store: 'inventory',
          label: 'SP',
          actions: {
            changeStatus: { label: '🏬 Đổi kho', field: 'location', options: locOpts.map(l => ({ id: l, label: l })) },
            buttons: [{ label: '📦 Đặt tồn (kiểm kê)', handler: (ids) => window.bulkSetInvStock(ids) }],
          }
        });
      }
    }
  }

  /* Đặt tồn thực tế hàng loạt (kiểm kê) cho các SP đã chọn — có ghi log biến động */
  window.bulkSetInvStock = function (ids) {
    const val = prompt(`Đặt TỒN THỰC TẾ cho ${ids.length} SP đã chọn (kiểm kê):`, '');
    if (val == null) return;
    const v = parseFloat(String(val).replace(/[^\d.]/g, ''));
    if (isNaN(v) || v < 0) { window.toast('Nhập số hợp lệ', 'warn'); return; }
    let n = 0;
    ids.forEach(id => {
      const it = getInv().find(x => x.id === id); if (!it) return;
      const delta = v - (it.stock || 0);
      if (!delta) return;
      window.invApply(it.productId, delta);
      window.invRecordMovement(it.productId, delta, 'adjust', 'Kiểm kê hàng loạt');
      n++;
    });
    if (window._bulkClear_inventory) window._bulkClear_inventory();
    render(); renderMoves();
    window.toast(`✓ Đã đặt tồn = ${v} cho ${n} SP`, 'success');
  };

  function renderMoves() {
    const moves = getMoves();
    const host = document.getElementById('movList');
    if (!host) return;
    if (!moves.length) {
      host.innerHTML = `<div style="padding:30px;text-align:center;color:var(--muted)">Chưa có biến động nào. Khi xuất đơn / nhập hàng / kiểm kê — sẽ tự ghi vào đây.</div>`;
      return;
    }
    const typeIc = { purchase:'📥', sale:'📤', adjust:'⚖️', return:'↩️' };
    const typeLab = { purchase:'Nhập', sale:'Xuất', adjust:'Kiểm kê', return:'Trả hàng' };
    host.innerHTML = moves.slice(0, 60).map(m => {
      const p = findProd(m.productId);
      const ts = new Date(m.ts);
      const pad = n => String(n).padStart(2,'0');
      const t = `${pad(ts.getDate())}/${pad(ts.getMonth()+1)} ${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
      const isIn = m.qty > 0;
      return `<div style="display:flex;align-items:center;gap:12px;padding:9px 16px;border-bottom:1px solid #F8FAFC;font-size:13px">
        <span style="font-size:18px">${typeIc[m.type] || '•'}</span>
        <div style="flex:1;min-width:0">
          <div><b>${p?.name || m.productId}</b> · <span style="color:var(--muted)">${typeLab[m.type] || m.type}</span></div>
          <div style="font-size:11.5px;color:var(--muted)">${m.note}${m.refId ? ' · #'+m.refId : ''} · ${m.user}</div>
        </div>
        <div style="font-weight:700;color:${isIn ? 'var(--ok)' : 'var(--danger)'};font-variant-numeric:tabular-nums">${isIn?'+':''}${m.qty}</div>
        <div style="font-size:11px;color:var(--muted);min-width:80px;text-align:right">${t}</div>
      </div>`;
    }).join('');
  }

  /* ====== Adjust modal ====== */
  window.openInvAdjust = function (productId) {
    const inv = getInv();
    const item = productId ? inv.find(i => i.productId === productId) : null;
    const dl = getProds().map(p => `<option value="${p.id} · ${(p.name || '').replace(/"/g, '&quot;')}">`).join('');
    const initVal = item ? (item.productId + ' · ' + (findProd(item.productId)?.name || '')) : (productId ? (productId + ' · ' + (findProd(productId)?.name || '')) : '');
    window.openModal('⚖️ Kiểm kê / Điều chỉnh tồn', `
      ${window.helpBanner ? `<div style="background:#FEF3C7;border:1px solid #FCD34D;color:#92400E;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:10px">
        💡 <b>Khi nào dùng?</b> Khi kiểm kê thực tế ≠ số trên hệ thống (hao hụt, hỏng, mất). Điều chỉnh sẽ ghi vào lịch sử biến động — KHÔNG xoá log.
      </div>` : ''}
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">Sản phẩm (gõ tên/mã rồi chọn)</label>
      <input id="adProd" list="adProdDL" value="${initVal.replace(/"/g, '&quot;')}" placeholder="Gõ tên hoặc mã SP…" autocomplete="off" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:8px;font-size:13px;margin-bottom:10px">
      <datalist id="adProdDL">${dl}</datalist>

      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">Tồn hiện tại trên hệ thống</label>
      <input id="adCur" disabled value="${item ? item.stock : 0}" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:8px;font-size:13px;margin-bottom:10px;background:#F9FAFB">

      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">Tồn thực tế (sau khi kiểm kê)</label>
      <input id="adNew" type="number" placeholder="VD: 45" value="${item ? item.stock : 0}" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:8px;font-size:13px;margin-bottom:10px">

      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">Lý do (bắt buộc)</label>
      <select id="adReason" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:8px;font-size:13px;margin-bottom:10px">
        <option>Kiểm kê định kỳ</option>
        <option>Hàng hỏng/thối</option>
        <option>Hao hụt vận chuyển</option>
        <option>Sai số nhập trước đó</option>
        <option>Mất hàng</option>
        <option>Khác (ghi note)</option>
      </select>

      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">Ghi chú thêm</label>
      <textarea id="adNote" rows="2" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:8px;font-size:13px" placeholder="Mô tả thêm nếu cần"></textarea>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window._invAdjustSave()">Lưu kiểm kê</button>`,
      width: '460px',
    });
    const _fillStock = () => {
      const pid = _adResolvePid();
      const it = getInv().find(i => i.productId === pid);
      document.getElementById('adCur').value = it ? it.stock : 0;
      document.getElementById('adNew').value = it ? it.stock : 0;
    };
    document.getElementById('adProd').oninput = _fillStock;
    document.getElementById('adProd').onchange = _fillStock;
  };

  /* Lấy productId từ ô nhập "SPxxx · Tên" (hoặc gõ tên/mã trực tiếp) */
  function _adResolvePid() {
    const v = (document.getElementById('adProd').value || '').trim();
    if (!v) return '';
    const idPart = v.split('·')[0].trim();
    let p = getProds().find(x => x.id === idPart);
    if (!p) p = getProds().find(x => (x.id + ' · ' + x.name) === v);
    if (!p) p = getProds().find(x => (x.name || '').toLowerCase() === v.toLowerCase());
    return p ? p.id : '';
  }

  window._invAdjustSave = function () {
    const pid = _adResolvePid();
    if (!pid) { window.toast('Chọn sản phẩm hợp lệ từ gợi ý', 'warn'); return; }
    const cur = parseFloat(document.getElementById('adCur').value) || 0;
    const neu = parseFloat(document.getElementById('adNew').value) || 0;
    const reason = document.getElementById('adReason').value;
    const note = document.getElementById('adNote').value;
    const delta = neu - cur;
    if (!delta) { window.toast('Số liệu không đổi','warn'); return; }
    window.invApply(pid, delta);
    window.invRecordMovement(pid, delta, 'adjust', `${reason}${note ? ' — '+note : ''}`);
    if (window.audit) window.audit.log('inventory.adjust', `${pid}: ${cur} → ${neu} (${delta>0?'+':''}${delta}) · ${reason}`);
    window.toast(`✓ Đã điều chỉnh ${pid}: ${cur} → ${neu}`, 'success');
    window.closeModal();
    render(); renderMoves();
  };

  /* ====== Export ====== */
  window.exportInvCsv = function () {
    const inv = getInv();
    const head = 'Mã SP,Tên SP,Kho,Tồn,Min,Max,TB bán/ngày,Còn đủ bán (ngày),Lần nhập cuối\n';
    const rows = inv.map(i => {
      const p = findProd(i.productId);
      return [i.productId, `"${p?.name||''}"`, i.location, i.stock, i.minStock, i.maxStock, i.avgDaily, daysLeft(i), i.lastIn].join(',');
    });
    const blob = new Blob(['﻿' + head + rows.join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `ton-kho-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    window.toast('Đã xuất tồn kho CSV','success');
  };

  /* ====== Init ====== */
  window.renderAppShell('inventory', 'Kho / Tồn');
  document.getElementById('hbHost').innerHTML = window.helpBanner(
    '📥 Module Kho làm gì?',
    'Theo dõi tồn từng SP, tự cảnh báo khi sắp hết. <b>Tự trừ kho</b> khi đơn chuyển sang "Đã giao". <b>Tự cộng kho</b> khi phiếu nhập NCC chuyển sang "Đã nhận". Lịch sử biến động ghi đầy đủ để truy vết.',
    {id:'hb-inv', icon:'📥'}
  );
  document.getElementById('hbTitle').innerHTML = window.helpTip('Module này hiển thị tồn kho real-time. Cảnh báo dựa trên ngưỡng minStock + tốc độ bán trung bình. Click "Kiểm kê" để điều chỉnh khi số thực tế ≠ số trên hệ thống.', {size:'lg'});
  document.getElementById('hbMv').innerHTML = window.helpTip('Mọi nhập/xuất/kiểm kê đều ghi log vào đây. Giữ 500 bản ghi gần nhất.');

  ['invQ','invFilter','invLoc'].forEach(id => document.getElementById(id).oninput = render);

  ['inventory','products','orders','purchases','inv_movements'].forEach(k => window.STORE.subscribe(k, () => { render(); renderMoves(); }));
  render();
  renderMoves();

  /* Demo: Run audit hooks (đảm bảo invApplied được set cho các order/purchase mock đầu) */
  setTimeout(() => {
    /* Trigger 1 lần để apply mock orders/purchases */
    const o = window.STORE.get('orders', []) || [];
    window.STORE.set('orders', o);
    const p = window.STORE.get('purchases', window.PURCHASES || []) || [];
    window.STORE.set('purchases', p);
  }, 500);

})();
