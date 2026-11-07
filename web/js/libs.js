// ============================================================
// محمّل المكتبات: يفضّل النسخة المحلية في vendor/ ثم يعود لـ CDN
// (للعمل دون إنترنت شغّل tools/download-libs.bat مرة واحدة وأنت متصل)
// يجب أن يبقى في نفس مكان وسوم المكتبات في index.html (قبل بقية السكربتات).
// ============================================================
(function () {
    var CDN = {
        xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
        jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
        autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
        html2pdf: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
        html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
    };
    var FILES = {
        xlsx: 'vendor/xlsx.full.min.js', jspdf: 'vendor/jspdf.umd.min.js', autotable: 'vendor/jspdf.plugin.autotable.min.js',
        html2pdf: 'vendor/html2pdf.bundle.min.js', html2canvas: 'vendor/html2canvas.min.js'
    };
    // نفس الترتيب الأصلي في index.html (jspdf محمّل مرتين عمداً كما كان)
    var ORDER = ['xlsx', 'jspdf', 'autotable', 'html2pdf', 'html2canvas', 'jspdf'];
    function has(u) { try { var x = new XMLHttpRequest(); x.open('HEAD', u, false); x.send(); return x.status === 200; } catch (e) { return false; } }
    var V = window.__vendor = {};
    ORDER.forEach(function (k) {
        if (!(k in V)) V[k] = has(FILES[k]);
        document.write('<script src="' + (V[k] ? FILES[k] : CDN[k]) + '"><\/script>');
    });
    // مكتبات تُحمَّل عند الحاجة (OCR وقراءة PDF): نسجّل فقط هل نسختها المحلية موجودة
    V.tesseract = has('vendor/tesseract/tesseract.min.js') && has('vendor/tesseract/worker.min.js') && has('vendor/tesseract/tesseract-core-simd-lstm.wasm.js') && has('vendor/tesseract/lang/eng.traineddata.gz');
    V.pdfjs = has('vendor/pdfjs/pdf.min.js') && has('vendor/pdfjs/pdf.worker.min.js');
})();
