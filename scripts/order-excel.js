/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — XUẤT EXCEL (.xlsx) cho TỪNG ĐƠN
   ─────────────────────────────────────────────────────────
   Mẫu Excel bám theo PHIẾU XUẤT KHO (delivery-note.js):
   header công ty (tên XANH) · tiêu đề · thông tin KH · bảng
   mặt hàng (header XANH #008000, ô Tổng/Bằng chữ VÀNG) · chữ ký.

   Dùng ExcelJS (nạp lười từ CDN — giống html2canvas) để giữ
   MÀU/định dạng ô (SheetJS community không ghi được màu nền).
   File tải về = .xlsx thật, mở Excel/Google Sheet không cảnh báo.
   ========================================================= */
(function () {
  const CDN = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  let _loadPromise = null;
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (_loadPromise) return _loadPromise;
    _loadPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CDN; s.async = true;
      s.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS không khởi tạo'));
      s.onerror = () => { _loadPromise = null; reject(new Error('Không tải được thư viện Excel (cần mạng)')); };
      document.head.appendChild(s);
    });
    return _loadPromise;
  }
  /* Warm cache khi trình duyệt rảnh (không chặn first-paint) */
  if (window.requestIdleCallback) requestIdleCallback(() => { loadExcelJS().catch(() => {}); }, { timeout: 6000 });

  /* ---- getters (đồng bộ với delivery-note.js) ---- */
  function getOrder(code) {
    const orders = window.STORE.get('orders', window.ORDERS || []) || [];
    return orders.find(x => x.code === code);
  }
  function getCust(o) {
    if (!o) return {};
    const list = window.STORE.get('customers', window.CUSTOMERS || []) || [];
    return list.find(c => c.id === (o.cust || o.custId) || c.code === (o.cust || o.custId)) || {
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
  function fmtDate(s) {
    if (!s) return new Date().toLocaleDateString('vi-VN').replace(/\//g, '.');
    const m = String(s).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[3].length === 2 ? '20' + m[3] : m[3]}`;
    return s;
  }

  /* ---- màu & border ---- */
  const GREEN = 'FF008000', YELLOW = 'FFFFFF00', RED = 'FFC00000', WHITE = 'FFFFFFFF', GREY = 'FF555555';
  const TNR = 'Times New Roman';
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const boxAll = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  window.exportOrderExcel = async function (code) {
    const o = getOrder(code);
    if (!o) { window.toast && window.toast('Không tìm thấy đơn ' + code, 'warn'); return; }

    let ExcelJS;
    try {
      window.toast && window.toast('Đang tạo file Excel…', 'info');
      ExcelJS = await loadExcelJS();
    } catch (e) {
      window.toast && window.toast(e.message || 'Không tải được thư viện Excel', 'warn');
      return;
    }

    const c = getCust(o), comp = getCompany();
    const items = o.items || [];
    const totalQty = items.reduce((s, it) => s + (+it.qty || 0), 0);
    const totalAmt = items.reduce((s, it) => s + (+it.total || (+it.price || 0) * (+it.qty || 0) || 0), 0);
    const words = window.numberToWords ? window.numberToWords(totalAmt) : ((totalAmt || 0).toLocaleString('vi-VN') + ' đồng');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Nông Sản Tuấn Tú Hà Nội';
    const ws = wb.addWorksheet('Phiếu ' + o.code, {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      views: [{ showGridLines: false }],
    });

    /* 8 cột: STT | Tên SP | ĐVT | SL xuất | Thực nhận | Giá bán | Thành tiền | Ghi chú */
    ws.columns = [
      { width: 6 }, { width: 36 }, { width: 8 }, { width: 12 },
      { width: 11 }, { width: 14 }, { width: 16 }, { width: 20 },
    ];

    /* ===== HEADER công ty (logo A + thông tin B:H) ===== */
    const LOGO = window.BRAND_LOGO_DATAURL || '';
    if (/^data:image\/(png|jpe?g);base64,/.test(LOGO)) {
      try {
        const imgId = wb.addImage({ base64: LOGO, extension: /jpe?g/.test(LOGO) ? 'jpeg' : 'png' });
        ws.addImage(imgId, { tl: { col: 0.12, row: 0.15 }, ext: { width: 46, height: 46 }, editAs: 'oneCell' });
      } catch (e) { /* bỏ qua nếu ảnh lỗi — file vẫn xuất được */ }
    }
    ws.mergeCells('B1:H1');
    const nm = ws.getCell('B1');
    nm.value = (comp.name || 'Công Ty TNHH XNK Nông Sản Tuấn Tú Hà Nội').toUpperCase();
    nm.font = { name: TNR, size: 15, bold: true, color: { argb: GREEN } };
    nm.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 21;

    const infoLine = (rowIdx, parts) => {
      ws.mergeCells('B' + rowIdx + ':H' + rowIdx);
      const cell = ws.getCell('B' + rowIdx);
      cell.value = { richText: parts };
      cell.font = { name: TNR, size: 10.5 };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getRow(rowIdx).height = 15.5;
    };
    const lbl = t => ({ font: { name: TNR, size: 10.5, bold: true }, text: t });
    const val = t => ({ font: { name: TNR, size: 10.5 }, text: t });
    infoLine(2, [lbl('Mã Số Thuế: '), val((comp.tax || '') + '     '), lbl('Địa Chỉ: '), val(comp.address || '')]);
    infoLine(3, [lbl('Số Tài Khoản: '), val((comp.bank || '') + '     '), lbl('Chủ TK: '), val(comp.bankOwner || '')]);
    infoLine(4, [lbl('Email: '), val((comp.email || '') + '     '), lbl('GĐĐH: '), val(comp.director || comp.hotline || '')]);
    ws.getRow(5).height = 5;

    /* ===== TIÊU ĐỀ ===== */
    ws.mergeCells('A6:H6');
    const t = ws.getCell('A6');
    t.value = 'PHIẾU XUẤT KHO – HÓA ĐƠN BÁN HÀNG';
    t.font = { name: TNR, size: 18, bold: true, color: { argb: RED } };
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(6).height = 27;

    /* ===== THÔNG TIN ĐƠN (2 cột: A:E trái / F:H phải) ===== */
    const twoCol = (rowIdx, leftParts, rightParts) => {
      ws.mergeCells('A' + rowIdx + ':E' + rowIdx);
      ws.mergeCells('F' + rowIdx + ':H' + rowIdx);
      const L = ws.getCell('A' + rowIdx), R = ws.getCell('F' + rowIdx);
      L.value = { richText: leftParts }; R.value = { richText: rightParts };
      L.font = R.font = { name: TNR, size: 11 };
      L.alignment = R.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getRow(rowIdx).height = 16;
    };
    twoCol(7,
      [lbl('Khách Hàng: '), val(c.name || o.custName || '—')],
      [lbl('Ngày: '), val(fmtDate(o.date || o.deliveredAt))]);
    twoCol(8,
      [lbl('Địa Chỉ: '), val(c.address || o.drop || '—')],
      [lbl('SĐT: '), val(c.phone || o.custPhone || '—')]);
    twoCol(9,
      [lbl('TG Nhận: '), val(o.deliveryTime || 'Sáng')],
      [lbl('Người báo hàng: '), val((o.staff || o.takenBy || '—'))]);
    ws.getRow(10).height = 5;

    /* ===== BẢNG MẶT HÀNG ===== */
    const HEAD_ROW = 11;
    const heads = ['STT', 'Tên sản phẩm', 'ĐVT', 'Số lượng\nxuất kho', 'Thực\nnhận', 'Giá bán', 'Thành tiền', 'Ghi chú'];
    const hr = ws.getRow(HEAD_ROW);
    heads.forEach((h, i) => {
      const cell = hr.getCell(i + 1);
      cell.value = h;
      cell.fill = fill(GREEN);
      cell.font = { name: TNR, size: 11, bold: true, color: { argb: WHITE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = boxAll;
    });
    hr.height = 30;

    let r = HEAD_ROW;
    if (items.length) {
      items.forEach((it, i) => {
        r++;
        const row = ws.getRow(r);
        const received = it.received != null ? it.received : it.qty;
        const line = +it.total || (+it.price || 0) * (+it.qty || 0);
        const cells = [
          { v: i + 1, a: 'center' },
          { v: it.name || '', a: 'left' },
          { v: it.unit || 'kg', a: 'center' },
          { v: (+it.qty || 0), a: 'center', z: '#,##0.###' },
          { v: (+received || 0), a: 'center', z: '#,##0.###' },
          { v: (+it.price || 0), a: 'right', z: '#,##0' },
          { v: line, a: 'right', z: '#,##0' },
          { v: it.note || '', a: 'left' },
        ];
        cells.forEach((cf, ci) => {
          const cell = row.getCell(ci + 1);
          cell.value = cf.v;
          cell.font = { name: TNR, size: 11 };
          cell.alignment = { horizontal: cf.a, vertical: 'middle', wrapText: ci === 1 };
          cell.border = boxAll;
          if (cf.z) cell.numFmt = cf.z;
        });
        row.height = 17;
      });
    } else {
      r++;
      ws.mergeCells('A' + r + ':H' + r);
      const cell = ws.getCell('A' + r);
      cell.value = 'Đơn này chưa có chi tiết sản phẩm.';
      cell.font = { name: TNR, size: 11, italic: true, color: { argb: GREY } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = boxAll;
      ws.getRow(r).height = 26;
    }

    /* ===== TỔNG CỘNG (vàng) ===== */
    r++;
    const totRow = r;
    ws.mergeCells('A' + r + ':C' + r);
    const tl = ws.getCell('A' + r);
    tl.value = 'Tổng cộng';
    [1, 2, 3, 4, 5, 6, 7, 8].forEach(ci => {
      const cell = ws.getRow(r).getCell(ci);
      cell.fill = fill(YELLOW);
      cell.font = { name: TNR, size: 12, bold: true };
      cell.border = boxAll;
      cell.alignment = { horizontal: ci === 1 ? 'left' : (ci === 7 ? 'right' : 'center'), vertical: 'middle' };
    });
    const qCell = ws.getRow(r).getCell(4); qCell.value = totalQty || null; qCell.numFmt = '#,##0.###';
    const aCell = ws.getRow(r).getCell(7); aCell.value = totalAmt || 0; aCell.numFmt = '#,##0';
    ws.getRow(r).height = 20;

    /* ===== BẰNG CHỮ ===== */
    r++;
    ws.mergeCells('A' + r + ':B' + r);
    ws.mergeCells('C' + r + ':H' + r);
    const bcL = ws.getCell('A' + r), bcR = ws.getCell('C' + r);
    bcL.value = 'Bằng chữ:'; bcR.value = words;
    bcL.font = { name: TNR, size: 11, bold: true };
    bcR.font = { name: TNR, size: 11, italic: true };
    bcL.alignment = { horizontal: 'left', vertical: 'middle' };
    bcR.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    [1, 2, 3, 4, 5, 6, 7, 8].forEach(ci => { ws.getRow(r).getCell(ci).border = boxAll; });
    ws.getRow(r).height = 18;

    /* ===== GHI CHÚ ===== */
    r += 2;
    const notes = [
      'Để đảm bảo yêu cầu, khách hàng vui lòng kiểm tra chất lượng hàng hóa khi ký nhận.',
      'Lưu ý: Nếu đổi trả hàng quý khách vui lòng ghi rõ nội dung, chụp ảnh hoặc quay video sản phẩm.',
    ];
    notes.forEach(txt => {
      ws.mergeCells('A' + r + ':H' + r);
      const cell = ws.getCell('A' + r);
      cell.value = txt;
      cell.font = { name: TNR, size: 10.5, italic: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(r).height = 15;
      r++;
    });

    /* ===== CHỮ KÝ (4 cột) ===== */
    r++;
    const signPairs = [['A', 'B', 'Người nhận hàng'], ['C', 'D', 'Kiểm soát chất lượng'], ['E', 'F', 'Người giao hàng'], ['G', 'H', 'Kế toán bán hàng']];
    signPairs.forEach(([a, b, role]) => {
      ws.mergeCells(a + r + ':' + b + r);
      const cell = ws.getCell(a + r);
      cell.value = role;
      cell.font = { name: TNR, size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.getRow(r).height = 18;
    const gr = r + 1;
    signPairs.forEach(([a, b]) => {
      ws.mergeCells(a + gr + ':' + b + gr);
      const cell = ws.getCell(a + gr);
      cell.value = '(Ký, ghi rõ họ tên)';
      cell.font = { name: TNR, size: 10, italic: true, color: { argb: GREY } };
      cell.alignment = { horizontal: 'center', vertical: 'top' };
    });
    ws.getRow(gr).height = 60; /* chừa khoảng ký */

    /* ===== TẢI FILE ===== */
    try {
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'PhieuXuatKho-' + o.code + '.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      window.toast && window.toast('✅ Đã tải Excel đơn ' + o.code, 'success');
      window.audit && window.audit.log('order.excel', 'Xuất Excel ' + o.code + ' cho ' + (c.name || o.custName || ''));
    } catch (e) {
      console.error('[order-excel]', e);
      window.toast && window.toast('Lỗi tạo file Excel: ' + (e.message || e), 'warn');
    }
  };
})();
