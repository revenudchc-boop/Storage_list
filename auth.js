// ============================================================
// 🔐 نظام الصلاحيات والمصادقة
// - عند توفر الخادم المحلي: الدخول والصلاحيات يتحققان في الخادم (الأصل الموثوق)
// - بدون الخادم (GitHub فقط): تحقق محلي بكلمات مرور مشفّرة PBKDF2
// ============================================================

const USERS_URL = (window.APP_CONFIG && window.APP_CONFIG.USERS_URL) ||
    'https://raw.githubusercontent.com/markingdchc/marking.dchc/main/users.json';
const SESSION_KEY = 'session';
const LOGIN_ATTEMPTS_KEY = 'loginAttempts';
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const SESSION_HOURS = 8;

let currentUser = null;
let cachedUsers = null;     // في الذاكرة فقط — لا تُحفظ كلمات المرور في المتصفح
let _sessionExpiredHandled = false;

// ============================================================
// 🧹 مساعدات
// ============================================================
function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// ============================================================
// 💾 الجلسة: sessionStorage افتراضياً، و localStorage عند "تذكرني"، مع انتهاء صلاحية
// ============================================================
function readSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (!s || !s.user || !s.exp || s.exp < Date.now()) { clearSession(); return null; }
        return s;
    } catch (e) { return null; }
}

function saveSession(session, remember) {
    clearSession();
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
}

function getAuthToken() {
    const s = readSession();
    return s && s.token ? s.token : null;
}

// ============================================================
// 🔒 التشفير (للوضع بدون خادم)
// ============================================================
function _requireSubtle() {
    if (!window.crypto || !crypto.subtle) {
        throw new Error('التشفير غير متاح في هذا الاتصال. افتح التطبيق عبر HTTPS أو من الخادم المحلي.');
    }
}

async function sha256(text) {
    _requireSubtle();
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Hex(password, salt, iterations) {
    _requireSubtle();
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations }, key, 256);
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// الصيغة: pbkdf2$<iterations>$<salt>$<hash>  (تُولَّد بـ node tools/hash-password.js)
async function verifyPassword(inputPassword, storedPassword) {
    if (typeof storedPassword !== 'string') return false;
    if (storedPassword.startsWith('pbkdf2$')) {
        const [, iterStr, salt, hash] = storedPassword.split('$');
        const iter = parseInt(iterStr, 10);
        if (!(iter >= 10000 && iter <= 2000000) || !salt || !hash) return false;
        const input = await pbkdf2Hex(inputPassword, salt, iter);
        let diff = input.length ^ hash.length;                     // مقارنة بزمن ثابت
        for (let i = 0; i < input.length && i < hash.length; i++) diff |= input.charCodeAt(i) ^ hash.charCodeAt(i);
        return diff === 0;
    }
    if (storedPassword.startsWith('sha256:')) {                    // قديمة — مدعومة مؤقتاً
        return (await sha256(inputPassword)) === storedPassword.slice(7);
    }
    console.error('❌ كلمة مرور غير مشفّرة في users.json — شغّل tools/migrate-users.js');
    return false;                                                   // النص العادي مرفوض
}

// ============================================================
// 📥 تحميل المستخدمين من GitHub (وضع بدون خادم فقط)
// ============================================================
async function loadUsers(forceRefresh = false) {
    if (cachedUsers && !forceRefresh) return cachedUsers;
    const response = await fetch(USERS_URL + '?t=' + Date.now());
    if (!response.ok) throw new Error('تعذّر تحميل بيانات المستخدمين (HTTP ' + response.status + ')');
    const data = await response.json();
    cachedUsers = data.users || [];
    return cachedUsers;
}

// ============================================================
// 🚪 تسجيل الدخول
// ============================================================
async function login(username, password, rememberMe = false) {
    username = (username || '').trim();
    if (!username || !password) throw new Error('أدخل اسم المستخدم وكلمة المرور');

    if (typeof detectLocalServer === 'function') await detectLocalServer();
    const useServer = typeof _localServerAvailable !== 'undefined' && _localServerAvailable;

    const session = useServer
        ? await loginViaServer(username, password)
        : await loginViaGitHub(username, password);

    saveSession(session, rememberMe);
    currentUser = session.user;
    logActivity('login', `تسجيل دخول: ${session.user.fullName}`);
    return session.user;
}

