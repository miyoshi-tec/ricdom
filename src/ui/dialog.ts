// ricdom/ui — createDialog (設計書 §3.4 部品契約 + §5/付録 E a11y)
//
// v1 (ric_ui/popup/create_ui_dialog.js) の移植+ a11y の新規実装。v1 との相違点:
//   - `s.dlg = create_ui_dialog()` (state トップレベル配置で暗黙注入) ではなく
//     `const dlg = app.use(createDialog())` で明示登録する (設計書 §3.4)。
//   - portal は v1 の `_page_portal_queue` (page が drain) ではなく、host.portal
//     (この app 専用の portal 要素) に `renderPortal()` で描画する (設計書 §3.5)。
//   - a11y を新規実装: role="dialog" + aria-modal + aria-labelledby/describedby、
//     開いたら最初の focusable にフォーカス、Tab/Shift+Tab の focus trap、Esc で閉じて
//     起動元へフォーカス復帰、背景を inert (付録 E)。
//   - 初期フォーカスは「既に dialog 内にフォーカスがある (createFocusWhen 等) なら
//     何もしない」→「[autofocus] があれば最優先」→「本文 (dialog-body) 内の最初の
//     focusable」→「フッター (dialog-footer/actions) 内の最初の focusable」→
//     「ヘッダの ✕ (close ボタン)」→「root」の順 (#12 で新設、LCP #4 で本文/フッター優先に
//     変更、2.0.0-alpha.9。focusFirstElement 参照)。旧順序 (#12、2.0.0-alpha.3) は
//     単純に「DOM 順で最初の focusable」= 常にヘッダの ✕ だった — ✕ は「閉じる」
//     ボタンであり、開いた直後にそこへフォーカスリングが付く/スクリーンリーダーが
//     真っ先に「閉じる」を読み上げるのは、ダイアログの主目的 (本文の確認・入力・
//     アクション選択) と噛み合わないという報告 (LCP #4、Trend Guard でも同種の体験報告)。
//     DialogProps.initialFocus は新設しない — autofocus 属性と createFocusWhen で
//     表現できるため、canon 1 つの方針を維持する。
//
// 3 つの使い方 (v1 継承):
//   (1) uncontrolled + 自動トリガー: dlg({ triggerChildren: ['開く'], title, children, actions })
//       → 戻り値は trigger ボタンの RicNode。
//   (2) uncontrolled + 自前トリガー: dlg({ title, children }) (triggerChildren 省略) → 戻り値は null。
//       dlg.open() / dlg.close() / dlg.isOpen() で外部制御する。
//   (3) controlled: dlg({ open: s.show, onClose: (reason) => { s.show = false; }, title, children })
//       → 戻り値は null。triggerChildren と併用禁止 (console.error)。

import type { RicNode } from '../types.js';
import { ANIMATION_FALLBACK_MS, type AttachGuard, type Component, createAttachGuard } from './internal/component.js';
import type { UiButtonVariant } from './button.js';
import { UI_ROLE } from './internal/pureHelpers.js';

export type DialogCloseReason = 'overlay' | 'close-button' | 'escape' | 'api';

export interface DialogProps {
  /** uncontrolled + 自動トリガーのときのボタン中身。省略すると trigger ボタンを出さない。 */
  triggerChildren?: RicNode | RicNode[];
  /** 自動トリガーボタンの見た目 (uiButton と同じ variant、v1 `create_ui_dialog.js` の
   *  `trigger_variant` 継承、v1→v2 パリティ一括監査 #4)。既定 'primary' (v1 と同じ)。
   *  triggerChildren を渡さない場合は無視される。 */
  triggerVariant?: UiButtonVariant;
  title?: string;
  children?: RicNode | RicNode[];
  /** フッターに並べるボタン等 */
  actions?: RicNode[];
  /** controlled mode の開閉状態。指定すると controlled になる。 */
  open?: boolean;
  /** controlled mode の close 通知。reason で発生源を分岐できる (v1 A18 継承)。 */
  onClose?: (reason: DialogCloseReason) => void;
  /** ダイアログ幅 (px 数値 or 任意の CSS 長さ文字列)。省略時は CSS 既定 (min(360px,90vw))。 */
  width?: number | string;
  /**
   * controlled mode でのフォーカス復帰先の制御 (パイロット移行の報告 #4)。省略時は
   * APG どおり「開く直前の `document.activeElement`」へ復帰する。フォーカス不可能な
   * 起動元 (span 等) 経由で開いた場合、既定では「開く直前にたまたまフォーカスされていた
   * 無関係な要素」(例: 直前に触っていた数値入力) へ復帰してしまう — `false` を指定すると
   * 復帰処理そのものを行わない (`document.body` へ明示的にフォーカスを逃がすのではなく、
   * 単に何もしない。dialog の DOM が消えることで activeElement は自然に body になる)。
   * `Element` を指定すると、その要素へ明示的に復帰する。uncontrolled の `open()` にも
   * 同名オプションがある (`DialogOpenOptions`)。
   */
  returnFocus?: false | Element;
}

