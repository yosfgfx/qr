/*
 * storage.js — رفع الملفات إلى التخزين السحابي الدائم وإرجاع رابط ثابت.
 *
 * الفكرة:
 *   1. نحسب بصمة SHA-256 لمحتوى الملف في المتصفح.
 *   2. اسم الملف في الحاوية = f/<بصمة>.<امتداد>  (مشتق من المحتوى فقط).
 *   3. إن كان الملف موجودًا مسبقًا (HEAD 200) نعيد رابطه فورًا دون رفع.
 *   4. وإلا نرفعه عبر Storage REST API بمفتاح publishable العام.
 *   5. سياسات RLS تسمح بالإدراج فقط (لا تعديل ولا حذف) فالرابط لا يتغير أبدًا.
 *
 *   6. بعد النجاح يُسجَّل حدث الرفع (الاسم الأصلي والجهاز والمتصفح) في جدول qr_uploads.
 *
 * لا يعتمد على أي مكتبة خارجية (fetch + WebCrypto فقط).
 */
(function (global) {
  'use strict';

  const cfg = () => (global.QR_CONFIG && global.QR_CONFIG.storage) || {};

  function isConfigured() {
    const c = cfg();
    return !!(c.url && c.key && c.bucket && !/YOUR_|xxxx/i.test(c.url + c.key));
  }

  async function sha256Hex(blob) {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function safeExt(name) {
    const m = /\.([a-z0-9]{1,12})$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function contentTypeFor(file) {
    const c = cfg();
    const type = (file.type || '').toLowerCase();
    if (type && Array.isArray(c.allowedMime) && c.allowedMime.includes(type)) return type;
    // أنواع شائعة قد لا يرسلها المتصفح: استنتاج من الامتداد
    const byExt = {
      pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
      txt: 'text/plain', csv: 'text/csv', json: 'application/json', md: 'text/markdown', vcf: 'text/vcard', ics: 'text/calendar',
      zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed', gz: 'application/gzip',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      mp3: 'audio/mpeg', m4a: 'audio/x-m4a', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
      mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
      ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', apk: 'application/vnd.android.package-archive',
      epub: 'application/epub+zip', ai: 'application/postscript', psd: 'image/vnd.adobe.photoshop'
    };
    const guess = byExt[safeExt(file.name)];
    if (guess && Array.isArray(c.allowedMime) && c.allowedMime.includes(guess)) return guess;
    return 'application/octet-stream';
  }

  function objectPath(hash, file) {
    const c = cfg();
    const len = Math.min(64, Math.max(24, c.hashLength || 24));
    const ext = safeExt(file.name);
    return `${c.folder || 'f'}/${hash.slice(0, len)}${ext ? '.' + ext : ''}`;
  }

  function publicUrl(path, downloadName) {
    const c = cfg();
    let url = `${c.url.replace(/\/$/, '')}/storage/v1/object/public/${c.bucket}/${path}`;
    if (downloadName) url += `?download=${encodeURIComponent(downloadName)}`;
    return url;
  }

  async function exists(path) {
    try {
      const res = await fetch(publicUrl(path), { method: 'HEAD', cache: 'no-store' });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function uploadWithProgress(path, file, contentType, onProgress) {
    const c = cfg();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${c.url.replace(/\/$/, '')}/storage/v1/object/${c.bucket}/${path}`);
      xhr.setRequestHeader('apikey', c.key);
      xhr.setRequestHeader('Authorization', 'Bearer ' + c.key);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('cache-control', 'public, max-age=31536000, immutable');
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve(true);
        let msg = `HTTP ${xhr.status}`;
        try { const j = JSON.parse(xhr.responseText); msg = j.message || j.error || msg; } catch (_) {}
        // 409: الملف موجود مسبقًا (سباق رفع) — نعتبره نجاحًا لأن المحتوى مطابق
        if (xhr.status === 409 || /already exists|Duplicate/i.test(msg)) return resolve(true);
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error('تعذّر الاتصال بخدمة التخزين'));
      xhr.send(file);
    });
  }

  /* ---------- سجل الرفع (للوحة الإدارة) ----------
   * بعد كل رفع ناجح (أو إعادة استخدام ملف موجود) نسجّل صفًا في جدول qr_uploads:
   * الاسم الأصلي ومعلومات الجهاز والمتصفح كما يراها المتصفح. الخادم يضيف بنفسه
   * IP والدولة وUser-Agent من ترويسات الطلب. الجدول للإدراج فقط (لا قراءة بالمفتاح العام).
   * أي فشل هنا يُتجاهل بصمت ولا يؤثر على الرفع.
   */
  function parseUA(ua) {
    var r = { browser: '', browserVersion: '', os: '', osVersion: '' }, m;
    if ((m = /Edg(?:A|iOS)?\/([\d.]+)/.exec(ua))) { r.browser = 'Edge'; r.browserVersion = m[1]; }
    else if ((m = /OPR\/([\d.]+)/.exec(ua))) { r.browser = 'Opera'; r.browserVersion = m[1]; }
    else if ((m = /SamsungBrowser\/([\d.]+)/.exec(ua))) { r.browser = 'Samsung Internet'; r.browserVersion = m[1]; }
    else if ((m = /(?:Firefox|FxiOS)\/([\d.]+)/.exec(ua))) { r.browser = 'Firefox'; r.browserVersion = m[1]; }
    else if ((m = /(?:Chrome|CriOS)\/([\d.]+)/.exec(ua))) { r.browser = 'Chrome'; r.browserVersion = m[1]; }
    else if ((m = /Version\/([\d.]+).*Safari/.exec(ua))) { r.browser = 'Safari'; r.browserVersion = m[1]; }
    if ((m = /Windows NT ([\d.]+)/.exec(ua))) { r.os = 'Windows'; r.osVersion = m[1]; }
    else if ((m = /(?:iPhone|CPU) OS ([\d_]+)/.exec(ua))) { r.os = /iPad/.test(ua) ? 'iPadOS' : 'iOS'; r.osVersion = m[1].replace(/_/g, '.'); }
    else if ((m = /Mac OS X ([\d_.]+)/.exec(ua))) { r.os = 'macOS'; r.osVersion = m[1].replace(/_/g, '.'); }
    else if ((m = /Android ([\d.]+)/.exec(ua))) { r.os = 'Android'; r.osVersion = m[1]; }
    else if (/CrOS/.test(ua)) r.os = 'ChromeOS';
    else if (/Linux/.test(ua)) r.os = 'Linux';
    return r;
  }

  async function collectClient() {
    var n = global.navigator || {}, ua = n.userAgent || '', s = global.screen || {};
    var c = parseUA(ua);
    var touch = (n.maxTouchPoints || 0) > 0;
    c.deviceType = /iPad|Tablet/i.test(ua) || (touch && /Macintosh/.test(ua)) ? 'tablet'
      : /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : 'desktop';
    var am = /Android [\d.]+; (?:[a-z]{2}[-_][a-z]{2}; )?([^;)]+?)(?: Build|\))/i.exec(ua);
    c.model = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (touch && /Macintosh/.test(ua)) ? 'iPad'
      : am && am[1] !== 'K' ? am[1].trim() : /Macintosh/.test(ua) ? 'Mac' : '';
    try {
      if (n.userAgentData) {
        c.mobile = n.userAgentData.mobile;
        var h = await n.userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion', 'fullVersionList', 'architecture', 'bitness']);
        if (h.model) c.model = h.model;
        if (h.platform) c.os = h.platform === 'macOS' ? 'macOS' : h.platform;
        if (h.platformVersion) c.osVersion = h.platformVersion;
        if (h.architecture) c.arch = h.architecture + (h.bitness ? '-' + h.bitness : '');
        var brand = (h.fullVersionList || []).filter(function (b) { return !/Not.?A.?Brand|Chromium/i.test(b.brand); })[0];
        if (brand) { c.browser = brand.brand.replace(/^Google /, ''); c.browserVersion = brand.version; }
      }
    } catch (_) {}
    c.platform = n.platform || '';
    c.vendor = n.vendor || '';
    c.screen = (s.width || 0) + 'x' + (s.height || 0);
    c.dpr = global.devicePixelRatio || 1;
    c.viewport = (global.innerWidth || 0) + 'x' + (global.innerHeight || 0);
    c.colorDepth = s.colorDepth;
    c.lang = n.language || '';
    c.langs = (n.languages || []).slice(0, 5).join(',');
    try { c.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
    c.tzOffset = -new Date().getTimezoneOffset();
    c.cores = n.hardwareConcurrency || null;
    c.memoryGB = n.deviceMemory || null;
    c.touchPoints = n.maxTouchPoints || 0;
    var con = n.connection || {};
    if (con.effectiveType) c.network = con.effectiveType + (con.downlink ? ' ~' + con.downlink + 'Mbps' : '');
    try { c.darkMode = global.matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) {}
    try { c.standalone = global.matchMedia('(display-mode: standalone)').matches || !!n.standalone; } catch (_) {}
    c.ua = ua.slice(0, 400);
    return c;
  }

  function logUpload(r) {
    var c = cfg();
    if (!isConfigured() || !r || !r.path) return;
    collectClient().then(function (client) {
      return fetch(c.url.replace(/\/$/, '') + '/rest/v1/qr_uploads', {
        method: 'POST',
        keepalive: true,
        headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          object_path: r.path, original_name: (r.name || '').slice(0, 255), size: r.size, mime: r.contentType,
          sha256: r.hash, reused: !!r.reused, page: (location.pathname + location.search).slice(0, 300), client: client
        })
      });
    }).catch(function () {});
  }

  /**
   * يرفع الملف (أو يعيد استخدامه إن كان موجودًا) ويعيد:
   * { url, path, hash, size, name, contentType, reused }
   */
  async function putFile(file, opts = {}) {
    const c = cfg();
    if (!isConfigured()) throw new Error('التخزين السحابي غير مُعدّ. راجع config.js');
    if (!file || !file.size) throw new Error('الملف فارغ');
    if (c.maxBytes && file.size > c.maxBytes) {
      throw new Error(`حجم الملف يتجاوز الحد المسموح (${Math.round(c.maxBytes / 1048576)} MB)`);
    }
    const onProgress = opts.onProgress || (() => {});
    const onStage = opts.onStage || (() => {});

    onStage('hash');
    const hash = await sha256Hex(file);
    const path = objectPath(hash, file);
    const contentType = contentTypeFor(file);

    onStage('check');
    let reused = false;
    if (await exists(path)) {
      reused = true;
      onProgress(1);
    } else {
      onStage('upload');
      await uploadWithProgress(path, file, contentType, onProgress);
    }

    onStage('done');
    const result = {
      url: publicUrl(path),
      downloadUrl: publicUrl(path, file.name),
      path, hash, reused, contentType,
      size: file.size,
      name: file.name
    };
    logUpload(result);
    return result;
  }

  /* ---------- الرابط المختصر (معادلة ثابتة، بلا قاعدة بيانات) ----------
   * f/<hex24>.<ext>  ⇄  <shortBase>?<base64url(hex24)>.<ext>[!]
   * 24 خانة ست عشرية = 12 بايت = 16 حرفًا base64url. العلامة ! في النهاية = تنزيل مباشر.
   * صفحة f/ (resolve.js) تفك المعادلة وتفتح الملف من التخزين الحالي أو من المرايا.
   */
  function hexToB64url(hex) {
    var bytes = hex.match(/../g).map(function (h) { return parseInt(h, 16); });
    return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToHex(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    return Array.prototype.map.call(atob(s), function (c) { return c.charCodeAt(0).toString(16).padStart(2, '0'); }).join('');
  }
  function shortBase() {
    var c = cfg();
    if (c.shortBase) return c.shortBase;
    if (/^https?:$/.test(location.protocol)) return new URL('f/', location.href).href;
    return null;
  }
  // يحوّل مسار الكائن f/<hex>.<ext> إلى رابط مختصر؛ يعيد null إن لم تتوفر قاعدة (مثل فتح الملف محليًا)
  function shortUrl(path, download) {
    var base = shortBase(); if (!base) return null;
    var m = /^(?:[^/]+\/)?([0-9a-f]{24,64})(?:\.([a-z0-9]{1,12}))?$/.exec(path); if (!m) return null;
    var hex = m[1]; if (hex.length % 2) hex += '0';
    return base + '?' + hexToB64url(hex) + (m[2] ? '.' + m[2] : '') + (download ? '!' : '');
  }
  // يفك الرابط المختصر (الجزء بعد ?) إلى {path, download}
  function parseShortId(id) {
    var m = /^([A-Za-z0-9_-]{16,88})(?:\.([a-z0-9]{1,12}))?(!)?$/.exec((id || '').trim()); if (!m) return null;
    var hex; try { hex = b64urlToHex(m[1]); } catch (_) { return null; }
    if (!/^[0-9a-f]{24,64}$/.test(hex)) return null;
    return { hex: hex, ext: m[2] || '', path: (cfg().folder || 'f') + '/' + hex + (m[2] ? '.' + m[2] : ''), download: !!m[3] };
  }

  global.QRStorage = { putFile, publicUrl, shortUrl, parseShortId, shortBase, isConfigured, sha256Hex };
})(window);
