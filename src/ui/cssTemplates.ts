// ricdom/ui — CSS テンプレート (設計書 §4)
//
// v1 (ric_ui/css_templates.js) から各部品の規則を移植する。ボタン/入力/dialog/
// popup/toast/tooltip、状態を持たない部品 (control/layout/text) 一式 + ページ全体
// スクロールバー既定スタイルを含む。v1 との相違点:
//   - `.ric-page ` プレフィックスを廃止。v2 には `create_ui_page` に相当する「テーマ適用
//     スコープ用コンポーネント」が無く、`applyTheme(el, ...)` は任意の要素に直接 CSS 変数を
//     当てるだけなので (§4)、CSS 側は単純なクラスセレクタで書ける (変数は通常の CSS
//     継承で子孫に届く)。
//   - v1 の「ページ全体スクロールバー既定スタイル」(`.ric-page, .ric-page *` への一括適用) は、
//     v2 に page 部品が無いため `[data-ricdom-theme]` (applyTheme が付与するマーカー属性) を
//     スコープに使う方式に置き換えた (設計書 §13 で確定。SCROLLBAR_CSS 参照)。
//   - v1 の create_ui_popup は label/icon/chevron の 3 モードを持つ汎用ドロップダウンだったが、
//     v2 の createPopup は「トリガー + role=menu の本体」に絞ったメニュー部品として設計
//     し直した (設計書 E の記述 — aria-haspopup="menu" / role="menu" / menuitem 自動付与)。
//     CSS もそれに合わせて簡略化する。
//   - v1 の ui_panel はテーマ上書き props (`{theme, density, font_size}`) を持ったが、v2 の
//     uiPanel は持たない (設計書 §13)。disabled の見た目 (opacity) も JS 側の inline style
//     計算をやめ、`.ric-panel[inert]` の CSS セレクタで表現する (PANEL_CSS 参照)。

const fg = 'var(--ric-color-fg)';
const fm = 'var(--ric-color-fg-muted)';
const bg = 'var(--ric-color-bg)';
const bd = 'var(--ric-color-border)';
const ct = 'var(--ric-color-control)';
const ac = 'var(--ric-color-accent)';
const af = 'var(--ric-color-accent-fg, #fff)';
const r = 'var(--ric-radius)';
const g = 'var(--ric-gap)';
const px = 'var(--ric-pad-x)';
const py = 'var(--ric-pad-y)';
const ch = 'var(--ric-control-h)';
// フォールバック値付き: applyTheme が呼ばれる前 (または呼ばれない) でもアニメーションの
// `animation`/`transition` 宣言自体は有効な値を持つようにする。--ric-duration/--ric-easing
// が未定義のまま var() をフォールバック無しで使うと、ダイアログ/popup の open/close は
// 「animationend の発火」に状態遷移の完了 (フォーカス移動・DOM 除去) を委ねているため、
// アニメーション自体が発火しない = 状態遷移が永久に完了しない、という機能的なバグになる
// (実ブラウザテストで発見・修正。ANIMATION_FALLBACK_MS の setTimeout backstop はこれの
// 保険であって、フォールバック無しの var() を許容する理由にはしない)。
const dur = 'var(--ric-duration, 200ms)';
const eas = 'var(--ric-easing, ease)';
const sh = 'var(--ric-shadow)';
const tb = 'var(--ric-tooltip-bg)';
const tf = 'var(--ric-tooltip-fg)';
const cb = 'var(--ric-code-bg)'; // コードブロック背景 (v1 v0.4.1〜、tooltip とは独立)
const cf = 'var(--ric-code-fg)'; // コードブロック文字色
const gm = 'var(--ric-gap-md)';
const sbt = 'var(--ric-scrollbar-thumb)'; // スクロールバーつまみ色 (v1 v0.4.2〜)
const sbth = 'var(--ric-scrollbar-thumb-hover)'; // スクロールバーつまみ hover 色
// --ric-popup-blur / --ric-panel-shadow は cyber/aqua テーマだけが明示する値 (theme.ts)。
// 他テーマでは未定義のままだと var() がフォールバック無しで空になり宣言ごと無効になるため、
// フォールバック値を明示する (v1 は毎テーマに既定値があったため意識しなくてよかった差分)。
const bl = 'var(--ric-popup-blur, none)';
const ps = 'var(--ric-panel-shadow, var(--ric-shadow))';
const fs = 'var(--ric-font-size, 14px)';
// ricdom/md-editor (opt-in サブパス) のトークン。このファイル (ricdom/ui) には
// createMdEditor の実装コードは一切無い — CSS だけをここに置く理由は「CSS は 1 枚」の
// canon (consumer が既に読み込んでいる ricdom-ui.css の外に 2 枚目のスタイルシートを
// 増やさない) を優先するため。
const mdh = 'var(--ric-md-heading)';
const mde = 'var(--ric-md-emphasis)';
const mdl = 'var(--ric-md-link)';
const mdu = 'var(--ric-md-url)';
const mdcb = 'var(--ric-md-code-bg)';
const mdq = 'var(--ric-md-quote)';
const mdm = 'var(--ric-md-marker)';
const mdmeta = 'var(--ric-md-meta)';

const b1 = `1px solid ${bd}`;
const da = `${dur} ${eas}`;

const BUTTON_CSS = `
.ric-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  height: ${ch};
  padding: 0 ${px};
  border: ${b1};
  border-radius: ${r};
  background: ${ct};
  color: ${fg};
  font-size: 1em;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  appearance: none;
  white-space: nowrap;
  transition: background 0.1s, border-color 0.1s, filter 0.1s, translate 0.07s;
}
.ric-button:hover:not(:disabled) {
  background: ${bd};
  border-color: ${fm};
}
.ric-button:active:not(:disabled) {
  translate: 0 1px;
  filter: brightness(0.85);
}
.ric-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ric-button--primary {
  background: ${ac};
  border-color: ${ac};
  color: ${af};
}
.ric-button--primary:hover:not(:disabled) {
  background: ${ac};
  border-color: ${ac};
  filter: brightness(1.15);
}
.ric-button--primary:active:not(:disabled) {
  translate: 0 1px;
  filter: brightness(0.9);
}
.ric-button--ghost {
  border-color: transparent;
  background: transparent;
}
.ric-button--ghost:hover:not(:disabled) {
  border-color: ${fm};
  background: ${bd};
}
/* v1 ric_ui/control/ui_button.js の 'link' variant を復活 (Rancha からの報告、
   2.0.0-alpha.8、設計書 §20「v1 で正式 prop だったものは復活が原則」)。背景・枠・
   高さ制限を全部外したテキスト風ボタン (breadcrumb / inline link 用途)。size (sm/md/lg)
   の高さ指定より後ろに置かず、hover/active で height:auto を再上書きされないよう
   sm/md/lg より先に定義する (CSS 内の記述順は詳細度が同じ場合の後勝ちに影響するため、
   v1 (css_templates.js) と同じ並び順を踏襲)。 */
.ric-button--link {
  border-color: transparent;
  background: transparent;
  color: inherit;
  font: inherit;
  height: auto;
  padding: 1px 5px;
  line-height: 1.4;
  white-space: nowrap;
}
.ric-button--link:hover:not(:disabled) {
  background: ${bd};
  border-color: transparent;
}
.ric-button--link:active:not(:disabled) {
  /* link variant: テキスト風なので press-jump (translate/filter) はさせない */
  translate: 0;
  filter: none;
  background: color-mix(in srgb, ${fg} 14%, transparent);
}
.ric-button--sm {
  height: 22px;
  font-size: 12px;
  padding: 0 8px;
}
.ric-button--lg {
  height: 36px;
  font-size: 16px;
  padding: 0 14px;
}`;

