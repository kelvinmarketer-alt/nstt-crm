/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Service Worker (PWA offline + cache)
   ========================================================= */
const CACHE_VERSION = "nstt-v548";
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles/tokens.css',
  '/styles/app.css',
  '/scripts/shared.js',
  '/scripts/store.js',
  '/scripts/auth.js',
  '/pages/login.html',
  '/pages/dashboard.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      cache.addAll(CORE_ASSETS).catch(err => console.warn('[SW] Pre-cache miss:', err))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  /* Xóa cache cũ */
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  /* === KHÔNG intercept navigation requests ===
     Browser tự handle 308/302 chain + Cloudflare auto-strip .html.
     Trước đây SW intercept gây ERR_FAILED khi chuyển module
     (cache 308 hỏng → fetch fail → user thấy "This site can't be reached"). */
  if (e.request.mode === 'navigate') return;

  /* KHÔNG intercept cross-origin (Supabase API, CDN...) */
  if (url.origin !== self.location.origin) return;

  const isCode = /\.(js|json|css)$/.test(url.pathname);

  if (isCode) {
    /* JS/CSS/JSON: STALE-WHILE-REVALIDATE — trả CACHE ngay (mở app tức thì, KHÔNG chờ ~20
       file JS qua mạng mỗi lần vào), đồng thời tải bản mới ở NỀN để cập nhật cache lần sau.
       An toàn vì cache đánh version theo CACHE_VERSION + activate xoá cache cũ → không kẹt
       bản cũ lâu; bản mới propagate ngay lần load kế tiếp. (Trước đây network-first no-cache
       → mỗi lần vào app đều chờ mạng tải hết JS/CSS = chậm, nhất là 3G/4G.) */
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetching = fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'follow' })
          .then(res => {
            if (res.ok && res.type === 'basic' && res.status >= 200 && res.status < 300) {
              const clone = res.clone();
              caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
            }
            return res;
          }).catch(() => cached);
        return cached || fetching;   /* có cache → trả NGAY + revalidate nền; chưa có → chờ mạng */
      })
    );
  } else if (/\.(jpg|jpeg|png|gif|webp|svg|ico|woff2?)$/.test(url.pathname)) {
    /* Static assets (ảnh, font): cache-first cho nhanh */
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        }
        return res;
      }))
    );
  }
  /* Còn lại (HTML, redirects, API) — không intercept, browser tự xử lý */
});
