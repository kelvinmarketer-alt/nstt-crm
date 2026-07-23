/* =========================================================
   Purchases (Phiếu nhập) — tạo / nhận / huỷ
   ─────────────────────────────────────────────────────────
   - status: 'ordered' (đã đặt, chưa nhận) → 'received' (đã nhận, cộng kho)
   - Khi received: trigger inventory subscribe → +stock; tính công nợ NCC
   - Khi huỷ: nếu đã received → trừ kho lại
   ========================================================= */
(function () {
  /* NCC ảo "Thu mua ngoài" — mã chưa có NCC cố định, thu mua đi chợ/vãng lai.
     KHÔNG lưu vào bảng suppliers (tránh phình + không hiện như NCC gắn sao trong gom đơn). */
  const EXT_SUP_ID = 'EXT-MARKET';
  const EXT_SUP = { id: EXT_SUP_ID, name: '🛒 Thu mua ngoài', paymentTerm: 'COD', system: true };

  function getPur() { return window.STORE.get('purchases', window.PURCHASES || []) || []; }
  function getSup() { return window.STORE.get('suppliers', window.SUPPLIERS || []) || []; }
  function getProds() { return window.STORE.get('products', window.PRODUCTS || []) || []; }
  function findSup(id) { return id === EXT_SUP_ID ? EXT_SUP : getSup().find(s => s.id === id); }
  /* Loại NCC + cờ "cho trả hàng" — lưu kv supplierMeta (dùng chung procurement/suppliers). */
  const _supMeta = () => window.STORE.get('supplierMeta', {}) || {};
  const _canReturnOf = id => !!((_supMeta()[id] || {}).canReturn);
  const _isGomNcc = p => /^PN-GOM-/.test((p && p.id) || '');   /* phiếu NCC từ phiên gom (không phải TMN thu mua ngoài) */
  const _q = v => (+v || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  const _escP = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ===== Trường KHÔNG có cột trên cloud purchases (bị strip khi sync) → tự chứa ===== */
  /* Số hoá đơn NCC (đầu vào) — lưu KV đồng bộ được, theo mã phiếu */
  const _pnInv = () => (window.STORE.get('purchaseInvoices', {}) || {});
  function _pnSetInv(id, val) {
    val = String(val || '').trim();
    if (window.STORE.rmwKv) window.STORE.rmwKv('purchaseInvoices', c => { c = (c && typeof c === 'object') ? c : {}; if (val) c[id] = val; else delete c[id]; return c; }, {});
    else { const m = _pnInv(); if (val) m[id] = val; else delete m[id]; window.STORE.set('purchaseInvoices', m); }
  }
  const _pnInvOf = p => (p && (p.invoiceNo || _pnInv()[p.id])) || '';
  /* Phiên gom của phiếu tự tạo — SUY từ mã (PN-<runId>-<supId> / TMN-<runId>), khỏi cần cột gom_run_id */
  function _pnGomRun(p) {
    if (!p) return '';
    if (p.gomRunId) return p.gomRunId;
    const id = p.id || '';
    if (/^TMN-GOM-/.test(id)) return id.slice(4);
    const m = id.match(/^PN-(GOM-[^-]+)-/);
    return m ? m[1] : '';
  }
  /* Không cộng kho? phiếu GOM + THU MUA NGOÀI = giao thẳng → không cộng tồn (suy từ mã, khỏi cột no_stock) */
  function _pnNoStock(p) {
    if (!p) return false;
    if (p.supplierId === EXT_SUP_ID || (findSup(p.supplierId) || {}).system) return true;
    if (/^(PN|TMN)-GOM-/.test(p.id || '')) return true;
    return p.noStock === true;   /* phiếu tay: giá trị phiên (mất sau reload → về mặc định cộng kho) */
  }

  /* Sinh số phiếu quỹ không trùng PK 'no': lấy max seq hiện có theo prefix rồi +1,
     kiểm tra tồn tại (tránh trùng nếu dữ liệu thưa/nhảy số). */
  function _nextCashNo(cash, prefix) {
    const list = cash || [];
    const rx = new RegExp('^' + prefix + '(\\d+)$');
    let max = 0;
    list.forEach(c => { const m = c && c.no && String(c.no).match(rx); if (m) { const n = +m[1]; if (n > max) max = n; } });
    let seq = max + 1;
    let no = prefix + String(seq).padStart(4, '0');
    while (list.some(c => c && c.no === no)) { seq++; no = prefix + String(seq).padStart(4, '0'); }
    return no;
  }

  /* Phiếu thu mua ngoài (tiền mặt) vs phiếu NCC (công nợ) */
  const _isExt = p => p.supplierId === EXT_SUP_ID || (findSup(p.supplierId) || {}).system;
  /* 'dd/mm/yyyy' → khóa sắp xếp 'yyyymmdd' */
  function _dmyKey(d) { const m = String(d || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? (m[3] + m[2].padStart(2, '0') + m[1].padStart(2, '0')) : '00000000'; }
  /* Tab đang xem: 'ncc' | 'ext' */
  window._purTab = window._purTab || 'ncc';

  window.purSetTab = function (t) {
    window._purTab = t;
    document.querySelectorAll('#purTabs .pn-tab').forEach(el => el.classList.toggle('on', el.dataset.tab === t));
    /* Lọc NCC chỉ có nghĩa ở tab NCC */
    const supWrap = document.getElementById('purSup'); if (supWrap) supWrap.style.display = t === 'ext' ? 'none' : '';
    render();
  };

  function renderKpis(rows, isExt) {
    const _now = window.todayDate ? window.todayDate() : new Date();
    const today = window.todayVN();
    const _mmyyyy = `/${String(_now.getMonth()+1).padStart(2,'0')}/${_now.getFullYear()}`;
    const _monthLabel = `T${_now.getMonth()+1}/${_now.getFullYear()}`;
    const box = (label, val, sub, color, tip) => `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">${label} ${tip?window.helpTip(tip):''}</div><div style="font-size:22px;font-weight:800;color:${color};margin-top:4px">${val}</div><div style="font-size:11.5px;color:var(--muted)">${sub||''}</div></div>`;
    const el = document.getElementById('purKpis');
    if (isExt) {
      /* Thu mua ngoài: kiểm soát tiền mặt bỏ ra mua chợ/vãng lai */
      const todayL = rows.filter(p => p.date === today);
      const monthL = rows.filter(p => (p.date||'').endsWith(_mmyyyy) && p.status !== 'cancelled');
      const monthSpend = monthL.reduce((s,p)=>s+(p.total||0),0);
      const days = new Set(monthL.map(p=>p.date)).size || 1;
      el.innerHTML =
        box('🛒 Mua ngoài hôm nay', window.fmtShort(todayL.reduce((s,p)=>s+(p.total||0),0)), todayL.length+' phiếu', '#B45309', 'Tiền mặt bỏ ra mua chợ/vãng lai trong ngày.') +
        box('💵 Mua ngoài '+_monthLabel, window.fmtShort(monthSpend), monthL.length+' phiếu', '#B45309', 'Tổng tiền mặt mua ngoài cả tháng — kiểm soát lượng mua ngoài.') +
        box('📅 Số ngày có mua', days+'', 'ngày trong tháng', 'var(--navy)') +
        box('📊 TB / ngày', window.fmtShort(Math.round(monthSpend/days)), 'bình quân', 'var(--ok)', 'Trung bình tiền mua ngoài mỗi ngày trong tháng.');
    } else {
      const todayL = rows.filter(p => p.date === today);
      const ordered = rows.filter(p => p.status === 'ordered');
      const monthSpend = rows.filter(p => p.status === 'received' && (p.date||'').endsWith(_mmyyyy)).reduce((s,p)=>s+(p.total||0),0);
      /* Chưa thanh toán = Σ công nợ NCC DẪN XUẤT (nhập received − phiếu chi tiền mặt − trả hàng),
         KHỚP trang Công nợ NCC. KHÔNG dùng p.paid (thanh toán nay chỉ ghi phiếu chi, p.paid luôn 0). */
      const _cashOut = window.STORE.get('cashEntries', []) || [];
      const _claims = window.STORE.get('supplierClaims', []) || [];
      const _sups = getSup();
      const _nhap = rows.filter(p => p.status === 'received').reduce((s,p)=>s+(+p.total||0),0);
      const _paidCash = _cashOut.filter(e => e && e.type === 'out' && _sups.some(s => e.party === s.name || (e.desc && String(e.desc).includes(s.id)))).reduce((s,e)=>s+(+e.amount||0),0);
      const _openClaims = _claims.filter(c => c && c.status !== 'settled' && c.status !== 'cancelled').reduce((s,c)=>s+(+c.amount||0),0);
      const unpaid = Math.max(0, _nhap - _paidCash - _openClaims);
      el.innerHTML =
        box('Nhập hôm nay', todayL.length+' <span style="font-size:13px;color:var(--muted);font-weight:500">phiếu</span>', window.fmtShort(todayL.reduce((s,p)=>s+(p.total||0),0))+' ₫', 'var(--navy)', 'Số phiếu + giá trị nhập NCC trong ngày.') +
        box('⏳ Chờ nhận', ordered.length+'', window.fmtShort(ordered.reduce((s,p)=>s+(p.total||0),0))+' ₫', '#92400E', 'Phiếu đã đặt nhưng NCC chưa giao.') +
        box('💸 Chi nhập '+_monthLabel, window.fmtShort(monthSpend), '', 'var(--ok)', 'Tổng chi nhập NCC trong tháng — = COGS (giá vốn).') +
        box('🔴 Chưa thanh toán', window.fmtShort(unpaid), '', '#DC2626', 'Tiền đã nhận nhưng chưa trả NCC. = Σ công nợ NCC.');
    }
  }

  function render() {
    const list = getPur();
    const sups = getSup();
    const tab = window._purTab || 'ncc';
    /* Badge đếm 2 tab */
    const nccAll = list.filter(p => !_isExt(p)), extAll = list.filter(p => _isExt(p));
    const cN = document.getElementById('cntNcc'), cE = document.getElementById('cntExt');
    if (cN) cN.textContent = nccAll.length; if (cE) cE.textContent = extAll.length;

    /* Build sup select (chỉ NCC thật) */
    const ss = document.getElementById('purSup');
    const cur = ss.value;
    ss.innerHTML = '<option value="">Tất cả NCC</option>' + sups.map(s => `<option value="${s.id}" ${cur===s.id?'selected':''}>${s.name}</option>`).join('');

    const q = (document.getElementById('purQ').value || '').toLowerCase();
    const st = document.getElementById('purSt').value;
    const sup = document.getElementById('purSup').value;
    let rows = (tab === 'ext' ? extAll : nccAll).slice();
    renderKpis(rows, tab === 'ext');
    if (q)   rows = rows.filter(p => (p.id + ' ' + (findSup(p.supplierId)?.name || '') + ' ' + (p.items || []).map(it => it.name || '').join(' ')).toLowerCase().includes(q));
    if (st)  rows = rows.filter(p => p.status === st);
    if (sup && tab !== 'ext') rows = rows.filter(p => p.supplierId === sup);

    const tb = document.getElementById('purBody');
    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="9" style="padding:36px;text-align:center;color:var(--muted)">${tab==='ext'?'Chưa có phiếu thu mua ngoài nào.':'Không có phiếu nhập nào.'}</td></tr>`;
      return;
    }

    /* Gom theo NGÀY — accordion. Ngày mới nhất mở sẵn. */
    const byDay = {};
    rows.forEach(p => { const k = _dmyKey(p.date); (byDay[k] = byDay[k] || { date: p.date, items: [] }).items.push(p); });
    const dayKeys = Object.keys(byDay).sort().reverse();

    const rowHtml = p => {
      const s = findSup(p.supplierId);
      const due = (p.total||0) - (p.paid||0);
      return `<tr class="pn-item pnd-${_dmyKey(p.date)}" data-id="${p.id}" onclick="window.openPurDrawer('${p.id}')" style="cursor:pointer" title="Bấm để xem/điền giá">
        <td class="hide-xs" onclick="event.stopPropagation()"><div class="checkbox" onclick="this.classList.toggle('on')"></div></td>
        <td data-field="sup"><b style="color:var(--navy)">${s ? s.name : p.supplierId}</b>${s?.paymentTerm ? `<div style="font-size:11px;color:var(--muted)">${s.paymentTerm}</div>` : ''}</td>
        <td data-field="code">${p.id}</td>
        <td class="hide-xs">${(p.items||[]).length} mặt hàng</td>
        <td class="num" data-field="total"><b>${window.fmt(p.total)}</b></td>
        <td class="num hide-xs">${window.fmt(p.paid||0)}</td>
        <td class="num hide-xs" style="color:${due>0?'#DC2626':'var(--ok)'}">${due>0?window.fmt(due):'—'}</td>
        <td data-field="status"><span class="st-pill st-${p.status}">${p.status==='ordered'?'⏳ Đã đặt':p.status==='wh_received'?'📦 Kho đã nhận':p.status==='received'?(_isExt(p)?'✓ Đã mua':'✓ Đã nhận'):'✕ Hủy'}</span></td>
        <td class="hide-xs" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="window.openPurDrawer('${p.id}')" title="Xem chi tiết">👁</button>
          <button class="btn btn-ghost btn-sm" onclick="window.printPur('${p.id}')" title="In phiếu nhập">🖨</button>
          ${p.status==='wh_received' ? `<button class="btn btn-ghost btn-sm" style="color:#B91C1C" onclick="window.markReceived('${p.id}')" title="Kế toán chốt công nợ NCC">💰 Chốt công nợ</button>`
            : p.status==='ordered' ? (_isGomNcc(p) ? `<button class="btn btn-ghost btn-sm" style="color:#B91C1C" onclick="window.markReceived('${p.id}')" title="Kế toán chốt công nợ trực tiếp (kho chưa nhận cũng chốt được)">💰 Chốt công nợ</button>` : `<button class="btn btn-ghost btn-sm" style="color:var(--ok)" onclick="window.markReceived('${p.id}')" title="Đánh dấu đã nhận → cộng kho">✓ Nhận</button>`)
            : p.status==='received' ? `<button class="btn btn-ghost btn-sm" style="color:#B45309" onclick="window.openSettleDialog('${p.id}')" title="Sửa lại giá / công nợ đã chốt">✏️ Sửa nợ</button>` : ''}
        </td>
      </tr>`;
    };

    tb.innerHTML = dayKeys.map((k, di) => {
      const g = byDay[k];
      const tot = g.items.reduce((s,p)=>s+(p.total||0),0);
      const nSup = new Set(g.items.map(p=>p.supplierId)).size;
      const open = di === 0;   /* ngày mới nhất mở sẵn */
      const meta = tab === 'ext'
        ? `${g.items.length} phiếu`
        : `${g.items.length} phiếu · ${nSup} NCC`;
      const dayRow = `<tr class="pn-day${open?' open':''}" onclick="window.purToggleDay('${k}')">
        <td colspan="9"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="cr">▶</span>
          <b style="font-size:14px">📅 ${g.date}</b>
          <span class="d-meta">${meta}</span>
          <span style="flex:1"></span>
          <span class="d-sum">${window.fmt(tot)} ₫</span>
        </div></td></tr>`;
      const items = g.items.map(p => rowHtml(p).replace('class="pn-item ', `class="pn-item ${open?'show ':''}`)).join('');
      return dayRow + items;
    }).join('');

    /* Bulk ops: chọn / xóa hàng loạt (side-effect status vẫn phải qua nút riêng) */
    if (window.attachBulkOps) {
      const tbl = tb.closest('table');
      if (tbl) {
        if (!tbl.id) tbl.id = 'tblPur';
        window.attachBulkOps({ tableSelector: '#tblPur', selectAllSelector: '#purSelectAll', store: 'purchases', label: 'phiếu' });
      }
    }
  }

  /* Xổ/gập 1 ngày */
  window.purToggleDay = function (k) {
    const hd = document.querySelector(`.pn-day[onclick*="'${k}'"]`);
    if (hd) hd.classList.toggle('open');
    const opened = hd && hd.classList.contains('open');
    document.querySelectorAll('.pnd-' + k).forEach(r => r.classList.toggle('show', opened));
  };

  window.openPurDrawer = function (id) {
    const p = getPur().find(x => x.id === id);
    if (!p) return;
    const s = findSup(p.supplierId);
    const isExt = p.supplierId === EXT_SUP_ID || (findSup(p.supplierId) || {}).system;
    const due = (p.total || 0) - (p.paid || 0);
    const gomRun = _pnGomRun(p), noStock = _pnNoStock(p);
    const _a = v => String(v == null ? '' : v).replace(/"/g, '&quot;');
    const body = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <span class="st-pill st-${p.status}">${p.status==='ordered'?'⏳ Đã đặt - chờ nhận':p.status==='wh_received'?'📦 Kho đã nhận - chờ chốt công nợ':p.status==='received'?'✓ Đã nhận hàng':'✕ Hủy'}</span>
        <span style="font-size:12.5px;color:var(--muted)">${s?.name || p.supplierId} · ${p.date}${gomRun ? ' · từ phiên <b>'+gomRun+'</b>' : ''}</span>
      </div>
      ${(p.status==='ordered' && _isGomNcc(p)) ? `<div style="background:#EFF6FF;border:1px solid #BFDBFE;color:#1E40AF;border-radius:8px;padding:8px 11px;font-size:12px;margin-bottom:12px">⏳ Phiếu từ phiên gom — <b>chờ KHO nhận</b> (nhập SL + hàng lỗi) ở trang <b>Nhận hàng NCC</b>, sau đó kế toán mới chốt công nợ.</div>`
        : p.status==='wh_received' ? `<div style="background:#F0FDF4;border:1px solid #86EFAC;color:#15803D;border-radius:8px;padding:8px 11px;font-size:12px;margin-bottom:12px">📦 Kho đã nhận hàng${p.whBy?' ('+_a(p.whBy)+')':''}. Kế toán khớp <b>giá</b> + chọn cho trả / hao hụt → <b>💰 Chốt công nợ</b>.</div>`
        : p.status==='ordered' ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:8px;padding:8px 11px;font-size:12px;margin-bottom:12px">✍️ Điền <b>giá thật từng mã</b> (ô vàng) → <b>💾 Lưu giá</b> hoặc <b>✓ Đã nhận</b> → ${isExt?'chi tiền mặt (sổ quỹ)':'ghi <b>công nợ NCC</b>'} + giá vốn${noStock?'':' + cộng kho'}.</div>` : ''}
      <h3 style="margin:0 0 8px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">📦 Mặt hàng nhập</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">
        <thead><tr style="background:#FAFBFC"><th style="text-align:left;padding:6px 8px;font-size:11px">SP</th><th style="text-align:right;padding:6px 8px;font-size:11px">SL</th><th style="text-align:right;padding:6px 8px;font-size:11px">Đơn giá</th><th style="text-align:right;padding:6px 8px;font-size:11px">Thành tiền</th></tr></thead>
        <tbody id="pnEditItems">
          ${(p.items||[]).map((it,i) => {
            const priceCell = p.status === 'ordered'
              ? `<input class="pn-eprice" type="number" min="0" step="1000" value="${it.price||''}" data-i="${i}" data-qty="${it.qty}" placeholder="giá" oninput="window.pnRecalcDrawer()" style="width:98px;text-align:right;border:1px solid #F59E0B;border-radius:5px;padding:5px 7px;font-size:12.5px;background:#FFFBEB">`
              : window.fmt(it.price);
            const siInfo = it.cases != null ? ` · <b>${_q(it.cases)} ${_escP(it.caseUnit||'thùng')}</b>${it.demandQty != null ? ` · khách cần ${_q(it.demandQty)}${_escP(it.unit||'kg')}` : ''}` : '';
            const recvInfo = it.recvQty != null ? `<div style="font-size:10.5px;color:${it.defectQty ? '#B45309' : '#15803D'}">✓ thực nhận ${_q(it.recvQty)}${it.defectQty ? ` · lỗi ${_q(it.defectQty)} (${it.canReturn ? 'trả NCC' : 'hao hụt'})` : ''}${it.stockedQty ? ` · dư vào kho ${_q(it.stockedQty)}` : ''}</div>` : '';
            return `<tr style="border-top:1px solid #F1F5F9"><td style="padding:6px 8px"><b>${it.name}</b><div style="font-size:10.5px;color:var(--muted)">${it.productId||''} · ${it.qty} ${it.unit||'kg'}${siInfo}</div>${recvInfo}</td><td style="text-align:right;padding:6px 8px">${it.qty}</td><td style="text-align:right;padding:6px 8px">${priceCell}</td><td class="pn-etot" data-i="${i}" style="text-align:right;padding:6px 8px;font-weight:600">${window.fmt(it.total)}</td></tr>`;
          }).join('')}
          <tr style="background:#FAFBFC;font-weight:700"><td colspan="3" style="padding:8px;text-align:right">TỔNG</td><td id="pnEditTotal" style="text-align:right;padding:8px">${window.fmt(p.total)} ₫</td></tr>
        </tbody>
      </table>

      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
        <label style="flex:1;min-width:180px;font-size:12px;color:var(--muted)">🧾 Số hóa đơn NCC (đầu vào)
          <input id="pnInvNo" value="${_a(_pnInvOf(p))}" placeholder="số HĐ / ký hiệu (nếu có)" ${p.status==='cancelled'?'disabled':''} style="width:100%;margin-top:3px;border:1px solid var(--line);border-radius:5px;padding:6px 8px;font-size:12.5px">
        </label>
        ${(!isExt && !gomRun && p.status==='ordered') ? `<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);cursor:pointer;padding-bottom:7px"><input type="checkbox" id="pnStockCb" ${noStock?'':'checked'}> Cộng vào tồn kho khi nhận</label>` : ''}
      </div>

      <div style="background:${due>0?'#FEE2E2':'#F0FDF4'};padding:10px 12px;border-radius:8px;margin-bottom:10px">
        <div style="font-size:11.5px;color:var(--muted)">Đã trả / Tổng / Còn nợ</div>
        <div style="font-size:14px;font-weight:700;margin-top:2px">${window.fmt(p.paid||0)} / ${window.fmt(p.total)} / <span style="color:${due>0?'#DC2626':'var(--ok)'}">${window.fmt(Math.max(0,due))} ₫</span></div>
      </div>
      <div style="font-size:12.5px"><b>Ghi chú:</b> ${p.note || '—'}</div>`;
    const footer = `
      ${(gomRun && p.status==='ordered') ? `<button class="btn btn-ghost" style="color:#B45309" onclick="window.pnBackToGom('${p.id}')" title="Trả cả phiên gom về bước gán NCC để sửa">↩ Về phiên gom</button>` : ''}
      <button class="btn btn-ghost" onclick="window.printPur('${p.id}')">🖨 In</button>
      ${p.status==='ordered' ? `<button class="btn btn-navy" onclick="window.pnSaveItemPrices('${p.id}')">💾 Lưu giá</button>` : ''}
      ${(p.status==='ordered' && !_isGomNcc(p)) ? `<button class="btn btn-primary" onclick="window.pnReceiveFromModal('${p.id}')">✓ Đã nhận</button>` : ''}
      ${((p.status==='wh_received') || (p.status==='ordered' && _isGomNcc(p))) ? `<button class="btn btn-primary" onclick="window.openSettleDialog('${p.id}')">💰 Chốt công nợ</button>` : ''}
      ${p.status==='received' ? `<button class="btn btn-ghost" onclick="window.pnSaveInvoice('${p.id}')" title="Lưu số hoá đơn NCC (hoá đơn thường về sau khi nhận hàng)">💾 Lưu HĐ</button>` : ''}
      ${p.status==='received' ? `<button class="btn btn-ghost" style="color:#B45309" onclick="window.openSettleDialog('${p.id}')" title="Sửa lại giá / công nợ đã chốt">✏️ Sửa nợ</button>` : ''}
      ${(due>0 && p.status==='received') ? `<span style="font-size:11.5px;color:var(--muted);align-self:center">💡 Thanh toán ở <b>Công nợ NCC</b></span>` : ''}
      ${p.status!=='cancelled' ? `<button class="btn btn-ghost" style="color:var(--danger)" onclick="window.cancelPur('${p.id}')">✕ Hủy phiếu</button>` : ''}`;
    window.openModal(`📦 ${p.id}`, body, { footer, width: '660px' });
  };

  /* Đọc số HĐ NCC + cờ cộng kho từ popup vào phiếu */
  function _pnReadDrawerMeta(p) {
    const inv = document.getElementById('pnInvNo'); if (inv) { p.invoiceNo = inv.value.trim(); _pnSetInv(p.id, p.invoiceNo); }
    const cb = document.getElementById('pnStockCb'); if (cb) p.noStock = !cb.checked;
  }
  /* ✓ Đã nhận từ popup: lưu giá + số HĐ + cờ kho TRƯỚC rồi mới nhận (để total/kho/HĐ đúng) */
  window.pnReceiveFromModal = function (id) {
    window.pnSaveItemPrices(id, true);
    window.markReceived(id);
    window.closeModal && window.closeModal();
  };
  /* Lưu riêng số hoá đơn NCC (phiếu đã nhận — hoá đơn thường về sau) */
  window.pnSaveInvoice = function (id) {
    const list = getPur(); const p = list.find(x => x.id === id); if (!p) return;
    const inp = document.getElementById('pnInvNo'); if (inp) { p.invoiceNo = inp.value.trim(); _pnSetInv(id, p.invoiceNo); }
    window.STORE.set('purchases', list);
    window.toast && window.toast('✓ Đã lưu số hoá đơn', 'success');
  };
  /* ↩ Về phiên gom để sửa (từ phiếu tự tạo) — điều hướng sang trang Gom hàng + trả phiên về bước gán NCC */
  window.pnBackToGom = async function (id) {
    const p = getPur().find(x => x.id === id); const run = _pnGomRun(p); if (!p || !run) return;
    if (!(await window.uiConfirm(`Về phiên gom ${run} để sửa?\nPhiếu nháp này (chưa nhận) sẽ được gỡ khi trả phiên về — chốt lại sẽ tạo phiếu mới.`, { title: '↩ Về phiên gom', okText: 'Về phiên gom' }))) return;
    window.closeModal && window.closeModal();
    const top = window.top || window;
    try { top.location.href = 'procurement.html?reopen=' + encodeURIComponent(run); }
    catch (e) { location.href = 'procurement.html?reopen=' + encodeURIComponent(run); }
  };

  window.closeDrawer = function () {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBg').classList.remove('open');
  };

  /* Tính lại thành tiền + tổng khi kho gõ giá trong drawer (phiếu "Đã đặt") */
  window.pnRecalcDrawer = function () {
    let tot = 0;
    document.querySelectorAll('#pnEditItems .pn-eprice').forEach(inp => {
      const qty = +inp.dataset.qty || 0, price = +inp.value || 0, i = inp.dataset.i;
      const line = Math.round(qty * price); tot += line;
      const cell = document.querySelector(`#pnEditItems .pn-etot[data-i="${i}"]`);
      if (cell) cell.textContent = window.fmt(line);
    });
    const tt = document.getElementById('pnEditTotal'); if (tt) tt.textContent = window.fmt(tot) + ' ₫';
  };
  /* Lưu giá vừa điền vào phiếu (chỉ khi 'ordered'). silent=true → không toast/re-render (dùng khi bấm Đã nhận). */
  window.pnSaveItemPrices = function (id, silent) {
    const list = getPur(); const p = list.find(x => x.id === id); if (!p || p.status !== 'ordered') return;
    document.querySelectorAll('#pnEditItems .pn-eprice').forEach(inp => {
      const i = +inp.dataset.i; if (!p.items[i]) return;
      const price = +inp.value || 0; p.items[i].price = price;
      p.items[i].total = Math.round((+p.items[i].qty || 0) * price);
    });
    p.total = (p.items || []).reduce((s, i) => s + (+i.total || 0), 0);
    _pnReadDrawerMeta(p);   /* số HĐ NCC + cờ cộng kho */
    window.STORE.set('purchases', list);
    if (!silent) { window.toast && window.toast('✓ Đã lưu giá — bấm "✓ Đã nhận" khi hàng về', 'success'); window.openPurDrawer(id); }
  };
  window.markReceived = async function (id) {
    const list = getPur();
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return;
    const isExt = list[i].supplierId === EXT_SUP_ID || (findSup(list[i].supplierId) || {}).system;
    /* Phiếu NCC từ phiên gom → luồng 2 BƯỚC: KHO nhận (trang "Nhận hàng NCC", nhập SL+lỗi) → KẾ TOÁN chốt công nợ. */
    if (!isExt && _isGomNcc(list[i])) {
      /* Kế toán chốt được cả khi kho CHƯA nhận ('ordered') lẫn kho đã nhận ('wh_received'). */
      if (list[i].status === 'ordered' || list[i].status === 'wh_received') { window.openSettleDialog(id); return; }
      return;
    }
    if (list[i].status !== 'ordered') return;
    const willStock = !_pnNoStock(list[i]);
    const confMsg = isExt
      ? 'Xác nhận đã nhận hàng thu mua ngoài?\n→ Ghi CHI TIỀN MẶT vào sổ quỹ kế toán + cập nhật giá vốn' + (willStock ? ' + cộng kho.' : ' (không cộng kho).')
      : 'Xác nhận đã nhận hàng?\n→ Ghi CÔNG NỢ phải trả NCC + cập nhật giá vốn' + (willStock ? ' + cộng kho.' : ' (không cộng kho).');
    if (!(await window.uiConfirm(confMsg, { title: isExt ? '🛒 Nhận hàng thu mua ngoài' : '📦 Nhận hàng NCC', okText: '✓ Đã nhận' }))) return;
    list[i].status = 'received';
    list[i]._invApplied = false; /* trigger inventory.js subscribe (bị bỏ qua nếu noStock) */
    const sup = findSup(list[i].supplierId);
    if (isExt) {
      /* Thu mua ngoài: trả tiền mặt ngay → ghi PHIẾU CHI vào sổ quỹ kế toán (schema chuẩn type:'out') */
      list[i].paid = list[i].total;
      const cash = window.STORE.get('cashEntries', []) || [];
      cash.unshift({
        no: _nextCashNo(cash, 'PC'), date: list[i].date || window.todayVN(),
        type: 'out', party: 'Thu mua ngoài', account: 'Tiền mặt',
        amount: list[i].total,
        desc: 'Thu mua ngoài ' + list[i].id + ' · ' + (list[i].items || []).length + ' mã',
      });
      window.STORE.set('cashEntries', cash);
    } else if (sup) {
      /* Mua hàng NCC → LUÔN ghi công nợ phải trả (chỉ thu mua ngoài mới chi tiền mặt ngay) */
      window.STORE.update('suppliers', sup.id, {
        debt: (sup.debt || 0) + list[i].total,
        totalSpend: (sup.totalSpend || 0) + list[i].total,
      });
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
    if (window.audit) window.audit.log('purchase.receive', `Nhận ${id} (${window.fmt(list[i].total)} ₫)${isExt ? ' [thu mua ngoài]' : ''}`);
    window.toast(isExt
      ? '✓ Đã nhận · ghi chi tiền mặt vào sổ quỹ + cập nhật giá vốn' + (willStock ? ' + cộng kho' : '')
      : '✓ Đã nhận hàng' + (willStock ? ', cộng kho' : '') + ' + cập nhật giá nhập', 'success');
  };

  /* Ngày phiếu (dd/mm/yyyy) → ISO, để tra giá vốn theo ĐÚNG ngày nhập. */
  function _pnDateISO(p) { const m = String(p && p.date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : window.todayISO(); }
  /* Giá NHẬP có hiệu lực vào 1 ngày = mốc giá GẦN NHẤT ≤ ngày đó trong lịch sử giá SP (carry-forward).
     → Chốt công nợ NCC lấy đúng giá của thời điểm nhập, dù hôm nay giá đã đổi. */
  function _buyPriceOn(productId, dateISO) {
    if (!productId) return 0;
    const pr = getProds().find(x => x.id === productId); if (!pr || !Array.isArray(pr.priceHistory)) return 0;
    /* Mốc giá NHẬP gần nhất ≤ ngày & buy>0 (bỏ qua mốc buy=0 = mốc sell-only / seed cũ) → giá vốn khớp. */
    let best = null; pr.priceHistory.forEach(h => { if (h && h.date && h.date <= dateISO && (+h.buy || 0) > 0 && (!best || h.date > best.date)) best = h; });
    return best ? (+best.buy || 0) : 0;
  }

  /* ===== KẾ TOÁN — CHỐT CÔNG NỢ cho phiếu gom NCC =====
     Kế toán được chốt TRỰC TIẾP dù kho CHƯA nhận (status 'ordered') HAY kho đã nhận ('wh_received').
     - Từ 'ordered' (kho chưa nhập): kế toán tự nhập Thực nhận + Lỗi (sửa được) và HỆ cộng phần dư vào tồn kho.
     - Từ 'wh_received' (kho đã nhập): Thực nhận + Lỗi khoá theo số kho, tồn kho kho đã cộng → không cộng lại.
     Xử lý hàng lỗi chọn theo TỪNG mặt hàng (cho trả → trừ nợ / không trả → hao hụt). KHÔNG đụng giá vốn tồn của SP khác. */
  window.openSettleDialog = function (id) {
    /* Chỉ KẾ TOÁN (hoặc thu mua / leader) được chốt công nợ — kho không. */
    if (window.AUTH && window.AUTH.hasPerm && !(window.AUTH.hasPerm('accounting.edit') || window.AUTH.hasPerm('purchases.create'))) {
      window.toast && window.toast('Chỉ Kế toán được chốt công nợ NCC.', 'warn'); return;
    }
    const p = getPur().find(x => x.id === id); if (!p || (p.status !== 'wh_received' && p.status !== 'ordered' && p.status !== 'received')) return;
    const reSettle = p.status === 'received';    /* SỬA lại công nợ đã chốt (auto/thủ công) → chỉnh delta nợ, KHÔNG cộng lại kho */
    const fromWh = p.status === 'wh_received';   /* kho đã nhập SL/lỗi + cộng tồn → khoá cột, không cộng lại kho */
    const _dISO = _pnDateISO(p);   /* ngày nhập → tra giá vốn của ĐÚNG ngày đó */
    const sup = findSup(p.supplierId) || {};
    const canRetDefault = p.canReturn != null ? !!p.canReturn : _canReturnOf(p.supplierId);
    const inS = 'text-align:right;border:1px solid var(--line);border-radius:5px;padding:4px 6px';
    const rows = (p.items || []).map((it, i) => {
      const recv = it.recvQty != null ? +it.recvQty : (+it.qty || 0);
      const defect = it.defectQty != null ? +it.defectQty : 0;
      const unit = _escP(it.unit || 'kg');
      const recvCell = fromWh
        ? `${_q(recv)} ${unit}`
        : `<input type="number" data-money="0" class="stl-recv" data-i="${i}" value="${_q(recv)}" min="0" step="0.1" oninput="window._settleRecalc('${id}')" style="width:82px;${inS}"> ${unit}`;
      const defCell = fromWh
        ? `<span style="color:${defect ? '#B45309' : 'var(--muted)'}">${defect ? _q(defect) : '·'}</span>`
        : `<input type="number" data-money="0" class="stl-def" data-i="${i}" value="${defect ? _q(defect) : ''}" placeholder="0" min="0" step="0.1" oninput="window._settleRecalc('${id}')" style="width:72px;${inS};border-color:#FCA5A5">`;
      return `<tr style="border-top:1px solid #F1F5F9">
        <td style="padding:7px 10px"><b>${_escP(it.name)}</b>${it.stockedQty ? `<div style="font-size:10.5px;color:#15803D">dư vào kho ${_q(it.stockedQty)}${unit}</div>` : ''}</td>
        <td style="padding:7px 10px;text-align:right">${recvCell}</td>
        <td style="padding:7px 10px;text-align:right">${defCell}</td>
        <td style="padding:7px 10px;text-align:center">
          <select class="stl-ret" data-i="${i}" onchange="window._settleRecalc('${id}')" style="padding:5px 7px;border:1px solid var(--line);border-radius:6px;font-size:12px;max-width:230px">
            <option value="1" ${canRetDefault ? 'selected' : ''}>↩ NCC cho trả — trừ nợ</option>
            <option value="0" ${!canRetDefault ? 'selected' : ''}>🗑 Không trả — hao hụt</option>
          </select>
          <div class="stl-rethint" data-i="${i}" style="font-size:10px;color:var(--muted);margin-top:2px"></div>
        </td>
        <td style="padding:7px 10px;text-align:right"><input type="number" data-money="0" class="stl-price" data-i="${i}" value="${+it.price || _buyPriceOn(it.productId, _dISO) || ''}" min="0" step="1000" placeholder="giá" title="Tự lấy giá nhập của ngày ${_dISO.split('-').reverse().join('/')} từ lịch sử giá SP — sửa lại được" oninput="window._settleRecalc('${id}')" style="width:110px;${inS};border-color:#F59E0B;background:#FFFBEB"></td>
        <td class="stl-tot" data-i="${i}" style="padding:7px 10px;text-align:right;font-weight:700">0</td>
      </tr>`;
    }).join('');
    const body = `<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">${reSettle
        ? '✏️ <b>Sửa lại công nợ đã chốt</b> — chỉnh giá / thực nhận / xử lý lỗi → công nợ NCC tự cập nhật theo chênh lệch. (Tồn kho không cộng lại.)'
        : fromWh
        ? 'Kho đã nhận ' + (p.whBy ? '(<b>' + _escP(p.whBy) + '</b>' + (p.whReceivedAt ? ' · ' + _escP(p.whReceivedAt) : '') + ') ' : '') + '— kế toán khớp <b>giá nhập</b> + xử lý hàng lỗi từng mặt hàng → chốt công nợ.'
        : '⚡ Kế toán chốt <b>trực tiếp</b> (kho chưa nhận). Nhập <b>Thực nhận</b> + <b>Lỗi</b> từng mặt hàng, khớp <b>giá</b>, chọn xử lý lỗi → chốt công nợ (hệ tự cộng phần dư vào tồn kho).'}</div>
      <div style="overflow:auto;border:1px solid var(--line);border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:720px">
        <thead><tr style="background:#F8FAF8;color:var(--muted);font-size:11px;text-transform:uppercase">
          <th style="padding:7px 10px;text-align:left">Mặt hàng</th>
          <th style="padding:7px 10px;text-align:right">Thực nhận</th>
          <th style="padding:7px 10px;text-align:right">Lỗi</th>
          <th style="padding:7px 10px;text-align:center;min-width:210px">Xử lý lỗi (từng SP)</th>
          <th style="padding:7px 10px;text-align:right">Giá nhập</th>
          <th style="padding:7px 10px;text-align:right">Thành tiền</th>
        </tr></thead><tbody>${rows}</tbody></table></div>
      <div id="stl-summary" style="margin-top:12px;text-align:right;font-size:15px">—</div>`;
    window.openModal((reSettle ? '✏️ Sửa công nợ — ' : '💰 Chốt công nợ — ') + _escP(sup.name || p.supplierId), body, {
      fullWide: true,
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button><button class="btn btn-primary" onclick="window.confirmSettle('${id}')">${reSettle ? '💾 Lưu công nợ' : '💰 Chốt công nợ'}</button>`,
    });
    setTimeout(() => window._settleRecalc(id), 0);
  };
  /* Đọc số Thực nhận / Lỗi / cho-trả của 1 dòng từ DOM (ưu tiên input; fallback số đã lưu). */
  function _stlRow(it, i, fromWh) {
    const recvEl = document.querySelector('.stl-recv[data-i="' + i + '"]');
    const defEl = document.querySelector('.stl-def[data-i="' + i + '"]');
    const retEl = document.querySelector('.stl-ret[data-i="' + i + '"]');
    const priceEl = document.querySelector('.stl-price[data-i="' + i + '"]');
    const recv = recvEl ? (+recvEl.value || 0) : (it.recvQty != null ? +it.recvQty : (+it.qty || 0));
    let defect = defEl ? (+defEl.value || 0) : (it.defectQty != null ? +it.defectQty : 0);
    defect = Math.min(Math.max(0, defect), recv);
    const canReturn = retEl ? retEl.value === '1' : true;
    const price = priceEl ? (+priceEl.value || 0) : (+it.price || 0);
    return { recv, defect, good: Math.max(0, recv - defect), canReturn, price };
  }
  /* Tính lại thành tiền + công nợ + hao hụt (live) theo từng mặt hàng. */
  window._settleRecalc = function (id) {
    const p = getPur().find(x => x.id === id); if (!p) return;
    const fromWh = p.status === 'wh_received';
    let payable = 0, loss = 0;
    (p.items || []).forEach((it, i) => {
      const r = _stlRow(it, i, fromWh);
      const lineDebt = Math.round((r.canReturn ? r.good : r.recv) * r.price);
      payable += lineDebt; if (!r.canReturn) loss += Math.round(r.defect * r.price);
      const totEl = document.querySelector('.stl-tot[data-i="' + i + '"]');
      if (totEl) totEl.textContent = window.fmt(lineDebt);
      const hintEl = document.querySelector('.stl-rethint[data-i="' + i + '"]');
      if (hintEl) hintEl.textContent = r.defect ? (r.canReturn ? 'trả ' + _q(r.defect) + ' → không tính tiền' : 'chịu ' + window.fmt(Math.round(r.defect * r.price)) + '₫') : '';
    });
    const sum = document.getElementById('stl-summary');
    if (sum) sum.innerHTML = 'Công nợ NCC: <b style="color:#B91C1C">' + window.fmt(payable) + '₫</b>' + (loss ? ' &nbsp;·&nbsp; Hao hụt: <b style="color:#B45309">' + window.fmt(loss) + '₫</b>' : '');
  };
  window.confirmSettle = function (id) { _ktSettle(id); };
  function _ktSettle(id) {
    const list = getPur(); const i = list.findIndex(x => x.id === id);
    if (i < 0 || (list[i].status !== 'wh_received' && list[i].status !== 'ordered' && list[i].status !== 'received')) return;
    const p = list[i];
    const reSettle = p.status === 'received';       /* SỬA nợ đã chốt → chỉnh delta, KHÔNG cộng kho lại */
    const oldTotal = +p.total || 0;                 /* nợ cũ để tính delta khi sửa */
    const fromWh = p.status === 'wh_received';
    const prods = getProds(); const today = window.todayISO();
    let payable = 0, lossVal = 0, anyReturn = false;
    (p.items || []).forEach((it, idx) => {
      const r = _stlRow(it, idx, fromWh);
      it.recvQty = r.recv; it.defectQty = r.defect; it.goodQty = r.good; it.price = r.price;
      const lineDebt = Math.round((r.canReturn ? r.good : r.recv) * r.price);  /* cho trả → trả phần tốt; không → trả đủ đã nhận */
      payable += lineDebt; if (!r.canReturn) lossVal += Math.round(r.defect * r.price);
      it.total = lineDebt; it.canReturn = r.canReturn; if (r.canReturn) anyReturn = true;
      /* Kế toán chốt TRỰC TIẾP từ 'ordered' → kho chưa cộng → hệ cộng phần DƯ (good - khách cần) vào tồn kho.
         SỬA nợ (reSettle) → tồn kho đã cộng lúc chốt trước, KHÔNG cộng lại. */
      if (!fromWh && !reSettle) {
        const demand = it.demandQty != null ? +it.demandQty : (+it.qty || 0);
        const surplus = Math.max(0, Math.round((r.good - demand) * 100) / 100);
        it.stockedQty = surplus;
        if (surplus > 0 && it.productId) {
          if (window.invApply) window.invApply(it.productId, +surplus);
          if (window.invRecordMovement) window.invRecordMovement(it.productId, +surplus, 'purchase', 'KT chốt trực tiếp (dư) · ' + p.id, p.id);
        }
      }
      const pr = prods.find(x => x.id === it.productId);
      if (pr && r.price) { pr.priceHistory = pr.priceHistory || []; const last = pr.priceHistory[pr.priceHistory.length - 1]; if (!last || last.date !== today) pr.priceHistory.push({ date: today, buy: r.price, sell: Math.round(r.price * 1.55) }); else last.buy = r.price; }
    });
    window.STORE.set('products', prods);
    p.status = 'received'; p.total = payable; p.lossValue = lossVal; p.canReturn = anyReturn; p.priceWarn = (p.items || []).some(it => !(+it.price > 0) && (+it.goodQty > 0));
    if (!fromWh && !reSettle) { p.whReceivedAt = window.todayVN ? window.todayVN() : ''; p.whBy = (window.CURRENT_USER && window.CURRENT_USER.name) || ''; }
    window.STORE.set('purchases', list);
    const sup = getSup().find(s => s.id === p.supplierId);
    /* SỬA nợ → cộng DELTA (payable − nợ cũ); chốt lần đầu → cộng đủ payable. */
    const debtDelta = reSettle ? (payable - oldTotal) : payable;
    if (sup) window.STORE.update('suppliers', sup.id, { debt: Math.max(0, (+sup.debt || 0) + debtDelta), totalSpend: (+sup.totalSpend || 0) + (reSettle ? 0 : payable) });
    if (window.audit) window.audit.log('purchase.settle', `${reSettle ? 'Sửa' : 'Chốt'} công nợ ${id} · ${window.fmt(payable)}₫${reSettle ? ` (Δ${debtDelta >= 0 ? '+' : ''}${window.fmt(debtDelta)})` : ''}${lossVal ? ` · hao hụt ${window.fmt(lossVal)}₫` : ''}`);
    window.closeModal && window.closeModal();
    window.toast(`✓ Đã ${reSettle ? 'sửa' : 'chốt'} công nợ NCC ${window.fmt(payable)}₫` + (reSettle && debtDelta ? ` (${debtDelta >= 0 ? 'tăng' : 'giảm'} ${window.fmt(Math.abs(debtDelta))})` : '') + (lossVal ? ` · ⚠ hao hụt ${window.fmt(lossVal)}₫` : ''), 'success');
  }

  window.cancelPur = async function (id) {
    if (!(await window.uiConfirm('Hủy phiếu nhập? Nếu đã nhận hàng, tồn kho sẽ trừ lại.', { title: '🗑 Huỷ phiếu nhập', okText: 'Huỷ phiếu', danger: true }))) return;
    const list = getPur();
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return;
    const p = list[i];
    if (p.status === 'received') {
      /* Trừ lại kho theo BÚT TOÁN inv_movements thật (không dựa cờ _invApplied bị strip).
         Idempotent: chỉ trừ mỗi SP đã có movement 'purchase' ref=p.id và CHƯA có
         bút toán 'adjust' ref=p.id (tránh trừ 2 lần). Ghi adjust có audit. */
      const moves = window.STORE.get('inv_movements', []) || [];
      const hasPurchase = pid => moves.some(m => m && m.type === 'purchase' && m.refId === p.id && m.productId === pid);
      const alreadyReversed = pid => moves.some(m => m && m.type === 'adjust' && m.refId === p.id && m.productId === pid);
      (p.items || []).forEach(it => {
        if (!it.productId) return;
        if (hasPurchase(it.productId) && !alreadyReversed(it.productId)) {
          /* phiếu gom sỉ chỉ cộng phần DƯ (it.stockedQty) vào kho → hủy phải trừ đúng phần đã cộng */
          const q = (it.stockedQty != null ? +it.stockedQty : +it.qty) || 0;
          if (q > 0) {
            if (window.invRecordMovement) window.invRecordMovement(it.productId, -q, 'adjust', 'Hủy phiếu nhập ' + p.id, p.id);
            if (window.invApply) window.invApply(it.productId, -q);
          }
        }
      });
      /* Hoàn công nợ NCC nếu NCC là NET (đã cộng debt/totalSpend lúc nhận) */
      const total = p.total || 0;
      const sup = getSup().find(s => s.id === p.supplierId);
      if (sup) {
        window.STORE.update('suppliers', sup.id, {
          debt: Math.max(0, (+sup.debt || 0) - total),
          totalSpend: Math.max(0, (+sup.totalSpend || 0) - total),
        });
      }
    }
    list[i].status = 'cancelled';
    window.STORE.set('purchases', list);
    if (window.audit) window.audit.log('purchase.cancel', `Hủy ${id}`);
    window.toast('Đã hủy phiếu', 'danger');
    (window.closeModal || window.closeDrawer || function(){})();   /* phiếu giờ là popup (openModal) */
  };

  /* (Đã gỡ payPur — code chết: dùng prompt() + ghi 3 nơi (p.paid + suppliers.debt + phiếu chi) gây
     trừ nợ 2 lần. Không nút nào gọi. Thanh toán NCC nay ở Công nợ NCC / Nhà cung cấp — chỉ ghi phiếu chi. */

  /* ====== Tạo phiếu mới ======
     forSup: id NCC chọn sẵn (vd 'EXT-MARKET' cho thu mua ngoài)
     presetItems: [{name, qty, price}] điền sẵn (vd từ gom đơn → thu mua ngoài) */
  window.openPurModal = function (forSup, presetItems) {
    const sups = getSup().filter(s => s.active);
    const prods = getProds();
    const isExt = forSup === EXT_SUP_ID;
    const nextId = (isExt ? 'TMN-2026-' : 'PN-2026-') + String(getPur().length + 1).padStart(4,'0');
    /* Thu mua ngoài mặc định KHÔNG cộng tồn kho (mua cho đơn trong ngày, giao thẳng) */
    const stockChecked = isExt ? '' : 'checked';
    window.openModal(isExt ? '🛒 Phiếu thu mua ngoài' : '+ Tạo phiếu nhập', `
      <div style="background:${isExt ? '#FFFBEB;color:#92400E' : '#EFF6FF;color:#1E40AF'};padding:9px 12px;border-radius:7px;font-size:12px;margin-bottom:12px">
        ${isExt
          ? '🛒 <b>Thu mua ngoài:</b> nhập danh sách mua chợ/vãng lai kèm <b>giá thật</b>. Khi bấm "✓ Đã nhận" → tự ghi <b>chi tiền mặt vào sổ quỹ kế toán</b> + cập nhật <b>giá vốn</b>. Có thể dùng <b>📷 Ảnh AI</b> đọc phiếu viết tay.'
          : '💡 <b>Cách dùng:</b> Chọn NCC → thêm các SP đã lấy → bấm Lưu (status: "Đã đặt"). Khi hàng về kho, vào trang Phiếu nhập bấm "✓ Đã nhận" để tự cộng kho.'}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div><label style="font-size:12px;color:var(--muted)">Mã phiếu</label><input id="pn_id" value="${nextId}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px;font-family:monospace"></div>
        <div><label style="font-size:12px;color:var(--muted)">Ngày nhập</label><input id="pn_date" type="date" value="${(window.todayISO ? window.todayISO() : new Date().toISOString().slice(0,10))}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">NCC *</label><select id="pn_sup" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px">
          <option value="${EXT_SUP_ID}" ${isExt?'selected':''}>🛒 Thu mua ngoài (chợ/vãng lai) · COD</option>
          ${sups.map(s => `<option value="${s.id}" ${forSup===s.id?'selected':''}>${s.name} · ${s.paymentTerm}</option>`).join('')}</select></div>
      </div>
      <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);margin-bottom:6px;cursor:pointer">
        <input type="checkbox" id="pn_stock" ${stockChecked}> Cộng vào tồn kho khi nhận ${window.helpTip('Tắt nếu hàng mua về giao thẳng cho khách trong ngày (không nhập kho tồn). Thu mua ngoài thường TẮT.')}
      </label>
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
      <label style="font-size:12px;color:var(--muted);margin-top:10px;display:block">🧾 Số hóa đơn NCC (đầu vào) ${window.helpTip ? window.helpTip('Số hoá đơn đầu vào NCC xuất (nếu có) — để đối chiếu kế toán/thuế.') : ''}</label>
      <input id="pn_invoice" placeholder="số HĐ / ký hiệu (nếu có)" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px">
      <label style="font-size:12px;color:var(--muted);margin-top:10px;display:block">Ghi chú</label>
      <textarea id="pn_note" rows="2" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></textarea>
    `, {
      footer:`<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
              <button class="btn btn-primary" onclick="window._pnSave()">Lưu phiếu</button>`,
      width:'620px'
    });
    /* Add first row(s) */
    window._pnPRODS = prods;
    if (Array.isArray(presetItems) && presetItems.length) {
      presetItems.forEach(it => window._pnAddRow({ name: it.name, qty: it.qty, price: it.price }));
    } else {
      window._pnAddRow();
    }
  };

  const _pnNorm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();
  function _pnLastBuy(p) { const h = p.priceHistory || []; const last = h[h.length - 1]; return last ? (last.buy || 0) : 0; }
  let _pnAC = null;
  function _pnCloseAC() { if (_pnAC) { _pnAC.remove(); _pnAC = null; } }
  /* Autocomplete: gõ tên → dropdown gợi ý SP từ danh mục + giá nhập gần nhất */
  function _pnWireAC(input) {
    input.setAttribute('autocomplete', 'off');
    const esc = v => String(v == null ? '' : v).replace(/"/g, '&quot;');
    function show() {
      const q = _pnNorm(input.value);
      const prods = window._pnPRODS || getProds();
      let list = q ? prods.filter(p => _pnNorm(p.name).includes(q)) : prods.slice();
      list = list.slice(0, 12);
      _pnCloseAC();
      if (!list.length) return;
      const dd = document.createElement('div');
      const r = input.getBoundingClientRect();
      dd.style.cssText = `position:fixed;z-index:99999;left:${r.left}px;top:${r.bottom + 2}px;width:${Math.max(r.width, 240)}px;max-height:260px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.16)`;
      dd.innerHTML = list.map(p => {
        const buy = _pnLastBuy(p);
        return `<div class="pn-ac-item" data-name="${esc(p.name)}" data-buy="${buy}" style="padding:8px 11px;font-size:12.5px;cursor:pointer;border-bottom:1px solid #F1F5F9;display:flex;justify-content:space-between;gap:10px;align-items:center"><span>${p.name} <span style="color:#94A3B8;font-size:11px">/${p.unit || 'kg'}</span></span>${buy ? `<span style="color:#15803D;font-size:11px;white-space:nowrap">~${window.fmt(buy)}đ</span>` : ''}</div>`;
      }).join('');
      document.body.appendChild(dd); _pnAC = dd;
      dd.querySelectorAll('.pn-ac-item').forEach(it => {
        it.onmouseover = () => { dd.querySelectorAll('.pn-ac-item').forEach(x => x.style.background = ''); it.style.background = '#F0FDF4'; };
        it.onmousedown = (e) => {
          e.preventDefault();
          input.value = it.dataset.name;
          const row = input.closest('.item-row');
          const priceInp = row && row.querySelector('.pn_price');
          if (priceInp && !priceInp.value && +it.dataset.buy) priceInp.value = it.dataset.buy;
          _pnCloseAC(); window._pnRecalc();
          const qtyInp = row && row.querySelector('.pn_qty'); (qtyInp || input).focus();
        };
      });
    }
    input.addEventListener('focus', show);
    input.addEventListener('input', show);
    input.addEventListener('blur', () => setTimeout(_pnCloseAC, 160));
  }

  window._pnAddRow = function (preset) {
    const host = document.getElementById('pn_items');
    if (!host) return;
    const esc = v => String(v == null ? '' : v).replace(/"/g, '&quot;');
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <input type="text" class="pn_name" placeholder="Gõ tên SP — gợi ý từ danh mục" value="${preset ? esc(preset.name) : ''}">
      <input type="number" placeholder="SL" class="pn_qty" min="0" step="0.1" value="${preset && preset.qty ? preset.qty : ''}">
      <input type="number" placeholder="Đơn giá" class="pn_price" min="0" value="${preset && preset.price ? preset.price : ''}">
      <input type="text" placeholder="Thành tiền" class="pn_total" readonly style="background:#FAFBFC">
      <button onclick="this.parentElement.remove();window._pnRecalc()" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:16px">✕</button>
    `;
    host.appendChild(row);
    row.querySelectorAll('input').forEach(inp => inp.oninput = window._pnRecalc);
    _pnWireAC(row.querySelector('.pn_name'));
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
    const stockCb = document.getElementById('pn_stock');
    const obj = {
      id: document.getElementById('pn_id').value,
      supplierId: document.getElementById('pn_sup').value,
      date: m ? `${m[3]}/${m[2]}/${m[1]}` : window.todayVN(),
      status: 'ordered',
      total: items.reduce((s,i) => s + i.total, 0),
      paid: 0,
      items,
      noStock: stockCb ? !stockCb.checked : false,   /* không cộng tồn kho (mua giao thẳng) */
      note: document.getElementById('pn_note').value,
      invoiceNo: (document.getElementById('pn_invoice') || {}).value || '',
    };
    const list = getPur();
    list.push(obj);
    window.STORE.set('purchases', list);
    if (obj.invoiceNo) _pnSetInv(obj.id, obj.invoiceNo);   /* số HĐ NCC → KV (cloud purchases không có cột) */
    if (window.audit) window.audit.log('purchase.create', `${obj.id} cho ${findSup(obj.supplierId)?.name || obj.supplierId} (${window.fmt(obj.total)} ₫)`);
    window.toast('✓ Đã tạo phiếu nhập (chưa nhận hàng — vào danh sách bấm "✓ Nhận" khi hàng về)', 'success');
    window.closeModal();
  };

  /* ====== IN PHIẾU NHẬP (branded, qua iframe) ====== */
  window.printPur = function (id) {
    const p = getPur().find(x => x.id === id); if (!p) return;
    const s = findSup(p.supplierId) || {};
    const ci = window.STORE.get('companyInfo', {}) || {};
    const origin = (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : 'https://app.nongsantuantuhanoi.vn';
    const comp = { name: 'NÔNG SẢN TUẤN TÚ HÀ NỘI', addr: ci.address || '36/147A Tân Mai, Hoàng Mai, Hà Nội', phone: ci.hotline || '0836 676 086', logo: ci.logo || (origin + '/assets/logo-name.png?v=486') };
    const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const items = p.items || [];
    const rows = items.map((it, i) => `<tr><td class="stt">${i + 1}</td><td><b>${esc(it.name)}</b></td><td class="num">${it.qty} ${it.unit || 'kg'}</td><td class="num">${(it.price || 0).toLocaleString('vi-VN')}</td><td class="num">${(it.total || 0).toLocaleString('vi-VN')}</td></tr>`).join('');
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PHIẾU NHẬP ${esc(p.id)}</title>
<style>@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
body{color:#1a1a1a;font-size:13px}.wrap{max-width:780px;margin:0 auto}
.top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1B5E20;padding-bottom:10px}
.top img{width:150px;height:auto;object-fit:contain}.brand h1{font-size:19px;color:#1B5E20;font-weight:800}.brand .sub{font-size:11px;color:#555;margin-top:4px}
.title{text-align:center;font-size:21px;font-weight:800;color:#1B5E20;letter-spacing:1px;margin:14px 0 2px}
.metabox{border:1px solid #CBD9C4;border-radius:8px;padding:10px 14px;margin:8px 0;background:#F7FBF5}
.meta{display:flex;justify-content:space-between;gap:18px;font-size:12.5px;line-height:1.9}.meta b{color:#1B5E20}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px}th,td{border:1px solid #B6C9B0;padding:7px 9px}
th{background:#1B5E20;color:#fff;font-size:11.5px;text-transform:uppercase}td.stt{text-align:center;width:40px;color:#777}td.num{text-align:right}
tbody tr:nth-child(even){background:#F4FAF2}tfoot td{background:#E8F5E9;font-weight:800;color:#1B5E20}
.sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:34px;text-align:center;font-size:11.5px}.sig .role{font-weight:700;color:#1B5E20}.sig .l{margin-top:46px;border-top:1px dotted #aaa}</style></head><body><div class="wrap">
<div class="top"><img src="${comp.logo}" onerror="this.style.display='none'"><div class="brand"><h1>${comp.name}</h1><div class="sub">${esc(comp.addr)} · ☎ ${esc(comp.phone)}</div></div></div>
<div class="title">PHIẾU NHẬP HÀNG</div>
<div class="metabox"><div class="meta"><div><b>Nhà cung cấp:</b> ${esc(s.name || p.supplierId || '')}</div><div><b>Mã phiếu:</b> ${esc(p.id)}</div></div>
<div class="meta"><div><b>SĐT NCC:</b> ${esc(s.phone || '')}</div><div><b>Ngày nhập:</b> ${esc(p.date || '')}</div></div>
<div class="meta"><div><b>Điều khoản TT:</b> ${esc(s.paymentTerm || '')}</div><div><b>Trạng thái:</b> ${p.status === 'received' ? 'Đã nhận' : p.status === 'cancelled' ? 'Đã hủy' : 'Đã đặt'}</div></div></div>
<table><thead><tr><th style="width:40px">STT</th><th>Mặt hàng</th><th class="num">Số lượng</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#999;padding:16px">Chưa có mặt hàng</td></tr>'}</tbody>
<tfoot><tr><td colspan="4" style="text-align:right">TỔNG TIỀN HÀNG</td><td class="num">${(p.total || 0).toLocaleString('vi-VN')} ₫</td></tr>
<tr><td colspan="4" style="text-align:right">Đã thanh toán</td><td class="num">${(p.paid || 0).toLocaleString('vi-VN')} ₫</td></tr>
<tr><td colspan="4" style="text-align:right">Còn nợ NCC</td><td class="num" style="color:#B91C1C">${Math.max(0, (p.total || 0) - (p.paid || 0)).toLocaleString('vi-VN')} ₫</td></tr></tfoot></table>
${p.note ? `<div style="margin-top:10px;font-size:12px"><b>Ghi chú:</b> ${esc(p.note)}</div>` : ''}
<div class="sig"><div><div class="role">Người lập phiếu</div><div class="l"></div></div><div><div class="role">Thủ kho nhận</div><div class="l"></div></div><div><div class="role">NCC giao</div><div class="l"></div></div></div>
</div></body></html>`;
    const old = document.getElementById('purPrintFrame'); if (old) old.remove();
    const f = document.createElement('iframe'); f.id = 'purPrintFrame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentWindow.document; doc.open(); doc.write(html); doc.close();
    const fire = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} };
    const img = doc.querySelector('img');
    if (img && !img.complete) { img.onload = () => setTimeout(fire, 120); img.onerror = () => setTimeout(fire, 120); } else setTimeout(fire, 250);
    window.toast && window.toast('🖨 Mở hộp in — bỏ tick "Headers and footers" để ẩn ngày/URL', 'info');
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
  if (params.get('createForSup')) setTimeout(() => {
    const forSup = params.get('createForSup');
    let preset = null;
    if (forSup === EXT_SUP_ID) {   /* chỉ Thu mua ngoài mới nhận prefill từ gom đơn */
      try { const raw = sessionStorage.getItem('pn_prefill_items'); if (raw) { preset = JSON.parse(raw); sessionStorage.removeItem('pn_prefill_items'); } } catch (e) {}
    }
    window.openPurModal(forSup, (Array.isArray(preset) && preset.length) ? preset : undefined);
  }, 300);
  if (params.get('focus')) setTimeout(() => window.openPurDrawer(params.get('focus')), 300);
})();