const INPUT_CSS = `
.ric-input {
  display: block;
  width: 100%;
  height: ${ch};
  padding: 0 ${px};
  border: ${b1};
  border-radius: ${r};
  background: ${ct};
  color: ${fg};
  font-size: 1em;
  outline: none;
  appearance: none;
  transition: background 0.1s, border-color 0.15s, box-shadow 0.15s, translate 0.07s, filter 0.1s;
}
.ric-input:hover:not(:disabled) {
  background: ${bd};
  border-color: ${fm};
}
.ric-input:focus {
  background: ${ct};
  border-color: ${ac};
  box-shadow: 0 0 0 3px color-mix(in srgb, ${ac} 20%, transparent);
  translate: 0;
  filter: none;
}
.ric-input:active:not(:disabled) {
  filter: brightness(0.88);
}
.ric-input::placeholder {
  color: ${fm};
}`;

// z-index (LCP #1、2.0.0-alpha.9): CSS クラス化 (Phase 1) の際に、v1 (ric_ui/popup/
// create_ui_dialog.js) が inline style で持っていた zIndex: 500/501 が引き継がれず
// 落ちていた。結果、他の CSS クラス (.ric-splitter__divider の z-index:1 等) がモーダル
// ダイアログを貫通して描画される実機バグになった (LCP 報告 #1、実機で全ダイアログに影響)。
// v1 パリティで復活: overlay=500 / 本体=501。toast=600 > dialog=501 > popup/dropdown/
// tooltip=401 の序列は v1 のまま維持する (下の POPUP_CSS も参照)。
// 「portal 要素自体に stacking context を持たせる (position:relative + z-index を portal
// div に付ける)」案は不採用 — portalTo で app 専用 portal ではなく consumer 側の
// 任意の外部要素を portal 先に指定するケース (設計書 §3.5) では、その外部要素は
// ricdom-ui.css の管理外なので stacking context を保証できない。個々の部品の
// overlay/本体クラスに z-index を持たせる方式なら portal 先がどこであっても効く。
const DIALOG_CSS = `
@keyframes ric-dlg-in  { from { opacity:0; transform:translate(-50%,-50%) scale(.8); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } }
@keyframes ric-dlg-out { from { opacity:1; transform:translate(-50%,-50%) scale(1); } to { opacity:0; transform:translate(-50%,-50%) scale(.8); } }
@keyframes ric-ovl-in  { from { opacity:0; } to { opacity:1; } }
@keyframes ric-ovl-out { from { opacity:1; } to { opacity:0; } }

.ric-dialog__overlay { position: fixed; inset: 0; z-index: 500; background: color-mix(in srgb, ${tb} 10%, transparent); animation: ric-ovl-in ${da}; }
.ric-dialog__overlay--out { animation: ric-ovl-out ${da} forwards; pointer-events: none; }
.ric-dialog {
  position: fixed;
  z-index: 501;
  top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  background: var(--ric-popup-bg, var(--ric-color-bg));
  border: ${b1};
  border-radius: ${r};
  box-shadow: ${sh};
  width: min(360px, 90vw);
  overflow: hidden;
  animation: ric-dlg-in ${da};
}
.ric-dialog--out { animation: ric-dlg-out ${da} forwards; pointer-events: none; }
.ric-dialog__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: ${py} ${px};
  border-bottom: ${b1};
}
.ric-dialog__title { font-weight: 700; font-size: 1em; color: ${fg}; }
.ric-dialog__close {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  border: none; background: transparent; cursor: pointer;
  color: ${fm}; font-size: 14px;
  border-radius: ${r};
  transition: background 0.1s, color 0.1s;
}
.ric-dialog__close:hover { background: ${bd}; color: ${fg}; }
.ric-dialog__body { padding: ${px}; font-size: 1em; color: ${fg}; }
.ric-dialog__footer {
  display: flex; justify-content: flex-end; gap: ${g};
  padding: ${g} ${px} ${py};
  border-top: ${b1};
}`;

// z-index (LCP #1、2.0.0-alpha.9): dialog (上の DIALOG_CSS) と同じ理由で落ちていた分の
// popup/dropdown 側。v1 (ric_ui/popup/_popup_utils.js の _pos_style) は overlay/本体とも
// 401 固定 (「オーバーレイも本体も z:401 だが、DOM 順で本体が後方に置かれるため自然に
// 前面になる」という v1 のコメントをそのまま踏襲)。dropdown 本体 (.ric-dropdown__body、
// DROPDOWN_CSS 側) も createPopup/createDropdown が同じ overlay クラスを共有するため、
// そちらも 401 に揃える。
const POPUP_CSS = `
@keyframes ric-popup-in  { from { opacity:0; transform:scaleY(0.6); } to { opacity:1; transform:scaleY(1); } }
@keyframes ric-popup-out { from { opacity:1; transform:scaleY(1); }   to { opacity:0; transform:scaleY(0.6); } }

/* light dismiss (#A、2.0.0-alpha.12、パイロット第 10 号・線茶からの報告): alpha.11 以前は
   pointer-events:auto (既定値) + onclick で閉じており、viewport 全面を覆うこの要素が
   外側クリックを吸ってしまっていた (「1 回目のクリックは閉じるだけ」)。HTML の
   popover="auto" と同じ「外側の pointerdown で閉じつつ、そのクリックは下の要素に
   届く」挙動にするため pointer-events:none にする — role (popup-overlay) と見た目用の
   要素として残すのみで、閉じる判定は popup.ts/dropdown.ts 側の document pointerdown
   監視 (handleOutsidePointerDown) が担う。 */
.ric-popup__overlay { position: fixed; inset: 0; z-index: 401; pointer-events: none; }

.ric-popup__body {
  position: fixed;
  z-index: 401;
  min-width: 160px;
  background: ${ct};
  border: ${b1};
  border-radius: ${r};
  box-shadow: ${sh};
  overflow: hidden;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ric-popup__body--below { transform-origin: top; animation: ric-popup-in ${da}; }
.ric-popup__body--above { transform-origin: bottom; animation: ric-popup-in ${da}; }
.ric-popup__body--out { pointer-events: none; }
.ric-popup__body--out.ric-popup__body--below,
.ric-popup__body--out.ric-popup__body--above { animation: ric-popup-out ${da} forwards; }

.ric-popup__item {
  display: flex !important;
  align-items: center;
  gap: ${g};
  width: 100%;
  justify-content: flex-start;
  text-align: left;
  border-radius: calc(${r} - 2px);
  border: 1px solid transparent;
}
.ric-popup__item:hover,
.ric-popup__item:focus-visible { border-color: ${bd}; background: ${bd}; outline: none; }
.ric-popup__sep { height: 1px; background: ${bd}; margin: 4px 0; }`;

