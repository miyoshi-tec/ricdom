// ricdom/ui — createTooltip (設計書 §3.4 部品契約 + §5/付録 E a11y)
//
// v1 (ric_ui/popup/create_ui_tooltip.js) の移植 + a11y 新規実装 (aria-describedby / Esc)。
// v1 との相違点は portal の描画先が host.portal になったこと (§3.5) のみ、
// 位置計算 (top→bottom→right→left の優先順位) は v1 のロジックをそのまま使う。
// Pos/posToStyle は `internal/popupPosition.ts` に切り出し、createPopup /
// createDropdown と共有する (4 方向判定そのものは tooltip 固有なので移植しない)。
//
// 使い方:
//   const tip = app.use(createTooltip());
//   render 内: tip({ content: 'ヒントテキスト', children: [uiButton({ children: ['?'] })] })

import type { RicNode } from '../types.js';
import { type AttachGuard, type Component, createAttachGuard } from './internal/component.js';
import { UI_ROLE } from './internal/pureHelpers.js';
import { type Pos, posToStyle } from './internal/popupPosition.js';

export type TooltipDir = 'auto' | 'top' | 'bottom' | 'right' | 'left';

export interface TooltipProps {
  content: RicNode;
  children: RicNode | RicNode[];
  dir?: TooltipDir;
}

let nextTooltipId = 0;

export type TooltipInstance = Component<TooltipProps>;

/**
 * hover/focus で表示するツールチップを作る。状態を持つため `app.use(createTooltip())` で登録する。
 *   const tip = app.use(createTooltip());
 *   tip({ content: 'ヒント', children: [uiButton({ children: ['?'] })] })
 */
export const createTooltip = (): TooltipInstance => {
  const id = ++nextTooltipId;
  const tooltipId = `ricdom-tooltip-${id}`;
  const guard: AttachGuard = createAttachGuard('createTooltip', { topLayer: true });

  let isOpen = false;
  let pos: Pos = {};
  let dir: 'top' | 'bottom' | 'right' | 'left' = 'top';
  let contentLast: RicNode = null;

  const show = (triggerEl: Element, preferredDir: TooltipDir): void => {
    const rect = triggerEl.getBoundingClientRect();
    const POP_H = 34;
    const POP_W = 120;
    const GAP = 8;
    const chosen: 'top' | 'bottom' | 'right' | 'left' =
      preferredDir !== 'auto'
        ? preferredDir
        : rect.top >= POP_H + GAP
          ? 'top'
          : window.innerHeight - rect.bottom >= POP_H + GAP
            ? 'bottom'
            : window.innerWidth - rect.right >= POP_W + GAP
              ? 'right'
              : 'left';
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    dir = chosen;
    pos =
      chosen === 'top'
        ? { bottom: window.innerHeight - rect.top + GAP, left: cx }
        : chosen === 'bottom'
          ? { top: rect.bottom + GAP, left: cx }
          : chosen === 'right'
            ? { left: rect.right + GAP, top: cy }
            : { right: window.innerWidth - rect.left + GAP, top: cy };
    isOpen = true;
    guard.host?.notify();
  };

  const hide = (): void => {
    if (!isOpen) return;
    isOpen = false;
    guard.host?.notify();
  };

  const inst = ((props: TooltipProps): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    contentLast = props.content;
    const dirOpt = props.dir ?? 'auto';

    return {
      tag: 'span',
      class: 'ric-tooltip',
      // dropdownTrigger/popupTrigger と同じ理由で追加 (#2 の役割棚卸し、2.0.0-alpha.8):
      // ホバー/フォーカス対象のトリガーそのものと、portal 側に出る本体 (tooltip role) を
      // CSS/E2E から別々に掴めるようにする。
      'data-ricdom-role': UI_ROLE.tooltipTrigger,
      'aria-describedby': tooltipId,
      onmouseenter: (ev: MouseEvent) => show(ev.currentTarget as Element, dirOpt),
      onmouseleave: hide,
      onfocus: (ev: FocusEvent) => show(ev.currentTarget as Element, dirOpt),
      onblur: hide,
      onkeydown: (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') hide();
      },
      children: props.children,
    } as unknown as RicNode;
  }) as TooltipInstance;

  inst.renderPortal = (): RicNode => {
    if (!guard.host || !isOpen) return null;
    return {
      tag: 'div',
      class: `ric-tooltip__popup ric-tooltip__popup--${dir}`,
      id: tooltipId,
      role: 'tooltip',
      'data-ricdom-role': UI_ROLE.tooltip,
      style: posToStyle(pos),
      children: [typeof contentLast === 'string' ? { tag: 'span', children: [contentLast] } : contentLast],
    } as unknown as RicNode;
  };

  inst.attach = guard.attach;
  inst.dispose = (): void => guard.dispose();

  return inst;
};
