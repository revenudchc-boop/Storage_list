'use strict';
// ============================================================
// 🖥️ خادم الأرشيف المحلي (LAN) — النسخة الآمنة
// ============================================================
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const CONFIG = require('./lib/config');
const sec = require('./lib/security');
const { UserStore } = require('./lib/users');
const { audit, tail } = require('./lib/audit');

const VERSION = '2.0.0';
const SECRET = sec.loadOrCreateSecret(CONFIG.SESSION_SECRET, CONFIG.DATA_DIR);
const users = new UserStore({
    file: CONFIG.USERS_FILE, url: CONFIG.USERS_URL,
    refreshMinutes: CONFIG.USERS_REFRESH_MINUTES, dataDir: CONFIG.DATA_DIR
});

process.on('unhandledRejection', e => console.error('⚠️ unhandledRejection:', e));
process.on('uncaughtException', e => console.error('⚠️ uncaughtException:', e));

// ============================================================
// 🔗 ربط مشاركة الشبكة (Windows فقط) — بدون shell لمنع حقن الأوامر
// ============================================================
function uncShareRoot(p) {
    const m = /^\\\\([^\\]+)\\([^\\]+)/.exec(p);
    return m ? `\\\\${m[1]}\\${m[2]}` : null;
}

function connectToNAS() {
    if (process.platform !== 'win32' || !CONFIG.ARCHIVE_PATH.startsWith('\\\\')) return;
    try { fs.accessSync(CONFIG.ARCHIVE_PATH); console.log('✅ مجلد الأرشيف متاح'); return; } catch (e) { /* نحاول الربط */ }
    const share = uncShareRoot(CONFIG.ARCHIVE_PATH);
    if (!share) return;
    console.log('🔗 جاري ربط مشاركة الشبكة', share);
    const args = ['use', share];
    if (CONFIG.NAS_USER && CONFIG.NAS_PASSWORD) args.push(CONFIG.NAS_PASSWORD, '/user:' + CONFIG.NAS_USER);
    args.push('/persistent:yes');
    try { execFileSync('net', args, { stdio: 'pipe' }); console.log('✅ تم الربط'); }
    catch (e) { console.warn('⚠️ فشل الربط:', String(e.stderr || e.message).trim()); }
}

// ============================================================
// 🧰 أدوات مساعدة
// ============================================================
const clientIp = req => String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');

function isPrivateHost(h) {
    if (h === 'localhost' || h === '[::1]') return true;
    const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
    if (!m) return false;
    const a = +m[1], b = +m[2];
    return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function isAllowedOrigin(origin) {
    if (CONFIG.ALLOWED_ORIGINS.includes(origin)) return true;
    if (!CONFIG.ALLOW_PRIVATE_NETWORK_ORIGINS) return false;
    try { return isPrivateHost(new URL(origin).hostname); } catch (e) { return false; }
}

async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
    }));
    return out;
}

function contentDisposition(type, name) {
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
}

const INLINE_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const extOf = n => path.extname(n).toLowerCase();

// ============================================================
// 🌐 التطبيق
// ============================================================
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// ترويسات أمان + CORS محدود
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Max-Age', '600');
        if (req.headers['access-control-request-private-network']) {
            res.setHeader('Access-Control-Allow-Private-Network', 'true');
        }
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// منع الوصول للملفات الحساسة عبر الخدمة الثابتة
const BLOCKED = /(^|\/)(users\.json|\.env[^/]*|server\.js|package(-lock)?\.json|[^/]*\.bat|node_modules|\.git[^/]*)(\/|$)/i;
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    let p;
    try { p = decodeURIComponent(req.path); } catch (e) { return res.sendStatus(400); }
    if (BLOCKED.test(p)) return res.sendStatus(404);
    next();
});

try {
    fs.accessSync(CONFIG.APP_PATH);
    app.use(express.static(CONFIG.APP_PATH, { dotfiles: 'ignore', index: 'index.html' }));
} catch (e) {
    console.warn('⚠️ مجلد التطبيق غير متاح، لن تُخدَّم صفحات التطبيق:', CONFIG.APP_PATH);
}

// ============================================================
// 🔐 المصادقة
// ============================================================
const revoked = new Map();                       // jti -> exp
setInterval(() => { for (const [k, e] of revoked) if (e < Date.now()) revoked.delete(k); }, 10 * 60 * 1000).unref();

