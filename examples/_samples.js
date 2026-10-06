// Single source of truth for the sample list: examples/index.html renders it and _nav.js builds
// the prev/next links from it. Titles and blurbs carry both languages inline ({ en, ja }) so
// this file needs no ricdomI18n dictionary.
//
// scripts/examplesSmoke.mjs checks that every examples/NN-*.html file has an entry here and
// vice versa, so adding a sample means: create the page, add one line below.
window.RICDOM_SAMPLES = [
  {
    file: '01-hello.html',
    title: { en: 'Hello', ja: 'Hello' },
    blurb: {
      en: 'The smallest app: one <script> tag and a counter (core only).',
      ja: '最小のアプリ: <script> 1 本とカウンター (コアのみ)。',
    },
  },
  {
    // TODO: a later wave splits this page into 02 (basic inputs), 03 (forms) and 04 (layout/text).
    file: '03-forms.html',
    title: { en: 'Forms and controls', ja: 'フォームとコントロール' },
    blurb: {
      en: 'Every stateless control, layout and text component (no app.use() needed).',
      ja: '状態を持たない全コントロール・レイアウト・テキスト部品 (app.use() 不要)。',
    },
  },
  {
    file: '05-dialog-toast.html',
    title: { en: 'Dialog, popup, toast, tooltip', ja: 'ダイアログ・ポップアップ・トースト・ツールチップ' },
    blurb: {
      en: 'Stateful components registered through app.use().',
      ja: 'app.use() で登録する、状態を持つ部品。',
    },
  },
  {
    // TODO: tabs / accordion / dropdown move to 07 in a later wave.
    file: '06-splitter-scroll-pane.html',
    title: { en: 'Splitter, scroll pane and more', ja: 'スプリッター・スクロールペインほか' },
    blurb: {
      en: 'Splitter, scroll pane, collapse box, accordion, tabs, dropdown and inline menu.',
      ja: 'スプリッター、スクロールペイン、折りたたみ、アコーディオン、タブ、ドロップダウン、インラインメニュー。',
    },
  },
  {
    file: '08-themes.html',
    title: { en: 'Themes and frosted glass', ja: 'テーマとフロストガラス' },
    blurb: {
      en: 'All 7 bundled themes, including glass / glass-dark over a CSS wallpaper.',
      ja: '同梱の 7 テーマ。壁紙の上の glass / glass-dark (フロストガラス) を含む。',
    },
  },
  {
    file: '09-markdown.html',
    title: { en: 'Markdown editor', ja: 'Markdown エディタ' },
    blurb: {
      en: 'ricdom/md-editor: a real <textarea> with Markdown syntax colors.',
      ja: 'ricdom/md-editor: Markdown の構文を色分けする本物の <textarea>。',
    },
  },
  {
    file: '10-tweak-panel.html',
    title: { en: 'Tweak panel', ja: 'Tweak パネル' },
    blurb: {
      en: 'createTweakPanel: a dat.GUI-style parameter panel with live output.',
      ja: 'createTweakPanel: dat.GUI 風のパラメータ調整パネル。即時に出力へ反映。',
    },
  },
];
