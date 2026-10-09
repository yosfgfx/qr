/*
 * resolve.js — فكّ الرابط المختصر وفتح الملف الفعلي.
 * يعمل من صفحتين: f/index.html (الصيغة ?id) و 404.html (الصيغة /f/id).
 * الخوارزمية ثابتة ولا تعتمد على قاعدة بيانات، لذلك الرابط المطبوع في الرمز يعمل دائمًا:
 *   1. فكّ المعرّف إلى مسار الكائن f/<hex>.<ext>.
 *   2. جرّب التخزين الحالي ثم المرايا القديمة (config.js) بطلب HEAD سريع.
 *   3. حوّل إلى أول عنوان يستجيب؛ وإن لم يستجب أحد اعرض الرابط المباشر للمحاولة اليدوية.
 */
(function () {
  'use strict';
  var cfg = (window.QR_CONFIG && window.QR_CONFIG.storage) || {};
  var $ = function (s) { return document.querySelector(s); };

  function readId() {
    var q = location.search.replace(/^\?/, '');
    if (q) { try { return decodeURIComponent(q); } catch (_) { return q; } }
    var m = /\/f\/([^/?#]+)\/?$/.exec(location.pathname);
    if (m) { try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; } }
    return '';
  }

  function objectUrl(base, path, download) {
    return base.replace(/\/$/, '') + '/storage/v1/object/public/' + cfg.bucket + '/' + path + (download ? '?download=' : '');
  }

  function head(url, ms) {
    return new Promise(function (resolve) {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var t = setTimeout(function () { if (ctl) ctl.abort(); resolve(false); }, ms);
      fetch(url, { method: 'HEAD', cache: 'no-store', signal: ctl && ctl.signal })
        .then(function (r) { clearTimeout(t); resolve(r.ok); })
        .catch(function () { clearTimeout(t); resolve(false); });
    });
  }

  function setState(title, text, link) {
    var h = $('#title'), p = $('#text'), a = $('#direct');
    if (h) h.textContent = title;
    if (p) p.textContent = text;
    if (a) { if (link) { a.href = link; a.style.display = ''; } else a.style.display = 'none'; }
  }

  async function run() {
    var id = readId();
    var info = window.QRStorage && QRStorage.parseShortId(id);
    if (!info || !cfg.url || !cfg.bucket) {
      setState('رابط غير صالح', 'لم نتعرف على معرّف الملف في هذا الرابط.', null);
      document.documentElement.classList.add('is-error');
      return;
    }
    var bases = [cfg.url].concat(Array.isArray(cfg.mirrors) ? cfg.mirrors : []).filter(Boolean);
    var primary = objectUrl(bases[0], info.path, info.download);
    setState('جارٍ فتح الملف…', 'لحظة واحدة، نتحقق من مكان الملف.', primary);

    for (var i = 0; i < bases.length; i++) {
      var url = objectUrl(bases[i], info.path, info.download);
      if (await head(objectUrl(bases[i], info.path, false), 4000)) { location.replace(url); return; }
    }
    // لم يستجب أي تخزين (انقطاع شبكة أو مشروع موقوف): اعرض الرابط المباشر للمحاولة اليدوية
    setState('تعذّر الوصول إلى الملف الآن', 'قد يكون الاتصال ضعيفًا أو التخزين غير متاح مؤقتًا. جرّب الرابط المباشر أو أعد المحاولة لاحقًا.', primary);
    document.documentElement.classList.add('is-error');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