const TOAST_CSS = `
@keyframes ric-toast-in  { from { opacity:0; transform:translateX(calc(100% + 20px)); } to { opacity:1; transform:translateX(0); } }
@keyframes ric-toast-out { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(calc(100% + 20px)); } }

.ric-toast__container {
  position: fixed;
  bottom: 20px; right: 20px;
  z-index: 600;
  display: flex; flex-direction: column;
  gap: 8px; align-items: flex-end;
  pointer-events: none;
}
.ric-toast__item {
  display: flex; align-items: center; gap: ${g};
  min-width: 220px; max-width: 360px;
  padding: ${py} ${px};
  background: var(--ric-popup-bg, var(--ric-color-bg));
  border: ${b1};
  border-radius: ${r};
  box-shadow: ${sh};
  pointer-events: auto;
}
.ric-toast__item--in  { animation: ric-toast-in  ${da} both; }
.ric-toast__item--success { border-left: 3px solid #22c55e; }
.ric-toast__item--error   { border-left: 3px solid #ef4444; }
.ric-toast__item--warning { border-left: 3px solid #f59e0b; }
.ric-toast__item--info    { border-left: 3px solid ${ac}; }
.ric-toast__item--out { animation: ric-toast-out ${da} forwards; pointer-events: none; }
.ric-toast__msg { flex: 1; font-size: 1em; color: ${fg}; line-height: 1.4; }
.ric-toast__close {
  flex-shrink: 0; width: 20px; height: 20px;
  border: none; background: transparent; cursor: pointer;
  color: ${fm}; font-size: 11px;
  border-radius: ${r};
  display: flex; align-items: center; justify-content: center;
  transition: background 0.1s, color 0.1s;
}
.ric-toast__close:hover { background: ${bd}; color: ${fg}; }`;

const TOOLTIP_CSS = `
@keyframes ric-tip-h { from { opacity:0; transform:translateX(-50%) scale(0.85); } to { opacity:1; transform:translateX(-50%) scale(1); } }
@keyframes ric-tip-v { from { opacity:0; transform:translateY(-50%) scale(0.85); } to { opacity:1; transform:translateY(-50%) scale(1); } }

.ric-tooltip__popup {
  position: fixed;
  background: ${tb};
  color: ${tf};
  font-size: 0.85em;
  padding: 4px 10px;
  border-radius: ${r};
  white-space: nowrap;
  pointer-events: none;
  max-width: 200px;
  z-index: 401;
}
.ric-tooltip__popup--top    { transform: translateX(-50%); transform-origin: center bottom; animation: ric-tip-h ${da}; }
.ric-tooltip__popup--bottom { transform: translateX(-50%); transform-origin: center top; animation: ric-tip-h ${da}; }
.ric-tooltip__popup--right  { transform: translateY(-50%); transform-origin: left center; animation: ric-tip-v ${da}; }
.ric-tooltip__popup--left   { transform: translateY(-50%); transform-origin: right center; animation: ric-tip-v ${da}; }`;

// portal センチネル (`<div data-ricdom-role="portal">`) は createApp が target 直下に
// 常に自動生成する (src/app.ts、コアの設計 §3.5、UI 層からは変更しない)。popup/dropdown/
// tooltip/toast/dialog のような portal 系部品を一切使わない consumer では、この div は
// 常に空 (幅 0・高さ 0) のまま残る。target 自体が無関係の理由で `display:flex; gap:...`
// を持っていると、この空 div も flex item として数えられ、gap 1 個分の余白がレイアウトに
// 混入する実機バグ (パイロット第 3 号 = 展示ビューアからの報告 #1、2.0.0-alpha.6)。
// `:empty` (子ノードが 1 つも無い) で display:none にすることで、portal が実際に何かを
// 描画するまでは flex/grid の計算から完全に除外される。中に子要素が入る (dialog/popup/
// toast が開く) と `:empty` が外れて通常どおり表示される。
// `display: contents` は採用しない — 展示ビューア (Electron) の SPEC §7 脚注どおり
// portal の box 自体に `-webkit-app-region: no-drag` を当てる consumer がおり、
// contents 化すると要素の box が消えて region 指定ごと無効になる。また contents は
// 一部ブラウザで子孫の a11y ツリー計算に既知の癖がある (フォーカス順序等) — 空の間しか
// 効かない :empty の方がシンプルで副作用が無い。
const PORTAL_CSS = `
[data-ricdom-role="portal"]:empty {
  display: none;
}`;

// ── 状態を持たない部品とレイアウト (設計書 §4/§13) ─────────────

// applyTheme した要素そのものに背景色・文字色を塗る (#11、v1 の create_ui_page が
// `.ric-page` に bg/fg を塗っていたパリティ)。v2 には page 部品が無く、applyTheme は
// 単に el.style へ CSS 変数を当てるだけ (theme.ts) だったため、要素自体は透明・無色の
// ままだった — CSS 変数は子孫には継承で届くが、要素自身の background/color を決めるのは
// このルール。子孫セレクタを付けない (`[data-ricdom-theme] *` にしない) のは、ネストした
// 島 (子孫で再度 applyTheme された要素) が自分の bg で上書きするのは意図どおりだが、
// それ以外の子孫まで一律に塗ると consumer 自身の要素の背景を勝手に上書きしてしまうため
// (v1 も `.ric-page` 自身だけを塗っていた)。
// `[data-ricdom-theme]` は属性の「有無」で一致する — ThemeVars 指定時に applyTheme が
// 付与する空文字値 (`data-ricdom-theme=""`) にもマッチする。
//
// **詳細度 (パイロット第 5〜7 号、Brownies Desktop からの報告 #1、2.0.0-alpha.8 で修正)**:
// alpha.3 時点では「属性セレクタ 1 つなので詳細度は低く、consumer は自分の CSS で
// 上書きできる」と書いていたが事実誤認だった。属性セレクタの詳細度は (0,1,0) で、
// consumer が「これは既定塗りだから」と要素セレクタ (`body { background: ... }`、
// (0,0,1)) で上書きしようとしても、(0,1,0) > (0,0,1) のため実際には勝てず、consumer の
// 意図に反してテーマの色が残ってしまう実機バグだった。ここは「既定」= consumer の
// どんな規則にも問答無用で負けるべき塗りなので、セレクタを `:where(...)` で包み詳細度を
// 0 にする (`:where()` の中身は詳細度計算に使われない、疑似要素 `::-webkit-scrollbar*`
// 部分の (0,0,1) はそのまま残る)。これで consumer 側は要素セレクタ 1 つで確実に上書き
// できる (SPEC §8 に FACT として明記)。
//
// font-size (パイロット第 3 号からの報告 #2、2.0.0-alpha.6): applyTheme は
// `--ric-font-size` 変数をセットするだけで、要素自身の font-size は塗っていなかった
// (この変数を実際に消費するのは .ric-panel/.ric-md-pre 程度で、それ以外の直下テキストは
// ブラウザ既定の 16px のまま)。v1 の `.ric-page` は font-size も塗っていた
// (md=14px) ため、bg/fg パリティ (#11) と同じ理由でここに揃える。
// **既存 consumer への影響**: この要素直下のテキストの見た目が変わりうる (既定 16px →
// テーマの fontSize、既定 md=14px)。上書きしたい場合は `[data-ricdom-theme] { font-size:
// ... }` のような要素/属性セレクタを自分の CSS に書けば必ず勝てる (SPEC §8 に FACT 追記)。
const THEME_PAINT_CSS = `
:where([data-ricdom-theme]) {
  background: ${bg};
  color: ${fg};
  font-size: ${fs};
}`;

