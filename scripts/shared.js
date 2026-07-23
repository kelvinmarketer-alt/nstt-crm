/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Shared utilities + App shell
   Dùng chung cho mọi trang.
   ========================================================= */

/* Phiên bản app hiển thị (đối chiếu với CACHE_VERSION trong sw.js) — để user tự XÁC NHẬN
   đang chạy bản mới hay còn kẹt JS cũ (hiện ở góc sidebar + log console). */
window.APP_VERSION = 'v517';
console.log('%c[NSTT] App ' + window.APP_VERSION, 'color:#339B21;font-weight:bold');

/* Gom NGUỒN khách về 3 nhóm chuẩn: 'mkt' / 'sales' / 'sep-gioi-thieu'.
   Map cả giá trị CŨ để không vỡ dữ liệu lịch sử:
     facebook/zalo/web/seo/youtube/tiktok/hội chợ/google/social → mkt
     sales / chủ động → sales
     giới thiệu / sếp → sep-gioi-thieu
     import-phiếu / khác / trống → other (KHÔNG tính là MKT).
   Dùng cho dropdown Nguồn (Sửa KH) + tính Doanh thu ads theo nguồn MKT. */
window.srcGroup = function (s) {
  const x = String(s == null ? '' : s).toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[-_]+/g, ' ').trim();
  if (!x) return 'other';
  if (/sale|chu dong/.test(x)) return 'sales';
  if (/gioi thieu|sep|referral/.test(x)) return 'sep-gioi-thieu';
  if (/mkt|market|facebook|fb|zalo|web|seo|youtube|tiktok|hoi cho|google|social|ads/.test(x)) return 'mkt';
  return 'other';
};

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
  /* Favicon tab trình duyệt = SVG (gọn, nét ở size nhỏ) */
  ['icon', 'shortcut icon'].forEach(rel => {
    const l = document.createElement('link');
    l.rel = rel;
    l.type = 'image/svg+xml';
    l.href = faviconDataUrl;
    document.head.appendChild(l);
  });
  /* apple-touch-icon (icon màn hình chính iOS) = LOGO THẬT (PNG) — iOS KHÔNG nhận SVG → trước đây hiện icon đơn giản */
  const _appleIcon = document.createElement('link');
  _appleIcon.rel = 'apple-touch-icon';
  _appleIcon.href = '/assets/apple-touch-icon.png';
  document.head.appendChild(_appleIcon);
  /* Phơi ra global để các popup PDF (delivery-note, price-catalogue, pdf-templates, accounting print)
     có thể tái sử dụng cùng 1 favicon */
  window.NSTT_FAVICON_DATAURL = faviconDataUrl;

  /* Chế độ nhúng iframe (trang gộp): ?embed=1 → ẩn sidebar + topbar */
  try {
    if (new URLSearchParams(location.search).get('embed') === '1') {
      document.documentElement.classList.add('embed');
    }
  } catch (e) {}
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
    /* ⚠️ TỰ ÁP DỤNG BẢN MỚI — hết cảnh "sửa xong mà app vẫn lỗi":
       SW dùng stale-while-revalidate → lần reload ĐẦU sau khi deploy vẫn chạy JS CŨ
       (phải F5 lần 2 / đóng hết tab mới có code mới). Nay: khi SW MỚI (bản deploy mới)
       giành quyền điều khiển → TỰ reload 1 lần để trang chạy ngay code mới.
       hadController: chỉ reload khi ĐÃ có SW trước đó (bản cập nhật), bỏ qua lần cài đầu. */
    const _hadController = !!navigator.serviceWorker.controller;
    let _swReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_swReloaded || !_hadController) return;
      _swReloaded = true;
      console.log('[PWA] ⬆ Đã có bản cập nhật — tự tải lại để áp dụng ngay.');
      location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => { try { reg.update(); } catch (e) {} })   /* chủ động kiểm tra bản mới mỗi lần mở app */
        .catch(err => console.warn('[PWA] SW register failed:', err));
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
/* Đọc SỐ TIỀN THÀNH CHỮ (tiếng Việt) — dùng cho phiếu/hoá đơn "Bằng chữ".
   Chuẩn: 21→hai mươi MỐT, 25→hai mươi LĂM, mười lăm, lẻ. Định nghĩa 1 chỗ (shared) cho MỌI trang. */
window.numberToWords = window.numberToWords || function (n) {
  n = Math.round(+n || 0);
  if (!n) return 'Không đồng';
  const U = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  function below1000(x) {
    const h = Math.floor(x / 100), t = Math.floor(x % 100 / 10), o = x % 10;
    let s = '';
    if (h) s += U[h] + ' trăm';
    if (t > 1) { s += (s ? ' ' : '') + U[t] + ' mươi'; if (o === 1) s += ' mốt'; else if (o === 5) s += ' lăm'; else if (o) s += ' ' + U[o]; }
    else if (t === 1) { s += (s ? ' ' : '') + 'mười'; if (o === 5) s += ' lăm'; else if (o) s += ' ' + U[o]; }
    else if (t === 0 && o && s) { s += ' lẻ ' + U[o]; }
    else if (o) { s += U[o]; }
    return s;
  }
  const ty = Math.floor(n / 1e9), tr = Math.floor(n % 1e9 / 1e6), ng = Math.floor(n % 1e6 / 1e3), dv = n % 1e3;
  let r = '';
  if (ty) r += below1000(ty) + ' tỷ ';
  if (tr) r += below1000(tr) + ' triệu ';
  if (ng) r += below1000(ng) + ' nghìn ';
  if (dv) r += below1000(dv);
  return (r.trim() + ' đồng chẵn').replace(/^./, c => c.toUpperCase());
};
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

/* ============ MATCH SP THEO TÊN — CHẶT (không đoán bừa) ============
   Dùng chung cho mọi luồng AI/Excel (đơn hàng, bảng giá, catalog).
   Nguyên tắc: THÀ KHÔNG KHỚP còn hơn khớp NHẦM sang SP khác.
   - Khớp đúng tuyệt đối tên (đã chuẩn hoá) → nhận.
   - Khớp theo TỪ: chỉ nhận khi TẤT CẢ từ của tên ngắn hơn đều nằm trong tên kia
     (so theo từ trọn vẹn, KHÔNG so chuỗi con → tránh "xanh" dính "Xả"),
     tên ngắn phải có ≥2 từ, và có ≥1 từ "đặc trưng" (không phải từ chung chung).
   Trả về product hoặc null. */
