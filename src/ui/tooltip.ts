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
    syncEscape();
    guard.host?.notify();
  };

  const hide = (): void => {
    if (!isOpen) return;
    isOpen = false;
    syncEscape();
    guard.host?.notify();
  };

  // ── フォーカスと Escape は document で受ける (2.0.0-alpha.36、設計書 §55) ──
  // 以前は包む側の span に onfocus / onblur / onkeydown を付けていたが:
  //   - focus / blur はバブリングしない。フォーカスを受けるのは中のボタンなので、span のハンドラは
  //     一度も呼ばれず、Tab で移動してもツールチップが出なかった (ホバーでしか出ない)
  //   - 対になる focusin / focusout には `on*` のプロパティが無く (SPEC §4 の FACT)、
  //     VDOM の属性としては書けない
  //   - Escape を span の keydown で受けると、ホバーだけで出したとき (フォーカスが中に無い) に
  //     消せない。ポインタを動かさずに消せることは WCAG 1.4.13 の要件
  // そこで document の focusin / focusout を登録中ずっと聞き、「この tooltip の span の中か」を
  // マーカー属性で判定する。keydown は出ている間だけ聞く。
  const marker = String(id);
  let dirLast: TooltipDir = 'auto';
  const triggerOf = (target: EventTarget | null): Element | null =>
    target instanceof Element ? target.closest(`[data-ricdom-tooltip-id="${marker}"]`) : null;
  const handleFocusIn = (ev: FocusEvent): void => {
    const el = triggerOf(ev.target);
    if (el) show(el, dirLast);
  };
  const handleFocusOut = (ev: FocusEvent): void => {
    const el = triggerOf(ev.target);
    // 同じ span の中の別の要素へ移っただけなら、出したままにする
    if (el && triggerOf(ev.relatedTarget) !== el) hide();
  };
  const handleEscape = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') hide();
  };
  let escapeBound = false;
  const syncEscape = (): void => {
    if (typeof document === 'undefined' || escapeBound === isOpen) return;
    escapeBound = isOpen;
    if (isOpen) document.addEventListener('keydown', handleEscape);
    else document.removeEventListener('keydown', handleEscape);
  };

  // 説明の紐づけ (aria-describedby) は、フォーカスを受ける要素そのものに付ける。読み上げは
  // フォーカスのある要素の describedby しか読まないので、包む側の span に付けても伝わらない。
  // 子の先頭の要素ノードに足す (利用者が付けた値があれば残して後ろに足す)。要素の子が無い
  // (文字だけ) ときは、従来どおり span に付ける。
  const describe = (children: RicNode | RicNode[]): { children: RicNode | RicNode[]; onChild: boolean } => {
    const list = Array.isArray(children) ? children : [children];
    const at = list.findIndex((c) => typeof c === 'object' && c !== null && !Array.isArray(c) && typeof (c as { tag?: unknown }).tag === 'string');
    if (at < 0) return { children, onChild: false };
    const node = list[at] as unknown as Record<string, unknown>;
    const own = typeof node['aria-describedby'] === 'string' ? `${node['aria-describedby'] as string} ` : '';
    const next = list.slice();
    next[at] = { ...node, 'aria-describedby': own + tooltipId } as unknown as RicNode;
    return { children: next, onChild: true };
  };

  const inst = ((props: TooltipProps): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    contentLast = props.content;
    const dirOpt = props.dir ?? 'auto';
    dirLast = dirOpt;
    const described = describe(props.children);

    return {
      tag: 'span',
      class: 'ric-tooltip',
      // dropdownTrigger/popupTrigger と同じ理由で追加 (#2 の役割棚卸し、2.0.0-alpha.8):
      // ホバー/フォーカス対象のトリガーそのものと、portal 側に出る本体 (tooltip role) を
      // CSS/E2E から別々に掴めるようにする。
      'data-ricdom-role': UI_ROLE.tooltipTrigger,
      // document の focusin / focusout が「この tooltip の中か」を判定するためのマーカー
      'data-ricdom-tooltip-id': marker,
      ...(described.onChild ? {} : { 'aria-describedby': tooltipId }),
      onmouseenter: (ev: MouseEvent) => show(ev.currentTarget as Element, dirOpt),
      onmouseleave: hide,
      children: described.children,
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

  inst.attach = (host): void => {
    guard.attach(host);
    if (typeof document === 'undefined') return;
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
  };
  inst.dispose = (): void => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    }
    isOpen = false;
    syncEscape();
    guard.dispose();
  };

  return inst;
};
