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
  /* Khoá NHẬN DIỆN khách = TÊN + ĐỊA CHỈ → cùng tên nhưng KHÁC địa chỉ = khách khác (chi nhánh khác). */
  const ckey = (name, addr) => nkey(name) + '||' + nkey(addr);

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
        break;
      }
    }
    const items = []; let totalRow = 0;
    if (hr >= 0) for (let r = hr + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      if (/^tổng cộng/.test(low(row[0])) || /^tổng cộng/.test(low(row[col.name]))) {
        const t = +(row[col.amt]); if (!isNaN(t) && t) totalRow = t; break;
      }
      const nm = norm(row[col.name]); if (!nm) continue;
      const qty = +(row[col.qty >= 0 ? col.qty : -1]) || 0;
      const price = +(row[col.price >= 0 ? col.price : -1]) || 0;
      let amt = +(row[col.amt]) || 0;
      if (!amt && qty && price) amt = qty * price;
      if (!amt && !qty) continue;
      items.push({ name: nm, unit: norm(row[col.unit] || 'kg').toLowerCase(), qty, price: Math.round(price * 1000), total: Math.round(amt * 1000) });
    }
    const itemsTotal = items.reduce((s, it) => s + it.total, 0);
    const total = totalRow ? Math.round(totalRow * 1000) : itemsTotal;
    return { custName, addr, dateRaw, items, total, valid: !!(custName && total && items.length) };
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
    const custByKey = {}; customers.forEach(c => { custByKey[ckey(c.name, c.address)] = c; });
    _parsed = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array' });
        for (const sn of wb.SheetNames) {
          const grid = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
          const p = parsePhieu(grid);
          if (!p.valid) continue;            /* sheet không phải phiếu (vd "TÊN QC") → bỏ */
          const d = parseDate(p.dateRaw);
          const match = custByKey[ckey(p.custName, p.addr)] || null;
          /* trùng: cùng tên + ĐỊA CHỈ + ngày + tổng đã có đơn (địa chỉ đơn lưu ở o.drop) */
          const dup = d && orders.some(o => nkey(o.custName) === nkey(p.custName)
            && nkey(o.drop) === nkey(p.addr)
            && (o.deliverDate === d.iso || (o.date || '').slice(0, 10) === d.vn.split('/').reverse().join('-'))
            && Math.abs((+o.freight || 0) - p.total) < 1);
          _parsed.push({ file: f.name, sheet: sn, ...p, date: d, match, dup, pick: !dup && !!d });
        }
      } catch (e) { _parsed.push({ file: f.name, error: String(e.message || e), pick: false }); }
    }
    renderPreview();
  };

  function renderPreview() {
    const prev = document.getElementById('phieuPreview');
    const btn = document.getElementById('phieuCommitBtn');
    if (!_parsed.length) { prev.innerHTML = '<div style="color:#B45309;font-size:12.5px;padding:8px">Không đọc được phiếu hợp lệ nào trong file đã chọn.</div>'; if (btn) btn.disabled = true; return; }
    const willCreate = _parsed.filter(p => p.pick).length;
    const newCusts = new Set(_parsed.filter(p => p.pick && !p.match).map(p => ckey(p.custName, p.addr))).size;
    const fmt = v => (+v || 0).toLocaleString('vi-VN');
    prev.innerHTML = `
      <div style="font-size:12.5px;margin-bottom:8px"><b>${_parsed.length}</b> phiếu đọc được · sẽ tạo <b style="color:#15803D">${willCreate}</b> đơn${newCusts ? ` · tạo mới <b>${newCusts}</b> khách` : ''}</div>
      <div style="max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:8px">
      <table class="mini-table" style="margin:0;font-size:12px">
        <thead><tr><th style="width:34px"></th><th>Khách hàng</th><th>Địa chỉ</th><th>Ngày</th><th class="num">Số mã</th><th class="num">Tổng tiền</th><th>Trạng thái</th></tr></thead>
        <tbody>${_parsed.map((p, i) => {
      if (p.error) return `<tr><td></td><td colspan="6" style="color:#B91C1C">⚠ ${p.file}: ${p.error}</td></tr>`;
      const st = p.dup ? '<span style="color:#B45309">⏭ Đã có — bỏ qua</span>'
        : !p.date ? '<span style="color:#B91C1C">⚠ Không đọc được ngày</span>'
          : p.match ? '<span style="color:#15803D">✓ Khách đã có</span>'
            : '<span style="color:#2563EB">🆕 Sẽ tạo khách mới</span>';
      const addrCell = p.addr
        ? `<span style="font-size:11px;color:var(--muted)">${p.addr}</span>`
        : `<span style="font-size:11px;color:#B45309" title="Phiếu không có địa chỉ → khớp khách chỉ theo tên">⚠ thiếu địa chỉ</span>`;
      const canPick = !p.dup && !!p.date;
      return `<tr style="${p.pick ? '' : 'opacity:.6'}">
            <td class="num"><input type="checkbox" ${p.pick ? 'checked' : ''} ${canPick ? '' : 'disabled'} onchange="window._phieuToggle(${i}, this.checked)"></td>
            <td><b>${p.custName}</b>${p.match ? ` <span style="color:var(--muted);font-size:10.5px">(${p.match.code})</span>` : ''}</td>
            <td style="max-width:220px;white-space:normal">${addrCell}</td>
            <td>${p.date ? p.date.vn : '—'}</td>
            <td class="num">${p.items.length}</td>
            <td class="num"><b>${fmt(p.total)}</b></td>
            <td>${st}</td>
          </tr>`;
    }).join('')}</tbody>
      </table></div>`;
    if (btn) btn.disabled = willCreate === 0;
  }
  window._phieuToggle = function (i, on) { if (_parsed[i]) { _parsed[i].pick = on; renderPreview(); } };

  window._phieuCommit = function () {
    const rows = _parsed.filter(p => p.pick && p.date && p.total);
    if (!rows.length) { window.toast('Không có phiếu nào để tạo', 'warn'); return; }
    const me = (window.AUTH && window.AUTH.currentUser && window.AUTH.currentUser()) || {};
    const todayVN = new Date().toLocaleDateString('vi-VN');
    /* map tên → id (gồm KH mới tạo trong lượt này) */
    const customers = window.STORE.get('customers', []) || [];
    const byKey = {}; customers.forEach(c => byKey[ckey(c.name, c.address)] = c.id);
    let nCust = 0, nOrder = 0;

    rows.forEach(p => {
      let custId = p.match ? p.match.id : byKey[ckey(p.custName, p.addr)];
      if (!custId) {
        custId = window.STORE.nextId('customers', 'KH', 3);
        window.STORE.add('customers', {
          id: custId, code: custId, type: 'B2B', group: 'Mới',
          name: p.custName, contact: p.custName, phone: '', email: '',
          address: p.addr || '', province: 'Hà Nội',
          staffOwner: me.name || 'Tuấn Tú', source: 'import-phiếu',
          created: todayVN, lastContact: todayVN, lastOrder: p.date.vn, active: true,
          orders: 0, revenue: 0, debt: 0, debtOverdue: 0, mainCats: [], notes: [],
        });
        byKey[ckey(p.custName, p.addr)] = custId; nCust++;
      }
      const items = p.items.map(it => ({
        id: null, custom: true, fromImport: true, name: it.name, unit: it.unit || 'kg',
        qty: it.qty, price: it.price, basePrice: it.price, priceConfirmed: true, total: it.total,
      }));
      const order = {
        code: window.STORE.nextOrderCode(),
        date: p.date.vn, createdAt: new Date(p.date.iso + 'T08:00:00').toISOString(),
        deliverDate: p.date.iso, deliveredAt: p.date.vn,
        cust: custId, custName: p.custName, custPhone: '',
        serviceType: '', transportMode: 'giao-ngay',
        pickup: 'Kho Tuấn Tú', drop: p.addr || '',
        goods: p.items.map(it => it.name).join(', ').slice(0, 250),
        qty: 1, unit: 'kg', weight: 0,
        items, freight: p.total, cod: 0, payBy: 'Công nợ',
        status: 'delivered', whStatus: 'released',
        staff: me.name || '', source: 'import-phiếu',
        note: 'Nhập từ phiếu Excel: ' + p.file,
      };
      window.STORE.add('orders', order);
      nOrder++;
    });
    window.closeModal();
    window.toast(`✓ Đã tạo ${nOrder} đơn${nCust ? ' · ' + nCust + ' khách mới' : ''} — công nợ đã cập nhật.`, 'success');
    /* Refresh đúng ngữ cảnh: trang Công nợ CFO → cnRender; trang Đơn → renderOrders; còn lại reload */
    setTimeout(() => {
      if (window.cnRender) window.cnRender();
      else if (window.renderOrders) window.renderOrders();
      else location.reload();
    }, 500);
  };
})();
