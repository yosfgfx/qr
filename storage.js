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
    return {
      url: publicUrl(path),
      downloadUrl: publicUrl(path, file.name),
      path, hash, reused, contentType,
      size: file.size,
      name: file.name
    };
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
