/* =========================================================
   Customer Preferences — Cá nhân hoá per KH
   ─────────────────────────────────────────────────────────
   Vấn đề thực tế (B2B nông sản):
   - Nhà hàng A đặt "hành 50kg" — trong kho có cả "Hành tây", "Hành ta",
     "Hành lá", "Hành tím". AI không biết chọn cái nào nếu không có context.
   - KH quen thường nhắn ngắn: "rau 20kg" thay vì "rau muống 20kg".
   - Cần lưu "từ điển riêng" cho mỗi KH — để AI lẫn UI tự đề xuất đúng.

   Cấu trúc lưu:
   STORE.cust_prefs = {
     KH001: {
       aliases: {
         'hành':  'SP006',   // KH001 nói "hành" = hành tây
         'rau':   'SP054',   // KH001 nói "rau" = rau muống
       },
       defaultQty: {
         'SP006': 50,        // mỗi lần "hành" = 50kg
       },
       favorites: ['SP006','SP001','SP005','SP047'],  // hay đặt nhất
       history: [
         { date:'2026-05-18', items:[{id:'SP006', qty:50}] },
         ...
       ],
       lastOrderItems: [...]   // cache item của đơn gần nhất
     },
     KH002: {...}
   }

   API:
   - CustPrefs.get(custId)               → object
   - CustPrefs.addAlias(custId, word, productId, defaultQty)
   - CustPrefs.removeAlias(custId, word)
   - CustPrefs.recordOrder(custId, items)  → tự update favorites + history
   - CustPrefs.resolveItem(custId, name)   → {productId, qty} hoặc null
   - CustPrefs.suggestItems(custId)        → list items để gợi ý "Đặt như lần trước"
   - CustPrefs.aliasContextForAI(custId)   → text block cho AI prompt
   ========================================================= */