// ページ全体のスクロールバー既定スタイル (v1 の `.ric-page, .ric-page *` 相当)。
// v2 に page 部品が無いため、applyTheme(el) が付与する `data-ricdom-theme` 属性を
// スコープ用マーカーとして使う (設計書 §13 で確定した方式)。属性を持つ要素自身と、
// その子孫すべてに適用する (子孫の中でネストして再度 applyTheme された要素があっても、
// セレクタが重複適用されるだけで害はない)。
// THEME_PAINT_CSS と同じ理由 (#1、2.0.0-alpha.8) でこれも「既定」なので `:where(...)`
// で詳細度 0 にする。疑似要素 (`::-webkit-scrollbar` 等) の (0,0,1) は `:where()` の
// 対象外 (疑似要素自体には掛けられない) なのでそのまま残るが、consumer が同じ疑似要素
// セレクタで上書きすれば互角以上に勝てるので実用上問題ない。
const SCROLLBAR_CSS = `
:where([data-ricdom-theme]), :where([data-ricdom-theme]) * {
  scrollbar-width: thin;
  scrollbar-color: ${sbt} transparent;
}
:where([data-ricdom-theme])::-webkit-scrollbar, :where([data-ricdom-theme]) *::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
:where([data-ricdom-theme])::-webkit-scrollbar-track, :where([data-ricdom-theme]) *::-webkit-scrollbar-track,
:where([data-ricdom-theme])::-webkit-scrollbar-corner, :where([data-ricdom-theme]) *::-webkit-scrollbar-corner {
  background: transparent;
}
:where([data-ricdom-theme])::-webkit-scrollbar-thumb, :where([data-ricdom-theme]) *::-webkit-scrollbar-thumb {
  background: ${sbt};
  border-radius: 4px;
}
:where([data-ricdom-theme])::-webkit-scrollbar-thumb:hover, :where([data-ricdom-theme]) *::-webkit-scrollbar-thumb:hover {
  background: ${sbth};
}`;

const TEXTAREA_CSS = `
.ric-textarea {
  display: block;
  width: 100%;
  padding: ${py} ${px};
  border: ${b1};
  border-radius: ${r};
  background: ${ct};
  color: ${fg};
  font-family: inherit;
  font-size: 1em;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  transition: background 0.1s, border-color 0.15s, box-shadow 0.15s;
}
.ric-textarea:hover:not(:disabled) {
  background: ${bd};
  border-color: ${fm};
}
.ric-textarea:focus {
  background: ${ct};
  border-color: ${ac};
  box-shadow: 0 0 0 3px color-mix(in srgb, ${ac} 20%, transparent);
}
.ric-textarea::placeholder {
  color: ${fm};
}`;

const CHECKBOX_CSS = `
.ric-checkbox {
  display: inline-flex;
  align-items: center;
  gap: ${g};
  padding: ${py} ${px};
  border: 1px solid transparent;
  border-radius: ${r};
  cursor: pointer;
  user-select: none;
  font-size: 1em;
  color: ${fg};
  transition: background 0.1s, border-color 0.1s, translate 0.07s;
}
.ric-checkbox:hover {
  background: ${bd};
  border-color: ${fm};
}
.ric-checkbox:active {
  translate: 0 1px;
  filter: brightness(0.88);
}
.ric-checkbox input[type="checkbox"] {
  width: 15px;
  height: 15px;
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: ${ac};
}
.ric-checkbox--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ric-checkbox--disabled:hover {
  background: transparent;
  border-color: transparent;
}
.ric-checkbox--disabled:active {
  translate: 0;
  filter: none;
}
.ric-checkbox--disabled input[type="checkbox"] {
  cursor: not-allowed;
}`;

const SELECT_CSS = `
.ric-select,
.ric-select::picker(select) {
  appearance: base-select;
}
.ric-select {
  display: flex;
  align-items: center;
  width: 100%;
  height: ${ch};
  padding: 0 ${px};
  border: ${b1};
  border-radius: ${r};
  background: ${ct};
  color: ${fg};
  font-size: 1em;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  transition: background 0.1s, border-color 0.15s, box-shadow 0.15s, filter 0.1s;
}
.ric-select:hover:not(:disabled) {
  background: ${bd};
  border-color: ${fm};
}
.ric-select:focus {
  background: ${ct};
  border-color: ${ac};
  box-shadow: 0 0 0 3px color-mix(in srgb, ${ac} 20%, transparent);
}
.ric-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ric-select::picker-icon {
  content: '❯';
  color: ${fm};
  font-size: 0.6em;
  rotate: 90deg;
  overflow: visible;
  margin-right: 2px;
  transition: rotate calc(${dur} * 2) ${eas};
}
.ric-select:open::picker-icon {
  rotate: 270deg;
}
.ric-select::picker(select) {
  background: ${ct};
  border: ${b1};
  border-radius: ${r};
  box-shadow: ${sh};
  padding: ${g};
  opacity: 0;
  transition: opacity calc(${dur} * 2) ${eas}, overlay calc(${dur} * 2) allow-discrete, display calc(${dur} * 2) allow-discrete;
}
.ric-select:open::picker(select) {
  opacity: 1;
  @starting-style {
    opacity: 0;
  }
}
.ric-select option {
  padding: ${py} ${px};
  border-radius: calc(${r} - 2px);
  color: ${fg};
  transition: background 0.1s;
}
.ric-select option:hover {
  background: ${bd};
}
.ric-select option:checked {
  background: ${ac};
  color: ${af};
}`;

