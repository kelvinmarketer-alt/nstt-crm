/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Cross-Module Hooks
   ─────────────────────────────────────────────────────────
   Subscribe events GLOBAL — chạy trên MỌI page (không phụ thuộc render).
   Trước đây các subscribe nằm trong inventory.js/orders.js → chỉ chạy khi
   user mở đúng page đó. Bây giờ wire vào shared, bảo đảm:

   1. Đơn delivered/reconciled → trừ tồn kho + ghi inv_movement
   2. Phiếu nhập received → cộng tồn kho
   3. Đơn KH chưa TT → cộng customer.debt (orders.payBy='Công nợ')
   4. Đơn cancelled/returned → hoàn lại customer.debt
   5. Phiếu trả hàng status='refunded' → cộng lại kho
   6. Chi phí Ads mới → tạo phiếu chi vào cashEntries
   7. Chốt lương NV → tạo phiếu chi vào cashEntries
   ========================================================= */
(function () {
  if (!window.STORE) {
    /* Defer: chờ store.js load xong (auth.js + store.js cùng load
       không tuần tự được nếu cross-module-hooks.js cũng load song song) */
    setTimeout(() => { if (window.STORE) bootHooks(); }, 100);
    return;
  }
  bootHooks();

  function bootHooks() {
    if (window._crossModuleHooksReady) return;
    window._crossModuleHooksReady = true;

    /* ============================================================
       HELPER FUNCTIONS — exposed nếu file inventory.js chưa load
       ============================================================ */
    if (!window.invApply) {
      window.invApply = function (productId, deltaQty) {
        const inv = window.STORE.get('inventory', window.INVENTORY || []) || [];
        let item = inv.find(i => i.productId === productId);
        if (!item) {
          item = {
            id: 'INV' + Date.now().toString(36),
            productId,
            stock: 0, minStock: 10, maxStock: 100, avgDaily: 5,
            lastIn: '', lastOut: '', location: 'Kho A1',
          };
          inv.push(item);
        }
        item.stock = Math.max(0, Math.round(((item.stock || 0) + deltaQty) * 100) / 100);   /* stock numeric → giữ kg lẻ (2 chữ số) */
        const today = window.todayDate();
        const vi = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
        if (deltaQty > 0) item.lastIn = vi;
        else item.lastOut = vi;
        window.STORE.set('inventory', inv);
      };
    }
    if (!window.invRecordMovement) {
      window.invRecordMovement = function (productId, qty, type, note, refId) {
        const mv = {
          id: 'MV' + Date.now().toString(36),
          ts: new Date().toISOString(),
          productId, qty, type,
          note: note || '', refId: refId || '',
          user: (window.CURRENT_USER || {}).name || 'Hệ thống',
        };
        window.STORE.rmwKv('inv_movements', arr => {
          arr = Array.isArray(arr) ? arr : [];
          if (refId && arr.some(m => m.refId === refId && m.type === type)) return arr;
          arr.unshift(mv);
          if (arr.length > 500) arr.length = 500;
          return arr;
        });
      };
    }

    /* ============================================================
       GATE + IDEMPOTENCY (chống áp dụng LẶP đa thiết bị)
       - Cờ `_xxxApplied` chỉ sống per-máy (bị strip khi sync) → máy mới mở app
         từng bị CỘNG NỢ / TRỪ KHO LẶP. Nay nguồn quyết định = SỔ CÁI đã sync
         (debtLedger / inv_movements): có bút toán ref rồi → KHÔNG áp dụng lại.
       - GATE: chỉ chạy khi dữ liệu cloud của các key liên quan ĐÃ TẢI XONG
         (STORE.isPreloaded) — tránh quyết định trên cache rỗng.
       ============================================================ */
    const S = window.STORE;
    const ready = (...keys) => !S.isPreloaded || keys.every(k => S.isPreloaded(k));
    const mvHas = (refId, type) => (S.get('inv_movements', []) || []).some(m => m.refId === refId && m.type === type);
    const dlHas = (ref, type) => (S.get('debtLedger', []) || []).some(e => e.ref === ref && e.type === type);
    /* Kick preload sớm các sổ cái idempotency (get → tự preload từ cloud) */
    S.get('inv_movements', []); S.get('debtLedger', []); S.get('cashEntries', []);

    /* ============================================================
       1. Orders delivered → trừ kho (idempotent qua inv_movements ref=code)
       ============================================================ */
    let _invRunning = false;
    function applyOrderInv() {
      if (_invRunning || !ready('orders', 'inv_movements')) return;
      _invRunning = true;
      try {
        const list = S.get('orders', []) || [];
        let changed = false;
        list.forEach(o => {
          if ((o.status === 'delivered' || o.status === 'reconciled') && !o._invApplied) {
            if (!mvHas(o.code, 'sale')) {
              (o.items || []).forEach(it => {
                if (it.id) {
                  window.invApply(it.id, -(it.qty || 0));
                  window.invRecordMovement(it.id, -(it.qty || 0), 'sale', `Xuất bán cho ${o.custName}`, o.code);
                }
              });
            }
            o._invApplied = true;   /* đã trừ (ở máy này hoặc máy khác) */
            changed = true;
          }
        });
        if (changed) S.set('orders', list);
      } finally { _invRunning = false; }
    }
    S.subscribe('orders', applyOrderInv);
    S.subscribe('__preloaded__', k => { if (k === 'orders' || k === 'inv_movements') applyOrderInv(); });

    /* 2. Purchases received → cộng kho (idempotent qua inv_movements ref=p.id) */
    let _purRunning = false;
    function applyPurchaseInv() {
      if (_purRunning || !ready('purchases', 'inv_movements')) return;
      _purRunning = true;
      try {
        const list = S.get('purchases', []) || [];
        let changed = false;
        list.forEach(p => {
          if (p.status === 'received' && !p._invApplied && !p.noStock) {
            if (!mvHas(p.id, 'purchase')) {
              (p.items || []).forEach(it => {
                if (it.productId) {
                  window.invApply(it.productId, +(it.qty || 0));
                  window.invRecordMovement(it.productId, +(it.qty || 0), 'purchase', `Nhập từ NCC`, p.id);
                }
              });
            }
            p._invApplied = true;
            changed = true;
          }
        });
        if (changed) S.set('purchases', list);
      } finally { _purRunning = false; }
    }
    S.subscribe('purchases', applyPurchaseInv);
    S.subscribe('__preloaded__', k => { if (k === 'purchases' || k === 'inv_movements') applyPurchaseInv(); });

    /* ============================================================
       3+4. Đơn KH chưa TT → cộng customer.debt (idempotent qua debtLedger ref=code)
       Đơn cancelled/returned → hoàn nợ (1 lần — có bút toán -rev là thôi)
       ============================================================ */
    let _debtRunning = false;
    function applyOrderDebt() {
      if (_debtRunning || !ready('orders', 'customers', 'debtLedger')) return;
      _debtRunning = true;
      try {
        const list = S.get('orders', []) || [];
        const custs = S.get('customers', []) || [];
        let changed = false;
        list.forEach(o => {
          const c = custs.find(x => x.id === (o.cust || o.customer_id));
          if (!c) return;
          /* "Ghi nợ" = payBy chứa chữ "nợ"; COD/Chuyển khoản → KHÔNG ghi nợ. */
          const isUnpaid = (/nợ/i.test(o.payBy || '') || o.payStatus === 'unpaid');
          const isFinalSettled = (o.status === 'delivered' || o.status === 'reconciled');
          const isCancelled = (o.status === 'cancelled' || o.status === 'returned');
          const charged = dlHas(o.code, 'charge');
          const reversed = dlHas(o.code + '-rev', 'reverse');

          /* Ghi bút toán CHARGE 1 lần (sổ cái chưa có). KHÔNG tự cộng c.debt ở đây nữa:
             công nợ giờ CHỈ tính từ 1 nguồn = đơn (payBy 'nợ') − thanh toán (ledger) trong
             rebuildCustStats/enrichCustomerStats. Trước đây hook cộng c.debt += freight (KHÔNG trừ
             tiền đã trả) rồi ghi đè lên số đúng → công nợ hiển thị lệch giữa các trang. */
          if (isFinalSettled && isUnpaid && !charged) {
            o._debtApplied = true;
            changed = true;
            window.addDebtLedger && window.addDebtLedger({
              custId: c.id, type: 'charge', amount: o.freight || 0, ref: o.code,
              date: o.deliveredAt || o.date, desc: 'Tiền hàng đơn ' + o.code,
            });
          }
          /* Hoàn nợ 1 LẦN (đã charge + chưa có bút toán -rev) — chỉ ghi ledger, c.debt tự tính lại */
          if (isCancelled && charged && !reversed) {
            o._debtApplied = false;
            changed = true;
            window.addDebtLedger && window.addDebtLedger({
              custId: c.id, type: 'reverse', amount: o.freight || 0, ref: o.code + '-rev',
              desc: 'Hoàn nợ (huỷ/trả đơn ' + o.code + ')',
            });
          }
        });
        /* Chỉ lưu cờ _debtApplied trên orders (KHÔNG đụng customers nữa → hết nguồn kép c.debt).
           Nhờ #4 (set bỏ diff field '_'), S.set('orders') này KHÔNG bắn update rỗng lên cloud. */
        if (changed) S.set('orders', list);
      } finally { _debtRunning = false; }
    }
    S.subscribe('orders', applyOrderDebt);
    S.subscribe('__preloaded__', k => { if (k === 'orders' || k === 'customers' || k === 'debtLedger') applyOrderDebt(); });

    /* ============================================================
       5. Phiếu trả hàng refunded → cộng lại kho (idempotent qua inv_movements)
       ============================================================ */
    let _retRunning = false;
    function applyReturnInv() {
      if (_retRunning || !ready('returns', 'inv_movements')) return;
      _retRunning = true;
      try {
        const list = S.get('returns', []) || [];
        const products = S.get('products', []) || [];
        let changed = false;
        list.forEach(r => {
          if ((r.status === 'refunded' || r.status === 'replaced') && !r._invApplied) {
            const ref = r.id || r.orderCode;
            if (!mvHas(ref, 'return')) {
              (r.items || []).forEach(it => {
                /* CHỈ cộng lại kho hàng THỰC SỰ về kho: đánh dấu restock, hoặc hàng đẹp (cond='good').
                   Bỏ qua hàng TRẢ NCC / VỨT BỎ. Phiếu cũ (không có cond & restock) → theo r.disposition. */
                const toWarehouse = (it.restock === true) || (it.cond === 'good')
                  || (it.cond == null && it.restock == null && r.disposition === 'restock');
                if (!toWarehouse) return;
                let pid = it.productId || it.id;
                if (!pid && it.name) {
                  const p = products.find(x => (x.name||'').trim().toLowerCase() === (it.name||'').trim().toLowerCase());
                  pid = p ? p.id : null;
                }
                if (pid) {
                  window.invApply(pid, +(it.qty || 0));
                  window.invRecordMovement(pid, +(it.qty || 0), 'return', `KH trả hàng ${r.custName||''}`, ref);
                }
              });
            }
            r._invApplied = true;
            changed = true;
          }
        });
        if (changed) S.set('returns', list);
      } finally { _retRunning = false; }
    }
    S.subscribe('returns', applyReturnInv);
    S.subscribe('__preloaded__', k => { if (k === 'returns' || k === 'inv_movements') applyReturnInv(); });

    /* ============================================================
       6. Chi phí Ads mới → tạo phiếu chi vào cashEntries
       ============================================================ */
    window.STORE.subscribe('adspend', ads => {
      if (!ready('adspend', 'cashEntries')) return;   /* đợi cloud về — dedup theo mã 'no' cần cashEntries thật */
      let changed = false;
      const list = ads || [];
      const cash = window.STORE.get('cashEntries', []) || [];
      list.forEach(ad => {
        if (ad.spend > 0 && !ad._cashApplied) {
          const platform = ad.channel === 'fb' ? 'Facebook'
                         : ad.channel === 'google' ? 'Google'
                         : ad.channel === 'tiktok' ? 'TikTok'
                         : ad.channel === 'zalo' ? 'Zalo' : ad.channel || 'Ads';
          const no = 'PC-AD-' + (ad.id || Date.now()).toString().slice(-8);
          if (!cash.some(c => c.no === no)) {
            cash.unshift({
              no,
              date: ad.date || '',
              type: 'out',
              party: platform,
              desc: `Chi phí QC ${platform} ${ad.date||''}`,
              account: 'Tiền mặt',
              amount: ad.spend,
              staff: 'Hệ thống',
              relatedOrder: '',
              relatedInvoice: '',
              _source: 'adspend',
              _adspendId: ad.id,
            });
            changed = true;
          }
          ad._cashApplied = true;
        }
      });
      if (changed) {
        window.STORE.set('cashEntries', cash);
        window.STORE.set('adspend', list);
      }
    });

    /* ============================================================
       7. Chốt lương → tạo phiếu chi vào cashEntries
       Hook payroll: payrollExtra có khi user 'pay' 1 NV → đẩy vào KT
       (payroll module sử dụng key 'payrollExtra' để lưu)
       ============================================================ */
    window.STORE.subscribe('payrollExtra', payroll => {
      /* Schema mới: array of payslip {status, total, paidAt, staffName, month, ...} */
      if (!Array.isArray(payroll)) return; /* tránh ghi đè khi format sai */
      if (!ready('payrollExtra', 'cashEntries')) return;
      let changed = false;
      const list = payroll;
      const cash = window.STORE.get('cashEntries', []) || [];
      list.forEach(p => {
        const amount = +p.total || +p.amount || 0;
        const isPaid = p.status === 'paid' || p.paid === true;
        if (isPaid && !p._cashApplied && amount > 0) {
          const no = 'PC-LU-' + (p.id || Date.now()).toString().slice(-8);
          if (!cash.some(c => c.no === no)) {
            cash.unshift({
              no,
              date: (p.paidAt || p.payDate || new Date().toISOString()).slice(0, 10),
              type: 'out',
              party: p.staffName || p.name || 'NV',
              desc: `Lương tháng ${p.month||''} — ${p.staffName||p.name||''}`,
              account: 'Tiền mặt',
              amount,
              staff: (window.CURRENT_USER||{}).name || 'Hệ thống',
              relatedOrder: '',
              relatedInvoice: '',
              _source: 'payroll',
              _payrollId: p.id,
            });
            changed = true;
          }
          p._cashApplied = true;
        }
      });
      if (changed) {
        window.STORE.set('cashEntries', cash);
        /* Chỉ cắm cờ _cashApplied cho đúng phiếu đã sinh phiếu chi — KHÔNG ghi đè cả sổ lương
           (`list` ở đây có thể là cache cũ của tab vừa mở). Idempotent theo id. */
        const doneIds = list.filter(p => p && p._cashApplied).map(p => p.id);
        if (window.STORE.rmwKv) {
          window.STORE.rmwKv('payrollExtra', arr => {
            (Array.isArray(arr) ? arr : []).forEach(p => { if (p && doneIds.indexOf(p.id) >= 0) p._cashApplied = true; });
            return arr;
          }, []);
        } else window.STORE.set('payrollExtra', list);
      }
    });

    console.log('%c[NSTT] ✓ Cross-module hooks ready (7 luồng tự động)', 'color:#15803D;font-weight:bold');

    /* ============================================================
       HELPER: tạo HĐ từ 1 đơn — gọi từ Orders drawer
       ============================================================ */
    window.openInvoiceFromOrder = function (orderCode) {
      if (!orderCode) { window.toast && window.toast('Không có mã đơn', 'warn'); return; }
      const orders = window.STORE.get('orders', []) || [];
      const o = orders.find(x => x.code === orderCode);
      if (!o) { window.toast && window.toast('Không tìm thấy đơn ' + orderCode, 'warn'); return; }

      const customers = window.STORE.get('customers', []) || [];
      const c = customers.find(x => x.id === (o.cust || o.customer_id)) || {};

      /* Đã có HĐ cho đơn này? */
      const existing = (window.STORE.get('invoices', []) || []).find(x => x.relatedOrder === o.code);
      if (existing) {
        window.toast && window.toast('Đơn này đã có HĐ ' + existing.no + ' — chuyển tới...', 'info');
        setTimeout(() => location.href = '../pages/invoices.html?focus=' + existing.no, 600);
        return;
      }

      /* Sinh số HĐ mới: 1C26T-XXXX */
      const yr = String(new Date().getFullYear()).slice(-2);
      const existingIds = (window.STORE.get('invoices', []) || []).map(i => i.no);
      let seq = 1;
      while (existingIds.includes(`1C${yr}T-${String(seq).padStart(4,'0')}`)) seq++;
      const no = `1C${yr}T-${String(seq).padStart(4,'0')}`;

      const vatRate = 8;
      const net = +o.freight || 0;
      const vat = Math.round(net * vatRate / 100);
      const today = new Date();
      const dateVN = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

      const newInv = {
        no, date: dateVN,
        cust: c.company || c.name || o.custName || '',
        tax: c.tax || '',
        net, vat, vatRate,
        desc: o.goods || `Hàng nông sản đơn ${o.code}`,
        status: 'draft',
        relatedOrder: o.code,
        customerId: c.id || o.cust || '',
        /* KHÔNG lưu 'items': bảng invoices không có cột này (bị strip mỗi lần insert) và
           printInvoice in theo desc+net, không đọc items. Cần dòng hàng chi tiết thì suy từ
           đơn liên kết (relatedOrder) lúc in. */
      };
      window.STORE.add('invoices', newInv);
      window.STORE.update('orders', o.code, { invoiceNo: no });
      window.toast && window.toast(`✓ Đã tạo HĐ ${no} cho đơn ${o.code} — chuyển tới HĐ...`, 'success');
      setTimeout(() => location.href = '../pages/invoices.html?focus=' + no, 800);
    };
  }
})();
