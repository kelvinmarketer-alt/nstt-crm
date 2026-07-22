/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — PHIẾU XUẤT KHO (kiêm Hóa đơn bán hàng)
   ─────────────────────────────────────────────────────────
   Template thứ 3 (bên cạnh "Phiếu xác nhận đơn cho KH" + "Phiếu giao cho Shipper").

   Mục đích: khi đơn đã giao xong, KẾ TOÁN gửi cho KHÁCH HÀNG để xác nhận hàng đã giao,
   bao gồm SL xuất kho vs SL thực nhận (chênh lệch nếu có), giá bán, thành tiền,
   chữ ký 4 bên (người nhận, KSCL, người giao, kế toán bán hàng).

   Khớp với mẫu PDF user cung cấp: ĐƠN HẠNH 19.5.pdf
   ========================================================= */
(function () {
  function getOrder(code) {
    const orders = window.STORE.get('orders', window.ORDERS || []) || [];
    return orders.find(x => x.code === code);
  }
  function getCust(o) {
    if (!o) return {};
    const list = window.STORE.get('customers', window.CUSTOMERS || []) || [];
    return list.find(c => c.id === (o.cust||o.custId) || c.code === (o.cust||o.custId)) || {
      name: o.custName, phone: o.custPhone, address: o.drop,
    };
  }
  function getCompany() {
    return window.STORE.get('companyInfo', null) || {
      name: 'Công Ty TNHH XNK Nông Sản Tuấn Tú Hà Nội',
      tax: '0110302211',
      address: '36/147A Tân Mai, Hoàng Mai, Hà Nội',
      director: '0836676086',
      bank: 'Techcombank 6699399999',
      bankOwner: 'Nguyễn Tuấn Anh',
      email: 'nongsantuantuhanoi@gmail.com',
      website: 'nongsantuantuhanoi.com',
    };
  }
  function getLogo() {
    /* Logo thương hiệu chính thức (assets/logo.png) — dùng chung mọi hoá đơn. */
    return window.BRAND_LOGO_DATAURL || ((location.origin || '') + '/assets/logo.png');
  }
  function fmt(n) { return (n || 0).toLocaleString('vi-VN'); }
  function fmtDate(s) {
    if (!s) return new Date().toLocaleDateString('vi-VN').replace(/\//g, '.');
    /* Hỗ trợ dd/mm/yyyy hoặc yyyy-mm-dd hoặc dd-mm-yyyy → dd.mm.yyyy */
    const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) return `${m[1].padStart(2,'0')}.${m[2].padStart(2,'0')}.${m[3].length===2?'20'+m[3]:m[3]}`;
    return s;
  }


  /* ============================================================
     TEMPLATE — PHIẾU XUẤT KHO (A4 portrait, khớp mẫu ĐƠN HẠNH)
     ============================================================ */
  window.printDeliveryNote = async function (code, win, mode) {
    const o = getOrder(code);
    if (!o) { window.toast && window.toast('Không tìm thấy đơn ' + code, 'warn'); return; }
    /* Danh sách nhẹ không kéo items → nạp items của đơn này trước khi in/copy phiếu */
    if (window.STORE && window.STORE.ensureOrderItems && !(Array.isArray(o.items) && o.items.length)) {
      try { await window.STORE.ensureOrderItems(code); } catch (e) {}
    }
    const c = getCust(o);
    const comp = getCompany();
    const items = o.items || [];
    const totalQty = items.reduce((s, it) => s + (+it.qty || 0), 0);
    const totalAmt = items.reduce((s, it) => s + (+it.total || (+it.price||0) * (+it.qty||0) || 0), 0);

    const FAV = window.NSTT_FAVICON_DATAURL || '';
    /* VietQR chuyển khoản theo ĐÚNG SỐ TIỀN đơn — tách mã NH + STK từ comp.bank (vd "MB 228666669999") */
    const _noDia = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd');
    const _bp = String(comp.bank || '').trim().match(/^(\S+)[\s:]+(\d[\d\s]*\d|\d)$/);
    const bankCode = comp.bankCode || (_bp && _bp[1]) || 'MB';
    const bankAcc = comp.bankAcc || (_bp && _bp[2].replace(/\s/g, '')) || '228666669999';
    const qrAmt = Math.max(0, Math.round(totalAmt || 0));
    const qrNote = _noDia((o.code || '') + ' ' + (c.name || o.custName || '')).slice(0, 50);
    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(bankAcc)}-qr_only.png`
      + `?amount=${qrAmt}&addInfo=${encodeURIComponent(qrNote)}&accountName=${encodeURIComponent(_noDia(comp.name || 'NONG SAN TUAN TU'))}`;
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Phiếu xuất kho ${o.code} — ${c.name || o.custName}</title>
${FAV ? `<link rel="icon" type="image/svg+xml" href="${FAV}">` : ''}
<style>
  *{box-sizing:border-box;margin:0;padding:0;
    -webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  /* @page margin:0 → ép Chrome ẨN header URL + footer "1/1" mặc định khi in.
     Tự chừa khoảng giấy bằng body padding. */
  @page{size:A4 portrait;margin:0}
  body{font-family:'Times New Roman','Liberation Serif',serif;color:#000;
    background:#fff;font-size:12.5px;line-height:1.45;padding:14mm 12mm}

  /* === HEADER (3 cột: logo | thông tin DN | QR chuyển khoản) === */
  .head{display:grid;grid-template-columns:104px 1fr 152px;gap:14px;align-items:flex-start;padding-bottom:6px}
  .logo-wrap{text-align:center}
  .logo-wrap img{width:92px;height:92px;object-fit:contain;display:block;margin:0 auto}
  .logo-wrap .tag{font-size:9px;color:#008000;font-weight:700;margin-top:4px;line-height:1.25}
  .logo-wrap .tag2{font-size:8px;color:#2c8a48;margin-top:2px;font-style:italic}

  .comp-info{padding-top:2px}
  .comp-info h1{font-size:17px;font-weight:800;text-align:left;color:#008000;letter-spacing:0.2px;margin-bottom:5px;line-height:1.2}
  .comp-info .row{font-size:11.5px;line-height:1.55;color:#000;text-align:left}
  .comp-info .row b{font-weight:700}
  .qrbox{text-align:center}
  .qrbox img{width:134px;height:134px;object-fit:contain;border:1px solid #008000;border-radius:8px;padding:3px;background:#fff;display:block;margin:0 auto}
  .qrbox .cap{font-size:9.5px;color:#008000;font-weight:700;margin-top:3px}
  .qrbox .acc{font-size:9px;color:#555}

  /* === TITLE (to, căn trái) + Người báo hàng === */
  .titlerow{display:flex;justify-content:space-between;align-items:center;gap:12px;
    border-bottom:1px solid #008000;padding:2px 4px 7px;margin-top:6px}
  .ptitle{font-size:23px;font-weight:800;color:#C00000;text-align:left;letter-spacing:0.3px;line-height:1.08}
  .reporter{background:#FFFF00;padding:4px 12px;border:1px solid #000;text-align:center;flex:0 0 auto}
  .reporter .lbl{display:block;font-size:10.5px;font-weight:700;margin-bottom:1px}
  .reporter b{font-size:13px}
  .buyer2{display:flex;justify-content:space-between;gap:14px;font-size:11.5px;padding:5px 4px;border-bottom:1px solid #000}
  .buyer2 b{font-weight:700}

  /* === TABLE === */
  table.it{width:100%;border-collapse:collapse;margin-top:8px;font-size:11.5px}
  table.it th, table.it td{border:1px solid #000;padding:4px 6px;vertical-align:middle}
  table.it thead th{background:#008000;color:#fff;font-weight:700;text-align:center;font-size:11px;line-height:1.3}
  table.it th.thbig{background:#008000;color:#fff}
  table.it td.c{text-align:center}
  table.it td.r{text-align:right;font-variant-numeric:tabular-nums}
  table.it td.l{text-align:left}
  table.it tfoot td{font-weight:800;background:#FFFF00;font-size:12.5px;text-align:center}
  table.it tfoot td.r{text-align:right;color:#000}

  /* === FOOTER NOTES === */
  .notes{margin:10px 0 16px;font-size:11px;line-height:1.55;text-align:center;color:#000}
  .notes .bold{font-weight:700}

  /* === SIGNATURES === */
  .sign{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px;text-align:center;font-size:11.5px}
  .sign .role{font-weight:700;text-transform:none;color:#000}
  .sign .ghi{font-style:italic;font-size:10.5px;color:#000;margin-top:2px;padding-bottom:55px}

  /* === Print/Close buttons (ẩn khi in) === */
  .noprint{position:fixed;bottom:18px;right:18px;display:flex;gap:8px;z-index:1000}
  .noprint button{padding:10px 18px;border-radius:8px;border:0;cursor:pointer;font-weight:700;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.25)}
  .noprint .btn-print{background:#008000;color:#fff}
  .noprint .btn-close{background:#fff;color:#475569;border:1px solid #CBD5E1}
  @media print { .noprint{display:none !important} body{padding:0} }
</style></head>
<body>

  <!-- ============ HEADER (logo | thông tin DN | QR chuyển khoản) ============ -->
  <div class="head">
    <div class="logo-wrap">
      <img src="${getLogo()}" alt="Nông Sản Tuấn Tú Hà Nội">
    </div>
    <div class="comp-info">
      <h1>${(comp.name || 'Công Ty TNHH XNK Nông Sản Tuấn Tú Hà Nội').toUpperCase().replace(/\s*[-–—]\s*/, '<br>')}</h1>
      <div class="row"><b>Mã Số Thuế:</b> ${comp.tax || '0110302211'}</div>
      <div class="row"><b>Địa Chỉ:</b> ${comp.address || '36/147A Tân Mai, Hoàng Mai, Hà Nội'}</div>
      <div class="row"><b>Số Tài Khoản:</b> ${comp.bank || 'Techcombank 6699399999'}</div>
      <div class="row"><b>Chủ TK:</b> ${comp.bankOwner || 'Nguyễn Tuấn Anh'}</div>
      <div class="row"><b>Email:</b> ${comp.email || 'nongsantuantuhanoi@gmail.com'} &nbsp;·&nbsp; <b>GĐĐH:</b> ${comp.director || comp.hotline || '0836676086'}</div>
    </div>
    <div class="qrbox">
      <img src="${qrUrl}" alt="VietQR chuyển khoản" crossorigin="anonymous" onerror="this.style.opacity='0.12'">
      <div class="cap">Quét QR chuyển khoản</div>
      <div class="acc">${comp.bank || 'MB 228666669999'}</div>
    </div>
  </div>

  <!-- ============ TIÊU ĐỀ (to, căn trái) + Người báo hàng ============ -->
  <div class="titlerow">
    <div class="ptitle">PHIẾU XUẤT KHO – HÓA ĐƠN BÁN HÀNG</div>
    <div class="reporter">
      <span class="lbl">Người báo hàng</span>
      <b>${(o.staff || o.takenBy || '').toUpperCase()}</b>
    </div>
  </div>
  <div class="buyer2">
    <div><b>Khách Hàng:</b> ${c.name || o.custName || '—'}${(c.address || o.drop) ? ` &nbsp;·&nbsp; <b>Địa Chỉ:</b> ${c.address || o.drop}` : ''}</div>
    <div><b>SĐT:</b> ${c.phone || o.custPhone || '—'} &nbsp;·&nbsp; <b>TG Nhận:</b> ${o.deliveryTime || 'Sáng'}</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;font-style:italic;font-size:11.5px;margin-top:5px">
    <i>Chuyên Sỉ Rau Củ Quả Đà Lạt Và Rau Vùng Miền.</i>
    <span>Ngày: <b>${fmtDate(o.date || o.deliveredAt)}</b></span>
  </div>

  <!-- ============ ITEMS TABLE ============ -->
  <table class="it">
    <thead>
      <tr>
        <th style="width:36px">STT</th>
        <th>Tên sản phẩm</th>
        <th style="width:42px">ĐVT</th>
        <th class="thbig" style="width:64px">Số lượng<br>xuất kho</th>
        <th class="thbig" style="width:52px">Thực<br>nhận</th>
        <th style="width:78px">Giá bán</th>
        <th style="width:90px">Thành tiền</th>
        <th style="width:80px">Ghi chú</th>
      </tr>
    </thead>
    <tbody>
      ${items.length ? items.map((it, i) => `<tr>
        <td class="c">${i+1}</td>
        <td class="l">${it.name || ''}</td>
        <td class="c">${it.unit || 'kg'}</td>
        <td class="c">${it.qty || ''}</td>
        <td class="c">${it.received != null ? it.received : it.qty || ''}</td>
        <td class="r">${fmt(it.price)}</td>
        <td class="r">${fmt(it.total || (+it.price||0)*(+it.qty||0))}</td>
        <td class="l" style="font-size:10.5px">${it.note || ''}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="c" style="padding:30px;color:#999">Đơn này chưa có chi tiết sản phẩm.</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3"><b>Tổng cộng</b></td>
        <td class="c">${totalQty || ''}</td>
        <td></td>
        <td></td>
        <td class="r">${fmt(totalAmt)}</td>
        <td></td>
      </tr>
      <tr>
        <td colspan="2" style="text-align:left;background:#fff;font-weight:700">Bằng chữ:</td>
        <td colspan="6" style="text-align:left;background:#fff;font-style:italic;font-weight:400">${
          (window.numberToWords ? window.numberToWords(totalAmt) : fmt(totalAmt) + ' đồng')
        }</td>
      </tr>
    </tfoot>
  </table>

  <!-- ============ NOTES ============ -->
  <div class="notes">
    <div>Để đảm bảo yêu cầu, khách hàng vui lòng kiểm tra chất lượng hàng hóa khi ký nhận.</div>
    <div>Lưu ý: Nếu đổi trả hàng quý khách hàng vui lòng ghi rõ nội dung, chụp ảnh hoặc quay video sản phẩm.</div>
  </div>

  <!-- ============ SIGNATURES ============ -->
  <div class="sign">
    <div><div class="role">Người nhận hàng</div><div class="ghi">(Ký, ghi rõ họ tên)</div></div>
    <div><div class="role">Kiểm soát chất lượng</div><div class="ghi">(Ký, ghi rõ họ tên)</div></div>
    <div><div class="role">Người giao hàng</div><div class="ghi">(Ký, họ tên)</div></div>
    <div><div class="role">Kế toán bán hàng</div><div class="ghi">(Ký, ghi rõ họ tên)</div></div>
  </div>

  <!-- Print/Close buttons -->
  <div class="noprint">
    <button class="btn-print" onclick="window.print()">🖨 In / Save PDF</button>
    <button class="btn-close" onclick="window.close()">✕ Đóng</button>
  </div>


</body></html>`;

    /* mode='copy' → COPY ẢNH THẲNG vào clipboard, KHÔNG mở popup (nút 🧾 ở bảng đơn) */
    if (mode === 'copy' && window.copyReceiptImageDirect) {
      const r = window.copyReceiptImageDirect(html, 'phieu-xuat-kho-' + o.code);
      if (!(r && r.unsupported)) { if (window.audit) window.audit.log('order.deliveryNote', 'Copy phiếu kho ' + o.code); return; }
      /* trình duyệt không hỗ trợ clipboard ảnh → rơi xuống mở popup như thường */
    }

    /* XEM & COPY ẢNH (thay in PDF) — popup có nút Copy ảnh/Tải ảnh/In */
    if (window.openReceiptImageWindow) {
      window.openReceiptImageWindow(html, 'Phiếu xuất kho ' + o.code, 'phieu-xuat-kho-' + o.code, win);
    } else {
      /* fallback: in qua iframe nếu helper chưa nạp */
      const cleaned = html.replace(/<script>[\s\S]*?window\.print\(\)[\s\S]*?<\/script>/gi, '');
      const old = document.getElementById('dnPrintFrame'); if (old) old.remove();
      const f = document.createElement('iframe');
      f.id = 'dnPrintFrame';
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(f);
      const doc = f.contentWindow.document;
      doc.open(); doc.write(cleaned); doc.close();
      const fire = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} };
      const imgs = [...doc.images];
      if (imgs.length) { let left = imgs.filter(im => !im.complete).length; if (!left) setTimeout(fire, 250); else imgs.forEach(im => { if (!im.complete) { const d = () => { if (--left <= 0) setTimeout(fire, 150); }; im.onload = d; im.onerror = d; } }); }
      else setTimeout(fire, 250);
    }
    if (window.audit) window.audit.log('order.deliveryNote', 'Xuất phiếu kho ' + o.code + ' cho ' + (c.name || o.custName));
  };

  /* === Mở rộng modal in của printOrder() để có 3 lựa chọn === */
  const origPrintOrder = window.printOrder;
  window.printOrder = function (code) {
    const orders = window.STORE.get('orders', window.ORDERS || []) || [];
    const o = orders.find(x => x.code === code);
    if (!o) { window.toast && window.toast('Không tìm thấy đơn ' + code, 'warn'); return; }
    if (!window.openModal) { window.printOrderForCustomer && window.printOrderForCustomer(code); return; }

    const row = (id, checked, icon, color, title, desc) => `
      <label style="display:flex;align-items:flex-start;gap:10px;border:1px solid var(--line);border-radius:9px;padding:11px 12px;margin-bottom:8px;cursor:pointer">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="margin-top:3px;width:16px;height:16px;accent-color:${color}">
        <div style="flex:1"><div style="font-weight:700;color:${color};font-size:13px">${icon} ${title}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${desc}</div></div>
      </label>`;
    window.openModal('📸 Phiếu đơn ' + code + ' — Copy ảnh gửi khách', `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">Tick phiếu cần → mở ra bấm <b>“Copy ảnh gửi khách”</b> dán vào Zalo/Messenger (vẫn có nút In giấy nếu cần):</div>
      ${row('prt_cust', true,  '📄', '#008000', 'Phiếu xác nhận đơn (Khách)', 'Đơn giá + tổng tiền · công nợ · đối chiếu trước khi giao')}
      ${row('prt_ship', false, '🛵', '#D97706', 'Phiếu giao cho Shipper', 'Địa chỉ + SĐT to · tick mặt hàng · khung COD · ô POD')}
      ${row('prt_wh',   false, '🧾', '#C00000', 'Phiếu báo hàng / xuất kho (Kho)', 'Mặt hàng + số lượng cho Kho chuẩn bị')}
      <div style="margin-top:6px;padding:11px 12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:9px">
        <div style="font-size:12px;color:#15803D;font-weight:600;margin-bottom:6px">📤 Bắt đầu quy trình Kho</div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">Gửi phiếu báo hàng vào nhóm Kho (Telegram) rồi chuyển thẳng sang <b>Gom hàng → NCC</b>.</div>
        <button class="btn btn-primary btn-sm" onclick="window._sendBaoHangAndGo('${code}')">📤 Gửi Kho + sang Gom hàng</button>
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-primary" onclick="window._printSelectedPhieu('${code}')">📸 Mở phiếu (Copy ảnh)</button>`,
      width: '440px',
    });
  };

  /* Mở các phiếu được tick — MỞ CỬA SỔ NGAY trong cú click (giữ user-gesture → né chặn popup),
     rồi build phiếu (async, chờ ảnh) ghi vào cửa sổ đã mở. */
  window._printSelectedPhieu = function (code) {
    const picks = [];
    if (document.getElementById('prt_cust')?.checked) picks.push('cust');
    if (document.getElementById('prt_ship')?.checked) picks.push('ship');
    if (document.getElementById('prt_wh')?.checked) picks.push('wh');
    if (!picks.length) { window.toast && window.toast('Tick ít nhất 1 phiếu', 'warn'); return; }
    const wins = picks.map(() => window.open('', '_blank', 'width=960,height=1000'));
    if (!wins[0]) { window.toast && window.toast('Trình duyệt CHẶN popup — cho phép popup rồi mở lại', 'warn'); return; }
    if (wins.some(w => !w)) window.toast && window.toast('1 số phiếu bị chặn popup — mở lại từng phiếu nếu thiếu', 'info');
    wins.forEach(w => { if (w) { try { w.document.write('<!doctype html><meta charset="utf-8"><body style="margin:0;font:15px system-ui;padding:26px;color:#334155">Đang tạo phiếu…</body>'); } catch (e) {} } });
    window.closeModal && window.closeModal();
    picks.forEach((kind, i) => {
      const w = wins[i]; if (!w) return;
      if (kind === 'cust') window.printOrderForCustomer && window.printOrderForCustomer(code, w);
      else if (kind === 'ship') window.printOrderForShipper && window.printOrderForShipper(code, w);
      else if (kind === 'wh') window.printDeliveryNote && window.printDeliveryNote(code, w);
    });
  };

  /* Gửi phiếu báo hàng cho Kho (Telegram) → chuyển sang Gom hàng */
  window._sendBaoHangAndGo = function (code) {
    window.closeModal && window.closeModal();
    const go = () => { window.location.href = 'procurement.html'; };
    if (window.sendBaoHangTelegram) {
      window.sendBaoHangTelegram(code, false)
        .then(r => { if (r && r.ok) window.toast && window.toast('📋 Đã gửi Kho — chuyển sang Gom hàng…', 'success'); setTimeout(go, 800); })
        .catch(() => setTimeout(go, 300));
    } else { window.toast && window.toast('Chuyển sang Gom hàng…', 'info'); setTimeout(go, 300); }
  };

  /* In cả 3 (tương thích ngược) */
  window.printBothOrderPdfs = function (code) {
    window.closeModal && window.closeModal();
    window.printOrderForCustomer && window.printOrderForCustomer(code);
    setTimeout(() => window.printOrderForShipper && window.printOrderForShipper(code), 700);
    setTimeout(() => window.printDeliveryNote && window.printDeliveryNote(code), 1400);
  };

})();
