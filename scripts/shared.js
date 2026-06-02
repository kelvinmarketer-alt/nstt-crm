/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Shared utilities + App shell
   Dùng chung cho mọi trang.
   ========================================================= */

/* ============ PWA setup =============
   Tự register service worker + inject manifest vào mọi page
   ===================================================== */
(function setupPWA() {
  /* ============ FAVICON =============
     Inject favicon SVG inline (logo Tuấn Tú Farm) cho mọi tab —
     thay icon globe mặc định của browser bằng logo thương hiệu. */
  const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90">
    <circle cx="70" cy="45" r="38" fill="#E8F5E2"/>
    <circle cx="70" cy="45" r="38" fill="none" stroke="#339B21" stroke-width="3.5"/>
    <circle cx="61" cy="49" r="19" fill="#4EB83C"/>
    <path d="M61 30 C 50 37 47 52 55 64" fill="none" stroke="#2A7D1A" stroke-width="2" stroke-linecap="round"/>
    <path d="M61 30 C 72 37 75 52 67 64" fill="none" stroke="#2A7D1A" stroke-width="2" stroke-linecap="round"/>
    <path d="M43 49 C 54 47 68 47 79 49" fill="none" stroke="#2A7D1A" stroke-width="2" stroke-linecap="round"/>
    <circle cx="61" cy="49" r="5.5" fill="#2A7D1A"/>
    <g transform="rotate(30 86 52)">
      <path d="M82 47 L90 47 L86 70 Z" fill="#E8862E"/>
      <path d="M82 47 C 79 39 85 37 86 43 C 87 37 93 39 90 47 Z" fill="#2A7D1A"/>
    </g>
  </svg>`;
  const faviconDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(FAVICON_SVG);
  /* Xóa các favicon mặc định cũ (nếu có) để tránh trùng */
  document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach(el => el.remove());
  ['icon', 'shortcut icon', 'apple-touch-icon'].forEach(rel => {
    const l = document.createElement('link');
    l.rel = rel;
    l.type = 'image/svg+xml';
    l.href = faviconDataUrl;
    document.head.appendChild(l);
  });
  /* Phơi ra global để các popup PDF (delivery-note, price-catalogue, pdf-templates, accounting print)
     có thể tái sử dụng cùng 1 favicon */
  window.NSTT_FAVICON_DATAURL = faviconDataUrl;

  /* Inject manifest link nếu chưa có */
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    /* Đường dẫn manifest dựa trên vị trí page */
    link.href = location.pathname.includes('/pages/') ? '../manifest.json' : '/manifest.json';
    document.head.appendChild(link);
  }
  /* Theme color cho status bar mobile */
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#1B5E20';
    document.head.appendChild(meta);
  }
  /* Apple mobile web app */
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    const m1 = document.createElement('meta');
    m1.name = 'apple-mobile-web-app-capable';
    m1.content = 'yes';
    document.head.appendChild(m1);
    const m2 = document.createElement('meta');
    m2.name = 'apple-mobile-web-app-status-bar-style';
    m2.content = 'black-translucent';
    document.head.appendChild(m2);
    const m3 = document.createElement('meta');
    m3.name = 'apple-mobile-web-app-title';
    m3.content = 'Nông Sản Tuấn Tú Hà Nội';
    document.head.appendChild(m3);
  }
  /* Lazy-load PRODUCT_IMAGES (3.8MB) — only khi UI cần (PDF, catalogue, quote preview).
     Bỏ khỏi <script> đồng bộ ở page → tránh delay 1-2s khi chuyển module. */
  window.loadProductImages = function () {
    if (window.PRODUCT_IMAGES) return Promise.resolve(window.PRODUCT_IMAGES);
    if (window._piLoadingPromise) return window._piLoadingPromise;
    window._piLoadingPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      /* Relative path từ /pages/*.html */
      s.src = '../data/product-images.js';
      s.async = true;
      s.onload  = () => resolve(window.PRODUCT_IMAGES || {});
      s.onerror = () => { console.warn('[shared] load product-images.js failed'); resolve({}); };
      document.head.appendChild(s);
    });
    return window._piLoadingPromise;
  };

  /* Auto-inject cross-module-hooks.js + usage-tracker.js vào mọi page */
  if (!document.querySelector('script[src*="cross-module-hooks"]')) {
    const s = document.createElement('script');
    s.src = '../scripts/cross-module-hooks.js';
    s.async = false;
    setTimeout(() => document.head.appendChild(s), 50);
  }
  if (!document.querySelector('script[src*="usage-tracker"]')) {
    const s2 = document.createElement('script');
    s2.src = '../scripts/usage-tracker.js';
    s2.async = false;
    setTimeout(() => document.head.appendChild(s2), 100);
  }
  if (!document.querySelector('script[src*="tg-auto-trigger"]')) {
    const s3 = document.createElement('script');
    s3.src = '../scripts/tg-auto-trigger.js';
    s3.async = false;
    setTimeout(() => document.head.appendChild(s3), 150);
  }
  if (!document.querySelector('script[src*="google-sheets-sync"]')) {
    const s4 = document.createElement('script');
    s4.src = '../scripts/google-sheets-sync.js';
    s4.async = false;
    setTimeout(() => document.head.appendChild(s4), 200);
  }

  /* Register service worker (chỉ trên HTTPS / localhost) */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => console.warn('[PWA] SW register failed:', err));
    });
  }
})();

/* ============ Brand logo =============
   - Có 2 cấp: compact (sidebar) và full (landing).
   - Tự ưu tiên file `assets/logo.png` nếu user drop vào;
     không có thì fallback sang SVG inline bên dưới.
   ===================================================== */
/* Emblem nông sản: huy hiệu tròn xanh + rau lá + cà rốt (hợp logo "TUẤN TÚ FARM") */
window.NSTT_LOGO_INLINE_COMPACT = `
<svg viewBox="0 0 140 90" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
  <g>
    <circle cx="70" cy="45" r="38" fill="#E8F5E2"/>
    <circle cx="70" cy="45" r="38" fill="none" stroke="#339B21" stroke-width="3.5"/>
    <!-- Rau lá -->
    <circle cx="61" cy="49" r="19" fill="#4EB83C"/>
    <path d="M61 30 C 50 37 47 52 55 64" fill="none" stroke="#2A7D1A" stroke-width="2" stroke-linecap="round"/>
    <path d="M61 30 C 72 37 75 52 67 64" fill="none" stroke="#2A7D1A" stroke-width="2" stroke-linecap="round"/>
    <path d="M43 49 C 54 47 68 47 79 49" fill="none" stroke="#2A7D1A" stroke-width="2" stroke-linecap="round"/>
    <circle cx="61" cy="49" r="5.5" fill="#2A7D1A"/>
    <!-- Cà rốt -->
    <g transform="rotate(30 86 52)">
      <path d="M82 47 L90 47 L86 70 Z" fill="#E8862E"/>
      <path d="M82 47 C 79 39 85 37 86 43 C 87 37 93 39 90 47 Z" fill="#2A7D1A"/>
    </g>
  </g>
</svg>`;

window.NSTT_LOGO_INLINE_FULL = `
<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
  <g>
    <circle cx="100" cy="46" r="40" fill="#E8F5E2"/>
    <circle cx="100" cy="46" r="40" fill="none" stroke="#339B21" stroke-width="3.5"/>
    <circle cx="91" cy="50" r="20" fill="#4EB83C"/>
    <path d="M91 30 C 79 37 76 53 85 66" fill="none" stroke="#2A7D1A" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M91 30 C 103 37 106 53 97 66" fill="none" stroke="#2A7D1A" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M72 50 C 84 48 98 48 110 50" fill="none" stroke="#2A7D1A" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="91" cy="50" r="6" fill="#2A7D1A"/>
    <g transform="rotate(30 118 54)">
      <path d="M114 48 L122 48 L118 72 Z" fill="#E8862E"/>
      <path d="M114 48 C 111 40 117 38 118 44 C 119 38 125 40 122 48 Z" fill="#2A7D1A"/>
    </g>
    <text x="100" y="111" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif"
          font-weight="900" font-size="17" fill="#1B5E20" letter-spacing="1">TUẤN TÚ FARM</text>
    <text x="100" y="125" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
          font-weight="600" font-size="10" fill="#339B21" letter-spacing="0.5">Nông sản Hà Nội</text>
  </g>
</svg>`;

/* Trả về HTML cho logo — ưu tiên user-uploaded → assets/logo.png → inline SVG */
window.brandLogo = function(size = 'compact', basePath = '../') {
  /* 1. Logo user upload qua Settings (lưu base64 trong STORE) */
  try {
    const userLogo = window.STORE?.get('companyLogo', null);
    if (userLogo && userLogo.dataURL) {
      return `<img src="${userLogo.dataURL}" alt="${userLogo.fileName||'Logo'}"
               style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px">`;
    }
  } catch (e) {}
  /* 2. Logo file static trong assets/ */
  /* 3. Fallback SVG inline */
  return `<img src="${basePath}assets/logo.png" alt="Nông Sản Tuấn Tú"
           style="max-width:100%;max-height:100%;object-fit:contain"
           onerror="this.outerHTML=window.NSTT_LOGO_INLINE_${size === 'full' ? 'FULL' : 'COMPACT'}">`;
};

/* ============ Color palette cho avatar (hash từ id) ============ */
window.AVATAR_COLORS = ['#339B21','#1B5E20','#E8A33D','#7C3AED','#0EA5E9','#15803D','#B45309','#DB2777','#0891B2','#65A30D'];

/* ============ Format helpers ============ */
window.fmt = function(n) { return (n ?? 0).toLocaleString('vi-VN'); };
window.fmtVND = function(n) { return window.fmt(n) + ' ₫'; };
window.fmtShort = function(n) {
  if (n >= 1_000_000_000) return (n/1_000_000_000).toFixed(1).replace(/\.0$/,'') + ' tỷ';
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,'') + ' tr';
  if (n >= 1_000) return (n/1_000).toFixed(0) + 'k';
  return window.fmt(n);
};

window.initials = function(name) {
  return name
    .replace(/Cty\s+(TNHH|CP|CỔ PHẦN)\s+/i, '')
    .replace(/Shop\s+/i, '')
    .replace(/Anh\s+|Chị\s+/i, '')
    .trim()
    .split(/\s+/).slice(0, 2)
    .map(x => x[0] || '').join('').toUpperCase();
};

window.avatarColor = function(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return window.AVATAR_COLORS[h % window.AVATAR_COLORS.length];
};

/* ============ Date helpers — KHÔNG HARDCODE NGÀY ============
   Cũ: app hardcode 18/05/2026 vì lúc gen seed là ngày đó.
   Mới: dùng runtime. Demo data 17-18/05 sẽ hiện "cũ" — đúng nghĩa. */
window.todayISO = function() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
window.todayDate = function() { return new Date(); };
window.todayVN = function() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};
window.productById = function(id) {
  return window.STORE.get('products', window.PRODUCTS || []).find(p => p.id === id) || null;
};
/* Bản ghi giá áp dụng cho 1 ngày: mới nhất có date ≤ dateISO (fallback: bản sớm nhất) */
window.priceEntryOn = function(product, dateISO) {
  const h = (product && product.priceHistory) || [];
  if (!h.length) return null;
  const sorted = [...h].sort((a, b) => a.date < b.date ? -1 : 1);
  let chosen = null;
  for (const e of sorted) { if (e.date <= dateISO) chosen = e; }
  return chosen || sorted[0];
};
/* Giá bán của 1 sản phẩm tại 1 ngày (số) */
window.priceOn = function(productId, dateISO) {
  const e = window.priceEntryOn(window.productById(productId), dateISO || window.todayISO());
  return e ? e.sell : 0;
};

/* ============================================================
   INLINE EDIT — click cell = sửa nhanh, không cần nút Edit
   ────────────────────────────────────────────────────────────
   Dùng:
     window.attachInlineEdit('#tableSelector', {
       store: 'customers',                  // STORE key
       idAttr: 'data-id',                   // attribute trên <tr> chứa id
       fields: {                            // map theo data-field trên <td>
         name:       { type: 'text' },
         phone:      { type: 'text', validate: v => /^[0-9\s+()-]{6,15}$/.test(v) || 'SĐT không hợp lệ' },
         group:      { type: 'select', options: () => window.MD.get('custGroups').map(g => g.id) },
         note:       { type: 'textarea' },
         revenue:    { type: 'number', format: v => window.fmt(v), parse: v => +String(v).replace(/[^0-9.-]/g,'')||0 },
       }
     });
   ============================================================ */
