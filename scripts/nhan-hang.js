/* =========================================================
   KHO — NHẬN HÀNG NCC (bước 1/2 của luồng nhập hàng)
   ─────────────────────────────────────────────────────────
   Kho CHỈ xác nhận: số lượng THỰC NHẬN + HÀNG LỖI từng mã → cập nhật TỒN KHO
   (phần dư = thực nhận − lỗi − nhu cầu khách). KHÔNG thấy giá / công nợ.
   Kế toán CHỐT CÔNG NỢ sau ở Tài chính → Phiếu nhập (bước 2/2).
   Trạng thái phiếu: 'ordered' (gom tạo) → 'wh_received' (kho nhận) → 'received' (kế toán chốt).
   ========================================================= */
(function () {
  const S = () => window.STORE;
  const getPur = () => (S().get('purchases', window.PURCHASES || []) || []);
  const getProds = () => (S().get('products', window.PRODUCTS || []) || []);
  const getSups = () => (S().get('suppliers', []) || []);
  const _q = v => (+v || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const _isGom = p => /^PN-GOM-/.test((p && p.id) || '');
  const supName = id => (getSups().find(s => s.id === id) || {}).name || id;
  const _sel = new Set();   /* id các phiếu 'ordered' đang chọn để thao tác hàng loạt */
  const _nhOpen = new Set();   /* id các phiếu đang XỔ (accordion) — giữ trạng thái qua re-render */

  /* Xổ/gập 1 phiếu nhận hàng (không re-render → giữ số Thực nhận/Lỗi đã gõ) */
  window.nhToggleCard = function (pid, head) {
    const card = head.closest('.nh-pcard'); if (!card) return;
    const body = card.querySelector('.nh-body'); const caret = head.querySelector('.nh-caret');
    const willOpen = body.style.display === 'none';
    body.style.display = willOpen ? '' : 'none';
    if (caret) caret.textContent = willOpen ? '▾' : '▸';
    if (willOpen) _nhOpen.add(pid); else _nhOpen.delete(pid);
  };

  function itemRows(p) {
    return (p.items || []).map((it, i) => {
      const ordered = +it.qty || 0;
      const isSi = it.cases != null;
      const demand = it.demandQty != null ? +it.demandQty : ordered;
      const sub = isSi
        ? `<div style="font-size:10.5px;color:var(--muted)">${_q(it.cases)} ${esc(it.caseUnit || 'thùng')} · khách cần ${_q(demand)}${esc(it.unit || 'kg')}</div>`
        : (it.demandQty != null ? `<div style="font-size:10.5px;color:var(--muted)">khách cần ${_q(demand)}${esc(it.unit || 'kg')}</div>` : '');
      const pidA = esc(p.id);
      const noteInit = it.defectNote ? esc(it.defectNote) : '';
      const conv = (window.prodUnitConv && it.productId) ? window.prodUnitConv(it.productId) : null;
      /* Nhãn ô Thực nhận = ĐVT sản phẩm; chỉ ép "kg" khi SP có bảng quy đổi (đếm quả/thùng → tính kg).
         Tránh dán "kg" nhầm cho SP tính theo bắp/bó/quả → kho gõ sai → lệch công nợ. */
      const recvUnit = conv ? 'kg' : (it.unit || 'kg');
      const packHelper = conv ? `<div style="margin-top:5px;font-size:11px;color:#92400E;white-space:nowrap">hoặc <input type="number" data-money="0" inputmode="decimal" class="nh-pack" data-p="${pidA}" data-i="${i}" data-kgp="${conv.kgPerPack}" value="${it.packRecv != null ? _q(it.packRecv) : ''}" placeholder="0" oninput="window.nhPackCalc('${pidA}',${i})" style="width:54px;text-align:right;border:1px solid #FDE68A;border-radius:5px;padding:4px 6px;font-size:15px"> ${esc(conv.packUnit)} ×${conv.kgPerPack}kg</div>` : '';
      return `<tr style="border-top:1px solid #F1F5F9">
        <td style="padding:7px 9px"><b>${esc(it.name)}</b>${sub}</td>
        <td style="padding:7px 9px;text-align:right;color:var(--muted)">${_q(ordered)} ${esc(it.unit || 'kg')}</td>
        <td style="padding:7px 9px;text-align:right;vertical-align:top"><input type="number" data-money="0" inputmode="decimal" class="nh-recv" data-p="${pidA}" data-i="${i}" data-ord="${ordered}" value="${_q(ordered)}" min="0" step="0.1" oninput="window.nhRowCalc('${pidA}',${i},'recv')" title="Số hàng TỐT nhận được${conv ? ' (quy ra kg)' : ''}, tính theo ${esc(recvUnit)} (Thực nhận + Lỗi = Đặt)" style="width:80px;text-align:right;border:1px solid var(--line);border-radius:6px;padding:6px 7px;font-size:16px"> ${esc(recvUnit)}${packHelper}</td>
        <td style="padding:7px 9px;text-align:right;vertical-align:top">
          <input type="number" data-money="0" inputmode="decimal" class="nh-def" data-p="${pidA}" data-i="${i}" data-ord="${ordered}" value="" placeholder="0" min="0" step="0.1" oninput="window.nhRowCalc('${pidA}',${i},'def')" style="width:70px;text-align:right;border:1px solid #FCA5A5;border-radius:6px;padding:6px 7px;font-size:16px">
          <input type="text" class="nh-defnote" data-p="${pidA}" data-i="${i}" value="${noteInit}" placeholder="Lý do lỗi…" style="display:${it.defectNote ? 'block' : 'none'};width:130px;margin-top:5px;border:1px solid #FCA5A5;border-radius:6px;padding:6px 7px;font-size:14px">
        </td>
        <td style="padding:7px 9px;text-align:center;white-space:nowrap;vertical-align:top">
          <button class="btn btn-ghost btn-sm" onclick="window.nhEditItem('${esc(p.id)}',${i})" title="Sửa tên / sản lượng mặt hàng" style="padding:4px 8px">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="window.nhDelItem('${esc(p.id)}',${i})" title="Xoá mặt hàng khỏi phiếu" style="padding:4px 8px;color:#DC2626">🗑</button>
        </td>
      </tr>`;
    }).join('');
  }

  function pendingCard(p) {
    const kg = (p.items || []).reduce((s, it) => s + (+it.qty || 0), 0);
    const empty = !(p.items || []).length;
    const _srch = esc((supName(p.supplierId) + ' ' + (p.items || []).map(x => x.name || '').join(' ') + ' ' + p.id).toLowerCase());
    const open = empty || _nhOpen.has(p.id);   /* phiếu trống mở sẵn (để thấy nút thêm); còn lại gập cho gọn */
    return `<div class="card nh-pcard" data-nhsearch="${_srch}" style="background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:14px">
      <div class="nh-phead" onclick="window.nhToggleCard('${esc(p.id)}',this)" title="Bấm để ${open ? 'thu gọn' : 'mở ra điều chỉnh hàng lỗi'}" style="background:linear-gradient(135deg,#1B5E20,#15803D);color:#fff;padding:11px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer">
        <input type="checkbox" class="nh-selphieu" data-pid="${esc(p.id)}" onclick="event.stopPropagation();window.nhToggleSel('${esc(p.id)}',this.checked)" ${_sel.has(p.id) ? 'checked' : ''} title="Chọn phiếu để nhận / xoá hàng loạt" style="width:18px;height:18px;cursor:pointer;accent-color:#E8A33D">
        <span class="nh-caret" style="font-size:13px;width:12px;display:inline-block;transition:transform .15s">${open ? '▾' : '▸'}</span>
        <span style="font-size:15px">🏭</span><b style="font-size:14.5px">${esc(supName(p.supplierId))}</b>
        <span style="opacity:.85;font-size:11.5px">${(p.items || []).length} mã · ${_q(kg)}kg đặt · phiếu ${esc(p.id)}</span>
        <div style="flex:1"></div>
        <button class="btn btn-sm" onclick="event.stopPropagation();window.nhDelPhieu('${esc(p.id)}')" title="Xoá cả phiếu nhập này (gom sai / ấn nhầm)" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.35);padding:4px 10px">🗑 Xoá phiếu</button>
      </div>
      <div class="nh-body" style="display:${open ? '' : 'none'}">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:#F8FAF8;color:var(--muted);font-size:11px;text-transform:uppercase">
          <th style="padding:6px 9px;text-align:left">Mặt hàng</th><th style="padding:6px 9px;text-align:right">Đặt</th>
          <th style="padding:6px 9px;text-align:right">Thực nhận</th><th style="padding:6px 9px;text-align:right">Hàng lỗi</th>
          <th style="padding:6px 9px;text-align:center;width:96px">Sửa / Xoá</th>
        </tr></thead><tbody>${empty ? `<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--muted)">Phiếu trống — bấm “➕ Thêm mặt hàng” hoặc “🗑 Xoá phiếu”.</td></tr>` : itemRows(p)}</tbody>
      </table>
      <div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;background:#FAFBFC;border-top:1px solid var(--line);flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="window.nhAddItem('${esc(p.id)}')" title="Thêm mặt hàng còn thiếu vào phiếu">➕ Thêm mặt hàng</button>
        <button class="btn btn-primary" ${empty ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''} onclick="window.nhReceive('${esc(p.id)}')">✓ Xác nhận đã nhận kho</button>
      </div>
      </div>
    </div>`;
  }

  function waitingRow(p) {
    const surplus = (p.items || []).reduce((s, it) => s + (+it.stockedQty || 0), 0);
    const defect = (p.items || []).reduce((s, it) => s + (+it.defectQty || 0), 0);
    const recv = (p.items || []).reduce((s, it) => s + (+it.recvQty || 0), 0);
    const _srch = esc((supName(p.supplierId) + ' ' + (p.items || []).map(x => x.name || '').join(' ') + ' ' + p.id).toLowerCase());
    return `<tr data-nhsearch="${_srch}" style="border-top:1px solid #F1F5F9">
      <td style="padding:8px 10px"><b>${esc(supName(p.supplierId))}</b><div style="font-size:10.5px;color:var(--muted)">${esc(p.id)}${p.whBy ? ' · ' + esc(p.whBy) : ''}${p.whReceivedAt ? ' · ' + esc(p.whReceivedAt) : ''}</div></td>
      <td style="padding:8px 10px;text-align:right">${_q(recv)}</td>
      <td style="padding:8px 10px;text-align:right;color:${defect ? '#B45309' : 'var(--muted)'}">${defect ? _q(defect) : '·'}</td>
      <td style="padding:8px 10px;text-align:right;color:#15803D">${surplus ? '+' + _q(surplus) : '·'}</td>
      <td style="padding:8px 10px;text-align:right"><button class="btn btn-ghost btn-sm" onclick="window.nhUndo('${esc(p.id)}')" title="Hoàn tác nếu nhập nhầm">↩ Hoàn tác</button></td>
    </tr>`;
  }

  function render() {
    const host = document.getElementById('nhHost'); if (!host) return;
    const list = getPur().filter(_isGom);
    const pending = list.filter(p => p.status === 'ordered');
    const waiting = list.filter(p => p.status === 'wh_received');
    /* dọn selection: chỉ giữ id còn ở trạng thái chờ nhận */
    const pendIds = new Set(pending.map(p => p.id));
    Array.from(_sel).forEach(id => { if (!pendIds.has(id)) _sel.delete(id); });
    const selCount = _sel.size;
    let html = '';
    html += `<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:11px 14px;font-size:12.5px;color:#1E40AF;margin-bottom:16px">
      📦 <b>Kho xác nhận thực nhận & hàng lỗi</b> → hệ <b>TỰ CHỐT công nợ NCC</b> theo giá nhập danh mục (ngày nhập). Phần dư tự vào tồn kho. Kế toán <b>sửa lại giá/công nợ</b> ở Tài chính → Phiếu nhập.</div>`;
    html += `<input id="nhSearchInp" value="${esc(_searchVal)}" oninput="window.nhSearch(this.value)" placeholder="🔍 Tìm nhà cung cấp hoặc mặt hàng để xác nhận…" style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:16px;margin-bottom:12px">`;
    html += `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 10px;position:sticky;top:0;background:var(--bg,#F7F8F7);z-index:5;padding:4px 0">
        <div style="font-weight:800;color:#1B5E20;font-size:13px">⏳ Chờ nhận kho (${pending.length})</div>
        ${pending.length ? `<label style="font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="nhSelAll" onclick="window.nhToggleAll(this.checked)" ${selCount && selCount === pending.length ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;accent-color:#E8A33D">Chọn tất cả</label>` : ''}
        <div style="flex:1"></div>
        <div id="nhBulkActions" style="display:${selCount ? 'flex' : 'none'};gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:12.5px;color:var(--muted)">Đã chọn <b data-selcount>${selCount}</b> phiếu</span>
          <button class="btn btn-primary btn-sm" onclick="window.nhReceiveBulk()" title="Xác nhận đã nhận kho tất cả phiếu đã chọn (dùng số Thực nhận đang hiển thị)">✓ Nhận kho hàng loạt</button>
          <button class="btn btn-ghost btn-sm" style="color:#DC2626" onclick="window.nhDelBulk()" title="Xoá các phiếu đã chọn">🗑 Xoá</button>
        </div>
      </div>`;
    html += pending.length ? pending.map(pendingCard).join('')
      : `<div style="background:#fff;border:1px dashed var(--line);border-radius:10px;padding:26px;text-align:center;color:var(--muted);margin-bottom:16px">Không có phiếu nào chờ nhận. Phiếu tự sinh khi <b>chốt phiên gom hàng</b>.</div>`;
    if (waiting.length) {
      html += `<div style="font-weight:800;color:#15803D;font-size:13px;margin:20px 0 8px">✅ Đã nhận kho — chờ kế toán chốt công nợ (${waiting.length})</div>
        <div style="background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:#F0FDF4;color:var(--muted);font-size:11px;text-transform:uppercase">
            <th style="padding:7px 10px;text-align:left">Nhà cung cấp</th><th style="padding:7px 10px;text-align:right">Thực nhận</th>
            <th style="padding:7px 10px;text-align:right">Lỗi</th><th style="padding:7px 10px;text-align:right">Vào kho</th><th></th>
          </tr></thead><tbody>${waiting.map(waitingRow).join('')}</tbody>
        </table></div>`;
    }
    host.innerHTML = html;
    _applyFilter();   /* giữ bộ lọc tìm kiếm sau mỗi lần vẽ lại */
  }

  /* ===== Kho xác nhận nhận hàng: cập nhật TỒN KHO (phần dư) + lưu SL/lỗi, KHÔNG chốt công nợ =====
     _receiveOne đọc ô Thực nhận / Hàng lỗi đang hiển thị + cộng kho phần dư; KHÔNG gọi S().set
     (để nhận-hàng-loạt gộp 1 lần lưu). Trả tổng dư + lỗi. */
  function _receiveOne(p) {
    let surplusTot = 0, defTot = 0;
    const pid = (p.id + '').replace(/"/g, '\\"');
    (p.items || []).forEach((it, idx) => {
      const recvEl = document.querySelector('.nh-recv[data-p="' + pid + '"][data-i="' + idx + '"]');
      const defEl = document.querySelector('.nh-def[data-p="' + pid + '"][data-i="' + idx + '"]');
      const noteEl = document.querySelector('.nh-defnote[data-p="' + pid + '"][data-i="' + idx + '"]');
      const ordered = +it.qty || 0;
      /* Ô "Thực nhận" = hàng TỐT dùng được; "Lỗi" tách riêng. Lưu recvQty = TỔNG (tốt+lỗi) để giữ
         nguyên math chốt công nợ (good = recvQty − defect). */
      const recvGood = recvEl ? (+recvEl.value || 0) : ordered;
      const defect = Math.max(0, defEl ? (+defEl.value || 0) : 0);
      const good = recvGood;
      const recvTotal = Math.round((recvGood + defect) * 100) / 100;
      const demand = it.demandQty != null ? +it.demandQty : ordered;
      /* Tồn kho cloud là numeric → giữ kg lẻ (2 số thập phân). stockedQty = số đã cộng kho (dùng để
         trừ lại khi hoàn tác) → khớp với cái đã invApply. */
      const surplus = Math.max(0, Math.round((good - demand) * 100) / 100);
      it.recvQty = recvTotal; it.defectQty = defect; it.goodQty = good; it.stockedQty = surplus;
      it.defectNote = (defect > 0 && noteEl) ? (noteEl.value || '').trim() : '';
      /* Lưu số theo đơn vị nhập (quả/bó) để đối chiếu NCC — kg vẫn là số dùng tính tiền/công nợ */
      const packEl = document.querySelector('.nh-pack[data-p="' + pid + '"][data-i="' + idx + '"]');
      if (packEl && (+packEl.value || 0) > 0) { const c = window.prodUnitConv && it.productId ? window.prodUnitConv(it.productId) : null; it.packRecv = +packEl.value || 0; if (c) it.packUnit = c.packUnit; }
      surplusTot += surplus; defTot += defect;
      /* phiếu gom = giao thẳng khách phần "demand"; chỉ phần DƯ vào kho */
      if (surplus > 0 && it.productId) {
        if (window.invApply) window.invApply(it.productId, +surplus);
        if (window.invRecordMovement) window.invRecordMovement(it.productId, +surplus, 'purchase', 'Kho nhận (dư sỉ) · ' + p.id, p.id);
      }
    });
    p.status = 'wh_received';
    p.whReceivedAt = window.todayVN ? window.todayVN() : '';
    p.whBy = (window.CURRENT_USER && window.CURRENT_USER.name) || '';
    return { surplusTot, defTot };
  }
  window.nhReceive = function (id) {
    const list = getPur(); const i = list.findIndex(x => x.id === id);
    if (i < 0 || list[i].status !== 'ordered') return;
    const { surplusTot, defTot } = _receiveOne(list[i]);
    _sel.delete(id);
    S().set('purchases', list);
    if (window.audit) window.audit.log('purchase.wh_receive', 'Kho nhận ' + id + (surplusTot ? ' · tồn +' + _q(surplusTot) : '') + (defTot ? ' · lỗi ' + _q(defTot) : ''));
    window.toast && window.toast('✓ Đã nhận kho + tự chốt công nợ NCC' + (surplusTot ? ' · tồn +' + _q(surplusTot) + 'kg' : '') + ' (kế toán sửa được ở Phiếu nhập)', 'success');
  };

  /* ===== Chọn phiếu để thao tác hàng loạt (cập nhật thanh công cụ, KHÔNG render lại kẻo mất số đã gõ) ===== */
  function _syncBulkBar() {
    const acts = document.getElementById('nhBulkActions');
    if (acts) { acts.style.display = _sel.size ? 'flex' : 'none'; const c = acts.querySelector('[data-selcount]'); if (c) c.textContent = _sel.size; }
    const all = document.getElementById('nhSelAll');
    const total = document.querySelectorAll('.nh-selphieu').length;
    if (all) all.checked = total > 0 && _sel.size === total;
  }
  window.nhToggleSel = function (id, on) { if (on) _sel.add(id); else _sel.delete(id); _syncBulkBar(); };
  window.nhToggleAll = function (on) {
    document.querySelectorAll('.nh-selphieu').forEach(cb => { cb.checked = on; const id = cb.dataset.pid; if (on) _sel.add(id); else _sel.delete(id); });
    _syncBulkBar();
  };

  /* Auto-nhảy: Thực nhận (tốt) + Lỗi = Đặt. Sửa 1 ô → ô kia tự tính. Lỗi > 0 → hiện ô lý do. */
  window.nhRowCalc = function (pid, i, src) {
    const pe = String(pid).replace(/"/g, '\\"');
    const recvEl = document.querySelector('.nh-recv[data-p="' + pe + '"][data-i="' + i + '"]');
    const defEl = document.querySelector('.nh-def[data-p="' + pe + '"][data-i="' + i + '"]');
    const noteEl = document.querySelector('.nh-defnote[data-p="' + pe + '"][data-i="' + i + '"]');
    if (!recvEl || !defEl) return;
    const ord = +recvEl.getAttribute('data-ord') || 0;
    if (src === 'def') {
      const d = Math.max(0, +defEl.value || 0);
      recvEl.value = _q(Math.max(0, Math.round((ord - d) * 100) / 100));
    } else {
      const r = Math.max(0, +recvEl.value || 0);
      defEl.value = r >= ord ? '' : _q(Math.round((ord - r) * 100) / 100);
    }
    if (noteEl) noteEl.style.display = (+defEl.value || 0) > 0 ? 'block' : 'none';
  };
  /* Nhập theo đơn vị (quả/bó) → tự ra kg vào ô Thực nhận (vẫn sửa kg thực cân được — hướng C) */
  window.nhPackCalc = function (pid, i) {
    const pe = String(pid).replace(/"/g, '\\"');
    const packEl = document.querySelector('.nh-pack[data-p="' + pe + '"][data-i="' + i + '"]');
    const recvEl = document.querySelector('.nh-recv[data-p="' + pe + '"][data-i="' + i + '"]');
    if (!packEl || !recvEl) return;
    const kgp = +packEl.getAttribute('data-kgp') || 0;
    const packs = +packEl.value || 0;
    if (packs > 0 && kgp > 0) { recvEl.value = _q(Math.round(packs * kgp * 100) / 100); window.nhRowCalc(pid, i, 'recv'); }
  };

  /* Tìm kiếm NCC / mặt hàng — ẩn/hiện thẻ & dòng theo data-nhsearch (KHÔNG render lại → không mất số đã gõ) */
  let _searchVal = '';
  window.nhSearch = function (v) { _searchVal = v || ''; _applyFilter(); };
  function _applyFilter() {
    const q = _searchVal.trim().toLowerCase();
    document.querySelectorAll('[data-nhsearch]').forEach(el => {
      const t = el.getAttribute('data-nhsearch') || '';
      el.style.display = (!q || t.indexOf(q) >= 0) ? '' : 'none';
    });
  }

  const _selectedPendingIds = () => getPur().filter(p => _isGom(p) && p.status === 'ordered' && _sel.has(p.id)).map(p => p.id);

  window.nhReceiveBulk = async function () {
    let ids = _selectedPendingIds();
    if (!ids.length) { window.toast && window.toast('Chưa chọn phiếu nào', 'warn'); return; }
    if (!(await window.uiConfirm(`Xác nhận đã nhận kho ${ids.length} phiếu đã chọn?\nDùng số "Thực nhận" đang hiển thị (mặc định = số đặt). Phần dư tự vào tồn kho.`, { title: '✓ Nhận kho hàng loạt', okText: 'Nhận ' + ids.length + ' phiếu' }))) return;
    const list = getPur();   /* lấy lại bản mới nhất SAU khi xác nhận */
    ids = ids.filter(id => { const p = list.find(x => x.id === id); return p && p.status === 'ordered'; });
    if (!ids.length) { window.toast && window.toast('Các phiếu đã được xử lý', 'info'); return; }
    let ns = 0, nd = 0;
    ids.forEach(id => { const p = list.find(x => x.id === id); const r = _receiveOne(p); ns += r.surplusTot; nd += r.defTot; });
    _sel.clear();
    S().set('purchases', list);
    if (window.audit) window.audit.log('purchase.wh_receive_bulk', 'Kho nhận hàng loạt ' + ids.length + ' phiếu' + (ns ? ' · tồn +' + _q(ns) : ''));
    window.toast && window.toast('✓ Đã nhận kho + tự chốt công nợ ' + ids.length + ' phiếu' + (ns ? ' · tồn +' + _q(ns) + 'kg' : ''), 'success');
  };

  window.nhDelBulk = async function () {
    let ids = _selectedPendingIds();
    if (!ids.length) { window.toast && window.toast('Chưa chọn phiếu nào', 'warn'); return; }
    if (!(await window.uiConfirm(`Xoá HẲN ${ids.length} phiếu nhập đã chọn?\nDùng khi gom sai / ấn nhầm. Không ảnh hưởng đơn khách.`, { title: '🗑 Xoá phiếu hàng loạt', okText: 'Xoá ' + ids.length + ' phiếu', danger: true }))) return;
    const list = getPur();
    const delIds = ids.filter(id => { const p = list.find(x => x.id === id); return p && p.status === 'ordered'; });
    if (!delIds.length) { window.toast && window.toast('Các phiếu đã được xử lý', 'info'); return; }
    _sel.clear();
    delIds.forEach(id => S().remove('purchases', id));   /* remove() xoá THẬT từng phiếu trên cloud + đặt bia mộ chống hồi sinh */
    if (window.audit) window.audit.log('purchase.delete_bulk', 'Xoá hàng loạt ' + delIds.length + ' phiếu nhập (chưa nhận)');
    window.toast && window.toast('Đã xoá ' + delIds.length + ' phiếu', 'info');
  };

  /* ===== Hoàn tác nhận kho (nhập nhầm) → trừ lại tồn dư, về 'ordered' ===== */
  window.nhUndo = async function (id) {
    const list = getPur(); const i = list.findIndex(x => x.id === id);
    if (i < 0 || list[i].status !== 'wh_received') return;
    if (!(await window.uiConfirm('Hoàn tác "đã nhận kho"? Phần tồn kho đã cộng sẽ bị trừ lại.', { title: '↩ Hoàn tác nhận kho', okText: 'Hoàn tác', danger: true }))) return;
    const p = list[i];
    (p.items || []).forEach(it => {
      if (+it.stockedQty > 0 && it.productId) {
        if (window.invApply) window.invApply(it.productId, -(+it.stockedQty));
        if (window.invRecordMovement) window.invRecordMovement(it.productId, -(+it.stockedQty), 'adjust', 'Hoàn nhận kho ' + p.id, p.id);
      }
      it.recvQty = null; it.defectQty = null; it.goodQty = null; it.stockedQty = null;
    });
    p.status = 'ordered'; p.whReceivedAt = null; p.whBy = null;
    S().set('purchases', list);
    if (window.audit) window.audit.log('purchase.wh_undo', 'Hoàn tác nhận kho ' + id);
    window.toast && window.toast('Đã hoàn tác nhận kho', 'info');
  };

  /* ===== SỬA / THÊM / XOÁ mặt hàng trong phiếu (gom sai sản lượng / thiếu / thừa mã) ===== */
  const _prodDatalist = () => getProds().filter(x => x && x.name).map(x => `<option value="${esc(x.name)}"></option>`).join('');
  function _openItemForm(pid, idx) {
    const p = getPur().find(x => x.id === pid); if (!p) return;
    const isNew = idx < 0;
    const it = isNew ? { name: '', qty: 0, unit: 'kg' } : (p.items || [])[idx];
    if (!it) return;
    const isSi = it.cases != null;
    const lbl = 'font-size:12px;color:var(--muted);display:block;margin-bottom:4px';
    const inp = 'width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px';
    window.openModal((isNew ? '➕ Thêm mặt hàng — ' : '✏️ Sửa mặt hàng — ') + esc(pid), `
      <div style="display:flex;flex-direction:column;gap:13px;max-width:600px">
        <div>
          <label style="${lbl}">Tên mặt hàng <span style="color:#94A3B8">(gõ để chọn từ danh sách sản phẩm — link tồn kho đúng)</span></label>
          <input id="nhfName" list="nhfProds" value="${esc(it.name || '')}" placeholder="VD: Cà chua đại" autocomplete="off" style="${inp}">
          <datalist id="nhfProds">${_prodDatalist()}</datalist>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:120px"><label style="${lbl}">Sản lượng đặt</label><input id="nhfQty" type="number" data-money="0" step="0.1" min="0" value="${_q(it.qty || 0)}" style="${inp};text-align:right"></div>
          <div style="width:120px"><label style="${lbl}">Đơn vị</label><input id="nhfUnit" value="${esc(it.unit || 'kg')}" placeholder="kg" style="${inp}"></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:120px"><label style="${lbl}">Khách cần <span style="color:#94A3B8">(để tính phần dư vào kho)</span></label><input id="nhfDemand" type="number" data-money="0" step="0.1" min="0" value="${_q(it.demandQty != null ? it.demandQty : (it.qty || 0))}" style="${inp};text-align:right"></div>
          ${isSi ? `<div style="width:120px"><label style="${lbl}">Số ${esc(it.caseUnit || 'thùng')}</label><input id="nhfCases" type="number" data-money="0" step="0.1" min="0" value="${it.cases ? _q(it.cases) : ''}" placeholder="0" style="${inp};text-align:right"></div>` : ''}
        </div>
        <div style="font-size:11.5px;color:var(--muted);background:#F8FAFC;border-radius:8px;padding:8px 11px">💡 Sửa <b>Sản lượng đặt</b> nếu bên gom hàng nhập nhầm. “Thực nhận” khi bấm nhận kho sẽ mặc định theo số đặt mới.</div>
      </div>`, {
      width: '600px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
               <button class="btn btn-primary" onclick="window.nhSaveItem('${esc(pid)}',${idx})">${isNew ? '➕ Thêm vào phiếu' : '💾 Lưu'}</button>`
    });
  }
  window.nhEditItem = (pid, idx) => _openItemForm(pid, idx);
  window.nhAddItem = (pid) => _openItemForm(pid, -1);

  window.nhSaveItem = function (pid, idx) {
    const list = getPur(); const p = list.find(x => x.id === pid); if (!p) return;
    if (p.status !== 'ordered') { window.toast && window.toast('Phiếu đã nhận kho — hoàn tác trước khi sửa', 'warn'); return; }
    const g = id => document.getElementById(id);
    const name = (g('nhfName') && g('nhfName').value || '').trim();
    if (!name) { window.toast && window.toast('Nhập tên mặt hàng', 'warn'); return; }
    const qty = +(g('nhfQty') && g('nhfQty').value) || 0;
    const unit = ((g('nhfUnit') && g('nhfUnit').value) || 'kg').trim() || 'kg';
    const demand = g('nhfDemand') ? (+g('nhfDemand').value || 0) : qty;
    const prod = getProds().find(pp => String(pp.name || '').trim().toLowerCase() === name.toLowerCase());
    p.items = p.items || [];
    const it = idx < 0 ? {} : p.items[idx]; if (!it && idx >= 0) return;
    it.name = name; it.qty = qty; it.unit = unit; it.demandQty = demand;
    if (g('nhfCases')) it.cases = +g('nhfCases').value || 0;
    if (prod) it.productId = prod.id;
    if (it.price != null) it.total = Math.round(qty * (+it.price || 0));
    if (idx < 0) p.items.push(it);
    S().set('purchases', list);
    if (window.audit) window.audit.log('purchase.item_edit', (idx < 0 ? 'Thêm' : 'Sửa') + ' mặt hàng "' + name + '" phiếu ' + pid);
    window.closeModal && window.closeModal();
    window.toast && window.toast(idx < 0 ? '✓ Đã thêm mặt hàng' : '✓ Đã sửa mặt hàng', 'success');
  };

  window.nhDelItem = async function (pid, idx) {
    const list = getPur(); const p = list.find(x => x.id === pid); if (!p || !(p.items || [])[idx]) return;
    if (p.status !== 'ordered') { window.toast && window.toast('Phiếu đã nhận kho — hoàn tác trước khi sửa', 'warn'); return; }
    const nm = p.items[idx].name || 'mặt hàng';
    if (!(await window.uiConfirm(`Xoá "${nm}" khỏi phiếu ${pid}?`, { title: '🗑 Xoá mặt hàng', okText: 'Xoá', danger: true }))) return;
    p.items.splice(idx, 1);
    S().set('purchases', list);
    if (window.audit) window.audit.log('purchase.item_del', 'Xoá mặt hàng "' + nm + '" phiếu ' + pid);
    window.toast && window.toast('Đã xoá mặt hàng', 'info');
  };

  window.nhDelPhieu = async function (pid) {
    const list = getPur(); const p = list.find(x => x.id === pid); if (!p) return;
    if (p.status !== 'ordered') { window.toast && window.toast('Phiếu đã nhận kho — hoàn tác trước khi xoá', 'warn'); return; }
    if (!(await window.uiConfirm(`Xoá HẲN phiếu nhập ${pid}?\nNCC: ${supName(p.supplierId)}\n\nDùng khi gom hàng ấn nhầm / sai NCC. Không ảnh hưởng đơn khách.`, { title: '🗑 Xoá phiếu nhập', okText: 'Xoá phiếu', danger: true }))) return;
    _sel.delete(pid);
    S().remove('purchases', pid);   /* remove() mới xoá THẬT trên cloud (set() không xoá → reload hồi lại) */
    if (window.audit) window.audit.log('purchase.delete', 'Xoá phiếu nhập ' + pid + ' (chưa nhận, từ Nhận hàng NCC)');
    window.toast && window.toast('Đã xoá phiếu ' + pid, 'info');
  };

  window.renderAppShell && window.renderAppShell('nhan-hang', 'Nhận hàng NCC');
  function boot() {
    if (!window.STORE) { setTimeout(boot, 150); return; }
    render();
    window.STORE.subscribe('purchases', render);
    window.STORE.subscribe('suppliers', render);
  }
  boot();
})();
