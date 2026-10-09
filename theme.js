/*
 * theme.js — تبديل Clay Dark / Clay Light.
 * يُحمَّل في <head> قبل الرسم ليطبّق الثيم المحفوظ فورًا بلا وميض.
 * الافتراضي: الداكن. الاختيار يُحفظ في localStorage تحت المفتاح qr-theme.
 */
(function () {
  'use strict';
  var KEY = 'qr-theme';
  var root = document.documentElement;
  function saved() { try { return localStorage.getItem(KEY); } catch (_) { return null; } }
  function apply(t) {
    root.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#E9EDF4' : '#10141D');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) { b.setAttribute('aria-pressed', t === 'light'); });
  }
  apply(saved() === 'light' ? 'light' : 'dark');
  function toggle() {
    var t = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(KEY, t); } catch (_) {}
    apply(t);
  }
  window.QRTheme = { toggle: toggle, apply: apply };
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) { b.addEventListener('click', toggle); });
    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') toggle();
    });
  });
})();