window.attachInlineEdit = function (tableSel, cfg) {
  const tbl = document.querySelector(tableSel);
  if (!tbl) return 0;
  const idAttr = cfg.idAttr || 'data-id';
  const store  = cfg.store;
  if (!store || !window.STORE) return 0;

  let bound = 0;
  /* Container có data-id (linh hoạt: <tr> bảng HOẶC <div class="card">) */
  tbl.querySelectorAll(`[${idAttr}]`).forEach(rowEl => {
    const id = rowEl.getAttribute(idAttr);
    if (!id) return;
    rowEl.querySelectorAll('[data-field]').forEach(cellEl => {
      const field = cellEl.dataset.field;
      const fc = cfg.fields?.[field];
      if (!fc) return;
      if (cellEl.dataset.editBound === '1') return;
      cellEl.dataset.editBound = '1';
      cellEl.classList.add('cell-editable');
      cellEl.title = cellEl.title || 'Click để sửa nhanh';
      cellEl.addEventListener('click', (e) => {
        e.stopPropagation();
        _openEditor(cellEl, id, field, fc, cfg);
      });
      cellEl.addEventListener('dblclick', (e) => e.stopPropagation());
      bound++;
    });
  });
  return bound;
};

function _openEditor(td, id, field, fc, cfg) {
  if (td.querySelector('input, select, textarea')) return; /* đã mở */
  const originalHtml = td.innerHTML;
  /* Lấy raw value từ STORE thay vì parse text — chuẩn xác hơn */
  const arr = window.STORE.get(cfg.store, []) || [];
  const row = arr.find(x => (x.id === id || x.code === id || x.no === id));
  let rawVal = row ? row[field] : td.textContent.trim();
  if (fc.format && typeof rawVal !== 'undefined' && rawVal !== null) {
    /* nothing — rawVal is the raw value */
  }
  let inputEl;
  if (fc.type === 'select') {
    const opts = typeof fc.options === 'function' ? fc.options(row) : (fc.options || []);
    inputEl = document.createElement('select');
    inputEl.className = 'cell-input';
    opts.forEach(o => {
      const val = typeof o === 'object' ? (o.value ?? o.id ?? o.label) : o;
      const lbl = typeof o === 'object' ? (o.label ?? o.name ?? val) : o;
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = lbl;
      if (val == rawVal) opt.selected = true;
      inputEl.appendChild(opt);
    });
  } else if (fc.type === 'textarea') {
    inputEl = document.createElement('textarea');
    inputEl.className = 'cell-input cell-textarea';
    inputEl.rows = 3;
    inputEl.value = rawVal == null ? '' : String(rawVal);
  } else {
    inputEl = document.createElement('input');
    inputEl.className = 'cell-input';
    inputEl.type = fc.type === 'number' ? 'text' : (fc.type || 'text');
    inputEl.value = rawVal == null ? '' : String(rawVal);
  }
  td.innerHTML = '';
  td.appendChild(inputEl);
  inputEl.focus();
  if (inputEl.select) inputEl.select();

  let saved = false;
  const restore = (newVal, ok) => {
    if (saved) return;
    saved = true;
    if (ok && newVal !== rawVal) {
      try {
        if (row) row[field] = newVal;
        if (typeof fc.afterSave === 'function') fc.afterSave(row, newVal);
        window.STORE.update(cfg.store, id, { [field]: newVal });
        td.innerHTML = (fc.format ? fc.format(newVal, row) : (newVal == null ? '' : String(newVal)));
        td.classList.add('cell-saved');
        setTimeout(() => td.classList.remove('cell-saved'), 1200);
        if (window.toast) window.toast('✓ Đã lưu', 'success');
      } catch (e) {
        td.innerHTML = originalHtml;
        if (window.toast) window.toast('Lỗi lưu: ' + e.message, 'warn');
      }
    } else {
      td.innerHTML = originalHtml;
    }
  };

  const commit = () => {
    let v = inputEl.value;
    if (fc.parse) v = fc.parse(v);
    else if (fc.type === 'number') v = +String(v).replace(/[^0-9.-]/g,'') || 0;
    else v = (typeof v === 'string') ? v.trim() : v;
    if (fc.validate) {
      const r = fc.validate(v);
      if (r !== true) { if (window.toast) window.toast(r || 'Giá trị không hợp lệ', 'warn'); inputEl.focus(); return; }
    }
    restore(v, true);
  };
  const cancel = () => restore(null, false);

  inputEl.addEventListener('blur', commit);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (fc.type !== 'textarea' || e.ctrlKey || e.metaKey)) {
      e.preventDefault(); inputEl.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault(); saved = true; td.innerHTML = originalHtml;
    }
  });
}

/* ============================================================
   BULK OPERATIONS — checkbox select + bulk toolbar
   ────────────────────────────────────────────────────────────
   Dùng:
     window.attachBulkOps({
       tableSelector:   '#tblCustomers',
       store:           'customers',
       idAttr:          'data-id',          // hoặc data-code, data-no
       label:           'KH',
       actions: {                            // optional custom actions
         changeStatus: { label: '🔄 Đổi trạng thái', options: ['active','inactive'] }
       }
     });
   Bulk toolbar tự xuất hiện khi ≥1 row được tick.
   ============================================================ */
window.attachBulkOps = function (opts) {
  const tbl = document.querySelector(opts.tableSelector);
  if (!tbl) return;
  const idAttr = opts.idAttr || 'data-id';
  const store = opts.store;
  const label = opts.label || 'mục';

  /* Lấy hoặc tạo toolbar */
  let toolbar = document.querySelector(`#bulk-toolbar-${store}`);
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'bulk-toolbar-' + store;
    toolbar.className = 'bulk-toolbar';
    toolbar.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--navy);color:#fff;padding:10px 18px;border-radius:99px;box-shadow:0 8px 24px rgba(0,0,0,0.25);display:none;z-index:1000;gap:10px;align-items:center;font-size:13px';
    document.body.appendChild(toolbar);
  }

  /* Wire checkbox cells — linh hoạt: <tr data-id> bảng HOẶC <div.card data-id>.
     Chỉ tính row có .checkbox.on bên trong → nút action có data-id không bị lẫn. */
  function getSelectedIds() {
    const rows = tbl.querySelectorAll(`[${idAttr}]`);
    const selected = [];
    rows.forEach(r => {
      const cb = r.querySelector('.checkbox.on, input[type="checkbox"]:checked');
      if (cb) selected.push(r.getAttribute(idAttr));
    });
    return [...new Set(selected)];
  }

  function updateToolbar() {
    const ids = getSelectedIds();
    if (ids.length === 0) {
      toolbar.style.display = 'none';
      return;
    }
    toolbar.style.display = 'flex';
    const customActions = opts.actions || {};
    let actionsHtml = '';
    if (customActions.changeStatus) {
      const opts2 = customActions.changeStatus.options.map(o => `<option value="${typeof o==='object'?o.id:o}">${typeof o==='object'?o.label:o}</option>`).join('');
      actionsHtml += `<select id="bulk-status-${store}" style="background:#fff;color:var(--navy);border:none;border-radius:6px;padding:5px 8px;font-weight:600;font-size:12.5px;cursor:pointer">
        <option value="">${customActions.changeStatus.label || 'Đổi TT'}</option>${opts2}
      </select>`;
    }
    toolbar.innerHTML = `
      <span style="font-weight:700">✓ Đã chọn ${ids.length} ${label}</span>
      <button onclick="window._bulkClear_${store}()" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.3);padding:5px 11px;border-radius:6px;font-size:12.5px;cursor:pointer">Bỏ chọn</button>
      <button onclick="window._bulkExport_${store}()" style="background:#fff;color:var(--navy);border:none;padding:5px 11px;border-radius:6px;font-weight:600;font-size:12.5px;cursor:pointer">📥 Export CSV</button>
      ${actionsHtml}
      <button onclick="window._bulkDelete_${store}()" style="background:var(--danger);color:#fff;border:none;padding:5px 11px;border-radius:6px;font-weight:600;font-size:12.5px;cursor:pointer">🗑 Xóa ${ids.length}</button>
    `;
    /* Wire bulk status change */
    const statusSel = document.getElementById(`bulk-status-${store}`);
    if (statusSel) statusSel.onchange = () => {
      if (!statusSel.value) return;
      const ids = getSelectedIds();
      if (!ids.length) return;
      const fieldName = (opts.actions && opts.actions.changeStatus && opts.actions.changeStatus.field) || 'status';
      if (!confirm(`Đổi ${fieldName === 'status' ? 'trạng thái' : fieldName} của ${ids.length} ${label} thành "${statusSel.value}"?`)) return;
      const list = window.STORE.get(store, []) || [];
      let count = 0;
      ids.forEach(id => {
        const item = list.find(x => x.id === id || x.code === id || x.no === id);
        if (item) { item[fieldName] = statusSel.value; count++; }
      });
      window.STORE.set(store, list);
      window.toast?.(`✓ Đã đổi ${count} ${label}`, 'success');
      window[`_bulkClear_${store}`]();
    };
  }

  /* Expose bulk actions vào window */
  window[`_bulkClear_${store}`] = function () {
    tbl.querySelectorAll('.checkbox.on, input[type="checkbox"]:checked').forEach(cb => {
      if (cb.classList) cb.classList.remove('on');
      if (cb.checked != null) cb.checked = false;
    });
    updateToolbar();
  };
  window[`_bulkDelete_${store}`] = function () {
    const ids = getSelectedIds();
    if (!ids.length) return;
    if (!confirm(`⚠️ Xóa ${ids.length} ${label}? Hành động này KHÔNG THỂ HOÀN TÁC.`)) return;
    ids.forEach(id => window.STORE.remove(store, id));
    window.toast?.(`🗑 Đã xóa ${ids.length} ${label}`, 'danger');
    window[`_bulkClear_${store}`]();
  };
  window[`_bulkExport_${store}`] = function () {
    const ids = getSelectedIds();
    if (!ids.length) return;
    const list = window.STORE.get(store, []) || [];
    const selected = list.filter(x => ids.includes(x.id || x.code || x.no));
    if (!selected.length) return;
    /* CSV header từ keys của item đầu */
    const keys = Object.keys(selected[0]).filter(k => !k.startsWith('_') && typeof selected[0][k] !== 'object');
    const csv = [keys.join(',')].concat(
      selected.map(it => keys.map(k => `"${String(it[k]||'').replace(/"/g,'""')}"`).join(','))
    ).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${store}-export-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    window.toast?.(`⬇ Đã xuất ${selected.length} ${label}`, 'success');
  };

  /* Bind checkbox clicks (delegate) */
  tbl.addEventListener('click', (e) => {
    const cb = e.target.closest('.checkbox, input[type="checkbox"]');
    if (cb && tbl.contains(cb)) {
      e.stopPropagation();
      setTimeout(updateToolbar, 50);
    }
  });

  /* Header "select all" checkbox — tìm ở nhiều vị trí:
     1. opts.selectAllSelector (custom)
     2. thead .checkbox (trong header table)
     3. .table-head .checkbox (panel trên table - customers/orders pattern)
     4. parent của table có .checkbox (cards pattern) */
  let headerCb = null;
  if (opts.selectAllSelector) headerCb = document.querySelector(opts.selectAllSelector);
  if (!headerCb) headerCb = tbl.querySelector('thead .checkbox, thead input[type="checkbox"]');
  if (!headerCb) {
    /* Tìm checkbox trong .table-head sibling */
    const tableCard = tbl.closest('.table-card');
    if (tableCard) headerCb = tableCard.querySelector('.table-head .checkbox, .table-head input[type="checkbox"]');
  }
  if (!headerCb) {
    /* Tìm trong parent container (suppliers card layout) */
    const parent = tbl.parentElement;
    if (parent) headerCb = parent.querySelector(':scope > .checkbox');
  }

  if (headerCb && !headerCb.dataset.bulkBound) {
    headerCb.dataset.bulkBound = '1';
    headerCb.addEventListener('click', (e) => {
      e.stopPropagation();
      setTimeout(() => {
        const turnOn = headerCb.classList ? headerCb.classList.contains('on') : headerCb.checked;
        /* Tích tất cả checkbox row (cả trong tbody của table HOẶC sub-divs của container) */
        const rowCbs = tbl.querySelectorAll('tbody .checkbox, tbody input[type="checkbox"], [data-id] > .checkbox, .sup-card .checkbox');
        rowCbs.forEach(cb => {
          if (cb.classList) {
            if (turnOn) cb.classList.add('on'); else cb.classList.remove('on');
          }
          if (cb.checked != null) cb.checked = turnOn;
        });
        updateToolbar();
      }, 50);
    });
  }

  /* Init: update toolbar on initial render */
  updateToolbar();
};

