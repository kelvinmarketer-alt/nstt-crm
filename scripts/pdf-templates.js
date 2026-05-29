/* =========================================================
   PDF Templates — 2 form khoa học cho đơn hàng
   ─────────────────────────────────────────────────────────
   Mỗi đơn hàng có 2 bản in/PDF riêng cho 2 mục đích khác nhau:

   1. PHIẾU XÁC NHẬN ĐƠN cho KHÁCH HÀNG
      - Trang trọng, có logo
      - Bảng mặt hàng + đơn giá + tổng tiền + công nợ
      - Có ô ký tên 2 bên (DN + KH)
      - Mục đích: lưu trữ + đối chiếu công nợ + làm chứng từ

   2. PHIẾU GIAO HÀNG cho SHIPPER
      - To, rõ, font lớn (dễ đọc khi cầm trên xe)
      - Địa chỉ + SĐT in đậm to (ưu tiên hàng đầu)
      - Checkbox cạnh mỗi mặt hàng (tick khi giao)
      - Khung COD lớn
      - Ô ký nhận hàng + ô gắn ảnh POD

   Cách dùng:
   - window.printOrderForCustomer(code)
   - window.printOrderForShipper(code)
   - window.printOrder(code)  → mặc định mở dialog cho user chọn

   Cả 2 đều mở popup window → window.print() → user "Save as PDF"
   ========================================================= */