const userLimiter = new sec.AttemptLimiter(CONFIG.MAX_LOGIN_ATTEMPTS, CONFIG.LOCK_MINUTES * 60 * 1000);
const ipLimiter = new sec.AttemptLimiter(CONFIG.MAX_LOGIN_ATTEMPTS * 6, CONFIG.LOCK_MINUTES * 60 * 1000);
setInterval(() => { userLimiter.sweep(); ipLimiter.sweep(); }, 10 * 60 * 1000).unref();

function authenticate(req) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return null;
    const p = sec.verifyToken(h.slice(7), SECRET);
    if (!p || revoked.has(p.jti)) return null;
    const u = users.getById(p.uid);
    if (!u || u.status !== 'active') return null;
    req.tokenPayload = p;
    return u;
}

function requireAuth(req, res, next) {
    const u = authenticate(req);
    if (!u) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'انتهت الجلسة، سجّل الدخول من جديد' });
    req.user = u;
    next();
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'هذه العملية للمدير فقط' });
    next();
}

app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', version: VERSION, authRequired: true, timestamp: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
    const username = String((req.body && req.body.username) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    if (!username || !password || username.length > 64 || password.length > 256) {
        return res.status(400).json({ success: false, error: 'بيانات الدخول ناقصة' });
    }
    const ip = clientIp(req);
    const key = username + '|' + ip;
    const wait = Math.max(userLimiter.blockedFor(key), ipLimiter.blockedFor(ip));
    if (wait > 0) {
        return res.status(429).json({ success: false, error: `🔒 محاولات كثيرة. حاول بعد ${Math.ceil(wait / 60000)} دقيقة` });
    }

    const user = users.getByUsername(username);
    const ok = await sec.verifyPassword(password, user ? user.password : sec.DUMMY_HASH);

    if (!user || !ok) {
        userLimiter.fail(key); ipLimiter.fail(ip);
        audit('login_failed', { username, ip });
        return res.status(401).json({ success: false, error: '❌ اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    if (user.status !== 'active') {
        audit('login_disabled', { username, ip });
        return res.status(403).json({ success: false, error: '🚫 الحساب معطّل، تواصل مع المدير' });
    }

    userLimiter.reset(key);
    const exp = Date.now() + CONFIG.SESSION_HOURS * 3600 * 1000;
    const token = sec.signToken({ uid: user.id, exp, jti: crypto.randomBytes(8).toString('hex') }, SECRET);
    audit('login', { username: user.username, ip });
    res.json({ success: true, token, expiresAt: exp, user: UserStore.publicView(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ success: true, user: UserStore.publicView(req.user), expiresAt: req.tokenPayload.exp });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
    revoked.set(req.tokenPayload.jti, req.tokenPayload.exp);
    audit('logout', { username: req.user.username });
    res.json({ success: true });
});

// ============================================================
// 📂 الأرشيف
// ============================================================
let snapshot = { at: 0, data: null, pending: null };
const invalidateSnapshot = () => { snapshot.at = 0; snapshot.data = null; };

async function scanArchive() {
    const entries = await fsp.readdir(CONFIG.ARCHIVE_PATH, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());
    const folders = await mapLimit(dirs, 6, async dir => {
        const folderPath = path.join(CONFIG.ARCHIVE_PATH, dir.name);
        let files = [];
        try {
            const fes = (await fsp.readdir(folderPath, { withFileTypes: true }))
                .filter(f => f.isFile() && f.name !== '_info.json' && !f.name.includes('.tmp-'));
            files = await mapLimit(fes, 10, async f => {
                const st = await fsp.stat(path.join(folderPath, f.name));
                return { name: f.name, size: st.size, modified: st.mtime };
            });
        } catch (e) { console.warn('خطأ في قراءة مجلد:', dir.name, e.message); }
        return { name: dir.name, files };
    });
    folders.sort((a, b) => b.name.localeCompare(a.name));
    return folders;
}

async function getSnapshot() {
    if (snapshot.data && Date.now() - snapshot.at < CONFIG.LIST_CACHE_MS) return snapshot.data;
    if (!snapshot.pending) {
        snapshot.pending = scanArchive()
            .then(d => { snapshot.data = d; snapshot.at = Date.now(); return d; })
            .finally(() => { snapshot.pending = null; });
    }
    return snapshot.pending;
}

function signedFileUrl(user, folder, file) {
    const exp = Date.now() + CONFIG.URL_TTL_MS;
    const sig = sec.signUrl(SECRET, user.id, folder, file, exp);
    return `/api/archive/file/${encodeURIComponent(folder)}/${encodeURIComponent(file)}?uid=${user.id}&exp=${exp}&sig=${sig}`;
}

app.get('/api/archive/list', requireAuth, async (req, res, next) => {
    try {
        const all = await getSnapshot();
        const full = sec.hasFullAccess(req.user);
        const folders = [];
        for (const f of all) {
            const files = f.files.filter(x => sec.canAccessFile(req.user, x.name));
            if (!files.length && !full) continue;
            folders.push({
                name: f.name,
                filesCount: files.length,
                files: files.map(x => ({ ...x, url: signedFileUrl(req.user, f.name, x.name) }))
            });
        }
        res.json({ success: true, folders });
    } catch (e) { next(e); }
});

app.get('/api/archive/file/:folder/:file', async (req, res, next) => {
    try {
        const { folder, file } = req.params;              // Express فكّ الترميز مسبقاً
        const full = sec.safeResolve(CONFIG.ARCHIVE_PATH, folder, file);
        if (!full) return res.status(400).json({ success: false, error: 'مسار غير صالح' });

        let allowed = false;
        if (req.query.sig) {
            allowed = sec.verifyUrlSig(SECRET, String(req.query.uid), folder, file, req.query.exp, req.query.sig);
        } else {
            const u = authenticate(req);
            allowed = !!u && sec.canAccessFile(u, file);
        }
        if (!allowed) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'غير مصرّح' });

        let st;
        try { st = await fsp.stat(full); } catch (e) { return res.status(404).json({ success: false, error: 'الملف غير موجود' }); }
        if (!st.isFile()) return res.status(404).json({ success: false, error: 'الملف غير موجود' });

        const inline = INLINE_EXT.has(extOf(file)) && req.query.download !== '1';
        res.sendFile(full, {
            dotfiles: 'allow',
            headers: {
                'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', file),
                'Cache-Control': 'private, max-age=0'
            }
        }, err => { if (err && !res.headersSent) next(err); });
    } catch (e) { next(e); }
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CONFIG.MAX_FILE_SIZE, files: 1, fields: 6 }
});

