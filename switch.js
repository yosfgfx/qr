/*
 * switch.js — مبدّل الإصدارين (الخفيف ⇄ الاستوديو الكامل).
 * يملأ كل عنصر يحمل data-ver-switch بشريحة مقسّمة تُظهر الإصدار الحالي مضاءً
 * والإصدار الآخر قابلًا للنقر، مع انتقال سلس بين الصفحتين (Alt+V للتبديل).
 *
 * الاستخدام:
 *   <div data-ver-switch></div>  ... في الترويسة
 *   <script src="switch.js" data-current="lite|studio" data-kbd="V"></script>
 */
(function () {
  'use strict';
  var s = document.currentScript; if (!s) return;
  var current = s.dataset.current === 'studio' ? 'studio' : 'lite';
  var kbd = (s.dataset.kbd || 'V').toUpperCase();
  var VERSIONS = {
    lite:   { href: 'index.html',  label: 'الخفيف', title: 'الإصدار الخفيف: روابط → QR فقط',
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3 4 14h7l-1 7 9-11h-7l1-7z"/></svg>' },
    studio: { href: 'studio.html', label: 'الكامل', title: 'الإصدار الكامل: الاستوديو بكل المزايا',
              icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg>' }
  };
  var other = current === 'lite' ? 'studio' : 'lite';

  function build() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ver-switch]'), function (host) {
      var seg = document.createElement('nav');
      seg.className = 'ver-seg';
      seg.setAttribute('aria-label', 'اختيار الإصدار');
      ['lite', 'studio'].forEach(function (key) {
        var v = VERSIONS[key];
        var el = document.createElement(key === current ? 'span' : 'a');
        el.className = 'ver-seg__item' + (key === current ? ' is-active' : '');
        el.title = v.title + (key === current ? '' : ' (Alt+' + kbd + ')');
        if (key === current) el.setAttribute('aria-current', 'page');
        else { el.href = v.href; el.addEventListener('click', function (e) { go(e, v.href); }); }
        el.innerHTML = v.icon + '<span>' + v.label + '</span>';
        seg.appendChild(el);
      });
      var k = document.createElement('span');
      k.className = 'ver-seg__kbd'; k.textContent = 'Alt+' + kbd; k.title = 'التبديل بين الإصدارين';
      seg.appendChild(k);
      host.replaceWith(seg);
    });

    // أي رابط يحمل data-ver-link ينتقل بنفس الحركة
    Array.prototype.forEach.call(document.querySelectorAll('[data-ver-link]'), function (el) {
      el.addEventListener('click', function (e) { go(e, el.getAttribute('href')); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toUpperCase() === kbd) { e.preventDefault(); go(e, VERSIONS[other].href); }
    });
  }

  function go(e, href) {
    if (e) e.preventDefault();
    var dest = href || VERSIONS[other].href;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { sessionStorage.setItem('qr-ver-switch', '1'); } catch (_) {}
    if (reduce) { location.href = dest; return; }
    document.documentElement.classList.add('page-leave');
    setTimeout(function () { location.href = dest; }, 330);
  }

  // عند الوصول من الصفحة الأخرى: دخول سلس
  try {
    if (sessionStorage.getItem('qr-ver-switch') === '1') {
      sessionStorage.removeItem('qr-ver-switch');
      document.documentElement.classList.add('page-enter');
      setTimeout(function () { document.documentElement.classList.remove('page-enter'); }, 700);
    }
  } catch (_) {}

  // إن عاد المستخدم بزر الرجوع من ذاكرة bfcache أزل حالة الخروج
  window.addEventListener('pageshow', function () { document.documentElement.classList.remove('page-leave'); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
