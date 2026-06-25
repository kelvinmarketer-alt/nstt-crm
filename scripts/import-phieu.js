/* =========================================================
   Nông Sản Tuấn Tú — NHẬP PHIẾU KẾ TOÁN (Excel "phiếu 6/6") → ĐƠN HÀNG
   Mỗi file/sheet = 1 phiếu của 1 khách/ngày → tạo đơn (Công nợ, delivered)
   → hook tự cộng CÔNG NỢ khách + ghi sổ + lên báo cáo CFO.
   - Khớp khách theo TÊN + ĐỊA CHỈ; chưa có (hoặc khác địa chỉ) → tạo mới (B2B).
   - Chống trùng: cùng khách + địa chỉ + ngày + tổng tiền → bỏ qua.
   - XEM TRƯỚC rồi mới ghi.
   ========================================================= */
(function () {
  const norm = s => String(s == null ? '' : s).trim();
  const low = s => norm(s).toLowerCase();
  const nkey = s => low(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
  /* Khớp khách — QUY TẮC B2B (1 thương hiệu có NHIỀU cơ sở/địa chỉ = nhiều khách riêng):
     • CÓ địa chỉ trên phiếu → CHỈ khớp theo ĐỊA CHỈ (chính xác → "chứa nhau" ≥6 ký tự).
       KHÔNG khớp được địa chỉ nào → KHÁCH MỚI, kể cả khi TRÙNG TÊN (chi nhánh khác).
       → tránh gộp doanh thu/công nợ của các cơ sở cùng tên khác địa chỉ.
     • Địa chỉ TRỐNG → mới khớp theo TÊN (chính xác → "chứa nhau" ≥4 ký tự,
       vd phiếu "Veteran" ↔ app "Hùng - NH Veteran").
     Trả {c, by:'addr'|'addr~'|'name'|'name~'} hoặc null (= khách mới). */
  function matchCustomer(custList, name, addr) {
    const list = custList || [];
    const a = nkey(addr);
    if (a) {
      const exact = list.find(c => nkey(c.address) === a); if (exact) return { c: exact, by: 'addr' };
      const fuzzy = list.find(c => {
        const ca = nkey(c.address); if (ca.length < 6) return false;
        return (a.length >= 6 && ca.includes(a)) || (ca.length >= 6 && a.includes(ca));
      });
      if (fuzzy) return { c: fuzzy, by: 'addr~' };
      return null;   /* có địa chỉ nhưng không khớp → KHÁCH MỚI, không gộp theo tên */
    }
    const n = nkey(name);
    if (n) {
      const exact = list.find(c => nkey(c.name) === n); if (exact) return { c: exact, by: 'name' };
      const fuzzy = list.find(c => {
        const cn = nkey(c.name); if (!cn) return false;
        return (n.length >= 4 && cn.includes(n)) || (cn.length >= 4 && n.includes(cn));
      });
      if (fuzzy) return { c: fuzzy, by: 'name~' };
    }
    return null;
  }
  /* Quyết định khách của 1 phiếu = lựa chọn TAY (nếu có) → nếu không thì khớp tự động.
     p.forceCustId: undefined = tự động · '' = ép tạo mới · '<id>' = gộp vào KH đó. */
  function resolveCust(p, list) {
    if (p.forceCustId === '') return null;                       /* user ép tạo mới */
    if (p.forceCustId) { const c = (list || []).find(x => x.id === p.forceCustId); if (c) return { c, by: 'manual' }; }
    return matchCustomer(list, p.custName, p.addr);              /* tự động */
  }
  const _byLabel = { addr: 'khớp địa chỉ', 'addr~': 'khớp địa chỉ gần đúng', name: 'khớp tên', 'name~': 'khớp tên gần đúng', manual: 'gộp tay' };

  /* ===== Parser 1 phiếu từ lưới 2D (mảng các hàng) ===== */
  function parsePhieu(grid) {
    function findLabel(re) {
      for (let r = 0; r < grid.length; r++) for (let c = 0; c < (grid[r] || []).length; c++)
        if (re.test(low(grid[r][c]))) return { r, c };
      return null;
    }
    function valRight(pos) {
      if (!pos) return '';
      const row = grid[pos.r] || [];
      for (let c = pos.c + 1; c < row.length; c++) if (norm(row[c]) !== '') return norm(row[c]);
      return '';
    }
    const kh = findLabel(/^kh[áa]ch h[àa]ng/);
    let custName = valRight(kh);
    if (!custName && kh) { const m = norm(grid[kh.r][kh.c]).match(/:\s*(.+)$/); if (m) custName = m[1].trim(); }
    const dpos = findLabel(/^ng[àa]y\b/);
    let dateRaw = valRight(dpos);
    let addr = '';
    if (kh) for (let r = kh.r; r < Math.min(kh.r + 4, grid.length) && !addr; r++) {
      const row = grid[r] || [];
      for (let c = 0; c < row.length; c++) if (/^[đd]ịa ch[ỉi]/.test(low(row[c]))) {
        for (let cc = c + 1; cc < row.length; cc++) if (norm(row[cc]) !== '') { addr = norm(row[cc]); break; }
      }
    }
    let hr = -1, col = {};
    for (let r = 0; r < grid.length; r++) {
      const lows = (grid[r] || []).map(low);
      const iName = lows.findIndex(x => x.includes('tên sản phẩm') || x === 'tên hàng');
      const iAmt = lows.findIndex(x => x.includes('thành tiền'));
      if (iName >= 0 && iAmt >= 0) {
        hr = r; col.name = iName; col.amt = iAmt;
        col.unit = lows.findIndex(x => x === 'đvt' || x.includes('đơn vị'));
        col.qty = lows.findIndex(x => x.includes('thực nhận'));
        if (col.qty < 0) col.qty = lows.findIndex(x => x.includes('số lượng'));
        col.price = lows.findIndex(x => x.includes('giá bán'));
        col.stt = lows.findIndex(x => x === 'stt');
        /* === Cột GIÁ VỐN (mua vào) — nằm cùng hàng tiêu đề, bên phải ===
           'Giá nhập' + 'Thành tiền nhập' (file có thể gõ sai dấu "tiên"). */
        col.buyPrice = lows.findIndex(x => x.includes('giá nhập') || x.includes('gia nhap'));
        col.buyAmt = lows.findIndex(x => (x.includes('thành ti') || x.includes('thanh ti')) && x.includes('nhập'));
        break;
      }
    }
    const items = []; let totalRow = 0, totalBuyRow = 0;
    if (hr >= 0) for (let r = hr + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      if (/^tổng cộng/.test(low(row[0])) || /^tổng cộng/.test(low(row[col.name]))) {
        const t = +(row[col.amt]); if (!isNaN(t) && t) totalRow = t;
        if (col.buyAmt >= 0) { const tb = +(row[col.buyAmt]); if (!isNaN(tb) && tb) totalBuyRow = tb; }
        break;
      }
      const nm = norm(row[col.name]); if (!nm) continue;
      const qty = +(row[col.qty >= 0 ? col.qty : -1]) || 0;
      const price = +(row[col.price >= 0 ? col.price : -1]) || 0;
      let amt = +(row[col.amt]) || 0;
      if (!amt && qty && price) amt = qty * price;
      if (!amt && !qty) continue;
      /* giá vốn từng dòng (nếu file có cột) — KHÔNG lưu vào SP, chỉ để tính lãi đơn này */
      const buyPrice = col.buyPrice >= 0 ? (+(row[col.buyPrice]) || 0) : 0;
      let buyAmt = col.buyAmt >= 0 ? (+(row[col.buyAmt]) || 0) : 0;
      if (!buyAmt && qty && buyPrice) buyAmt = qty * buyPrice;
      items.push({ name: nm, unit: norm(row[col.unit] || 'kg').toLowerCase(), qty,
        price: Math.round(price * 1000), total: Math.round(amt * 1000),
        buyPrice: Math.round(buyPrice * 1000), buyTotal: Math.round(buyAmt * 1000) });
    }
    const itemsTotal = items.reduce((s, it) => s + it.total, 0);
    const total = totalRow ? Math.round(totalRow * 1000) : itemsTotal;
    /* Tổng giá vốn = dòng "Tổng cộng" cột nhập (ưu tiên) hoặc Σ từng dòng */
    const itemsBuyTotal = items.reduce((s, it) => s + (it.buyTotal || 0), 0);
    const buyTotal = totalBuyRow ? Math.round(totalBuyRow * 1000) : itemsBuyTotal;
    return { custName, addr, dateRaw, items, total, buyTotal, valid: !!(custName && total && items.length) };
  }

  /* Ngày "06.06.2026" / "6/6/2026" → {iso, vn} */
  function parseDate(s) {
    const m = String(s || '').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
    if (!m) return null;
    const yr = m[3].length === 2 ? '20' + m[3] : m[3];
    const dd = m[1].padStart(2, '0'), mm = m[2].padStart(2, '0');
    return { iso: `${yr}-${mm}-${dd}`, vn: `${dd}/${mm}/${yr}` };
  }

  let _parsed = [];   /* danh sách phiếu đã đọc cho preview/commit */

  window.openPhieuImport = function () {
    _parsed = [];
    window.openModal('📥 Nhập phiếu kế toán (Excel) → đơn + công nợ', `
      <div style="background:#EFF6FF;color:#1E40AF;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:12px;line-height:1.5">
        Chọn 1 hoặc <b>nhiều file phiếu</b> (mẫu "phiếu 6/6": có <i>Khách Hàng</i>, <i>Ngày</i>, bảng <i>STT/Tên sản phẩm/Thành tiền</i>, dòng <i>Tổng cộng</i>).
        App đọc → tạo đơn (Công nợ) → <b>tự cộng công nợ khách</b>. Khớp khách theo <b>Tên + Địa chỉ</b> — cùng tên nhưng khác địa chỉ sẽ là <b>khách mới</b> (chi nhánh khác). <b>Xem trước rồi mới ghi.</b>
      </div>
      <input type="file" id="phieuFiles" accept=".xlsx,.xls" multiple onchange="window._phieuRead(this.files)"
        style="width:100%;border:1px dashed var(--line);border-radius:8px;padding:14px;font-size:13px;background:#FAFAFB">
      <div id="phieuPreview" style="margin-top:12px"></div>
    `, {
      width: '760px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-primary" id="phieuCommitBtn" onclick="window._phieuCommit()" disabled>Tạo đơn + cập nhật công nợ</button>`,
    });
  };

  window._phieuRead = async function (files) {
    if (!window.XLSX) { window.toast('Thư viện Excel chưa tải — reload trang', 'warn'); return; }
    const prev = document.getElementById('phieuPreview');
    prev.innerHTML = '<div style="color:var(--muted);font-size:12.5px;padding:8px">⏳ Đang đọc file…</div>';
    const customers = window.STORE.get('customers', []) || [];
    const orders = window.STORE.get('orders', []) || [];
    _parsed = [];
    const seenSig = new Set();   /* chống TRÙNG TRONG LÔ: cùng khách+ngày+tổng+số mã chỉ tính 1 lần */
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array' });
        for (const sn of wb.SheetNames) {
          const grid = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
          const p = parsePhieu(grid);
          if (!p.valid) continue;            /* sheet không phải phiếu (vd "TÊN QC") → bỏ */
          const d = parseDate(p.dateRaw);
          const mm = matchCustomer(customers, p.custName, p.addr);
          const match = mm ? mm.c : null;
          const matchBy = mm ? mm.by : null;
          /* trùng: cùng KHÁCH (đã khớp) + ngày + tổng — nếu chưa khớp thì so tên+địa chỉ */
          const dup = d && orders.some(o => {
            const sameCust = match ? (o.cust === match.id)
              : (nkey(o.custName) === nkey(p.custName) && nkey(o.drop) === nkey(p.addr));
            return sameCust
              && (o.deliverDate === d.iso || (o.date || '').slice(0, 10) === d.vn.split('/').reverse().join('-'))
              && Math.abs((+o.freight || 0) - p.total) < 1;
          });
          const sig = `${nkey(p.custName)}|${nkey(p.addr)}|${d ? d.iso : '?'}|${p.total}|${p.items.length}`;
          const dupInBatch = seenSig.has(sig);
          if (!dupInBatch) seenSig.add(sig);
          _parsed.push({ file: f.name, sheet: sn, ...p, date: d, match, matchBy, dup, dupInBatch, pick: !dup && !dupInBatch && !!d });
        }
      } catch (e) { _parsed.push({ file: f.name, error: String(e.message || e), pick: false }); }
    }
    renderPreview();
  };

  function renderPreview() {
    const prev = document.getElementById('phieuPreview');
    const btn = document.getElementById('phieuCommitBtn');
    if (!_parsed.length) { prev.innerHTML = '<div style="color:#B45309;font-size:12.5px;padding:8px">Không đọc được phiếu hợp lệ nào trong file đã chọn.</div>'; if (btn) btn.disabled = true; return; }
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const customers = (window.STORE.get('customers', []) || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    const picks = _parsed.filter(p => p.pick);
    const willCreate = picks.length;
    const newKeys = new Set();
    picks.forEach(p => { if (!resolveCust(p, customers)) newKeys.add(nkey(p.addr) || nkey(p.custName)); });
    const newCusts = newKeys.size;
    const fmt = v => (+v || 0).toLocaleString('vi-VN');
    const gRev = picks.reduce((s, p) => s + (+p.total || 0), 0);
    const gCost = picks.reduce((s, p) => s + (+p.buyTotal || 0), 0);
    const gProfit = gRev - gCost;
    prev.innerHTML = `
      <div style="font-size:12.5px;margin-bottom:8px"><b>${_parsed.length}</b> phiếu đọc được · sẽ tạo <b style="color:#15803D">${willCreate}</b> đơn${newCusts ? ` · tạo mới <b>${newCusts}</b> khách` : ''}
        ${gRev ? `<br>Doanh thu <b>${fmt(gRev)}</b>${gCost ? ` · giá vốn <b>${fmt(gCost)}</b> · lãi <b style="color:#15803D">${fmt(gProfit)}</b> (${gRev ? (Math.round(gProfit / gRev * 1000) / 10) : 0}%)` : ' · <span style="color:#B45309">phiếu không có cột giá nhập → lãi ước tính</span>'}` : ''}
        <br><span style="color:var(--muted);font-size:11px">💡 Cột "Khách trong app" sai? Bấm chọn lại: <b>Tự động</b> / <b>Tạo mới</b> / hoặc gộp vào khách có sẵn.</span></div>
      <div style="max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:8px">
      <table class="mini-table" style="margin:0;font-size:12px">
        <thead><tr><th style="width:34px"></th><th>Khách (trên phiếu)</th><th>Địa chỉ</th><th>Ngày</th><th class="num">Số mã</th><th class="num">Tổng / Lãi</th><th>Khách trong app</th></tr></thead>
        <tbody>${_parsed.map((p, i) => {
      if (p.error) return `<tr><td></td><td colspan="6" style="color:#B91C1C">⚠ ${esc(p.file)}: ${esc(p.error)}</td></tr>`;
      const canPick = !!p.date;   /* trùng vẫn cho TICK LẠI nếu là đơn khác ca/lần giao khác */
      const addrCell = p.addr
        ? `<span style="font-size:11px;color:var(--muted)">${esc(p.addr)}</span>`
        : `<span style="font-size:11px;color:#B45309" title="Phiếu không có địa chỉ → khớp khách theo tên">⚠ thiếu địa chỉ</span>`;
      let custCell;
      if (p.dupInBatch) custCell = '<span style="color:#B45309">⏭ Trùng trong lô — bỏ qua.<br><span style="font-size:10px">Khác ca/lần giao? Tick lại ô vuông để vẫn tạo.</span></span>';
      else if (p.dup) custCell = '<span style="color:#B45309">⏭ Đã có đơn y hệt — bỏ qua.<br><span style="font-size:10px">Khác ca/lần giao? Tick lại ô vuông để vẫn tạo.</span></span>';
      else if (!p.date) custCell = '<span style="color:#B91C1C">⚠ Không đọc được ngày</span>';
      else {
        const r = resolveCust(p, customers);
        const sel = p.forceCustId === undefined ? '__auto__' : (p.forceCustId === '' ? '__new__' : p.forceCustId);
        const lbl = r ? `<span style="color:#15803D">→ ${esc(r.c.name)} <span style="color:var(--muted)">(${esc(r.c.code)} · ${_byLabel[r.by]})</span></span>`
          : '<span style="color:#2563EB">🆕 Tạo khách mới</span>';
        const opts = `<option value="__auto__" ${sel === '__auto__' ? 'selected' : ''}>↻ Tự động khớp</option>`
          + `<option value="__new__" ${sel === '__new__' ? 'selected' : ''}>🆕 Tạo khách mới</option>`
          + customers.map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)} (${esc(c.code)})</option>`).join('');
        custCell = `<div style="font-size:10.5px;margin-bottom:3px">${lbl}</div>`
          + `<select onchange="window._phieuMerge(${i}, this.value)" style="font-size:11px;max-width:210px;padding:3px;border:1px solid var(--line);border-radius:6px">${opts}</select>`;
      }
      return `<tr style="${p.pick ? '' : 'opacity:.6'}">
            <td class="num"><input type="checkbox" ${p.pick ? 'checked' : ''} ${canPick ? '' : 'disabled'} onchange="window._phieuToggle(${i}, this.checked)"></td>
            <td><b>${esc(p.custName)}</b></td>
            <td style="max-width:200px;white-space:normal">${addrCell}</td>
            <td>${p.date ? p.date.vn : '—'}</td>
            <td class="num">${p.items.length}</td>
            <td class="num"><b>${fmt(p.total)}</b>${p.buyTotal ? `<div style="font-size:10px;color:#15803D">vốn ${fmt(p.buyTotal)} · lãi ${fmt(p.total - p.buyTotal)}</div>` : ''}</td>
            <td>${custCell}</td>
          </tr>`;
    }).join('')}</tbody>
      </table></div>`;
    if (btn) btn.disabled = willCreate === 0;
  }
  window._phieuToggle = function (i, on) {
    if (!_parsed[i]) return;
    _parsed[i].pick = on;
    /* Tick lại 1 phiếu đang bị gắn "trùng" = người dùng cố ý tạo đơn riêng (khác ca/lần giao) */
    _parsed[i].forceCreate = !!(on && (_parsed[i].dup || _parsed[i].dupInBatch));
    renderPreview();
  };
  /* Chọn lại khách cho 1 phiếu: __auto__ = tự động · __new__ = tạo mới · '<id>' = gộp vào KH đó */
  window._phieuMerge = function (i, val) {
    if (!_parsed[i]) return;
    if (val === '__auto__') delete _parsed[i].forceCustId;
    else if (val === '__new__') _parsed[i].forceCustId = '';
    else _parsed[i].forceCustId = val;
    renderPreview();
  };

  let _committing = false;   /* khóa chống bấm "Tạo đơn" 2 lần → tạo trùng */
  window._phieuCommit = function () {
    if (_committing) return;                      /* đang ghi → bỏ qua click thứ 2 */
    const rows = _parsed.filter(p => p.pick && p.date && p.total);
    if (!rows.length) { window.toast('Không có phiếu nào để tạo', 'warn'); return; }
    _committing = true;
    const btn = document.getElementById('phieuCommitBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Đang tạo…'; }
    const me = (window.AUTH && window.AUTH.currentUser && window.AUTH.currentUser()) || {};
    const now = new Date();
    const todayVN = now.toLocaleDateString('vi-VN');
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const nowISO = now.toISOString();
    /* Danh sách khách "sống" (gồm KH mới tạo trong lượt này) để khớp ưu-tiên-địa-chỉ */
    const liveCustomers = (window.STORE.get('customers', []) || []).slice();
    /* CHẶN TRÙNG NỘI DUNG: nếu đơn y hệt (khách+ngày+tổng+số mã) đã tồn tại → KHÔNG tạo lại.
       seenOrders gồm đơn cũ + đơn vừa tạo trong lượt này → tự cộng dồn, không sót. */
    const oSig = (cid, iso, total, n) => `${cid}|${iso}|${total}|${n}`;
    const seenOrders = new Set(
      (window.STORE.get('orders', []) || [])
        .filter(o => o.status !== 'cancelled')
        .map(o => oSig(o.cust || o.custId, (o.deliverDate || (o.date || '').slice(0, 10)), +o.freight || 0, (o.items || []).length))
    );
    let nCust = 0, nOrder = 0, nSkip = 0;

    rows.forEach(p => {
      const mm = resolveCust(p, liveCustomers);   /* tôn trọng lựa chọn tay → tự động khớp */
      let custId = mm ? mm.c.id : null;
      if (!custId) {
        custId = window.STORE.nextId('customers', 'KH', 3);
        const newCust = {
          id: custId, code: custId, type: 'B2B', group: 'Mới',
          name: p.custName, contact: p.custName, phone: '', email: '',
          address: p.addr || '', province: 'Hà Nội',
          staffOwner: me.name || 'Tuấn Tú', source: 'import-phiếu',
          created: todayVN, lastContact: todayVN, lastOrder: p.date.vn, active: true,
          orders: 0, revenue: 0, debt: 0, debtOverdue: 0, mainCats: [], notes: [],
        };
        window.STORE.add('customers', newCust);
        liveCustomers.push(newCust); nCust++;
      }
      const items = p.items.map(it => ({
        id: null, custom: true, fromImport: true, name: it.name, unit: it.unit || 'kg',
        qty: it.qty, price: it.price, basePrice: it.price, priceConfirmed: true, total: it.total,
        /* giá vốn SNAPSHOT lúc nhập — chỉ để tính lãi đơn, KHÔNG ghi vào giá nhập SP */
        buyPrice: it.buyPrice || 0, buyTotal: it.buyTotal || 0,
      }));
      /* Tên hiển thị đơn = tên khách ĐÃ KHỚP (nếu khớp địa chỉ, dùng tên chuẩn trong app
         thay vì tên có thể gõ sai trên phiếu) */
      const orderCustName = mm ? mm.c.name : p.custName;
      /* Đơn y hệt đã tồn tại (cũ hoặc vừa tạo trong lượt) → BỎ QUA, không tạo trùng */
      const osig = oSig(custId, p.date.iso, p.total, items.length);
      /* Bỏ qua nếu đơn y hệt đã có — TRỪ khi user tick lại (forceCreate = đơn khác ca/lần giao) */
      if (seenOrders.has(osig) && !p.forceCreate) { nSkip++; return; }
      seenOrders.add(osig);
      const order = {
        code: window.STORE.nextOrderCode(),
        /* NGÀY đơn = ngày trên phiếu (đúng kỳ) + GIỜ UP THẬT (hết hiện 00:00) ·
           createdAt = thời điểm up thật để audit đúng */
        date: p.date.vn + ' ' + hhmm, createdAt: nowISO,
        deliverDate: p.date.iso, deliveredAt: p.date.vn + ' ' + hhmm,
        cust: custId, custName: orderCustName, custPhone: '',
        serviceType: '', transportMode: 'giao-ngay',
        pickup: 'Kho Tuấn Tú', drop: p.addr || '',
        goods: p.items.map(it => it.name).join(', ').slice(0, 250),
        qty: 1, unit: 'kg', weight: 0,
        items, freight: p.total, buyTotal: p.buyTotal || 0, cod: 0, payBy: 'Công nợ',
        status: 'delivered', whStatus: 'released',
        staff: me.name || '', source: 'import-phiếu',
        note: 'Nhập từ phiếu Excel: ' + p.file,
      };
      window.STORE.add('orders', order);
      nOrder++;
    });
    _parsed = [];          /* xóa lô đã ghi → click lần 2 KHÔNG tạo lại */
    _committing = false;
    window.closeModal();
    window.toast(`✓ Đã tạo ${nOrder} đơn${nCust ? ' · ' + nCust + ' khách mới' : ''}${nSkip ? ' · bỏ ' + nSkip + ' đơn trùng' : ''} — công nợ đã cập nhật.`, 'success');
    /* Refresh đúng ngữ cảnh: trang Công nợ CFO → cnRender; trang Đơn → renderOrders; còn lại reload */
    setTimeout(() => {
      if (window.cnRender) window.cnRender();
      else if (window.renderOrders) window.renderOrders();
      else location.reload();
    }, 500);
  };
})();
