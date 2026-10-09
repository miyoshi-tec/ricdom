// Shared navigation bar for the ricdom docs site and every sample page (plain script).
//
// Load order on a page:  ricdom.iife.min.js, ricdom-ui.iife.min.js, _i18n.js, _samples.js, _nav.js
// It creates <div id="ricdom-nav"> at the top of <body>, renders it with ricdom itself
// (dogfooding), and themes the WHOLE page by calling applyTheme(document.body, ...).
//
// Persistence: localStorage['ricdom-site.theme'] here, localStorage['ricdom-site.lang'] in
// _i18n.js. Pages that have their own theme switcher (08-themes) use window.ricdomNav so both
// controls write the same key and stay in sync.
//
// Optional configuration, set before this script runs (the site pages under site/ use it):
//   window.RICDOM_NAV_OPTIONS = { links: [{ href, label }], source: false, samples: false }
//     links    nav links; `label` is an English i18n key. Default: [Examples -> index.html]
//     source   show the "Source" button (default true)
//     samples  show previous/next sample links from window.RICDOM_SAMPLES (default true)
(function () {
  var THEME_KEY = 'ricdom-site.theme';
  var THEMES = ['light', 'dark', 'teal', 'cyber', 'aqua', 'glass', 'glass-dark'];
  // Flat approximations of each theme background, used only to avoid a white flash before the
  // first render (the real backgrounds are gradients painted by applyTheme).
  var FOUC = {
    light: { bg: '#f9fafb', scheme: 'light' },
    dark: { bg: '#111318', scheme: 'dark' },
    teal: { bg: '#e6f9f0', scheme: 'light' },
    cyber: { bg: '#04070f', scheme: 'dark' },
    aqua: { bg: '#a0d8f0', scheme: 'light' },
    glass: { bg: '#dbeafe', scheme: 'light' },
    'glass-dark': { bg: '#0f172a', scheme: 'dark' },
  };

  var readTheme = function () {
    try {
      var stored = localStorage.getItem(THEME_KEY);
      if (THEMES.indexOf(stored) >= 0) return stored;
    } catch (e) { /* storage may be blocked */ }
    return 'light';
  };

  // FOUC guard: runs before anything is rendered.
  var theme = readTheme();
  document.documentElement.style.background = FOUC[theme].bg;
  document.documentElement.style.colorScheme = FOUC[theme].scheme;

  // Syntax highlighting: every site page and sample loads highlight.js from cdnjs before this
  // script (one download, then the browser cache serves it to every other page). Its colour
  // sheet is added here and swapped with the theme's colour scheme so the tokens stay readable on
  // both light and dark `--ric-code-bg`. uiMdPre / uiCodePre pick up window.hljs by themselves.
  var HLJS_STYLES = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/';
  var hljsLink = null;
  var setHljsTheme = function (name) {
    if (!window.hljs) return;
    if (!hljsLink) {
      hljsLink = document.createElement('link');
      hljsLink.rel = 'stylesheet';
      document.head.appendChild(hljsLink);
    }
    var href = HLJS_STYLES + (FOUC[name].scheme === 'dark' ? 'github-dark.min.css' : 'github.min.css');
    if (hljsLink.getAttribute('href') !== href) hljsLink.setAttribute('href', href);
  };
  setHljsTheme(theme);

  var I = window.ricdomI18n;
  var U = window.ricdomUI;
  var t = I.t;
  var opts = window.RICDOM_NAV_OPTIONS || {};
  var samples = window.RICDOM_SAMPLES || [];

  I.addDict('ja', {
    'Examples': 'サンプル',
    'Home': 'ホーム',
    'Tutorial': 'チュートリアル',
    'Spec': '仕様',
    'Icons': 'アイコン',
    'Source': 'ソース',
    'Theme': 'テーマ',
    'Language': '言語',
    'Previous': '前へ',
    'Next': '次へ',
    'Close': '閉じる',
    'Page source': 'ページのソース',
    'Site navigation': 'サイトナビゲーション',
  });

  var listeners = [];
  var app = null;

  var setTheme = function (next) {
    if (THEMES.indexOf(next) < 0) return;
    theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    U.applyTheme(document.body, { theme: next });
    document.documentElement.style.colorScheme = FOUC[next].scheme;
    setHljsTheme(next);
    if (app) app.theme = next; // keeps the nav's <select> in sync when a page switches the theme
    listeners.slice().forEach(function (fn) { fn(next); });
  };

  window.ricdomNav = {
    THEMES: THEMES,
    getTheme: function () { return theme; },
    setTheme: setTheme,
    onThemeChange: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
  };

  // Theme the whole page, then drop the FOUC colour so body's own background reaches the canvas.
  U.applyTheme(document.body, { theme: theme });
  document.documentElement.style.background = '';

  var style = document.createElement('style');
  style.textContent =
    'body{margin:0;min-height:100vh}' + // min-height: a gradient theme background is sized to the root element, so it must reach the viewport bottom
    '#ricdom-nav{position:sticky;top:0;z-index:100;' +
    'background:color-mix(in srgb,var(--ric-color-control) 88%,transparent);' +
    'backdrop-filter:blur(8px);border-bottom:1px solid var(--ric-color-border)}' +
    '#ricdom-nav a{color:var(--ric-color-accent);text-decoration:none}' +
    '#ricdom-nav a:hover{text-decoration:underline}' +
    '#ricdom-nav label{display:inline-flex;align-items:center;gap:4px;font-size:0.8rem;' +
    'color:var(--ric-color-fg-muted);white-space:nowrap}';
  document.head.appendChild(style);

  var host = document.getElementById('ricdom-nav');
  if (!host) {
    host = document.createElement('div');
    host.id = 'ricdom-nav';
    document.body.insertBefore(host, document.body.firstChild);
  }

  var currentFile = decodeURIComponent(location.pathname.split('/').pop() || '');
  var index = samples.findIndex(function (s) { return s.file === currentFile; });
  var links = opts.links || [{ href: 'index.html', label: 'Examples' }];
  var showSource = opts.source !== false;
  var showSamples = opts.samples !== false && index >= 0;

  var dlg = null;
  var loadSource = function () {
    var fallback = function () { return '<!DOCTYPE html>\n' + document.documentElement.outerHTML; };
    if (location.protocol === 'file:') return Promise.resolve(fallback()); // fetch is blocked on file://
    return fetch(location.href.split('#')[0])
      .then(function (r) { return r.ok ? r.text() : fallback(); })
      .catch(fallback);
  };

  var sampleLink = function (sample, text) {
    return {
      tag: 'a',
      href: sample.file,
      title: sample.title[I.getLang()] || sample.title.en,
      children: [text],
    };
  };

  var field = function (labelText, node) {
    return { tag: 'label', children: [labelText, node] };
  };

  app = ricdom.createApp(
    host,
    { theme: theme, lang: I.getLang(), source: '' },
    function (s) {
      var prev = showSamples && index > 0 ? samples[index - 1] : null;
      var next = showSamples && index < samples.length - 1 ? samples[index + 1] : null;
      return {
        tag: 'nav',
        'aria-label': t('Site navigation'),
        style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px', padding: '8px 16px', fontSize: '0.9rem' },
        children: [
          { tag: 'strong', children: ['ricdom'] },
          ...links.map(function (l) { return { tag: 'a', href: l.href, children: [t(l.label)] }; }),
          prev ? sampleLink(prev, '← ' + t('Previous')) : null,
          next ? sampleLink(next, t('Next') + ' →') : null,
          { tag: 'span', style: { flex: '1 1 auto' } },
          showSource
            ? U.uiButton({
                size: 'sm',
                children: [t('Source')],
                onclick: function () {
                  loadSource().then(function (text) { s.source = text; dlg.open(); });
                },
              })
            : null,
          field(
            t('Theme'),
            U.uiSelect({
              'aria-label': t('Theme'),
              value: s.theme,
              options: THEMES,
              onchange: function (e) { setTheme(e.target.value); },
            }),
          ),
          field(
            t('Language'),
            U.uiSelect({
              'aria-label': t('Language'),
              value: s.lang,
              options: [{ value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }],
              onchange: function (e) { I.setLang(e.target.value); },
            }),
          ),
          dlg
            ? dlg({
                title: t('Page source'),
                width: 'min(900px, 94vw)',
                // uiCodePre colours the page's HTML with window.hljs (loaded by every page; the
                // `html` grammar also highlights the inline <script> blocks as JavaScript).
                children: [U.uiCodePre({ lang: 'html', maxHeight: '60vh', style: { fontSize: '12px', tabSize: 2 }, children: [s.source] })],
                actions: [U.uiButton({ children: [t('Close')], onclick: function () { dlg.close(); } })],
              })
            : null,
        ],
      };
    },
    { setup: function (a) { dlg = a.use(U.createDialog()); } },
  );

  I.onLangChange(function (lang) { app.lang = lang; });
})();