/* ============ Navigation config ============ */
window.NAV = [
  { section: 'Vận hành', items: [
    { id: 'dashboard',  label: 'Dashboard',   icon: '📊', href: 'dashboard.html' },
    { id: 'orders',     label: 'Đơn hàng',    icon: '📦', href: 'orders.html', badgeKey: 'orders' },
    { id: 'quotes',     label: 'Báo giá',     icon: '📝', href: 'quotes.html' },
    { id: 'recurring',  label: 'Đơn định kỳ', icon: '🔁', href: 'recurring.html' },
    { id: 'customers',  label: 'Khách hàng',  icon: '👥', href: 'customers.html', badgeKey: 'customers' },
    /* Ẩn theo yêu cầu: Chân dung KH 360° + Lead/Tiềm năng
    { id: 'customers-360', label: 'Chân dung KH 360°', icon: '🔍', href: 'customers-360.html' },
    { id: 'leads',      label: 'Lead/Tiềm năng', icon: '🎯', href: 'leads.html' },
    */
    { id: 'shippers',   label: 'Shipper',     icon: '🛵', href: 'shippers.html' },
  ]},
  { section: 'Kho & Mua hàng', items: [
    { id: 'products',   label: 'Sản phẩm & Giá', icon: '🥬', href: 'products.html' },
    { id: 'inventory',  label: 'Kho / Tồn',   icon: '📥', href: 'inventory.html' },
    { id: 'suppliers',  label: 'Nhà cung cấp', icon: '🏭', href: 'suppliers.html' },
    { id: 'purchases',  label: 'Phiếu nhập',  icon: '📦', href: 'purchases.html' },
    { id: 'returns',    label: 'Trả hàng',    icon: '↩️', href: 'returns.html' },
  ]},
  { section: 'Tài chính', items: [
    { id: 'accounting', label: 'Kế toán',     icon: '💰', href: 'accounting.html' },
    { id: 'debt',       label: 'Công nợ',     icon: '📉', href: 'debt.html', badgeKey: 'debt' },
    { id: 'invoices',   label: 'Hóa đơn',     icon: '🧾', href: 'invoices.html' },
    { id: 'adspend',    label: 'Chi phí Ads', icon: '📣', href: 'adspend.html' },
    /* Ẩn theo yêu cầu: Loyalty (chiết khấu/tích điểm)
    { id: 'loyalty',    label: 'Loyalty (tích điểm)', icon: '⭐', href: 'loyalty.html' },
    */
  ]},
  { section: 'Quản trị', items: [
    { id: 'staff',      label: 'Nhân viên',   icon: '🧑‍💼', href: 'staff.html' },
    { id: 'payroll',    label: 'Chấm công & Lương', icon: '📅', href: 'payroll.html' },
    { id: 'reports',    label: 'Báo cáo',     icon: '📈', href: 'reports.html' },
    { id: 'marketing',  label: 'Email/Zalo blast', icon: '📨', href: 'marketing.html' },
    { id: 'audit',      label: 'Nhật ký',     icon: '📋', href: 'audit.html' },
    /* tg-bot.html ẩn — chỉ là simulator demo, chưa hoạt động thật.
       Khi có backend Telegram webhook thật → unhide lại. */
    { id: 'settings',   label: 'Cài đặt',     icon: '⚙️', href: 'settings.html' },
    { id: 'docs',       label: 'Hướng dẫn',   icon: '📖', href: 'docs.html' },
  ]},
];

/* Admin hiện tại — default fallback nếu chưa login (auth.js sẽ override) */
window.CURRENT_USER = {
  name: 'Khách',
  initials: '?',
  role: 'Chưa đăng nhập',
};

/* === Master data dùng chung ============================ */

/* Nhóm hàng (dùng làm chip lọc + "nhóm hàng chính" của đơn). Khớp PRODUCT_CATEGORIES (catalogue thật). */
window.SERVICE_TYPES = [
  { id: 'rau-ta',        label: 'Rau ta',        icon: '🥬', color: '#15803D' },
  { id: 'rau-dalat',     label: 'Rau Đà Lạt',    icon: '🥗', color: '#16A34A' },
  { id: 'nam',           label: 'Nấm',           icon: '🍄', color: '#A16207' },
  { id: 'rau-vung-mien', label: 'Rau vùng miền', icon: '🌿', color: '#0D9488' },
  { id: 'rau-gia-vi',    label: 'Rau gia vị',    icon: '🌶', color: '#DC2626' },
  { id: 'rau-la',        label: 'Rau lá',        icon: '🥦', color: '#65A30D' },
  { id: 'hang-khac',     label: 'Hàng khác',     icon: '🧺', color: '#7C3AED' },
  { id: 'thit-lon',      label: 'Thịt lợn',      icon: '🐖', color: '#DB2777' },
  { id: 'thit-ga',       label: 'Thịt gà',       icon: '🐓', color: '#CA8A04' },
  { id: 'thit-bo',       label: 'Thịt bò',       icon: '🥩', color: '#B45309' },
  { id: 'khac',          label: 'Khác',          icon: '📦', color: '#6B7280' },
];

/* Hình thức giao (thay phương thức vận chuyển logistics) */
window.TRANSPORT_MODES = [
  { id: 'giao-ngay',  label: 'Giao trong ngày', icon: '🛵' },
  { id: 'dat-truoc',  label: 'Đặt trước / định kỳ', icon: '📅' },
  { id: 'tan-bep',    label: 'Giao tận bếp',    icon: '🍽' },
];

/* ============ MASTER DATA — All editable lists ============
   Mọi dropdown options trong app đều đọc từ đây.
   Edit trong Settings → Master data → save vào STORE.
   ============================================================ */
window.MD_DEFAULTS = {
  services: window.SERVICE_TYPES,
  transportModes: window.TRANSPORT_MODES,
  custGroups: [
    { id:'Mới',      label:'Mới',      color:'#15803D' },
    { id:'Thường',   label:'Thường',   color:'#1E40AF' },
    { id:'VIP',      label:'VIP',      color:'#E8A33D' },
    { id:'Inactive', label:'Không hoạt động', color:'#6B7280' },
  ],
  custTypes: [
    { id:'nha-hang',  label:'🍽 Nhà hàng',        color:'#15803D' },
    { id:'quan-an',   label:'🍜 Quán ăn / Bún phở', color:'#0D9488' },
    { id:'khach-san', label:'🏨 Khách sạn',       color:'#1B5E20' },
    { id:'canteen',   label:'🏭 Bếp ăn / Canteen', color:'#B45309' },
    { id:'cafe',      label:'☕ Quán cafe',        color:'#7C3AED' },
    { id:'cua-hang',  label:'🏪 Cửa hàng / Đại lý', color:'#0891B2' },
    { id:'ca-nhan',   label:'👤 Cá nhân / Hộ GĐ',  color:'#6B7280' },
  ],
  orderFreq: [
    { id:'hang-ngay',    label:'Hằng ngày' },
    { id:'2-3-tuan',     label:'2-3 lần/tuần' },
    { id:'hang-tuan',    label:'Hằng tuần' },
    { id:'thinh-thoang', label:'Thỉnh thoảng' },
  ],
  sources: [
    { id:'gioi-thieu',  label:'Giới thiệu' },
    { id:'web',         label:'Web / SEO' },
    { id:'facebook',    label:'Facebook' },
    { id:'zalo',        label:'Zalo' },
    { id:'sales',       label:'Sales chủ động' },
    { id:'hoi-cho',     label:'Hội chợ / triển lãm' },
    { id:'youtube',     label:'YouTube / TikTok' },
  ],
  units: [
    { id:'kg',      label:'Kg' },
    { id:'bo',      label:'Bó' },
    { id:'mo',      label:'Mớ' },
    { id:'khay',    label:'Khay' },
    { id:'con',     label:'Con' },
    { id:'thung',   label:'Thùng' },
    { id:'hop',     label:'Hộp' },
    { id:'bao',     label:'Bao' },
    { id:'tui',     label:'Túi' },
    { id:'qua',     label:'Quả' },
  ],
  payMethods: [
    { id:'sender',   label:'Người gửi trả' },
    { id:'receiver', label:'Người nhận trả' },
    { id:'congno',   label:'Công nợ' },
  ],
  /* 34 tỉnh/thành VN 2026 (sau sáp nhập 1/7/2025) — khu vực Bắc xếp trước */
  provinces: [
    'Hà Nội','Bắc Ninh','Hưng Yên','Ninh Bình','Phú Thọ','Thái Nguyên',
    'Quảng Ninh','Hải Phòng','Lạng Sơn','Cao Bằng','Tuyên Quang','Lào Cai',
    'Điện Biên','Lai Châu','Sơn La','Thanh Hóa','Nghệ An','Hà Tĩnh',
    'Quảng Trị','Huế','Đà Nẵng','Quảng Ngãi','Gia Lai','Đắk Lắk',
    'Khánh Hòa','Lâm Đồng','Đồng Nai','Tây Ninh','TP. Hồ Chí Minh','Đồng Tháp',
    'Vĩnh Long','An Giang','Cần Thơ','Cà Mau',
  ],
  departments: [
    { id:'gd',    label:'Ban giám đốc' },
    { id:'sales', label:'Sales' },
    { id:'cskh',  label:'CSKH' },
    { id:'ketoan',label:'Kế toán' },
    { id:'vanhanh',label:'Vận hành' },
  ],
  vehicleTypes: [
    { id:'xetai-1.5t',  label:'Xe tải 1.5T' },
    { id:'xetai-2.5t',  label:'Xe tải 2.5T' },
    { id:'xetai-3.5t',  label:'Xe tải 3.5T' },
    { id:'xetai-5t',    label:'Xe tải 5T' },
    { id:'xetai-10t',   label:'Xe tải 10T' },
    { id:'container',   label:'Đầu kéo container' },
    { id:'cau',         label:'Xe cẩu tự hành' },
    { id:'donglanh',    label:'Xe đông lạnh' },
  ],
};

/* Helper: lấy master data — auto từ STORE hoặc fallback default */
window.MD = {
  get(key) {
    return (window.STORE?.get('md_' + key, window.MD_DEFAULTS[key])) || window.MD_DEFAULTS[key] || [];
  },
  save(key, list) {
    window.STORE?.set('md_' + key, list);
  },
  /* Tạo <option> HTML cho 1 master data list */
  options(key, selectedValue, valueField = 'id', labelField = 'label') {
    const list = this.get(key);
    return list.map(item => {
      const value = typeof item === 'object' ? (item[valueField] || item.label) : item;
      const label = typeof item === 'object' ? (item.icon ? item.icon + ' ' + item[labelField] : item[labelField]) : item;
      const sel = value === selectedValue ? 'selected' : '';
      return `<option value="${value}" ${sel}>${label}</option>`;
    }).join('');
  },
};