function handleUpload(req, res, next) {
    upload.single('file')(req, res, err => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success: false, error: `الملف كبير جداً (الأقصى ${CONFIG.MAX_FILE_SIZE / 1048576} MB)` });
        }
        res.status(400).json({ success: false, error: 'خطأ في بيانات الرفع' });
    });
}

app.post('/api/archive/upload', requireAuth, requireAdmin, handleUpload, async (req, res, next) => {
    try {
        const folder = sec.sanitizeName(req.body.folderName);
        const file = sec.sanitizeName(req.body.fileName);
        if (!folder || !file || !req.file) return res.status(400).json({ success: false, error: 'بيانات ناقصة أو اسم غير صالح' });

        const ext = extOf(file);
        const isInfo = file === '_info.json';
        if (!isInfo && !CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
            return res.status(400).json({ success: false, error: 'نوع الملف غير مسموح: ' + ext });
        }
        if (!isInfo && !sec.checkFileSignature(ext, req.file.buffer)) {
            return res.status(400).json({ success: false, error: 'محتوى الملف لا يطابق امتداده' });
        }

        const folderPath = sec.safeResolve(CONFIG.ARCHIVE_PATH, folder);
        const filePath = sec.safeResolve(CONFIG.ARCHIVE_PATH, folder, file);
        if (!folderPath || !filePath) return res.status(400).json({ success: false, error: 'مسار غير صالح' });

        await fsp.mkdir(folderPath, { recursive: true });
        const tmp = filePath + '.tmp-' + crypto.randomBytes(4).toString('hex');
        try {
            await fsp.writeFile(tmp, req.file.buffer);
            await fsp.rename(tmp, filePath);              // كتابة ذرّية: لا ملفات نصف مكتوبة
        } catch (e) { fsp.unlink(tmp).catch(() => {}); throw e; }

        invalidateSnapshot();
        audit('upload', { user: req.user.username, folder, file, size: req.file.size, ip: clientIp(req) });
        console.log('✅ تم حفظ:', folder + '/' + file, '(' + (req.file.size / 1024).toFixed(1) + ' KB)');
        res.json({ success: true, path: folder + '/' + file, size: req.file.size, folder, file });
    } catch (e) { next(e); }
});