/** `dlg.open(opts)` に渡せるオプション (uncontrolled モード)。`DialogProps.returnFocus` の
 *  uncontrolled 版 — 意味は同じ (§ 上記 JSDoc 参照)。 */
export interface DialogOpenOptions {
  returnFocus?: false | Element;
}

export interface DialogInstance extends Component<DialogProps> {
  /** 外部から開く (uncontrolled のみ。controlled では no-op) */
  open(opts?: DialogOpenOptions): void;
  /** 外部から閉じる (両モード対応。未 open での呼出は no-op)。既定 reason は 'api'。 */
  close(reason?: DialogCloseReason): void;
  /** uncontrolled モードで現在表示中か (controlled では常に false、v1 継承) */
  isOpen(): boolean;
}

let nextDialogId = 0;

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// 可視要素フィルタ (§14 追補): `disabled` / `tabindex="-1"` は上記セレクタで既に除外済みだが、
// `display:none` の祖先を持つ・`visibility:hidden` 等で「セレクタは通るが実際には
// フォーカスできない」要素は focus trap がそのまま踏んでしまう (実ブラウザで
// Tab 循環が見えない要素で止まる/飛ばない不具合になる)。`offsetParent !== null` は
// 大半のケースを安価に判定できるが `position:fixed` の要素は offsetParent が常に
// null になる (仕様上の既知の癖) ため、`getClientRects().length > 0` の OR で
// 救う (fixed 配置の focusable を誤って弾かない)。
const isVisible = (el: HTMLElement): boolean => el.offsetParent !== null || el.getClientRects().length > 0;

// jsdom はレイアウトエンジンを持たず、あらゆる要素が (実際には見えていても)
// offsetParent=null・getClientRects()=[] を返す。isVisible をそのまま適用すると
// 既存の jsdom 単体テスト (tests/ui/dialog.test.ts) が「フォーカス可能要素が
// 1 つも無い」判定になり壊れる。`document.body` 自身の getClientRects() が
// 空かどうかでレイアウトエンジンの有無を検出し、無ければ (jsdom) フィルタを
// スキップして v1 と同じ挙動を保つ。可視要素フィルタの実効果は
// tests/browser/ (実ブラウザ、レイアウトあり) でのみ検証できる。
const hasLayoutEngine = (doc: Document | null): boolean => !!doc?.body && doc.body.getClientRects().length > 0;

const getFocusables = (root: Element): HTMLElement[] => {
  const all = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return hasLayoutEngine(root.ownerDocument) ? all.filter(isVisible) : all;
};

// フォーカス復帰先の決定 (パイロット移行の報告 #4)。`explicit` が:
//   - `false`      … 復帰しない (null を返す。呼び出し側は既存の「restoreFocusEl が
//                     null なら .focus() を呼ばない」分岐にそのまま乗るので、実装は
//                     ここだけで完結する — dialog が閉じて DOM から外れれば
//                     activeElement は自然に document.body になる)
//   - `Element`    … その要素へ明示的に復帰する
//   - 未指定        … 既定 (APG どおり) の「開く直前の document.activeElement」
const resolveRestoreFocus = (explicit?: false | Element): HTMLElement | null => {
  if (explicit === false) return null;
  if (explicit !== undefined) return explicit as HTMLElement;
  return (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null) ?? null;
};