window._matchNorm = function (s) {
  return (s || '').toString().toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
};
/* Từ chung chung — không đủ để xác định 1 SP nếu đứng 1 mình */
window._matchStopwords = new Set(['rau','cu','qua','trai','la','to','nho','xanh','do','vang','trang','tim','non','gia','sieu','thi','dl','mc','dac','biet','loai','kg','hop','bo','cay','trung','dep','sach','ta','tau','tay','cai','con','mini','baby','size','loai1','loai2']);
window.matchProductSmart = function (name, productsArg) {
  if (!name) return null;
  const products = productsArg || window.STORE.get('products', window.PRODUCTS || []);
  const norm = window._matchNorm;
  const n = norm(name);
  if (!n) return null;
  /* 1) Khớp đúng tuyệt đối */
  let p = products.find(x => norm(x.name) === n);
  if (p) return p;
  /* 2) Khớp theo từ trọn vẹn */
  const toks = s => new Set(norm(s).split(' ').filter(t => t.length >= 2));
  const nTok = toks(name);
  if (!nTok.size) return null;
  let best = null, bestScore = -1;
  products.forEach(x => {
    const xTok = toks(x.name);
    if (!xTok.size) return;
    let inter = 0, distinct = 0;
    nTok.forEach(t => { if (xTok.has(t)) { inter++; if (!window._matchStopwords.has(t)) distinct++; } });
    const small = Math.min(nTok.size, xTok.size);
    const cov = inter / small;                 /* tên ngắn được phủ bao nhiêu */
    const confident = cov === 1 && small >= 2 && distinct >= 1;
    if (!confident) return;
    const jac = inter / (nTok.size + xTok.size - inter);   /* gần kích thước → ưu tiên */
    if (jac > bestScore) { bestScore = jac; best = x; }
  });
  return best;
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
/* Giá NHẬP của 1 sản phẩm tại 1 ngày (số) — date-versioned theo priceHistory[].buy.
   VD nhập 50k từ 11/7, 45k từ 12/7 → đơn ngày ≤11/7 = 50k, ngày ≥12/7 = 45k. Nhận cả ISO & dd/mm/yyyy. */
window.buyPriceOn = function(productId, dateStr) {
  let iso = String(dateStr || '');
  const m = iso.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) iso = `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  else if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) iso = window.todayISO ? window.todayISO() : '';
  const e = window.priceEntryOn(window.productById(productId), iso || (window.todayISO && window.todayISO()));
  return e ? (+e.buy || 0) : 0;
};

/* ============ ĐỊNH DẠNG Ô NHẬP TIỀN (mask 112388018 → 112.388.018) ============
   Áp TOÀN APP tự động: mọi <input type="number"> (mặc định là TIỀN) đổi sang text +
   hiển thị dấu chấm nghìn LIVE. Override getter `.value` để MỌI nơi đọc (formVal, .value,
   oninput) vẫn nhận SỐ SẠCH (chỉ chữ số) → không phải sửa 1 dòng đọc nào.
   BỎ QUA các ô KHÔNG phải tiền: có step thập phân (0.1/0.5…), từ khoá SL/kg/%/markup/công/grace,
   hoặc max ≤ 100 (phần trăm/đếm nhỏ) → tránh làm hỏng ô số lượng thập phân. */
(function moneyMaskSetup() {
  if (typeof document === 'undefined' || !window.HTMLInputElement) return;
  const NATIVE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (!NATIVE || !NATIVE.get) return;
  /* từ khoá KHÔNG phải tiền (số lượng / cân / phần trăm / thời gian / đếm / mã / điện thoại) */
  const EXCLUDE = /qty|quantit|so_?luong|sl\b|s[oố] l[uư][ơợ]ng|weight|kh[oố]i l[uư][ơợ]ng|\bkg\b|c[aâ]n\b|percent|phan_?tram|ph[aầ]n tr[aă]m|ty_?le|t[yỷ] l[eệ]|markup|\bcomm|pct|\bgio\b|\bphut|gi[oờ]|grace|\bng[aà]y|\bday|\bmonth|th[aá]ng|\bnam\b|\bn[aă]m|\byear|tuoi|tu[oổ]i|\bstt\b|thu_?tu|th[uứ] t[uự]|\bindex|sdt|phone|dien_?thoai|đi[eệ]n tho[aạ]i|zalo|\brate\b|ty_?gia|t[yỷ] gi[aá]|\bcong\b|c[oô]ng chu[aẩ]n|nc chu[aẩ]n|s[oố] c[oô]ng/i;
  function raw(v) { const s = String(v == null ? '' : v); const neg = /^\s*-/.test(s); const d = s.replace(/[^\d]/g, ''); return (neg && d ? '-' : '') + d; }
  function grp(r) { if (!r || r === '-') return ''; const neg = r[0] === '-'; const d = r.replace(/\D/g, ''); return (neg ? '-' : '') + (d ? Number(d).toLocaleString('vi-VN') : ''); }
  function isMoney(el) {
    if (el.dataset.money === '0' || el.classList.contains('no-money')) return false;
    if (el.dataset.money === '1' || el.classList.contains('js-money')) return true;
    const step = (el.getAttribute('step') || '').trim();
    if (step && parseFloat(step) > 0 && parseFloat(step) < 1) return false;   /* step thập phân → SL/%/cân */
    if (/[.,]\d/.test(el.getAttribute('value') || '')) return false;          /* giá trị mặc định thập phân */
    const mx = parseFloat(el.getAttribute('max') || '');
    if (!isNaN(mx) && mx <= 100) return false;                                /* max ≤100 → % / đếm nhỏ */
    let labTxt = '';
    if (el.id) { const l = document.querySelector('label[for="' + el.id + '"]'); if (l) labTxt = l.textContent; }
    if (!labTxt) { const lc = el.closest('label'); if (lc) labTxt = lc.textContent; }
    const hay = [el.id, el.name, el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.className, labTxt].join(' ').toLowerCase();
    if (EXCLUDE.test(hay)) return false;
    return true;   /* mặc định: ô number = TIỀN */
  }
  function fmtNow(el) { NATIVE.set.call(el, grp(raw(NATIVE.get.call(el)))); }
  function enhance(el) {
    if (!el || el.nodeType !== 1 || el.tagName !== 'INPUT' || el.dataset.moneyEnhanced) return;
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    const forced = el.dataset.money === '1' || el.classList.contains('js-money');
    if (t !== 'number' && !(forced && t === 'text')) return;
    if (!isMoney(el)) { el.dataset.moneyEnhanced = 'skip'; return; }
    el.dataset.moneyEnhanced = '1';
    el.dataset.money = '1';
    if (t === 'number') el.setAttribute('type', 'text');
    el.setAttribute('inputmode', 'numeric');
    NATIVE.set.call(el, grp(raw(NATIVE.get.call(el))));   /* format giá trị ban đầu */
    /* Ô tiền có sẵn "0" → coi như CHƯA điền: để TRỐNG + placeholder mờ "0"
       (click là gõ số ngay, khỏi phải xoá số 0 trước). Đọc .value vẫn ra 0. */
    if (raw(NATIVE.get.call(el)) === '0') { if (!el.getAttribute('placeholder')) el.setAttribute('placeholder', '0'); NATIVE.set.call(el, ''); }
    /* getter trả SỐ SẠCH cho mọi nơi đọc; setter format khi gán (nếu đang gõ thì để RAW, format lúc blur). */
    try {
      Object.defineProperty(el, 'value', {
        configurable: true,
        get() { return raw(NATIVE.get.call(el)); },
        set(v) { NATIVE.set.call(el, document.activeElement === el ? raw(v) : grp(raw(v))); },
      });
    } catch (e) {}
    /* KHÔNG format khi đang gõ (input) — vì tự set value + con trỏ giữa lúc gõ gây LẶP KÝ TỰ trên
       bàn phím ảo mobile (VD 24.000 → 224.000). Chỉ:
       - focus: bỏ dấu chấm → gõ sạch, con trỏ tự nhiên.
       - blur : format lại có dấu chấm nghìn. */
    el.addEventListener('focus', function () { NATIVE.set.call(el, raw(NATIVE.get.call(el))); });
    el.addEventListener('blur', function () { fmtNow(el); });
  }
  function scan(root) { try { (root || document).querySelectorAll('input').forEach(enhance); } catch (e) {} }
  /* focus = chắc chắn enhance trước khi gõ; observer = bắt ô trong popup động; scan đầu = HTML tĩnh */
  document.addEventListener('focusin', function (e) { if (e.target && e.target.tagName === 'INPUT') enhance(e.target); }, true);
  try {
    new MutationObserver(function (muts) {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'INPUT') enhance(n); else if (n.querySelectorAll) scan(n);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(document); });
  else scan(document);
  window.enhanceMoneyInputs = scan;   /* gọi tay sau khi render bảng nếu cần */
})();

/* ===== CÔNG CHUẨN (NC chuẩn) theo phòng ban =====
   - Khối VĂN PHÒNG: theo LỊCH tháng — T2-T6 = 1 công · T7 = 0.5 (nghỉ chiều) · CN = 0 (nghỉ).
   - Kho: chính thức 29 · thử việc / part-time 30 (cố định).
   - Ship (giao hàng): 30 cố định. */
window.officeWorkStandard = function (monthStr) {
  const mm = String(monthStr || '').match(/^(\d{4})-(\d{1,2})/);
  let y, mo;
  if (mm) { y = +mm[1]; mo = +mm[2]; }
  else { const t = window.todayISO ? window.todayISO() : ''; const m2 = t.match(/^(\d{4})-(\d{2})/); y = m2 ? +m2[1] : 2026; mo = m2 ? +m2[2] : 1; }
  const last = new Date(y, mo, 0).getDate();
  let n = 0;
  for (let d = 1; d <= last; d++) { const dow = new Date(y, mo - 1, d).getDay(); if (dow === 0) continue; n += dow === 6 ? 0.5 : 1; }
  return n;
};
window.workStandardFor = function (dept, contractType, monthStr, role) {
  const d = String(dept || ''); const dl = d.toLowerCase(); const r = String(role || '').toLowerCase();
  /* Nhận cả TÊN PHÒNG BAN CŨ ("Giao hàng", "Vận hành") — phiếu lương cũ còn lưu tên này.
     Trước đây chỉ khớp dept === 'Ship' nên "Giao hàng" rơi xuống công chuẩn VĂN PHÒNG (24-25)
     trong khi phụ cấp vẫn tính theo Ship → 2 chỗ lệch nhau. */
  const shipRe = /giao hàng|giao hang|shipper|tài xế|tai xe|vận hành|van hanh/;
  if (dl === 'ship' || shipRe.test(dl) || shipRe.test(r)) return 30;
  if (dl === 'kho' || /(^|\s)kho(\s|$)/.test(dl) || /kho/.test(r)) {
    return (contractType === 'probation' || contractType === 'parttime') ? 30 : 29;
  }
  return window.officeWorkStandard(monthStr);   /* khối văn phòng → theo lịch tháng */
};

/* ============ NHÓM GIÁ (price tiers) — helper TOÀN CỤC ============
   Dùng được ở MỌI trang (orders không nạp products.js nên cần bản global này).
   tierId rỗng/0 → giá GỐC. >0 → áp markup% hoặc override riêng của nhóm. */
window.priceTierById = function (tierId) {
  if (!tierId) return null;
  const tiers = window.STORE && window.STORE.get('priceTiers', null);
  if (!Array.isArray(tiers) || !tiers.length) return null;
  return tiers.find(t => String(t.id) === String(tierId)) || null;
};
window.tierName = function (tierId) {
  const t = window.priceTierById(tierId);
  return t ? t.name : '';
};
/* Giá 1 SP theo nhóm giá tierId (mặc định = giá gốc nếu không có nhóm) */
window.tierPriceOn = function (productId, dateISO, tierId) {
  const base = window.priceOn(productId, dateISO);
  const t = window.priceTierById(tierId);
  if (!t) return base;
  if (t.overrides && t.overrides[productId] != null) return +t.overrides[productId] || 0;
  return Math.round((base || 0) * (1 + (+t.markup || 0) / 100));
};
/* ============ SỔ CÔNG NỢ theo ngày (debtLedger) ============
   Mỗi dòng: { id, custId, date (dd/mm/yyyy), ts (ISO sort), type:'charge'|'payment'|'reverse',
               amount, ref (mã đơn / số phiếu thu), desc }
   - charge  = phát sinh nợ (đơn giao + Công nợ)  → +
   - payment = trả nợ (phiếu thu)                  → −
   - reverse = hoàn nợ (huỷ/trả đơn đã cộng nợ)     → −
   c.debt vẫn là TỔNG chuẩn; sổ này là chi tiết phát sinh. Số dư đầu kỳ tự khớp về c.debt. */
window.getDebtLedger = function (custId) {
  const arr = (window.STORE && window.STORE.get('debtLedger', [])) || [];
  return custId ? arr.filter(e => e.custId === custId) : arr;
};
window.addDebtLedger = function (e) {
  if (!window.STORE || !e || !e.custId) return;
  const now = new Date();
  const entry = {
    id: 'dl_' + (typeof performance !== 'undefined' && performance.now ? Math.floor(performance.now() * 1000).toString(36) : '') + Math.floor((1 + Math.random()) * 1e6).toString(36),
    custId: e.custId,
    date: e.date || now.toLocaleDateString('vi-VN'),
    ts: e.ts || now.toISOString(),
    type: e.type || 'charge',
    amount: Math.round(+e.amount || 0),
    ref: e.ref || '',
    desc: e.desc || '',
    /* Kỳ công nợ phiếu thu áp vào (payment) — 'YYYY-MM-1'|'YYYY-MM-2' (kỳ 1 = ngày 1–15, kỳ 2 = 16–cuối).
       Kế toán chọn khi tạo phiếu → phiếu rơi đúng kỳ dù ngày thu thực nằm kỳ khác. '' = theo ngày thu. */
    payPeriod: e.payPeriod || '',
  };
  if (!entry.amount) return;
  /* rmwKv: áp lên bản CLOUD MỚI NHẤT → 2 NV ghi phiếu thu/bút toán cùng lúc KHÔNG mất của nhau
     (trước đây STORE.set đè cả sổ = mất bút toán). Dedup theo (custId,ref,type) giữ idempotent. */
  window.STORE.rmwKv('debtLedger', arr => {
    arr = Array.isArray(arr) ? arr : [];
    if (entry.ref && arr.some(x => x.custId === entry.custId && x.ref === entry.ref && x.type === entry.type)) return arr;
    arr.unshift(entry);
    return arr;
  });
};

/* Công nợ CHUẨN của 1 KH (nguồn DUY NHẤT) = tổng tiền đơn "Công nợ" (không draft/cancelled) −
   tổng phiếu thu (ledger payment). Dùng cho Báo cáo/Dashboard (không cần nạp customers.js).
   Khớp đúng rebuildCustStats trong customers.js. */

/* ===== So khớp ĐỊA CHỈ gần giống — DÙNG CHUNG (cảnh báo trùng KH ở form thêm KH, NHẬP PHIẾU, CFO).
   Trước đây logic này chỉ nằm trong customers.js (form tay) → nhập phiếu/CFO không cảnh báo trùng. ===== */
window.normAddr = function (s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(so|nha|ngo|ngach|duong|pho|thon|xom|to|hn|ha noi)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
};
window.addrLooksSame = function (a, b) {
  a = window.normAddr(a); b = window.normAddr(b);
  if (!a || !b || a.length < 6) return false;
  /* BẮT BUỘC chung SỐ NHÀ: địa chỉ chỉ có tên khu (vd "OCP Gia Lâm", "Vinhomes",
     "Gia Lâm") KHÔNG có số nhà → quá chung chung, KHÔNG coi là trùng dù chứa nhau. */
  const nA = a.match(/\d+/g) || [], nB = b.match(/\d+/g) || [];
  if (!nA.some(n => nB.includes(n))) return false;
  if (a === b) return true;
  const [sh, lo] = a.length <= b.length ? [a, b] : [b, a];
  if (sh.length >= 8 && lo.indexOf(sh) >= 0) return true;
  const ta = new Set(a.split(' ').filter(w => w.length > 1));
  const common = b.split(' ').filter(w => w.length > 1 && ta.has(w)).length;
  return common >= 3;
};

/* Ngày GIAO (ISO yyyy-mm-dd) của 1 đơn — ưu tiên ngày giao (deliverDate), fallback ngày đặt. */
window.orderDeliverISO = function (o) {
  if (!o) return '';
  let s = String(o.deliverDate || o.deliver_date || '');
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);          if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  s = String(o.date || o.order_date || o.createdAt || o.created_at || '');
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);              if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);         if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  return '';
};
/* Đơn đã (coi như) GIAO → công nợ CHỐT. Trả true khi:
   • status = delivered / reconciled (đã bấm Đã giao), HOẶC
   • status Chờ giao / Đang lấy / Đang giao mà NGÀY GIAO đã tới/qua (hôm nay trở về trước)
     → giao hàng ngày, công nợ tự chốt khỏi phải bấm tay.
   draft / cancelled / returned KHÔNG tính. Đơn ngày mai/tương lai CHƯA tính (chưa giao). */
window.orderDelivered = function (o) {
  if (!o) return false;
  const st = o.status;
  if (st === 'delivered' || st === 'reconciled') return true;
  if (st === 'draft' || st === 'cancelled' || st === 'returned') return false;
  const iso = window.orderDeliverISO(o);
  return !!iso && iso <= window.todayISO();
};

window.custDebt = function (custId) {
  if (!custId || !window.STORE) return 0;
  const orders = window.STORE.get('orders', []) || [];
  let charge = 0;
  orders.forEach(o => {
    if (o.status === 'draft' || o.status === 'cancelled') return;
    if ((o.cust || o.custId) !== custId) return;
    /* Công nợ CHỐT KHI ĐÃ GIAO (khớp rebuildCustStats/customers.js + cong-no-tong-hop).
       "Đã giao" = đã bấm giao HOẶC ngày giao đã tới/qua (window.orderDelivered) → đơn quá ngày
       giao tự thành nợ khỏi phải bấm tay. Đơn ngày mai/tương lai CHƯA tính. */
    if (!window.orderDelivered(o)) return;
    if (/nợ|cong no|credit/i.test(o.payBy || o.pay_by || '')) charge += (+o.freight || 0);
  });
  let paid = 0;
  (window.getDebtLedger ? window.getDebtLedger(custId) : []).forEach(e => { if (e.type === 'payment') paid += (+e.amount || 0); });
  return Math.max(0, charge - paid);
};
/* Số ngày quá hạn thực của KH (0 nếu chưa quá hạn) — wrapper gọn của debtOverdueInfo cho báo cáo. */
window.debtOverdueDays = function (custId) { const i = window.debtOverdueInfo ? window.debtOverdueInfo(custId) : null; return i ? i.days : 0; };
window.custDebtOverdue = function (custId) { const i = window.debtOverdueInfo ? window.debtOverdueInfo(custId) : null; return i ? i.amount : 0; };

/* ============ SỐ DƯ QUỸ ĐỘNG (1 nguồn sự thật) ============
   Số dư TK = opening (số dư gốc lúc tạo) + (Σ thu − Σ chi từ cashEntries của TK đó).
   Sửa: (a) auto-out Ads/Lương trước KHÔNG trừ số dư → "phồng vô hạn"; nay tự trừ.
   (b) cộng dồn field acc.balance kiểu RMW → mất delta khi 2 phiếu đồng thời; nay tính lại từ sổ.
   opening lưu KV 'accountOpenings' {accId:number} (bảng paymentAccounts không có cột opening). */
window.accountNet = function (accName) {
  if (!accName || !window.STORE) return 0;
  let net = 0;
  (window.STORE.get('cashEntries', []) || []).forEach(e => { if (e.account === accName) net += (e.type === 'in' ? 1 : -1) * (+e.amount || 0); });
  return net;
};
window.accountOpening = function (accId) {
  const m = (window.STORE && window.STORE.get('accountOpenings', {})) || {};
  return (accId != null && m[accId] != null) ? (+m[accId] || 0) : null;
};
window.setAccountOpening = function (accId, val) {
  if (accId == null || !window.STORE) return;
  window.STORE.rmwKv('accountOpenings', m => {
    m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
    m[accId] = Math.round(+val || 0);
    return m;
  });
};
window.accountBalance = function (acc) {
  if (!acc) return 0;
  const op = window.accountOpening(acc.id);
  return op != null ? (op + window.accountNet(acc.name)) : (+acc.balance || 0);   /* chưa migrate → dùng balance lưu, KHÔNG lệch */
};
/* Migrate 1 lần: opening = balance hiện tại − net → số dư động == số dư đang hiển thị (không nhảy).
   CHỈ chạy khi cloud tải xong (tránh tính net trên sổ quỹ chưa đủ). Đã có opening thì bỏ qua. */
window.migrateAccountOpenings = function () {
  if (!window.STORE) return;
  if (window.STORE.isPreloaded && (!window.STORE.isPreloaded('cashEntries') || !window.STORE.isPreloaded('paymentAccounts'))) return;
  const accs = window.STORE.get('paymentAccounts', []) || [];
  const cur = (window.STORE.get('accountOpenings', {})) || {};
  const missing = accs.some(a => a && a.id != null && cur[a.id] == null);
  if (!missing) return;   /* đã đủ opening → khỏi ghi (tránh flush cloud thừa mỗi lần load) */
  window.STORE.rmwKv('accountOpenings', m => {
    m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
    accs.forEach(a => { if (a && a.id != null && m[a.id] == null) m[a.id] = Math.round((+a.balance || 0) - window.accountNet(a.name)); });
    return m;
  });
};

/* Nhóm giá GÁN cho 1 KH — nguồn chuẩn = KV 'custPriceTiers' (sync đa máy),
   fallback field priceTier trên bản ghi KH (cache cũ/local). */
window.custPriceTier = function (custId) {
  if (!custId) return '';
  const map = (window.STORE && window.STORE.get('custPriceTiers', {})) || {};
  if (map[custId] != null && map[custId] !== '') return String(map[custId]);
  const c = window.STORE && (window.STORE.get('customers', []) || []).find(x => x.id === custId);
  return (c && c.priceTier != null) ? String(c.priceTier) : '';
};
window.setCustPriceTier = function (custId, tierId) {
  if (!custId || !window.STORE) return;
  window.STORE.rmwKv('custPriceTiers', m => {
    m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
    if (tierId == null || tierId === '') delete m[custId]; else m[custId] = String(tierId);
    return m;
  });
};

/* ============ CHÍNH SÁCH CÔNG NỢ (Tuấn Tú Farm) ============
   Hạn nợ theo quy mô: ~50kg → 3 ngày · 50–100kg → 7 ngày · >200tr/tháng → 15 ngày.
   Mỗi KH có "hạn công nợ" (số ngày) — lưu KV 'custCreditDays' (sync đa máy). */
window.DEBT_POLICY = [
  { days: 3,  label: '3 ngày — đơn ~50kg' },
  { days: 7,  label: '7 ngày — đơn 50–100kg' },
  { days: 15, label: '15 ngày — >200 triệu/tháng' },
];
window.DEBT_TERM_DEFAULT = 7;
window.creditDaysOptions = function (sel) {
  const cur = (sel == null || sel === '') ? window.DEBT_TERM_DEFAULT : +sel;
  return window.DEBT_POLICY.map(p => `<option value="${p.days}" ${cur === p.days ? 'selected' : ''}>${p.label}</option>`).join('');
};
window.custCreditDays = function (custId) {
  const map = (window.STORE && window.STORE.get('custCreditDays', {})) || {};
  const v = map[custId];
  return (v != null && v !== '') ? (+v || window.DEBT_TERM_DEFAULT) : window.DEBT_TERM_DEFAULT;
};
window.setCustCreditDays = function (custId, days) {
  if (!custId || !window.STORE) return;
  window.STORE.rmwKv('custCreditDays', m => {
    m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
    if (days == null || days === '') delete m[custId]; else m[custId] = +days;
    return m;
  });
};

/* KỲ TÍNH CÔNG NỢ mỗi KH — có KH tính theo kỳ (1–15/16–cuối), có KH gộp theo 3/7/10/30 ngày.
   Lưu KV 'custDebtCycles' {custId: 'period'|'3'|'7'|'10'|'30'} (sync đa máy). Phiếu thu nợ gom nợ theo kỳ này. */
window.DEBT_CYCLES = [
  { v: 'period', label: 'Theo kỳ (1–15 / 16–cuối tháng)' },
  { v: '3',  label: '3 ngày' },
  { v: '7',  label: '7 ngày' },
  { v: '10', label: '10 ngày' },
  { v: '30', label: 'Theo tháng (30 ngày)' },
];
window.DEBT_CYCLE_DEFAULT = 'period';
window.debtCycleOptions = function (sel) {
  const cur = (sel == null || sel === '') ? window.DEBT_CYCLE_DEFAULT : String(sel);
  return window.DEBT_CYCLES.map(c => `<option value="${c.v}" ${cur === c.v ? 'selected' : ''}>${c.label}</option>`).join('');
};
window.custDebtCycle = function (custId) {
  const map = (window.STORE && window.STORE.get('custDebtCycles', {})) || {};
  const v = map[custId];
  return (v != null && v !== '') ? String(v) : window.DEBT_CYCLE_DEFAULT;
};
window.setCustDebtCycle = function (custId, v) {
  if (!custId || !window.STORE) return;
  window.STORE.rmwKv('custDebtCycles', m => {
    m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
    if (v == null || v === '' || v === 'period') delete m[custId]; else m[custId] = String(v);
    return m;
  });
};
/* ============ QUY TRÌNH KẾ TOÁN 2 NẤC (sau khi ship giao) ============
   Nấc 1 — KT1 CHỐT SẢN LƯỢNG: khớp SL khách nhận với đơn sale lên  → KV 'orderQtyLocks'.
   Nấc 2 — KT2 CHỐT BÁO GIÁ: chốt giá → công nợ (chỉ khi SL đã chốt) → KV 'orderQuoteLocks'.
   Mỗi KV {code:{by,byId,at}} — đồng bộ 5 kế toán đa máy (kv_store + rmwKv chống đè, ghi TÊN người chốt). */
function _mkLockApi(kvKey) {
  return {
    get: function (code) {
      if (!code || !window.STORE) return null;
      const m = window.STORE.get(kvKey, {}) || {};
      const v = m[code];
      return (v && typeof v === 'object') ? v : null;
    },
    set: function (code, on) {
      if (!code || !window.STORE) return;
      const u = window.CURRENT_USER || {};
      window.STORE.rmwKv(kvKey, m => {
        m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
        if (on) m[code] = { by: u.name || 'Kế toán', byId: u.staffId || '', at: new Date().toISOString() };
        else delete m[code];
        return m;
      });
    },
  };
}
const _qtyApi = _mkLockApi('orderQtyLocks');
const _quoteApi = _mkLockApi('orderQuoteLocks');
window.orderQtyLock = _qtyApi.get;
window.setOrderQtyLock = _qtyApi.set;
window.orderQuoteLock = _quoteApi.get;
window.setOrderQuoteLock = _quoteApi.set;
/* Nấc kế toán hiện tại của đơn: 'wait-qty' (chưa chốt SL) · 'wait-price' (SL xong, chờ giá) · 'done' (đã báo giá) */
window.orderAcctStage = function (code) {
  if (window.orderQuoteLock(code)) return 'done';
  if (window.orderQtyLock(code)) return 'wait-price';
  return 'wait-qty';
};

/* Quá hạn THẬT: lấy charge cũ nhất CHƯA trả (FIFO) trong sổ nợ, so với hạn nợ KH.
   Trả {days, amount, term, sinceDate}. days=0 nếu chưa quá hạn / chưa đủ dữ liệu. */
window.debtOverdueInfo = function (custId) {
  const term = window.custCreditDays(custId);
  const led = (window.getDebtLedger ? window.getDebtLedger(custId) : []) || [];
  const empty = { days: 0, amount: 0, term: term, sinceDate: null };
  const toDate = e => {
    if (e.ts) { const d = new Date(e.ts); if (!isNaN(d)) return d; }
    const m = String(e.date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  };
  /* PHÁT SINH NỢ (charge): ưu tiên sổ nợ; nếu sổ nợ KHÔNG có charge → lấy từ ĐƠN trả bằng Công nợ
     (công nợ trong app tự sinh từ đơn hàng, sổ nợ thường trống). */
  let charges = led.filter(e => e.type === 'charge').map(e => ({ amt: +e.amount || 0, t: toDate(e) }))
    .filter(c => c.t && c.amt > 0);
  if (!charges.length) {
    const ordDate = o => {
      const iso = o.deliverDate || o.deliver_date;
      if (iso && /^\d{4}-\d{2}-\d{2}/.test(String(iso))) return new Date(String(iso).slice(0, 10) + 'T00:00:00');
      const m = String(o.date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
    };
    charges = ((window.STORE && window.STORE.get('orders', [])) || [])
      .filter(o => (o.cust || o.custId) === custId && o.status !== 'cancelled' && o.status !== 'draft'
        && /nợ|cong no|credit/i.test(o.payBy || o.pay_by || ''))
      .map(o => ({ amt: +o.freight || 0, t: ordDate(o) }))
      .filter(c => c.t && c.amt > 0);
  }
  charges.sort((a, b) => a.t - b.t);
  if (!charges.length) return empty;
  let pay = led.filter(e => e.type === 'payment' || e.type === 'reverse').reduce((s, e) => s + (+e.amount || 0), 0);
  for (const c of charges) { if (pay <= 0) break; const used = Math.min(pay, c.amt); c.amt -= used; pay -= used; }
  const oldest = charges.find(c => c.amt > 0.5);
  if (!oldest) return empty;
  const ageDays = Math.floor((Date.now() - oldest.t.getTime()) / 86400000);
  return { days: Math.max(0, ageDays - term), amount: charges.reduce((s, c) => s + Math.max(0, c.amt), 0), term: term, sinceDate: oldest.t };
};
window.debtOverdueDays = function (custId) { return window.debtOverdueInfo(custId).days; };

/* ============ ƯU TIÊN XUẤT VAT — đối tác lấy hàng ≥15 ngày ============
   Chính sách: ưu tiên xuất hoá đơn VAT cho đối tác lấy hàng tối thiểu 15 ngày trở lên. */
window.VAT_MIN_DAYS = 15;
window._vnDateObj = function (s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
};
/* Số ngày KH đã "lấy hàng" tính từ lần đầu (created) đến nay */
window.custRelationDays = function (c) {
  const start = window._vnDateObj(c && c.created);
  if (!start || isNaN(start)) return null;
  return Math.floor((Date.now() - start.getTime()) / 86400000);
};
window.vatEligible = function (c) {
  if (!c) return false;
  const days = window.custRelationDays(c);
  const hasOrders = (+c.orders > 0) || (Array.isArray(c.ordersList) && c.ordersList.length > 0) || (+c.revenue > 0);
  return days != null && days >= window.VAT_MIN_DAYS && hasOrders;
};

/* ============ Ô TÌM SẢN PHẨM (gõ-lọc) — dùng chung ============
   Thay cho <select> 1000 SP. Gắn vào 1 <input class="prodpick">: gõ → lọc →
   click chọn → lưu productId vào input.dataset.pid. Đọc kết quả bằng el.dataset.pid. */
/* Chuẩn hoá để so khớp: bỏ dấu, đ→d, thường hoá. */
window.ppNorm = function (s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();
};
/* Lọc + XẾP HẠNG sản phẩm theo độ khớp (khớp đầu/đúng từ lên trước → hết "Sả" bị chìm dưới "Sấu").
   Trả về mảng đã lọc + sắp xếp; query rỗng → trả tất cả. */
window.rankProducts = function (prods, query) {
  const q = window.ppNorm(query);
  if (!q) return (prods || []).slice();
  const qtok = q.split(/\s+/).filter(Boolean);
  const out = [];
  (prods || []).forEach(p => {
    const n = window.ppNorm(p.name);
    const id = window.ppNorm(p.id);
    let s = 99;
    if (n === q) s = 0;                                   // trùng khít
    else if (n.indexOf(q) === 0) s = 1;                   // tên bắt đầu bằng query
    else {
      const w = n.split(/[^a-z0-9]+/).filter(Boolean);
      if (w.indexOf(q) >= 0) s = 2;                       // trùng nguyên 1 từ
      else if (w.some(x => x.indexOf(q) === 0)) s = 3;    // 1 từ bắt đầu bằng query
      else if (n.indexOf(q) >= 0) s = 4;                  // chứa chuỗi
      else if (qtok.length > 1 && qtok.every(t => n.indexOf(t) >= 0)) s = 5; // đủ các từ khoá
      else if (id.indexOf(q) >= 0) s = 6;                 // khớp mã SP
    }
    if (s < 99) out.push({ p: p, s: s, n: n });
  });
  out.sort((a, b) => a.s - b.s || a.n.localeCompare(b.n, 'vi'));
  return out.map(x => x.p);
};

window.wireProductSearch = function (input, opts) {
  opts = opts || {};
  if (!input || input._ppWired) return; input._ppWired = true;
  input.setAttribute('autocomplete', 'off');
  let dd = null;
  const close = () => { if (dd) { dd.remove(); dd = null; } };
  /* Chỉ ĐẶT LẠI VỊ TRÍ dd (không dựng lại) → giữ nguyên vị trí cuộn bên trong khi trang scroll */
  function position() {
    if (!dd) return;
    const r = input.getBoundingClientRect();
    let top = r.bottom + 2;
    if (top + dd.offsetHeight > window.innerHeight && r.top - dd.offsetHeight > 0) top = r.top - dd.offsetHeight - 2;
    dd.style.left = r.left + 'px';
    dd.style.top = top + 'px';
    dd.style.width = Math.max(r.width, 260) + 'px';
  }
  let active = -1;   /* dòng đang được tô sáng (điều hướng bằng phím ↑↓) */
  const items = () => dd ? Array.prototype.slice.call(dd.querySelectorAll('.pps-item')) : [];
  function highlight(i) {
    const its = items();
    its.forEach(x => x.style.background = '');
    if (i >= 0 && its[i]) { its[i].style.background = '#F0FDF4'; its[i].scrollIntoView({ block: 'nearest' }); }
    active = i;
  }
  function selectItem(el) {
    if (!el) return;
    input.value = el.dataset.name; input.dataset.pid = el.dataset.id;
    input.style.background = '#F0FDF4'; input.style.fontWeight = '600';
    close();
    if (opts.onPick) opts.onPick({ id: el.dataset.id, name: el.dataset.name });
  }
  function show() {
    const prods = window.STORE.get('products', window.PRODUCTS || []) || [];
    const q = (input.value || '').trim();
    let list = q ? window.rankProducts(prods, q) : prods.slice();
    list = list.slice(0, 50);   /* trước 16 → SP bị cắt; nay 50 + cuộn được */
    close();
    if (!list.length) return;
    dd = document.createElement('div');
    dd.style.cssText = 'position:fixed;z-index:100090;max-height:340px;overflow-y:auto;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18)';
    dd.innerHTML = list.map(p => {
      let prHtml = '';
      if (opts.priceFn) { try { const pr = opts.priceFn(p.id); if (pr) prHtml = `<span style="color:#15803D;font-size:11px;font-weight:700;white-space:nowrap">${window.fmt(pr)}đ</span>`; } catch (e) {} }
      return `<div class="pps-item" data-id="${p.id}" data-name="${(p.name || '').replace(/"/g, '&quot;')}" style="padding:8px 11px;font-size:12.5px;cursor:pointer;border-bottom:1px solid #F1F5F9;display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${p.name} <span style="color:#94A3B8;font-size:11px">/${p.unit || 'kg'}</span></span><span style="display:flex;gap:8px;align-items:center">${prHtml}<span style="color:#94A3B8;font-size:11px;font-family:monospace">${p.id}</span></span></div>`;
    }).join('');
    document.body.appendChild(dd);
    position();
    const its = items();
    its.forEach((it, idx) => {
      it.onmouseover = () => highlight(idx);
      it.onmousedown = (e) => { e.preventDefault(); selectItem(it); };
    });
    highlight(its.length ? 0 : -1);   /* tô sáng dòng đầu → chỉ cần Enter là chọn */
  }
  /* focus mở gợi ý — TRỪ khi vừa thêm SP xong & chủ động refocus (né bung lại bảng gợi ý gây rối) */
  input.addEventListener('focus', () => { if (input._ppSuppressOnce) { input._ppSuppressOnce = false; return; } show(); });
  input.addEventListener('input', () => { input.dataset.pid = ''; input.style.background = ''; input.style.fontWeight = ''; show(); });
  input.addEventListener('blur', () => setTimeout(close, 170));
  /* === ĐIỀU HƯỚNG BÀN PHÍM: ↑↓ chọn dòng · Enter chọn SP · Esc đóng === */
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      if (!dd) { show(); return; }
      highlight(Math.min(active + 1, items().length - 1)); e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (dd) { highlight(Math.max(active - 1, 0)); e.preventDefault(); }
    } else if (e.key === 'Enter') {
      if (dd && items().length) {
        e.preventDefault(); e.stopPropagation();
        selectItem(items()[active >= 0 ? active : 0]);
      } else if (opts.onEnterNoList) {
        e.preventDefault(); e.stopPropagation();
        opts.onEnterNoList();
      }
    } else if (e.key === 'Escape') {
      if (dd) { close(); e.preventDefault(); }
    }
  });
  /* Trang cuộn → chỉ dời vị trí; KHÔNG dời/không dựng lại khi cuộn BÊN TRONG dropdown (để cuộn được) */
  window.addEventListener('scroll', (e) => {
    if (!dd) return;
    if (e && e.target && e.target.nodeType === 1 && (dd === e.target || dd.contains(e.target))) return;
    position();
  }, true);
};
window.wireAllProductSearch = function (root) {
  (root || document).querySelectorAll('input.prodpick:not([data-ppwired])').forEach(el => { el.setAttribute('data-ppwired', '1'); window.wireProductSearch(el); });
};

