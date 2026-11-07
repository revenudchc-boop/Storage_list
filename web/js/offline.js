// ============================================================
// ArchiveSync: طابور رفع احتياطي إلى GitHub
// عند فشل رفع GitHub بسبب انقطاع الإنترنت (والملف محفوظ على الخادم المحلي) يُحفظ الملف هنا في IndexedDB
// ويُرفع تلقائياً عند عودة الاتصال (حدث online، عند فتح الصفحة، وكل دقيقتين).
// يعتمد على الدالة _ghPutFile في archive.js.
// ============================================================
(function () {
    const DB = 'archiveOfflineDB', ST = 'pending', MAX_AUTO_TRIES = 5;
    const open = () => new Promise((res, rej) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'key' });
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(ST, mode), q = fn(t.objectStore(ST)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
    const list = () => tx('readonly', s => s.getAll()).then(a => a || []);
    const count = async () => { try { return (await list()).length; } catch (e) { return 0; } };
    const add = (folder, name, b64) => tx('readwrite', s => s.put({ key: folder + '/' + name, folder, name, b64, tries: 0, t: Date.now() })).then(() => { changed(); });
    const del = (key) => tx('readwrite', s => s.delete(key));
    const upd = (item) => tx('readwrite', s => s.put(item));

    let busy = false;
    async function flush(manual) {
        if (busy || navigator.onLine === false || typeof _ghPutFile !== 'function') return { done: 0, left: await count() };
        if (!localStorage.getItem('github_token')) return { done: 0, left: await count() };
        busy = true; let done = 0;
        try {
            for (const it of await list()) {
                if (!manual && it.tries >= MAX_AUTO_TRIES) continue;
                const r = await _ghPutFile(it.folder, it.name, it.b64);
                if (r.success) { await del(it.key); done++; }
                else { it.tries = (it.tries || 0) + 1; it.err = r.error; await upd(it); if (r.network) break; }
            }
        } catch (e) { console.warn('ArchiveSync:', e); }
        busy = false; changed();
        if (done) console.log('☁️ [ArchiveSync] رُفع ' + done + ' ملف مؤجَّل إلى GitHub');
        return { done, left: await count() };
    }

    // ---------- شارة الحالة ----------
    let badge = null;
    async function changed() {
        if (!document.body) return;
        const n = await count(), off = navigator.onLine === false;
        if (!badge) {
            badge = document.createElement('div'); badge.id = 'archiveSyncBadge';
            badge.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:99999;font:600 13px Tahoma,sans-serif;color:#fff;border-radius:999px;padding:8px 14px;box-shadow:0 3px 12px #0004;cursor:pointer;display:none;direction:rtl;max-width:90vw';
            badge.onclick = async () => { badge.textContent = '⏳ جاري المزامنة…'; const r = await flush(true); if (r.left && navigator.onLine !== false) alert('تعذّر رفع ' + r.left + ' ملف إلى GitHub (تحقق من الرمز أو الاتصال).'); changed(); };
            document.body.appendChild(badge);
        }
        if (!n && !off) { badge.style.display = 'none'; return; }
        badge.style.display = 'block'; badge.style.background = off ? '#c0392b' : '#e67e22';
        badge.textContent = (off ? '📴 لا يوجد إنترنت' : '⏳') + (n ? (off ? ' — ' : ' ') + n + ' ملف بانتظار رفعه إلى GitHub' + (off ? '' : ' (اضغط للمزامنة)') : ' — الملفات تُحفظ على الخادم المحلي وتُرفع لاحقاً');
        badge.title = 'الملفات المؤجَّلة محفوظة على الخادم المحلي، وتُرفع تلقائياً عند عودة الإنترنت';
    }
    window.addEventListener('online', () => { changed(); setTimeout(() => flush(false), 1500); });
    window.addEventListener('offline', changed);
    document.addEventListener('DOMContentLoaded', () => { changed(); setTimeout(() => flush(false), 4000); });
    setInterval(() => { count().then(n => { if (n) flush(false); }); }, 120000);

    window.ArchiveSync = { add, list, count, flush };
})();