/* Render sidebar — lọc menu theo permissions của user đang login */
window.renderAppShell = function(activeId, breadcrumbText) {
  const sb = document.querySelector('.sidebar');
  if (sb) {
    /* badge động cho sidebar — tính số thực từ STORE (0 → ẩn) */
    if (!window.navBadgeCount) {
      window.navBadgeCount = function (key) {
        try {
          if (key === 'orders') {
            const o = window.STORE.get('orders', []) || [];
            /* đơn đang xử lý (chưa giao xong / chưa hủy) */
            return o.filter(x => x && !['delivered','done','completed','cancelled','canceled','huy'].includes((x.status||'').toLowerCase())).length || 0;
          }
          if (key === 'customers') {
            return (window.STORE.get('customers', []) || []).length || 0;
          }
          if (key === 'debt') {
            const cs = window.STORE.get('customers', []) || [];
            return cs.filter(c => (+c.debt || 0) > 0).length || 0;
          }
        } catch (e) {}
        return 0;
      };
    }

    /* Lấy danh sách page được phép truy cập */
    const allowedPages = window.AUTH ? window.AUTH.getAllowedMenu() : null;
    const filteredNav = window.NAV.map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (!allowedPages) return true;
        const page = item.href.split('/').pop();
        return allowedPages.includes(page);
      })
    })).filter(g => g.items.length > 0);

    sb.innerHTML = `
      <div class="brand">
        <div class="brand-logo">${window.brandLogo('compact', '../')}</div>
        <div class="brand-text">
          <div class="b1">Nông Sản Tuấn Tú Hà Nội</div>
          <div class="b2">CRM nội bộ</div>
        </div>
      </div>
      <nav class="nav">
        ${filteredNav.map(group => `
          <div class="nav-section">${group.section}</div>
          ${group.items.map(item => {
            /* badge động: tính số thực từ STORE theo badgeKey (0 thì ẩn) */
            let badgeVal = item.badge;
            if (item.badgeKey && window.navBadgeCount) badgeVal = window.navBadgeCount(item.badgeKey);
            return `
            <a href="${item.href}" class="${item.id === activeId ? 'active' : ''}">
              <span class="ico">${item.icon}</span> ${item.label}
              ${badgeVal ? `<span class="badge-n">${badgeVal}</span>` : ''}
            </a>`;
          }).join('')}
        `).join('')}
      </nav>
      <div class="side-foot">
        <div class="avatar" style="background:${window.avatarColor(window.CURRENT_USER.name)}">${window.CURRENT_USER.initials}</div>
        <div class="user-block">
          <div class="u1">${window.CURRENT_USER.name}</div>
          <div class="u2">${window.CURRENT_USER.role}</div>
        </div>
        <button class="icon-btn" title="Đăng xuất" onclick="window.AUTH && window.AUTH.logout()"
                style="color:rgba(255,255,255,0.6)">⏻</button>
      </div>
    `;
  }

  const bc = document.querySelector('.topbar .breadcrumb');
  if (bc && breadcrumbText) {
    bc.innerHTML = `Trang chủ <span>›</span> <b>${breadcrumbText}</b>`;
  }

  /* === Hamburger menu cho mobile === */
  const tb = document.querySelector('.topbar');
  if (tb && !tb.querySelector('.hamburger')) {
    const hb = document.createElement('button');
    hb.className = 'hamburger';
    hb.title = 'Mở menu';
    hb.innerHTML = '☰';
    hb.onclick = () => window.toggleSidebar();
    tb.insertBefore(hb, tb.firstChild);
  }
  /* Overlay để đóng sidebar khi click ngoài */
  if (!document.querySelector('.sidebar-overlay')) {
    const ov = document.createElement('div');
    ov.className = 'sidebar-overlay';
    ov.onclick = () => window.toggleSidebar(false);
    document.body.appendChild(ov);
  }
  /* Auto đóng sidebar khi click vào link nav */
  document.querySelectorAll('.sidebar .nav a').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth <= 980) window.toggleSidebar(false);
    });
  });

  /* Wire chuông 🔔 thông báo */
  if (typeof window.setupNotifications === 'function') window.setupNotifications();
};

/* ============ NOTIFICATIONS (dropdown chuông — nhóm theo loại) ============ */
window.computeNotifications = function () {
  const TODAY_VI = '18/05/2026';
  const orders = window.STORE.get('orders', window.ORDERS || []);
  const customers = window.STORE.get('customers', window.CUSTOMERS || []);
  const ads = window.STORE.get('adspend', window.ADSPEND || []);

  /* Mỗi notif có: id (để mark read), group, icon, title, sub, time, href, color */
  const list = [];

  /* === GROUP: Đơn hàng === */
  const newToday = orders.filter(o => (o.date || '').startsWith(TODAY_VI) && o.status === 'confirmed');
  const pickup = orders.filter(o => o.status === 'pickup');
  const transit = orders.filter(o => o.status === 'transit');
  if (newToday.length) list.push({ id: 'ord-new', group: 'orders', icon: '📦', title: newToday.length + ' đơn mới chờ điều phối', sub: 'Cần xác nhận + gán shipper', time: 'Hôm nay', href: 'orders.html', color: '#3B82F6' });
  if (pickup.length) list.push({ id: 'ord-pickup', group: 'orders', icon: '🛵', title: pickup.length + ' đơn shipper đang lấy hàng', sub: 'Theo dõi tiến độ', time: 'Đang chạy', href: 'orders.html', color: '#F59E0B' });
  if (transit.length) list.push({ id: 'ord-transit', group: 'orders', icon: '🚛', title: transit.length + ' đơn đang trên đường giao', sub: 'Dự kiến giao trong ngày', time: 'Đang giao', href: 'orders.html', color: '#16A34A' });

  /* === GROUP: Công nợ === */
  const overdueCusts = customers.filter(c => (c.debtOverdue || 0) > 0);
  const overdueSum = overdueCusts.reduce((s, c) => s + (c.debtOverdue || 0), 0);
  const debtNoContact = customers.filter(c => {
    if (!c.debt || c.debt <= 0) return false;
    if (!c.lastContact) return true;
    const m = c.lastContact.match(/(\d+)\/(\d+)\/(\d+)/);
    if (!m) return true;
    const d = new Date(+m[3], +m[2]-1, +m[1]);
    const today = new Date(2026, 4, 18);
    return (today - d) / 86400000 > 14;
  });
  if (overdueCusts.length) list.push({ id: 'debt-overdue', group: 'finance', icon: '⏰', title: overdueCusts.length + ' KH có công nợ QUÁ HẠN', sub: 'Tổng ' + ((overdueSum / 1_000_000).toFixed(1)) + ' tr ₫ · cần đôn nợ gấp', time: 'Khẩn cấp', href: 'debt.html', color: '#DC2626' });
  if (debtNoContact.length) list.push({ id: 'debt-stale', group: 'finance', icon: '📞', title: debtNoContact.length + ' KH có nợ chưa liên hệ > 14 ngày', sub: 'Cần gọi nhắc nhở', time: 'Hơn 2 tuần', href: 'debt.html', color: '#EA580C' });

  /* === GROUP: Khách hàng === */
  const inactiveCusts = customers.filter(c => {
    if (!c.lastOrder) return false;
    const m = c.lastOrder.match(/(\d+)\/(\d+)\/(\d+)/);
    if (!m) return false;
    const d = new Date(+m[3], +m[2]-1, +m[1]);
    return (new Date(2026, 4, 18) - d) / 86400000 > 14;
  });
  if (inactiveCusts.length) list.push({ id: 'cust-inactive', group: 'customers', icon: '😴', title: inactiveCusts.length + ' KH ngừng đặt hàng > 14 ngày', sub: 'Cần chăm sóc lại để giữ khách', time: 'Tuần qua', href: 'customers.html', color: '#7C3AED' });

  /* === GROUP: Cảnh báo Ads === */
  const todayAds = ads.filter(a => a.date === '2026-05-18');
  const adSpendToday = todayAds.reduce((s, a) => s + (a.spend || 0), 0);
  if (adSpendToday > 800_000) list.push({ id: 'ads-high', group: 'alert', icon: '📣', title: 'Chi phí Ads hôm nay đã vượt 800k', sub: 'Hiện ' + (adSpendToday/1000).toFixed(0) + 'k ₫ — kiểm tra hiệu quả', time: 'Hôm nay', href: 'adspend.html', color: '#EA580C' });

  /* Sort theo group order: Khẩn cấp → đơn → KH → Ads */
  const GROUP_ORDER = { finance: 0, orders: 1, customers: 2, alert: 3 };
  list.sort((a, b) => (GROUP_ORDER[a.group] || 9) - (GROUP_ORDER[b.group] || 9));

  return list;
};

const NOTIF_GROUP_META = {
  orders:    { label: '📦 Đơn hàng',         bg: '#EFF6FF', color: '#1D4ED8' },
  finance:   { label: '💰 Tài chính / Công nợ', bg: '#FEF2F2', color: '#B91C1C' },
  customers: { label: '👥 Khách hàng',       bg: '#F5F3FF', color: '#6D28D9' },
  alert:     { label: '⚠️ Cảnh báo khác',     bg: '#FFFBEB', color: '#A16207' },
};

function getReadNotifs() { return window.STORE.get('readNotifs', []); }
function markNotifRead(id) {
  const r = getReadNotifs();
  if (!r.includes(id)) { r.push(id); window.STORE.set('readNotifs', r); }
}
function markAllNotifsRead() {
  const list = window.computeNotifications();
  window.STORE.set('readNotifs', list.map(n => n.id));
}

window.setupNotifications = function () {
  const btn = document.querySelector('.topbar .icon-btn[title="Thông báo"]');
  if (!btn || btn.dataset.wired === '1') return;
  btn.dataset.wired = '1';
  refreshNotifBadge(btn);
  btn.style.position = 'relative';
  btn.onclick = (e) => {
    e.stopPropagation();
    const existing = document.getElementById('notif-panel');
    if (existing) { existing.remove(); return; }
    renderNotifPanel(btn);
  };
};

function refreshNotifBadge(btn) {
  const list = window.computeNotifications();
  const read = new Set(getReadNotifs());
  const unread = list.filter(n => !read.has(n.id)).length;
  const dot = btn.querySelector('.dot');
  if (!dot) return;
  if (unread) {
    dot.style.display = '';
    dot.textContent = unread > 9 ? '9+' : unread;
    dot.style.cssText = 'background:var(--danger);color:#fff;font-size:10px;font-weight:700;line-height:14px;text-align:center;min-width:16px;height:16px;border-radius:99px;padding:0 4px;position:absolute;top:-3px;right:-3px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.2)';
  } else { dot.style.display = 'none'; }
}