const RADIOGROUP_CSS = `
.ric-radiogroup {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${g};
}
.ric-radio {
  display: inline-flex;
  align-items: center;
  gap: ${g};
  padding: ${py} ${px};
  border: 1px solid transparent;
  border-radius: ${r};
  cursor: pointer;
  user-select: none;
  font-size: 1em;
  color: ${fg};
  transition: background 0.1s, border-color 0.1s, filter 0.1s;
}
.ric-radio:hover {
  background: ${bd};
  border-color: ${fm};
}
.ric-radio:active {
  filter: brightness(0.88);
}
.ric-radio input[type="radio"] {
  width: 15px;
  height: 15px;
  margin: 0;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: ${ac};
}
.ric-radio__label {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}
.ric-radio--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ric-radio--disabled:hover {
  background: transparent;
  border-color: transparent;
}
.ric-radio--disabled:active {
  filter: none;
}
.ric-radio--disabled input[type="radio"] {
  cursor: not-allowed;
}`;

const RANGE_CSS = `
.ric-range {
  display: flex;
  align-items: center;
  gap: ${g};
  width: 100%;
  min-width: 0;
}
.ric-range input[type="range"] {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  accent-color: ${ac};
  height: ${ch};
}
.ric-range__value {
  font-size: 0.85em;
  color: ${fm};
  min-width: 32px;
  text-align: right;
  font-family: monospace;
  flex-shrink: 0;
}`;

const COLOR_CSS = `
.ric-color {
  display: flex;
  align-items: center;
  gap: ${g};
  width: 100%;
  min-width: 0;
}
.ric-color--rgba {
  flex-direction: column;
  align-items: stretch;
}
.ric-color__picker {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 2px;
  border: ${b1};
  border-radius: ${r};
  cursor: pointer;
  background: none;
  box-sizing: border-box;
}
.ric-color--rgba .ric-color__picker {
  width: 100%;
  flex: 0 0 auto;
}
.ric-color__alpha-row {
  display: flex;
  align-items: center;
  gap: ${g};
  min-width: 0;
}
.ric-color__alpha {
  flex: 1;
  min-width: 0;
  height: 20px;
  cursor: pointer;
  accent-color: ${ac};
}
.ric-color__value {
  font-size: 0.85em;
  color: ${fm};
  font-family: monospace;
  min-width: 54px;
  text-align: right;
  flex-shrink: 0;
}`;

const SEPARATOR_CSS = `
.ric-separator {
  border: none;
  border-top: ${b1};
  margin: ${g} 0;
}`;

const TEXT_CSS = `
.ric-text {
  font-size: 1em;
  line-height: 1.5;
}
.ric-text--muted {
  color: ${fm};
  font-size: 0.85em;
}
.ric-text--title {
  font-size: 1.25em;
  font-weight: 700;
  line-height: 1.3;
  margin: 0;
}
.ric-text--label {
  font-size: 0.85em;
  font-weight: 600;
  color: ${fm};
}`;

// アイコン: サイズ・色は uiIcon が inline (style width/height + currentColor) で持つので、
// ここでは整列と回転だけを担う。
//   vertical-align: -0.125em … テキスト隣接時のベースライン微調整
//   flex-shrink: 0           … ボタン/flex 内でアイコンが潰れないように
//   @keyframes ric-spin      … spin:true (spinner) 用
const ICON_CSS = `
.ric-icon {
  display: inline-block;
  vertical-align: -0.125em;
  flex-shrink: 0;
}
@keyframes ric-spin { to { transform: rotate(360deg); } }
.ric-icon--spin {
  animation: ric-spin 1.4s linear infinite;
}`;

const COL_CSS = `
.ric-col {
  display: flex;
  flex-direction: column;
  gap: ${gm};
}`;

const ROW_CSS = `
.ric-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: ${gm};
}`;

const GRID_CSS = `
.ric-grid {
  display: grid;
  gap: ${gm};
}`;

// v1 は make_css_vars 由来のテーマ上書き props を持ったが、v2 の uiPanel はそれを持たない
// (設計書 §13)。disabled の見た目 (opacity) は JS 側で inline style を計算せず、
// `inert` 属性が付いた panel に対する CSS セレクタで表現する。
const PANEL_CSS = `
.ric-panel {
  display: flex;
  flex-direction: column;
  gap: ${gm};
  color: ${fg};
  font-size: var(--ric-font-size, inherit);
  background: ${bg};
  border: ${b1};
  border-radius: ${r};
  padding: ${gm};
  backdrop-filter: ${bl};
  -webkit-backdrop-filter: ${bl};
  box-shadow: ${ps};
}
.ric-panel--row {
  flex-direction: row;
  align-items: center;
}
.ric-panel[inert] {
  opacity: 0.45;
}`;

const MD_PRE_CSS = `
.ric-md-pre {
  line-height: 1.7;
  color: ${fg};
  font-size: ${fs};
}
.ric-md-pre__h1 {
  font-size: 1.6em; font-weight: 700;
  margin: 0.8em 0 0.4em; padding-bottom: 0.2em;
  border-bottom: ${b1};
}
.ric-md-pre__h2 {
  font-size: 1.3em; font-weight: 700;
  margin: 0.7em 0 0.3em; padding-bottom: 0.15em;
  border-bottom: ${b1};
}
.ric-md-pre__h3 {
  font-size: 1.1em; font-weight: 700;
  margin: 0.6em 0 0.2em;
}
.ric-md-pre__p {
  margin: 0.5em 0;
}
.ric-md-pre__list {
  margin: 0.5em 0; padding-left: 1.5em;
}
.ric-md-pre__list li {
  margin: 0.2em 0;
}
.ric-md-pre__ol {
  margin: 0.5em 0; padding-left: 1.5em;
}
.ric-md-pre__ol li {
  margin: 0.2em 0;
}
.ric-md-pre__img {
  max-width: 100%;
  height: auto;
  border-radius: ${r};
}
.ric-md-pre__quote {
  margin: 0.5em 0; padding: 0.3em 0.8em;
  border-left: 3px solid ${ac};
  color: ${fm};
}
.ric-md-pre__fence {
  margin: 0.5em 0; padding: ${gm};
  background: ${cb}; color: ${cf};
  border: 1px solid color-mix(in srgb, ${fg} 6%, transparent);
  border-radius: ${r};
  overflow-x: auto;
  font-family: Consolas, "Cascadia Code", "Source Code Pro", Monaco, monospace;
  font-size: 0.85em; line-height: 1.6;
  white-space: pre;
}
.ric-md-pre__fence > code {
  display: block;
}
.ric-md-pre__fence > code.hljs {
  background: transparent; padding: 0; overflow: visible;
}
.ric-md-pre__code {
  padding: 0.15em 0.4em;
  background: color-mix(in srgb, ${fg} 8%, transparent);
  border-radius: 3px;
  font-family: Consolas, "Cascadia Code", "Source Code Pro", Monaco, monospace;
  font-size: 0.9em;
}
.ric-md-pre__link {
  color: ${ac}; text-decoration: none;
}
.ric-md-pre__link:hover {
  text-decoration: underline;
}
.ric-md-pre__hr {
  border: none; border-top: ${b1};
  margin: 1em 0;
}
.ric-md-pre__table {
  margin: 0.5em 0; border-collapse: collapse; width: auto;
  font-size: 0.95em;
}
.ric-md-pre__th {
  padding: 0.35em 0.8em; font-weight: 700;
  border-bottom: 2px solid ${bd};
  text-align: left; white-space: nowrap;
}
.ric-md-pre__td {
  padding: 0.3em 0.8em;
  border-bottom: ${b1};
}`;

