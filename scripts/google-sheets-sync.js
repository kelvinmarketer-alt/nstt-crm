/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Google Sheets Sync
   ─────────────────────────────────────────────────────────
   POST data lên Google Apps Script Webhook (user paste URL ở Settings).
   Apps Script append vào Sheet → kế toán xem online không cần đăng nhập app.

   4 sheets được tạo tự động:
   - Orders     : mã đơn, ngày, KH, hàng, tiền, COD, shipper, status
   - Customers  : KH, SĐT, công nợ, doanh thu
   - CashEntries: ngày, loại, số tiền, mô tả, NV
   - Invoices   : số HĐ, ngày, KH, MST, tiền, VAT, status

   Trigger:
   - 'realtime': mỗi khi STORE thay đổi → debounce 5s rồi push
   - 'hourly':   mỗi giờ
   - 'daily':    23:00 mỗi ngày
   - 'manual':   user bấm nút
   ========================================================= */
(function () {
  if (!window.STORE) { setTimeout(arguments.callee, 100); return; }
  if (window._gsheetsSyncReady) return;
  window._gsheetsSyncReady = true;

  let _pushTimer = null;

  function getCfg() { return window.STORE.get('int_google-sheets', {}) || {}; }

  /* === Build row data từ STORE === */
  function buildOrdersRows() {
    return (window.STORE.get('orders', []) || []).map(o => ({
      'Mã đơn': o.code,
      'Ngày': o.date,
      'Khách hàng': o.custName || '',
      'SĐT KH': o.custPhone || '',
      'Địa chỉ giao': o.drop || '',
      'Hàng hóa': o.goods || (o.items||[]).map(it => it.name).join('; '),
      'Số lượng': o.qty || 0,
      'Đơn vị': o.unit || 'kg',
      'Tiền hàng (₫)': o.freight || 0,
      'COD (₫)': o.cod || 0,
      'Thanh toán': o.payBy || '',
      'Shipper': o.driverName || '',
      'Trạng thái': o.status || '',
      'NV phụ trách': o.staff || '',
    }));
  }

  function buildCustomersRows() {
    return (window.STORE.get('customers', []) || []).map(c => ({
      'Mã KH': c.code || c.id,
      'Tên KH': c.name,
      'Loại': c.type || '',
      'Nhóm': c.group || '',
      'SĐT': c.phone || '',
      'Email': c.email || '',
      'Địa chỉ': c.address || '',
      'NV phụ trách': c.staffOwner || '',
      'Σ đơn': c.orders || 0,
      'Σ doanh thu (₫)': c.revenue || 0,
      'Công nợ (₫)': c.debt || 0,
      'Quá hạn (₫)': c.debtOverdue || 0,
      'Lần cuối đặt': c.lastOrder || '',
      'Active': c.active === false ? 'Tắt' : 'Bật',
    }));
  }

  function buildCashEntriesRows() {
    return (window.STORE.get('cashEntries', []) || []).map(e => ({
      'Số phiếu': e.no,
      'Ngày': e.date,
      'Loại': e.type === 'in' ? 'Thu' : e.type === 'out' ? 'Chi' : e.type,
      'Đối tác': e.party || '',
      'Tài khoản': e.account || '',
      'Số tiền (₫)': e.amount || 0,
      'Mô tả': e.desc || e.description || '',
      'NV lập phiếu': e.staff || '',
      'Đơn liên quan': e.relatedOrder || '',
      'HĐ liên quan': e.relatedInvoice || '',
    }));
  }

  function buildInvoicesRows() {
    return (window.STORE.get('invoices', []) || []).map(i => ({
      'Số HĐ': i.no,
      'Ngày': i.date,
      'Khách hàng': i.cust || '',
      'MST': i.tax || '',
      'Tiền hàng (₫)': i.net || 0,
      'VAT (₫)': i.vat || 0,
      'Tổng (₫)': (i.net||0) + (i.vat||0),
      'Trạng thái': i.status || '',
      'Ngày TT': i.paidDate || '',
      'CQT Code': i.cqtCode || '',
      'Đơn liên quan': i.relatedOrder || '',
    }));
  }

  /* === Push 1 sheet ===
     Dùng Content-Type 'text/plain' để tránh CORS preflight.
     Apps Script ContentService trả về JSON với CORS headers OK.
     KHÔNG dùng mode:'no-cors' → đọc response để báo lỗi rõ ràng. */
  async function pushSheet(sheetName, rows) {
    const cfg = getCfg();
    if (!cfg.webhookUrl) throw new Error('Chưa cấu hình webhook URL');
    if (!rows.length) return { ok: true, skip: true };
    try {
      const res = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ sheet: sheetName, rows, mode: 'replace' }),
        redirect: 'follow',
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
      }
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch (e) {
        /* Trả về HTML thay vì JSON → Apps Script chưa deploy đúng */
        if (text.includes('<html') || text.includes('Sign in')) {
          return { ok: false, error: 'Apps Script chưa deploy với Access "Anyone" — kiểm tra Settings' };
        }
        return { ok: false, error: 'Response không phải JSON: ' + text.slice(0, 100) };
      }
      if (json.ok === false) return { ok: false, error: json.error || 'unknown' };
      return { ok: true, count: rows.length, ts: json.ts };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error' };
    }
  }

  /* === Push tất cả 4 sheets === */
  window.gsheetsSyncAll = async function () {
    const cfg = getCfg();
    if (!cfg.enabled) {
      window.toast?.('Google Sheets sync đang TẮT — bật trong Settings', 'warn');
      return;
    }
    if (!cfg.webhookUrl) {
      window.toast?.('Chưa nhập Apps Script Web App URL', 'warn');
      return;
    }
    window.toast?.('⏳ Đang đồng bộ 4 sheets...', 'info');
    const sheets = [
      { name: 'Orders', rows: buildOrdersRows() },
      { name: 'Customers', rows: buildCustomersRows() },
      { name: 'CashEntries', rows: buildCashEntriesRows() },
      { name: 'Invoices', rows: buildInvoicesRows() },
    ];
    const results = await Promise.all(sheets.map(s => pushSheet(s.name, s.rows)));
    const failures = results.filter(r => !r.ok);
    const total = results.reduce((s, r) => s + (r.count || 0), 0);

    if (failures.length === 0) {
      window.toast?.(`✓ Đồng bộ 4/4 sheets · ${total} dòng`, 'success');
    } else {
      /* Hiển thị lỗi chi tiết */
      const errMsg = failures.map((f, i) => `${sheets[results.indexOf(f)].name}: ${f.error}`).join(' · ');
      console.error('[GSheets sync errors]', failures);
      window.toast?.(`❌ Lỗi ${failures.length}/4 sheets: ${errMsg.slice(0, 200)}`, 'danger');
    }
    /* Lưu lastSync */
    cfg.lastSyncAt = new Date().toLocaleString('vi-VN');
    cfg.lastSyncCount = total;
    cfg.lastSyncErrors = failures.length;
    window.STORE.set('int_google-sheets', cfg);
  };

  /* === Test connection === */
  window.gsheetsTest = async function () {
    const cfg = getCfg();
    if (!cfg.webhookUrl) {
      window.toast?.('Chưa nhập URL', 'warn');
      return;
    }
    window.toast?.('⏳ Đang test...', 'info');
    const r = await pushSheet('NSTT_Test', [
      { 'Time': new Date().toLocaleString('vi-VN'), 'Message': 'Test từ NSTT app', 'OK': '✓' }
    ]);
    if (r.ok) {
      window.toast?.('✓ Test OK — kiểm tra sheet "NSTT_Test" trong Google Sheets', 'success');
    } else {
      window.toast?.('❌ Test fail: ' + (r.error || 'unknown'), 'danger');
    }
  };

  /* === Auto trigger theo syncFreq === */
  function scheduleAuto() {
    const cfg = getCfg();
    if (!cfg.enabled || !cfg.webhookUrl) return;
    const freq = cfg.syncFreq || 'manual';

    if (freq === 'realtime') {
      /* Debounce: STORE đổi → đợi 5s → push */
      ['orders', 'customers', 'cashEntries', 'invoices'].forEach(key => {
        window.STORE.subscribe(key, () => {
          if (_pushTimer) clearTimeout(_pushTimer);
          _pushTimer = setTimeout(() => {
            console.log('[GSheets] Realtime sync triggered by ' + key);
            window.gsheetsSyncAll();
          }, 5000);
        });
      });
    }
    if (freq === 'hourly') {
      setInterval(() => {
        if (document.hidden) return;
        window.gsheetsSyncAll();
      }, 60 * 60 * 1000);
    }
    if (freq === 'daily') {
      /* Check mỗi 5 phút xem có phải 23:00 chưa */
      let _lastDailyDate = '';
      setInterval(() => {
        const now = new Date();
        if (now.getHours() === 23 && now.getMinutes() < 5) {
          const today = now.toISOString().slice(0, 10);
          if (_lastDailyDate !== today) {
            _lastDailyDate = today;
            window.gsheetsSyncAll();
          }
        }
      }, 5 * 60 * 1000);
    }
  }

  scheduleAuto();
  console.log('%c[NSTT] ✓ Google Sheets sync ready', 'color:#15803D;font-weight:bold');
})();
