// ============================================================
// Service Worker: يحفظ ملفات البرنامج والمكتبات لتعمل الصفحة دون إنترنت
// استراتيجية: الشبكة أولاً (دائماً أحدث نسخة)، وعند انقطاعها تُقدَّم النسخة المحفوظة.
// لا يتعامل مع طلبات الخادم المحلي /api ولا مع GitHub.
// ============================================================
const CACHE = 'archive-app-v1';
const CDN_HOSTS = /(^|\.)(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|tessdata\.projectnaptha\.com)$/;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
    const r = e.request;
    if (r.method !== 'GET') return;
    const u = new URL(r.url), same = u.origin === self.location.origin;
    if (!same && !CDN_HOSTS.test(u.hostname)) return;
    if (same && /^\/api\//.test(u.pathname)) return;
    e.respondWith(
        fetch(r).then(res => {
            if (res && (res.ok || res.type === 'opaque')) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(r, c)).catch(() => { }); }
            return res;
        }).catch(() => caches.match(r).then(m => m || caches.match(r, { ignoreSearch: true })).then(m => {
            if (m) return m;
            if (r.mode === 'navigate') return caches.match('index.html').then(x => x || caches.match('./')).then(x => x || Response.error());
            return Response.error();
        }))
    );
});
