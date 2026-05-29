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
        item.stock = Math.max(0, (item.stock || 0) + deltaQty);
        const today = window.todayDate();
        const vi = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;
        if (deltaQty > 0) item.lastIn = vi;
        else item.lastOut = vi;
        window.STORE.set('inventory', inv);
      };
    }
    if (!window.invRecordMovement) {
      window.invRecordMovement = function (productId, qty, type, note, refId) {
        const moves = window.STORE.get('inv_movements', []) || [];
        moves.unshift({
          id: 'MV' + Date.now().toString(36),
          ts: new Date().toISOString(),
          productId, qty, type,
          note: note || '', refId: refId || '',
          user: (window.CURRENT_USER || {}).name || 'Hệ thống',
        });
        if (moves.length > 500) moves.length = 500;
        window.STORE.set('inv_movements', moves);
      };
    }

    /* ============================================================
       1+2. Orders delivered → trừ kho · Purchases received → cộng kho
       (Đã có sẵn trong inventory.js — chỉ duplicate ở đây để chạy global) */
    window.STORE.subscribe('orders', orders => {
      let changed = false;
      const list = orders || [];
      list.forEach(o => {
        if ((o.status === 'delivered' || o.status === 'reconciled') && !o._invApplied) {
          (o.items || []).forEach(it => {
            if (it.id) {
              window.invApply(it.id, -(it.qty || 0));
              window.invRecordMovement(it.id, -(it.qty || 0), 'sale', `Xuất bán cho ${o.custName}`, o.code);
            }
          });
          o._invApplied = true;
          changed = true;
        }
      });
      if (changed) window.STORE.set('orders', list);
    });

    window.STORE.subscribe('purchases', purchases => {
      let changed = false;
      const list = purchases || [];
      list.forEach(p => {
        if (p.status === 'received' && !p._invApplied) {
          (p.items || []).forEach(it => {
            if (it.productId) {
              window.invApply(it.productId, +(it.qty || 0));
              window.invRecordMovement(it.productId, +(it.qty || 0), 'purchase', `Nhập từ NCC`, p.id);
            }
          });
          p._invApplied = true;
          changed = true;
        }
      });
      if (changed) window.STORE.set('purchases', list);
    });

    /* ============================================================
       3+4. Đơn KH chưa TT → cộng customer.debt
       Đơn cancelled/returned → hoàn lại debt
       ============================================================ */
    window.STORE.subscribe('orders', orders => {
      const list = orders || [];
      const custs = window.STORE.get('customers', []) || [];
      let changed = false;
      list.forEach(o => {
        const c = custs.find(x => x.id === (o.cust || o.customer_id));
        if (!c) return;
        const isUnpaid = (o.payBy === 'Công nợ' || o.payStatus === 'unpaid');
        const isFinalSettled = (o.status === 'delivered' || o.status === 'reconciled');
        const isCancelled = (o.status === 'cancelled' || o.status === 'returned');

        /* Trường hợp 1: đơn vừa delivered + chưa TT → cộng debt */
        if (isFinalSettled && isUnpaid && !o._debtApplied) {
          c.debt = (c.debt || 0) + (o.freight || 0);
          o._debtApplied = true;
          changed = true;
        }
        /* Trường hợp 2: đơn cancel/return sau khi đã cộng debt → trừ ra */
        if (isCancelled && o._debtApplied) {
          c.debt = Math.max(0, (c.debt || 0) - (o.freight || 0));
          o._debtApplied = false;
          changed = true;
        }
      });
      if (changed) {
        window.STORE.set('customers', custs);
        window.STORE.set('orders', list);
      }
    });

    /* ============================================================
       5. Phiếu trả hàng status='refunded' → cộng lại kho
       ============================================================ */
    window.STORE.subscribe('returns', returns => {
      let changed = false;
      const list = returns || [];
      const products = window.STORE.get('products', []) || [];
      list.forEach(r => {
        if ((r.status === 'refunded' || r.status === 'replaced') && !r._invApplied) {
          (r.items || []).forEach(it => {
            /* Returns có thể không lưu productId — tìm theo tên SP */
            let pid = it.productId || it.id;
            if (!pid && it.name) {
              const p = products.find(x =>
                (x.name||'').toLowerCase() === (it.name||'').toLowerCase());
              pid = p ? p.id : null;
            }
            if (pid) {
              window.invApply(pid, +(it.qty || 0));
              window.invRecordMovement(pid, +(it.qty || 0), 'return', `KH trả hàng ${r.custName||''}`, r.id || r.orderCode);
            }
          });
          r._invApplied = true;
          changed = true;
        }
      });
      if (changed) window.STORE.set('returns', list);
    });

    /* ============================================================
       6. Chi phí Ads mới → tạo phiếu chi vào cashEntries
       ============================================================ */
    window.STORE.subscribe('adspend', ads => {
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
              description: `Chi phí QC ${platform} ${ad.date||''}`,
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
      let changed = false;
      const list = payroll || [];
      const cash = window.STORE.get('cashEntries', []) || [];
      list.forEach(p => {
        if (p.paid && !p._cashApplied && p.amount > 0) {
          const no = 'PC-LU-' + (p.id || Date.now()).toString().slice(-8);
          if (!cash.some(c => c.no === no)) {
            cash.unshift({
              no,
              date: p.payDate || '',
              type: 'out',
              party: p.staffName || p.name || 'NV',
              description: `Lương tháng ${p.month||''} — ${p.staffName||p.name||''}`,
              account: 'Tiền mặt',
              amount: p.amount,
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
        window.STORE.set('payrollExtra', list);
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
        items: (o.items || []).map(it => ({
          name: it.name, qty: it.qty, unit: it.unit || 'kg',
          price: it.price, total: it.total,
        })),
      };
      window.STORE.add('invoices', newInv);
      window.STORE.update('orders', o.code, { invoiceNo: no });
      window.toast && window.toast(`✓ Đã tạo HĐ ${no} cho đơn ${o.code} — chuyển tới HĐ...`, 'success');
      setTimeout(() => location.href = '../pages/invoices.html?focus=' + no, 800);
    };
  }
})();
