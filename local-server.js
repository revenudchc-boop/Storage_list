// ============================================================
// 🖥️ الجسر مع الخادم المحلي (LAN)
// المصادقة عبر توكن جلسة (Authorization: Bearer) — لا يوجد أي مفتاح سري في هذا الملف
// ============================================================

const LOCAL_SERVER_CONFIG = {
    HOSTS: (() => {
        const cfg = window.APP_CONFIG || {};
        const hosts = [];
        const origin = window.location.origin;
        // 1) عنوان الصفحة الحالية إن كانت تُخدَّم من الخادم نفسه
        if (origin && /^https?:/.test(origin) && !origin.includes('github.io')) hosts.push(origin);
        // 2) العناوين من config.js
        (cfg.SERVER_HOSTS || []).forEach(h => hosts.push(h));
        return hosts.filter((v, i, a) => a.indexOf(v) === i);
    })(),
    TIMEOUT: (window.APP_CONFIG && window.APP_CONFIG.PROBE_TIMEOUT_MS) || 2500
};

let _activeServerUrl = null;
let _localServerAvailable = false;
let _detectPromise = null;

// ============================================================
// 🔑 مساعدات الجلسة والطلبات
// ============================================================
function _authHeaders(extra) {
    const h = Object.assign({}, extra || {});
    const token = (typeof getAuthToken === 'function') ? getAuthToken() : null;
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
}

async function _serverFetch(path, options) {
    options = options || {};
    options.headers = _authHeaders(options.headers);
    const response = await fetch(_activeServerUrl + path, options);
    if (response.status === 401) window.dispatchEvent(new CustomEvent('session-expired'));
    return response;
}

async function _readJson(response) {
    try { return await response.json(); } catch (e) { return {}; }
}

// ============================================================
// 🔍 كشف الخادم المحلي (فحص كل العناوين بالتوازي، ونختار الأول حسب الترتيب)
// ============================================================
async function _probeHost(host) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOCAL_SERVER_CONFIG.TIMEOUT);
    try {
        const response = await fetch(host + '/api/ping', { signal: controller.signal });
        if (!response.ok) return null;
        const data = await response.json();
        return data && data.status === 'ok' ? host : null;
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function detectLocalServer(force) {
    if (_detectPromise && !force) return _detectPromise;
    _detectPromise = (async () => {
        const results = await Promise.all(LOCAL_SERVER_CONFIG.HOSTS.map(_probeHost));
        const found = results.find(Boolean) || null;
        _activeServerUrl = found;
        _localServerAvailable = !!found;
        console.log(found ? `✅ تم العثور على الخادم: ${found}` : '⚠️ لم يتم العثور على الخادم المحلي');
        return _localServerAvailable;
    })();
    return _detectPromise;
}

// ============================================================
// 🔐 تسجيل الدخول عبر الخادم
// ============================================================
async function serverLogin(username, password) {
    const response = await fetch(_activeServerUrl + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    return { ok: response.ok, status: response.status, data: await _readJson(response) };
}

async function serverMe() {
    const response = await _serverFetch('/api/auth/me');
    return { ok: response.ok, status: response.status, data: await _readJson(response) };
}

async function serverLogout() {
    if (!_localServerAvailable) return;
    try { await _serverFetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* لا يهم */ }
}

// ============================================================
// 📂 قائمة مجلدات الأرشيف (الخادم يُرجع فقط ما يحق للمستخدم رؤيته)
// ============================================================
async function loadLocalArchiveFolders() {
    if (!_localServerAvailable) return null;
    try {
        const response = await _serverFetch('/api/archive/list');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        return data.folders.map(folder => ({
            name: folder.name,
            path: `archive/${folder.name}`,
            files: folder.files.map(f => ({
                name: f.name,
                size: f.size,
                path: `archive/${folder.name}/${f.name}`,
                // رابط موقّع ينتهي خلال ساعتين — لا يحمل أي مفتاح سري
                download_url: `${_activeServerUrl}${f.url}`,
                sha: null,
                modified: f.modified
            })),
            filesCount: folder.filesCount,
            sha: null,
            source: 'local'
        }));
    } catch (error) {
        console.error('❌ فشل تحميل الأرشيف المحلي:', error.message);
        return null;
    }
}

// ============================================================
// 📤 رفع ملف (multipart بدل base64 داخل JSON: أخف على الشبكة والذاكرة)
// ============================================================
function _base64ToBlob(base64Data) {
    const clean = String(base64Data).replace(/^data:[^;]*;base64,/, '');
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'application/octet-stream' });
}

async function uploadToLocalServer(folderName, fileName, base64Data) {
    if (!_localServerAvailable) return { success: false, error: 'الخادم المحلي غير متاح' };
    try {
        const form = new FormData();
        form.append('folderName', folderName);
        form.append('fileName', fileName);
        form.append('file', _base64ToBlob(base64Data), fileName);

        const response = await _serverFetch('/api/archive/upload', { method: 'POST', body: form });
        const data = await _readJson(response);
        if (!response.ok || !data.success) return { success: false, error: data.error || 'فشل الرفع' };
        return { success: true, path: data.path };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🗑️ حذف ملف
// ============================================================
async function deleteFromLocalServer(folderName, fileName) {
    if (!_localServerAvailable) return { success: false, error: 'الخادم المحلي غير متاح' };
    try {
        const response = await _serverFetch(
            `/api/archive/file/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`,
            { method: 'DELETE' }
        );
        const data = await _readJson(response);
        return { success: response.ok && data.success !== false, error: data.error };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================
// 🚀 الكشف عند فتح الصفحة + 🎨 مؤشر الحالة
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    detectLocalServer().then(updateLocalServerIndicator);
});

function updateLocalServerIndicator(available) {
    let indicator = document.getElementById('localServerIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'localServerIndicator';
        indicator.style.cssText = `
            position: fixed; bottom: 15px; left: 15px; padding: 6px 14px;
            border-radius: 20px; font-size: 12px; font-weight: bold; z-index: 9998;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: all 0.3s; cursor: pointer;
        `;
        document.body.appendChild(indicator);
    }
    if (available) {
        indicator.style.background = '#d4edda';
        indicator.style.color = '#155724';
        indicator.innerHTML = '🖥️ الخادم المحلي: <strong>متصل</strong>';
        indicator.title = 'اضغط لإعادة الفحص';
    } else {
        indicator.style.background = '#fff3cd';
        indicator.style.color = '#856404';
        indicator.innerHTML = '⚠️ الخادم المحلي: <strong>غير متصل</strong>';
        indicator.title = 'يعمل التطبيق عبر GitHub فقط. اضغط لإعادة المحاولة';
    }
    indicator.onclick = async function () {
        indicator.textContent = '⏳ جاري الفحص...';
        updateLocalServerIndicator(await detectLocalServer(true));
    };
}