/* <option> nhóm giá — bản global (customers.js có bản riêng, ưu tiên giữ tương thích) */
if (typeof window.priceTierOptions !== 'function') {
  window.priceTierOptions = function (sel) {
    let tiers = window.STORE && window.STORE.get('priceTiers', null);
    const _old = Array.isArray(tiers) && tiers.length === 3 && tiers[0] && tiers[0].name === 'Giá lẻ';
    if (!Array.isArray(tiers) || !tiers.length || _old) tiers = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: 'Nhóm ' + (i + 1) }));
    const ic = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
    return `<option value="">— Mặc định (Giá gốc) —</option>` + tiers.map(t => `<option value="${t.id}" ${String(sel) === String(t.id) ? 'selected' : ''}>${ic[(t.id - 1) % 8] || ''} ${t.name}</option>`).join('');
  };
}

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
    /* Nút tùy biến: opts.actions.buttons = [{label, handler(ids)}] */
    (customActions.buttons || []).forEach((b, i) => {
      actionsHtml += `<button onclick="window._bulkBtn_${store}_${i}()" style="background:#fff;color:var(--navy);border:none;padding:5px 11px;border-radius:6px;font-weight:600;font-size:12.5px;cursor:pointer">${b.label}</button>`;
    });
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
        if (item) { window.STORE.update(store, (item.id || item.code || item.no), { [fieldName]: statusSel.value }); count++; }
      });
      window.toast?.(`✓ Đã đổi ${count} ${label}`, 'success');
      window[`_bulkClear_${store}`]();
    };
  }

  /* Cho phép cập nhật toolbar thủ công (vd card có onclick riêng phải stopPropagation) */
  window[`_bulkRefresh_${store}`] = function () { setTimeout(updateToolbar, 0); };

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
  /* Nút tùy biến → gọi handler với danh sách id đang chọn */
  ((opts.actions && opts.actions.buttons) || []).forEach((b, i) => {
    window[`_bulkBtn_${store}_${i}`] = function () {
      const ids = getSelectedIds();
      if (!ids.length) return;
      b.handler(ids);
    };
  });

  /* Bind checkbox clicks (delegate) */
  tbl.addEventListener('click', (e) => {
    const cb = e.target.closest('.checkbox, input[type="checkbox"]');
    if (cb && tbl.contains(cb)) {
      e.stopPropagation();
      setTimeout(updateToolbar, 50);
    }
  });
  /* CAPTURE phase — bắt click checkbox NGAY CẢ KHI ô nằm trong
     <td onclick="event.stopPropagation()"> (chặn mở đơn) → bubble bị chặn nên trước
     đây tích TỪNG dòng không bật thanh thao tác (chỉ "chọn tất cả" mới bật).
     Chỉ lên lịch cập nhật thanh, KHÔNG can thiệp sự kiện → checkbox vẫn toggle. */
  tbl.addEventListener('click', (e) => {
    if (e.target.closest('.checkbox, input[type="checkbox"]')) setTimeout(updateToolbar, 50);
  }, true);

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
/* Nhóm menu THEO PHÒNG BAN — khớp presetPerms(role,dept) trong auth.js.
   filteredNav (renderAppShell) tự lọc theo quyền + bỏ nhóm rỗng → mỗi phòng chỉ thấy nhóm của mình. */