(function () {
  const KEY = 'cust_prefs';

  function getAll() { return window.STORE.get(KEY, {}) || {}; }
  function setAll(v) { window.STORE.set(KEY, v); }

  function norm(s) {
    return (s || '').toString().toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* Cập nhật 1 prefs object từ 1 đơn (KHÔNG ghi) — dùng chung cho recordOrder + batch sync */
  function _applyOrder(p, items) {
    p.aliases = p.aliases || {}; p.defaultQty = p.defaultQty || {}; p.favorites = p.favorites || []; p.history = p.history || [];
    p.lastOrderItems = items.map(it => ({ id: it.id, name: it.name, qty: it.qty, price: it.price, unit: it.unit }));
    p.history.unshift({ date: new Date().toISOString().slice(0, 10), items: items.map(it => ({ id: it.id, qty: it.qty })) });
    if (p.history.length > 20) p.history.length = 20;
    const count = {};
    p.history.forEach(h => h.items.forEach(it => { count[it.id] = (count[it.id] || 0) + 1; }));
    p.favorites = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
    const qtyAcc = {};
    p.history.forEach(h => h.items.forEach(it => { qtyAcc[it.id] = qtyAcc[it.id] || { sum: 0, n: 0 }; qtyAcc[it.id].sum += it.qty; qtyAcc[it.id].n++; }));
    Object.keys(qtyAcc).forEach(pid => { p.defaultQty[pid] = Math.round(qtyAcc[pid].sum / qtyAcc[pid].n * 10) / 10; });
  }

  const CustPrefs = {

    get(custId) {
      const all = getAll();
      return all[custId] || { aliases:{}, defaultQty:{}, favorites:[], history:[], lastOrderItems:[] };
    },

    save(custId, prefs) {
      const all = getAll();
      all[custId] = prefs;
      setAll(all);
    },

    addAlias(custId, word, productId, defaultQty) {
      const p = this.get(custId);
      const w = norm(word);
      if (!w || !productId) return;
      p.aliases[w] = productId;
      if (defaultQty && +defaultQty > 0) p.defaultQty[productId] = +defaultQty;
      this.save(custId, p);
      window.audit && window.audit.log('custpref.addAlias', `${custId}: "${word}" → ${productId}`);
    },

    removeAlias(custId, word) {
      const p = this.get(custId);
      delete p.aliases[norm(word)];
      this.save(custId, p);
    },

    /* Gọi mỗi khi 1 đơn được tạo / lưu — update favorites + history + lastOrderItems (ghi ngay 1 KH) */
    recordOrder(custId, items) {
      if (!custId || !items || !items.length) return;
      const p = this.get(custId);
      _applyOrder(p, items);
      this.save(custId, p);
    },

    /* Resolve 1 tên (text từ AI / form) → productId + suggestedQty.
       Trả null nếu không match nổi → caller dùng matchProductByName fallback */
    resolveItem(custId, name) {
      const p = this.get(custId);
      const n = norm(name);
      if (!n) return null;
      /* 1. Exact alias */
      if (p.aliases[n]) {
        return { productId: p.aliases[n], qty: p.defaultQty[p.aliases[n]] || null, source: 'alias-exact' };
      }
      /* 2. Alias là token con (vd KH gõ "hành tây 50kg" — alias là "hành tây") */
      for (const aliasKey of Object.keys(p.aliases)) {
        if (n.includes(aliasKey) || aliasKey.includes(n)) {
          return { productId: p.aliases[aliasKey], qty: p.defaultQty[p.aliases[aliasKey]] || null, source: 'alias-partial' };
        }
      }
      return null;
    },

    /* Gợi ý items cho form tạo đơn — ưu tiên lastOrderItems, fallback favorites */
    suggestItems(custId) {
      const p = this.get(custId);
      if (p.lastOrderItems && p.lastOrderItems.length) {
        return { source: 'last', items: p.lastOrderItems };
      }
      if (p.favorites && p.favorites.length) {
        const products = window.STORE.get('products', window.PRODUCTS || []) || [];
        return { source: 'favorites', items: p.favorites.map(pid => {
          const prod = products.find(x => x.id === pid);
          return prod ? { id: pid, name: prod.name, unit: prod.unit, qty: p.defaultQty[pid] || 1 } : null;
        }).filter(Boolean) };
      }
      return { source: 'none', items: [] };
    },

    /* Block text để chèn vào AI prompt — giúp AI biết từ điển riêng của KH */
    aliasContextForAI(custId) {
      const p = this.get(custId);
      const lines = [];
      if (Object.keys(p.aliases).length) {
        lines.push('TỪ ĐIỂN RIÊNG CỦA KHÁCH HÀNG NÀY (rất quan trọng, ưu tiên trước catalog chung):');
        const products = window.STORE.get('products', window.PRODUCTS || []) || [];
        Object.entries(p.aliases).forEach(([word, pid]) => {
          const prod = products.find(x => x.id === pid);
          if (prod) {
            const dq = p.defaultQty[pid];
            lines.push(`  - Khi KH viết "${word}" → là SP "${prod.name}" (mã ${pid})${dq ? ` · SL thường: ${dq} ${prod.unit||''}` : ''}`);
          }
        });
      }
      if (p.lastOrderItems && p.lastOrderItems.length) {
        lines.push('');
        lines.push('LẦN GẦN NHẤT KH NÀY ĐẶT:');
        p.lastOrderItems.forEach(it => {
          lines.push(`  - ${it.name} × ${it.qty} ${it.unit||''}`);
        });
      }
      return lines.length ? lines.join('\n') : '';
    },

    /* Khi user trong form tạo đơn TỰ chọn 1 SP cho 1 tên mơ hồ →
       hỏi "Bạn có muốn lưu lại cho lần sau?" và gọi addAlias */
    promptToLearn(custId, word, productId) {
      const p = this.get(custId);
      const n = norm(word);
      if (!n || p.aliases[n]) return;  // đã có rồi thì thôi
      if (confirm(`💡 Lần sau khi KH này nhắn "${word}", em có nên tự hiểu là "${this._prodName(productId)}" không?`)) {
        this.addAlias(custId, word, productId);
        window.toast && window.toast('✓ Đã lưu vào từ điển riêng của KH', 'success');
      }
    },

    _prodName(pid) {
      const p = (window.STORE.get('products', []) || []).find(x => x.id === pid);
      return p ? p.name : pid;
    },
  };

  window.CustPrefs = CustPrefs;

  /* Subscribe orders → ghi thói quen mua. GỘP + DEBOUNCE + dedupe theo mã đơn.
     Trước đây ghi TỪNG đơn mỗi lần orders sync (cờ _prefRecorded chỉ ở RAM, mất sau mỗi
     lần kéo cloud) → 45 đơn = 45 lần setKv('cust_prefs') dồn dập → trên 4G/5G fetch "Load failed"
     → spam toast. Nay: gom mọi đơn MỚI vào 1 lần ghi, hoãn 1.5s, đơn đã ghi không ghi lại. */
  if (window.STORE) {
    const _recorded = new Set();   /* mã đơn đã ghi trong phiên — không ghi lại khi re-sync */
    let _t = null, _snap = null;
    function _flush() {
      const orders = _snap || [];
      const all = getAll(); let changed = false;
      orders.forEach(o => {
        const oid = o.code || o.id; const cid = o.custId || o.cust;
        if (!oid || _recorded.has(oid) || !cid || !o.items || !o.items.length) return;
        _recorded.add(oid);
        const p = all[cid] || (all[cid] = { aliases: {}, defaultQty: {}, favorites: [], history: [], lastOrderItems: [] });
        _applyOrder(p, o.items);
        changed = true;
      });
      if (changed) setAll(all);   /* CHỈ 1 lần ghi cho cả lô */
    }
    window.STORE.subscribe('orders', (orders) => {
      _snap = orders; clearTimeout(_t); _t = setTimeout(_flush, 1500);
    });
  }

})();
