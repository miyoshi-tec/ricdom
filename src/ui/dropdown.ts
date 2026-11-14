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
import { type AttachGuard, type Component, createAttachGuard, type Host } from './internal/component.js';
import { UI_ROLE } from './internal/pureHelpers.js';
import { registerExclusive, unregisterExclusive } from './internal/exclusiveRegistry.js';
import { createFloatingMenu } from './internal/floatingMenu.js';
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

  let bodyChildrenLast: RicNode | RicNode[] = [];

  const getBodyEl = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-dropdown-id="${bodyMarker}"]`));
  const getTriggerEl = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-dropdown-trigger-id="${bodyMarker}"]`));

  // 開閉の状態・外側の操作で閉じる処理・実測して置く処理は createPopup と共有する
  // (internal/floatingMenu.ts)。スクロールで閉じる判定の基準は、常に今のトリガー要素にする。
  const menu = createFloatingMenu({ host: () => guard.host, bodyEl: getBodyEl, triggerEl: getTriggerEl, scrollAnchor: getTriggerEl });

  const inst = ((props: DropdownProps): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    const isOpen = menu.isOpen();
    const isLabel = !!props.label && !props.icon;
    // label は RicNode | RicNode[] (2.0.0-alpha.12、PopupTriggerObject.label と型を揃えた —
    // 線茶からの報告。旧 string 限定では uiIcon() 等を混ぜたラベルが組めなかった)。
    // 配列ならそのまま展開、単体ならこれまでどおり 1 要素の配列に包む。
    const triggerContent: RicNode | RicNode[] = isLabel ? [{ tag: 'span', children: Array.isArray(props.label) ? props.label : [props.label as RicNode] }] : (props.icon ?? '≡');
    bodyChildrenLast = props.children ?? [];
    menu.syncListeners();

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
      // getTriggerEl が問い合わせる安定セレクタ (popup.ts と対称)。
      'data-ricdom-dropdown-trigger-id': bodyMarker,
      'aria-haspopup': 'dialog',
      'aria-expanded': isOpen ? 'true' : 'false',
      onclick: (ev: MouseEvent) => {
        if (menu.isClosing()) return;
        if (menu.isOpen()) {
          menu.closeAndRestoreFocus();
          return;
        }
        // ラベル形は、本体の最小幅をトリガーの幅にする
        menu.openFromElement(ev.currentTarget as HTMLElement, { minWidthFromElement: isLabel });
      },
      children: triggerChildren,
    } as unknown as RicNode;
  }) as DropdownInstance;

  inst.renderPortal = (): RicNode => {
    if (!guard.host || !menu.isOpen()) return null;
    return [
      // overlay は視覚・role 用に残すが pointer-events: none (cssTemplates.ts) で onclick は持たない。
      // 外側クリックで閉じる処理は floatingMenu.ts が document で受ける (2.0.0-alpha.12)。
      { tag: 'div', class: 'ric-popup__overlay', 'data-ricdom-role': UI_ROLE.popupOverlay },
      {
        tag: 'div',
        class: `ric-dropdown__body ric-popup__body--${menu.dir()}${menu.isClosing() ? ' ric-popup__body--out' : ''}`,
        'data-ricdom-role': UI_ROLE.dropdown,
        'data-ricdom-dropdown-id': bodyMarker,
        style: menu.bodyStyle(),
        onanimationend: menu.handleAnimEnd,
        children: bodyChildrenLast,
      },
    ] as unknown as RicNode;
  };

  inst.attach = (host: Host) => {
    guard.attach(host);
    registerExclusive(host.app, menu.exclusiveSelf);
  };
  inst.dispose = (): void => {
    menu.dispose();
    if (guard.host) unregisterExclusive(guard.host.app, menu.exclusiveSelf);
    guard.dispose();
  };

  inst.close = (): void => menu.close();
  inst.isOpen = (): boolean => menu.isOpen();

  return inst;
};
