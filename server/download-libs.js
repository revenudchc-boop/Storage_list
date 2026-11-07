// تنزيل المكتبات إلى vendor/ (مرة واحدة، يحتاج إنترنت):  node tools/download-libs.js
const https = require('https'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'vendor');
const J = 'https://cdn.jsdelivr.net/npm/', C = 'https://cdnjs.cloudflare.com/ajax/libs/';
const FILES = [
    [J + 'xlsx@0.18.5/dist/xlsx.full.min.js', 'xlsx.full.min.js'],
    [C + 'jspdf/2.5.1/jspdf.umd.min.js', 'jspdf.umd.min.js'],
    [C + 'jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js', 'jspdf.plugin.autotable.min.js'],
    [C + 'html2pdf.js/0.10.1/html2pdf.bundle.min.js', 'html2pdf.bundle.min.js'],
    [C + 'html2canvas/1.4.1/html2canvas.min.js', 'html2canvas.min.js'],
    [J + 'tesseract.js@5.1.1/dist/tesseract.min.js', 'tesseract/tesseract.min.js'],
    [J + 'tesseract.js@5.1.1/dist/worker.min.js', 'tesseract/worker.min.js'],
    [J + 'tesseract.js-core@5/tesseract-core.wasm.js', 'tesseract/tesseract-core.wasm.js'],
    [J + 'tesseract.js-core@5/tesseract-core-simd.wasm.js', 'tesseract/tesseract-core-simd.wasm.js'],
    [J + 'tesseract.js-core@5/tesseract-core-lstm.wasm.js', 'tesseract/tesseract-core-lstm.wasm.js'],
    [J + 'tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js', 'tesseract/tesseract-core-simd-lstm.wasm.js'],
    ['https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz', 'tesseract/lang/eng.traineddata.gz'],
    [J + 'pdfjs-dist@3.11.174/build/pdf.min.js', 'pdfjs/pdf.min.js'],
    [J + 'pdfjs-dist@3.11.174/build/pdf.worker.min.js', 'pdfjs/pdf.worker.min.js']
];
function get(url, hops = 0) {
    return new Promise((res, rej) => {
        https.get(url, { headers: { 'User-Agent': 'archive-libs' } }, r => {
            if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops < 5) { r.resume(); return res(get(new URL(r.headers.location, url).href, hops + 1)); }
            if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); }
            const b = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b))); r.on('error', rej);
        }).on('error', rej);
    });
}
(async () => {
    let ok = 0, bad = [];
    for (const [url, rel] of FILES) {
        const dest = path.join(ROOT, rel);
        try {
            const buf = await get(url); if (!buf.length) throw new Error('ملف فارغ');
            fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf);
            console.log('✅', rel, (buf.length / 1024).toFixed(0) + ' KB'); ok++;
        } catch (e) { console.log('❌', rel, '-', e.message); bad.push(rel); }
    }
    console.log('\nتم تنزيل ' + ok + ' من ' + FILES.length + ' ملف.' + (bad.length ? '\nفشل: ' + bad.join(', ') + '\nأعد التشغيل لاحقاً (الملفات الناقصة يستخدم البرنامج CDN بدلاً منها).' : '\nالبرنامج جاهز للعمل دون إنترنت.'));
})();