async function loginViaServer(username, password) {
    let result;
    try {
        result = await serverLogin(username, password);
    } catch (e) {
        throw new Error('تعذّر الاتصال بالخادم المحلي');
    }
    if (!result.ok || !result.data.token) {
        throw new Error(result.data.error || '❌ اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    return { user: result.data.user, token: result.data.token, exp: result.data.expiresAt };
}

async function loginViaGitHub(username, password) {
    if (isLocked(username)) {
        throw new Error(`🔒 الحساب محظور. حاول بعد ${getRemainingLockTime(username)} دقيقة`);
    }
    const users = await loadUsers(true);
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    const valid = user ? await verifyPassword(password, user.password) : false;

    if (!user || !valid) {
        recordFailedAttempt(username);
        throw new Error('❌ اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    if (user.status !== 'active') throw new Error('🚫 الحساب معطّل، تواصل مع المدير');

    clearAttempts(username);
    return {
        user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role, lineIds: user.lineIds || [], status: user.status },
        token: null,
        exp: Date.now() + SESSION_HOURS * 3600 * 1000
    };
}

// ============================================================
// 🚪 تسجيل الخروج
// ============================================================
async function logout() {
    if (currentUser) logActivity('logout', `تسجيل خروج: ${currentUser.fullName}`);
    try {
        if (getAuthToken() && typeof serverLogout === 'function') await serverLogout();
    } catch (e) { /* لا يهم */ }
    clearSession();
    currentUser = null;
    window.location.reload();
}

window.addEventListener('session-expired', () => {
    if (_sessionExpiredHandled || !isLoggedIn()) return;
    _sessionExpiredHandled = true;
    alert('⏱️ انتهت الجلسة، سجّل الدخول من جديد');
    clearSession();
    currentUser = null;
    window.location.reload();
});

// ============================================================
// 🔒 محاولات الدخول (وضع بدون خادم فقط — في الخادم تُدار في الخادم نفسه)
// ============================================================
function getAttempts() {
    try { return JSON.parse(localStorage.getItem(LOGIN_ATTEMPTS_KEY) || '{}'); } catch (e) { return {}; }
}
function saveAttempts(attempts) { localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts)); }

function recordFailedAttempt(username) {
    const attempts = getAttempts();
    const key = username.toLowerCase();
    if (!attempts[key]) attempts[key] = { count: 0, lastAttempt: 0 };
    attempts[key].count++;
    attempts[key].lastAttempt = Date.now();
    saveAttempts(attempts);
}
function clearAttempts(username) {
    const attempts = getAttempts();
    delete attempts[username.toLowerCase()];
    saveAttempts(attempts);
}
function isLocked(username) {
    const entry = getAttempts()[username.toLowerCase()];
    if (!entry || entry.count < MAX_ATTEMPTS) return false;
    if (Date.now() - entry.lastAttempt >= LOCK_DURATION_MS) { clearAttempts(username); return false; }
    return true;
}
function getRemainingLockTime(username) {
    const entry = getAttempts()[username.toLowerCase()];
    if (!entry) return 0;
    return Math.ceil((LOCK_DURATION_MS - (Date.now() - entry.lastAttempt)) / 60000);
}

// ============================================================
// 👤 المستخدم الحالي
// ============================================================
function getCurrentUser() {
    if (currentUser) return currentUser;
    const s = readSession();
    if (s) { currentUser = s.user; return currentUser; }
    return null;
}
function isLoggedIn() { return getCurrentUser() !== null; }
function isAdmin() { const u = getCurrentUser(); return !!u && u.role === 'admin'; }
function isViewer() { const u = getCurrentUser(); return !!u && u.role === 'viewer'; }

// ============================================================
// 🔍 فلترة البيانات حسب خطوط المستخدم
// (عرض فقط — الأرشيف على الخادم يُفلتر في الخادم نفسه)
// ============================================================
function filterDataByUserLines(data) {
    const user = getCurrentUser();
    if (!user) return [];
    if (user.role === 'admin' || (user.lineIds || []).includes('*')) return data;
    return data.filter(item => canSeeLine(item["Line ID"] || item["الخط"] || ""));
}

function canSeeLine(lineId) {
    const user = getCurrentUser();
    if (!user) return false;
    if (user.role === 'admin' || (user.lineIds || []).includes('*')) return true;
    return (user.lineIds || []).includes(lineId);
}

// ============================================================
// 🎨 تطبيق الصلاحيات على الواجهة (تجميلي فقط؛ الأمان الفعلي في الخادم)
// ============================================================
function applyPermissions() {
    const user = getCurrentUser();
    if (!user) return;
    updateUserBar(user);

    if (user.role === 'admin') {
        const tokenBtn = document.getElementById('setTokenBtn');
        if (tokenBtn) {
            const token = localStorage.getItem('github_token');
            tokenBtn.style.display = (token && token.trim() !== '') ? 'none' : 'inline-block';
        }
        return;
    }

    const elementsToHide = [
        '#fileInput', '.file-label',
        '#addGlobalLineBtn', '#newGlobalLineName',
        '#manageUsersBtn', '#archiveBtn', '#setTokenBtn', '#createArchiveBtn',
        '.settings-btn'
    ];
    elementsToHide.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            if (el.classList.contains('settings-btn') && el.id === 'selectColumnsBtn1') return;
            el.style.display = 'none';
        });
    });
}