window.NAV = [
  { section: 'Sale', items: [
    { id: 'orders',     label: 'Đơn hàng',    icon: '📦', href: 'orders.html', badgeKey: 'orders' },
    { id: 'customers',  label: 'Khách hàng',  icon: '👥', href: 'customers.html', badgeKey: 'customers' },
    { id: 'order-samples', label: 'Mẫu đơn AI (nhớ nét chữ)', icon: '🧠', href: 'order-samples.html' },
    /* Ẩn: Chân dung KH 360°, Lead/Tiềm năng, Đơn định kỳ (file vẫn giữ)
    { id: 'customers-360', label: 'Chân dung KH 360°', icon: '🔍', href: 'customers-360.html' },
    { id: 'leads',      label: 'Lead/Tiềm năng', icon: '🎯', href: 'leads.html' },
    { id: 'recurring',  label: 'Đơn định kỳ', icon: '🔁', href: 'recurring.html' }, */
  ]},
  { section: 'Kế toán', items: [
    { id: 'products',   label: 'Sản phẩm & Giá', icon: '🥬', href: 'products.html' },
    { id: 'debt-summary', label: 'Công nợ tổng hợp (CFO)', icon: '🧮', href: 'cong-no-tong-hop.html' },
    { id: 'ncc-debt',   label: 'Công nợ NCC',  icon: '🏭', href: 'ncc-cong-no.html' },
    { id: 'finance',    label: 'Tài chính',   icon: '💰', href: 'finance.html', badgeKey: 'debt' },
    { id: 'san-luong',  label: 'Sản lượng & doanh thu', icon: '📦', href: 'san-luong.html' },
    /* Ẩn: Loyalty — { id:'loyalty', label:'Loyalty (tích điểm)', icon:'⭐', href:'loyalty.html' }, */
  ]},
  { section: 'Marketing', items: [
    { id: 'adspend',    label: 'Chi phí Ads', icon: '📣', href: 'adspend.html' },
    /* Ẩn: Email/Zalo blast — { id:'marketing', label:'Email/Zalo blast', icon:'📨', href:'marketing.html' }, */
  ]},
  { section: 'Kho & Ship', items: [
    { id: 'inventory',  label: 'Kho / Tồn',   icon: '📥', href: 'inventory.html' },
    { id: 'suppliers',  label: 'Nhà cung cấp', icon: '🏭', href: 'suppliers.html' },
    { id: 'procurement', label: 'Gom hàng',    icon: '🧺', href: 'procurement.html' },
    { id: 'nhan-hang',  label: 'Nhận hàng NCC', icon: '📦', href: 'nhan-hang.html' },
    { id: 'giao-hang',  label: 'Bảng giao hàng', icon: '🚚', href: 'giao-hang.html' },
    { id: 'returns',    label: 'Trả hàng',    icon: '↩️', href: 'returns.html' },
    /* Ẩn: Shipper — { id:'shippers', label:'Shipper', icon:'🛵', href:'shippers.html' }, */
  ]},
  { section: 'Nhân sự', items: [
    { id: 'staff',      label: 'Nhân sự',     icon: '🧑‍💼', href: 'staff.html' },
    { id: 'tai-khoan',  label: 'Tài khoản đăng nhập', icon: '🔐', href: 'tai-khoan.html' },
  ]},
  { section: 'Quản trị', items: [
    { id: 'dashboard',  label: 'Dashboard',   icon: '📊', href: 'dashboard.html' },
    { id: 'reports',    label: 'Báo cáo',     icon: '📈', href: 'reports.html' },
    { id: 'settings',   label: 'Cài đặt',     icon: '⚙️', href: 'settings.html' },
    { id: 'audit',      label: 'Nhật ký',     icon: '📋', href: 'audit.html' },
  ]},
  /* Chung mọi phòng — không nhóm (section rỗng → không hiện tiêu đề) */
  { section: '', items: [
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

/* === ĐỒNG BỘ DANH MỤC từ cloud (md_product_categories) ===========================
   Danh mục được quản lý ở "Quản lý danh mục" → lưu master_data (cloud), DÙNG CHUNG
   với website. Trước đây app KHÔNG đọc lại danh sách này → luôn revert về danh mục
   cứng trong data/products.js (mất "Thuỷ Hải sản", "Trứng"… → hiện raw id "tom").
   Nay: nạp danh mục cloud → ghi đè TẠI CHỖ vào PRODUCT_CATEGORIES + SERVICE_TYPES
   (giữ nguyên reference để mọi module thấy). */
window.applyCloudCategories = function (arr) {
  if (!Array.isArray(arr) || !arr.length) return false;
  ['SERVICE_TYPES', 'PRODUCT_CATEGORIES'].forEach(function (name) {
    var a = window[name];
    if (Array.isArray(a)) { a.length = 0; arr.forEach(function (c) { a.push(c); }); }
    else window[name] = arr.slice();
  });
  return true;
};
/* Đồng bộ NGAY từ cache localStorage (trước khi orders/customers chụp snapshot SERVICE_TYPES) */
try {
  var _ccRaw = localStorage.getItem('vty_md_product_categories');
  if (_ccRaw) { var _ccArr = JSON.parse(_ccRaw); if (Array.isArray(_ccArr) && _ccArr.length) { var ST = window.SERVICE_TYPES; ST.length = 0; _ccArr.forEach(function (c) { ST.push(c); }); } }
} catch (e) {}
/* Sau khi mọi script load: kéo bản cloud mới nhất + re-render khi về (lần đầu chưa có cache) */
(function () {
  function refresh() {
    try { if (typeof window.rebuildOrderSvc === 'function') window.rebuildOrderSvc(); } catch (e) {}
    ['renderCatalogGrid', 'renderBoard', 'renderOrders', 'renderCustomers'].forEach(function (fn) {
      try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {}
    });
  }
  function start() {
    if (!window.STORE) { setTimeout(start, 200); return; }
    var cached = null;
    try { cached = window.STORE.get('md_product_categories', null); } catch (e) {}
    if (window.applyCloudCategories(cached)) refresh();
    try { window.STORE.subscribe('md_product_categories', function (a) { if (window.applyCloudCategories(a)) refresh(); }); } catch (e) {}
  }
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();

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
  /* Gom về 3 nguồn theo yêu cầu (MKT = mọi kênh social/digital: web/fb/zalo/youtube/hội chợ).
     Giá trị cũ vẫn nhận diện đúng qua window.srcGroup() khi tính doanh thu + preselect form. */
  sources: [
    { id:'mkt',            label:'MKT' },
    { id:'sales',          label:'Sale Chủ Động' },
    { id:'sep-gioi-thieu', label:'Sếp Giới Thiệu' },
  ],
  units: [
    { id:'kg',   label:'kg' },   { id:'g',    label:'g' },
    { id:'bo',   label:'bó' },    { id:'mo',   label:'mớ' },
    { id:'bap',  label:'bắp' },   { id:'qua',  label:'quả' },
    { id:'cu',   label:'củ' },    { id:'cay',  label:'cây' },
    { id:'khay', label:'khay' },  { id:'hop',  label:'hộp' },
    { id:'tui',  label:'túi' },   { id:'goi',  label:'gói' },
    { id:'thung',label:'thùng' }, { id:'bao',  label:'bao' },
    { id:'chai', label:'chai' },  { id:'can',  label:'can' },
    { id:'lit',  label:'lít' },   { id:'lo',   label:'lọ' },
    { id:'vi',   label:'vỉ' },    { id:'bia',  label:'bìa' },
    { id:'cuon', label:'cuộn' },  { id:'con',  label:'con' },
    { id:'cai',  label:'cái' },   { id:'chiec',label:'chiếc' },
  ],
  payMethods: [
    { id:'congno',   label:'Công nợ' },               /* mặc định — đa phần đơn B2B ghi nợ */
    { id:'cod',      label:'COD (thu khi giao)' },
    { id:'paid',     label:'Đã thanh toán' },
    { id:'transfer', label:'Chuyển khoản trước' },
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
    { id:'sale',      label:'Sale' },
    { id:'ke-toan',   label:'Kế Toán' },
    { id:'ban-gd',    label:'Ban Giám Đốc' },
    { id:'nhan-su',   label:'Nhân Sự' },
    { id:'marketing', label:'Marketing' },
    { id:'kho',       label:'Kho' },
    { id:'ship',      label:'Ship' },
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

/* Badge "Đơn từ web" — đếm đơn web_orders status=pending, cập nhật mọi trang + realtime */
window.refreshWebOrdersBadge = function () {
  if (!window.SB) return;
  const apply = (n) => {
    window.__webOrdersPending = n || 0;
    const a = document.querySelector('.sidebar .nav a[href="web-orders.html"]');
    if (!a) return;
    let b = a.querySelector('.badge-n');
    if (n > 0) {
      if (!b) { b = document.createElement('span'); b.className = 'badge-n'; a.appendChild(b); }
      b.textContent = n;
    } else if (b) { b.remove(); }
  };
  window.SB.from('web_orders').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    .then(({ count }) => apply(count || 0)).catch(() => {});
  /* Báo Telegram đơn web mới (kênh 'web_order') */
  window.notifyNewWebOrders && window.notifyNewWebOrders();
  /* subscribe realtime 1 lần — có đơn web mới → đếm lại + nháy badge + báo TG */
  if (!window.__webOrdersSub && window.SB_DATA) {
    window.__webOrdersSub = true;
    window.SB_DATA.subscribe('web_orders', () => window.refreshWebOrdersBadge && window.refreshWebOrdersBadge());
  }
};

/* === Báo Telegram khi có ĐƠN WEB mới (status=pending) ===
   - Dedup per-device qua localStorage (nhiều tab không gửi trùng)
   - Baseline lần đầu: đánh dấu đơn pending hiện có là "đã biết" → KHÔNG spam đơn cũ,
     chỉ báo đơn đổ về SAU thời điểm này. */
window.notifyNewWebOrders = async function () {
  if (!window.SB || !window.sendTgMessage) return;
  const KEY = 'nstt_weborder_notified';
  const BASE = 'nstt_weborder_baseline';
  let sent;
  try { sent = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { sent = new Set(); }
  let resp;
  try {
    resp = await window.SB.from('web_orders')
      .select('id,cust_name,cust_phone,cust_address,items,total,web_code')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(50);
  } catch (e) { return; }
  const rows = (resp && resp.data) || [];
  /* Baseline: lần chạy đầu trên máy này → ghi nhận hết, không gửi */
  if (!localStorage.getItem(BASE)) {
    rows.forEach(r => sent.add(r.id));
    try { localStorage.setItem(KEY, JSON.stringify([...sent])); localStorage.setItem(BASE, '1'); } catch (e) {}
    return;
  }
  const fresh = rows.filter(r => !sent.has(r.id));
  if (!fresh.length) return;
  /* chỉ gửi nếu đã cấu hình kênh 'web_order' */
  if (!window.getTgChannel || !window.getTgChannel('web_order')) {
    /* chưa cấu hình kênh → vẫn đánh dấu để khỏi dồn khi cấu hình sau */
    fresh.forEach(r => sent.add(r.id));
    try { localStorage.setItem(KEY, JSON.stringify([...sent])); } catch (e) {}
    return;
  }
  const fmt = n => (+n || 0).toLocaleString('vi-VN');
  for (const r of fresh) {
    const items = Array.isArray(r.items) ? r.items : [];
    const lines = items.map((it, i) => `${i + 1}. ${it.name} × ${it.qty}${it.unit || ''}`).join('\n');
    const msg = `🛒 ĐƠN WEB MỚI${r.web_code ? ' — ' + r.web_code : ''}\n`
      + `👤 ${r.cust_name || '—'} · ☎ ${r.cust_phone || '—'}\n`
      + (r.cust_address ? `📍 ${r.cust_address}\n` : '')
      + `─────────────\n${lines || '(không có chi tiết)'}\n─────────────\n`
      + `💵 Tổng: ${fmt(r.total)} ₫\n\n👉 Vào CRM → "Đơn từ web" để DUYỆT.`;
    const res = await window.sendTgMessage('web_order', msg).catch(() => ({ ok: false }));
    if (res && res.ok) {
      sent.add(r.id);
      try { localStorage.setItem(KEY, JSON.stringify([...sent])); } catch (e) {}
    }
  }
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
          if (key === 'web-orders') {
            /* số đơn web chờ duyệt — cập nhật bất đồng bộ qua refreshWebOrdersBadge */
            return window.__webOrdersPending || 0;
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
      <button class="side-pin" title="Ghim menu mở rộng / thu gọn" onclick="window.toggleSidePin()">📌</button>
      <div class="brand">
        <div class="brand-logo">${window.brandLogo('compact', '../')}</div>
        <div class="brand-text">
          <div class="b1">Nông Sản Tuấn Tú Hà Nội</div>
          <div class="b2">CRM nội bộ</div>
        </div>
      </div>
      <nav class="nav">
        ${filteredNav.map(group => `
          ${group.section ? `<div class="nav-section">${group.section}</div>` : '<div class="nav-sep"></div>'}
          ${group.items.map(item => {
            /* badge động: tính số thực từ STORE theo badgeKey (0 thì ẩn) */
            let badgeVal = item.badge;
            if (item.badgeKey && window.navBadgeCount) badgeVal = window.navBadgeCount(item.badgeKey);
            return `
            <a href="${item.href}" class="${item.id === activeId ? 'active' : ''}" title="${String(item.label).replace(/"/g, '&quot;')}">
              <span class="ico">${item.icon}</span> <span class="lbl">${item.label}</span>
              ${badgeVal ? `<span class="badge-n">${badgeVal}</span>` : ''}
            </a>`;
          }).join('')}
        `).join('')}
      </nav>
      <div class="side-foot">
        <div class="avatar" style="background:${window.avatarColor(window.CURRENT_USER.name)}">${window.CURRENT_USER.initials}</div>
        <div class="user-block">
          <div class="u1">${window.CURRENT_USER.name}</div>
          <div class="u2">${window.CURRENT_USER.role} <span style="opacity:.55;font-size:10px">· ${window.APP_VERSION || ''}</span></div>
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

  /* === GHIM sidebar: icon-rail (auto thu gọn, hover mới bung) ↔ mở rộng cố định. Nhớ theo máy. === */
  window.toggleSidePin = window.toggleSidePin || function () {
    const app = document.querySelector('.app'); if (!app) return;
    const pinned = app.classList.toggle('side-pinned');
    try { localStorage.setItem('nstt_side_pinned', pinned ? '1' : '0'); } catch (e) {}
    const btn = document.querySelector('.side-pin');
    if (btn) { btn.textContent = pinned ? '📌' : '📍'; btn.title = pinned ? 'Bỏ ghim → tự thu gọn' : 'Ghim menu mở rộng'; }
  };
  try {
    const app = document.querySelector('.app');
    if (app && localStorage.getItem('nstt_side_pinned') === '1') app.classList.add('side-pinned');
    const pin = document.querySelector('.side-pin');
    if (pin) pin.textContent = (app && app.classList.contains('side-pinned')) ? '📌' : '📍';
  } catch (e) {}
  /* Auto đóng sidebar khi click vào link nav */
  document.querySelectorAll('.sidebar .nav a').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth <= 980) window.toggleSidebar(false);
    });
  });

  /* Wire chuông 🔔 thông báo */
  if (typeof window.setupNotifications === 'function') window.setupNotifications();

  /* Badge "Đơn từ web" — đếm đơn web chờ duyệt (mọi trang đều hiện) */
  if (typeof window.refreshWebOrdersBadge === 'function') window.refreshWebOrdersBadge();
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
  /* opts.stack=true → XẾP CHỒNG lên modal đang mở (giữ modal dưới, ẩn tạm) thay vì xoá.
     Dùng cho modal lồng (vd: preview import mở từ trong form Tạo phiếu). Mặc định = thay thế. */
  let layers = Array.from(document.querySelectorAll('.modal-bg'));
  if (opts.stack && layers.length) {
    const top = layers[layers.length - 1];
    top.style.display = 'none';
    top.setAttribute('data-stack-hidden', '1');
  } else if (layers.length) {
    layers.forEach(l => l.remove());
  }
  const depth = document.querySelectorAll('.modal-bg').length;   /* số modal còn lại */
  const id = depth === 0 ? 'modal-bg' : 'modal-bg-' + depth;
  const z = 200 + depth * 60;
  const backdropClick = opts.dismissOnBackdrop
    ? `onclick="if(event.target===this)window.closeModal()"`
    : '';
  const _mw = opts.fullWide ? 'width:90vw;max-width:90vw' : 'width:min(90vw,1400px);max-width:90vw';
  const html = `
    <div id="${id}" class="modal-bg open" style="z-index:${z}" ${backdropClick}>
      <div class="modal" style="${_mw}">
        <div class="modal-head">
          <h3>${title}</h3>
          <button class="modal-close" onclick="window.closeModal()" title="Đóng (Esc)">✕</button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
        ${opts.footer ? `<div class="modal-foot">${opts.footer}</div>` : ''}
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  /* Esc đóng modal trên cùng */
  if (!window._modalEscHandler) {
    window._modalEscHandler = (e) => {
      if (e.key === 'Escape' && document.querySelector('.modal-bg')) window.closeModal();
    };
    document.addEventListener('keydown', window._modalEscHandler);
  }
};
/* ============ XEM ẢNH TO (preview) — dùng cho ảnh POD giao hàng, ảnh phiếu trả... ============
   window.openImgPreview(src, title?) — mở ảnh full trên nền tối, bấm nền / ✕ / Esc để đóng. */
window.openImgPreview = function (src, title) {
  if (!src) return;
  const old = document.getElementById('img-preview-bg'); if (old) old.remove();
  const t = title ? String(title).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) : '';
  const el = document.createElement('div');
  el.id = 'img-preview-bg';
  el.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:24px';
  el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;max-width:94vw;max-height:94vh">
      <img src="${src}" style="max-width:94vw;max-height:82vh;object-fit:contain;border-radius:10px;box-shadow:0 12px 48px rgba(0,0,0,.6);background:#fff">
      ${t ? `<div style="color:#fff;font-size:13px;opacity:.9">${t}</div>` : ''}
      <button class="btn" onclick="document.getElementById('img-preview-bg').remove()" style="background:#fff;color:#111;font-weight:700">✕ Đóng</button>
    </div>`;
  el.onclick = e => { if (e.target === el) el.remove(); };
  const onKey = e => { if (e.key === 'Escape') { const b = document.getElementById('img-preview-bg'); if (b) b.remove(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
};
window.closeModal = function() {
  const layers = Array.from(document.querySelectorAll('.modal-bg'));
  if (!layers.length) return;
  layers[layers.length - 1].remove();          /* đóng modal trên cùng */
  const rem = Array.from(document.querySelectorAll('.modal-bg'));
  if (rem.length) {                              /* lộ lại modal dưới (nếu có) */
    const t = rem[rem.length - 1];
    t.style.display = '';
    t.removeAttribute('data-stack-hidden');
  }
};

/* ============ POPUP XÁC NHẬN (thay confirm() mặc định của trình duyệt) ============
   window.uiConfirm(message, {title, okText, cancelText, icon, danger}) → Promise<boolean>
   Dùng: if (!(await window.uiConfirm('…'))) return; */
window.uiConfirm = function (message, opts = {}) {
  opts = opts || {};
  return new Promise(resolve => {
    const old = document.getElementById('ui-confirm-bg'); if (old) old.remove();
    const title = opts.title || 'Xác nhận';
    const icon = opts.icon != null ? opts.icon : '❓';
    const okText = opts.okText || 'Xác nhận';
    const cancelText = opts.cancelText || 'Huỷ';
    const okStyle = opts.danger ? 'background:#DC2626;border-color:#DC2626;color:#fff' : '';
    const okClass = opts.danger ? 'btn' : 'btn btn-primary';
    const msg = String(message == null ? '' : message)
      .replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
      .replace(/\n/g, '<br>');
    const el = document.createElement('div');
    el.id = 'ui-confirm-bg';
    el.className = 'modal-bg open';
    el.style.zIndex = 4000;
    el.innerHTML = `<div class="modal" style="width:min(92vw,440px);max-width:92vw">
        <div class="modal-head"><h3>${icon ? icon + ' ' : ''}${title}</h3></div>
        <div class="modal-body" style="font-size:14.5px;line-height:1.65;color:var(--text)">${msg}</div>
        <div class="modal-foot" style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn btn-ghost" id="uicf-cancel">${cancelText}</button>
          <button class="${okClass}" id="uicf-ok" style="${okStyle}">${okText}</button>
        </div></div>`;
    document.body.appendChild(el);
    const done = v => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); else if (e.key === 'Enter') { e.preventDefault(); done(true); } };
    document.addEventListener('keydown', onKey);
    el.querySelector('#uicf-ok').onclick = () => done(true);
    el.querySelector('#uicf-cancel').onclick = () => done(false);
    el.onclick = e => { if (e.target === el) done(false); };
    setTimeout(() => { const b = el.querySelector('#uicf-ok'); if (b) b.focus(); }, 30);
  });
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
      { key:'taxCode', label:'MST DN', type:'text', placeholder:'0110302211' },
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
  { id: 'web_order',        icon: '🛒', label: 'Đơn web mới', desc: 'Báo ngay khi có đơn từ website đổ về (chờ duyệt)' },
  { id: 'bao_hang',         icon: '📋', label: 'Phiếu báo hàng', desc: 'Gửi danh sách báo hàng vào group kho/bếp ngay khi sale lên đơn' },
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