const CODE_PRE_CSS = `
.ric-code-pre {
  margin: 0;
  padding: ${gm};
  background: ${cb};
  color: ${cf};
  border: 1px solid color-mix(in srgb, ${fg} 6%, transparent);
  border-radius: var(--ric-radius, 8px);
  overflow-x: auto;
  font-family: Consolas, "Cascadia Code", "Source Code Pro", Monaco, monospace;
  font-size: 0.85em;
  line-height: 1.6;
  white-space: pre;
}
.ric-code-pre:hover {
  scrollbar-color: color-mix(in srgb, ${cf} 40%, transparent) transparent;
}
.ric-code-pre > code {
  display: block;
}
.ric-code-pre > code.hljs {
  background: transparent;
  padding: 0;
  overflow: visible;
}`;

// ── 状態を持つ部品 (composite) ─────────────────────────

// scroll-pane はスクロールバー配色のみ提供する。挙動は inline style (overflow-y:auto)
// + JS の scrollTop 制御で担う (createScrollPane 参照)。
const SCROLL_PANE_CSS = `
.ric-scroll-pane {
  min-height: 0;
  scrollbar-color: ${sbt} transparent;
  scrollbar-width: thin;
}
.ric-scroll-pane::-webkit-scrollbar { width: 8px; height: 8px; }
.ric-scroll-pane::-webkit-scrollbar-thumb {
  background: ${sbt};
  border-radius: 4px;
}
.ric-scroll-pane::-webkit-scrollbar-track { background: transparent; }`;

// collapse-box は inline style の overflow/transition/width/height で動作するため
// (createCollapseBox 参照)、CSS 側はセマンティクスとしての class 名だけ用意する。
// consumer 側で .ric-collapse-box--entering/--closing を見て追加演出を載せたい場合に使う。
const COLLAPSE_BOX_CSS = `
.ric-collapse-box {
  display: block;
}`;

const SPLITTER_CSS = `
.ric-splitter { overflow: hidden; }
.ric-splitter__side {
  flex-shrink: 0;
  overflow: hidden;
}
.ric-splitter__main { flex: 1; overflow: auto; min-width: 0; min-height: 0; }
.ric-splitter__divider {
  flex: 0 0 5px;
  background: ${bd};
  display: flex; align-items: center; justify-content: center;
  position: relative;
  transition: background 0.15s;
  user-select: none;
  z-index: 1;
}
.ric-splitter__divider:focus-visible { outline: 2px solid ${ac}; outline-offset: -2px; }
/* variant クラスは直接の divider にのみ効かせる (子孫セレクタだと、外側 vertical
   splitter の中の内側 horizontal splitter の divider にも漏れるため > で 1 階層に限定) */
.ric-splitter--horizontal > .ric-splitter__divider { cursor: col-resize; }
.ric-splitter--vertical   > .ric-splitter__divider { cursor: row-resize; }
.ric-splitter--collapsed  > .ric-splitter__divider { cursor: pointer; }
.ric-splitter__divider:hover,
.ric-splitter__divider--dragging { background: ${ac}; }
.ric-splitter__collapse-btn {
  position: absolute;
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: 20px; height: 40px; padding: 0;
  background: ${bg};
  border: ${b1};
  border-radius: 10px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; color: ${fm};
  z-index: 2;
  opacity: 0;
  transition: opacity 0.15s, background 0.1s, color 0.1s, border-color 0.1s;
}
.ric-splitter--vertical > .ric-splitter__divider > .ric-splitter__collapse-btn {
  width: 40px; height: 20px; border-radius: 10px;
}
.ric-splitter:hover > .ric-splitter__divider > .ric-splitter__collapse-btn,
.ric-splitter__divider--dragging > .ric-splitter__collapse-btn { opacity: 1; }
.ric-splitter__collapse-btn:hover {
  background: ${ac};
  color: ${af};
  border-color: ${ac};
}
.ric-splitter__divider:hover > .ric-splitter__collapse-btn,
.ric-splitter__divider--dragging > .ric-splitter__collapse-btn {
  border-color: ${af};
}`;

const ACCORDION_CSS = `
.ric-accordion {
  display: flex; flex-direction: column;
  border: ${b1};
  border-radius: ${r};
  overflow: hidden;
}
.ric-accordion__item + .ric-accordion__item {
  border-top: ${b1};
}
.ric-accordion__header {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: ${py} ${px};
  background: ${bg};
  border: none; cursor: pointer;
  font-size: 1em; color: ${fg}; font-weight: 500;
  text-align: left; user-select: none;
  transition: background ${da};
}
.ric-accordion__header:hover, .ric-accordion__header--open { background: ${bd}; }
.ric-accordion__title { flex: 1; text-align: left; }
.ric-accordion__arrow { color: ${fm}; margin-left: ${g}; transition: transform ${da}; }
.ric-accordion__header--open .ric-accordion__arrow { transform: rotate(180deg); }
/* grid-template-rows のトリックで auto 高さに対してアニメーションする。
   閉じ: 0fr → 開き: 1fr (子要素は min-height:0 + overflow:hidden が必須) */
.ric-accordion__body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows ${da};
}
.ric-accordion__body--open {
  grid-template-rows: 1fr;
}
.ric-accordion__body-inner {
  min-height: 0;
  overflow: hidden;
}
.ric-accordion__body--open > .ric-accordion__body-inner {
  padding: ${gm} ${px};
  background: ${bg};
  border-top: ${b1};
}`;

const TABS_CSS = `
.ric-tabs { display: flex; flex-direction: column; gap: ${g}; width: 100%; }
.ric-tabs__bar {
  display: flex;
  flex-shrink: 0;
  border-bottom: ${b1};
}
.ric-tabs__tab {
  padding: ${g} ${px};
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  font-size: 1em;
  color: ${fm};
  white-space: nowrap;
  transition: color 0.15s, border-bottom-color 0.15s, background 0.15s;
}
.ric-tabs__tab:hover { color: ${fg}; background: color-mix(in srgb, ${fg} 8%, transparent); }
.ric-tabs__tab:focus-visible { outline: 2px solid ${ac}; outline-offset: -2px; }
.ric-tabs__tab--active {
  color: ${ac};
  border-bottom-color: ${ac};
  background: color-mix(in srgb, ${fg} 10%, transparent);
  font-weight: 600;
}
.ric-tabs__panel { flex: 1; overflow: auto; min-height: 0; }
.ric-tabs__panel:focus-visible { outline: 2px solid ${ac}; outline-offset: -2px; }
.ric-tabs--pill .ric-tabs__bar {
  border-bottom: none;
  background: ${bg};
  border-radius: ${r};
  padding: 3px;
  gap: 2px;
  align-self: flex-start;
}
.ric-tabs--pill .ric-tabs__tab {
  border-bottom: none;
  border-radius: calc(${r} - 2px);
  margin-bottom: 0;
}
.ric-tabs--pill .ric-tabs__tab--active {
  background: ${ac};
  color: ${af};
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}`;