/**
 * モーダルダイアログを作る。状態を持つため `app.use(createDialog())` で登録する。
 *   const dlg = app.use(createDialog());
 *   dlg({ triggerChildren: ['Open'], title: 'Confirm', children: ['Really?'] })
 */
export const createDialog = (): DialogInstance => {
  const id = ++nextDialogId;
  const dialogRoleAttr = `ricdom-dialog-${id}`;
  const titleId = `ricdom-dialog-title-${id}`;
  const bodyId = `ricdom-dialog-body-${id}`;
  const guard: AttachGuard = createAttachGuard('createDialog', { topLayer: true });

  // 内部状態 (v1 継承の短縮名は付けず、素直な名前にする)
  let isOpenInternal = false; // uncontrolled 用
  let isClosing = false;
  let prevControlledOpen: boolean | undefined;
  let isControlledLast = false;
  let onCloseLast: ((reason: DialogCloseReason) => void) | undefined;
  let escBound = false;
  let inertedSiblings: Element[] = [];
  let restoreFocusEl: HTMLElement | null = null;
  let widthLast: number | string | undefined;
  let titleLast = '';
  let bodyChildrenLast: RicNode | RicNode[] = [];
  let actionsLast: RicNode[] = [];

  const getDialogRootEl = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-dialog-id="${dialogRoleAttr}"]`));

  const setInert = (on: boolean): void => {
    if (!guard.host) return;
    if (on) {
      const parent = guard.host.portal.parentElement;
      if (!parent) return;
      inertedSiblings = Array.from(parent.children).filter((el) => el !== guard.host!.portal && !(el as HTMLElement).inert);
      for (const el of inertedSiblings) (el as HTMLElement).inert = true;
    } else {
      for (const el of inertedSiblings) (el as HTMLElement).inert = false;
      inertedSiblings = [];
    }
  };

  const focusFirstElement = (): void => {
    const root = getDialogRootEl();
    if (!root) return;
    // 既に dialog 内にフォーカスがある (createFocusWhen や consumer が open 直後の
    // render で focus 済み) なら尊重して何もしない (#12)。`active === root` は root 自身
    // へのフォールバック focus 状態 (このメソッドが前回、focusables が空で root.focus() した
    // 結果) なので「dialog 内にフォーカスがある」とはみなさず、続けて最初の要素へ移す —
    // そうしないと (今回 focusables が非空になっていても) 一生 root に留まってしまう。
    const active = document.activeElement;
    if (active && active !== root && root.contains(active)) return;

    // [autofocus] を持つ可視 focusable を最優先する (HTML 標準の autofocus 属性を
    // dialog が尊重する形。native <dialog> の focusing steps と同じ考え方、#12)。
    // ここだけは本文/フッター/✕ の優先順位より先に判定する — dialog 内のどこにあっても
    // consumer が明示的に「ここへ」と指定した意思を尊重するため。
    const allFocusables = getFocusables(root); // Tab トラップ (handleKeydown) と同じ DOM 順一覧
    const autofocusTarget = allFocusables.find((el) => el.hasAttribute('autofocus'));
    if (autofocusTarget) {
      autofocusTarget.focus();
      return;
    }

    // 初期フォーカス優先順位 (LCP #4、2.0.0-alpha.9): 本文 → フッター → ヘッダの ✕ → root。
    // 「DOM 順で最初の focusable」(= 常にヘッダの ✕) だった旧順序をやめ、ダイアログの
    // 主目的である本文の操作を優先する。Tab トラップの循環順序 (allFocusables、DOM 順=
    // [close, body..., footer...]) 自体は変更しない — 変わるのは「開いた瞬間にどこへ
    // 置くか」だけ。
    const bodyEl = root.querySelector<HTMLElement>(`#${bodyId}`);
    const bodyFirst = bodyEl ? getFocusables(bodyEl)[0] : undefined;
    if (bodyFirst) {
      bodyFirst.focus();
      return;
    }
    const footerEl = root.querySelector<HTMLElement>(`[data-ricdom-role="${UI_ROLE.dialogFooter}"]`);
    const footerFirst = footerEl ? getFocusables(footerEl)[0] : undefined;
    if (footerFirst) {
      footerFirst.focus();
      return;
    }
    const closeEl = root.querySelector<HTMLElement>('.ric-dialog__close');
    (closeEl ?? root).focus();
  };

  // 実 CSS アニメーション (ric-dlg-in の animationend) を初期フォーカスの合図にするが、
  // consumer が ricdom-ui.css を読み込み忘れている等でアニメーションが一切走らない
  // 場合、animationend は永久に発火しない。ANIMATION_FALLBACK_MS 後のタイマーを
  // 併設し、どちらか早い方でフォーカスする (「2 回呼ばれても安全」にするため
  // hasFocusedThisOpen で 1 回だけに制限する。既にフォーカス済みなら遅れて発火した
  // 方は何もしない — 例えばユーザーが既に Tab で移動した先を奪わないため)。
  let hasFocusedThisOpen = false;
  const focusFirstElementOnce = (): void => {
    if (hasFocusedThisOpen) return;
    hasFocusedThisOpen = true;
    focusFirstElement();
  };
  const scheduleInitialFocus = (): void => {
    hasFocusedThisOpen = false;
    if (typeof setTimeout !== 'undefined') setTimeout(focusFirstElementOnce, ANIMATION_FALLBACK_MS);
  };

  const handleEntranceAnimationEnd = (ev: AnimationEvent): void => {
    if (ev.animationName !== 'ric-dlg-in') return;
    focusFirstElementOnce();
  };

  // handleExitAnimationEnd は「まだ closing 中なら片付ける」冪等な処理なので、実
  // animationend と ANIMATION_FALLBACK_MS のフォールバックタイマーの両方から
  // 安全に呼べる (どちらか早い方が実行され、後発は isClosing が既に false になっていて no-op)。
  const handleExitAnimationEnd = (): void => {
    if (!isClosing) return;
    if (!isControlledLast) isOpenInternal = false;
    isClosing = false;
    setInert(false);
    if (restoreFocusEl && typeof restoreFocusEl.focus === 'function') restoreFocusEl.focus();
    restoreFocusEl = null;
    guard.host?.notify();
  };

  const beginClose = (): void => {
    if (isClosing) return;
    isClosing = true;
    guard.host?.notify();
    if (typeof setTimeout !== 'undefined') setTimeout(handleExitAnimationEnd, ANIMATION_FALLBACK_MS);
  };

  const requestClose = (reason: DialogCloseReason): void => {
    if (isClosing) return;
    if (!isControlledLast && !isOpenInternal) return; // uncontrolled で未 open は no-op (冪等)
    if (isControlledLast) {
      onCloseLast?.(reason);
    } else {
      beginClose();
    }
  };

  const handleKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      requestClose('escape');
      return;
    }
    if (ev.key !== 'Tab') return;
    const root = getDialogRootEl();
    if (!root) return;
    const focusables = getFocusables(root);
    if (focusables.length === 0) {
      ev.preventDefault();
      root.focus();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    if (ev.shiftKey) {
      if (active === first || !root.contains(active)) {
        ev.preventDefault();
        last.focus();
      }
    } else if (active === last || !root.contains(active)) {
      ev.preventDefault();
      first.focus();
    }
  };

  const inst = ((props: DialogProps = {}): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    const { triggerChildren, triggerVariant = 'primary', title = '', children = [], actions = [], open, onClose, width, returnFocus } = props;

    const controlled = open !== undefined;
    if (controlled && 'triggerChildren' in props) {
      console.error('RicDOM UI: createDialog は open と triggerChildren を併用できません。controlled mode では triggerChildren は無視されます。');
    }

    isControlledLast = controlled;
    onCloseLast = onClose;
    titleLast = title;
    bodyChildrenLast = children;
    actionsLast = actions;
    widthLast = width;

    if (controlled) {
      if (open && !prevControlledOpen) {
        isClosing = false;
        restoreFocusEl = resolveRestoreFocus(returnFocus);
        setInert(true);
        scheduleInitialFocus();
      }
      if (!open && prevControlledOpen && !isClosing) beginClose();
      prevControlledOpen = open;
    }

    const shouldShow = controlled ? open || isClosing : isOpenInternal;

    if (typeof document !== 'undefined') {
      if (shouldShow && !escBound) {
        document.addEventListener('keydown', handleKeydown);
        escBound = true;
      }
      if (!shouldShow && escBound) {
        document.removeEventListener('keydown', handleKeydown);
        escBound = false;
      }
    }

    if (!controlled) return triggerChildren === undefined ? null : buildTrigger(triggerChildren, triggerVariant);
    return null;
  }) as DialogInstance;

  const buildTrigger = (triggerChildren: RicNode | RicNode[], triggerVariant: UiButtonVariant): RicNode => ({
    tag: 'button',
    // v1 `create_ui_dialog.js` の trigger_variant 継承 (v1→v2 パリティ一括監査 #4)。
    // uiButton と同じ命名規則 (`ric-button--${variant}`) にそのまま乗る。
    class: triggerVariant !== 'default' ? `ric-button ric-button--${triggerVariant}` : 'ric-button',
    // uiButton を経由しない直書きの button (見た目だけ ric-button を借りている) だったため
    // 他の全 uiButton と違い role が付いていなかった (#2 の役割棚卸しで発見、2.0.0-alpha.8)。
    'data-ricdom-role': UI_ROLE.button,
    onclick: () => {
      if (isOpenInternal) {
        beginClose();
        return;
      }
      restoreFocusEl = (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null) ?? null;
      isClosing = false;
      isOpenInternal = true;
      setInert(true);
      scheduleInitialFocus();
      guard.host?.notify();
    },
    children: triggerChildren,
  });

  inst.renderPortal = (): RicNode => {
    if (!guard.host) return null;
    const shouldShow = isControlledLast ? isClosing || prevControlledOpen === true : isOpenInternal;
    if (!shouldShow) return null;

    return [
      {
        tag: 'div',
        class: `ric-dialog__overlay${isClosing ? ' ric-dialog__overlay--out' : ''}`,
        'data-ricdom-role': UI_ROLE.dialogOverlay,
        onclick: () => requestClose('overlay'),
      },
      {
        tag: 'div',
        class: `ric-dialog${isClosing ? ' ric-dialog--out' : ''}`,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        'aria-describedby': bodyId,
        tabIndex: -1,
        'data-ricdom-role': UI_ROLE.dialog,
        'data-ricdom-dialog-id': dialogRoleAttr,
        style: widthLast != null ? { width: `min(${typeof widthLast === 'number' ? `${widthLast}px` : widthLast}, 90vw)` } : {},
        onanimationend: (ev: AnimationEvent) => {
          if (isClosing) handleExitAnimationEnd();
          else handleEntranceAnimationEnd(ev);
        },
        children: [
          {
            tag: 'div',
            class: 'ric-dialog__header',
            'data-ricdom-role': UI_ROLE.dialogHeader,
            children: [
              { tag: 'span', class: 'ric-dialog__title', id: titleId, 'data-ricdom-role': UI_ROLE.dialogTitle, children: [titleLast] },
              { tag: 'button', class: 'ric-dialog__close', 'data-ricdom-role': UI_ROLE.dialogClose, 'aria-label': 'Close', onclick: () => requestClose('close-button'), children: ['✕'] },
            ],
          },
          { tag: 'div', class: 'ric-dialog__body', id: bodyId, 'data-ricdom-role': UI_ROLE.dialogBody, children: bodyChildrenLast },
          actionsLast.length ? { tag: 'div', class: 'ric-dialog__footer', 'data-ricdom-role': UI_ROLE.dialogFooter, children: actionsLast } : null,
        ],
      },
    ] as unknown as RicNode;
  };

  inst.attach = guard.attach;
  inst.dispose = (): void => {
    if (escBound && typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleKeydown);
      escBound = false;
    }
    setInert(false);
    guard.dispose();
  };

  inst.open = (opts?: DialogOpenOptions): void => {
    if (isControlledLast) return;
    if (isOpenInternal || isClosing) return;
    restoreFocusEl = resolveRestoreFocus(opts?.returnFocus);
    isOpenInternal = true;
    setInert(true);
    scheduleInitialFocus();
    guard.host?.notify();
  };
  inst.close = (reason: DialogCloseReason = 'api'): void => requestClose(reason);
  inst.isOpen = (): boolean => isOpenInternal;

  return inst;
};
