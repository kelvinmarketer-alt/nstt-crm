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
    return list.find(c => c.id === (o.cust||o.custId) || c.code === (o.cust||o.custId)) || { name: o.custName, phone: o.custPhone, address: o.drop };
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
  window.printOrderForCustomer = async function (code, win) {
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
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #008000;padding-bottom:10px;margin-bottom:12px}
  .logo{display:flex;align-items:center;gap:9px}
  .logo .icon{width:42px;height:42px;border-radius:50%;background:#E8F5E2;display:grid;place-items:center;font-size:22px}
  .logo .txt h1{font-size:15px;color:#008000;font-weight:800;letter-spacing:0.3px}
  .logo .txt .sub{font-size:9.5px;color:#475569;margin-top:1px}
  .doc-meta{text-align:right;font-size:10px;color:#6B7280}
  .doc-meta .num{font-size:14px;color:#008000;font-weight:800;letter-spacing:0.3px;margin-bottom:2px}

  .title{text-align:center;font-size:18px;font-weight:800;color:#008000;letter-spacing:1.5px;margin:8px 0 4px}
  .subtitle{text-align:center;font-size:10.5px;color:#6B7280;margin-bottom:14px;letter-spacing:0.5px}

  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;font-size:11.5px}
  .info-block{background:#FAFBFC;padding:9px 11px;border-radius:6px;border-left:3px solid #008000}
  .info-block .lab{font-size:9px;color:#6B7280;text-transform:uppercase;letter-spacing:0.6px;font-weight:700;margin-bottom:3px}
  .info-block .val{font-weight:600;color:#1F2937;line-height:1.45}

  table.items{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:10px}
  table.items th{background:#008000;color:#fff;padding:6px 7px;text-align:left;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:0.4px}
  table.items th.num{text-align:right}
  table.items td{padding:6px 7px;border-bottom:1px solid #E5E7EB;vertical-align:top}
  table.items td.num{text-align:right;font-variant-numeric:tabular-nums}
  table.items tr:nth-child(even) td{background:#FAFBFC}
  table.items tfoot td{font-weight:800;background:#F0FDF4;color:#008000;padding:8px 7px;border-top:2px solid #008000;font-size:11.5px}

  .totals{display:flex;justify-content:flex-end;margin-top:8px;margin-bottom:14px}
  .totals-box{background:#008000;color:#fff;padding:8px 16px;border-radius:6px;text-align:right;min-width:200px}
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
    /* URL-encode thay vì btoa: btoa vỡ với ký tự ngoài Latin1 (emoji 🥬) → trước đây kẹt cả nút in */
    const _PH = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect fill="#F0FDF4" width="40" height="40" rx="5"/><text x="20" y="27" text-anchor="middle" font-family="Arial" font-size="22">🥬</text></svg>');
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

    window.openReceiptImageWindow(html, 'Phiếu xác nhận ' + o.code, 'phieu-xac-nhan-' + o.code, win);
  };

  /* ============================================================
     TEMPLATE 2 — PHIẾU GIAO HÀNG cho SHIPPER (A5 portrait)
     Tối ưu cho cầm trên xe — font to, địa chỉ to, có ô tick
     ============================================================ */
  window.printOrderForShipper = async function (code, win) {
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
  .header{display:flex;justify-content:space-between;align-items:center;background:#008000;color:#fff;padding:8px 12px;border-radius:6px;margin-bottom:10px}
  .header h1{font-size:18px;font-weight:800;letter-spacing:1px}
  .header .code{font-family:'JetBrains Mono',monospace;font-size:14px;background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:5px}

  .qr-note{background:#FEF3C7;border:1px dashed #D97706;padding:5px 8px;border-radius:4px;font-size:10px;color:#92400E;text-align:center;margin-bottom:10px}

  .addr-box{background:#008000;color:#fff;padding:14px 16px;border-radius:8px;margin-bottom:11px;text-align:center}
  .addr-box .lab{font-size:11px;text-transform:uppercase;letter-spacing:0.8px;opacity:0.85;font-weight:600}
  .addr-box .name{font-size:18px;font-weight:800;margin:4px 0 3px;line-height:1.25}
  .addr-box .addr{font-size:16px;font-weight:600;line-height:1.35;margin:6px 0}
  .addr-box .phone{display:inline-block;background:#fff;color:#008000;padding:5px 14px;border-radius:99px;font-size:17px;font-weight:800;margin-top:5px;letter-spacing:0.5px}

  .meta-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;font-size:11px}
  .meta-cell{background:#F1F5F9;padding:7px 10px;border-radius:5px}
  .meta-cell .lab{font-size:9px;color:#475569;text-transform:uppercase;font-weight:700}
  .meta-cell .val{font-weight:700;color:#0F172A;margin-top:1px}

  .section-title{font-size:11px;font-weight:800;color:#008000;text-transform:uppercase;letter-spacing:0.6px;margin:8px 0 5px;padding-bottom:3px;border-bottom:1.5px solid #008000}

  table.items{width:100%;border-collapse:collapse;font-size:12px}
  table.items th{background:#F1F5F9;padding:6px 6px;text-align:left;font-weight:700;font-size:9.5px;color:#475569;text-transform:uppercase;letter-spacing:0.3px;border-bottom:2px solid #94A3B8}
  table.items th.num{text-align:right}
  table.items td{padding:7px 6px;border-bottom:1px solid #E5E7EB;vertical-align:middle}
  table.items td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  .tick-box{display:inline-block;width:16px;height:16px;border:2px solid #008000;border-radius:3px;vertical-align:middle}
  .item-name{font-weight:600;font-size:13px}
  .item-qty{font-weight:800;color:#008000;font-size:14px}

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

    window.openReceiptImageWindow(html, 'Phiếu giao ' + o.code, 'phieu-giao-' + o.code, win);
  };

  /* ============================================================
     printOrder() — wrapper: hỏi user chọn 1 trong 2 template
     ============================================================ */
  window.printOrder = function (code) {
    const o = getOrder(code);
    if (!o) { window.toast && window.toast('Không tìm thấy đơn ' + code, 'warn'); return; }
    if (!window.openModal) { window.printOrderForCustomer(code); return; }
    const row = (id, checked, icon, color, title, desc) => `
      <label style="display:flex;align-items:flex-start;gap:10px;border:1px solid var(--line);border-radius:9px;padding:11px 12px;margin-bottom:8px;cursor:pointer">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="margin-top:3px;width:16px;height:16px;accent-color:${color}">
        <div style="flex:1"><div style="font-weight:700;color:${color};font-size:13px">${icon} ${title}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${desc}</div></div>
      </label>`;
    window.openModal('🖨 In phiếu đơn ' + code, `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">Tick (các) phiếu cần in theo giai đoạn — in 1 cái hoặc cả 3 tuỳ ý:</div>
      ${row('prt_cust', true,  '📄', '#008000', 'Phiếu xác nhận đơn (Khách)', 'Đơn giá + tổng tiền · công nợ · TK ngân hàng · ô ký 2 bên')}
      ${row('prt_ship', false, '🛵', '#D97706', 'Phiếu giao cho Shipper', 'Địa chỉ + SĐT to · tick mặt hàng · khung COD · ô POD')}
      ${row('prt_wh',   false, '🧾', '#C00000', 'Phiếu báo hàng / xuất kho (Kho)', 'Mặt hàng + số lượng cho Kho chuẩn bị — không có giá')}
      <div style="margin-top:6px;padding:11px 12px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:9px">
        <div style="font-size:12px;color:#15803D;font-weight:600;margin-bottom:6px">📤 Bắt đầu quy trình Kho</div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">Gửi phiếu báo hàng vào nhóm Kho (Telegram) rồi chuyển thẳng sang <b>Gom hàng → NCC</b> để Kho làm tiếp.</div>
        <button class="btn btn-primary btn-sm" onclick="window._sendBaoHangAndGo('${code}')">📤 Gửi Kho + sang Gom hàng</button>
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-primary" onclick="window._printSelectedPhieu('${code}')">🖨 In phiếu đã chọn</button>`,
      width: '440px',
    });
  };

  /* In các phiếu được tick — tuần tự (mỗi phiếu 1 hộp in) */
  window._printSelectedPhieu = function (code) {
    const seq = [];
    if (document.getElementById('prt_cust')?.checked) seq.push(() => window.printOrderForCustomer(code));
    if (document.getElementById('prt_ship')?.checked) seq.push(() => window.printOrderForShipper(code));
    if (document.getElementById('prt_wh')?.checked) seq.push(() => window.printDeliveryNote && window.printDeliveryNote(code));
    if (!seq.length) { window.toast && window.toast('Tick ít nhất 1 phiếu để in', 'warn'); return; }
    window.closeModal && window.closeModal();
    seq.forEach((fn, i) => setTimeout(fn, i * 800));
  };

  /* Gửi phiếu báo hàng cho Kho (Telegram) → chuyển sang trang Gom hàng */
  window._sendBaoHangAndGo = function (code) {
    window.closeModal && window.closeModal();
    const go = () => { window.location.href = 'procurement.html'; };
    if (window.sendBaoHangTelegram) {
      window.sendBaoHangTelegram(code, false)
        .then(r => { if (r && r.ok) window.toast && window.toast('📋 Đã gửi Kho — chuyển sang Gom hàng…', 'success'); setTimeout(go, 800); })
        .catch(() => setTimeout(go, 300));
    } else { window.toast && window.toast('Chuyển sang Gom hàng…', 'info'); setTimeout(go, 300); }
  };
  /* tương thích ngược (cũ gọi printBothOrderPdfs) */
  window.printBothOrderPdfs = function (code) { window.closeModal && window.closeModal(); window.printOrderForCustomer(code); setTimeout(() => window.printOrderForShipper(code), 700); };

  /* Mở popup window in */
  /* In qua IFRAME cùng origin — không cần cho phép popup (fix "chưa hoạt động") */
  function openPrintWindow(html, title) {
    /* bỏ script auto-print có sẵn trong template để tự gọi print sau khi ảnh load */
    html = html.replace(/<script>[\s\S]*?window\.print\(\)[\s\S]*?<\/script>/gi, '');
    const old = document.getElementById('nsttPrintFrame'); if (old) old.remove();
    const f = document.createElement('iframe');
    f.id = 'nsttPrintFrame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const fire = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} };
    /* đợi ảnh trong phiếu load xong rồi mới in */
    const imgs = [...doc.images];
    if (imgs.length) {
      let left = imgs.filter(im => !im.complete).length;
      if (!left) setTimeout(fire, 250);
      else imgs.forEach(im => { if (!im.complete) { const done = () => { if (--left <= 0) setTimeout(fire, 150); }; im.onload = done; im.onerror = done; } });
    } else setTimeout(fire, 250);
    window.toast && window.toast('🖨 Mở hộp in — bỏ tick "Headers and footers" để ẩn ngày/URL', 'info');
    if (window.audit) window.audit.log('order.print', title);
  }

  /* === XEM & COPY ẢNH phiếu (thay cho in PDF) — dán thẳng vào Zalo/Messenger gửi khách ===
     Mở popup hiện phiếu + thanh nút [Copy ảnh][Tải ảnh][In][Đóng]. Dùng html2canvas (như cong-nợ). */
  window.openReceiptImageWindow = function (fullHtml, title, fileName, win) {
    /* win = cửa sổ đã mở SẴN trong cú click (giữ user-gesture, né chặn popup); nếu không có thì mở mới */
    const w = win || window.open('', '_blank', 'width=960,height=1000');
    if (!w) { window.toast && window.toast('Trình duyệt CHẶN popup — cho phép popup để copy ảnh phiếu', 'warn'); return; }
    /* bỏ auto-print có sẵn trong template (nếu có) */
    let html = String(fullHtml).replace(/<script>[\s\S]*?window\.print\(\)[\s\S]*?<\/script>/gi, '');
    const fn = String(fileName || 'phieu').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'phieu';
    /* Khổ giấy DỌC theo @page trong template (A5 148mm / A4 210mm) → khoá bề rộng thân phiếu
       để MÀN HÌNH + ẢNH nhìn đúng dạng dọc như in PDF (không bị kéo ngang đầy cửa sổ). */
    const pageW = /size\s*:\s*a5/i.test(html) ? '148mm' : '210mm';
    const inject = `
      <style>
        #rcpBar{position:sticky;top:0;z-index:99999;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:10px;background:#0f172a;box-shadow:0 2px 10px rgba(0,0,0,.28)}
        #rcpBar button{border:0;border-radius:8px;padding:9px 15px;font-size:13px;font-weight:700;cursor:pointer;color:#fff}
        .noprint{display:none!important}   /* ẩn nút In/Đóng có sẵn trong template — #rcpBar đã thay thế */
        @media screen{ html{background:#e5e7eb} body{width:${pageW}!important;margin:0 auto!important;box-sizing:border-box} }
        @media print{#rcpBar,.rcp-no-cap{display:none!important} html{background:#fff} body{width:auto!important;margin:0!important}}
      </style>
      <div id="rcpBar" class="rcp-no-cap">
        <button style="background:#16a34a" onclick="rcpCopy()">📸 Copy ảnh gửi khách</button>
        <button style="background:#0ea5e9" onclick="rcpDl()">⬇ Tải ảnh .png</button>
        <button style="background:#64748b" onclick="window.print()">🖨 In giấy</button>
        <button style="background:#334155" onclick="window.close()">✕ Đóng</button>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script>
      <script>
        var _fn=${JSON.stringify(fn)};
        async function _snap(){
          if(!window.html2canvas){ alert('Thư viện ảnh đang tải, đợi 1-2 giây rồi bấm lại.'); return null; }
          /* scale 3 = NÉT như in PDF; height=scrollHeight → cắt đúng nội dung, không dư trắng */
          var H = Math.ceil(document.body.scrollHeight);
          return await window.html2canvas(document.body,{scale:3,useCORS:true,backgroundColor:'#ffffff',logging:false,height:H,windowHeight:H,
            ignoreElements:function(el){ return el.id==='rcpBar' || (el.classList&&(el.classList.contains('rcp-no-cap')||el.classList.contains('noprint'))); }});
        }
        function _dl(b){ var a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=_fn+'.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href)},3000); }
        async function rcpCopy(){ try{ var cv=await _snap(); if(!cv)return; cv.toBlob(async function(b){ try{ await navigator.clipboard.write([new ClipboardItem({'image/png':b})]); alert('✓ Đã copy ẢNH phiếu — dán vào Zalo/Messenger gửi khách (Ctrl+V / Cmd+V).'); }catch(e){ _dl(b); alert('Trình duyệt không cho copy trực tiếp → đã TẢI ảnh .png về máy. Gửi file ảnh đó cho khách.'); } },'image/png'); }catch(e){ alert('Lỗi tạo ảnh: '+(e&&e.message||e)); } }
        async function rcpDl(){ try{ var cv=await _snap(); if(!cv)return; cv.toBlob(function(b){ _dl(b); },'image/png'); }catch(e){ alert('Lỗi tạo ảnh: '+(e&&e.message||e)); } }
      <\/script>`;
    if (/<body[^>]*>/i.test(html)) html = html.replace(/(<body[^>]*>)/i, '$1' + inject);
    else html = inject + html;
    w.document.open(); w.document.write(html); w.document.close();
    window.toast && window.toast('📸 Mở phiếu — bấm "Copy ảnh gửi khách" rồi dán vào Zalo', 'info');
    if (window.audit) window.audit.log('order.receiptImage', title);
  };

  /* === COPY ẢNH TRỰC TIẾP vào clipboard (1 CLICK, không mở popup) ===
     Render phiếu trong iframe ẩn + html2canvas → clipboard.write dùng ClipboardItem(Promise)
     để GIỮ đúng cú click (né lỗi "cần thao tác người dùng"). Không hỗ trợ → trả unsupported để mở popup. */
  window.copyReceiptImageDirect = function (fullHtml, fileName) {
    if (!(navigator.clipboard && window.ClipboardItem)) return { unsupported: true };
    window.toast && window.toast('📸 Đang tạo ảnh phiếu…', 'info');
    const pageW = /size\s*:\s*a5/i.test(fullHtml) ? '148mm' : '210mm';
    let html = String(fullHtml).replace(/<script>[\s\S]*?window\.print\(\)[\s\S]*?<\/script>/gi, '');
    const inj = `
      <style>.noprint{display:none!important} html,body{background:#fff!important} body{width:${pageW}!important;margin:0!important;box-sizing:border-box}</style>
      <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script>
      <script>
        window.__rcpBlob = (async function(){
          await new Promise(function(r){ if(document.readyState==='complete')r(); else window.addEventListener('load',r); });
          for(var i=0;i<80 && !window.html2canvas;i++){ await new Promise(function(r){setTimeout(r,60)}); }
          if(!window.html2canvas) throw new Error('html2canvas chưa tải');
          /* CẮT đúng chiều cao NỘI DUNG (không lấy cả chiều cao khung ẩn → hết khoảng trắng thừa) */
          var H = Math.ceil(document.body.scrollHeight);
          var cv = await window.html2canvas(document.body,{scale:3,useCORS:true,backgroundColor:'#ffffff',logging:false,height:H,windowHeight:H});
          return await new Promise(function(res){ cv.toBlob(res,'image/png'); });
        })();
      <\/script>`;
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, inj + '</body>') : (html + inj);

    const ifr = document.createElement('iframe');
    ifr.setAttribute('aria-hidden', 'true');
    /* Khung rộng ĐÚNG khổ giấy (210mm/148mm) → phiếu lấp đầy, không lệch trái, không dư mép phải */
    ifr.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + pageW + ';height:2200px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(ifr);
    const cleanup = () => setTimeout(() => { try { ifr.remove(); } catch (e) {} }, 300);

    const blobPromise = new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout tạo ảnh')), 15000);
      ifr.onload = async () => {
        try {
          const w = ifr.contentWindow;
          let n = 0; while (!w.__rcpBlob && n++ < 120) await new Promise(r => setTimeout(r, 60));
          if (!w.__rcpBlob) throw new Error('không render được');
          const blob = await w.__rcpBlob;
          clearTimeout(to); resolve(blob);
        } catch (e) { clearTimeout(to); reject(e); }
      };
    });
    try { ifr.srcdoc = html; } catch (e) { ifr.remove(); return { unsupported: true }; }

    navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })])
      .then(() => { window.toast && window.toast('✅ Đã COPY ảnh phiếu — dán vào Zalo/Messenger (Ctrl/Cmd+V)', 'success'); })
      .catch(() => {
        /* clipboard bị chặn → tải ảnh về máy để vẫn gửi được */
        blobPromise.then(b => {
          const a = document.createElement('a'); a.href = URL.createObjectURL(b);
          a.download = (fileName || 'phieu') + '.png'; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 3000);
          window.toast && window.toast('Clipboard bị chặn → đã TẢI ảnh .png về máy', 'info');
        }).catch(() => window.toast && window.toast('Lỗi tạo ảnh phiếu — thử nút 🖨', 'warn'));
      })
      .finally(cleanup);
    if (window.audit) window.audit.log('order.receiptCopy', fileName || '');
    return { ok: true };
  };

})();