// createDropdown (v1 create_ui_popup の label/icon/chevron モード後継)。トリガーの
// 見た目は v1 の .ric-popup__trigger* を移植して `.ric-dropdown__trigger*` に改名した
// (createPopup の menu 専用トリガーは .ric-button を流用しており名前が衝突しないため)。
// 本体の開閉アニメ (@keyframes ric-popup-in/out) とオーバーレイ (.ric-popup__overlay) は
// POPUP_CSS で既に定義済みのものをそのまま再利用する (buildStylesheet が両方を結合する
// ため、同じスタイルシート内で参照できる。重複定義しない)。
const DROPDOWN_CSS = `
.ric-dropdown__trigger {
  width: ${ch}; height: ${ch};
  border-radius: ${r};
  background: ${ct}; border: ${b1};
  cursor: pointer; font-size: 18px; color: ${fg};
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.ric-dropdown__trigger:hover { border-color: ${ac}; }
.ric-dropdown__trigger--label {
  width: auto; justify-content: space-between;
  padding: 0 ${px};
  font-size: 1em;
}
.ric-dropdown__trigger--ghost { border-color: transparent; background: transparent; }
.ric-dropdown__trigger--ghost:hover { border-color: ${bd}; background: ${ct}; }
.ric-dropdown__trigger--open {
  background: ${ac}; color: ${af};
  border-color: ${ac};
}
.ric-dropdown__chevron { transition: transform 0.2s ${eas}; opacity: 0.7; }
.ric-dropdown__chevron--open { transform: rotate(180deg); }
.ric-dropdown__body {
  /* createDropdown 新設時 (Phase 3b) からの欠落。.ric-popup__body は position:fixed を
     持つが、こちらは持たないまま inline の top/left/bottom (dropdown.ts の computePos)
     を当てていたため static のまま無視され、本体が portal 内の通常フローに並んでいた —
     target が display:flex; flex-direction:column だとページ本体がその分押し込まれる
     実機バグ (#9)。alpha.3 で .ric-popup__body と揃えて修正。 */
  position: fixed;
  z-index: 401; /* LCP #1、2.0.0-alpha.9: .ric-popup__body/overlay と同じ序列に揃える */
  min-width: 160px;
  background: ${ct};
  border: ${b1};
  border-radius: ${r};
  box-shadow: ${sh};
  overflow: auto;
  padding: ${gm};
}`;

// portal を持たない軽量ポップオーバー (createPopup/createDropdown と違い overlay も
// アニメーションも持たない、v1 継承)。
const INLINE_MENU_CSS = `
.ric-inline-menu {
  background: ${ct};
  border: ${b1};
  border-radius: ${r};
  padding: 4px;
  box-shadow: ${sh};
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ric-inline-menu .ric-button {
  justify-content: flex-start;
  text-align: left;
}`;

// ── ric-tweak (パラメータ調整パネル) ──
// v1 (ric_ui/css_templates.js の ric-tweak/ric-tweak-row/ric-tweak-folder) の移植。
// folder は v1 のネイティブ <details> (::before の三角形 + rotate) を廃止し、
// createAccordion と同じ <button> + grid-template-rows トリックに置き換えた
// (tweakPanel.ts のヘッダコメント参照)。
const TWEAK_CSS = `
.ric-tweak {
  display: flex;
  flex-direction: column;
  color: ${fg};
  background: ${bg};
  border: ${b1};
  border-radius: ${r};
  padding: ${g} 0;
  user-select: none;
  overflow: hidden;
  box-sizing: border-box;
}
.ric-tweak__title {
  font-size: 1em;
  font-weight: bold;
  color: ${fg};
  padding: ${g} ${gm};
  margin-bottom: ${g};
  border-bottom: ${b1};
}
.ric-tweak-row {
  display: flex;
  align-items: center;
  gap: ${g};
  padding: ${g} ${gm};
  min-width: 0;
  border: none;
  margin: 0;
}
.ric-tweak-row:hover {
  background: color-mix(in srgb, ${fg} 6%, transparent);
}
.ric-tweak-row__label {
  width: 80px;
  flex-shrink: 0;
  font-size: 0.85em;
  color: ${fm};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;
}
/* checkbox 行は ui_checkbox 内蔵ラベルを使うため __label を持たない。
   通常行とトーンを揃えるため、内部の .ric-checkbox にも同じ色・サイズを適用する。 */
.ric-tweak-row--checkbox .ric-checkbox {
  font-size: 0.85em;
  color: ${fm};
}
/* radiobutton 行は <fieldset> (a11y 上、複数選択肢のグループ化は <label> ではなく
   fieldset/legend が正しい、tweakPanel.ts 参照) */
.ric-tweak-row--radiobutton {
  align-items: flex-start;
}
.ric-tweak-row > .ric-input,
.ric-tweak-row > .ric-range,
.ric-tweak-row > .ric-select,
.ric-tweak-row > .ric-color {
  flex: 1;
  min-width: 0;
}
.ric-tweak-row__json {
  flex: 1;
  margin: 0;
  padding: ${g} 5px;
  background: ${bg};
  border: ${b1};
  border-radius: ${r};
  font-size: 0.75em;
  font-family: monospace;
  color: ${fm};
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 80px;
  overflow-y: auto;
  box-sizing: border-box;
}
.ric-tweak-folder {
  border-top: ${b1};
}
.ric-tweak-folder__header {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: ${g} ${gm};
  background: ${bg};
  border: none; cursor: pointer;
  font-size: 0.9em; font-weight: 600; color: ${fg};
  text-align: left; user-select: none;
  transition: background ${da};
}
.ric-tweak-folder__header:hover, .ric-tweak-folder__header--open { background: color-mix(in srgb, ${fg} 6%, transparent); }
.ric-tweak-folder__label { flex: 1; text-align: left; }
.ric-tweak-folder__arrow { color: ${fm}; margin-left: ${g}; transition: transform ${da}; }
.ric-tweak-folder__header--open .ric-tweak-folder__arrow { transform: rotate(180deg); }
/* grid-template-rows のトリックで auto 高さに対してアニメーションする (createAccordion と同じ) */
.ric-tweak-folder__body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows ${da};
}
.ric-tweak-folder__body--open {
  grid-template-rows: 1fr;
}
.ric-tweak-folder__body-inner {
  min-height: 0;
  overflow: hidden;
}
.ric-tweak-folder__body--open > .ric-tweak-folder__body-inner {
  display: flex;
  flex-direction: column;
}`;

