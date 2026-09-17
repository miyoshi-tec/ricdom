// ricdom/ui — 状態を持たない部品 (control/layout/text) 共通ヘルパー
//
// v1 (ric_ui/control/*.js, ric_ui/layout/*.js) では各ファイルが同じ 4 行の
// class 連結ロジックをコピペしていた。v2 でも当初は uiButton/uiInput が
// 同じコピペを踏襲していたが、button.ts/input.ts もここに合流させた
// (§14 の追補: 「uiButton/uiInput に data-ricdom-role を付与し、UI_ROLE 列挙に統合」)。

import type { ClassValue } from '../../types.js';

// dev/prod 切り替え (src/reactivity.ts の isDevMode / bakedDevMode と同じ判定規則)。
// ricdom/ui はコアに実行時依存が無い (設計書 §13) ので、コア側を import せずここに複製する
// (判定規則を変えるときは両方を揃えること)。
//
// 2.0.0-alpha.10 で判明した穴 (コア側と同根、統括確認済み): 旧実装は
// `typeof process === 'undefined' || ... || process.env.NODE_ENV !== 'production'` の
// OR 連鎖だけで、tsup の define は末尾の `process.env.NODE_ENV` トークンしか置換しない
// ため、`process` グローバルが無いブラウザ (`<script src>` 直読み = 主要な配布形態) では
// 前 2 節が常に true になり、production の `.iife.min.js` でも isDevMode() が true を
// 返し続けていた。focusWhen (ref 未発見) / inlineMenu (親が unpositioned) / theme
// (無効な theme 名) の dev 専用 warn がコード・文字列ごと出荷 min に残っていた
// (\uXXXX エスケープを考慮した grep で確認)。コアの修正時点では ui 側は「別の穴」と
// して tsup.config.ts の define だけ先に足してあり、この判定側が `__RICDOM_DEV__` を
// 見ていなかったため、その define は効いていなかった。
//
// 対策もコアと同じ: ビルド時定数 `__RICDOM_DEV__` (declare は src/env.d.ts、tsup.config.ts
// の ui IIFE 2 本が true/false を焼き込む) をトップレベル定数 `bakedDevMode` として一度だけ
// 確定させ、呼び出し側 (focusWhen.ts / inlineMenu.ts / theme.ts) は `isDevMode()` を
// 直接呼ばず、必ず定数を **左** に置いた `bakedDevMode ?? isDevMode()` の形で参照する。
// esbuild は関数呼び出しをまたいだ定数伝播を行わない (isDevMode() の中身をどれだけ
// 定数化しても、呼び出し式が条件に残る限り warn コードは物理的に残る) が、`??`/`&&` の
// 左辺が静的に確定していれば右辺ごと畳み込む (`false ?? f()` → `false`) ので、
// `.iife.min.js` では warn コードが dead-code elimination で完全に消え、`.iife.js`
// (`true`) では無条件に残る。ESM/CJS や bundler 無しの実行では `__RICDOM_DEV__` が
// 未定義 → `bakedDevMode` は `undefined` → 従来どおり `process.env.NODE_ENV` を都度読む
// (テストで dev/prod を切り替えられる動的挙動を維持)。`process` 自体が無い環境では
// 「判定不能なら dev 扱い」(silent failure を増やさない方針) もコアと同じ。
//
// **このファイルの先頭 (import 直後、UI_ROLE より前) に置くこと**: 実装時に esbuild 直叩きの
// 二分探索で判明した追加条件 (esbuild 0.27.7) — トップレベル const の定数インライン化
// (呼び出し側の `bakedDevMode` を `false` に置換する処理) は、同じファイル内でそれより
// **前** にあるトップレベル宣言の初期化子にオブジェクトリテラル・`new`・関数呼び出しが
// 1 つでもあると行われない (数値・配列リテラル・アロー関数は妨げない)。当初 UI_ROLE
// (オブジェクトリテラル) の後ろに置いたところ、`bakedDevMode = !1` 自体は畳まれるのに
// 呼び出し側には変数参照のまま残り、warn コードが min に残った。コア (reactivity.ts) で
// 同じ書き方が効いていたのは、たまたま前方にそうした宣言が無かったため。
export const bakedDevMode: boolean | undefined = typeof __RICDOM_DEV__ === 'boolean' ? __RICDOM_DEV__ : undefined;

