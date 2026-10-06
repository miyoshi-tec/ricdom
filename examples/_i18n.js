// ricdom docs site i18n (plain script, no modules, no build step).
//
// gettext-style: the English string IS the key, and there is no English dictionary.
//   t('Open dialog')                  -> DICT.ja['Open dialog'] ?? 'Open dialog'
//   t`${n} items selected`            -> key '{0} items selected', placeholders filled after lookup
// A missing translation therefore falls back to the English text; the page is never broken
// and nobody has to maintain an `en` table. Each page registers its own Japanese entries with
// ricdomI18n.addDict('ja', { 'English text': '日本語' }); scripts/checkI18n.mjs fails CI when a
// t() key has no `ja` entry. Re-render on language change: ricdomI18n.onLangChange(() => app.renderNow()).
(function () {
  var LANGS = ['en', 'ja'];
  var STORAGE_KEY = 'ricdom-site.lang';
  var dict = {};
  var listeners = [];

  var detect = function () {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (LANGS.indexOf(stored) >= 0) return stored;
    } catch (e) { /* storage may be blocked (private window, file://) */ }
    return String(navigator.language || '').toLowerCase().indexOf('ja') === 0 ? 'ja' : 'en';
  };
  var lang = detect();
  if (typeof document !== 'undefined') document.documentElement.lang = lang;

  // Fill {0}, {1}... after lookup so a translation can reorder the placeholders.
  var fill = function (text, values) {
    return text.replace(/\{(\d+)\}/g, function (m, i) { return i in values ? String(values[i]) : m; });
  };

  var t = function (key) {
    if (Array.isArray(key)) { // tagged template: t`${a} of ${b}`
      var values = Array.prototype.slice.call(arguments, 1);
      var tpl = key.reduce(function (acc, part, i) { return acc + '{' + (i - 1) + '}' + part; });
      var hit = dict[lang] && dict[lang][tpl];
      return fill(hit != null ? hit : tpl, values);
    }
    var found = dict[lang] && dict[lang][key];
    return found != null ? found : key;
  };

  window.ricdomI18n = {
    t: t,
    LANGS: LANGS,
    addDict: function (l, entries) { dict[l] = Object.assign(dict[l] || {}, entries); },
    getLang: function () { return lang; },
    setLang: function (next) {
      if (LANGS.indexOf(next) < 0 || next === lang) return;
      lang = next;
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }
      document.documentElement.lang = next;
      listeners.slice().forEach(function (fn) { fn(next); });
    },
    onLangChange: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
  };
})();
