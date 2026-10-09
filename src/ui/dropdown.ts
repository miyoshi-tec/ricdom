// ricdom/ui — createDropdown (設計書 §3.4 部品契約 + §5/付録 E a11y)
//
// v1 (ric_ui/popup/create_ui_popup.js) の label/icon/chevron モード (旧 create_ui_dropdown
// 相当) を、createPopup を menu 専用に絞った際の宿題として分離した部品
// (設計書 §13: 「v1 の label/icon/chevron ドロップダウンモードは createDropdown
// (Popover 系) として別部品に」)。
//
// createPopup との違い: 本体は `role="menu"`/`menuitem` を持つメニューではなく、
// 汎用 Popover (`aria-haspopup="dialog"` + `aria-expanded` のみ。中身の意味論は
// consumer に委ねる — matches の listbox 的な役割は持たせない、設計書の指示)。
// 位置計算 (below/above flip・横 clamp) は `internal/popupPosition.ts` を createPopup と
// 共有する。排他制御 (1 つ開いたら popup 系全体で他を閉じる) も
// `internal/exclusiveRegistry.ts` を createPopup と共有する。
//
// v1 との相違点 (位置計算の簡略化):
//   v1 の `_get_portal_cb` (containing block 探索、`.ric-page` の backdrop-filter を
//   避ける祖先探索) と `_get_expand_ref` (アイコンモードの左右展開方向判定) は移植しない —
//   v2 に `.ric-page` 概念が無く、createPopup も既に viewport 基準に簡略化して
//   実装していたため、createDropdown も同じ簡略化を踏襲する (「実測してからはみ出しを
//   横 clamp で解消する」考え方に統一。最終報告に記載)。
//
// 使い方:
//   const dd = app.use(createDropdown());
//   render 内: dd({ label: '選択肢', chevron: true, children: [...] })  // ラベルモード
//              dd({ icon: uiIcon(ICON), ghost: true, children: [...] }) // アイコンモード
//   → 戻り値はトリガーボタンの RicNode。

import type { RicNode } from '../types.js';
import { ANIMATION_FALLBACK_MS, type AttachGuard, type Component, createAttachGuard, type Host } from './internal/component.js';
import { UI_ROLE } from './internal/pureHelpers.js';
import { computeAnchoredLeft, computeFlipDir, measuringLeft, type Pos, posToStyle } from './internal/popupPosition.js';
import { closeOthers, registerExclusive, unregisterExclusive } from './internal/exclusiveRegistry.js';
import { uiIcon } from './icon.js';

// 開閉インジケータ (chevron-down)。閉=下向き、開=CSS で 180° 回転して上向き
// (accordion.ts と同じ descriptor、v1 継承)。
const CHEVRON_DOWN = { p: 'm6 9 6 6 6-6' };

export interface DropdownProps {
  /**
   * ラベルモード (旧 dropdown)。ポップオーバーはトリガー幅を最小幅として広がる。icon と排他。
   * `RicNode | RicNode[]` (2.0.0-alpha.12、`PopupTriggerObject.label` と型を揃えた —
   * 線茶からの報告。旧 string 限定だと `uiIcon(...)` を混ぜたラベル (例: `[uiIcon(ICON),
   * ' テーマ']`) が組めなかった)。文字列 1 つを渡す従来の使い方はそのまま動く。
   */
  label?: RicNode | RicNode[];
  /** アイコンモード (旧 menu)。正方形ボタン、ポップオーバーは min-width:160px。label と排他。 */
  icon?: RicNode;
  /** label モードのみ有効。開閉インジケータ (▼) を付ける (開くと 180° 回転)。 */
  chevron?: boolean;
  /** ホバーまで枠を隠す */
  ghost?: boolean;
  /** ポップオーバー本体の中身 (意味論は consumer に委ねる、汎用 Popover) */
  children?: RicNode | RicNode[];
}

export interface DropdownInstance extends Component<DropdownProps> {
  close(): void;
  isOpen(): boolean;
}

let nextDropdownId = 0;

/**
 * 汎用ポップオーバー (`aria-haspopup="dialog"`) を作る。状態を持つため `app.use()` で登録する。
 *   const dd = app.use(createDropdown());
 *   dd({ label: '選択肢', chevron: true, children: [...] })
 */