function updateUserBar(user) {
    const bar = document.getElementById('userBar');
    if (!bar) return;

    const roleLabel = user.role === 'admin' ? '👑 مدير' : '👁️ مشاهد';
    const lines = user.lineIds || [];
    const linesLabel = lines.includes('*') ? 'كل الخطوط' : lines.join(' • ');
    const pill = 'background:rgba(255,255,255,0.15); padding:6px 14px; border-radius:20px;';

    // كل القيم تُهرَّب لمنع حقن HTML عبر الاسم أو الخطوط
    bar.innerHTML = `
        <div style="display:flex; gap:15px; align-items:center; flex-wrap:wrap;">
            <div style="${pill}"><strong>👤 ${escapeHtml(user.fullName)}</strong> <span style="opacity:0.8;">(${escapeHtml(user.username)})</span></div>
            <div style="${pill}">${roleLabel}</div>
            <div style="${pill}">🏷️ ${escapeHtml(linesLabel)}</div>
            <button id="logoutBtn" style="background:#dc3545; color:white; border:none; padding:6px 16px; border-radius:20px; cursor:pointer; font-weight:bold;">🚪 خروج</button>
        </div>`;
    document.getElementById('logoutBtn').onclick = () => { if (confirm('تسجيل الخروج؟')) logout(); };
}

// ============================================================
// 📊 سجل النشاط المحلي (سجل التدقيق الحقيقي في الخادم: data/audit.log)
// ============================================================
function logActivity(action, details) {
    try {
        const user = getCurrentUser();
        const logs = JSON.parse(localStorage.getItem('activity_log') || '[]');
        logs.unshift({
            timestamp: new Date().toISOString(),
            userId: user ? user.id : 0,
            username: user ? user.username : 'unknown',
            fullName: user ? user.fullName : 'غير معروف',
            action, details
        });
        localStorage.setItem('activity_log', JSON.stringify(logs.slice(0, 500)));
    } catch (e) { /* ignore */ }
}
function getActivityLog() {
    try { return JSON.parse(localStorage.getItem('activity_log') || '[]'); } catch (e) { return []; }
}

// ============================================================
// 🌐 تهيئة النظام عند فتح الصفحة
// ============================================================
async function initAuth() {
    const loginScreen = document.getElementById('loginScreen');
    const appContainer = document.getElementById('appContainer');

    // تنظيف بيانات قديمة غير آمنة كانت تُحفظ في المتصفح (نسخة المستخدمين بكلمات مرورهم)
    localStorage.removeItem('cached_users');
    localStorage.removeItem('currentUser');

    let serverUp = false;
    if (typeof detectLocalServer === 'function') serverUp = await detectLocalServer();

    let session = readSession();

    // جلسة بلا توكن بينما الخادم متاح → لا يمكنها الوصول للأرشيف، نطلب دخولاً جديداً
    if (session && !session.token && serverUp) { clearSession(); currentUser = null; session = null; }

    if (session) {
        currentUser = session.user;
        try {
            if (session.token && serverUp) {
                const me = await serverMe();                         // الخادم هو المرجع في الدور والخطوط
                if (me.status === 401) return;                       // حدث session-expired سيعالجها
                if (me.ok && me.data.user) {
                    currentUser = me.data.user;
                    saveSession({ user: currentUser, token: session.token, exp: session.exp },
                                !!localStorage.getItem(SESSION_KEY));
                }
            } else if (!session.token) {
                const users = await loadUsers(true);
                const fresh = users.find(u => u.id === currentUser.id);
                if (!fresh || fresh.status !== 'active') {
                    alert(fresh ? '🚫 تم تعطيل حسابك' : '⚠️ تم حذف حسابك');
                    await logout();
                    return;
                }
                currentUser = { id: fresh.id, username: fresh.username, fullName: fresh.fullName, role: fresh.role, lineIds: fresh.lineIds || [], status: fresh.status };
                saveSession({ user: currentUser, token: null, exp: session.exp }, !!localStorage.getItem(SESSION_KEY));
            }
        } catch (e) {
            console.warn('تعذّر تحديث بيانات المستخدم:', e.message);
        }

        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';
        applyPermissions();
        const manageBtn = document.getElementById('manageUsersBtn');
        if (manageBtn && !isAdmin()) manageBtn.style.display = 'none';
    } else {
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
        setupLoginForm();
    }
}

// ============================================================
// 📝 نموذج تسجيل الدخول
// ============================================================
function setupLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.onsubmit = async function (e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const rememberMe = !!(document.getElementById('rememberMe') && document.getElementById('rememberMe').checked);
        const errorDiv = document.getElementById('loginError');
        const btn = document.getElementById('loginBtn');

        btn.disabled = true;
        btn.textContent = '⏳ جاري التحقق...';
        errorDiv.style.display = 'none';

        try {
            await login(username, password, rememberMe);
            window.location.reload();
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
            btn.disabled = false;
            btn.textContent = '🔓 تسجيل الدخول';
        }
    };
}

document.addEventListener('DOMContentLoaded', initAuth);
