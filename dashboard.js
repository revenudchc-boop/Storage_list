// ============================================================
// 🧭 القائمة الجانبية + 📊 لوحة مؤشرات الأرشيف
// لا تغيّر عناصر script.js: القائمة تضغط أزرار التبويبات الأصلية نفسها
// ============================================================
(function () {
    const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const fmtSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
    const fmtDate = iso => { try { return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } };
    const ago = iso => { const d = Math.floor((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? 'اليوم' : d === 1 ? 'أمس' : `منذ ${d} يوم`; };
    const $ = (s, r) => (r || document).querySelector(s);

    let built = false;

    function bars(items) {
        if (!items || !items.length) return '<div class="dv-empty">لا توجد بيانات</div>';
        const max = Math.max(...items.map(i => i.value), 1);
        return items.map(i => `<div class="dv-bar"><span class="l" title="${esc(i.name)}">${esc(i.name)}</span><span class="t"><i style="width:${Math.max(4, i.value / max * 100)}%"></i></span><span class="v">${i.value}</span></div>`).join('');
    }

    function fileRow(f) {
        const link = f.url && typeof _activeServerUrl !== 'undefined' && _activeServerUrl
            ? `<a href="${esc(_activeServerUrl + f.url)}" target="_blank" rel="noopener">عرض</a>` : '';
        return `<li><span class="nm" title="${esc(f.name)}">📄 ${esc(f.name)}</span><span class="mt">${fmtSize(f.size)} · ${ago(f.modified)}</span>${link}</li>`;
    }

    function render(d) {
        const L = d.latest;
        $('#dvBody').innerHTML = `
        <div class="dv-kpis">
            <div class="dv-kpi" style="--c:#0a3d62"><small>📁 إجمالي الملفات</small><div class="n">${d.totals.files}</div></div>
            <div class="dv-kpi" style="--c:#1e6f5c"><small>🚢 عدد السفن (المجلدات)</small><div class="n">${d.totals.folders}</div></div>
            <div class="dv-kpi" style="--c:#e67e22"><small>💾 حجم الأرشيف</small><div class="n">${fmtSize(d.totals.bytes)}</div></div>
            <div class="dv-kpi" style="--c:#8e44ad"><small>🕒 آخر تحديث</small><div class="n" style="font-size:18px">${L ? ago(L.modified) : '—'}</div><div class="s">${L ? esc(fmtDate(L.modified)) : ''}</div></div>
        </div>
        <div class="dv-grid">
            <div class="dv-card"><h3>🚢 آخر سفينة تم رفعها${L ? ' — <span style="direction:ltr;display:inline-block">' + esc(L.folder) + '</span>' : ''}</h3>
                ${L ? `<ul class="dv-list">${L.files.map(fileRow).join('')}</ul>` : '<div class="dv-empty">لا توجد ملفات بعد</div>'}</div>
            <div class="dv-card"><h3>🕘 آخر الملفات المرفوعة</h3>
                ${d.recent.length ? `<ul class="dv-list">${d.recent.map(f => fileRow(f).replace('📄 ', '📄 ' + esc(f.folder) + ' / ')).join('')}</ul>` : '<div class="dv-empty">لا توجد ملفات</div>'}</div>
        </div>
        <div class="dv-grid">
            <div class="dv-card"><h3>🏷️ الملفات حسب الخط الملاحي</h3>${bars(d.byLine)}</div>
            <div class="dv-card"><h3>📅 الملفات حسب الشهر</h3>${bars(d.byMonth)}</div>
            <div class="dv-card"><h3>🗂️ حسب نوع الملف</h3>${bars(d.byType)}</div>
        </div>
        <div class="s" style="font-size:12px;color:#6c757d;text-align:center">آخر تحديث للوحة: ${esc(fmtDate(d.generatedAt))}</div>`;
    }

    async function loadDash() {
        const body = $('#dvBody'), pill = $('#dvStatus');
        body.innerHTML = '<div class="dv-empty">⏳ جاري تحميل الإحصائيات...</div>';
        let up = false;
        try { up = await detectLocalServer(); } catch (e) { /* ignore */ }
        pill.className = 'dv-pill ' + (up ? 'dv-ok' : 'dv-bad');
        pill.textContent = up ? '🖥️ الخادم المحلي متصل' : '⚠️ الخادم المحلي غير متصل';
        if (!up) { body.innerHTML = '<div class="dv-empty">الأرشيف المحلي غير متاح الآن.<br>شغّل الخادم أو افتح التطبيق من عنوانه، ثم اضغط «تحديث».</div>'; return; }
        try {
            const r = await _serverFetch('/api/archive/stats');
            const d = await r.json();
            if (!r.ok || !d.success) throw new Error(d.error || 'HTTP ' + r.status);
            render(d);
        } catch (e) {
            body.innerHTML = `<div class="dv-empty">❌ تعذّر تحميل الإحصائيات: ${esc(e.message)}</div>`;
        }
    }

    function setActive(btn) {
        document.querySelectorAll('#sidebar .sb-item').forEach(b => b.classList.toggle('active', b === btn));
        $('#sidebar').classList.remove('open');
    }

    function build() {
        if (built) return; built = true;
        const user = (typeof getCurrentUser === 'function' && getCurrentUser()) || {};
        const tabs = [...document.querySelectorAll('.tabs .tab-btn')];

        const side = document.createElement('aside');
        side.id = 'sidebar';
        side.innerHTML = `
            <div class="sb-brand">📦 إدارة السفينة<small>نظام الأرشيف والتقارير</small></div>
            <nav>
                <button class="sb-item active" data-go="dash">📊 لوحة المؤشرات</button>
                <div class="sb-title">التقارير</div>
                ${tabs.map(t => `<button class="sb-item" data-tab="${esc(t.dataset.tab)}">${esc(t.textContent.trim())}</button>`).join('')}
                <div class="sb-title">الأرشيف</div>
                <button class="sb-item" data-go="archive">🗄️ فتح الأرشيف</button>
            </nav>
            <div class="sb-user"><b>👤 ${esc(user.fullName || '')}</b><span>${user.role === 'admin' ? '👑 مدير' : '👁️ مشاهد'} · ${esc((user.lineIds || []).includes('*') ? 'كل الخطوط' : (user.lineIds || []).join(' • '))}</span>
                <button class="sb-logout" id="sbLogout">🚪 تسجيل الخروج</button></div>`;
        document.body.appendChild(side);

        const tg = document.createElement('button');
        tg.id = 'sbToggle'; tg.textContent = '☰';
        tg.onclick = () => side.classList.toggle('open');
        document.body.appendChild(tg);

        const view = document.createElement('section');
        view.id = 'dashView';
        view.innerHTML = '<div class="dv-head"><h2>📊 لوحة مؤشرات الأرشيف</h2><div><span id="dvStatus" class="dv-pill dv-bad">…</span> <button class="dv-btn" id="dvRefresh">🔄 تحديث</button></div></div><div id="dvBody"></div>';
        const header = $('#appContainer .header');
        header.parentNode.insertBefore(view, header.nextSibling);

        document.body.classList.add('has-sidebar', 'dash-mode');

        side.addEventListener('click', e => {
            const b = e.target.closest('.sb-item'); if (!b) return;
            if (b.dataset.go === 'dash') { document.body.classList.add('dash-mode'); setActive(b); loadDash(); }
            else if (b.dataset.tab) {
                document.body.classList.remove('dash-mode'); setActive(b);
                const orig = $(`.tabs .tab-btn[data-tab="${b.dataset.tab}"]`); if (orig) orig.click();
            } else if (b.dataset.go === 'archive') {
                const a = $('#archiveBtn') || document.querySelector('button[id*="rchive"]:not(#createArchiveBtn)');
                if (a) a.click(); else alert('زر الأرشيف غير متاح لحسابك.');
            }
        });
        $('#sbLogout').onclick = () => { if (confirm('تسجيل الخروج؟')) logout(); };
        $('#dvRefresh').onclick = loadDash;
        loadDash();
    }

    // ننتظر حتى تُظهر auth.js التطبيق بعد نجاح الدخول
    const timer = setInterval(() => {
        const app = document.getElementById('appContainer');
        if (app && app.style.display === 'block' && $('#appContainer .header')) { clearInterval(timer); build(); }
    }, 300);
})();
