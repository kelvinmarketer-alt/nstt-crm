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

  function itemRows(p) {
    return (p.items || []).map((it, i) => {
      const ordered = +it.qty || 0;
      const isSi = it.cases != null;
      const demand = it.demandQty != null ? +it.demandQty : ordered;
      return `<tr style="border-top:1px solid #F1F5F9">
        <td style="padding:7px 9px"><b>${esc(it.name)}</b>${isSi ? `<div style="font-size:10.5px;color:var(--muted)">${_q(it.cases)} ${esc(it.caseUnit || 'thùng')} · khách cần ${_q(demand)}${esc(it.unit || 'kg')}</div>` : ''}</td>
        <td style="padding:7px 9px;text-align:right;color:var(--muted)">${_q(ordered)} ${esc(it.unit || 'kg')}</td>
        <td style="padding:7px 9px;text-align:right"><input type="number" data-money="0" class="nh-recv" data-p="${esc(p.id)}" data-i="${i}" value="${ordered}" min="0" step="0.1" style="width:78px;text-align:right;border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:13px"></td>
        <td style="padding:7px 9px;text-align:right"><input type="number" data-money="0" class="nh-def" data-p="${esc(p.id)}" data-i="${i}" value="0" min="0" step="0.1" style="width:66px;text-align:right;border:1px solid #FCA5A5;border-radius:6px;padding:5px 7px;font-size:13px"></td>
      </tr>`;
    }).join('');
  }

  function pendingCard(p) {
    const kg = (p.items || []).reduce((s, it) => s + (+it.qty || 0), 0);
    return `<div class="card" style="background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:14px">
      <div style="background:linear-gradient(135deg,#1B5E20,#15803D);color:#fff;padding:11px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:15px">🏭</span><b style="font-size:14.5px">${esc(supName(p.supplierId))}</b>
        <span style="opacity:.85;font-size:11.5px">${(p.items || []).length} mã · ${_q(kg)}kg đặt · phiếu ${esc(p.id)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:#F8FAF8;color:var(--muted);font-size:11px;text-transform:uppercase">
          <th style="padding:6px 9px;text-align:left">Mặt hàng</th><th style="padding:6px 9px;text-align:right">Đặt</th>
          <th style="padding:6px 9px;text-align:right">Thực nhận</th><th style="padding:6px 9px;text-align:right">Hàng lỗi</th>
        </tr></thead><tbody>${itemRows(p)}</tbody>
      </table>
      <div style="padding:10px 14px;display:flex;justify-content:flex-end;gap:8px;background:#FAFBFC;border-top:1px solid var(--line)">
        <button class="btn btn-primary" onclick="window.nhReceive('${esc(p.id)}')">✓ Xác nhận đã nhận kho</button>
      </div>
    </div>`;
  }

  function waitingRow(p) {
    const surplus = (p.items || []).reduce((s, it) => s + (+it.stockedQty || 0), 0);
    const defect = (p.items || []).reduce((s, it) => s + (+it.defectQty || 0), 0);
    const recv = (p.items || []).reduce((s, it) => s + (+it.recvQty || 0), 0);
    return `<tr style="border-top:1px solid #F1F5F9">
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
    let html = '';
    html += `<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:11px 14px;font-size:12.5px;color:#1E40AF;margin-bottom:16px">
      📦 <b>Kho chỉ xác nhận số lượng thực nhận & hàng lỗi.</b> Phần dư tự vào tồn kho. Giá & công nợ do <b>Kế toán</b> chốt sau (Tài chính → Phiếu nhập).</div>`;
    html += `<div style="font-weight:800;color:#1B5E20;font-size:13px;margin:0 0 10px">⏳ Chờ nhận kho (${pending.length})</div>`;
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
  }

  /* ===== Kho xác nhận nhận hàng: cập nhật TỒN KHO (phần dư) + lưu SL/lỗi, KHÔNG chốt công nợ ===== */
  window.nhReceive = function (id) {
    const list = getPur(); const i = list.findIndex(x => x.id === id);
    if (i < 0 || list[i].status !== 'ordered') return;
    const p = list[i];
    let surplusTot = 0, defTot = 0;
    (p.items || []).forEach((it, idx) => {
      const recvEl = document.querySelector('.nh-recv[data-p="' + (id + '').replace(/"/g, '\\"') + '"][data-i="' + idx + '"]');
      const defEl = document.querySelector('.nh-def[data-p="' + (id + '').replace(/"/g, '\\"') + '"][data-i="' + idx + '"]');
      const ordered = +it.qty || 0;
      const recv = recvEl ? (+recvEl.value || 0) : ordered;
      const defect = Math.min(Math.max(0, defEl ? (+defEl.value || 0) : 0), recv);
      const good = Math.max(0, recv - defect);
      const demand = it.demandQty != null ? +it.demandQty : ordered;
      /* Tồn kho cloud là số NGUYÊN → làm tròn phần dư (kg lẻ nông sản). stockedQty = số đã cộng kho
         (cũng dùng để trừ lại khi hoàn tác) → phải khớp với cái đã invApply. */
      const surplus = Math.round(Math.max(0, good - demand));
      it.recvQty = recv; it.defectQty = defect; it.goodQty = good; it.stockedQty = surplus;
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
    S().set('purchases', list);
    if (window.audit) window.audit.log('purchase.wh_receive', 'Kho nhận ' + id + (surplusTot ? ' · tồn +' + _q(surplusTot) : '') + (defTot ? ' · lỗi ' + _q(defTot) : ''));
    window.toast && window.toast('✓ Đã nhận kho' + (surplusTot ? ' · tồn +' + _q(surplusTot) + 'kg' : '') + ' · chờ kế toán chốt công nợ', 'success');
  };

  /* ===== Hoàn tác nhận kho (nhập nhầm) → trừ lại tồn dư, về 'ordered' ===== */
  window.nhUndo = function (id) {
    const list = getPur(); const i = list.findIndex(x => x.id === id);
    if (i < 0 || list[i].status !== 'wh_received') return;
    if (!confirm('Hoàn tác "đã nhận kho"? Phần tồn kho đã cộng sẽ bị trừ lại.')) return;
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

  window.renderAppShell && window.renderAppShell('nhan-hang', 'Nhận hàng NCC');
  function boot() {
    if (!window.STORE) { setTimeout(boot, 150); return; }
    render();
    window.STORE.subscribe('purchases', render);
    window.STORE.subscribe('suppliers', render);
  }
  boot();
})();
