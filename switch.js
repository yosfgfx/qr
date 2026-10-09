/*
 * switch.js — مبدّل الإصدارين (الخفيف ⇄ الاستوديو الكامل).
 * يُدرج زرًا عائمًا بأسلوب Clay في الصفحة ويقوم بانتقال سلس بين الصفحتين.
 *
 * الاستخدام:
 *   <script src="switch.js" data-to="studio.html" data-label="الإصدار الكامل" data-sub="استوديو QR والباركود" data-kbd="V"></script>
 */
(function () {
  'use strict';
  var s = document.currentScript; if (!s) return;
  var to = s.dataset.to, label = s.dataset.label || 'الإصدار الآخر', sub = s.dataset.sub || '', kbd = (s.dataset.kbd || 'V').toUpperCase();
  if (!to) return;

  function build() {
    var a = document.createElement('a');
    a.className = 'ver-switch';
    a.href = to;
    a.setAttribute('aria-label', 'الانتقال إلى ' + label);
    a.title = label + ' (Alt+' + kbd + ')';
    a.innerHTML =
      '<span class="ver-switch__ic"><span class="ver-switch__wave"></span>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg></span>' +
      '<span class="ver-switch__tx"><b>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</span>' +
      '<span class="ver-switch__kbd">Alt+' + kbd + '</span>';
    a.addEventListener('click', go);
    document.body.appendChild(a);

    // أي رابط يحمل data-ver-link ينتقل بنفس الحركة
    Array.prototype.forEach.call(document.querySelectorAll('[data-ver-link]'), function (el) {
      el.addEventListener('click', function (e) { go(e, el.getAttribute('href')); });
    });

    // إظهار الزر بعد لحظة بحركة ارتدادية
    requestAnimationFrame(function () { requestAnimationFrame(function () { a.classList.add('is-in'); }); });

    document.addEventListener('keydown', function (e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toUpperCase() === kbd) { e.preventDefault(); go(e); }
    });
  }

  function go(e, href) {
    if (e) e.preventDefault();
    var dest = href || to;
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
