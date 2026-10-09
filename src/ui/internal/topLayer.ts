// ricdom/ui — アプリ専用 portal を top layer に上げる (SPEC §7 FACT、設計書 §45、2.0.0-alpha.26)
//
// 浮遊部品 (dialog / popup / dropdown / toast / tooltip) は、どれもアプリ専用の portal 要素
// (`[data-ricdom-role="portal"]`、core の createApp が target の末尾に置く) に描画し、
// 自分自身は `position: fixed` で画面に置く。ところが CSS 仕様上、祖先に transform /
// filter / backdrop-filter / contain / will-change 等があると、子孫の `position: fixed` は
// viewport ではなくその祖先を基準にする。アプリを磨りガラスのナビバーや transform の箱の
// 中にマウントすると、dialog が画面外にずれ、幕が画面を覆わず、popup がトリガーから離れた
// (オーナー報告 2026-10-09。v1 も dialog は同じ構造で、popup/tooltip だけ祖先を探して座標を
// 補正していた)。
//
// 解決: portal 要素を Popover API (`popover="manual"`) で top layer に上げる。top layer の
// 要素は祖先の containing block・overflow・z-index のどれの影響も受けず、その中の
// `position: fixed` は常に viewport 基準になる。DOM 上の位置は変わらないので、テーマの
// CSS 変数の継承、dialog の inert 化 (portal の兄弟を inert にする)、フォーカス順はそのまま。
//
// なぜネイティブ `<dialog>.showModal()` ではないか: モーダル中は dialog の外の要素が
// すべて inert になる。dialog の中から開いた dropdown / popup は同じ portal の「dialog の外」
// に描画されるため、見えるのにクリックできなくなる。popover="manual" は top layer に入る
// だけで inert も light dismiss も Escape も持たないので、既存の挙動 (自前の focus trap /
// Escape / 外側クリック / z-index の序列 toast > dialog > popup) を一切変えずに済む。
//
// 上げる対象は「自前 portal」だけ (`data-ricdom-role="portal"` を持つ要素)。`portalTo` で
// consumer が渡した外部要素は consumer の配置の管理下にあるので触らない — popover 属性を
// 付けると UA スタイル (fixed / 中央寄せ / 枠線 / CanvasText) で consumer のレイアウトが
// 壊れるため。portal 要素の UA スタイルの打ち消しは ricdom-ui.css の PORTAL_CSS が担う
// (幅 0・高さ 0 の fixed 箱 = 画面のクリックを一切奪わない)。
//
// Popover API が無い環境 (jsdom、2024 年以前のブラウザ) では何もしない = 従来どおりの
// fixed 配置にフォールバックする。

type PopoverCapable = HTMLElement & { showPopover?: () => void };

/**
 * 自前 portal を top layer に上げる。毎 render 呼んでよい (既に上がっていれば何もしない)。
 * portal が DOM から外れて再接続された場合 (app を別の親へ移した等) も、次の呼び出しで
 * 上げ直す — 切断で popover は自動的に閉じるため。
 */
export const promotePortalToTopLayer = (portal: Element | null | undefined): void => {
  const el = portal as PopoverCapable | null | undefined;
  if (!el || typeof el.showPopover !== 'function') return; // Popover API 非対応 (jsdom 等)
  if (el.getAttribute('data-ricdom-role') !== 'portal') return; // portalTo の外部要素は触らない
  if (!el.isConnected) return; // 未接続の要素に showPopover すると InvalidStateError
  if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
  if (el.matches(':popover-open')) return;
  try {
    el.showPopover();
  } catch {
    // 祖先が切り替わる瞬間などに InvalidStateError が出うる。次の render で再試行される。
  }
};