function renderNotifPanel(btn) {
  const list = window.computeNotifications();
  const read = new Set(getReadNotifs());
  const groups = {};
  list.forEach(n => { (groups[n.group] = groups[n.group] || []).push(n); });
  const unreadCount = list.filter(n => !read.has(n.id)).length;

  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.style.cssText = 'position:absolute;top:100%;right:0;margin-top:8px;width:400px;max-height:560px;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.16);z-index:9000;overflow:hidden;display:flex;flex-direction:column;animation:notif-in 0.18s ease-out';

  /* Inject keyframes once */
  if (!document.getElementById('notif-anim')) {
    const st = document.createElement('style'); st.id = 'notif-anim';
    st.textContent = `@keyframes notif-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
      .notif-item{position:relative;display:flex;gap:10px;padding:10px 14px;text-decoration:none;color:inherit;align-items:flex-start;cursor:pointer;transition:background 0.12s}
      .notif-item:hover{background:#FAFAFB}
      .notif-item.unread::before{content:'';position:absolute;left:6px;top:50%;transform:translateY(-50%);width:6px;height:6px;border-radius:50%;background:var(--red)}
      .notif-item .ic{width:36px;height:36px;border-radius:9px;display:grid;place-items:center;font-size:18px;flex:none;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
      .notif-item .body{flex:1;min-width:0;line-height:1.4}
      .notif-item .ttl{font-weight:600;font-size:13px;color:var(--navy);margin-bottom:1px}
      .notif-item .sub{font-size:11.5px;color:var(--muted)}
      .notif-item .time{font-size:10.5px;color:var(--muted);background:#F3F4F6;padding:1px 7px;border-radius:99px;align-self:flex-start;font-weight:600;white-space:nowrap}
      .notif-group-h{padding:8px 14px;background:#FAFAFB;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;border-top:1px solid var(--line)}
      .notif-group-h:first-of-type{border-top:0}`;
    document.head.appendChild(st);
  }

  let body = '';
  if (list.length) {
    Object.entries(groups).forEach(([gk, items]) => {
      const meta = NOTIF_GROUP_META[gk] || { label: gk, bg: '#FAFAFB', color: 'var(--muted)' };
      body += `<div class="notif-group-h" style="background:${meta.bg};color:${meta.color}">${meta.label} <span style="margin-left:auto;float:right;background:#fff;color:${meta.color};padding:1px 7px;border-radius:99px">${items.length}</span></div>`;
      items.forEach(n => {
        const isUnread = !read.has(n.id);
        body += `<a class="notif-item ${isUnread ? 'unread' : ''}" href="${n.href}" data-nid="${n.id}">
          <div class="ic" style="background:${n.color}">${n.icon}</div>
          <div class="body">
            <div class="ttl">${n.title}</div>
            <div class="sub">${n.sub}</div>
          </div>
          <div class="time">${n.time}</div>
        </a>`;
      });
    });
  } else {
    body = `<div style="padding:50px 20px;text-align:center;color:var(--muted)">
      <div style="font-size:48px;margin-bottom:8px">🎉</div>
      <div style="font-weight:600;color:var(--navy);font-size:14px">Mọi thứ ổn định</div>
      <div style="font-size:12px;margin-top:4px">Không có thông báo cần xử lý ngay.</div>
    </div>`;
  }

  panel.innerHTML = `
    <div style="padding:12px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;background:linear-gradient(180deg,#F0FDF4 0%,#fff 100%)">
      <span style="font-size:20px">🔔</span>
      <div style="flex:1">
        <div style="font-weight:800;font-size:14px;color:var(--navy)">Thông báo</div>
        <div style="font-size:11px;color:var(--muted);font-weight:500">${list.length ? unreadCount + ' chưa đọc · ' + list.length + ' tổng' : 'Trống'}</div>
      </div>
      ${unreadCount ? '<button id="notifMarkAll" style="font-size:11px;padding:5px 10px;background:#fff;color:var(--red);border:1px solid var(--line);border-radius:6px;cursor:pointer;font-weight:600">✓ Đã đọc tất cả</button>' : ''}
    </div>
    <div style="flex:1;overflow-y:auto">${body}</div>
    ${list.length ? `<div style="padding:8px 14px;border-top:1px solid var(--line);text-align:center"><a href="reports.html" style="font-size:11.5px;color:var(--red);font-weight:600;text-decoration:none">📊 Xem tất cả báo cáo →</a></div>` : ''}
  `;
  btn.appendChild(panel);

  /* Wire mark-as-read on click + mark-all-read */
  panel.querySelectorAll('.notif-item').forEach(a => {
    a.addEventListener('click', () => {
      markNotifRead(a.dataset.nid);
      refreshNotifBadge(btn);
    });
  });
  const markAllBtn = panel.querySelector('#notifMarkAll');
  if (markAllBtn) {
    markAllBtn.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      markAllNotifsRead();
      panel.remove();
      refreshNotifBadge(btn);
      if (window.toast) window.toast('✓ Đã đánh dấu đã đọc tất cả', 'success');
    };
  }

  setTimeout(() => {
    const off = (ev) => { if (!panel.contains(ev.target) && ev.target !== btn) { panel.remove(); document.removeEventListener('click', off); } };
    document.addEventListener('click', off);
  }, 0);
}

window.toggleSidebar = function(force) {
  const sb = document.querySelector('.sidebar');
  const ov = document.querySelector('.sidebar-overlay');
  if (!sb) return;
  const willOpen = typeof force === 'boolean' ? force : !sb.classList.contains('open');
  sb.classList.toggle('open', willOpen);
  ov.classList.toggle('open', willOpen);
  /* Khóa scroll body khi sidebar mở */
  document.body.style.overflow = willOpen ? 'hidden' : '';
};

/* ============ Drawer helpers ============ */
window.openDrawerBg = function() {
  document.getElementById('drawer')?.classList.add('open');
  document.getElementById('drawerBg')?.classList.add('open');
};
window.closeDrawer = function() {
  document.getElementById('drawer')?.classList.remove('open');
  document.getElementById('drawerBg')?.classList.remove('open');
};

/* Tabs binding */
window.bindTabs = function() {
  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const target = document.querySelector(`.tab-pane[data-pane="${t.dataset.tab}"]`);
      if (target) target.classList.add('active');
    };
  });
};

/* ============ Toast notifications ============ */
window.toast = function(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px';
    document.body.appendChild(container);
  }
  const colors = {
    info:    { bg:'#1E40AF', icon:'ℹ' },
    success: { bg:'#15803D', icon:'✓' },
    warn:    { bg:'#B45309', icon:'⚠' },
    danger:  { bg:'#B91C1C', icon:'✕' },
  };
  const c = colors[type] || colors.info;
  const t = document.createElement('div');
  t.style.cssText = `background:${c.bg};color:#fff;padding:10px 16px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.2);font-size:13px;display:flex;align-items:center;gap:8px;animation:toastIn 0.2s ease`;
  t.innerHTML = `<span style="font-size:16px">${c.icon}</span><span>${message}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity 0.3s'; t.style.opacity = '0'; setTimeout(()=>t.remove(), 300); }, 2800);
};

/* ============ Modal helper ============
   MẶC ĐỊNH: KHÔNG đóng modal khi click backdrop (tránh mất form nhập nửa chừng).
   Chỉ đóng khi bấm X, Esc, hoặc nút trong footer.
   Nếu muốn đóng khi click ngoài → truyền opts.dismissOnBackdrop:true */
window.openModal = function(title, bodyHTML, opts = {}) {
  const existing = document.getElementById('modal-bg');
  if (existing) existing.remove();
  const backdropClick = opts.dismissOnBackdrop
    ? `onclick="if(event.target===this)window.closeModal()"`
    : '';
  const html = `
    <div id="modal-bg" class="modal-bg open" ${backdropClick}>
      <div class="modal" style="width:min(${opts.width||'520px'},94vw);max-width:${opts.width||'520px'}">
        <div class="modal-head">
          <h3>${title}</h3>
          <button class="modal-close" onclick="window.closeModal()" title="Đóng (Esc)">✕</button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
        ${opts.footer ? `<div class="modal-foot">${opts.footer}</div>` : ''}
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  /* Esc đóng modal */
  if (!window._modalEscHandler) {
    window._modalEscHandler = (e) => {
      if (e.key === 'Escape' && document.getElementById('modal-bg')) window.closeModal();
    };
    document.addEventListener('keydown', window._modalEscHandler);
  }
};
window.closeModal = function() {
  document.getElementById('modal-bg')?.remove();
};

