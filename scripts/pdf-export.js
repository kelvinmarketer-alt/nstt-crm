/* =========================================================
   PDF Export
   ─────────────────────────────────────────────────────────
   Dùng window.print() + style print riêng để xuất PDF
   (Browser → "Save as PDF" — không cần lib).

   Cho phép xuất:
   - Báo cáo tổng quan DN
   - Báo cáo lợi nhuận
   - Phiếu giao hàng (đã có sẵn ở orders.js)
   - Báo giá (đã có sẵn ở quotes.js)
   ========================================================= */
(function () {
  if (!document.getElementById('pdfExportCSS')) {
    const s = document.createElement('style');
    s.id = 'pdfExportCSS';
    s.textContent = `
      @media print {
        .sidebar, .topbar, #aiChatBubble, .help-tip, .undo-toast,
        .rpt-tabs, button:not(.print-keep), .ob-overlay, .ob-card { display: none !important; }
        .main { margin-left: 0 !important; padding: 0 !important; }
        body { background: white !important; }
        .panel, .ik-kpi, .kpi {
          break-inside: avoid;
          border-color: #ccc !important;
          box-shadow: none !important;
        }
        h1 { font-size: 18pt !important; color: #1B5E20 !important; }
        h2, h3 { color: #333 !important; }
        .print-header {
          display: block !important;
          padding: 16px 0;
          border-bottom: 2px solid #1B5E20;
          margin-bottom: 18px;
        }
        .print-header h1 { margin: 0; color: #1B5E20 !important; }
        .print-footer {
          display: block !important;
          position: fixed; bottom: 10mm; left: 0; right: 0;
          text-align: center;
          font-size: 10px; color: #999;
          border-top: 1px solid #eee; padding-top: 6px;
        }
      }
      .print-header, .print-footer { display: none; }
    `;
    document.head.appendChild(s);
  }

  /* Inject print header + footer khi mở print */
  function injectPrintFurniture() {
    if (!document.querySelector('.print-header')) {
      const h = document.createElement('div');
      h.className = 'print-header';
      h.innerHTML = `
        <h1 style="margin:0">NÔNG SẢN TUẤN TÚ HÀ NỘI</h1>
        <div style="font-size:11px;color:#666;margin-top:4px">
          nongsantuantuhanoi.com · Hotline: 0912 345 678 · ${new Date().toLocaleString('vi-VN')}
        </div>
      `;
      document.querySelector('.main')?.prepend(h);
    }
    if (!document.querySelector('.print-footer')) {
      const f = document.createElement('div');
      f.className = 'print-footer';
      f.innerHTML = `Trang in từ CRM Nông Sản Tuấn Tú · ${new Date().toLocaleDateString('vi-VN')}`;
      document.body.appendChild(f);
    }
  }

  window.exportPDF = function () {
    injectPrintFurniture();
    setTimeout(() => window.print(), 200);
  };

  /* Auto-add nút xuất PDF vào trang Reports */
  setTimeout(() => {
    if (location.pathname.includes('reports.html')) {
      const head = document.querySelector('.main > div:first-child');
      if (head && !document.getElementById('exportPdfBtn')) {
        const b = document.createElement('button');
        b.id = 'exportPdfBtn';
        b.className = 'btn btn-ghost print-keep';
        b.innerHTML = '🖨 Xuất PDF';
        b.style.marginLeft = '8px';
        b.title = 'Xuất báo cáo ra PDF (browser print dialog)';
        b.onclick = window.exportPDF;
        head.appendChild(b);
      }
    }
  }, 1000);

})();
