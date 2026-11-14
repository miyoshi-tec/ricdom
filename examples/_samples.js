// Single source of truth for the sample list: examples/index.html renders it and _nav.js builds
// the prev/next links from it. Titles and blurbs carry both languages inline ({ en, ja }) so
// this file needs no ricdomI18n dictionary.
//
// scripts/examplesSmoke.mjs checks that every examples/NN-*.html file has an entry here and
// vice versa, so adding a sample means: create the page, add one line below.
//
// The order is "most used first, then by difficulty": the basics (01-04), components that keep
// state (05-07), themes and the larger components (08-10), then how ricdom fits into a page and
// how lists are reconciled (11-12), and the less common floating components (13).
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
    file: '02-button-text-icon.html',
    title: { en: 'Buttons, text, icons and themes', ja: 'ボタン・テキスト・アイコン・テーマ' },
    blurb: {
      en: 'The first UI components: uiButton, uiText, uiIcon, and applyTheme to give one box its own theme, density and font size.',
      ja: '最初の UI 部品: uiButton・uiText・uiIcon と、箱 1 つに別のテーマ・密度・文字サイズを当てる applyTheme。',
    },
  },
  {
    file: '03-forms.html',
    title: { en: 'Forms', ja: 'フォーム' },
    blurb: {
      en: 'Input, textarea, checkbox, radio, select, range, colour and progress, wired to state with oninput / onchange (and the bind* shorthand).',
      ja: '入力欄・テキストエリア・チェックボックス・ラジオ・セレクト・スライダー・色・進捗棒を、oninput / onchange で状態につなぐ (短く書く bind* も)。',
    },
  },
  {
    file: '04-layout.html',
    title: { en: 'Layout', ja: 'レイアウト' },
    blurb: {
      en: 'uiRow, uiCol, uiGrid, uiPanel and uiSeparator: boxes that line things up.',
      ja: 'uiRow・uiCol・uiGrid・uiPanel・uiSeparator: 並べるための箱。',
    },
  },
  {
    file: '05-dialog-toast.html',
    title: { en: 'Dialog and toast', ja: 'ダイアログとトースト' },
    blurb: {
      en: 'Components registered through app.use(): a modal dialog that traps and returns the focus, toasts, and createFocusWhen.',
      ja: 'app.use() で登録する部品: フォーカスを閉じ込めて元に戻すモーダルダイアログ、トースト、createFocusWhen。',
    },
  },
  {
    file: '06-splitter-scroll-pane.html',
    title: { en: 'Splitter and scroll pane', ja: 'スプリッターとスクロールペイン' },
    blurb: {
      en: 'Resizable panels, a splitter inside a splitter, and panes that follow their newest line.',
      ja: '大きさを変えられるパネル、スプリッターの入れ子、最新の行を追いかけるペイン。',
    },
  },
  {
    file: '07-tabs-accordion.html',
    title: { en: 'Tabs and accordion', ja: 'タブとアコーディオン' },
    blurb: {
      en: 'createTabs and createAccordion, left to the component or driven by your own state.',
      ja: 'createTabs と createAccordion。部品に任せる書き方と、自分の状態で動かす書き方。',
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
    title: { en: 'Markdown', ja: 'Markdown' },
    blurb: {
      en: 'uiMdPre and uiCodePre to show Markdown and code, ricdom/md-editor to edit it.',
      ja: 'Markdown とコードを表示する uiMdPre・uiCodePre と、編集する ricdom/md-editor。',
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
  {
    file: '11-multiple-apps-islands.html',
    title: { en: 'Several apps and islands', ja: '複数のアプリと島' },
    blurb: {
      en: 'Small apps inside a hand-written page, a canvas that ricdom leaves alone, and portalTo.',
      ja: '手書きのページに差し込む小さなアプリ、ricdom が触らない canvas、portalTo。',
    },
  },
  {
    file: '12-keys-lists.html',
    title: { en: 'Lists and key', ja: 'リストと key' },
    blurb: {
      en: 'Adding, removing and reordering list items: what key changes, shown with live DOM elements.',
      ja: 'リストの追加・削除・並べ替え: key で何が変わるかを、実際の DOM 要素で確かめる。',
    },
  },
  {
    file: '13-popup-dropdown-tooltip.html',
    title: { en: 'Popup, dropdown, tooltip, collapse box', ja: 'ポップアップ・ドロップダウン・ツールチップ・折りたたみ' },
    blurb: {
      en: 'Menus (on every row and on right-click too), dropdown panels, tooltips and a collapsing box.',
      ja: 'メニュー (行ごと・右クリックも)、ドロップダウンのパネル、ツールチップ、折りたたむ箱。',
    },
  },
];