(function () {

  function getOrder(code) {
    const orders = window.STORE.get('orders', window.ORDERS || []) || [];
    return orders.find(x => x.code === code);
  }
  function getCust(o) {
    if (!o) return {};
    const list = window.STORE.get('customers', window.CUSTOMERS || []) || [];
    return list.find(c => c.id === o.custId || c.code === o.custId) || { name: o.custName, phone: o.custPhone, address: o.drop };
  }
  function getCompany() {
    return window.STORE.get('company', {
      name: 'Nông Sản Tuấn Tú Hà Nội',
      addr: '36 Tân Mai, Hoàng Mai, Hà Nội',
      phone: '0903 111 222',
      email: 'support@nongsantuantuhanoi.com',
      website: 'nongsantuantuhanoi.com',
      tax: '0123456789',
      bank: 'VCB · 0123456789 · NÔNG SẢN TUẤN TÚ HÀ NỘI',
    });
  }
  function fmt(n) { return (n || 0).toLocaleString('vi-VN'); }

  /* Chia sẻ HTML head/CSS reset chung */
  const SHARED_CSS = `
    *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{color:#1F2937;font-size:13px;line-height:1.55;background:#fff}
    @page{size:A5 portrait;margin:8mm}
    @media print{body{padding:0}}
  `;

  /* ============================================================
     TEMPLATE 1 — PHIẾU XÁC NHẬN ĐƠN cho KHÁCH HÀNG (A5 portrait)
     ============================================================ */
  window.printOrderForCustomer = async function (code) {
    /* Lazy-load PRODUCT_IMAGES (3.8MB) nếu chưa có — chỉ khi user thực sự export PDF */
    if (window.loadProductImages && !window.PRODUCT_IMAGES) {
      window.toast && window.toast('⏳ Đang nạp ảnh SP cho PDF...', 'info');
      await window.loadProductImages();
    }
    const o = getOrder(code);
    if (!o) { window.toast && window.toast('Không tìm thấy đơn ' + code, 'warn'); return; }
    const c = getCust(o);
    const comp = getCompany();
    const items = o.items || [];
    const totalQty = items.reduce((s, it) => s + (+it.qty || 0), 0);
    const totalAmt = items.reduce((s, it) => s + (+it.total || 0), 0);

    const FAV = window.NSTT_FAVICON_DATAURL || '';
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Phiếu xác nhận đơn ${o.code}</title>
${FAV ? `<link rel="icon" type="image/svg+xml" href="${FAV}">` : ''}
<style>${SHARED_CSS}
  body{padding:14mm 12mm}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #1B5E20;padding-bottom:10px;margin-bottom:12px}
  .logo{display:flex;align-items:center;gap:9px}
  .logo .icon{width:42px;height:42px;border-radius:50%;background:#E8F5E2;display:grid;place-items:center;font-size:22px}
  .logo .txt h1{font-size:15px;color:#1B5E20;font-weight:800;letter-spacing:0.3px}
  .logo .txt .sub{font-size:9.5px;color:#475569;margin-top:1px}
  .doc-meta{text-align:right;font-size:10px;color:#6B7280}
  .doc-meta .num{font-size:14px;color:#1B5E20;font-weight:800;letter-spacing:0.3px;margin-bottom:2px}

  .title{text-align:center;font-size:18px;font-weight:800;color:#1B5E20;letter-spacing:1.5px;margin:8px 0 4px}
  .subtitle{text-align:center;font-size:10.5px;color:#6B7280;margin-bottom:14px;letter-spacing:0.5px}

  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;font-size:11.5px}
  .info-block{background:#FAFBFC;padding:9px 11px;border-radius:6px;border-left:3px solid #1B5E20}
  .info-block .lab{font-size:9px;color:#6B7280;text-transform:uppercase;letter-spacing:0.6px;font-weight:700;margin-bottom:3px}
  .info-block .val{font-weight:600;color:#1F2937;line-height:1.45}

  table.items{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:10px}
  table.items th{background:#1B5E20;color:#fff;padding:6px 7px;text-align:left;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:0.4px}
  table.items th.num{text-align:right}
  table.items td{padding:6px 7px;border-bottom:1px solid #E5E7EB;vertical-align:top}
  table.items td.num{text-align:right;font-variant-numeric:tabular-nums}
  table.items tr:nth-child(even) td{background:#FAFBFC}
  table.items tfoot td{font-weight:800;background:#F0FDF4;color:#1B5E20;padding:8px 7px;border-top:2px solid #1B5E20;font-size:11.5px}

  .totals{display:flex;justify-content:flex-end;margin-top:8px;margin-bottom:14px}
  .totals-box{background:#1B5E20;color:#fff;padding:8px 16px;border-radius:6px;text-align:right;min-width:200px}
  .totals-box .lab{font-size:9.5px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.9}
  .totals-box .val{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:1px}

  .debt-note{background:#FEF3C7;border-left:3px solid #D97706;padding:7px 11px;font-size:10.5px;border-radius:4px;margin-bottom:10px;color:#92400E}
  .bank-note{background:#EFF6FF;border-left:3px solid #1E40AF;padding:7px 11px;font-size:10px;border-radius:4px;margin-bottom:12px;color:#1E40AF}
  .bank-note b{color:#0F172A}

  .signatures{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:18px;text-align:center;font-size:11px}
  .signatures .sig-box .title{font-size:11.5px;color:#1F2937;font-weight:700;margin:0 0 60px;letter-spacing:0.3px}
  .signatures .sig-box .hint{font-size:8.5px;color:#9CA3AF;font-style:italic}

  .footer{margin-top:14px;padding-top:8px;border-top:1px dashed #D1D5DB;text-align:center;font-size:9px;color:#9CA3AF}
</style></head><body>
  <div class="header">
    <div class="logo">
      <div class="icon">🌱</div>
      <div class="txt">
        <h1>${comp.name.toUpperCase()}</h1>
        <div class="sub">${comp.addr}<br>☎ ${comp.phone} · ${comp.email || ''}${comp.tax?' · MST '+comp.tax:''}</div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="num">${o.code}</div>
      <div>Ngày đơn: <b>${o.date || ''}</b></div>
      <div>Ngày in: ${new Date().toLocaleString('vi-VN')}</div>
    </div>
  </div>

  <div class="title">PHIẾU XÁC NHẬN ĐƠN HÀNG</div>
  <div class="subtitle">(Bản dành cho khách hàng — lưu để đối chiếu)</div>

  <div class="info-grid">
    <div class="info-block">
      <div class="lab">👤 Khách hàng</div>
      <div class="val">
        ${c.name || o.custName}${c.code ? ` <span style="color:#6B7280;font-weight:500">(${c.code})</span>` : ''}<br>
        ${c.contact ? c.contact + ' · ' : ''}${c.phone || o.custPhone || '—'}<br>
        ${c.address || o.drop || '—'}
      </div>
    </div>
    <div class="info-block">
      <div class="lab">🛒 Thông tin đơn</div>
      <div class="val">
        NV phụ trách: <b>${o.staff || '—'}</b><br>
        Hình thức TT: <b>${o.payBy || 'COD'}</b><br>
        ${o.driverName ? 'Shipper: <b>'+o.driverName+'</b><br>' : ''}
        ${o.note ? 'Ghi chú: <i>'+o.note+'</i>' : ''}
      </div>
    </div>
  </div>

  ${(() => {
    const _products = window.STORE.get('products', window.PRODUCTS || []) || [];
    function _findProd(it) {
      if (it.id) return _products.find(x => x.id === it.id);
      const n = (it.name||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
      return _products.find(x => {
        const xn = (x.name||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
        return xn === n || xn.includes(n) || n.includes(xn);
      });
    }
    const _baseUrl = location.origin + location.pathname.replace(/\/pages\/[^\/]+$/, '/');
    function _fixImg(img) {
      if (!img) return '';
      if (img.startsWith('http') || img.startsWith('data:')) return img;
      if (img.startsWith('../')) return _baseUrl + img.replace(/^\.\.\//, '');
      return _baseUrl + img;
    }
    const _PH = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect fill="#F0FDF4" width="40" height="40" rx="5"/><text x="20" y="27" text-anchor="middle" font-family="Arial" font-size="22">🥬</text></svg>`);
    /* Ưu tiên PRODUCT_IMAGES embed (offline-safe, không cần fetch) */
    const _EMBED = window.PRODUCT_IMAGES || {};
    window._pdfGetImg = (it) => {
      const prod = _findProd(it);
      if (prod && _EMBED[prod.id]) return _EMBED[prod.id];
      if (prod && prod.img) return _fixImg(prod.img);
      return _PH;
    };
    window._pdfFindProd = _findProd;
    window._pdfFixImg = _fixImg;
    window._pdfPH = _PH;
    return '';
  })()}
  <table class="items">
    <thead><tr>
      <th style="width:24px">#</th>
      <th style="width:46px;text-align:center">Ảnh</th>
      <th>Mặt hàng</th>
      <th class="num" style="width:50px">SL</th>
      <th style="width:32px">ĐVT</th>
      <th class="num" style="width:75px">Đơn giá</th>
      <th class="num" style="width:90px">Thành tiền</th>
    </tr></thead>
    <tbody>
      ${items.map((it, i) => {
        const imgSrc = window._pdfGetImg(it);
        return `<tr>
          <td>${i + 1}</td>
          <td style="padding:3px;text-align:center"><img src="${imgSrc}" onerror="this.src='${window._pdfPH}'" style="width:38px;height:38px;object-fit:cover;border-radius:4px;border:1px solid #E5E7EB" alt="${it.name||''}"></td>
          <td>${it.name || ''}</td>
          <td class="num">${fmt(it.qty)}</td>
          <td>${it.unit || 'kg'}</td>
          <td class="num">${fmt(it.price)}</td>
          <td class="num"><b>${fmt(it.total)}</b></td>
        </tr>`;
      }).join('') || '<tr><td colspan="7" style="text-align:center;color:#9CA3AF;padding:14px">Chưa có mặt hàng</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">TỔNG ${items.length} mặt hàng</td>
        <td class="num">${fmt(totalQty)}</td>
        <td colspan="2"></td>
        <td class="num">${fmt(totalAmt)} ₫</td>
      </tr>
    </tfoot>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="lab">TỔNG THANH TOÁN</div>
      <div class="val">${fmt(o.cod || o.freight || totalAmt)} ₫</div>
    </div>
  </div>

  ${c.debt > 0 ? `<div class="debt-note">📉 <b>Công nợ hiện tại:</b> ${fmt(c.debt)} ₫${c.debtOverdue ? ' (trong đó <b>'+fmt(c.debtOverdue)+' ₫ quá hạn</b>)' : ''}</div>` : ''}

  ${comp.bank ? `<div class="bank-note">🏦 <b>Chuyển khoản:</b> ${comp.bank}<br>📝 Nội dung: <b>${o.code} - ${(c.name||o.custName).slice(0,30)}</b></div>` : ''}

  <div class="signatures">
    <div class="sig-box">
      <div class="title">ĐẠI DIỆN BÊN BÁN</div>
      <div class="hint">(ký, ghi rõ họ tên)</div>
    </div>
    <div class="sig-box">
      <div class="title">KHÁCH HÀNG XÁC NHẬN</div>
      <div class="hint">(ký, ghi rõ họ tên)</div>
    </div>
  </div>

  <div class="footer">
    Cảm ơn ${c.name || 'Quý khách'} đã tin tưởng Nông Sản Tuấn Tú Hà Nội 🌱<br>
    Mọi thắc mắc xin liên hệ Hotline ${comp.phone} hoặc ${comp.website}
  </div>

  <script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
</body></html>`;

    openPrintWindow(html, 'Phiếu xác nhận ' + o.code);
  };

  /* ============================================================
     TEMPLATE 2 — PHIẾU GIAO HÀNG cho SHIPPER (A5 portrait)
     Tối ưu cho cầm trên xe — font to, địa chỉ to, có ô tick
     ============================================================ */
  window.printOrderForShipper = async function (code) {
    if (window.loadProductImages && !window.PRODUCT_IMAGES) {
      window.toast && window.toast('⏳ Đang nạp ảnh SP cho PDF...', 'info');
      await window.loadProductImages();
    }
    const o = getOrder(code);
    if (!o) { window.toast && window.toast('Không tìm thấy đơn ' + code, 'warn'); return; }
    const c = getCust(o);
    const comp = getCompany();
    const items = o.items || [];
    const totalAmt = items.reduce((s, it) => s + (+it.total || 0), 0);
    const codAmt = o.cod || o.freight || totalAmt;
    const phone = c.phone || o.custPhone || '';

    const FAV2 = window.NSTT_FAVICON_DATAURL || '';
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Phiếu giao hàng ${o.code}</title>
${FAV2 ? `<link rel="icon" type="image/svg+xml" href="${FAV2}">` : ''}
<style>${SHARED_CSS}
  body{padding:8mm 7mm;font-size:14px}
  .header{display:flex;justify-content:space-between;align-items:center;background:#1B5E20;color:#fff;padding:8px 12px;border-radius:6px;margin-bottom:10px}
  .header h1{font-size:18px;font-weight:800;letter-spacing:1px}
  .header .code{font-family:'JetBrains Mono',monospace;font-size:14px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:5px}

  .qr-note{background:#FEF3C7;border:1px dashed #D97706;padding:5px 8px;border-radius:4px;font-size:10px;color:#92400E;text-align:center;margin-bottom:10px}

  .addr-box{background:#1B5E20;color:#fff;padding:14px 16px;border-radius:8px;margin-bottom:11px;text-align:center}
  .addr-box .lab{font-size:11px;text-transform:uppercase;letter-spacing:0.8px;opacity:0.85;font-weight:600}
  .addr-box .name{font-size:18px;font-weight:800;margin:4px 0 3px;line-height:1.25}
  .addr-box .addr{font-size:16px;font-weight:600;line-height:1.35;margin:6px 0}
  .addr-box .phone{display:inline-block;background:#fff;color:#1B5E20;padding:5px 14px;border-radius:99px;font-size:17px;font-weight:800;margin-top:5px;letter-spacing:0.5px}

  .meta-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;font-size:11px}
  .meta-cell{background:#F1F5F9;padding:7px 10px;border-radius:5px}
  .meta-cell .lab{font-size:9px;color:#475569;text-transform:uppercase;font-weight:700}
  .meta-cell .val{font-weight:700;color:#0F172A;margin-top:1px}

  .section-title{font-size:11px;font-weight:800;color:#1B5E20;text-transform:uppercase;letter-spacing:0.6px;margin:8px 0 5px;padding-bottom:3px;border-bottom:1.5px solid #1B5E20}

  table.items{width:100%;border-collapse:collapse;font-size:12px}
  table.items th{background:#F1F5F9;padding:6px 6px;text-align:left;font-weight:700;font-size:9.5px;color:#475569;text-transform:uppercase;letter-spacing:0.3px;border-bottom:2px solid #94A3B8}
  table.items th.num{text-align:right}
  table.items td{padding:7px 6px;border-bottom:1px solid #E5E7EB;vertical-align:middle}
  table.items td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .tick-box{display:inline-block;width:16px;height:16px;border:2px solid #1B5E20;border-radius:3px;vertical-align:middle}
  .item-name{font-weight:600;font-size:13px}
  .item-qty{font-weight:800;color:#1B5E20;font-size:14px}

  .cod-box{margin-top:10px;background:#FEF3C7;border:3px solid #D97706;border-radius:7px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center}
  .cod-box .lab{font-size:11px;color:#92400E;text-transform:uppercase;letter-spacing:0.6px;font-weight:800}
  .cod-box .val{font-size:24px;font-weight:900;color:#92400E;font-variant-numeric:tabular-nums}
  .cod-box.cod-paid{background:#DCFCE7;border-color:#16A34A}
  .cod-box.cod-paid .lab,.cod-box.cod-paid .val{color:#15803D}

  .note-box{margin-top:8px;background:#EFF6FF;border-left:4px solid #1E40AF;padding:7px 12px;border-radius:4px;font-size:11px;color:#1E40AF}
  .note-box b{color:#0F172A}

  .pod-area{margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .pod-cell{border:2px dashed #94A3B8;border-radius:6px;padding:8px;text-align:center;background:#FAFBFC}
  .pod-cell .lab{font-size:9.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.4px}
  .pod-cell .signbox{height:60px;display:flex;align-items:flex-end;justify-content:center;font-size:9px;color:#9CA3AF;font-style:italic;padding-bottom:4px}

  .tg-cmd{margin-top:9px;background:#0F172A;color:#A7F3D0;padding:6px 10px;border-radius:5px;font-family:monospace;font-size:10px;text-align:center}
  .tg-cmd b{color:#FCD34D}

  .footer{margin-top:8px;text-align:center;font-size:9px;color:#9CA3AF;padding-top:6px;border-top:1px dashed #D1D5DB}
</style></head><body>
  <div class="header">
    <h1>🛵 PHIẾU GIAO HÀNG</h1>
    <div class="code">${o.code}</div>
  </div>

  <div class="qr-note">💡 Sau khi giao xong, gửi <b>/giao ${o.code}</b> trên Telegram bot để chốt đơn</div>

  <div class="addr-box">
    <div class="lab">🎯 GIAO TỚI</div>
    <div class="name">${c.name || o.custName}</div>
    <div class="addr">${c.address || o.drop || '—'}</div>
    <div class="phone">📞 ${phone || '—'}</div>
  </div>

  <div class="meta-row">
    <div class="meta-cell">
      <div class="lab">Ngày giao</div>
      <div class="val">${o.date}</div>
    </div>
    <div class="meta-cell">
      <div class="lab">Shipper</div>
      <div class="val">${o.driverName || '...........................'}</div>
    </div>
  </div>

  <div class="section-title">📦 Danh sách hàng giao (${items.length} mặt)</div>
  <table class="items">
    <thead><tr>
      <th style="width:24px">✓</th>
      <th>Mặt hàng</th>
      <th class="num" style="width:55px">SL</th>
      <th style="width:32px">ĐVT</th>
    </tr></thead>
    <tbody>
      ${items.map(it => `<tr>
        <td><span class="tick-box"></span></td>
        <td><div class="item-name">${it.name || ''}</div></td>
        <td class="num"><span class="item-qty">${fmt(it.qty)}</span></td>
        <td>${it.unit || 'kg'}</td>
      </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:#9CA3AF;padding:14px">Chưa có mặt hàng</td></tr>'}
    </tbody>
  </table>

  <div class="cod-box ${(o.payBy && /chuyển khoản|tk|đã thu|tt trước/i.test(o.payBy)) ? 'cod-paid' : ''}">
    <div>
      <div class="lab">💰 ${(o.payBy && /chuyển khoản|tk|đã thu|tt trước/i.test(o.payBy)) ? 'Đã thanh toán (KHÔNG thu)' : 'Thu COD từ khách'}</div>
      <div style="font-size:10px;color:inherit;opacity:0.7;font-weight:600;margin-top:2px">${o.payBy || 'COD - tiền mặt'}</div>
    </div>
    <div class="val">${fmt(codAmt)} ₫</div>
  </div>

  ${o.note ? `<div class="note-box">📝 <b>Ghi chú đặc biệt:</b> ${o.note}</div>` : ''}

  <div class="pod-area">
    <div class="pod-cell">
      <div class="lab">📷 Ảnh POD (chụp lúc giao)</div>
      <div class="signbox">— chụp dán vào đây / gửi qua TG —</div>
    </div>
    <div class="pod-cell">
      <div class="lab">✍ Chữ ký nhận hàng</div>
      <div class="signbox">— KH ký xác nhận —</div>
    </div>
  </div>

  <div class="tg-cmd">📱 Telegram bot: gõ <b>/giao ${o.code}</b> sau khi xong · <b>/hoan ${o.code} lý do</b> nếu KH vắng</div>

  <div class="footer">
    Phiếu in từ CRM Tuấn Tú Farm · ${new Date().toLocaleString('vi-VN')} · ${comp.phone}
  </div>

  <script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
</body></html>`;

    openPrintWindow(html, 'Phiếu giao ' + o.code);
  };

  /* ============================================================
     printOrder() — wrapper: hỏi user chọn 1 trong 2 template
     ============================================================ */
  window.printOrder = function (code) {
    const o = getOrder(code);
    if (!o) { window.toast && window.toast('Không tìm thấy đơn ' + code, 'warn'); return; }
    if (!window.openModal) {
      /* Fallback nếu chưa load modal */
      window.printOrderForCustomer(code);
      return;
    }
    window.openModal('🖨 In phiếu đơn ' + code, `
      <div style="background:#EFF6FF;color:#1E40AF;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:14px;line-height:1.55">
        💡 <b>Có 2 phiếu khác nhau cho 2 đối tượng</b> — chọn loại phù hợp:
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <button onclick="window.closeModal();window.printOrderForCustomer('${code}')" style="background:#fff;border:2px solid #1B5E20;border-radius:10px;padding:18px;cursor:pointer;text-align:left;line-height:1.4">
          <div style="font-size:26px">📄</div>
          <div style="font-weight:800;color:#1B5E20;margin-top:6px;font-size:14px">Phiếu xác nhận đơn</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:4px">Cho <b>KHÁCH HÀNG</b><br>· Đơn giá + tổng tiền<br>· Có công nợ + TK ngân hàng<br>· Ô ký 2 bên</div>
        </button>
        <button onclick="window.closeModal();window.printOrderForShipper('${code}')" style="background:#fff;border:2px solid #D97706;border-radius:10px;padding:18px;cursor:pointer;text-align:left;line-height:1.4">
          <div style="font-size:26px">🛵</div>
          <div style="font-weight:800;color:#D97706;margin-top:6px;font-size:14px">Phiếu giao cho Shipper</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:4px">Cho <b>SHIPPER</b><br>· Địa chỉ + SĐT to<br>· Tick mặt hàng<br>· Khung COD to · Ô POD</div>
        </button>
      </div>
      <div style="margin-top:14px;padding:9px 12px;background:#FEF3C7;border-radius:7px;font-size:11.5px;color:#92400E">
        💾 <b>Lưu PDF:</b> sau khi bấm In → trong hộp Print chọn <b>"Save as PDF"</b> hoặc <b>"Microsoft Print to PDF"</b>.
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-ghost" onclick="window.printBothOrderPdfs('${code}')">📑 In CẢ 2 phiếu</button>`,
      width: '520px',
    });
  };

  /* In cả 2 phiếu trong 2 tab — tiện khi cần cả 2 */
  window.printBothOrderPdfs = function (code) {
    window.closeModal && window.closeModal();
    window.printOrderForCustomer(code);
    setTimeout(() => window.printOrderForShipper(code), 600);
  };

  /* Mở popup window in */
  function openPrintWindow(html, title) {
    const w = window.open('', '_blank', 'width=600,height=900');
    if (!w) {
      window.toast && window.toast('Trình duyệt chặn popup — cho phép popup rồi thử lại', 'warn');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.document.title = title || 'Print';
    if (window.audit) window.audit.log('order.print', title);
  }

})();