/* ============ HELP GUIDES ============ */
window.HELP_GUIDES = {
  'tg-bot-token': {
    title: '🤖 Lấy Bot Token từ @BotFather',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Mở Telegram → tìm tài khoản <b>@BotFather</b> (có dấu tick xanh) → bấm <b>Start</b>.</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">Gửi lệnh <code>/newbot</code> trong khung chat.</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">BotFather hỏi tên bot → gõ tên hiển thị, VD: <b>Nông Sản Tuấn Tú Hà Nội</b>.</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">BotFather hỏi username → gõ username KẾT THÚC bằng <code>_bot</code> hoặc <code>bot</code>. VD: <code>vty_logistics_bot</code>. Phải là duy nhất chưa ai dùng.</div></div>
      <div class="guide-step"><div class="num">5</div><div class="body">BotFather trả về 1 đoạn token dạng <code>7891234567:AAH_xyz_abc...</code> → <b>copy vào ô Bot Token</b>.</div></div>
      <div class="guide-callout warn">⚠️ <b>Bảo mật:</b> Token này coi như mật khẩu của bot. Không share, không commit vào Git. Lộ token → người khác có thể chiếm quyền bot.</div>
      <div class="guide-callout tip">💡 Nếu lỡ lộ → quay lại @BotFather gửi <code>/revoke</code> để hủy token cũ, sinh token mới.</div>
    `
  },
  'tg-group-chat-id': {
    title: '👥 Lấy Group Chat ID (group nội bộ NSTT)',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Tạo group Telegram NSTT nội bộ (nếu chưa có) → thêm <b>tất cả NV cần nhận thông báo</b>.</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">Thêm bot <code>@vty_logistics_bot</code> vào group → cấp quyền <b>Admin</b> (để bot gửi tin được).</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Gửi 1 tin nhắn bất kỳ trong group (VD: "test bot").</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">Mở trình duyệt vào URL (thay <code>YOUR_TOKEN</code> bằng Bot Token):<br>
        <code style="word-break:break-all">https://api.telegram.org/bot<b>YOUR_TOKEN</b>/getUpdates</code></div></div>
      <div class="guide-step"><div class="num">5</div><div class="body">Tìm đoạn <code>"chat":{"id":-1001234567890,"title":"NSTT..."</code> → copy số <b>-100xxxxxxxxxx</b> (bao gồm dấu trừ) vào ô Group Chat ID.</div></div>
      <div class="guide-callout info">ℹ️ Group ID Telegram luôn bắt đầu bằng <b>-100</b> và là số âm. Nếu thấy số dương → đó là chat cá nhân, không phải group.</div>
      <div class="guide-callout tip">💡 Cách thay thế: cài bot <b>@RawDataBot</b> vào group → bot sẽ in ra group ID ngay.</div>
    `
  },
  'tg-admin-chat-id': {
    title: '👤 Lấy Admin Chat ID (Telegram cá nhân của bạn)',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Mở Telegram → tìm bot <b>@userinfobot</b> hoặc <b>@RawDataBot</b>.</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">Bấm <b>Start</b> → bot tự động trả về thông tin của bạn.</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Tìm dòng <code>Id: 123456789</code> hoặc <code>"id": 987654321</code> → copy số đó (là số dương ~ 9-10 chữ số) vào ô Admin Chat ID.</div></div>
      <div class="guide-callout info">ℹ️ ID này dùng để bot gửi thông báo riêng cho admin (vd: cảnh báo công nợ quá hạn 90 ngày, đăng kiểm xe gấp...) tách khỏi group chung.</div>
    `
  },
  'ai-api-key-claude': {
    title: '🤖 Lấy API Key — Claude (Anthropic)',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Vào <code>console.anthropic.com</code> → đăng ký / đăng nhập (có thể dùng Google).</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">Vào mục <b>Settings → API Keys</b> ở menu trái.</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Bấm <b>Create Key</b> → đặt tên VD <b>"Nông Sản Tuấn Tú Hà Nội"</b> → bấm Create.</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">Copy key dạng <code>sk-ant-api03-xxx...</code> ngay (chỉ hiện 1 lần).</div></div>
      <div class="guide-step"><div class="num">5</div><div class="body">Nạp tiền vào tài khoản (tab <b>Billing</b>) — tối thiểu $5. Bot xài Claude Haiku 4.5 → ~50đ/đơn parse.</div></div>
      <div class="guide-callout tip">💡 <b>Ước tính chi phí</b>: NSTT 142 đơn/tháng × 50đ = ~7.000 đ/tháng. Rẻ. $5 đầu ~ chạy được 1 năm.</div>
      <div class="guide-callout warn">⚠️ Nếu dùng từ Việt Nam: dùng <b>VPN</b> hoặc thẻ Visa quốc tế để đăng ký được. Anthropic không nhận thẻ VN trực tiếp.</div>
    `
  },
  'ai-api-key-gemini': {
    title: '🤖 Lấy API Key — Gemini (Google)',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Vào <code>aistudio.google.com</code> → đăng nhập bằng tài khoản Google.</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">Bấm nút <b>Get API Key</b> ở góc trên trái.</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Bấm <b>Create API key in new project</b> (hoặc chọn project có sẵn).</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">Copy key dạng <code>AIzaSyA...</code> vào ô API Key.</div></div>
      <div class="guide-callout tip">💡 <b>Miễn phí</b>: Gemini 2.0 Flash free tier 1.500 request/ngày. NSTT chỉ ~5-10 đơn/ngày → dùng free thoải mái.</div>
      <div class="guide-callout info">ℹ️ <b>Khuyến nghị</b> cho NSTT: dùng Gemini Flash (free, đủ tốt) thay vì Claude/OpenAI tốn phí khi chưa cần độ chính xác top-tier.</div>
    `
  },
  'ai-api-key-openai': {
    title: '🤖 Lấy API Key — OpenAI (GPT)',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Vào <code>platform.openai.com</code> → đăng ký / đăng nhập.</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">Vào <b>Settings → API keys</b>.</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Bấm <b>Create new secret key</b> → đặt tên → Create.</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">Copy key dạng <code>sk-proj-xxx...</code> ngay.</div></div>
      <div class="guide-step"><div class="num">5</div><div class="body">Nạp credit ở <b>Billing</b> — tối thiểu $5.</div></div>
      <div class="guide-callout warn">⚠️ OpenAI hiện <b>không nhận thẻ Việt Nam</b>. Cần thẻ Visa/Master quốc tế hoặc dùng dịch vụ trung gian.</div>
    `
  },
  'zalo-oa': {
    title: '💬 Đăng ký Zalo Official Account',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Vào <code>oa.zalo.me</code> → bấm <b>Tạo Official Account</b>.</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">Chọn loại <b>Doanh nghiệp</b> → điền tên, MST, địa chỉ.</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Tải lên: ĐKKD + CCCD chủ DN + ảnh logo. Zalo duyệt 1-3 ngày.</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">Sau khi duyệt → vào <b>Cài đặt → Developer → API</b> để lấy <b>OA Access Token</b>.</div></div>
      <div class="guide-step"><div class="num">5</div><div class="body">Copy token vào NSTT app + setup webhook URL.</div></div>
      <div class="guide-callout info">ℹ️ Khác với Telegram, Zalo OA cần <b>xác minh doanh nghiệp</b>. KH cần follow OA mới chat được. Phí 0đ nhưng có giới hạn 100 tin chủ động/tháng (gói free).</div>
    `
  },
  'google-sheets': {
    title: '📊 Tích hợp Google Sheets — Sao lưu / Đồng bộ',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Vào <code>console.cloud.google.com</code> → tạo project mới (VD: "NSTT Sync").</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">APIs &amp; Services → Library → enable <b>Google Sheets API</b>.</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Credentials → Create credentials → <b>Service Account</b> → tải file JSON.</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">Mở Google Sheets mới → Share với email của service account (dạng <code>xxx@xxx.iam.gserviceaccount.com</code>) với quyền Editor.</div></div>
      <div class="guide-step"><div class="num">5</div><div class="body">Copy <b>Spreadsheet ID</b> (từ URL: <code>/d/<b>ID-Ở-ĐÂY</b>/edit</code>) vào NSTT.</div></div>
      <div class="guide-callout tip">💡 <b>Use case</b>: push doanh thu hàng ngày, công nợ, danh sách KH lên Sheets để xem ngoài app (kế toán, sếp...). Sync 1 chiều NSTT → Sheets.</div>
      <div class="guide-callout warn">⚠️ Service account khác Personal Google — sheet phải share với <b>email service account</b>, không phải email cá nhân.</div>
    `
  },
  'google-maps': {
    title: '🗺 Google Maps API — GPS Tracking',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Vào <code>console.cloud.google.com</code> → tạo project (hoặc dùng project có sẵn).</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">APIs &amp; Services → Library → enable: <b>Maps JavaScript API</b>, <b>Geocoding API</b>, <b>Directions API</b>.</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Credentials → Create API key → copy key dạng <code>AIza...</code>.</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">Restrict key: chỉ allow domain NSTT app + 3 APIs trên (bảo mật).</div></div>
      <div class="guide-step"><div class="num">5</div><div class="body">Bật billing — Google cho <b>$200 free/tháng</b> ≈ 28k load maps + 40k geocode + 40k routes.</div></div>
      <div class="guide-callout warn">⚠️ <b>Lưu ý chi phí</b>: NSTT ~150 đơn/tháng dùng ~$15-30/tháng. Đặt giới hạn budget alert ở $50/tháng phòng chạy quá.</div>
      <div class="guide-callout tip">💡 Nếu chỉ cần track vị trí xe không cần map đẹp → dùng OpenStreetMap + Leaflet <b>miễn phí</b> (xem hướng dẫn riêng).</div>
    `
  },
  'einvoice': {
    title: '🧾 Hóa đơn điện tử (VNPT-Invoice / Misa / EFY)',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Chọn nhà cung cấp HĐĐT: <b>VNPT-Invoice</b> (phổ biến) · <b>Misa MeInvoice</b> (cho DN dùng Misa Bamboo) · <b>EFY</b> (rẻ nhất) · <b>Viettel SInvoice</b>.</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">Đăng ký gói: NSTT cỡ vừa → gói <b>5.000 HĐ/năm ~ 1.5-2 triệu</b> (xài 2-3 năm).</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Nộp hồ sơ đăng ký sử dụng HĐĐT lên Cơ quan Thuế qua eTax (Mẫu 01/ĐKTĐ-HĐĐT). Chờ 1-3 ngày được duyệt.</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">Sau duyệt → vào portal nhà cung cấp → cấu hình <b>ký hiệu HĐ</b> (VD: 1C25TVT), seri, mẫu số (1/001).</div></div>
      <div class="guide-step"><div class="num">5</div><div class="body">Lấy <b>API key / Token</b> từ portal (mục Tích hợp API) → cắm vào NSTT.</div></div>
      <div class="guide-step"><div class="num">6</div><div class="body">Cấu hình <b>chữ ký số</b> (USB Token hoặc HSM cloud) — bắt buộc theo NĐ 123/2020.</div></div>
      <div class="guide-callout info">ℹ️ Sau khi tích hợp, mỗi HĐ phát hành từ NSTT tự push lên CQT real-time. Mã CQT (M-9-chữ-số) trả về tức thì để in lên HĐ.</div>
      <div class="guide-callout warn">⚠️ Theo NĐ 123/2020 + TT 78/2021, <b>BẮT BUỘC HĐĐT từ 01/07/2022</b> với mọi DN. Không thể dùng HĐ giấy truyền thống nữa.</div>
    `
  },
  'sms-brand': {
    title: '📱 SMS Brand Name',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Đăng ký <b>Brand Name</b> (tên hiển thị thay vì số điện thoại) qua nhà cung cấp: <b>Viettel</b>, <b>MobiFone</b>, <b>VinaPhone</b>, hoặc dịch vụ trung gian như <b>eSMS</b>, <b>SpeedSMS</b>, <b>VHT</b>.</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">Brand Name độ dài <b>tối đa 11 ký tự</b>, viết HOA, không dấu. VD: <code>TUANTU</code>, <code>NONGSANTT</code>.</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Cung cấp giấy phép KDVT + MST + mẫu nội dung 5 tin nhắn dự kiến → nhà mạng duyệt 5-10 ngày.</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">Sau duyệt → nạp tiền vào tài khoản (~600đ/SMS chăm sóc, ~800đ/SMS marketing).</div></div>
      <div class="guide-step"><div class="num">5</div><div class="body">Lấy <b>API endpoint + API key</b> từ portal nhà cung cấp → cắm vào NSTT.</div></div>
      <div class="guide-callout tip">💡 <b>Use case</b>: SMS nhắc nợ KH lớn (KH thường không có Zalo), SMS thông báo đơn đã giao, SMS OTP xác nhận.</div>
      <div class="guide-callout info">ℹ️ SMS chăm sóc khách quen được phép gửi bất cứ lúc nào. SMS marketing chỉ được gửi 7:00-22:00.</div>
    `
  },
  'email-smtp': {
    title: '📧 Email SMTP — Gửi mail tự động',
    body: `
      <div class="guide-step"><div class="num">1</div><div class="body">Chọn email provider:<br>• <b>Gmail Workspace</b> (~$6/user/tháng, miễn phí 6 tháng test)<br>• <b>SendGrid</b> (100 mail/ngày free)<br>• <b>Mailgun</b> (5k mail/tháng free)<br>• <b>Brevo</b> (300 mail/ngày free)</div></div>
      <div class="guide-step"><div class="num">2</div><div class="body">Với <b>Gmail</b>: tạo App Password (Account → Security → 2FA → App passwords). Không dùng password Gmail thường vì Google block.</div></div>
      <div class="guide-step"><div class="num">3</div><div class="body">Lấy thông số SMTP:<br>• <b>Host</b>: smtp.gmail.com (Gmail) / smtp.sendgrid.net (SG)<br>• <b>Port</b>: 587 (TLS) hoặc 465 (SSL)<br>• <b>User</b>: email của bạn<br>• <b>Pass</b>: App password vừa tạo</div></div>
      <div class="guide-step"><div class="num">4</div><div class="body">Cắm vào NSTT → test gửi mail thử → check inbox.</div></div>
      <div class="guide-callout tip">💡 <b>Use case</b>: Gửi HĐ điện tử qua email, gửi báo cáo tháng cho KH lớn, gửi xác nhận đơn hàng tự động.</div>
      <div class="guide-callout warn">⚠️ Email Gmail miễn phí giới hạn <b>500 mail/ngày</b>. Vượt → bị tạm khóa. Cho DN nên dùng Workspace hoặc SendGrid.</div>
    `
  },
};

/* ============ INTEGRATIONS METADATA ============ */
window.INTEGRATIONS = [
  {
    id: 'telegram',
    icon: '✈️', color: '#0088CC',
    name: 'Telegram Bot',
    desc: 'Bot gửi báo cáo + bảng giá + phân đơn shipper · cảnh báo tự động',
    guideKey: 'tg-bot-token',
    detailPage: 'telegram', // có tab riêng trong Settings
    fields: [
      { key:'botToken', label:'Bot Token', type:'password', placeholder:'7891234567:AAH...', guideKey:'tg-bot-token' },
      { key:'chatId', label:'Chat ID mặc định', type:'text', placeholder:'-1001234567890 hoặc 123456789', guideKey:'tg-chat-id' },
    ],
  },
  {
    id: 'zalo-oa',
    icon: '💬', color: '#0084FF',
    name: 'Zalo Official Account',
    desc: 'Bot nhận đơn từ chat Zalo · KH cần follow OA',
    guideKey: 'zalo-oa',
    fields: [
      { key:'oaId', label:'OA ID', type:'text', placeholder:'1234567890' },
      { key:'accessToken', label:'OA Access Token', type:'password', placeholder:'oa-access-token...', guideKey:'zalo-oa' },
      { key:'secretKey', label:'OA Secret Key', type:'password', placeholder:'oa-secret-key...' },
      { key:'webhookUrl', label:'Webhook URL', type:'text', placeholder:'https://nongsantuantu.com/webhook/zalo' },
    ],
  },
  {
    id: 'ai-engine',
    icon: '🤖', color: '#7C3AED',
    name: 'AI Form Filler',
    desc: 'Parse chat KH → tự điền đơn hàng (Claude / Gemini / OpenAI)',
    guideKey: 'ai-api-key-gemini',
    fields: [
      { key:'provider', label:'AI Engine', type:'select', options:[
        {v:'gemini', l:'🟢 Gemini 2.0 Flash (FREE)', guide:'ai-api-key-gemini'},
        {v:'claude', l:'Claude Haiku 4.5 (Anthropic)', guide:'ai-api-key-claude'},
        {v:'openai', l:'GPT-4o-mini (OpenAI)', guide:'ai-api-key-openai'},
      ]},
      { key:'apiKey', label:'API Key', type:'password', placeholder:'AIzaSy... / sk-ant... / sk-proj...', dynamicGuide: true },
    ],
  },
  {
    id: 'einvoice',
    icon: '🧾', color: '#F59E0B',
    name: 'Hóa đơn điện tử',
    desc: 'Phát hành HĐ lên Cổng Cơ Quan Thuế (VNPT/Misa/EFY)',
    guideKey: 'einvoice',
    fields: [
      { key:'provider', label:'Nhà cung cấp', type:'select', options:[
        {v:'vnpt', l:'VNPT-Invoice (phổ biến)'},
        {v:'misa', l:'Misa MeInvoice'},
        {v:'efy',  l:'EFY (rẻ)'},
        {v:'viettel', l:'Viettel SInvoice'},
      ]},
      { key:'taxCode', label:'MST DN', type:'text', placeholder:'0109876543' },
      { key:'apiEndpoint', label:'API Endpoint', type:'text', placeholder:'https://api.vnpt-invoice.com.vn/...' },
      { key:'apiUser', label:'API Username', type:'text' },
      { key:'apiKey', label:'API Key / Token', type:'password' },
      { key:'serial', label:'Ký hiệu HĐ', type:'text', placeholder:'1C25TVT' },
      { key:'template', label:'Mẫu số', type:'text', placeholder:'1/001' },
    ],
  },
  {
    id: 'google-sheets',
    icon: '📊', color: '#15803D',
    name: 'Google Sheets',
    desc: 'Đồng bộ Orders / KH / Sổ quỹ / HĐ lên Sheets · qua Apps Script Webhook (miễn phí)',
    guideKey: 'google-sheets',
    fields: [
      { key:'webhookUrl', label:'Apps Script Web App URL', type:'text',
        placeholder:'https://script.google.com/macros/s/AKfy.../exec', guideKey:'google-sheets' },
      { key:'syncFreq', label:'Tần suất đồng bộ', type:'select', options:[
        {v:'realtime', l:'Real-time (mỗi khi có thay đổi)'},
        {v:'hourly', l:'Mỗi giờ'},
        {v:'daily', l:'Hằng ngày (23:00)'},
        {v:'manual', l:'Thủ công (bấm nút)'},
      ]},
    ],
  },
  {
    id: 'sms-brand',
    icon: '📱', color: '#DB2777',
    name: 'SMS Brand Name',
    desc: 'Gửi SMS từ tên DN cho KH (nhắc nợ, thông báo, OTP)',
    guideKey: 'sms-brand',
    fields: [
      { key:'provider', label:'Nhà cung cấp', type:'select', options:[
        {v:'viettel', l:'Viettel SMS Brandname'},
        {v:'mobifone', l:'MobiFone'},
        {v:'esms', l:'eSMS.vn'},
        {v:'speedsms', l:'SpeedSMS'},
        {v:'vht', l:'VHT Mobile'},
      ]},
      { key:'brandName', label:'Brand Name', type:'text', placeholder:'TUANTU', guideKey:'sms-brand' },
      { key:'apiEndpoint', label:'API Endpoint', type:'text', placeholder:'https://rest.esms.vn/MainService.svc/json/...' },
      { key:'apiKey', label:'API Key', type:'password' },
      { key:'apiSecret', label:'API Secret', type:'password' },
    ],
  },
  {
    id: 'email-smtp',
    icon: '📧', color: '#0EA5E9',
    name: 'Email SMTP',
    desc: 'Gửi email tự động (HĐ, báo cáo, xác nhận đơn)',
    guideKey: 'email-smtp',
    fields: [
      { key:'host', label:'SMTP Host', type:'text', placeholder:'smtp.gmail.com', guideKey:'email-smtp' },
      { key:'port', label:'Port', type:'text', placeholder:'587' },
      { key:'secure', label:'SSL/TLS', type:'select', options:[
        {v:'tls', l:'STARTTLS (port 587)'},
        {v:'ssl', l:'SSL (port 465)'},
        {v:'none', l:'None (không khuyến nghị)'},
      ]},
      { key:'user', label:'Email/Username', type:'text', placeholder:'noreply@nongsantuantu.com' },
      { key:'pass', label:'Password / App Password', type:'password' },
      { key:'fromName', label:'Tên hiển thị', type:'text', placeholder:'Nông Sản Tuấn Tú Hà Nội' },
    ],
  },
];

window.openHelpGuide = function(key) {
  const g = window.HELP_GUIDES[key];
  if (!g) {
    window.toast('Hướng dẫn này chưa có sẵn', 'warn');
    return;
  }
  window.openModal(g.title, g.body, {
    footer: `<button class="btn btn-ghost" onclick="closeModal()">Đóng</button>`,
    width: '600px'
  });
};

/* ESC closes drawer + modal */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.closeDrawer();
    window.closeModal();
  }
});

/* Keyboard shortcut Ctrl+K for global search */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.querySelector('.search-global input')?.focus();
  }
});

/* ============ Inject toast animation ============ */
const _styleEl = document.createElement('style');
_styleEl.textContent = `
@keyframes toastIn { from { transform:translateX(20px); opacity:0 } to { transform:translateX(0); opacity:1 } }

/* Modal */
.modal-bg{position:fixed;inset:0;background:rgba(17,24,39,0.5);display:none;align-items:center;justify-content:center;z-index:200;animation:fadeIn 0.15s ease}
.modal-bg.open{display:flex}
.modal{background:#fff;border-radius:12px;width:min(520px,92vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden}
.modal-head{padding:16px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px}
.modal-head h3{margin:0;flex:1;font-size:16px;color:var(--navy);font-weight:700}
.modal-close{width:30px;height:30px;border:1px solid var(--line);background:#fff;border-radius:6px;cursor:pointer;color:var(--muted)}
.modal-close:hover{background:var(--bg);color:var(--text)}
.modal-body{padding:18px 20px;overflow:auto;flex:1}
.modal-foot{padding:14px 20px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end;background:#FAFAFB}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.form-row.wide{grid-template-columns:1fr}
.form-row label{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600;display:block;margin-bottom:4px}
.form-row input:not([type="checkbox"]):not([type="radio"]),
.form-row select, .form-row textarea{
  width:100%;padding:8px 10px;font-size:13px;font-family:inherit;
  border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--text);
}
.form-row input:focus, .form-row select:focus, .form-row textarea:focus{outline:none;border-color:var(--navy)}
.form-row input[type="checkbox"]{width:16px;height:16px;margin:0;cursor:pointer;accent-color:var(--navy)}

/* === Check grid (multi-select dạng tick) === */
.check-grid{display:grid;gap:8px}
.check-grid.cols-2{grid-template-columns:repeat(2,1fr)}
.check-grid.cols-3{grid-template-columns:repeat(3,1fr)}
@media (max-width:560px){.check-grid.cols-2,.check-grid.cols-3{grid-template-columns:1fr}}
.check-item{
  display:flex;align-items:center;gap:8px;
  padding:8px 10px;border:1px solid var(--line);border-radius:7px;
  background:#fff;cursor:pointer;
  font-size:13px;color:var(--text);font-weight:500;
  text-transform:none;letter-spacing:0;
  transition:all 0.1s;
}
.check-item:hover{background:#FAFAFB;border-color:var(--navy-soft)}
.check-item input[type="checkbox"]{width:16px;height:16px;flex-shrink:0;cursor:pointer;accent-color:var(--navy)}
.check-item input[type="checkbox"]:checked + span{font-weight:600}
.check-item:has(input:checked){background:var(--navy-soft);border-color:var(--navy)}

/* === Input có nút Help bên cạnh === */
.input-with-help{position:relative;display:flex;gap:6px;align-items:stretch}
.input-with-help input,
.input-with-help select{flex:1}
.help-btn{
  width:34px;height:34px;flex-shrink:0;
  border:1px solid var(--line);background:#fff;
  border-radius:7px;cursor:pointer;
  display:grid;place-items:center;
  color:var(--muted);font-size:14px;
  transition:all 0.1s;
}
.help-btn:hover{background:var(--navy-soft);color:var(--navy);border-color:var(--navy)}
.help-label{display:inline-flex;align-items:center;gap:5px}
.help-label .help-mini{
  width:16px;height:16px;display:inline-grid;place-items:center;
  background:var(--navy-soft);color:var(--navy);border-radius:50%;
  font-size:10px;font-weight:700;cursor:pointer;
}
.help-label .help-mini:hover{background:var(--navy);color:#fff}

/* === Help guide content === */
.guide-step{
  display:flex;gap:10px;padding:10px 0;
  border-bottom:1px dashed var(--line);
}
.guide-step:last-child{border-bottom:none}
.guide-step .num{
  width:24px;height:24px;border-radius:50%;
  background:var(--navy);color:#fff;
  display:grid;place-items:center;
  font-weight:700;font-size:12px;flex-shrink:0;
}
.guide-step .body{flex:1;font-size:13px;line-height:1.55}
.guide-step .body b{color:var(--navy)}
.guide-step .body code{
  background:#FAFAFB;padding:1px 6px;border-radius:4px;
  font-family:ui-monospace,monospace;font-size:12px;color:var(--red);
  border:1px solid var(--line);
}
.guide-callout{
  padding:10px 12px;border-radius:7px;
  font-size:12.5px;margin-top:12px;
}
.guide-callout.warn{background:#FEF3C7;border:1px solid #FCD34D;color:var(--warn)}
.guide-callout.info{background:#DBEAFE;border:1px solid #93C5FD;color:var(--info)}
.guide-callout.tip{background:#F3E8FF;border:1px solid #E9D5FF;color:#7C3AED}
`;
document.head.appendChild(_styleEl);

/* ============================================================
   DAILY REPORT BUILDER — dùng chung cho Telegram daily report
   - Đọc cấu hình metrics từ STORE.tg_report_config
   - Compute giá trị từng metric từ STORE
   - Trả về { text, lines, metrics } để gửi/preview
   ============================================================ */
/* ============================================================
   TELEGRAM CHANNELS — nhiều group theo mục đích sử dụng
   ============================================================
   STORE.int_telegram = {
     botToken: '123:AAH...',                    // 1 bot, dùng chung
     chatId:   '-100xxx',                        // legacy default (fallback)
     channels: [
       { id:'mgmt', name:'Báo cáo Ban GĐ', chatId:'-100aaa', enabled:true },
       ...
     ],
     routing: {
       daily_report:    'mgmt',                  // gửi vào kênh nào cho purpose này
       shipper_dispatch:'shipper',
       price_update:    'customer_vip',
       alert:           'mgmt',
     }
   }
   ============================================================ */
window.TG_PURPOSES = [
  { id: 'daily_report',     icon: '📊', label: 'Báo cáo ngày', desc: 'Gửi tổng kết cuối ngày cho cấp trên' },
  { id: 'shipper_dispatch', icon: '🚚', label: 'Phân đơn cho Shipper', desc: 'Gửi đơn hàng + lịch ship vào group shipper' },
  { id: 'price_update',     icon: '💰', label: 'Cập nhật bảng giá', desc: 'Gửi bảng giá ngày cho group khách hàng' },
  { id: 'alert',            icon: '⚠️', label: 'Cảnh báo nội bộ', desc: 'Đơn quá hạn, công nợ quá hạn, KH bỏ đặt...' },
];

/* Lấy { botToken, chatId, channelName } theo mục đích.
   Nếu chưa cấu hình → fallback về legacy single chatId. */
window.getTgChannel = function (purposeId) {
  const cfg = window.STORE.get('int_telegram', {});
  if (!cfg.botToken) return null;
  const channels = cfg.channels || [];
  const routing = cfg.routing || {};
  const chId = routing[purposeId];
  if (chId) {
    const ch = channels.find(c => c.id === chId && c.enabled !== false);
    if (ch && ch.chatId) return { botToken: cfg.botToken, chatId: ch.chatId, channelName: ch.name };
  }
  /* Fallback: dùng default chatId cũ */
  if (cfg.chatId) return { botToken: cfg.botToken, chatId: cfg.chatId, channelName: 'Mặc định' };
  return null;
};

/* Gửi tin Telegram tiện ích — return Promise. */
window.sendTgMessage = async function (purposeId, text, opts) {
  const ch = window.getTgChannel(purposeId);
  if (!ch) return { ok: false, error: 'Chưa cấu hình Telegram (Cài đặt → Telegram Bot)' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${ch.botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ch.chatId, text, ...(opts || {}) }),
    });
    const j = await r.json();
    if (j.ok) return { ok: true, channel: ch.channelName };
    return { ok: false, error: j.description || 'Telegram lỗi' };
  } catch (e) { return { ok: false, error: e.message }; }
};


window.TG_REPORT_METRICS = [
  { id:'revenue',     icon:'💰', label:'Doanh thu',                   group:'sales' },
  { id:'orderCount',  icon:'📦', label:'Số đơn (tổng)',                group:'sales' },
  { id:'orderByStatus', icon:'🚦', label:'Số đơn theo trạng thái',     group:'sales' },
  { id:'aov',         icon:'🧮', label:'AOV (giá trị đơn TB)',         group:'sales' },
  { id:'cod',         icon:'💵', label:'COD thu hộ',                   group:'sales' },
  { id:'newCust',     icon:'🆕', label:'KH mới phát sinh',             group:'cust' },
  { id:'activeCust',  icon:'👥', label:'KH active đặt hàng',           group:'cust' },
  { id:'topCust',     icon:'🏆', label:'Top 3 KH lớn nhất ngày',       group:'cust' },
  { id:'debtTotal',   icon:'📉', label:'Công nợ phải thu (tổng)',      group:'finance' },
  { id:'debtOverdue', icon:'⏰', label:'Công nợ quá hạn',              group:'finance' },
  { id:'debtCollected', icon:'💰', label:'Công nợ đã thu trong ngày', group:'finance' },
  { id:'adSpend',     icon:'📣', label:'Chi phí quảng cáo',            group:'finance' },
  { id:'adLeads',     icon:'📊', label:'Số KH/UV từ quảng cáo',        group:'finance' },
  { id:'cogs',        icon:'🥕', label:'Giá vốn hàng bán (COGS)',      group:'profit' },
  { id:'grossProfit', icon:'📈', label:'Lãi gộp (DT − COGS)',          group:'profit' },
  { id:'netProfit',   icon:'💎', label:'Lãi ròng tạm tính (− Ads)',    group:'profit' },
  { id:'topStaff',    icon:'🥇', label:'NV bán tốt nhất ngày',         group:'staff' },
  { id:'topProduct',  icon:'🛒', label:'Top 3 sản phẩm bán chạy',      group:'staff' },
  { id:'shipperLoad', icon:'🛵', label:'Số đơn theo shipper',          group:'staff' },
  { id:'inactiveCust', icon:'⚠️', label:'Cảnh báo KH ngừng đặt > 7 ngày', group:'alert' },
];

window.TG_REPORT_GROUPS = {
  sales:   '💰 Doanh số / Đơn hàng',
  cust:    '👥 Khách hàng',
  finance: '💵 Tài chính / Quảng cáo',
  profit:  '📈 Lợi nhuận',
  staff:   '🧑‍💼 Hiệu suất nhân sự',
  alert:   '⚠️ Cảnh báo',
};

window.TG_REPORT_DEFAULT = {
  metrics: ['revenue','orderCount','cod','newCust','debtTotal','debtOverdue','adSpend','grossProfit','netProfit','topStaff'],
  header: '📊 BÁO CÁO NGÀY {date} — NÔNG SẢN TUẤN TÚ',
  footer: '\n— Gửi tự động từ CRM Nông Sản Tuấn Tú',
  separator: '\n',
};

window.buildDailyReport = function (opts) {
  opts = opts || {};
  const cfg = Object.assign({}, window.TG_REPORT_DEFAULT, window.STORE.get('tg_report_config', {}), opts.overrideConfig || {});
  /* Date: mặc định "today" demo 18/05/2026 */
  const TODAY_VI = opts.dateVi || '18/05/2026';
  const TODAY_ISO = opts.dateIso || '2026-05-18';
  const fmt = n => (n || 0).toLocaleString('vi-VN');
  const fmtShort = n => {
    n = n || 0;
    if (Math.abs(n) >= 1e9) return (n/1e9).toFixed(2) + ' tỷ';
    if (Math.abs(n) >= 1e6) return Math.round(n/1e6) + ' tr';
    if (Math.abs(n) >= 1e3) return Math.round(n/1e3) + 'k';
    return String(n);
  };

  const orders    = window.STORE.get('orders', window.ORDERS || []) || [];
  const customers = window.STORE.get('customers', window.CUSTOMERS || []) || [];
  const products  = window.STORE.get('products', window.PRODUCTS || []) || [];
  const ads       = window.STORE.get('adspend', window.ADSPEND || []) || [];
  const cashEntries = window.STORE.get('cashEntries', []) || [];

  const todayOrders = orders.filter(o => (o.date || '').startsWith(TODAY_VI) && o.status !== 'cancelled');
  const todayAds = ads.filter(a => a.date === TODAY_ISO);

  /* Helpers */
  const buyAt = (p, viDate) => {
    if (!p || !p.priceHistory || !p.priceHistory.length) return null;
    const mm = (viDate || '').match(/(\d+)\/(\d+)\/(\d+)/);
    const d = mm ? new Date(+mm[3], +mm[2]-1, +mm[1]) : null;
    if (!d) return p.priceHistory[p.priceHistory.length-1].buy;
    let best = null;
    p.priceHistory.forEach(h => { const hd = new Date(h.date); if (hd <= d && (!best || hd > new Date(best.date))) best = h; });
    return (best || p.priceHistory[0]).buy;
  };

  /* Compute từng metric (chỉ tính nếu được tick) */
  const METRIC_BUILDERS = {
    revenue: () => {
      const total = todayOrders.reduce((s, o) => s + (o.freight || 0), 0);
      return `💰 Doanh thu: ${fmt(total)}đ (${todayOrders.length} đơn)`;
    },
    orderCount: () => `📦 Số đơn: ${todayOrders.length}`,
    orderByStatus: () => {
      const by = {};
      todayOrders.forEach(o => { by[o.status] = (by[o.status]||0)+1; });
      const LB = { confirmed:'Mới', pickup:'Đang lấy', transit:'Đang giao', delivered:'Đã giao', reconciled:'Đối soát' };
      const parts = Object.entries(by).map(([k,v]) => `${LB[k]||k}: ${v}`);
      return `🚦 Trạng thái đơn: ${parts.join(' · ')}`;
    },
    aov: () => {
      const total = todayOrders.reduce((s, o) => s + (o.freight || 0), 0);
      const aov = todayOrders.length ? total / todayOrders.length : 0;
      return `🧮 AOV: ${fmt(Math.round(aov))}đ/đơn`;
    },
    cod: () => {
      const cod = todayOrders.reduce((s, o) => s + (o.cod || 0), 0);
      return `💵 COD thu hộ: ${fmt(cod)}đ`;
    },
    newCust: () => {
      /* Lọc KH có created hôm nay (best effort - field created dạng dd/mm/yyyy) */
      const newCs = customers.filter(c => (c.created || '').startsWith(TODAY_VI.slice(0,10)));
      return `🆕 KH mới phát sinh: ${newCs.length}${newCs.length ? ' (' + newCs.slice(0,3).map(c=>c.name).join(', ') + (newCs.length>3?'...':'') + ')' : ''}`;
    },
    activeCust: () => {
      const ids = new Set(todayOrders.map(o => o.cust));
      return `👥 KH active đặt hàng: ${ids.size}`;
    },
    topCust: () => {
      const byCust = {};
      todayOrders.forEach(o => { byCust[o.custName] = (byCust[o.custName]||0) + (o.freight||0); });
      const top = Object.entries(byCust).sort((a,b) => b[1]-a[1]).slice(0,3);
      if (!top.length) return `🏆 Top KH: (chưa có đơn)`;
      return `🏆 Top KH: ` + top.map(([n,v]) => `${n} (${fmtShort(v)})`).join(' · ');
    },
    debtTotal: () => {
      const debt = customers.reduce((s, c) => s + (c.debt || 0), 0);
      return `📉 Công nợ phải thu: ${fmt(debt)}đ`;
    },
    debtOverdue: () => {
      const od = customers.reduce((s, c) => s + (c.debtOverdue || 0), 0);
      return `⏰ Công nợ QUÁ HẠN: ${fmt(od)}đ`;
    },
    debtCollected: () => {
      const today = cashEntries.filter(e => e.type === 'in' && (e.date || '').startsWith(TODAY_VI) && (e.desc||'').toLowerCase().includes('công nợ'));
      const sum = today.reduce((s, e) => s + (e.amount || 0), 0);
      return `💰 Công nợ đã thu hôm nay: ${fmt(sum)}đ (${today.length} phiếu)`;
    },
    adSpend: () => {
      const sp = todayAds.reduce((s, a) => s + (a.spend || 0), 0);
      return `📣 Chi phí quảng cáo: ${fmt(sp)}đ (${todayAds.length} chiến dịch)`;
    },
    adLeads: () => {
      const c = todayAds.reduce((s, a) => s + (a.custs || 0), 0);
      const u = todayAds.reduce((s, a) => s + (a.candidates || 0), 0);
      return `📊 Từ quảng cáo: ${c} KH${u ? ' + ' + u + ' ứng viên' : ''}`;
    },
    cogs: () => {
      let cogs = 0;
      todayOrders.forEach(o => {
        (o.items || []).forEach(it => {
          const p = products.find(x => x.id === it.id);
          const bp = p ? (buyAt(p, o.date) || it.price * 0.8) : it.price * 0.8;
          cogs += (bp || 0) * (it.qty || 0);
        });
      });
      return `🥕 Giá vốn (COGS): ${fmt(Math.round(cogs))}đ`;
    },
    grossProfit: () => {
      const rev = todayOrders.reduce((s, o) => s + (o.freight || 0), 0);
      let cogs = 0;
      todayOrders.forEach(o => {
        (o.items || []).forEach(it => {
          const p = products.find(x => x.id === it.id);
          const bp = p ? (buyAt(p, o.date) || it.price * 0.8) : it.price * 0.8;
          cogs += (bp || 0) * (it.qty || 0);
        });
      });
      const gp = rev - cogs;
      const margin = rev ? (gp/rev*100).toFixed(1) : '0';
      return `📈 Lãi gộp: ${fmt(Math.round(gp))}đ (biên ${margin}%)`;
    },
    netProfit: () => {
      const rev = todayOrders.reduce((s, o) => s + (o.freight || 0), 0);
      let cogs = 0;
      todayOrders.forEach(o => {
        (o.items || []).forEach(it => {
          const p = products.find(x => x.id === it.id);
          const bp = p ? (buyAt(p, o.date) || it.price * 0.8) : it.price * 0.8;
          cogs += (bp || 0) * (it.qty || 0);
        });
      });
      const adSp = todayAds.reduce((s, a) => s + (a.spend || 0), 0);
      const np = rev - cogs - adSp;
      return `💎 Lãi ròng (− Ads): ${fmt(Math.round(np))}đ`;
    },
    topStaff: () => {
      const byStaff = {};
      todayOrders.forEach(o => { byStaff[o.staff] = (byStaff[o.staff]||0) + (o.freight||0); });
      const top = Object.entries(byStaff).sort((a,b) => b[1]-a[1])[0];
      return top ? `🥇 NV bán tốt nhất: ${top[0]} (${fmtShort(top[1])})` : `🥇 NV bán tốt nhất: (chưa có)`;
    },
    topProduct: () => {
      const byProd = {};
      todayOrders.forEach(o => (o.items||[]).forEach(it => {
        byProd[it.name||it.id] = (byProd[it.name||it.id] || 0) + (it.qty || 0);
      }));
      const top = Object.entries(byProd).sort((a,b) => b[1]-a[1]).slice(0,3);
      if (!top.length) return `🛒 Top SP bán chạy: (chưa có)`;
      return `🛒 Top SP: ` + top.map(([n,q]) => `${n} (${q}kg)`).join(' · ');
    },
    shipperLoad: () => {
      const by = {};
      todayOrders.forEach(o => { if (o.driverName && o.driverName !== '—') by[o.driverName] = (by[o.driverName]||0)+1; });
      const parts = Object.entries(by).map(([n,c]) => `${n}: ${c}`);
      return `🛵 Shipper: ${parts.length ? parts.join(' · ') : '(chưa gán)'}`;
    },
    inactiveCust: () => {
      /* Best-effort: KH có lastOrder cách hôm nay > 7 ngày */
      const cut = new Date(+TODAY_ISO.slice(0,4), +TODAY_ISO.slice(5,7)-1, +TODAY_ISO.slice(8,10));
      cut.setDate(cut.getDate() - 7);
      const stale = customers.filter(c => {
        if (!c.lastOrder) return false;
        const mm = c.lastOrder.match(/(\d+)\/(\d+)\/(\d+)/);
        if (!mm) return false;
        const d = new Date(+mm[3], +mm[2]-1, +mm[1]);
        return d < cut;
      });
      return `⚠️ KH ngừng đặt > 7 ngày: ${stale.length}${stale.length ? ' (' + stale.slice(0,3).map(c=>c.name).join(', ') + (stale.length>3?'...':'') + ')' : ''}`;
    },
  };

  const lines = [];
  /* Header */
  if (cfg.header) lines.push(cfg.header.replace(/\{date\}/g, TODAY_VI));
  lines.push('');
  /* Body — đúng thứ tự metrics đã chọn */
  (cfg.metrics || []).forEach(mid => {
    const fn = METRIC_BUILDERS[mid];
    if (fn) try { lines.push(fn()); } catch (e) { lines.push(`(lỗi metric ${mid})`); }
  });
  /* Footer */
  if (cfg.footer) lines.push(cfg.footer);

  return { text: lines.join('\n'), lines, metrics: cfg.metrics, dateVi: TODAY_VI };
};
