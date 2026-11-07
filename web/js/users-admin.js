// ============================================================
// ⚙️ إعدادات المستخدمين (للمدير فقط) — تصميم عصري: قائمة مستخدمين + لوحة تحرير
// إنشاء المستخدمين وتعديل صلاحياتهم وكلمات مرورهم ورمز GitHub، ثم توليد ملف users.json
// لنسخه ولصقه في GitHub (أو تنزيله).
// الصلاحيات: archive (عرض الأرشيف) هي الأساس، وscan/upload/delete تتطلبها.
// يعتمد على: sha256, loadUsers, getCurrentUser, isAdmin, USERS_URL من auth.js
// ============================================================
(function () {
    const PERMS = [
        ['archive', '🗄️', 'عرض الأرشيف', 'يرى زر الأرشيف ولوحة بياناته ويفتح ملفاته. بدونها يختفي الأرشيف كلياً.'],
        ['scan', '📠', 'المسح الضوئي', 'يمسح المستندات ويحفظها في الأرشيف.'],
        ['upload', '📤', 'الرفع', 'يرفع الملفات وينشئ مجلدات الأرشيف.'],
        ['delete', '🗑️', 'الحذف', 'يحذف ملفات الأرشيف.']
    ];
    const KEYS = PERMS.map(p => p[0]), WRITE = ['scan', 'upload', 'delete'];
    const PRESETS = [
        ['بلا أرشيف', []],
        ['عرض الأرشيف', ['archive']],
        ['مسح ورفع', ['archive', 'scan', 'upload']],
        ['صلاحيات كاملة', KEYS.slice()]
    ];
    const FILTERS = [['all', 'الكل'], ['admin', 'المديرون'], ['viewer', 'المشاهدون'], ['disabled', 'المعطّلون']];
    const HUES = [212, 160, 28, 262, 340, 190, 95, 12];

    let users = [], me = null, host = null, sel = 0, filter = 'all', query = '';
    const $ = s => host.querySelector(s);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const hasP = (u, k) => u.perms.includes(k) || u.perms.includes('*');
    const hue = u => { const s = String(u.username || u.id || '?'); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return HUES[Math.abs(h) % HUES.length]; };
    const initial = u => esc((u.fullName || u.username || '؟').trim().charAt(0).toUpperCase());

    const CSS = `
#uaHost{--ink:#0f2740;--navy:#0a3d62;--muted:#5b6b7c;--line:#dbe2ea;--soft:#f3f6fa;--on:#1e6f5c;--amber:#b7791f;--red:#c0392b;
position:fixed;inset:0;z-index:100000;background:rgba(10,30,50,.62);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;direction:rtl;font-family:'Segoe UI',Tahoma,sans-serif;color:var(--ink)}
#uaHost *{box-sizing:border-box}
#uaHost button,#uaHost input,#uaHost select,#uaHost textarea{font-family:inherit}
.ua-box{background:#fff;border-radius:18px;width:100%;max-width:1120px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;line-height:1.7}
.ua-head{display:flex;align-items:center;gap:14px;padding:18px 24px;background:var(--navy);color:#fff}
.ua-head h2{margin:0;font-size:20px;font-weight:800}
.ua-head p{margin:2px 0 0;font-size:13px;opacity:.8}
.ua-head .sp{flex:1}
.ua-btn{border:0;border-radius:10px;padding:9px 16px;font-size:13.5px;font-weight:700;cursor:pointer;background:var(--navy);color:#fff;transition:background .15s,transform .15s}
.ua-btn:hover:not(:disabled){background:#0d4f7e}
.ua-btn:focus-visible,.ua-item:focus-visible,.ua-chip:focus-visible{outline:3px solid #7cc4ff;outline-offset:2px}
.ua-btn:disabled{opacity:.45;cursor:default}
.ua-btn.ghost{background:transparent;color:var(--navy);border:1.5px solid var(--line)}
.ua-btn.ghost:hover:not(:disabled){background:var(--soft)}
.ua-head .ua-btn.ghost{color:#fff;border-color:rgba(255,255,255,.4)}
.ua-head .ua-btn.ghost:hover{background:rgba(255,255,255,.14)}
.ua-btn.danger{background:#fff;color:var(--red);border:1.5px solid #f1c3bd}
.ua-btn.danger:hover:not(:disabled){background:#fdecea}
.ua-btn.sm{padding:5px 11px;font-size:12.5px}
.ua-btn.go{background:var(--on)}.ua-btn.go:hover:not(:disabled){background:#17594a}

.ua-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px 24px;border-bottom:1px solid var(--line);background:#fff}
.ua-search{flex:1;min-width:200px;position:relative}
.ua-search input{width:100%;padding:9px 38px 9px 12px;border:1.5px solid var(--line);border-radius:10px;font-size:14px;background:var(--soft);color:var(--ink)}
.ua-search input:focus{outline:none;border-color:var(--navy);background:#fff}
.ua-search span{position:absolute;inset-inline-start:auto;right:12px;top:50%;transform:translateY(-50%);opacity:.5;pointer-events:none}
.ua-chips{display:flex;gap:6px;flex-wrap:wrap}
.ua-chip{border:1.5px solid var(--line);background:#fff;color:var(--muted);border-radius:999px;padding:5px 13px;font-size:13px;font-weight:700;cursor:pointer}
.ua-chip b{font-weight:800;margin-inline-start:4px;color:var(--ink)}
.ua-chip.on{background:var(--navy);border-color:var(--navy);color:#fff}.ua-chip.on b{color:#fff}

.ua-main{display:grid;grid-template-columns:320px 1fr;min-height:520px}
.ua-side{border-inline-end:1px solid var(--line);background:var(--soft);max-height:70vh;overflow:auto;padding:8px}
.ua-item{display:flex;align-items:center;gap:12px;width:100%;text-align:right;background:transparent;border:0;border-radius:12px;padding:10px 12px;cursor:pointer;color:inherit;margin-bottom:2px}
.ua-item:hover{background:#e6edf5}
.ua-item.on{background:#fff;box-shadow:0 0 0 1.5px var(--navy),0 4px 14px rgba(10,61,98,.12)}
.ua-av{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:17px;color:#fff;background:hsl(var(--h) 55% 42%)}
.ua-av.lg{width:56px;height:56px;font-size:23px}
.ua-item .nm{min-width:0;flex:1}
.ua-item .nm b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ua-item .nm small{display:block;color:var(--muted);font-size:12.5px;direction:ltr;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ua-item .bd{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.ua-tag{font-size:11.5px;font-weight:800;border-radius:999px;padding:1px 9px;background:#e2e8f0;color:#475569;white-space:nowrap}
.ua-tag.adm{background:#fdf0d5;color:var(--amber)}
.ua-tag.arc{background:#d9f1ea;color:var(--on)}
.ua-tag.off{background:#fde4e1;color:var(--red)}
.ua-item.dis .ua-av{filter:grayscale(1);opacity:.6}
.ua-empty{padding:28px 14px;text-align:center;color:var(--muted);font-size:14px}

.ua-edit{padding:22px 28px 26px;min-width:0}
.ua-who{display:flex;align-items:center;gap:14px;margin-bottom:6px}
.ua-who h3{margin:0;font-size:19px}
.ua-who small{color:var(--muted);font-size:13px}
.ua-who .sp{flex:1}
.ua-sec{border-top:1px solid var(--line);padding:18px 0 4px;margin-top:16px}
.ua-sec:first-of-type{border-top:0;margin-top:8px}
.ua-sec h4{margin:0 0 3px;font-size:15px}
.ua-sec>p{margin:0 0 12px;color:var(--muted);font-size:13px}
.ua-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px 14px;margin-bottom:12px}
.ua-edit label.f{display:block;font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:4px}
.ua-edit input[type=text],.ua-edit input[type=password],.ua-edit select,#uaOut{width:100%;padding:9px 11px;border:1.5px solid var(--line);border-radius:9px;font-size:14px;background:#fff;color:var(--ink)}
.ua-edit input:focus,.ua-edit select:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 3px rgba(10,61,98,.12)}
.ua-lines{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;min-height:26px}
.ua-lines i{font-style:normal;font-size:12.5px;font-weight:700;background:#e6edf5;color:var(--navy);border-radius:7px;padding:1px 9px;direction:ltr}

.ua-presets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.ua-preset{border:1.5px solid var(--line);background:#fff;color:var(--navy);border-radius:9px;padding:4px 12px;font-size:12.5px;font-weight:700;cursor:pointer}
.ua-preset:hover{background:var(--soft)}
.ua-preset.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.ua-perm{display:flex;align-items:center;gap:12px;padding:11px 14px;border:1.5px solid var(--line);border-radius:12px;margin-bottom:8px;background:#fff}
.ua-perm.child{margin-inline-start:26px;position:relative}
.ua-perm.child::before{content:"";position:absolute;inset-inline-start:-16px;top:-9px;bottom:50%;width:12px;border-inline-start:2px solid var(--line);border-bottom:2px solid var(--line);border-end-start-radius:8px}
.ua-perm.on{border-color:#9fd3c5;background:#f3fbf8}
.ua-perm.lock{opacity:.5}
.ua-perm .ic{font-size:20px;flex:none;width:28px;text-align:center}
.ua-perm .tx{flex:1;min-width:0}
.ua-perm .tx b{display:block;font-size:14.5px}
.ua-perm .tx small{color:var(--muted);font-size:12.5px}
.ua-sw{position:relative;flex:none;width:44px;height:26px}
.ua-sw input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;z-index:1}
.ua-sw span{position:absolute;inset:0;border-radius:999px;background:#c5cfda;transition:background .18s}
.ua-sw span::after{content:"";position:absolute;top:3px;inset-inline-start:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .18s}
.ua-sw input:checked+span{background:var(--on)}
.ua-sw input:checked+span::after{transform:translateX(-18px)}
.ua-sw input:disabled{cursor:not-allowed}
.ua-sw input:focus-visible+span{outline:3px solid #7cc4ff;outline-offset:2px}
.ua-admnote{background:#fdf6e3;border:1px solid #f1dfae;color:#7a5614;border-radius:12px;padding:12px 14px;font-size:13.5px}

.ua-tok{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--muted);margin-top:2px}
.ua-tok label{font-weight:700;color:var(--ink);cursor:pointer;display:inline-flex;gap:6px;align-items:center}

.ua-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 24px;border-top:1px solid var(--line);background:var(--soft)}
.ua-foot label.h{display:inline-flex;gap:7px;align-items:center;font-size:13px;font-weight:700;cursor:pointer}
.ua-msg{font-weight:700;font-size:13.5px;flex:1;min-width:160px}.ua-msg.ok{color:#15803d}.ua-msg.bad{color:var(--red)}
.ua-out{margin:0 24px 18px;border:2px dashed var(--navy);border-radius:14px;padding:14px 16px;background:#fafcff}
.ua-out ol{margin:6px 0 10px;padding-inline-start:22px;font-size:13.5px}
#uaOut{min-height:170px;direction:ltr;font-family:Consolas,monospace;font-size:12px}
.ua-warn{margin:0 24px 22px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:12px;padding:10px 14px;font-size:13px}

@media(max-width:860px){.ua-main{grid-template-columns:1fr}.ua-side{max-height:240px;border-inline-end:0;border-bottom:1px solid var(--line)}.ua-edit{padding:18px 16px}.ua-head,.ua-tools,.ua-foot{padding-inline:16px}.ua-out,.ua-warn{margin-inline:16px}}
@media(prefers-reduced-motion:reduce){#uaHost *{transition:none!important}}`;

    // ---------- تشفير رمز GitHub بكلمة مرور المستخدم ----------
    async function encToken(token, password) {
        if (!(window.crypto && crypto.subtle)) throw new Error('تشفير الرمز يتطلب فتح البرنامج عبر HTTPS أو localhost');
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
        const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
        const out = new Uint8Array(28 + ct.length); out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
        let s = ''; out.forEach(b => s += String.fromCharCode(b)); return btoa(s);
    }
    function say(t, c) { const m = $('#uaMsg'); if (!m) return; m.textContent = t || ''; m.className = 'ua-msg ' + (c || ''); }

    // ---------- الحالة ----------
    function setUsers(list) {
        users = list.map(u => ({ ...u, perms: Array.isArray(u.perms) ? u.perms.slice() : [], lineIds: Array.isArray(u.lineIds) ? u.lineIds.slice() : [] }));
        sel = 0; render();
    }
    function togglePerm(u, p, on) {
        if (u.perms.includes('*')) u.perms = KEYS.slice();
        const s = new Set(u.perms);
        if (on) { s.add(p); if (WRITE.includes(p)) s.add('archive'); }
        else { s.delete(p); if (p === 'archive') WRITE.forEach(w => s.delete(w)); }
        u.perms = [...s];
    }
    const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
    const permList = u => u.perms.includes('*') ? KEYS.slice() : u.perms.filter(k => KEYS.includes(k));

    // ---------- الرسم ----------
    function matches(u) {
        if (filter === 'admin' && u.role !== 'admin') return false;
        if (filter === 'viewer' && u.role === 'admin') return false;
        if (filter === 'disabled' && u.status !== 'disabled') return false;
        const q = query.trim().toLowerCase();
        return !q || (String(u.username || '') + ' ' + String(u.fullName || '')).toLowerCase().includes(q);
    }
    function renderChips() {
        const n = { all: users.length, admin: users.filter(u => u.role === 'admin').length, viewer: users.filter(u => u.role !== 'admin').length, disabled: users.filter(u => u.status === 'disabled').length };
        $('#uaChips').innerHTML = FILTERS.map(([k, l]) => `<button type="button" class="ua-chip ${filter === k ? 'on' : ''}" data-f="${k}">${l}<b>${n[k]}</b></button>`).join('');
    }
    function renderList() {
        renderChips();
        const idx = users.map((u, i) => i).filter(i => matches(users[i]));
        $('#uaList').innerHTML = idx.map(i => {
            const u = users[i], adm = u.role === 'admin', off = u.status === 'disabled';
            const tags = (adm ? '<span class="ua-tag adm">👑 مدير</span>' : (hasP(u, 'archive') ? '<span class="ua-tag arc">🗄️ أرشيف</span>' : '<span class="ua-tag">مشاهد</span>')) + (off ? '<span class="ua-tag off">معطّل</span>' : '');
            return `<button type="button" class="ua-item ${i === sel ? 'on' : ''} ${off ? 'dis' : ''}" data-i="${i}">
 <span class="ua-av" style="--h:${hue(u)}">${initial(u)}</span>
 <span class="nm"><b>${esc(u.fullName || u.username || 'مستخدم جديد')}</b><small>${u.username ? '@' + esc(u.username) : 'بلا اسم مستخدم'}</small></span>
 <span class="bd">${tags}</span></button>`;
        }).join('') || '<div class="ua-empty">لا يوجد مستخدمون مطابقون.</div>';
    }
    function permsHtml(u) {
        if (u.role === 'admin') return '<div class="ua-admnote">👑 المدير يملك كل الصلاحيات تلقائياً، ويرى الأرشيف دائماً.</div>';
        const cur = permList(u);
        const presets = PRESETS.map(([l, p]) => `<button type="button" class="ua-preset ${sameSet(cur, p) ? 'on' : ''}" data-preset="${PRESETS.findIndex(x => x[0] === l)}">${l}</button>`).join('');
        const hasArc = hasP(u, 'archive');
        const rows = PERMS.map(([k, ic, name, desc]) => {
            const on = hasP(u, k), child = k !== 'archive', lock = child && !hasArc;
            return `<div class="ua-perm ${on ? 'on' : ''} ${child ? 'child' : ''} ${lock ? 'lock' : ''}">
 <span class="ic">${ic}</span><span class="tx"><b>${name}</b><small>${lock ? 'فعّل «عرض الأرشيف» أولاً.' : desc}</small></span>
 <label class="ua-sw"><input type="checkbox" data-p="${k}" ${on ? 'checked' : ''} ${lock ? 'disabled' : ''} aria-label="${name}"><span></span></label></div>`;
        }).join('');
        return `<div class="ua-presets">${presets}</div>${rows}`;
    }
    function linesHtml(u) {
        return (u.lineIds.length ? u.lineIds : []).map(l => `<i>${l === '*' ? 'كل الخطوط' : esc(l)}</i>`).join('') || '<span class="ua-note" style="color:#5b6b7c;font-size:12.5px">لم تُحدَّد خطوط.</span>';
    }
    function renderEditor() {
        const box = $('#uaEdit'), u = users[sel];
        if (!u) { box.innerHTML = '<div class="ua-empty" style="padding:80px 10px">اختر مستخدماً من القائمة، أو أضف مستخدماً جديداً.</div>'; return; }
        const adm = u.role === 'admin', isMe = me && u.username === me.username;
        box.innerHTML = `
<div class="ua-who">
 <span class="ua-av lg" style="--h:${hue(u)}">${initial(u)}</span>
 <div><h3>${esc(u.fullName || u.username || 'مستخدم جديد')}${isMe ? ' <small>(أنت)</small>' : ''}</h3><small>${adm ? 'مدير النظام' : 'مشاهد'} ${u.status === 'disabled' ? '— الحساب معطّل' : ''}</small></div>
 <span class="sp"></span>
 <button type="button" class="ua-btn danger sm" data-a="del" ${isMe ? 'disabled title="لا يمكنك حذف حسابك"' : ''}>حذف المستخدم</button>
</div>
<section class="ua-sec"><h4>بيانات الحساب</h4><p>الاسم وطريقة الدخول وحالة الحساب.</p>
 <div class="ua-grid">
  <div><label class="f">اسم المستخدم</label><input type="text" data-k="username" value="${esc(u.username)}" dir="ltr" autocomplete="off"></div>
  <div><label class="f">الاسم الكامل</label><input type="text" data-k="fullName" value="${esc(u.fullName)}"></div>
  <div><label class="f">الدور</label><select data-k="role"><option value="viewer" ${adm ? '' : 'selected'}>مشاهد</option><option value="admin" ${adm ? 'selected' : ''}>مدير (كل الصلاحيات)</option></select></div>
  <div><label class="f">الحالة</label><select data-k="status"><option value="active" ${u.status === 'disabled' ? '' : 'selected'}>مفعّل</option><option value="disabled" ${u.status === 'disabled' ? 'selected' : ''}>معطّل</option></select></div>
 </div>
</section>
<section class="ua-sec"><h4>الخطوط الملاحية</h4><p>الخطوط التي يرى بياناتها، مفصولة بفاصلة. اكتب * لكل الخطوط.</p>
 <input type="text" data-k="lineIds" value="${esc(u.lineIds.join(', '))}" dir="ltr" placeholder="MSC, YML, ZIM"><div class="ua-lines" id="uaLines">${linesHtml(u)}</div>
</section>
<section class="ua-sec"><h4>الصلاحيات</h4><p>الأرشيف مخفي بالكامل عن أي مستخدم لا يملك «عرض الأرشيف».</p><div id="uaPerms">${permsHtml(u)}</div></section>
<section class="ua-sec"><h4>الأمان</h4><p>اترك الحقلين فارغين للإبقاء على القيم الحالية.</p>
 <div class="ua-grid">
  <div><label class="f">كلمة مرور جديدة</label><input type="password" data-k="newpw" autocomplete="new-password" placeholder="••••••" value="${esc(u._newpw || '')}"></div>
  <div><label class="f">رمز GitHub لهذا المستخدم</label><input type="password" data-k="token" autocomplete="off" placeholder="github_pat_…" value="${esc(u._token || '')}"></div>
 </div>
 <div class="ua-tok">${u.tokenEnc ? '<span class="ua-tag arc">🔑 لديه رمز مشفّر</span><label><input type="checkbox" data-k="rmtok" ' + (u._rmtok ? 'checked' : '') + '> إزالة الرمز المخزَّن</label>' : '<span class="ua-tag">بلا رمز — لا يكتب على GitHub</span>'}</div>
</section>`;
    }
    function render() { renderList(); renderEditor(); }

    // ---------- الأحداث ----------
    function onInput(e) {
        const u = users[sel]; if (!u) return;
        const t = e.target;
        if (t.dataset.p) { togglePerm(u, t.dataset.p, t.checked); $('#uaPerms').innerHTML = permsHtml(u); renderList(); return; }
        const k = t.dataset.k; if (!k) return;
        if (k === 'lineIds') { u.lineIds = t.value.split(',').map(x => x.trim()).filter(Boolean); $('#uaLines').innerHTML = linesHtml(u); }
        else if (k === 'rmtok') u._rmtok = t.checked;
        else if (k === 'newpw' || k === 'token') { u['_' + k] = t.value; return; }
        else u[k] = t.value;
        if (k === 'role') { renderEditor(); } else if (k === 'fullName') { const h = $('.ua-who h3'); if (h) h.firstChild.textContent = u.fullName || u.username || 'مستخدم جديد'; }
        renderList();
    }
    function onEditClick(e) {
        const u = users[sel]; if (!u) return;
        const pb = e.target.closest('[data-preset]');
        if (pb) { u.perms = PRESETS[+pb.dataset.preset][1].slice(); $('#uaPerms').innerHTML = permsHtml(u); renderList(); return; }
        const b = e.target.closest('button[data-a="del"]');
        if (b && confirm('حذف المستخدم «' + (u.username || u.fullName || '') + '»؟')) { users.splice(sel, 1); sel = Math.max(0, Math.min(sel, users.length - 1)); render(); }
    }
    async function loadCurrent() {
        say('⏳ جاري الجلب…');
        try {
            let list = null;
            try { const r = await fetch(USERS_URL + '?t=' + Date.now()); if (r.ok) list = (await r.json()).users; } catch (e) { }
            if (!list) { list = await loadUsers(true); setUsers(list); say('⚠️ تعذّر الجلب من GitHub — عُرضت النسخة المتاحة محلياً', 'bad'); }
            else { setUsers(list); say('✅ تم الجلب من GitHub (' + list.length + ' مستخدم)', 'ok'); }
        } catch (e) { say('❌ ' + e.message, 'bad'); }
    }

    // يبني نص users.json الجديد (يرمي خطأ برسالة واضحة عند أي مشكلة)
    async function build() {
        const names = new Set(), out = [];
        for (const u of users) {
            const un = String(u.username || '').trim(); if (!un) throw new Error('يوجد مستخدم بلا اسم مستخدم');
            if (names.has(un.toLowerCase())) throw new Error('اسم المستخدم مكرر: ' + un); names.add(un.toLowerCase());
            const o = { ...u }; ['_newpw', '_token', '_rmtok'].forEach(k => delete o[k]);
            o.username = un; o.fullName = String(u.fullName || un).trim(); o.status = u.status === 'disabled' ? 'disabled' : 'active';
            if (o.role === 'admin') delete o.perms;
            else if (u.perms.includes('*')) o.perms = ['*'];
            else {
                const s = new Set(u.perms);
                if (WRITE.some(k => s.has(k))) s.add('archive');   // المسح/الرفع/الحذف تتطلب عرض الأرشيف
                o.perms = KEYS.filter(k => s.has(k));
            }
            let plain = null;
            if (u._newpw) { plain = u._newpw; o.password = $('#uaHash').checked ? 'sha256:' + await sha256(plain) : plain; }
            else if (!o.password) throw new Error('المستخدم «' + un + '» بلا كلمة مرور');
            else if (!String(o.password).startsWith('sha256:')) plain = o.password;
            if (u._rmtok) delete o.tokenEnc;
            if (u._token) {
                if (plain == null) throw new Error('لتشفير رمز «' + un + '» اكتب كلمة مرور المستخدم في خانة «كلمة مرور جديدة» (كلمته الحالية مشفّرة ولا يمكن قراءتها)');
                const t = u._token.trim(); if (!/^(github_pat_|ghp_)/.test(t)) throw new Error('رمز «' + un + '» غير صالح: يجب أن يبدأ بـ github_pat_ أو ghp_');
                o.tokenEnc = await encToken(t, plain);
            } else if (u._newpw && u.tokenEnc && !u._rmtok) throw new Error('غيّرت كلمة مرور «' + un + '» وله رمز مشفّر بالكلمة القديمة: أعد إدخال الرمز، أو اختر «إزالة الرمز المخزَّن»');
            out.push(o);
        }
        if (!out.some(o => o.role === 'admin' && o.status === 'active')) throw new Error('يجب أن يبقى مدير واحد مفعّل على الأقل وإلا لن يستطيع أحد إدارة المستخدمين');
        const mine = out.find(o => o.username.toLowerCase() === String(me.username).toLowerCase());
        if (!mine || mine.role !== 'admin' || mine.status !== 'active') { if (!confirm('⚠️ حسابك الحالي («' + me.username + '») لن يبقى مديراً مفعّلاً بعد هذا التعديل. متابعة؟')) throw new Error('أُلغي الإنشاء'); }
        return JSON.stringify({ users: out }, null, 2) + '\n';
    }
    async function generate() {
        const btn = $('#uaGen'); btn.disabled = true;
        try {
            const text = await build();
            const ta = $('#uaOut'); ta.value = text; $('#uaOutBox').style.display = 'block'; ta.select();
            const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(USERS_URL);
            if (m) $('#uaGhLink').href = 'https://github.com/' + m[1] + '/' + m[2] + '/edit/' + m[3] + '/' + m[4];
            let copied = false; try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { try { document.execCommand('copy'); copied = true; } catch (e2) { } }
            say(copied ? '✅ تم إنشاء users.json ونسخه — الصقه في GitHub' : '✅ تم إنشاء users.json — انسخه من الصندوق أدناه', 'ok');
            host._text = text;
            $('#uaOutBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) { say('❌ ' + e.message, 'bad'); }
        btn.disabled = false;
    }
    function download() {
        if (!host._text) return;
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([host._text], { type: 'application/json' })); a.download = 'users.json';
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function close() { if (host) { document.removeEventListener('keydown', onKey); host.remove(); host = null; } }
    function onKey(e) { if (e.key === 'Escape' && host && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) close(); }

    window.openUsersAdmin = async function () {
        if (typeof isAdmin !== 'function' || !isAdmin()) { alert('⛔ هذه الشاشة للمدير فقط'); return; }
        if (host) return;
        me = getCurrentUser(); filter = 'all'; query = '';
        if (!document.getElementById('uaStyle')) { const st = document.createElement('style'); st.id = 'uaStyle'; st.textContent = CSS; document.head.appendChild(st); }
        host = document.createElement('div'); host.id = 'uaHost';
        host.innerHTML = `<div class="ua-box" role="dialog" aria-modal="true" aria-label="إعدادات المستخدمين">
 <header class="ua-head"><div><h2>⚙️ إعدادات المستخدمين</h2><p>أضف المستخدمين وحدّد ما يراه كل واحد منهم، ثم أنشئ ملف users.json والصقه في GitHub.</p></div><span class="sp"></span>
  <button type="button" class="ua-btn ghost" id="uaClose">✖ إغلاق</button></header>
 <div class="ua-tools">
  <div class="ua-search"><span>🔍</span><input type="text" id="uaQ" placeholder="ابحث بالاسم أو اسم المستخدم" aria-label="بحث"></div>
  <div class="ua-chips" id="uaChips"></div>
  <button type="button" class="ua-btn ghost" id="uaReload">🔄 إعادة الجلب</button>
  <button type="button" class="ua-btn go" id="uaAdd">➕ مستخدم جديد</button>
 </div>
 <div class="ua-main"><aside class="ua-side" id="uaList"></aside><div class="ua-edit" id="uaEdit"></div></div>
 <div class="ua-foot">
  <button type="button" class="ua-btn" id="uaGen">📋 إنشاء ونسخ users.json</button>
  <label class="h"><input type="checkbox" id="uaHash" checked> تشفير كلمات المرور الجديدة (SHA-256)</label>
  <span id="uaMsg" class="ua-msg"></span>
 </div>
 <div class="ua-out" id="uaOutBox" style="display:none">
  <b>الخطوات:</b>
  <ol><li>النص أدناه نُسخ تلقائياً (أو انسخه بنفسك).</li><li>افتح <a id="uaGhLink" target="_blank" rel="noopener">صفحة تعديل users.json في GitHub</a>.</li><li>احذف المحتوى القديم والصق الجديد ثم اضغط <b>Commit changes</b>.</li><li>خلال دقائق يتحدّث الجميع (الخادم المحلي يجلب الملف كل 30 دقيقة).</li></ol>
  <textarea id="uaOut" readonly></textarea>
  <div style="margin-top:8px;display:flex;gap:8px"><button type="button" class="ua-btn ghost sm" id="uaCopy">📋 نسخ مرة أخرى</button><button type="button" class="ua-btn ghost sm" id="uaDl">💾 تنزيل كملف</button></div>
 </div>
 <div class="ua-warn"><b>تذكير أمني:</b> الصلاحيات (الأرشيف/مسح/رفع/حذف) تتحكم في واجهة البرنامج. الحماية الفعلية لـ GitHub هي <b>الرمز</b>: من ليس لديه رمز لا يستطيع الكتابة. وإبقاء المستودع <b>Private</b> يمنع غير المصرّح لهم من قراءة الملفات.</div>
</div>`;
        document.body.appendChild(host);
        document.addEventListener('keydown', onKey);
        host.addEventListener('mousedown', e => { host._down = e.target === host; });
        host.addEventListener('click', e => { if (e.target === host && host._down) close(); });
        $('#uaClose').onclick = close;
        $('#uaReload').onclick = () => { if (confirm('إعادة الجلب تلغي تعديلاتك غير المنسوخة. متابعة؟')) loadCurrent(); };
        $('#uaAdd').onclick = () => {
            users.push({ id: Math.max(0, ...users.map(u => +u.id || 0)) + 1, username: '', password: '', fullName: '', role: 'viewer', lineIds: ['*'], status: 'active', createdAt: new Date().toISOString().slice(0, 10), perms: [] });
            filter = 'all'; query = ''; $('#uaQ').value = ''; sel = users.length - 1; render();
            const f = host.querySelector('#uaEdit input[data-k="username"]'); if (f) f.focus();
        };
        $('#uaQ').addEventListener('input', e => { query = e.target.value; renderList(); });
        $('#uaChips').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; renderList(); } });
        $('#uaList').addEventListener('click', e => { const b = e.target.closest('.ua-item'); if (b) { sel = +b.dataset.i; render(); } });
        $('#uaEdit').addEventListener('input', onInput); $('#uaEdit').addEventListener('change', onInput); $('#uaEdit').addEventListener('click', onEditClick);
        $('#uaGen').onclick = generate; $('#uaDl').onclick = download;
        $('#uaCopy').onclick = async () => { try { await navigator.clipboard.writeText(host._text || ''); say('✅ تم النسخ', 'ok'); } catch (e) { $('#uaOut').select(); say('انسخ يدوياً (Ctrl+C)', 'bad'); } };
        render();
        loadCurrent();
    };
})();
