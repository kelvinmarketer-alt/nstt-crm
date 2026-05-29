/* =========================================================
   Data Linkage Audit + Auto-Migration
   ─────────────────────────────────────────────────────────
   Vấn đề: nhiều module đời cũ dùng field cũ (vd o.cust),
   module mới dùng o.custId → liên kết bị đứt → bot không
   tìm được đơn của KH, RFM tính sai, etc.

   File này chạy 1 lần khi app load → migrate tự động + cung
   cấp window.DataLinkage.report() để kiểm tra.

   Các liên kết được audit:
   - orders.custId        ← customers.id
   - orders.driver        ← drivers.id
   - orders.items[].id    ← products.id
   - recurring.custId     ← customers.id
   - quotes.custId        ← customers.id
   - purchases.supplierId ← suppliers.id
   - purchases.items[].productId ← products.id
   - inventory.productId  ← products.id
   - returns.orderCode    ← orders.code
   - leads (no FK)
   ========================================================= */
(function () {

  /* ============ MIGRATIONS ============ */
  function migrateOrders() {
    const orders = window.STORE.get('orders', null);
    if (!orders) return 0;
    let changed = 0;
    orders.forEach(o => {
      /* Field rename: o.cust → o.custId */
      if (o.cust && !o.custId) { o.custId = o.cust; changed++; }
      /* Đảm bảo custName fallback */
      if (!o.custName && o.custId) {
        const c = (window.STORE.get('customers',[])||[]).find(x => x.id === o.custId);
        if (c) { o.custName = c.name; changed++; }
      }
    });
    if (changed) window.STORE.set('orders', orders);
    return changed;
  }

  function migrateReturns() {
    /* Returns dùng .orderCode đúng rồi, không cần migrate */
    return 0;
  }

  /* ============ AUDIT REPORT ============ */
  function auditReport() {
    const customers = window.STORE.get('customers', []) || [];
    const products = window.STORE.get('products', []) || [];
    const drivers = window.STORE.get('shippers', []) || [];
    const suppliers = window.STORE.get('suppliers', []) || [];
    const orders = window.STORE.get('orders', []) || [];
    const recurring = window.STORE.get('recurring_orders', []) || [];
    const quotes = window.STORE.get('quotes', []) || [];
    const purchases = window.STORE.get('purchases', []) || [];
    const inventory = window.STORE.get('inventory', []) || [];
    const returns = window.STORE.get('returns', []) || [];

    const custIds = new Set(customers.map(c => c.id));
    const prodIds = new Set(products.map(p => p.id));
    const drvIds = new Set(drivers.map(d => d.id));
    const supIds = new Set(suppliers.map(s => s.id));
    const orderCodes = new Set(orders.map(o => o.code));

    const issues = [];

    /* Orders → Customers */
    let orphanOrders = 0;
    let ordersNoCustId = 0;
    let orphanOrderItems = 0;
    let orphanDriverRef = 0;
    orders.forEach(o => {
      if (!o.custId) { ordersNoCustId++; return; }
      if (!custIds.has(o.custId)) orphanOrders++;
      if (o.driver && o.driver !== '—' && !drvIds.has(o.driver)) orphanDriverRef++;
      (o.items || []).forEach(it => {
        if (it.id && !prodIds.has(it.id)) orphanOrderItems++;
      });
    });
    if (orphanOrders) issues.push({ kind:'error', module:'orders', text:`${orphanOrders} đơn trỏ custId không tồn tại` });
    if (ordersNoCustId) issues.push({ kind:'warn', module:'orders', text:`${ordersNoCustId} đơn không có custId (legacy?)` });
    if (orphanOrderItems) issues.push({ kind:'warn', module:'orders', text:`${orphanOrderItems} dòng items trong đơn trỏ productId không tồn tại` });
    if (orphanDriverRef) issues.push({ kind:'warn', module:'orders', text:`${orphanDriverRef} đơn trỏ driverId không tồn tại` });

    /* Recurring → Customers */
    recurring.forEach(r => {
      if (!r.custId || !custIds.has(r.custId)) {
        issues.push({ kind:'error', module:'recurring', text:`Mẫu ${r.id} trỏ KH "${r.custName||r.custId}" không tồn tại` });
      }
      (r.items || []).forEach(it => {
        if (it.productId && !prodIds.has(it.productId)) {
          issues.push({ kind:'warn', module:'recurring', text:`Mẫu ${r.id} có SP ${it.productId} không tồn tại` });
        }
      });
    });

    /* Quotes → Customers */
    quotes.forEach(q => {
      if (q.custId && !custIds.has(q.custId)) {
        issues.push({ kind:'error', module:'quotes', text:`Báo giá ${q.id} trỏ KH không tồn tại` });
      }
    });

    /* Purchases → Suppliers + Products */
    purchases.forEach(p => {
      if (p.supplierId && !supIds.has(p.supplierId)) {
        issues.push({ kind:'error', module:'purchases', text:`Phiếu nhập ${p.id} trỏ NCC không tồn tại` });
      }
      (p.items || []).forEach(it => {
        if (it.productId && !prodIds.has(it.productId)) {
          issues.push({ kind:'warn', module:'purchases', text:`Phiếu ${p.id} có SP ${it.productId} không tồn tại` });
        }
      });
    });

    /* Inventory → Products */
    inventory.forEach(i => {
      if (i.productId && !prodIds.has(i.productId)) {
        issues.push({ kind:'error', module:'inventory', text:`Tồn ${i.id} trỏ SP ${i.productId} không tồn tại` });
      }
    });

    /* Returns → Orders */
    returns.forEach(r => {
      if (r.orderCode && !orderCodes.has(r.orderCode)) {
        issues.push({ kind:'warn', module:'returns', text:`Trả hàng ${r.id} trỏ đơn ${r.orderCode} không tồn tại` });
      }
    });

    /* Cust prefs → Customers */
    const prefs = window.STORE.get('cust_prefs', {}) || {};
    Object.keys(prefs).forEach(cid => {
      if (!custIds.has(cid)) {
        issues.push({ kind:'warn', module:'cust_prefs', text:`Có từ điển riêng cho KH ${cid} nhưng KH không tồn tại` });
      }
    });

    return {
      counts: {
        customers: customers.length, products: products.length,
        drivers: drivers.length, suppliers: suppliers.length,
        orders: orders.length, recurring: recurring.length,
        quotes: quotes.length, purchases: purchases.length,
        inventory: inventory.length, returns: returns.length,
      },
      issues,
      isHealthy: issues.filter(i => i.kind === 'error').length === 0,
    };
  }

  /* ============ AUTO-MIGRATE on load ============ */
  function autoMigrate() {
    try {
      const c1 = migrateOrders();
      const c2 = migrateReturns();
      const total = c1 + c2;
      if (total > 0) {
        console.log('[DataLinkage] Đã migrate', total, 'records');
        if (window.audit) window.audit.log('data.migrate', `Migrate ${total} records`);
      }
    } catch (e) { console.warn('[DataLinkage] Migrate error', e); }
  }

  /* Run after STORE ready */
  if (window.STORE) {
    autoMigrate();
  } else {
    setTimeout(autoMigrate, 500);
  }

  window.DataLinkage = {
    report: auditReport,
    migrate: autoMigrate,

    /* Modal hiển thị report nicely */
    showReport() {
      const r = auditReport();
      const issueByModule = {};
      r.issues.forEach(i => {
        issueByModule[i.module] = issueByModule[i.module] || [];
        issueByModule[i.module].push(i);
      });
      const moduleHtml = Object.keys(issueByModule).length
        ? Object.entries(issueByModule).map(([m, list]) => `
          <div style="margin-top:10px">
            <h4 style="margin:0 0 4px;font-size:12px;color:var(--navy);text-transform:uppercase">${m} (${list.length})</h4>
            ${list.map(i => `<div style="font-size:11.5px;padding:6px 9px;background:${i.kind==='error'?'#FEE2E2':'#FEF3C7'};color:${i.kind==='error'?'#B91C1C':'#92400E'};border-radius:5px;margin-bottom:3px">${i.kind==='error'?'❌':'⚠️'} ${i.text}</div>`).join('')}
          </div>
        `).join('')
        : `<div style="background:#DCFCE7;color:#15803D;padding:14px;border-radius:8px;text-align:center;font-weight:600">✅ Tất cả liên kết dữ liệu OK — không có lỗi</div>`;

      window.openModal('🔗 Audit liên kết dữ liệu', `
        <div style="background:#EFF6FF;color:#1E40AF;padding:9px 12px;border-radius:7px;font-size:12px;margin-bottom:12px">
          💡 Kiểm tra integrity các liên kết FK giữa orders↔customers, purchases↔suppliers, inventory↔products… Lỗi ERROR cần fix gấp, WARN nên xử lý sớm.
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:14px;font-size:11.5px">
          ${Object.entries(r.counts).map(([k,v]) => `<div style="background:#FAFBFC;border:1px solid var(--line);padding:7px;border-radius:5px;text-align:center"><div style="font-weight:700;color:var(--navy)">${v}</div><div style="color:var(--muted);font-size:10px;text-transform:uppercase">${k}</div></div>`).join('')}
        </div>
        <div style="max-height:300px;overflow:auto">${moduleHtml}</div>
        <div style="margin-top:14px;padding:9px 12px;background:${r.isHealthy?'#DCFCE7':'#FEF3C7'};color:${r.isHealthy?'#15803D':'#92400E'};border-radius:7px;font-size:12.5px;font-weight:600">
          ${r.isHealthy ? '✅ Trạng thái: KHỎE — sẵn sàng deploy' : `⚠️ Có ${r.issues.filter(i=>i.kind==='error').length} ERROR + ${r.issues.filter(i=>i.kind==='warn').length} WARN`}
        </div>
      `, {
        footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
                 <button class="btn btn-primary" onclick="window.DataLinkage.migrate();window.toast('Đã migrate lại','success');window.closeModal()">🔧 Chạy migrate</button>`,
        width: '640px',
      });
    },
  };
})();
