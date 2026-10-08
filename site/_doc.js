// Markdown document viewer shared by tutorial.html and spec.html (plain script).
//
//   ricdomDoc.mount({ target: '#app', url: (lang) => 'docs/TUTORIAL.ja.md', note: (lang) => 'text' | null })
//
// Dogfooding: the document is fetched, split at live-demo fences, and drawn with ricdomUI.uiMdPre
// inside ricdomUI.uiPanel. A sticky table of contents is built from the ## / ### headings.
//
// Live demos: a fence tagged `html live` is shown as an ordinary ```html code block AND run in a
// sandboxed <iframe srcdoc> right below it. The iframe loads the dev build (dist/ricdom.iife.js,
// so dev warnings reach the console) and reports its own height to the parent with postMessage.
(function () {
  var U = window.ricdomUI;
  var I = window.ricdomI18n;
  var t = I.t;

  I.addDict('ja', {
    'Loading…': '読み込み中…',
    'Table of contents': '目次',
    'Live demo': '実行例',
    'Live demo (runs in a sandboxed frame)': '実行例 (サンドボックス化したフレームで動作)',
    'Could not load the document.': 'ドキュメントを読み込めませんでした。',
    'This page loads Markdown with fetch(), which browsers block under file://. Open it through a local server: run `npm run build:site`, then `npx http-server _site`.':
      'このページは fetch() で Markdown を読み込みますが、file:// ではブラウザがこれを禁止します。ローカルサーバー経由で開いてください: `npm run build:site` のあと `npx http-server _site`。',
  });

  // Strip inline Markdown (code ticks, emphasis, links) to get a heading's plain text.
  var plain = function (text) {
    return text
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*]/g, '')
      .trim();
  };

  // GitHub-style anchor: lowercase, drop punctuation, spaces to hyphens. This keeps links such
  // as SPEC.md#10-components (which exist inside the documents) working on the site.
  var slugify = function (text) {
    return plain(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s/g, '-');
  };

  // Split the document into alternating Markdown / live-demo segments and collect the TOC.
  var LIVE = /^```html live[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm;
  var parse = function (source) {
    var text = source.replace(/\r\n/g, '\n');
    var segments = [];
    var last = 0;
    var m;
    var md = '';
    LIVE.lastIndex = 0;
    while ((m = LIVE.exec(text)) !== null) {
      md += text.slice(last, m.index);
      // (a) the code is shown as a normal html fence ...
      md += '```html\n' + m[1] + '\n```';
      segments.push({ type: 'md', text: md });
      md = '';
      // (b) ... and (c) run right below it.
      segments.push({ type: 'live', code: m[1] });
      last = m.index + m[0].length;
    }
    md += text.slice(last);
    segments.push({ type: 'md', text: md });

    var toc = [];
    var used = {};
    var inFence = false;
    segments.forEach(function (seg) {
      if (seg.type !== 'md') return;
      seg.text.split('\n').forEach(function (line) {
        if (/^(```|~~~)/.test(line)) { inFence = !inFence; return; }
        if (inFence) return;
        var h = /^(#{2,3})\s+(.+)/.exec(line);
        if (!h) return;
        var base = slugify(h[2]) || 'section';
        var id = base;
        var n = 1;
        while (used[id]) { id = base + '-' + n; n += 1; }
        used[id] = true;
        toc.push({ level: h[1].length, text: plain(h[2]), id: id });
      });
    });
    return { segments: segments, toc: toc };
  };

  var FRAME_SCRIPT =
    '<script>(function(){var send=function(){parent.postMessage({ricdomLiveHeight:Math.ceil(document.body.getBoundingClientRect().height)},"*")};' +
    'addEventListener("load",send);if(window.ResizeObserver)new ResizeObserver(send).observe(document.body);})();<\/script>';

  // srcdoc = dev build + tiny base style + the demo code + the height reporter.
  var buildSrcdoc = function (code) {
    var usesUi = /ricdomUI/.test(code);
    return (
      '<!doctype html><html><head><meta charset="utf-8">' +
      (usesUi ? '<link rel="stylesheet" href="dist/ricdom-ui.css">' : '') +
      '<link rel="stylesheet" href="examples/_fonts.css">' +
      '<style>html{background:#fff}body{margin:0;padding:12px;color:#111827;font-size:14px}</style>' +
      '<script src="dist/ricdom.iife.js"><\/script>' +
      (usesUi ? '<script src="dist/ricdom-ui.iife.js"><\/script>' : '') +
      '</head><body>' + code + FRAME_SCRIPT + '</body></html>'
    );
  };

  // Relative .md links inside the documents point at sibling files; map them onto the site.
  var GITHUB = 'https://github.com/miyoshi-tec/ricdom/blob/main/';
  var rewriteHref = function (href) {
    if (!href || /^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return null;
    var hashAt = href.indexOf('#');
    var path = hashAt >= 0 ? href.slice(0, hashAt) : href;
    var hash = hashAt >= 0 ? href.slice(hashAt) : '';
    var file = path.split('/').pop();
    if (file === 'SPEC.md') return 'spec.html' + hash;
    if (file === 'TUTORIAL.md' || file === 'TUTORIAL.ja.md') return 'tutorial.html' + hash;
    if (file === 'CHANGELOG.md') return 'CHANGELOG.md';
    if (path.indexOf('../') === 0) return GITHUB + path.replace(/^(\.\.\/)+/, '') + hash;
    if (/\.md$/.test(path)) return 'docs/' + path + hash;
    return null;
  };

  window.ricdomDoc = {
    mount: function (opts) {
      var token = 0;
      var app = ricdom.createApp(
        opts.target,
        { lang: I.getLang(), status: 'loading', segments: [], toc: [] },
        function (s) {
          var note = opts.note ? opts.note(s.lang) : null;
          var body;
          if (s.status === 'loading') {
            body = [U.uiText({ children: [t('Loading…')] })];
          } else if (s.status === 'error') {
            body = [
              U.uiText({ children: [t('Could not load the document.')] }),
              location.protocol === 'file:'
                ? U.uiMdPre({ children: [t('This page loads Markdown with fetch(), which browsers block under file://. Open it through a local server: run `npm run build:site`, then `npx http-server _site`.')] })
                : null,
            ];
          } else {
            body = s.segments.map(function (seg, i) {
              if (seg.type === 'md') return U.uiMdPre({ key: 'md' + i, children: [seg.text] });
              return {
                tag: 'div',
                key: 'live' + i,
                class: 'doc-demo',
                children: [
                  { tag: 'p', class: 'doc-demo__label', children: [t('Live demo (runs in a sandboxed frame)')] },
                  {
                    tag: 'iframe',
                    class: 'doc-demo__frame',
                    title: t('Live demo'),
                    sandbox: 'allow-scripts allow-modals', // allow-modals: the tutorial demos call alert()
                    srcdoc: buildSrcdoc(seg.code),
                    style: { height: '120px' },
                  },
                ],
              };
            });
          }
          return {
            tag: 'div',
            class: 'doc-layout',
            children: [
              s.toc.length
                ? {
                    tag: 'nav',
                    class: 'doc-toc',
                    'aria-label': t('Table of contents'),
                    children: s.toc.map(function (e) {
                      return { tag: 'a', key: e.id, href: '#' + e.id, class: e.level === 3 ? 'is-h3' : '', children: [e.text] };
                    }),
                  }
                : { tag: 'div' },
              {
                tag: 'div',
                class: 'doc-main',
                children: [
                  note ? { tag: 'p', class: 'site-note', children: [note] } : null,
                  U.uiPanel({ class: 'doc-body', children: body }),
                ],
              },
            ],
          };
        },
      );

      // After a render: give the h2 / h3 headings their anchor ids and fix relative links.
      var decorate = function () {
        var root = document.querySelector(opts.target + ' .doc-body');
        if (!root) return;
        var heads = root.querySelectorAll('h2, h3');
        var toc = app.toc;
        if (heads.length === toc.length) {
          heads.forEach(function (h, i) { h.id = toc[i].id; });
        }
        root.querySelectorAll('a[href]').forEach(function (a) {
          var next = rewriteHref(a.getAttribute('href'));
          if (next) a.setAttribute('href', next);
        });
      };

      var load = function (lang) {
        var mine = ++token;
        app.lang = lang;
        app.status = 'loading';
        app.segments = [];
        app.toc = [];
        fetch(opts.url(lang))
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
          })
          .then(function (text) {
            if (mine !== token) return;
            var doc = parse(text);
            app.segments = doc.segments;
            app.toc = doc.toc;
            app.status = 'ready';
          })
          .catch(function (err) {
            if (mine !== token) return;
            console.warn('ricdomDoc: failed to load ' + opts.url(lang), err);
            app.status = 'error';
          })
          .then(function () {
            if (mine !== token) return;
            app.renderNow();
            decorate();
            if (location.hash) {
              var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
              if (target) target.scrollIntoView();
            }
          });
      };

      // Each demo iframe reports its content height; size the matching frame.
      window.addEventListener('message', function (e) {
        if (!e.data || typeof e.data.ricdomLiveHeight !== 'number') return;
        var frames = document.querySelectorAll(opts.target + ' iframe');
        for (var i = 0; i < frames.length; i++) {
          if (frames[i].contentWindow === e.source) {
            frames[i].style.height = Math.max(60, e.data.ricdomLiveHeight + 2) + 'px';
          }
        }
      });

      I.onLangChange(load);
      load(I.getLang());
      return app;
    },
  };
})();