// ── ricdom/md-editor (opt-in サブパス) ──
// 本体の実装 (createMdEditor/tokenizeMarkdown) は `ricdom/md-editor` サブパス
// (src/mdEditor/) にあり、`ricdom/ui` の IIFE (dist/ricdom-ui.iife.min.js) には一切
// 含まれない。ここに CSS だけを置くのは「CSS は 1 枚」の canon のため — consumer は
// 既に読み込んでいる ricdom-ui.css をそのまま使い続けられる。
//
// **文字幅不変の原則 (SPEC 参照)**: 本物の `<textarea>` (透明文字) の後ろに
// `<pre aria-hidden>` のミラーを重ね、Markdown の色分けをミラー側の span に適用する
// 構成 (createMdEditor 参照)。ミラーの折返し位置が textarea と 1px でもずれるとキャレット
// 位置と表示が食い違うため、トークンの色分けクラス (.ric-md-*) は
// color/background-color/text-decoration/text-shadow/opacity/border-radius **だけ**を
// 使うこと — font-weight/font-style/font-family/font-size/letter-spacing/padding は
// 実際のグリフ幅を変えてしまうため禁止 (`**strong**` が text-shadow の縁取りで
// 「それっぽい太字」を表現しているのはこのため)。
//
// `.ric-md-editor__mirror` の `box-sizing: border-box` は mdEditor.ts の applyLayout() が
// 同じ値をインラインで強制するが、script 実行前の一瞬の保険として CSS 側にも静的に書く —
// textarea 自身の box-sizing (既定 content-box) に関わらず、ミラーは常に border-box 前提で
// width/height を計算する (統括の独立検証で発見した実装の穴、2026-09-17)。
// `.ric-md-editor` の `display: flex; flex-direction: column`（alpha.17、alpha.16 では
// `display: block` だった）: textarea は通常の flow では「行内要素のベースライン直下の
// 隙間」分だけラッパーの content box をはみ出す — consumer が `wrapperStyle: { height }`
// + textarea 側 `style: { height: '100%' }` でラッパーを flex item として伸縮させようと
// すると、textarea の実測高さがラッパーより約 18px 高くなる回帰が実際にあった
// (Raccoon Memo 追報 4、2026-09-17。tests/browser/uiMdEditor.test.ts のこの回帰ガードを
// 一時的に `display: block` へ戻して確認 → 実際に RED [18px 差] になった)。textarea 自体に
// `flex: 1` は強制しない (rows/autoResize が決める高さを尊重するため) — ラッパーを flex
// コンテナにするだけで、`flex-direction: column` の既定 `align-items: stretch` により
// textarea はブロック要素と同じ幅いっぱいのまま、上記の隙間だけが消える。
// ※ テンプレートリテラルの中に CSS コメントを書くと配布 CSS と ui バンドルにそのまま
//    乗る (gzip +約 280B を実測) ので、説明はこの JS コメントに置く。
const MD_EDITOR_CSS = `
.ric-md-editor {
  position: relative;
  display: flex;
  flex-direction: column;
}
.ric-md-editor__mirror {
  position: absolute;
  top: 0; left: 0;
  margin: 0;
  overflow: hidden;
  pointer-events: none;
  color: ${fg};
  background: ${ct};
  border-color: transparent;
  border-style: solid;
  border-radius: ${r};
  box-sizing: border-box;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  z-index: 0;
}
.ric-md-editor .ric-md-editor__input {
  position: relative;
  z-index: 1;
  background: transparent;
  color: transparent;
  caret-color: ${fg};
}
.ric-md-editor .ric-md-editor__input:hover:not(:disabled),
.ric-md-editor .ric-md-editor__input:focus {
  background: transparent;
}
.ric-md-editor .ric-md-editor__input::placeholder {
  color: ${fm};
}
.ric-md-heading { color: ${mdh}; }
.ric-md-marker { color: ${mdm}; }
.ric-md-strong { color: ${mde}; text-shadow: 0 0 0.6px currentColor; }
.ric-md-em { color: ${mde}; }
.ric-md-strike { text-decoration: line-through; color: ${mdm}; }
.ric-md-link { color: ${mdl}; }
.ric-md-url { color: ${mdu}; }
.ric-md-code, .ric-md-fence { background: ${mdcb}; border-radius: 2px; }
.ric-md-fence-marker { color: ${mdm}; }
.ric-md-quote { color: ${mdq}; }
.ric-md-hr { color: ${mdm}; }
.ric-md-meta { color: ${mdmeta}; }`;

// CSS 読込検知 (`warnIfStylesMissing`、パイロット第 9 号 = Potopeta からの報告、
// 2.0.0-alpha.10) 用の識別コメント。`buildStylesheet()` の出力先頭に固定で入る。
// 検知の本体は `document.styleSheets` を走査して `.ric-button` 規則の実在を見る方式
// (injectStyles.ts 参照) — こちらはあくまで人間が生 CSS を眺めたときの目印。
// minify で消えないよう `/*! ... */` 形式にする (多くの minifier は `!` 付きコメントを
// 保持する規約に従う。buildStylesheet の出力自体は本プロジェクトでは minify しないが、
// consumer 側が自前で CSS を minify して単一ファイルに埋め込むケースを想定した保険)。
const STYLESHEET_MARKER_COMMENT = '/*! ricdom-ui */';

/**
 * ricdom/ui の CSS 1 枚分の文字列を組み立てる (設計書 §4)。
 * `injectStyles()` (実行時注入) と `dist/ricdom-ui.css` 生成スクリプト
 * (`scripts/build-css.mjs`) の両方から、同じ関数を単一ソースとして使う。
 */
export const buildStylesheet = (): string =>
  [
    STYLESHEET_MARKER_COMMENT,
    BUTTON_CSS,
    INPUT_CSS,
    DIALOG_CSS,
    POPUP_CSS,
    TOAST_CSS,
    TOOLTIP_CSS,
    THEME_PAINT_CSS,
    SCROLLBAR_CSS,
    PORTAL_CSS,
    TEXTAREA_CSS,
    CHECKBOX_CSS,
    SELECT_CSS,
    RADIOGROUP_CSS,
    RANGE_CSS,
    COLOR_CSS,
    SEPARATOR_CSS,
    TEXT_CSS,
    ICON_CSS,
    COL_CSS,
    ROW_CSS,
    GRID_CSS,
    PANEL_CSS,
    MD_PRE_CSS,
    CODE_PRE_CSS,
    SCROLL_PANE_CSS,
    COLLAPSE_BOX_CSS,
    SPLITTER_CSS,
    ACCORDION_CSS,
    TABS_CSS,
    DROPDOWN_CSS,
    INLINE_MENU_CSS,
    TWEAK_CSS,
    MD_EDITOR_CSS,
  ].join('\n');
