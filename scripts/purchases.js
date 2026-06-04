/* =========================================================
   Purchases (Phiếu nhập) — tạo / nhận / huỷ
   ─────────────────────────────────────────────────────────
   - status: 'ordered' (đã đặt, chưa nhận) → 'received' (đã nhận, cộng kho)
   - Khi received: trigger inventory subscribe → +stock; tính công nợ NCC
   - Khi huỷ: nếu đã received → trừ kho lại
   ========================================================= */
(function () {
  function getPur() { return window.STORE.get('purchases', window.PURCHASES || []) || []; }
  function getSup() { return window.STORE.get('suppliers', window.SUPPLIERS || []) || []; }
  function getProds() { return window.STORE.get('products', window.PRODUCTS || []) || []; }
  function findSup(id) { return getSup().find(s => s.id === id); }

  function renderKpis() {
    const list = getPur();
    const today = window.todayVN();
    const todayList = list.filter(p => p.date === today);
    const ordered = list.filter(p => p.status === 'ordered');
    const monthSpend = list.filter(p => p.status === 'received' && (p.date||'').endsWith('/2026') && (p.date||'').startsWith('1') === false || (p.date||'').includes('/05/2026')).reduce((s,p) => s + (p.total||0), 0);
    const unpaid = list.filter(p => p.status === 'received').reduce((s,p) => s + Math.max(0, (p.total||0) - (p.paid||0)), 0);
    document.getElementById('purKpis').innerHTML = `
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">Nhập hôm nay ${window.helpTip('Số phiếu + giá trị nhập hàng trong ngày hiện tại.')}</div><div style="font-size:22px;font-weight:800;color:var(--navy);margin-top:4px">${todayList.length} <span style="font-size:13px;color:var(--muted);font-weight:500">phiếu</span></div><div style="font-size:11.5px;color:var(--muted)">${window.fmtShort(todayList.reduce((s,p)=>s+(p.total||0),0))} ₫</div></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">⏳ Chờ nhận ${window.helpTip('Phiếu đã đặt nhưng NCC chưa giao. Khi nhận hàng → bấm "✓ Đã nhận" để cộng vào kho.')}</div><div style="font-size:22px;font-weight:800;color:#92400E;margin-top:4px">${ordered.length}</div><div style="font-size:11.5px;color:var(--muted)">${window.fmtShort(ordered.reduce((s,p)=>s+(p.total||0),0))} ₫</div></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">💸 Chi nhập T5/2026 ${window.helpTip('Tổng chi nhập hàng trong tháng — = COGS (giá vốn).')}</div><div style="font-size:22px;font-weight:800;color:var(--ok);margin-top:4px">${window.fmtShort(monthSpend)}</div></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">🔴 Chưa thanh toán ${window.helpTip('Tổng tiền hàng đã nhận nhưng chưa trả NCC. Bằng Σ công nợ NCC.')}</div><div style="font-size:22px;font-weight:800;color:#DC2626;margin-top:4px">${window.fmtShort(unpaid)}</div></div>
    `;
  }

  function render() {
    renderKpis();
    const list = getPur();
    const sups = getSup();
    /* Build sup select */
    const ss = document.getElementById('purSup');
    const cur = ss.value;
    ss.innerHTML = '<option value="">Tất cả NCC</option>' + sups.map(s => `<option value="${s.id}" ${cur===s.id?'selected':''}>${s.name}</option>`).join('');

    const q = (document.getElementById('purQ').value || '').toLowerCase();
    const st = document.getElementById('purSt').value;
    const sup = document.getElementById('purSup').value;
    let rows = list.slice().reverse();
    if (q)   rows = rows.filter(p => (p.id+' '+(findSup(p.supplierId)?.name||'')).toLowerCase().includes(q));
    if (st)  rows = rows.filter(p => p.status === st);
    if (sup) rows = rows.filter(p => p.supplierId === sup);

    const tb = document.getElementById('purBody');
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="9" style="padding:36px;text-align:center;color:var(--muted)">Không có phiếu nhập nào.</td></tr>`; return; }

    tb.innerHTML = rows.map(p => {
      const s = findSup(p.supplierId);
      const due = (p.total||0) - (p.paid||0);
      return `<tr>
        <td><b style="font-family:monospace">${p.id}</b></td>
        <td>${s ? s.name : p.supplierId}<div style="font-size:11px;color:var(--muted)">${s?.paymentTerm || ''}</div></td>
        <td>${p.date}</td>
        <td>${(p.items||[]).length} mặt hàng</td>
        <td class="num"><b>${window.fmt(p.total)}</b></td>
        <td class="num">${window.fmt(p.paid||0)}</td>
        <td class="num" style="color:${due>0?'#DC2626':'var(--ok)'}">${due>0?window.fmt(due):'—'}</td>
        <td><span class="st-pill st-${p.status}">${p.status==='ordered'?'⏳ Đã đặt':p.status==='received'?'✓ Đã nhận':'✕ Hủy'}</span></td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="window.openPurDrawer('${p.id}')" title="Xem chi tiết">👁</button>
          ${p.status==='ordered' ? `<button class="btn btn-ghost btn-sm" style="color:var(--ok)" onclick="window.markReceived('${p.id}')" title="Đánh dấu đã nhận → cộng kho">✓ Nhận</button>` : ''}
          ${due>0 && p.status==='received' ? `<button class="btn btn-ghost btn-sm" style="color:var(--ok)" onclick="window.payPur('${p.id}')" title="Ghi thanh toán">💰</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  }

  window.openPurDrawer = function (id) {
    const p = getPur().find(x => x.id === id);
    if (!p) return;
    const s = findSup(p.supplierId);
    const dc = document.getElementById('drawerContent');
    dc.innerHTML = `
      <div style="background:linear-gradient(135deg,#16A34A 0%,#1B5E20 100%);color:#fff;padding:20px;position:relative">
        <button onclick="closeDrawer()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:30px;height:30px;border-radius:6px;cursor:pointer">✕</button>
        <h2 style="margin:0;font-size:20px">${p.id}</h2>
        <div style="opacity:0.85;font-size:13px;margin-top:4px">${s?.name || p.supplierId} · ${p.date}</div>
      </div>
      <div style="padding:18px 20px">
        <div style="background:#FAFBFC;padding:12px;border-radius:8px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);margin-bottom:4px">Trạng thái</div>
          <div><span class="st-pill st-${p.status}">${p.status==='ordered'?'⏳ Đã đặt - chờ nhận':p.status==='received'?'✓ Đã nhận hàng':'✕ Hủy'}</span></div>
        </div>

        <h3 style="margin:0 0 8px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">📦 Mặt hàng nhập ${window.helpTip('Khi phiếu chuyển sang "Đã nhận", các SP này sẽ tự cộng vào kho. Giá nhập sẽ cập nhật vào priceHistory của SP.')}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px">
          <thead><tr style="background:#FAFBFC"><th style="text-align:left;padding:6px 8px;font-size:11px">SP</th><th style="text-align:right;padding:6px 8px;font-size:11px">SL</th><th style="text-align:right;padding:6px 8px;font-size:11px">Đơn giá</th><th style="text-align:right;padding:6px 8px;font-size:11px">Thành tiền</th></tr></thead>
          <tbody>
            ${(p.items||[]).map(it => `<tr style="border-top:1px solid #F1F5F9"><td style="padding:6px 8px"><b>${it.name}</b><div style="font-size:10.5px;color:var(--muted)">${it.productId||''}</div></td><td style="text-align:right;padding:6px 8px">${it.qty}</td><td style="text-align:right;padding:6px 8px">${window.fmt(it.price)}</td><td style="text-align:right;padding:6px 8px;font-weight:600">${window.fmt(it.total)}</td></tr>`).join('')}
            <tr style="background:#FAFBFC;font-weight:700"><td colspan="3" style="padding:8px;text-align:right">TỔNG</td><td style="text-align:right;padding:8px">${window.fmt(p.total)} ₫</td></tr>
          </tbody>
        </table>

        <div style="background:${(p.total-p.paid)>0?'#FEE2E2':'#F0FDF4'};padding:10px 12px;border-radius:8px;margin-bottom:12px">
          <div style="font-size:11.5px;color:var(--muted)">Đã trả / Tổng / Còn nợ</div>
          <div style="font-size:14px;font-weight:700;margin-top:2px">${window.fmt(p.paid||0)} / ${window.fmt(p.total)} / <span style="color:${(p.total-p.paid)>0?'#DC2626':'var(--ok)'}">${window.fmt(Math.max(0,p.total-(p.paid||0)))} ₫</span></div>
        </div>

        <div><b>Ghi chú:</b> ${p.note || '—'}</div>

        <div style="display:flex;gap:8px;margin-top:18px">
          ${p.status==='ordered' ? `<button class="btn btn-primary" style="flex:1" onclick="window.markReceived('${p.id}');closeDrawer()">✓ Đã nhận hàng</button>` : ''}
          ${(p.total-(p.paid||0))>0 && p.status==='received' ? `<button class="btn btn-ghost" style="flex:1;color:var(--ok)" onclick="window.payPur('${p.id}');closeDrawer()">💰 Ghi thanh toán</button>` : ''}
          ${p.status!=='cancelled' ? `<button class="btn btn-ghost" style="color:var(--danger)" onclick="window.cancelPur('${p.id}')">✕ Hủy phiếu</button>` : ''}
        </div>
      </div>
    `;
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerBg').classList.add('open');
  };

  window.closeDrawer = function () {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBg').classList.remove('open');
  };

  window.markReceived = function (id) {
    const list = getPur();
    const i = list.findIndex(x => x.id === id);
    if (i < 0 || list[i].status !== 'ordered') return;
    if (!confirm('Xác nhận đã nhận hàng? Kho sẽ tự động cộng các SP trong phiếu.')) return;
    list[i].status = 'received';
    list[i]._invApplied = false; /* trigger inventory.js subscribe */
    /* Cộng công nợ NCC nếu chưa COD */
    const sup = findSup(list[i].supplierId);
    if (sup && sup.paymentTerm !== 'COD') {
      const sups = getSup();
      const si = sups.findIndex(s => s.id === sup.id);
      sups[si].debt = (sups[si].debt || 0) + list[i].total;
      sups[si].totalSpend = (sups[si].totalSpend || 0) + list[i].total;
      window.STORE.set('suppliers', sups);
    } else if (sup) {
      list[i].paid = list[i].total;
      const sups = getSup();
      const si = sups.findIndex(s => s.id === sup.id);
      sups[si].totalSpend = (sups[si].totalSpend || 0) + list[i].total;
      window.STORE.set('suppliers', sups);
    }
    /* Cập nhật priceHistory cho từng SP */
    const prods = getProds();
    const today = window.todayISO();
    (list[i].items || []).forEach(it => {
      const p = prods.find(x => x.id === it.productId);
      if (p && it.price) {
        p.priceHistory = p.priceHistory || [];
        const last = p.priceHistory[p.priceHistory.length-1];
        if (!last || last.date !== today) {
          p.priceHistory.push({ date: today, buy: it.price, sell: Math.round(it.price * 1.55) });
        } else {
          last.buy = it.price;
        }
      }
    });
    window.STORE.set('products', prods);
    window.STORE.set('purchases', list);
    if (window.audit) window.audit.log('purchase.receive', `Nhận ${id} (${window.fmt(list[i].total)} ₫)`);
    window.toast('✓ Đã nhận hàng, cộng kho + cập nhật giá nhập', 'success');
  };

  window.cancelPur = function (id) {
    if (!confirm('Hủy phiếu nhập? Nếu đã nhận hàng, tồn kho sẽ trừ lại.')) return;
    const list = getPur();
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return;
    if (list[i].status === 'received' && list[i]._invApplied) {
      (list[i].items || []).forEach(it => {
        if (it.productId) window.invApply && window.invApply(it.productId, -(it.qty||0));
      });
    }
    list[i].status = 'cancelled';
    window.STORE.set('purchases', list);
    if (window.audit) window.audit.log('purchase.cancel', `Hủy ${id}`);
    window.toast('Đã hủy phiếu', 'danger');
    window.closeDrawer();
  };

  window.payPur = function (id) {
    const p = getPur().find(x => x.id === id);
    if (!p) return;
    const due = p.total - (p.paid || 0);
    const amt = parseFloat(prompt(`Số tiền thanh toán (còn nợ ${window.fmt(due)} ₫):`, due));
    if (!amt || amt <= 0) return;
    const list = getPur();
    const i = list.findIndex(x => x.id === id);
    list[i].paid = (list[i].paid || 0) + amt;
    window.STORE.set('purchases', list);
    /* Giảm công nợ NCC */
    const sups = getSup();
    const si = sups.findIndex(s => s.id === p.supplierId);
    if (si >= 0) {
      sups[si].debt = Math.max(0, (sups[si].debt || 0) - amt);
      window.STORE.set('suppliers', sups);
    }
    /* Ghi phiếu chi */
    const cash = window.STORE.get('cashEntries', []) || [];
    cash.unshift({
      no:'PC' + String(cash.length+1).padStart(4,'0'), date:window.todayVN(),
      type:'expense', amount: amt, account:'Tiền mặt',
      counterparty: findSup(p.supplierId)?.name || p.supplierId,
      description:'Thanh toán phiếu ' + id,
    });
    window.STORE.set('cashEntries', cash);
    if (window.audit) window.audit.log('purchase.pay', `${id}: ${window.fmt(amt)} ₫`);
    window.toast('✓ Đã ghi thanh toán + phiếu chi', 'success');
  };

  /* ====== Tạo phiếu mới ====== */
  window.openPurModal = function (forSup) {
    const sups = getSup().filter(s => s.active);
    const prods = getProds();
    const nextId = 'PN-2026-' + String(getPur().length + 1).padStart(4,'0');
    window.openModal('+ Tạo phiếu nhập', `
      <div style="background:#EFF6FF;color:#1E40AF;padding:9px 12px;border-radius:7px;font-size:12px;margin-bottom:12px">
        💡 <b>Cách dùng:</b> Chọn NCC → thêm các SP đã lấy → bấm Lưu (status: "Đã đặt"). Khi hàng về kho, vào trang Phiếu nhập bấm "✓ Đã nhận" để tự cộng kho.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div><label style="font-size:12px;color:var(--muted)">Mã phiếu</label><input id="pn_id" value="${nextId}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px;font-family:monospace"></div>
        <div><label style="font-size:12px;color:var(--muted)">Ngày nhập</label><input id="pn_date" type="date" value="${(window.todayISO ? window.todayISO() : new Date().toISOString().slice(0,10))}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">NCC *</label><select id="pn_sup" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px">${sups.map(s => `<option value="${s.id}" ${forSup===s.id?'selected':''}>${s.name} · ${s.paymentTerm}</option>`).join('')}</select></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:12px;color:var(--muted);font-weight:600;flex:1">Mặt hàng nhập ${window.helpTip('Bấm "+ Thêm dòng" để thêm thủ công, hoặc dùng "📥 Excel" / "📷 AI ảnh" để thêm hàng loạt.')}</label>
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.pnBulkExcel()" title="Import items từ Excel hàng loạt" style="font-size:11px;padding:3px 8px">📥 Excel</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.pnBulkAI()" title="Đọc ảnh AI: phiếu nhập / list NCC viết tay" style="font-size:11px;padding:3px 8px">📷 Ảnh AI</button>
      </div>
      <datalist id="pnProdList">${prods.map(p => `<option value="${(p.name||'').replace(/"/g,'&quot;')}">`).join('')}</datalist>
      <div id="pn_items"></div>
      <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="window._pnAddRow()">+ Thêm dòng</button>
      <div style="display:flex;justify-content:flex-end;gap:14px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-size:13px">
        <div>Tổng: <b id="pn_total">0</b> ₫</div>
      </div>
      <label style="font-size:12px;color:var(--muted);margin-top:10px;display:block">Ghi chú</label>
      <textarea id="pn_note" rows="2" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></textarea>
    `, {
      footer:`<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
              <button class="btn btn-primary" onclick="window._pnSave()">Lưu phiếu</button>`,
      width:'620px'
    });
    /* Add first row */
    window._pnPRODS = prods;
    window._pnAddRow();
  };

  window._pnAddRow = function (preset) {
    const host = document.getElementById('pn_items');
    if (!host) return;
    const esc = v => String(v == null ? '' : v).replace(/"/g, '&quot;');
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <input type="text" class="pn_name" list="pnProdList" placeholder="Tên SP (gõ hoặc chọn)" value="${preset ? esc(preset.name) : ''}">
      <input type="number" placeholder="SL" class="pn_qty" min="0" step="0.1" value="${preset && preset.qty ? preset.qty : ''}">
      <input type="number" placeholder="Đơn giá" class="pn_price" min="0" value="${preset && preset.price ? preset.price : ''}">
      <input type="text" placeholder="Thành tiền" class="pn_total" readonly style="background:#FAFBFC">
      <button onclick="this.parentElement.remove();window._pnRecalc()" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:16px">✕</button>
    `;
    host.appendChild(row);
    row.querySelectorAll('input').forEach(inp => inp.oninput = window._pnRecalc);
    window._pnRecalc();
  };

  /* Khớp tên SP với danh mục (để lưu productId nếu có) */
  function _pnMatchProd(name) {
    const prods = window._pnPRODS || getProds();
    const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();
    const n = norm(name);
    if (!n) return null;
    return prods.find(x => norm(x.name) === n)
      || prods.find(x => { const xn = norm(x.name); return xn && (xn.includes(n) || n.includes(xn)); })
      || null;
  }

  window._pnRecalc = function () {
    let total = 0;
    document.querySelectorAll('#pn_items .item-row').forEach(r => {
      const q = parseFloat(r.querySelector('.pn_qty').value) || 0;
      const pr = parseFloat(r.querySelector('.pn_price').value) || 0;
      const t = q * pr;
      r.querySelector('.pn_total').value = window.fmt(t);
      total += t;
    });
    document.getElementById('pn_total').textContent = window.fmt(total);
  };

  window._pnSave = function () {
    const items = [];
    document.querySelectorAll('#pn_items .item-row').forEach(r => {
      const name = (r.querySelector('.pn_name').value || '').trim();
      const q = parseFloat(r.querySelector('.pn_qty').value) || 0;
      const pr = parseFloat(r.querySelector('.pn_price').value) || 0;
      if (name && q > 0 && pr > 0) {
        const prod = _pnMatchProd(name);
        items.push({ productId: prod ? prod.id : null, name, qty: q, price: pr, total: q * pr });
      }
    });
    if (!items.length) { window.toast('Thêm ít nhất 1 mặt hàng (tên + SL + giá)', 'warn'); return; }
    const dt = document.getElementById('pn_date').value;
    const m = dt.match(/(\d+)-(\d+)-(\d+)/);
    const obj = {
      id: document.getElementById('pn_id').value,
      supplierId: document.getElementById('pn_sup').value,
      date: m ? `${m[3]}/${m[2]}/${m[1]}` : window.todayVN(),
      status: 'ordered',
      total: items.reduce((s,i) => s + i.total, 0),
      paid: 0,
      items,
      note: document.getElementById('pn_note').value,
    };
    const list = getPur();
    list.push(obj);
    window.STORE.set('purchases', list);
    if (window.audit) window.audit.log('purchase.create', `${obj.id} cho ${findSup(obj.supplierId)?.name || obj.supplierId} (${window.fmt(obj.total)} ₫)`);
    window.toast('✓ Đã tạo phiếu nhập (chưa nhận hàng — vào danh sách bấm "✓ Nhận" khi hàng về)', 'success');
    window.closeModal();
  };

  window.exportPurCsv = function () {
    const list = getPur();
    const head = 'Mã,Ngày,NCC,Tổng,Đã trả,Còn nợ,Trạng thái\n';
    const rows = list.map(p => [p.id, p.date, findSup(p.supplierId)?.name || '', p.total, p.paid||0, p.total-(p.paid||0), p.status].join(','));
    const blob = new Blob(['﻿'+head+rows.join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `phieu-nhap-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  /* Init — KHÔNG có #purBody (vd đang ở tab khác) thì bỏ qua */
  if (document.getElementById('purBody')) {
    /* Trang gộp (Nhà cung cấp 2 tab) → suppliers.js đã dựng shell, KHÔNG gọi lại renderAppShell */
    if (!window.SUP_MERGED) {
      window.renderAppShell('purchases', 'Phiếu nhập');
      const hb = document.getElementById('hbHost');
      if (hb) hb.innerHTML = window.helpBanner(
        '📦 Phiếu nhập làm gì?',
        'Ghi nhận từng đợt lấy hàng từ NCC. Khi bấm <b>"✓ Đã nhận"</b>, hệ thống tự: <b>(1)</b> cộng vào tồn kho, <b>(2)</b> cập nhật giá nhập mới nhất của SP, <b>(3)</b> tạo công nợ phải trả NCC (nếu NET) hoặc ghi phiếu chi ngay (nếu COD).',
        {id:'hb-pur', icon:'📦'}
      );
      const ht = document.getElementById('hbT');
      if (ht) ht.innerHTML = window.helpTip('Đây là chu trình "mua hàng" — đối nghịch với module Đơn hàng (bán cho KH). Liên kết với Kho + NCC + Kế toán.', {size:'lg'});
    }
    ['purQ','purSt','purSup'].forEach(id => { const el = document.getElementById(id); if (el) el.oninput = render; });
    ['purchases','suppliers'].forEach(k => window.STORE.subscribe(k, render));
    render();
  }

  /* === Bulk items helper — nhận MỌI món (kể cả SP ngoài danh mục) === */
  function _pnApplyBulkItems(items) {
    let added = 0, noMatch = 0;
    (items || []).forEach(it => {
      const name = (it.name || '').toString().trim();
      const qty = parseFloat(it.qty) || 0;
      const price = parseFloat(it.price) || 0;
      if (!name || !qty) return;           /* giá có thể nhập sau, chỉ cần tên + SL */
      window._pnAddRow({ name, qty, price });
      if (!_pnMatchProd(name)) noMatch++;
      added++;
    });
    window._pnRecalc();
    window.toast(`✓ Đã thêm ${added} mặt hàng${noMatch ? ' · ' + noMatch + ' SP ngoài danh mục (vẫn nhập được)' : ''}`, added ? 'success' : 'warn');
  }

  window.pnBulkExcel = function() {
    if (!window.BulkImport) { window.toast('BulkImport chưa load','warn'); return; }
    window.BulkImport.fromExcel({
      entityName: 'Mặt hàng phiếu nhập',
      templateColumns: ['name','qty','price'],
      templateRow: ['Dưa chuột', '80', '11000'],
      mapRow: (row) => ({ name: row[0], qty: row[1], price: row[2] }),
      onParsed: (recs) => _pnApplyBulkItems(recs),
    });
  };
  window.pnBulkAI = function() {
    if (!window.BulkImport) { window.toast('BulkImport chưa load','warn'); return; }
    window.BulkImport.fromImage({
      entityName: 'Mặt hàng phiếu nhập',
      promptHint: 'phiếu nhập viết tay / hóa đơn NCC / list rau ngày + giá nhập',
      fields: ['name','qty','price'],
      aiTask: 'invoice',
      customPrompt: `Đọc ảnh chứa phiếu nhập / hóa đơn NCC nông sản (tiếng Việt). Trả JSON: {"items":[{"name":"tên SP","qty":<số kg/đv>,"price":<đơn giá ₫/đv>}]}.
- name: tên SP tiếng Việt
- qty: số nguyên/thập phân, KHÔNG ghi đơn vị
- price: số nguyên VND, KHÔNG dấu chấm/phẩy
CHỈ TRẢ JSON.`,
      onParsed: (recs) => _pnApplyBulkItems(recs),
    });
  };

  /* Handle URL param: createForSup, createFor (productId) */
  const params = new URLSearchParams(location.search);
  if (params.get('createForSup')) setTimeout(() => window.openPurModal(params.get('createForSup')), 300);
  if (params.get('focus')) setTimeout(() => window.openPurDrawer(params.get('focus')), 300);
})();