export const createDropdown = (): DropdownInstance => {
  const id = ++nextDropdownId;
  const bodyMarker = `ricdom-dropdown-${id}`;
  const guard: AttachGuard = createAttachGuard('createDropdown', { topLayer: true });
  const exclusiveSelf = { close: () => doClose() };

  let isOpen = false;
  let isClosing = false;
  let isMeasuring = false;
  let dir: 'below' | 'above' = 'below';
  let pos: Pos = {};
  let escBound = false;
  let lightDismissBound = false;
  let bodyChildrenLast: RicNode | RicNode[] = [];
  let restoreFocusEl: HTMLElement | null = null;

  const getBodyEl = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-dropdown-id="${bodyMarker}"]`));
  // light dismiss (#A、2.0.0-alpha.12、createPopup と同じ理由 — popup.ts のコメント参照)。
  const getTriggerEl = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-dropdown-trigger-id="${bodyMarker}"]`));

  const handleAnimEnd = (): void => {
    if (!isClosing) return;
    isOpen = false;
    isClosing = false;
    guard.host?.notify();
  };

  function doClose(): void {
    if (isClosing || !isOpen) return;
    isClosing = true;
    guard.host?.notify();
    if (typeof setTimeout !== 'undefined') setTimeout(handleAnimEnd, ANIMATION_FALLBACK_MS);
  }

  const closeAndRestoreFocus = (): void => {
    doClose();
    if (restoreFocusEl && typeof restoreFocusEl.focus === 'function') restoreFocusEl.focus();
  };

  const handleKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') closeAndRestoreFocus();
  };

  const bindKeydownIfNeeded = (): void => {
    if (typeof document === 'undefined') return;
    if (isOpen && !escBound) {
      document.addEventListener('keydown', handleKeydown);
      escBound = true;
    }
    if (!isOpen && escBound) {
      document.removeEventListener('keydown', handleKeydown);
      escBound = false;
    }
  };

  // light dismiss (#A、2.0.0-alpha.12): createPopup と同じ実装 (popup.ts のコメント参照)。
  const handleOutsidePointerDown = (ev: PointerEvent): void => {
    if (!isOpen || isClosing) return;
    const target = ev.target as Node | null;
    if (!target) return;
    const body = getBodyEl();
    if (body && body.contains(target)) return; // 本体内クリックでは閉じない
    const triggerEl = getTriggerEl();
    if (triggerEl && triggerEl.contains(target)) return; // トリガー上は既存の toggle に任せる (二重に閉じない)
    doClose(); // 外側クリックはフォーカス復帰しない (Esc は closeAndRestoreFocus のまま)
  };

  const bindLightDismissIfNeeded = (): void => {
    if (typeof document === 'undefined') return;
    if (isOpen && !lightDismissBound) {
      document.addEventListener('pointerdown', handleOutsidePointerDown, true);
      lightDismissBound = true;
    }
    if (!isOpen && lightDismissBound) {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      lightDismissBound = false;
    }
  };

  // #14 (2.0.0-alpha.5): 実測前 (measuredWidth undefined、= 実測 render の間) は
  // `measuringLeft()` で本体を viewport マージン位置に仮置きし、実測を横幅制約なしで
  // 行う (popupPosition.ts の `measuringLeft` コメント参照)。実測後は従来どおり
  // `computeAnchoredLeft` で最終位置を決める。
  const computePos = (rect: DOMRect, chosenDir: 'below' | 'above', isLabel: boolean, measuredWidth: number | undefined): Pos => ({
    top: chosenDir === 'below' ? rect.bottom + 4 : undefined,
    bottom: chosenDir === 'above' ? window.innerHeight - rect.top + 4 : undefined,
    left: measuredWidth === undefined ? measuringLeft() : computeAnchoredLeft(rect, measuredWidth),
    ...(isLabel ? { minWidth: rect.width } : {}),
  });

  const inst = ((props: DropdownProps): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    const isLabel = !!props.label && !props.icon;
    // label は RicNode | RicNode[] (2.0.0-alpha.12、PopupTriggerObject.label と型を揃えた —
    // 線茶からの報告。旧 string 限定では uiIcon() 等を混ぜたラベルが組めなかった)。
    // 配列ならそのまま展開、単体ならこれまでどおり 1 要素の配列に包む。
    const triggerContent: RicNode | RicNode[] = isLabel ? [{ tag: 'span', children: Array.isArray(props.label) ? props.label : [props.label as RicNode] }] : (props.icon ?? '≡');
    bodyChildrenLast = props.children ?? [];
    bindKeydownIfNeeded();
    bindLightDismissIfNeeded();

    const triggerChildren: RicNode[] = isLabel
      ? [
          ...(Array.isArray(triggerContent) ? triggerContent : [triggerContent]),
          ...(props.chevron ? [uiIcon(CHEVRON_DOWN, { size: '1em', class: `ric-dropdown__chevron${isOpen ? ' ric-dropdown__chevron--open' : ''}` })] : []),
        ]
      : [triggerContent as RicNode];

    return {
      tag: 'button',
      class: ['ric-dropdown__trigger', isLabel ? 'ric-dropdown__trigger--label' : '', props.ghost ? 'ric-dropdown__trigger--ghost' : '', isOpen ? 'ric-dropdown__trigger--open' : '']
        .filter(Boolean)
        .join(' '),
      'data-ricdom-role': UI_ROLE.dropdownTrigger,
      // light dismiss (#A) の getTriggerEl が問い合わせる安定セレクタ (popup.ts と対称)。
      'data-ricdom-dropdown-trigger-id': bodyMarker,
      'aria-haspopup': 'dialog',
      'aria-expanded': isOpen ? 'true' : 'false',
      onclick: (ev: MouseEvent) => {
        if (isClosing) return;
        if (isOpen) {
          closeAndRestoreFocus();
          return;
        }
        if (host.app) closeOthers(host.app, exclusiveSelf);
        const triggerEl = ev.currentTarget as HTMLElement;
        restoreFocusEl = triggerEl;
        const rect = triggerEl.getBoundingClientRect();
        const initialDir = computeFlipDir(rect, 160);
        dir = initialDir;
        pos = computePos(rect, initialDir, isLabel, undefined);
        const canMeasure = typeof requestAnimationFrame !== 'undefined' && typeof document !== 'undefined';
        isMeasuring = canMeasure;
        isClosing = false;
        isOpen = true;
        guard.host?.notify();
        if (!canMeasure) return;
        requestAnimationFrame(() => {
          if (!isOpen || isClosing) {
            isMeasuring = false;
            return;
          }
          const body = getBodyEl();
          if (!body) {
            isMeasuring = false;
            guard.host?.notify();
            return;
          }
          const measuredW = body.offsetWidth;
          const measuredH = body.offsetHeight;
          const newDir = computeFlipDir(rect, measuredH);
          dir = newDir;
          pos = computePos(rect, newDir, isLabel, measuredW);
          isMeasuring = false;
          guard.host?.notify();
        });
      },
      children: triggerChildren,
    } as unknown as RicNode;
  }) as DropdownInstance;

  inst.renderPortal = (): RicNode => {
    if (!guard.host || !isOpen) return null;
    return [
      // light dismiss (#A、2.0.0-alpha.12): overlay は視覚・role 用に残すが pointer-events:
      // none (cssTemplates.ts) で onclick は持たない。popup.ts のコメント参照。
      { tag: 'div', class: 'ric-popup__overlay', 'data-ricdom-role': UI_ROLE.popupOverlay },
      {
        tag: 'div',
        class: `ric-dropdown__body ric-popup__body--${dir}${isClosing ? ' ric-popup__body--out' : ''}`,
        'data-ricdom-role': UI_ROLE.dropdown,
        'data-ricdom-dropdown-id': bodyMarker,
        style: { ...posToStyle(pos), ...(isMeasuring ? { visibility: 'hidden' } : {}) },
        onanimationend: handleAnimEnd,
        children: bodyChildrenLast,
      },
    ] as unknown as RicNode;
  };

  inst.attach = (host: Host) => {
    guard.attach(host);
    registerExclusive(host.app, exclusiveSelf);
  };
  inst.dispose = (): void => {
    if (escBound && typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleKeydown);
      escBound = false;
    }
    if (lightDismissBound && typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      lightDismissBound = false;
    }
    if (guard.host) unregisterExclusive(guard.host.app, exclusiveSelf);
    guard.dispose();
  };

  inst.close = (): void => doClose();
  inst.isOpen = (): boolean => isOpen;

  return inst;
};