export const isDevMode = (): boolean => {
  if (bakedDevMode !== undefined) return bakedDevMode;
  try {
    return typeof process === 'undefined' || typeof process.env === 'undefined' || process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
};

/** 基底 class (例: 'ric-input') に呼び出し側の class (string/配列/真偽値マップ) を連結する。 */
export const mergeClass = (base: string, extra: ClassValue | undefined): string => {
  if (!extra) return base;
  if (typeof extra === 'string') return `${base} ${extra}`;
  if (Array.isArray(extra)) return [base, ...extra].join(' ');
  const truthy = Object.keys(extra).filter((k) => extra[k]);
  return [base, ...truthy].join(' ');
};

/**
 * 部品種別ごとの `data-ricdom-role` 値 (E2E/CSS の安定セレクタ、設計書付録 A14 継承)。
 * `src/app.ts`/`src/ui/injectStyles.ts` が内部マーカーとして使っている
 * 'portal'/'styles' と値がぶつからないよう、部品名前空間として列挙する。
 *
 * 状態を持たない部品に加え、uiButton/uiInput と、状態を持つ部品 (splitter/scrollPane/
 * collapseBox/accordion/tabs/dropdown/popup) の内部マーカーもここに統合し、
 * 「全部品で一貫」させている (§14 追補。popup.ts の 'popup-item' 直書きもここに移動)。
 */
export const UI_ROLE = {
  button: 'button',
  input: 'input',
  textarea: 'textarea',
  checkbox: 'checkbox',
  radiogroup: 'radiogroup',
  select: 'select',
  range: 'range',
  color: 'color',
  separator: 'separator',
  text: 'text',
  icon: 'icon',
  col: 'col',
  row: 'row',
  grid: 'grid',
  panel: 'panel',
  mdPre: 'md-pre',
  codePre: 'code-pre',
  /** ricdom/md-editor (opt-in サブパス) のラッパー div。textarea 自身は role 'textarea' の
   *  まま (uiTextarea をそのまま使う) — ラッパーと「後ろのミラー <pre>」だけが新規 role を持つ。 */
  mdEditor: 'md-editor',
  mdEditorMirror: 'md-editor-mirror',
  // ── 状態を持つ部品 ──
  dialog: 'dialog',
  /** dialog の背景オーバーレイ (2.0.0-alpha.2 追補、§14 の全部品方針をサブパーツへ拡張) */
  dialogOverlay: 'dialog-overlay',
  dialogHeader: 'dialog-header',
  /** dialog のタイトル文字列 (`.ric-dialog__title`、パイロット第 5〜7 号 = Brownies Desktop
   *  からの報告 #2、2.0.0-alpha.8)。dialogHeader は「タイトル+閉じるボタンを束ねる行」の
   *  コンテナで、タイトル文字列そのものを CSS/E2E から掴む手段が無かった (title/close を
   *  分離して掴みたいケースを塞いでいた) ため新設。 */
  dialogTitle: 'dialog-title',
  /** dialog の本文コンテナ (`.ric-dialog__body`)。dialog 自身 (portal ルート) は `dialog` のまま */
  dialogBody: 'dialog-body',
  dialogFooter: 'dialog-footer',
  dialogClose: 'dialog-close',
  popup: 'popup',
  popupItem: 'popup-item',
  /** popup を開くトリガーボタン (2.0.0-alpha.8、#2 の役割棚卸しで発見: dropdown には
   *  dropdownTrigger があるのに popup のトリガー (`aria-haspopup="menu"` の button) には
   *  role が無かった非対称を解消)。 */
  popupTrigger: 'popup-trigger',
  /** popup/dropdown で共有する背景オーバーレイ (`.ric-popup__overlay`、両部品が同じ要素を使う) */
  popupOverlay: 'popup-overlay',
  toast: 'toast',
  toastItem: 'toast-item',
  /** toast 1 件のメッセージ文字列 (`.ric-toast__msg`、2.0.0-alpha.8、#2 の役割棚卸しで追加。
   *  toastItem (行全体) と toastClose (閉じるボタン) はあったが、本文だけを掴む手段が無かった)。 */
  toastMsg: 'toast-msg',
  toastClose: 'toast-close',
  tooltip: 'tooltip',
  /** tooltip のホバー/フォーカス対象トリガー (`.ric-tooltip`、2.0.0-alpha.8、#2 の役割棚卸しで
   *  追加。dropdownTrigger/popupTrigger と同じ理由 — トリガー自身と portal 側の本体
   *  (tooltip role) を CSS/E2E から別々に掴めるようにする)。 */
  tooltipTrigger: 'tooltip-trigger',
  scrollPane: 'scroll-pane',
  splitter: 'splitter',
  splitterSide: 'splitter-side',
  splitterMain: 'splitter-main',
  splitterDivider: 'splitter-divider',
  splitterToggle: 'splitter-toggle',
  collapseBox: 'collapse-box',
  accordion: 'accordion',
  accordionItem: 'accordion-item',
  accordionHeader: 'accordion-header',
  accordionBody: 'accordion-body',
  accordionTitle: 'accordion-title',
  tabs: 'tabs',
  tabsBar: 'tabs-bar',
  tabsTab: 'tabs-tab',
  tabsPanel: 'tabs-panel',
  dropdown: 'dropdown',
  dropdownTrigger: 'dropdown-trigger',
  inlineMenu: 'inline-menu',
  // ── パラメータ調整パネル ──
  tweakPanel: 'tweak-panel',
  /** パネル全体のタイトル (`.ric-tweak__title`、2.0.0-alpha.8、#2 の役割棚卸しで追加。
   *  行ごとの label (`.ric-tweak-row__label` 等) は data-ricdom-tweak-key 付きの行が既に
   *  一意に掴めるため見送ったが、パネル全体のタイトルは唯一無二の見出しなので dialogTitle/
   *  tweakFolderHeader と同じ扱いにする)。 */
  tweakTitle: 'tweak-title',
  tweakFolder: 'tweak-folder',
  tweakFolderHeader: 'tweak-folder-header',
  tweakFolderBody: 'tweak-folder-body',
  /** tweak の leaf row (number/range/checkbox/text/select/radiobutton/color/計算値) の
   *  コンテナ。`data-ricdom-tweak-key` (dot 連結のキー鎖) と対で付与する (§14 追補)。 */
  tweakRow: 'tweak-row',
} as const;

export type UiRole = (typeof UI_ROLE)[keyof typeof UI_ROLE];