app.delete('/api/archive/file/:folder/:file', requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const { folder, file } = req.params;
        const full = sec.safeResolve(CONFIG.ARCHIVE_PATH, folder, file);
        if (!full) return res.status(400).json({ success: false, error: 'مسار غير صالح' });
        try { await fsp.unlink(full); }
        catch (e) {
            if (e.code === 'ENOENT') return res.status(404).json({ success: false, error: 'الملف غير موجود' });
            throw e;
        }
        invalidateSnapshot();
        audit('delete', { user: req.user.username, folder, file, ip: clientIp(req) });
        console.log('🗑️ تم حذف:', folder + '/' + file);
        res.json({ success: true });
    } catch (e) { next(e); }
});

// ============================================================
// 🛠️ للمدير: فحص الوصول وسجل التدقيق
// ============================================================
app.get('/api/check-access', requireAuth, requireAdmin, async (req, res) => {
    try {
        await fsp.access(CONFIG.ARCHIVE_PATH);
        res.json({ success: true, exists: true, isDirectory: (await fsp.stat(CONFIG.ARCHIVE_PATH)).isDirectory(), path: CONFIG.ARCHIVE_PATH });
    } catch (e) { res.status(500).json({ success: false, error: e.code || 'تعذّر الوصول' }); }
});

app.get('/api/audit', requireAuth, requireAdmin, (req, res) => {
    const n = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    res.json({ success: true, entries: tail(n) });
});

app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'غير موجود' }));

// معالج الأخطاء: لا نكشف تفاصيل داخلية للعميل
app.use((err, req, res, next) => {
    console.error('❌ خطأ:', req.method, req.path, err);
    if (res.headersSent) return next(err);
    res.status(500).json({ success: false, error: 'خطأ داخلي في الخادم' });
});

// ============================================================
// 🚀 التشغيل
// ============================================================
(async () => {
    connectToNAS();
    try {
        await fsp.mkdir(CONFIG.ARCHIVE_PATH, { recursive: true });
        console.log('✅ مجلد الأرشيف جاهز');
    } catch (e) { console.warn('⚠️ تعذّر الوصول لمجلد الأرشيف:', e.message); }

    const count = await users.init();
    if (!count) {
        console.error('❌ لا يوجد مستخدمون. تأكد من وجود', CONFIG.USERS_FILE);
        process.exit(1);
    }

    let server, scheme = 'http';
    if (CONFIG.TLS_CERT && CONFIG.TLS_KEY) {
        server = require('https').createServer({ cert: fs.readFileSync(CONFIG.TLS_CERT), key: fs.readFileSync(CONFIG.TLS_KEY) }, app);
        scheme = 'https';
    } else {
        server = require('http').createServer(app);
    }
    server.requestTimeout = 5 * 60 * 1000;

    server.listen(CONFIG.PORT, '0.0.0.0', () => {
        console.log('\n═══════════════════════════════════════════════');
        console.log(`  🖥️  خادم الأرشيف المحلي v${VERSION} يعمل`);
        console.log('═══════════════════════════════════════════════');
        console.log('  📡 المنفذ:        ' + CONFIG.PORT);
        console.log('  👥 المستخدمون:    ' + count);
        console.log('  🔒 التشفير:       ' + (scheme === 'https' ? 'HTTPS' : 'HTTP (يُنصح بتفعيل HTTPS)'));
        for (const list of Object.values(os.networkInterfaces())) {
            for (const i of list) if (i.family === 'IPv4' && !i.internal) console.log(`     → ${scheme}://${i.address}:${CONFIG.PORT}`);
        }
        console.log(`     → ${scheme}://localhost:${CONFIG.PORT}`);
        console.log('  ⏹️  للإيقاف: Ctrl + C\n');
    });
})();
