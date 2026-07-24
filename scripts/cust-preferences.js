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
    if (p.history.length > 6) p.history.length = 6;   /* v417: 20→6. history CHỈ để tính favorites + defaultQty, 6 đơn gần nhất là đủ. Giảm blob cust_prefs (781KB→~450KB) → đỡ timeout setKv trên 4G/5G. */
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
    async promptToLearn(custId, word, productId) {
      const p = this.get(custId);
      const n = norm(word);
      if (!n || p.aliases[n]) return;  // đã có rồi thì thôi
      if (await window.uiConfirm(`💡 Lần sau khi KH này nhắn "${word}", em có nên tự hiểu là "${this._prodName(productId)}" không?`)) {
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


  /* ===== ĐÃ CHUYỂN TỪ orders.js (v302): Từ điển riêng/alias per KH =====
     Để trang Khách hàng (không nạp orders.js) cũng mở được modal này. ===== */
  /* Modal quản lý từ điển riêng của 1 KH */
  window.openCustAliasMgr = function(custId) {
    const c = window.STORE.get('customers', []).find(x => x.id === custId);
    const p = window.CustPrefs.get(custId);
    const products = window.STORE.get('products', window.PRODUCTS || []) || [];
    const aliasRows = Object.entries(p.aliases).map(([w, pid]) => {
      const prod = products.find(x => x.id === pid);
      const dq = p.defaultQty[pid] || '';
      return `<tr><td>"${w}"</td><td>→ ${prod ? prod.name + ' <span style="color:var(--muted);font-family:monospace;font-size:11px">'+pid+'</span>' : '<i style="color:#DC2626">SP không còn</i>'}</td><td>${dq}</td><td><button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window._delAlias('${custId}','${w}')">✕</button></td></tr>`;
    }).join('') || `<tr><td colspan="4" style="padding:14px;text-align:center;color:var(--muted)">Chưa có từ điển nào. Thêm bên dưới ↓</td></tr>`;

    window.openModal('📖 Từ điển riêng của ' + (c?.name || custId), `
      <div style="background:#EFF6FF;color:#1E40AF;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:12px;line-height:1.55">
        💡 <b>Cá nhân hoá per KH</b> — giải quyết tình huống KH "${c?.name||'này'}" nhắn ngắn (vd "hành 50kg") nhưng kho có nhiều loại hành (tây/ta/lá). Bạn dạy hệ thống 1 lần — sau đó AI tự hiểu khi đọc ảnh đơn của KH.
        <br><br><b>Ví dụ:</b> Word "hành" → SP "Hành tây trắng" (SP006) · SL mặc định 50kg.
      </div>

      <h3 style="font-size:12px;color:var(--navy);text-transform:uppercase;margin:0 0 6px">Từ điển hiện có (${Object.keys(p.aliases).length})</h3>
      <table class="mini-table" style="width:100%">
        <thead><tr><th>Khi KH viết</th><th>= SP nào</th><th>SL mặc định</th><th></th></tr></thead>
        <tbody id="aliasTbody">${aliasRows}</tbody>
      </table>

      <h3 style="font-size:12px;color:var(--navy);text-transform:uppercase;margin:14px 0 6px">+ Thêm từ điển mới</h3>
      <div style="display:grid;grid-template-columns:1fr 2fr 90px 80px;gap:6px;align-items:end">
        <div><label style="font-size:11px;color:var(--muted)">Từ KH viết</label><input id="alWord" placeholder="hành" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px;font-size:12px"></div>
        <div><label style="font-size:11px;color:var(--muted)">= SP nào (gõ tìm)</label><input class="prodpick" id="alPid" data-pid="" placeholder="Gõ tên SP…" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px"></div>
        <div><label style="font-size:11px;color:var(--muted)">SL TB</label><input id="alQty" type="number" placeholder="50" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px;font-size:12px"></div>
        <div><button class="btn btn-primary btn-sm" onclick="window._addAlias('${custId}')">+ Thêm</button></div>
      </div>

      <h3 style="font-size:12px;color:var(--navy);text-transform:uppercase;margin:16px 0 6px">⭐ Top SP KH này hay đặt</h3>
      <div style="display:flex;flex-wrap:wrap;gap:5px;font-size:11.5px">
        ${(p.favorites||[]).map(pid => {
          const prod = products.find(x => x.id === pid);
          return prod ? `<span style="background:#F0FDF4;color:#15803D;padding:3px 8px;border-radius:99px">${prod.name} ${p.defaultQty[pid]?'· ~'+p.defaultQty[pid]+prod.unit:''}</span>` : '';
        }).join('') || '<span style="color:var(--muted)">Chưa có đơn — không có dữ liệu</span>'}
      </div>

      <h3 style="font-size:12px;color:var(--navy);text-transform:uppercase;margin:16px 0 6px">🧠 Mẫu nét chữ đã học</h3>
      <div id="custSampleBox" style="font-size:11.5px;color:var(--muted)">Đang tải…</div>
    `, {
      footer:`<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>`,
      width:'620px'
    });
    if (window.wireAllProductSearch) window.wireAllProductSearch(document.querySelector('.modal-bg:last-of-type') || document);
    if (window._renderAliasSamples) window._renderAliasSamples(custId);
  };

  /* Hiển thị mẫu nét chữ (ảnh) của KH trong modal Từ điển — async đọc IndexedDB */
  window._renderAliasSamples = async function (custId) {
    const box = document.getElementById('custSampleBox');
    if (!box) return;
    if (!window.OrderSamples) { box.innerHTML = '<span>Mở từ trang Đơn hàng để xem mẫu nét chữ.</span>'; return; }
    let samples = [];
    try { samples = await window.OrderSamples.listCust(custId); } catch (e) {}
    if (!samples.length) {
      box.innerHTML = 'Chưa có mẫu. Khi bạn dùng <b>📷 Từ ảnh</b> đọc đơn của KH này rồi lưu đơn → hệ thống tự lưu mẫu để AI nhớ nét chữ.';
      return;
    }
    box.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
      ${samples.slice(0, 6).map(s => `<div style="position:relative">
        <img src="data:${s.mime};base64,${s.b64}" title="${(s.finalItems||[]).map(it=>it.name+' '+it.qty).join(', ')}" style="width:74px;height:74px;object-fit:cover;border-radius:6px;border:1px solid var(--line);cursor:zoom-in" onclick="window.open('order-samples.html?cust=${encodeURIComponent(custId)}','_blank')">
      </div>`).join('')}
    </div>
    <div style="margin-top:6px"><b style="color:#15803D">${samples.length} mẫu</b> — AI dùng 2 mẫu mới nhất khi đọc đơn KH này. <a href="order-samples.html?cust=${encodeURIComponent(custId)}" style="color:#1B5E20;font-weight:600">Quản lý →</a></div>`;
  };

  window._addAlias = function(custId) {
    const w = document.getElementById('alWord').value.trim();
    const pid = document.getElementById('alPid').dataset.pid || '';
    const qty = parseFloat(document.getElementById('alQty').value) || 0;
    if (!w || !pid) { window.toast('Nhập từ + gõ chọn SP','warn'); return; }
    window.CustPrefs.addAlias(custId, w, pid, qty);
    window.toast('✓ Đã thêm từ điển','success');
    window.openCustAliasMgr(custId);  /* Re-render modal */
  };

  window._delAlias = function(custId, word) {
    window.CustPrefs.removeAlias(custId, word);
    window.openCustAliasMgr(custId);
  };

})();
