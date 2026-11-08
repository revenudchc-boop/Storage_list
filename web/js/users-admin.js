// ============================================================
// ⚙️ إعدادات المستخدمين (للمدير فقط)
// إنشاء المستخدمين وتعديل صلاحياتهم وكلمات مرورهم ورمز GitHub، ثم توليد ملف users.json
// لنسخه ولصقه في GitHub (أو تنزيله). يحل محل الصفحتين المنفصلتين perms-manager وhash-password.
// الواجهة داخل Shadow DOM كي لا تتأثر بتنسيقات الصفحة (ولا تؤثر فيها).
// يعتمد على: sha256, loadUsers, getCurrentUser, isAdmin, USERS_URL من auth.js
// ============================================================
(function () {
    const PERMS = [['scan', 'مسح', 'scan'], ['upload', 'رفع', 'upload'], ['delete', 'حذف', 'trash']];
    let users = [], me = null, host = null, root = null;
    const $ = s => root.querySelector(s);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const I = {
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        close: '<path d="M18 6 6 18M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>',
        refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
        trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
        key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M16 7l3 3M14 9l2 2"/>',
        eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        eyeoff: '<path d="M17.9 17.9A10.9 10.9 0 0 1 12 19C5.6 19 2 12 2 12a18.5 18.5 0 0 1 5.1-5.9M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18.6 18.6 0 0 1-2.2 3.2M1 1l22 22"/>',
        copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', chev: '<path d="m6 9 6 6 6-6"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
        scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
        link: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>'
    };
    const ic = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

    const CSS = `
:host{all:initial;position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;direction:rtl;
 font-family:'Segoe UI',Tahoma,'Noto Sans Arabic',system-ui,sans-serif;font-size:14px;line-height:1.55;background:rgba(15,23,42,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
 --bg:#fff;--bg2:#f8fafc;--bd:#e2e8f0;--tx:#0f172a;--mu:#64748b;--pri:#4f46e5;--pri2:#4338ca;--pril:#eef2ff;--ok:#16a34a;--okl:#dcfce7;--bad:#dc2626;--badl:#fee2e2;--warn:#b45309;--warnl:#fef3c7;--sh:0 24px 60px -12px rgba(15,23,42,.45)}
:host([data-theme=dark]){--bg:#0f172a;--bg2:#131f38;--bd:#25324d;--tx:#e5e7eb;--mu:#94a3b8;--pri:#818cf8;--pri2:#a5b4fc;--pril:#1e2547;--okl:#12361f;--badl:#3b1717;--warn:#fbbf24;--warnl:#3a2a0b}
*{box-sizing:border-box}
.box{width:min(1040px,100%);max-height:100%;display:flex;flex-direction:column;background:var(--bg);color:var(--tx);border-radius:20px;box-shadow:var(--sh);overflow:hidden;border:1px solid var(--bd)}
.head{display:flex;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid var(--bd)}
.logo{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#6366f1,#8b5cf6);flex:none;box-shadow:0 6px 14px -4px rgba(99,102,241,.6)}
.head h2{margin:0;font-size:19px;font-weight:800;letter-spacing:-.2px}.head p{margin:2px 0 0;color:var(--mu);font-size:12.5px}
.head .x{margin-inline-start:auto}
.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:12px 22px;background:var(--bg2);border-bottom:1px solid var(--bd)}
.search{position:relative;flex:1;min-width:180px;max-width:320px}
.search svg{position:absolute;top:50%;inset-inline-start:11px;transform:translateY(-50%);color:var(--mu);pointer-events:none}
.search input{width:100%;height:38px;padding:0 12px 0 12px;padding-inline-start:36px}
.stats{display:flex;gap:6px;flex-wrap:wrap;margin-inline-start:auto}
.stat{font-size:12px;color:var(--mu);background:var(--bg);border:1px solid var(--bd);border-radius:999px;padding:4px 11px;white-space:nowrap}.stat b{color:var(--tx)}
.list{flex:1;overflow:auto;padding:16px 22px;display:flex;flex-direction:column;gap:10px;min-height:120px}
.foot{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:14px 22px;border-top:1px solid var(--bd);background:var(--bg)}
.msg{font-size:13px;font-weight:600;flex:1;min-width:160px}.msg.ok{color:var(--ok)}.msg.bad{color:var(--bad)}
/* أزرار وحقول */
button{font:inherit;color:inherit}
.btn{height:38px;padding:0 14px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);font-weight:600;font-size:13px;display:inline-flex;align-items:center;gap:8px;cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s,transform .05s;white-space:nowrap}
.btn:hover{background:var(--bg2);border-color:#cbd5e1}.btn:active{transform:translateY(1px)}
.btn:focus-visible,.ua-h:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--pri);outline-offset:1px}
.btn.pri{background:var(--pri);border-color:transparent;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.15),0 4px 12px -4px rgba(79,70,229,.55)}.btn.pri:hover{background:var(--pri2)}
.btn.lg{height:42px;padding:0 20px;font-size:14px}
.btn.danger{color:var(--bad)}.btn.danger:hover{background:var(--badl);border-color:transparent}
.btn.icon{width:38px;padding:0;justify-content:center}
.btn:disabled{opacity:.45;cursor:not-allowed;pointer-events:none}
input[type=text],input[type=password],textarea{width:100%;height:40px;padding:0 12px;border:1px solid var(--bd);border-radius:10px;background:var(--bg);color:var(--tx);font:inherit;transition:border-color .15s,box-shadow .15s}
input[type=text]:focus,input[type=password]:focus,textarea:focus{outline:none;border-color:var(--pri);box-shadow:0 0 0 3px var(--pril)}
textarea{height:170px;padding:10px 12px;direction:ltr;font:12px/1.5 Consolas,'Cascadia Mono',monospace;resize:vertical}
/* بطاقة المستخدم */
.ua-card{border:1px solid var(--bd);border-radius:14px;background:var(--bg);transition:box-shadow .2s,border-color .2s}
.ua-card:hover{border-color:#cbd5e1}.ua-card.open{box-shadow:0 8px 24px -10px rgba(15,23,42,.25);border-color:var(--pri)}
.ua-card.off .ua-h{opacity:.6}
.ua-h{display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;border-radius:14px;user-select:none}
.av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;font-size:16px;flex:none}
.who{min-width:0;flex:0 1 220px}.who b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.who span{display:block;font-size:12px;color:var(--mu);direction:ltr;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.badge{font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 10px;white-space:nowrap}
.badge.adm{background:var(--warnl);color:var(--warn)}.badge.vw{background:var(--pril);color:var(--pri)}.badge.me{background:var(--okl);color:var(--ok)}.badge.off{background:var(--badl);color:var(--bad)}
.pp{display:flex;gap:6px;flex-wrap:wrap;margin-inline-start:6px}
.pp i{font-style:normal;font-size:11.5px;color:var(--mu);background:var(--bg2);border:1px solid var(--bd);border-radius:7px;padding:1px 8px}
.pp i.all{color:var(--warn);background:var(--warnl);border-color:transparent}
.sp{margin-inline-start:auto}
.key{color:var(--bd);display:grid;place-items:center}.key.on{color:var(--ok)}
.chev{color:var(--mu);transition:transform .2s;display:grid;place-items:center}.ua-card.open .chev{transform:rotate(180deg)}
.ua-b{display:none;padding:4px 16px 16px;border-top:1px solid var(--bd);margin:0 0}
.ua-card.open .ua-b{display:block;animation:in .18s ease}
@keyframes in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.sec{margin-top:14px}.sec>h4{margin:0 0 8px;font-size:12px;font-weight:800;color:var(--mu);letter-spacing:.3px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
label.f{display:block;font-size:12px;font-weight:600;color:var(--mu);margin-bottom:5px}
.hint{font-size:11.5px;color:var(--mu);margin-top:4px}
.seg{display:inline-flex;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;padding:3px}
.seg label{position:relative;cursor:pointer}.seg input{position:absolute;opacity:0;inset:0;cursor:pointer}
.seg span{display:block;padding:6px 16px;border-radius:8px;font-size:13px;font-weight:700;color:var(--mu);transition:all .15s}
.seg input:checked+span{background:var(--bg);color:var(--pri);box-shadow:0 1px 3px rgba(0,0,0,.15)}
.seg input:focus-visible+span{outline:2px solid var(--pri)}
.sw{display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-weight:700;font-size:13px;height:40px}
.sw input{position:absolute;opacity:0;width:0;height:0}
.sw i{width:42px;height:24px;border-radius:999px;background:#cbd5e1;position:relative;transition:background .2s;flex:none}
.sw i::after{content:"";position:absolute;top:3px;inset-inline-start:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:inset-inline-start .2s}
.sw input:checked+i{background:var(--ok)}.sw input:checked+i::after{inset-inline-start:21px}
.sw input:focus-visible+i{outline:2px solid var(--pri);outline-offset:2px}
.perms{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pill{position:relative;cursor:pointer}.pill input{position:absolute;opacity:0;inset:0;cursor:pointer}
.pill span{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border-radius:10px;border:1.5px solid var(--bd);font-weight:700;font-size:13px;color:var(--mu);transition:all .15s}
.pill:hover span{border-color:var(--pri)}
.pill input:checked+span{background:var(--pril);border-color:var(--pri);color:var(--pri)}
.pill input:focus-visible+span{outline:2px solid var(--pri);outline-offset:2px}
.lnk{background:none;border:0;color:var(--pri);font-weight:700;font-size:12.5px;cursor:pointer;padding:4px 6px;border-radius:6px}.lnk:hover{background:var(--pril)}
.pw{position:relative}.pw input{padding-inline-end:42px}.pw button{position:absolute;top:4px;inset-inline-end:4px;width:32px;height:32px;border:0;background:none;color:var(--mu);border-radius:8px;cursor:pointer;display:grid;place-items:center}.pw button:hover{background:var(--bg2);color:var(--tx)}
.chk{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px}.chk input{width:16px;height:16px;accent-color:var(--bad)}
.act{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px dashed var(--bd)}
.adm-note{display:flex;align-items:center;gap:8px;background:var(--warnl);color:var(--warn);border-radius:10px;padding:9px 12px;font-size:13px;font-weight:600}
.empty{text-align:center;color:var(--mu);padding:36px 10px}
/* ناتج users.json */
.out{border:1px solid var(--pri);background:var(--pril);border-radius:14px;padding:16px;display:none}
.out h3{margin:0 0 10px;font-size:15px}
.steps{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:8px}
.steps li{display:flex;gap:10px;align-items:flex-start;font-size:13.5px}
.steps li::before{counter-increment:s;content:counter(s);flex:none;width:22px;height:22px;border-radius:50%;background:var(--pri);color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center;margin-top:1px}
.steps{counter-reset:s}
.steps a{color:var(--pri);font-weight:700;text-decoration:none;display:inline-flex;gap:4px;align-items:center}.steps a:hover{text-decoration:underline}
.out .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.note{display:flex;gap:10px;align-items:flex-start;color:var(--mu);font-size:12.5px;background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:10px 12px}
.note svg{flex:none;color:var(--pri);margin-top:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media(max-width:700px){:host{padding:0}.box{border-radius:0;height:100%}.pp,.badge.vw,.stats{display:none}.head,.tools,.list,.foot{padding-inline:14px}.who{flex:1}.btn.lg{flex:1;justify-content:center}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

    async function encToken(token, password) {
        if (!(window.crypto && crypto.subtle)) throw new Error('تشفير الرمز يتطلب فتح البرنامج عبر HTTPS أو localhost');
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
        const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
        const out = new Uint8Array(28 + ct.length); out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
        let s = ''; out.forEach(b => s += String.fromCharCode(b)); return btoa(s);
    }
    const grad = n => { let h = 0; for (const c of String(n || '?')) h = (h * 31 + c.charCodeAt(0)) % 360; return `linear-gradient(135deg,hsl(${h} 70% 52%),hsl(${(h + 45) % 360} 70% 40%))`; };
    function say(t, c) { const m = $('#uaMsg'); m.textContent = t || ''; m.className = 'msg ' + (c || ''); }
    function setUsers(list) {
        users = list.map(u => ({ ...u, perms: Array.isArray(u.perms) ? u.perms.slice() : [], lineIds: Array.isArray(u.lineIds) ? u.lineIds.slice() : [] }));
        render();
    }
    function cardHTML(u, i) {
        const adm = u.role === 'admin', off = u.status === 'disabled', isMe = me && u.username === me.username, p = u.perms;
        const has = k => p.includes(k) || p.includes('*');
        const pills = adm ? '<i class="all">كل الصلاحيات</i>' : (PERMS.filter(([k]) => has(k)).map(([, l]) => `<i>${l}</i>`).join('') || '<i>مشاهدة فقط</i>');
        const name = u.fullName || u.username || 'مستخدم جديد';
        return `<div class="ua-card ${u._open ? 'open' : ''} ${off ? 'off' : ''}" data-i="${i}" data-s="${esc((u.username + ' ' + u.fullName).toLowerCase())}">
 <div class="ua-h" data-a="toggle" tabindex="0" role="button" aria-expanded="${!!u._open}">
  <div class="av" style="background:${grad(u.username || u.fullName)}">${esc(name.trim().charAt(0).toUpperCase())}</div>
  <div class="who"><b>${esc(name)}</b><span>@${esc(u.username || '')}</span></div>
  <span class="badge ${adm ? 'adm' : 'vw'}">${adm ? 'مدير' : 'مشاهد'}</span>${isMe ? '<span class="badge me">أنت</span>' : ''}${off ? '<span class="badge off">معطّل</span>' : ''}
  <div class="pp">${pills}</div><span class="sp"></span>
  <span class="key ${u.tokenEnc ? 'on' : ''}" title="${u.tokenEnc ? 'لديه رمز GitHub مشفّر (يستطيع الكتابة على GitHub)' : 'بلا رمز GitHub (لا يكتب على GitHub)'}">${ic('key')}</span>
  <span class="chev">${ic('chev')}</span>
 </div>
 <div class="ua-b">
  <div class="sec"><h4>البيانات الأساسية</h4><div class="grid">
   <div><label class="f">اسم المستخدم</label><input type="text" data-k="username" value="${esc(u.username)}" dir="ltr" autocomplete="off"></div>
   <div><label class="f">الاسم الكامل</label><input type="text" data-k="fullName" value="${esc(u.fullName)}"></div>
   <div><label class="f">الخطوط (مفصولة بفاصلة، * = الكل)</label><input type="text" data-k="lineIds" value="${esc(u.lineIds.join(', '))}" dir="ltr"></div>
   <div><label class="f">الدور</label><div class="seg"><label><input type="radio" name="role${i}" data-k="role" value="viewer" ${adm ? '' : 'checked'}><span>مشاهد</span></label><label><input type="radio" name="role${i}" data-k="role" value="admin" ${adm ? 'checked' : ''}><span>مدير</span></label></div></div>
   <div><label class="f">الحالة</label><label class="sw"><input type="checkbox" data-k="status" ${off ? '' : 'checked'}><i></i><span>${off ? 'معطّل' : 'مفعّل'}</span></label></div>
  </div></div>
  <div class="sec"><h4>الصلاحيات</h4>${adm ? `<div class="adm-note">${ic('shield')} المدير يملك كل الصلاحيات تلقائياً (مسح، رفع، حذف، وإدارة المستخدمين).</div>` :
                `<div class="perms">${PERMS.map(([k, l, icn]) => `<label class="pill"><input type="checkbox" data-p="${k}" ${has(k) ? 'checked' : ''}><span>${ic(icn, 16)} ${l}</span></label>`).join('')}
   <span style="flex:1"></span><button type="button" class="lnk" data-a="pv">مشاهدة فقط</button><button type="button" class="lnk" data-a="pso">مسح ورفع</button><button type="button" class="lnk" data-a="pall">كل الصلاحيات</button></div>`}</div>
  <div class="sec"><h4>الأمان</h4><div class="grid">
   <div><label class="f">كلمة مرور جديدة</label><div class="pw"><input type="password" data-k="newpw" autocomplete="new-password" placeholder="اتركها فارغة للإبقاء على الحالية"><button type="button" data-a="eye" title="إظهار/إخفاء">${ic('eye', 17)}</button></div></div>
   <div><label class="f">رمز GitHub لهذا المستخدم</label><div class="pw"><input type="password" data-k="token" autocomplete="off" placeholder="${u.tokenEnc ? 'يوجد رمز — اتركه فارغاً للإبقاء' : 'github_pat_…'}" dir="ltr"><button type="button" data-a="eye" title="إظهار/إخفاء">${ic('eye', 17)}</button></div>
    ${u.tokenEnc ? '<label class="chk"><input type="checkbox" data-k="rmtok"> إزالة الرمز المخزَّن</label>' : '<div class="hint">بلا رمز لا يستطيع المستخدم الكتابة على GitHub.</div>'}</div>
  </div></div>
  <div class="act"><button type="button" class="btn danger" data-a="del" ${isMe ? 'disabled title="لا يمكنك حذف حسابك"' : ''}>${ic('trash', 16)} حذف المستخدم</button><button type="button" class="btn" data-a="toggle">طيّ</button></div>
 </div></div>`;
    }
    function stats() {
        const adm = users.filter(u => u.role === 'admin').length, off = users.filter(u => u.status === 'disabled').length;
        $('#uaStats').innerHTML = `<span class="stat"><b>${users.length}</b> مستخدم</span><span class="stat"><b>${adm}</b> مدير</span><span class="stat"><b>${off}</b> معطّل</span>`;
    }
    function render() {
        $('#uaList').innerHTML = users.map(cardHTML).join('') || `<div class="empty">${ic('users', 34)}<p>لا يوجد مستخدمون — اضغط «مستخدم جديد».</p></div>`;
        stats(); applyFilter();
    }
    function rerenderCard(i) {
        const el = root.querySelector(`.ua-card[data-i="${i}"]`); if (!el) return render();
        const t = document.createElement('div'); t.innerHTML = cardHTML(users[i], i); el.replaceWith(t.firstElementChild); stats(); applyFilter();
    }
    function applyFilter() {
        const q = ($('#uaSearch').value || '').trim().toLowerCase();
        root.querySelectorAll('.ua-card').forEach(c => { c.style.display = !q || c.dataset.s.includes(q) ? '' : 'none'; });
    }
    function onInput(e) {
        const c = e.target.closest('.ua-card'); if (!c) return;
        const i = +c.dataset.i, u = users[i], k = e.target.dataset.k;
        if (e.target.dataset.p) { const s = new Set(u.perms.filter(x => x !== '*')); e.target.checked ? s.add(e.target.dataset.p) : s.delete(e.target.dataset.p); u.perms = [...s]; return rerenderKeep(i); }
        if (!k) return;
        if (k === 'lineIds') u.lineIds = e.target.value.split(',').map(x => x.trim()).filter(Boolean);
        else if (k === 'rmtok') u._rmtok = e.target.checked;
        else if (k === 'newpw' || k === 'token') u['_' + k] = e.target.value;
        else if (k === 'status') { u.status = e.target.checked ? 'active' : 'disabled'; return rerenderKeep(i); }
        else if (k === 'role') { if (e.target.checked) { u.role = e.target.value; return rerenderKeep(i); } }
        else {
            u[k] = e.target.value;
            if (k === 'username' || k === 'fullName') { const nm = u.fullName || u.username || 'مستخدم جديد'; c.querySelector('.who b').textContent = nm; c.querySelector('.who span').textContent = '@' + (u.username || ''); c.querySelector('.av').textContent = nm.trim().charAt(0).toUpperCase(); c.dataset.s = ((u.username || '') + ' ' + (u.fullName || '')).toLowerCase(); }
        }
    }
    function rerenderKeep(i) { users[i]._open = true; rerenderCard(i); }
    function onClick(e) {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const c = b.closest('.ua-card'), i = +c.dataset.i, u = users[i], a = b.dataset.a;
        if (a === 'toggle') { if (e.target.closest('.ua-b') && !b.classList.contains('btn')) return; u._open = !u._open; return rerenderCard(i); }
        if (a === 'eye') { const inp = b.parentElement.querySelector('input'); const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.innerHTML = ic(show ? 'eyeoff' : 'eye', 17); return; }
        if (a === 'del') { if (confirm('حذف المستخدم «' + (u.username || u.fullName || '') + '»؟')) { users.splice(i, 1); render(); } return; }
        if (a === 'pv') u.perms = []; else if (a === 'pso') u.perms = ['scan', 'upload']; else if (a === 'pall') u.perms = ['scan', 'upload', 'delete'];
        rerenderKeep(i);
    }
    async function loadCurrent() {
        say('⏳ جاري الجلب من GitHub…');
        try {
            let list = null;
            try { const r = await fetch(USERS_URL + '?t=' + Date.now()); if (r.ok) list = (await r.json()).users; } catch (e) { }
            if (!list) { list = await loadUsers(true); say('تعذّر الجلب من GitHub — عُرضت النسخة المتاحة محلياً', 'bad'); } else say('تم الجلب من GitHub (' + list.length + ' مستخدم)', 'ok');
            setUsers(list);
        } catch (e) { say('❌ ' + e.message, 'bad'); }
    }
    // يبني نص users.json الجديد (يرمي خطأ برسالة واضحة عند أي مشكلة)
    async function build() {
        const names = new Set(), out = [];
        for (const u of users) {
            const un = String(u.username || '').trim(); if (!un) throw new Error('يوجد مستخدم بلا اسم مستخدم');
            if (names.has(un.toLowerCase())) throw new Error('اسم المستخدم مكرر: ' + un); names.add(un.toLowerCase());
            const o = { ...u }; ['_newpw', '_token', '_rmtok', '_open'].forEach(k => delete o[k]);
            o.username = un; o.fullName = String(u.fullName || un).trim(); o.status = u.status === 'disabled' ? 'disabled' : 'active';
            if (o.role === 'admin') delete o.perms; else o.perms = u.perms.includes('*') ? ['*'] : PERMS.map(p => p[0]).filter(k => u.perms.includes(k));
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
            const ta = $('#uaOut'); ta.value = text; const box = $('#uaOutBox'); box.style.display = 'block'; box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(USERS_URL);
            if (m) $('#uaGhLink').href = 'https://github.com/' + m[1] + '/' + m[2] + '/edit/' + m[3] + '/' + m[4];
            let copied = false; try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { try { ta.select(); copied = document.execCommand('copy'); } catch (e2) { } }
            say(copied ? '✅ تم إنشاء users.json ونسخه — الصقه في GitHub' : '✅ تم إنشاء users.json — انسخه من الصندوق أدناه', 'ok');
            host._text = text;
        } catch (e) { say('❌ ' + e.message, 'bad'); }
        btn.disabled = false;
    }
    function download() {
        if (!host._text) return;
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([host._text], { type: 'application/json' })); a.download = 'users.json';
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function close() { if (host) { document.removeEventListener('keydown', onKey, true); host.remove(); host = root = null; } }
    function onKey(e) { if (e.key === 'Escape' && host) { e.stopPropagation(); close(); } }

    window.openUsersAdmin = async function () {
        if (typeof isAdmin !== 'function' || !isAdmin()) { alert('⛔ هذه الشاشة للمدير فقط'); return; }
        if (host) return;
        me = getCurrentUser();
        host = document.createElement('div'); host.id = 'uaHost';
        host.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        root = host.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>${CSS}</style>
<div class="box" role="dialog" aria-modal="true" aria-labelledby="uaTtl">
 <div class="head"><div class="logo">${ic('users', 24)}</div><div><h2 id="uaTtl">إعدادات المستخدمين</h2><p>أنشئ المستخدمين وحدّد صلاحياتهم، ثم انسخ ملف users.json إلى GitHub</p></div>
  <button class="btn icon x" id="uaClose" title="إغلاق (Esc)" aria-label="إغلاق">${ic('close')}</button></div>
 <div class="tools">
  <div class="search">${ic('search', 16)}<input type="text" id="uaSearch" placeholder="بحث عن مستخدم…" autocomplete="off"></div>
  <button class="btn pri" id="uaAdd">${ic('plus', 16)} مستخدم جديد</button>
  <button class="btn" id="uaReload">${ic('refresh', 16)} إعادة الجلب</button>
  <label class="sw" style="height:38px;font-size:12.5px"><input type="checkbox" id="uaHash" checked><i></i><span>تشفير كلمات المرور الجديدة</span></label>
  <div class="stats" id="uaStats"></div>
 </div>
 <div class="list" id="uaListWrap">
  <div id="uaList" style="display:flex;flex-direction:column;gap:10px"></div>
  <div class="out" id="uaOutBox">
   <h3>users.json جاهز</h3>
   <ol class="steps"><li>النص أدناه نُسخ تلقائياً (أو انسخه بنفسك).</li><li><a id="uaGhLink" target="_blank" rel="noopener">افتح صفحة تعديل users.json في GitHub ${ic('link', 14)}</a></li><li>احذف المحتوى القديم والصق الجديد ثم اضغط <b>Commit changes</b>.</li><li>خلال دقائق يتحدّث الجميع (الخادم المحلي يجلب الملف كل 30 دقيقة).</li></ol>
   <textarea id="uaOut" readonly spellcheck="false"></textarea>
   <div class="row"><button class="btn" id="uaCopy">${ic('copy', 16)} نسخ مرة أخرى</button><button class="btn" id="uaDl">${ic('download', 16)} تنزيل كملف</button></div>
  </div>
  <div class="note">${ic('shield', 18)}<div>الصلاحيات (مسح/رفع/حذف) تتحكم في واجهة البرنامج. الحماية الفعلية لـ GitHub هي <b>الرمز</b>: من ليس لديه رمز لا يستطيع الكتابة، وإبقاء المستودع <b>Private</b> يمنع غير المصرّح لهم من القراءة. لا يُحفظ شيء تلقائياً: التعديلات لا تسري إلا بعد لصق الملف في GitHub.</div></div>
 </div>
 <div class="foot"><button class="btn pri lg" id="uaGen">${ic('copy', 17)} إنشاء ونسخ users.json</button><span id="uaMsg" class="msg" role="status"></span></div>
</div>`;
        document.body.appendChild(host);
        document.addEventListener('keydown', onKey, true);
        host.addEventListener('mousedown', e => { host._down = e.composedPath()[0] === host; });
        host.addEventListener('click', e => { if (e.composedPath()[0] === host && host._down) close(); });
        $('#uaClose').onclick = close; $('#uaReload').onclick = () => { if (confirm('إعادة الجلب تلغي تعديلاتك غير المنسوخة. متابعة؟')) loadCurrent(); };
        $('#uaAdd').onclick = () => {
            users.push({ id: Math.max(0, ...users.map(u => +u.id || 0)) + 1, username: '', password: '', fullName: '', role: 'viewer', lineIds: ['*'], status: 'active', createdAt: new Date().toISOString().slice(0, 10), perms: [], _open: true });
            $('#uaSearch').value = ''; render(); const last = root.querySelector('.ua-card:last-child'); last.scrollIntoView({ block: 'center' }); last.querySelector('input[data-k=username]').focus();
        };
        $('#uaSearch').addEventListener('input', applyFilter);
        const L = $('#uaList'); L.addEventListener('input', onInput); L.addEventListener('change', onInput); L.addEventListener('click', onClick);
        L.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('ua-h')) { e.preventDefault(); e.target.click(); } });
        $('#uaGen').onclick = generate; $('#uaDl').onclick = download;
        $('#uaCopy').onclick = async () => { try { await navigator.clipboard.writeText(host._text || ''); say('✅ تم النسخ', 'ok'); } catch (e) { $('#uaOut').select(); say('انسخ يدوياً (Ctrl+C)', 'bad'); } };
        stats(); loadCurrent();
    };
})();
