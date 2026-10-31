// ============================================================
// 🧭 القائمة الجانبية + 📊 لوحة المؤشرات
// البيانات تُجمع من الخادم المحلي ومن GitHub (archive_index.json) وتُدمج، ثم تُفلتر حسب خطوط المستخدم
// ============================================================
(function () {
    const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const $ = (s, r) => (r || document).querySelector(s);
    const fmtSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
    const fmtDate = d => { try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return d; } };
    const ago = d => { if (!d) return '—'; const n = Math.floor((Date.now() - new Date(d)) / 864e5); return n <= 0 ? 'اليوم' : n === 1 ? 'أمس' : `منذ ${n} يوم`; };
    const COLORS = ['#0e7490', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];

    // ---------- تحليل البيانات ----------
    const lineOf = n => { const p = String(n).replace(/\.[^.]+$/, '').split('_'); return p.length >= 3 ? p[p.length - 2] : p.length === 2 ? p[1] : null; };
    function canSee(name) {
        const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (!u) return false;
        if (u.role === 'admin' || (u.lineIds || []).includes('*')) return true;
        const l = lineOf(name);
        return !!l && (u.lineIds || []).some(x => String(x).toLowerCase() === l.toLowerCase());
    }
    const dateOf = (folder, file) => {
        const m = /(\d{4})-(\d{2})-(\d{2})/.exec(file.name) || /(\d{4})-(\d{2})-(\d{2})/.exec(folder.name);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        return file.modified ? new Date(file.modified).toISOString().slice(0, 10) : null;
    };

    function analyze(localFolders, ghFolders) {
        const map = new Map();
        const add = (folders, key) => (folders || []).forEach(f => (f.files || []).forEach(x => {
            if (x.name === '_info.json' || !canSee(x.name)) return;
            const k = f.name + '/' + x.name;
            const r = map.get(k) || { folder: f.name, name: x.name, size: 0, url: null, local: false, gh: false, date: null };
            r[key] = true; r.size = r.size || x.size || 0; r.date = r.date || dateOf(f, x);
            if (key === 'local' || !r.url) r.url = x.download_url || r.url;
            map.set(k, r);
        }));
        add(ghFolders, 'gh'); add(localFolders, 'local');
        const files = [...map.values()];
        const tally = (fn, n) => Object.entries(files.reduce((m, f) => { const k = fn(f); m[k] = (m[k] || 0) + 1; return m; }, {}))
            .sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, value]) => ({ name, value }));
        const folders = {};
        files.forEach(f => { const o = folders[f.folder] || (folders[f.folder] = { name: f.folder, date: '', files: [] }); o.files.push(f); if (f.date && f.date > o.date) o.date = f.date; });
        const ships = Object.values(folders).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.name.localeCompare(a.name));
        const byDate = [...files].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return {
            files, ships, total: files.length, bytes: files.reduce((a, f) => a + f.size, 0),
            latest: ships[0] || null, recent: byDate.slice(0, 8),
            byLine: tally(f => lineOf(f.name) || '—', 8),
            byType: tally(f => (f.name.split('.').pop() || '—').toUpperCase(), 5),
            byMonth: Object.entries(files.reduce((m, f) => { if (f.date) { const k = f.date.slice(0, 7); m[k] = (m[k] || 0) + 1; } return m; }, {})).sort().slice(-6).map(([name, value]) => ({ name, value })),
            sync: { both: files.filter(f => f.local && f.gh).length, localOnly: files.filter(f => f.local && !f.gh).length, ghOnly: files.filter(f => f.gh && !f.local).length }
        };
    }
    window.DashboardUtil = { analyze };

    // ---------- جلب البيانات ----------
    async function fetchGithubIndex() {
        try {
            const url = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/archive/archive_index.json?t=${Date.now()}`;
            const r = await fetch(url);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            return Array.isArray(d) ? d : d.folders || [];
        } catch (e) {
            return Array.isArray(window.savedArchiveFolders) ? window.savedArchiveFolders : null;
        }
    }

    // ---------- الرسم ----------
    function hbars(items) {
        if (!items.length) return '<div class="dv-empty">لا توجد بيانات</div>';
        const max = Math.max(...items.map(i => i.value), 1);
        return items.map(i => `<div class="dv-bar"><span class="l" title="${esc(i.name)}">${esc(i.name)}</span><span class="t"><i style="width:${Math.max(5, i.value / max * 100)}%"></i></span><span class="v">${i.value}</span></div>`).join('');
    }
    function vbars(items) {
        if (!items.length) return '<div class="dv-empty">لا توجد بيانات</div>';
        const max = Math.max(...items.map(i => i.value), 1);
        return `<div class="dv-cols">${items.map(i => `<div class="c"><b>${i.value}</b><i style="height:${Math.max(6, i.value / max * 100)}%"></i><span>${esc(i.name.slice(2))}</span></div>`).join('')}</div>`;
    }
    function donut(items, centerLabel) {
        const sum = items.reduce((a, i) => a + i.value, 0);
        if (!sum) return '<div class="dv-empty">لا توجد بيانات</div>';
        let acc = 0;
        const stops = items.map((i, k) => { const s = acc / sum * 100; acc += i.value; return `${COLORS[k % COLORS.length]} ${s}% ${acc / sum * 100}%`; }).join(',');
        return `<div class="dv-donut"><div class="ring" style="background:conic-gradient(${stops})"><div><b>${sum}</b><small>${esc(centerLabel)}</small></div></div>
            <ul>${items.map((i, k) => `<li><u style="background:${COLORS[k % COLORS.length]}"></u>${esc(i.name)}<b>${i.value}</b></li>`).join('')}</ul></div>`;
    }
    const link = f => f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">عرض ↗</a>` : '';
    const srcTag = f => `<em class="tag ${f.local && f.gh ? 'both' : f.local ? 'loc' : 'gh'}">${f.local && f.gh ? 'محلي + GitHub' : f.local ? 'محلي' : 'GitHub'}</em>`;
    const row = (f, withFolder) => `<li><span class="nm" title="${esc(f.name)}">📄 ${withFolder ? esc(f.folder) + ' / ' : ''}${esc(f.name)}</span><span class="mt">${fmtSize(f.size)}${f.date ? ' · ' + ago(f.date) : ''}</span>${srcTag(f)}${link(f)}</li>`;
    const kpi = (icon, label, val, sub, c) => `<div class="dv-kpi" style="--c:${c}"><div class="ic">${icon}</div><div><small>${label}</small><div class="n">${val}</div><div class="s">${sub || '&nbsp;'}</div></div></div>`;

    function render(d, st) {
        const L = d.latest, s = d.sync;
        $('#dvBody').innerHTML = `
        <div class="dv-kpis">
            ${kpi('📁', 'إجمالي الملفات', d.total, `${d.ships.length} سفينة`, '#0e7490')}
            ${kpi('🚢', 'آخر سفينة', L ? esc(L.name.split('_')[0]) : '—', L && L.date ? fmtDate(L.date) + ' · ' + ago(L.date) : '', '#14b8a6')}
            ${kpi('💾', 'حجم الأرشيف', fmtSize(d.bytes), '', '#f59e0b')}
            ${kpi('🔄', 'المزامنة', s.localOnly + s.ghOnly === 0 ? 'متطابقة ✓' : (s.localOnly + s.ghOnly) + ' فرق', `${s.both} ملف في المصدرين`, s.localOnly + s.ghOnly === 0 ? '#16a34a' : '#ef4444')}
        </div>
        <div class="dv-grid g2">
            <div class="dv-card"><h3>🚢 آخر سفينة${L ? ` <small dir="ltr">${esc(L.name)}</small>` : ''}</h3>
                ${L ? `<ul class="dv-list">${L.files.map(f => row(f)).join('')}</ul>` : '<div class="dv-empty">لا توجد ملفات بعد</div>'}</div>
            <div class="dv-card"><h3>🕘 آخر الملفات</h3>
                ${d.recent.length ? `<ul class="dv-list">${d.recent.map(f => row(f, true)).join('')}</ul>` : '<div class="dv-empty">لا توجد ملفات</div>'}</div>
        </div>
        <div class="dv-grid g3">
            <div class="dv-card"><h3>🏷️ حسب الخط الملاحي</h3>${hbars(d.byLine)}</div>
            <div class="dv-card"><h3>📅 النشاط الشهري</h3>${vbars(d.byMonth)}</div>
            <div class="dv-card"><h3>🗂️ نوع الملفات</h3>${donut(d.byType, 'ملف')}</div>
        </div>
        <div class="dv-grid g2">
            <div class="dv-card"><h3>☁️ حالة المصادر</h3>${donut([{ name: 'في المصدرين', value: s.both }, { name: 'محلي فقط', value: s.localOnly }, { name: 'GitHub فقط', value: s.ghOnly }].filter(i => i.value), 'ملف')}
                <p class="dv-note">${st.local ? '' : '⚠️ الخادم المحلي غير متصل؛ تُعرض بيانات GitHub فقط. '}${st.gh ? '' : '⚠️ تعذّر قراءة فهرس GitHub. '}${s.localOnly ? `يوجد ${s.localOnly} ملف محلي غير مرفوع إلى GitHub (استخدم «مزامنة» من نافذة الأرشيف). ` : ''}${s.ghOnly ? `يوجد ${s.ghOnly} ملف على GitHub غير موجود محلياً.` : ''}</p></div>
            <div class="dv-card"><h3>🚢 أحدث السفن</h3><ul class="dv-list">${d.ships.slice(0, 6).map(sh => `<li><span class="nm">${esc(sh.name)}</span><span class="mt">${sh.files.length} ملف${sh.date ? ' · ' + fmtDate(sh.date) : ''}</span></li>`).join('') || '<li class="dv-empty">—</li>'}</ul></div>
        </div>`;
    }

    async function loadDash() {
        const body = $('#dvBody');
        body.innerHTML = '<div class="dv-skel"></div><div class="dv-skel"></div>';
        const up = await detectLocalServer().catch(() => false);
        const [lr, gr] = await Promise.allSettled([up ? loadLocalArchiveFolders() : Promise.resolve(null), fetchGithubIndex()]);
        const local = lr.status === 'fulfilled' ? lr.value : null, gh = gr.status === 'fulfilled' ? gr.value : null;
        const st = { local: !!local, gh: !!gh };
        $('#dvStatus').innerHTML = `<span class="dv-pill ${st.local ? 'ok' : 'bad'}">🖥️ المحلي ${st.local ? 'متصل' : 'غير متصل'}</span><span class="dv-pill ${st.gh ? 'ok' : 'bad'}">☁️ GitHub ${st.gh ? 'متصل' : 'غير متاح'}</span>`;
        if (!st.local && !st.gh) { body.innerHTML = '<div class="dv-empty big">لا يمكن الوصول إلى أي مصدر للأرشيف حالياً.<br>تحقق من الخادم المحلي أو الاتصال بالإنترنت ثم اضغط «تحديث».</div>'; return; }
        try { render(analyze(local, gh), st); } catch (e) { body.innerHTML = `<div class="dv-empty big">❌ ${esc(e.message)}</div>`; }
    }

    // ---------- القائمة الجانبية ----------
    let built = false;
    const setActive = b => { document.querySelectorAll('#sidebar .sb-item').forEach(x => x.classList.toggle('active', x === b)); $('#sidebar').classList.remove('open'); };

    function build() {
        if (built) return; built = true;
        const user = (typeof getCurrentUser === 'function' && getCurrentUser()) || {};
        const tabs = [...document.querySelectorAll('.tabs .tab-btn')];
        const side = document.createElement('aside');
        side.id = 'sidebar';
        side.innerHTML = `
            <div class="sb-brand"><span class="logo">📦</span><div>إدارة السفينة<small>الأرشيف والتقارير</small></div></div>
            <nav>
                <button class="sb-item active" data-go="dash">📊 لوحة المؤشرات</button>
                <div class="sb-title">التقارير</div>
                ${tabs.map(t => `<button class="sb-item" data-tab="${esc(t.dataset.tab)}">${esc(t.textContent.trim())}</button>`).join('')}
                <div class="sb-title">الأرشيف</div>
                <button class="sb-item" data-go="archive">🗄️ فتح الأرشيف</button>
            </nav>
            <div class="sb-user"><div class="av">${esc((user.fullName || '?').trim().charAt(0).toUpperCase())}</div>
                <div><b>${esc(user.fullName || '')}</b><span>${user.role === 'admin' ? 'مدير' : 'مشاهد'} · ${esc((user.lineIds || []).includes('*') ? 'كل الخطوط' : (user.lineIds || []).join(' • '))}</span></div>
                <button id="sbLogout" title="تسجيل الخروج">⏻</button></div>`;
        document.body.appendChild(side);
        const tg = document.createElement('button');
        tg.id = 'sbToggle'; tg.textContent = '☰'; tg.onclick = () => side.classList.toggle('open');
        document.body.appendChild(tg);

        const view = document.createElement('section');
        view.id = 'dashView';
        view.innerHTML = '<div class="dv-head"><div><h2>لوحة المؤشرات</h2><p>نظرة شاملة على الأرشيف المحلي وGitHub</p></div><div class="dv-tools"><span id="dvStatus"></span><button class="dv-btn" id="dvRefresh">🔄 تحديث</button></div></div><div id="dvBody"></div>';
        const header = $('#appContainer .header');
        header.parentNode.insertBefore(view, header.nextSibling);
        document.body.classList.add('has-sidebar', 'dash-mode');

        side.addEventListener('click', e => {
            const b = e.target.closest('.sb-item'); if (!b) return;
            if (b.dataset.go === 'dash') { document.body.classList.add('dash-mode'); setActive(b); loadDash(); }
            else if (b.dataset.tab) { document.body.classList.remove('dash-mode'); setActive(b); const o = $(`.tabs .tab-btn[data-tab="${b.dataset.tab}"]`); if (o) o.click(); }
            else if (b.dataset.go === 'archive') { const a = $('#archiveBtn') || document.querySelector('button[id*="rchive"]:not(#createArchiveBtn)'); if (a) a.click(); else alert('زر الأرشيف غير متاح لحسابك.'); }
        });
        $('#sbLogout').onclick = () => { if (confirm('تسجيل الخروج؟')) logout(); };
        $('#dvRefresh').onclick = loadDash;
        loadDash();
    }

    const timer = setInterval(() => {
        const app = document.getElementById('appContainer');
        if (app && app.style.display === 'block' && $('#appContainer .header')) { clearInterval(timer); build(); }
    }, 300);
})();
