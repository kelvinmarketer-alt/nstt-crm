/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Service Worker (PWA offline + cache)
   ========================================================= */
const CACHE_VERSION = "nstt-v59";
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
  const isCode = e.request.mode === 'navigate' || /\.(html|js|json|css)$/.test(url.pathname);
  /* Strategy:
     - HTML/JS/JSON/CSS (code + data): NETWORK-FIRST → luôn lấy bản mới khi online,
       cache chỉ làm fallback offline (tránh kẹt cache khi update app).
     - Còn lại (ảnh...): CACHE-FIRST cho nhanh. */
  if (isCode) {
    /* Ép revalidate HTTP cache (no-cache) — tránh browser memory/disk cache trả file js/html cũ */
    e.respondWith(
      fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('/pages/login.html')))
    );
  } else {
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
});
