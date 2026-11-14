// ricdom/ui — createSplitter (設計書 §3.4 部品契約 + 付録 E a11y)
//
// v1 (ric_ui/composite/create_ui_splitter.js) の移植。v1 との相違点:
//   - 状態を持つので `app.use(createSplitter(options))` で明示登録する (設計書 §3.4)。
//     `host.notify()` で再描画を要求する (v1 の `safe_notify` 相当)。
//   - サイドパネル/仕切り線の DOM 参照は v1 の `data-ric-role` + `querySelector` ではなく、
//     コアの `ref` / `app.refs` をそのまま使う (v2 に既にある機構を再実装しない)。
//   - a11y を新規実装 (v1 未対応): 仕切り線に `role="separator"` + `aria-orientation` +
//     `aria-valuenow`/`aria-valuemin`/`aria-valuemax`、`tabindex=0`、矢印キーでの
//     リサイズ (APG window splitter パターン)。
//   - per-render の props 名を v1 から少し整理した: v1 は `side` を「生成時オプション
//     (分割方向)」と「render 時 props (サイドパネルの中身、`{ ctx }` でラップ)」の
//     両方に使っていた (同名で意味が違う)。v2 は生成時オプションの `side` はそのまま、
//     render 時 props は `side`/`main` に直接ノード (or ノード配列) を渡す形にして
//     `{ ctx }` ラッパーを廃止した (v2 の children 直渡し方針に合わせる、最終報告に記載)。
//
// 使い方:
//   const split = app.use(createSplitter({ side: 'left', size: 240, min: 60,
//     onResizeEnd: (size) => save(size) }));
//   render 内で毎回呼ぶ:
//     split({ side: [sideContent], main: [mainContent] })
//   controlled (折り畳み状態を外部管理):
//     split({ collapsed: s.collapsed, onCollapseChange: (v) => { s.collapsed = v; },
//             side: [...], main: [...] })

import type { RicNode } from '../types.js';
import { type AttachGuard, type Component, createAttachGuard } from './internal/component.js';
import { UI_ROLE } from './internal/pureHelpers.js';

export type SplitterSide = 'left' | 'right' | 'top' | 'bottom';

export interface CreateSplitterOptions {
  /** サイドパネルをどちらに置くか (既定 'left') */
  side?: SplitterSide;
  /** サイドパネルの初期サイズ (px、既定 240) */
  size?: number;
  /** 最小サイズ (px、既定 60) */
  min?: number;
  /** 最大サイズ (px、既定 null = 制限なし) */
  max?: number | null;
  /** 折り畳みボタンを表示するか (既定 true) */
  collapsible?: boolean;
  /** ドラッグ終了 (mouseup) または矢印キーでのリサイズ確定時に最終サイズを 1 回受け取る */
  onResizeEnd?: (size: number) => void;
}

export interface SplitterProps {
  /** サイドパネル (固定サイズ側) の中身 */
  side?: RicNode | RicNode[];
  /** メインパネル (残り全部) の中身 */
  main?: RicNode | RicNode[];
  /** controlled mode の折り畳み状態。指定すると controlled になる。 */
  collapsed?: boolean;
  // v1 の on_collapse_change 継承。
  /** controlled mode の折り畳みトグル通知 */
  onCollapseChange?: (collapsed: boolean) => void;
}

export interface SplitterInstance extends Component<SplitterProps> {
  /** 外部から折り畳みをトグルする (uncontrolled のみ。controlled では no-op) */
  toggle(): void;
  /** 現在の折り畳み状態 */
  collapsed(): boolean;
  /** 現在のサイドパネルサイズ (px) */
  getSize(): number;
  /** サイズを外部から設定する (min/max clamp 済み。DOM が既にあれば即時反映) */
  setSize(px: number): void;
}

let nextSplitterId = 0;

// キーボードでの 1 回のリサイズ幅 (px)。v1 にキーボード操作は無かったので新規の値
// (APG window splitter パターンの「大きめの固定ステップ」に合わせた目安値)。
const KEY_STEP = 10;

/**
 * ドラッグ/矢印キーでリサイズできる 2 分割パネルを作る。状態を持つため `app.use()` で登録する。
 *   const split = app.use(createSplitter({ side: 'left', size: 240 }));
 *   split({ side: [sideContent], main: [mainContent] })
 */
export const createSplitter = (options: CreateSplitterOptions = {}): SplitterInstance => {
  const { side = 'left', size: initialSize = 240, min = 60, max = null, collapsible = true, onResizeEnd } = options;
  const id = ++nextSplitterId;
  const isHorizontal = side === 'left' || side === 'right'; // 水平分割 (サイドパネルが左右)
  const isSideBefore = side === 'left' || side === 'top';
  const sideRefName = `ricdom-splitter-${id}-side`;
  const dividerRefName = `ricdom-splitter-${id}-divider`;

  const guard: AttachGuard = createAttachGuard('createSplitter');

  let currentSize = initialSize;
  let isCollapsed = false;
  let isToggling = false;
  let isControlled = false;
  let onCollapseChangeLast: ((v: boolean) => void) | undefined;

  const clampSize = (px: number): number => Math.max(min, max !== null ? Math.min(max, px) : px);

  // 折り畳み状態に応じた矢印文字 (「どちらに閉じるか」を示す向き、v1 継承)
  const arrowFor = (): string => {
    if (side === 'left') return isCollapsed ? '›' : '‹';
    if (side === 'right') return isCollapsed ? '‹' : '›';
    if (side === 'top') return isCollapsed ? '▼' : '▲';
    return isCollapsed ? '▲' : '▼';
  };

  const toggle = (): void => {
    if (isControlled) {
      onCollapseChangeLast?.(!isCollapsed);
      return;
    }
    isCollapsed = !isCollapsed;
    // トグル時のみ flex-basis transition を有効化する (タブ切り替え等の意図しない
    // flex-basis 変化でアニメーションが走るのを防ぐ、v1 継承)。
    isToggling = true;
    guard.host?.notify();
  };

  const handleMouseDown = (ev: MouseEvent): void => {
    // 折り畳みボタンのクリックはドラッグ開始させない (ボタン側の onclick に任せる)
    if ((ev.target as HTMLElement).closest('.ric-splitter__collapse-btn')) return;
    if (isCollapsed) return; // 折り畳み中はドラッグ無効 (展開は onclick で行う)

    ev.preventDefault();
    const host = guard.host;
    if (!host) return;
    const sideEl = host.app.refs.get(sideRefName) as HTMLElement | undefined;
    const dividerEl = host.app.refs.get(dividerRefName) as HTMLElement | undefined;

    const startCoord = isHorizontal ? ev.clientX : ev.clientY;
    const startSize = currentSize;
    // サイドパネルが左/上にある場合は正方向ドラッグで拡大、右/下は逆
    const sign = side === 'left' || side === 'top' ? 1 : -1;

    // ドラッグ中: トランジション無効化・仕切り線ハイライト (DOM 直接操作、60fps を保つため
    // 再描画しない。v1 継承)
    if (sideEl) sideEl.style.transition = 'none';
    dividerEl?.classList.add('ric-splitter__divider--dragging');

    const onMove = (moveEv: MouseEvent): void => {
      const delta = (isHorizontal ? moveEv.clientX : moveEv.clientY) - startCoord;
      currentSize = clampSize(startSize + sign * delta);
      if (sideEl) sideEl.style.flexBasis = `${currentSize}px`;
    };
    const onUp = (): void => {
      if (sideEl) sideEl.style.transition = '';
      dividerEl?.classList.remove('ric-splitter__divider--dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // ドラッグ終了を 1 回だけ通知 (永続化などのため、リスナー解除後に呼ぶ、v1 継承)
      onResizeEnd?.(currentSize);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // 矢印キーでのリサイズ (APG window splitter、v1 未対応の a11y 新規実装)。
  // side==='left'/'top' は正方向キーで拡大、'right'/'bottom' は逆方向キーで拡大
  // (マウスドラッグの sign と揃える)。キーボードには mouseup 相当の「確定」イベントが
  // 無いため、1 回の押下を 1 回の確定リサイズとみなし、その場で onResizeEnd を呼ぶ。
  const handleKeydown = (ev: KeyboardEvent): void => {
    if (isCollapsed) return;
    const growKey = isHorizontal ? (side === 'left' ? 'ArrowRight' : 'ArrowLeft') : side === 'top' ? 'ArrowDown' : 'ArrowUp';
    const shrinkKey = isHorizontal ? (side === 'left' ? 'ArrowLeft' : 'ArrowRight') : side === 'top' ? 'ArrowUp' : 'ArrowDown';
    if (ev.key !== growKey && ev.key !== shrinkKey) return;
    ev.preventDefault();
    const next = clampSize(currentSize + (ev.key === growKey ? KEY_STEP : -KEY_STEP));
    if (next === currentSize) return;
    currentSize = next;
    guard.host?.notify();
    onResizeEnd?.(currentSize);
  };

  const inst = ((props: SplitterProps = {}): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    const { side: sideChildren = [], main: mainChildren = [], collapsed, onCollapseChange } = props;
    isControlled = collapsed !== undefined;
    onCollapseChangeLast = isControlled ? onCollapseChange : undefined;

    // controlled: collapsed の変化を検出してアニメーションを有効化 (v1 継承)
    if (collapsed !== undefined && collapsed !== isCollapsed) {
      isToggling = true;
      isCollapsed = collapsed;
    }

    const sidePanel = {
      tag: 'div',
      class: `ric-splitter__side${isCollapsed ? ' ric-splitter__side--collapsed' : ''}`,
      'data-ricdom-role': UI_ROLE.splitterSide,
      ref: sideRefName,
      style: {
        flexShrink: 0,
        flexBasis: `${isCollapsed ? 0 : currentSize}px`,
        overflow: isCollapsed || isToggling ? 'hidden' : 'auto',
        // isToggling 中だけ transition を効かせる (inline style フラグ管理、v1 継承)
        ...(isToggling ? { transition: 'flex-basis var(--ric-duration, 200ms) var(--ric-easing, ease)' } : {}),
      },
      ontransitionend: isToggling
        ? () => {
            isToggling = false;
            guard.host?.notify();
          }
        : undefined,
      children: sideChildren,
    };

    const valueNow = isCollapsed ? min : currentSize;
    const divider = {
      tag: 'div',
      class: 'ric-splitter__divider',
      'data-ricdom-role': UI_ROLE.splitterDivider,
      ref: dividerRefName,
      role: 'separator',
      'aria-orientation': isHorizontal ? 'vertical' : 'horizontal',
      'aria-valuenow': valueNow,
      'aria-valuemin': min,
      // max が無制限 (null) のときは aria-valuemax を省略する (論理的な上限が無いため)
      ...(max !== null ? { 'aria-valuemax': max } : {}),
      tabIndex: 0,
      onmousedown: handleMouseDown,
      onkeydown: handleKeydown,
      onclick: isCollapsed
        ? (ev: MouseEvent) => {
            // 折り畳みボタン由来のバブルはスキップ (二重トグル防止、v1 継承)
            if (!(ev.target as HTMLElement).closest('.ric-splitter__collapse-btn')) toggle();
          }
        : undefined,
      children: collapsible
        ? [
            {
              tag: 'button',
              class: 'ric-splitter__collapse-btn',
              'data-ricdom-role': UI_ROLE.splitterToggle,
              'aria-label': isCollapsed ? 'Expand' : 'Collapse',
              onclick: toggle,
              children: [arrowFor()],
            },
          ]
        : [],
    };

    const mainPanel = {
      tag: 'div',
      class: 'ric-splitter__main',
      'data-ricdom-role': UI_ROLE.splitterMain,
      style: { flex: 1, overflow: 'auto', minWidth: 0, minHeight: 0 },
      children: mainChildren,
    };

    // left/top: サイドパネルが先 (左/上)、right/bottom: メインが先
    const children = isSideBefore ? [sidePanel, divider, mainPanel] : [mainPanel, divider, sidePanel];

    return {
      tag: 'div',
      class: `ric-splitter ric-splitter--${isHorizontal ? 'horizontal' : 'vertical'}${isCollapsed ? ' ric-splitter--collapsed' : ''}`,
      'data-ricdom-role': UI_ROLE.splitter,
      style: { display: 'flex', flexDirection: isHorizontal ? 'row' : 'column', width: '100%', height: '100%', overflow: 'hidden' },
      children,
    } as unknown as RicNode;
  }) as SplitterInstance;

  inst.attach = guard.attach;
  inst.dispose = (): void => guard.dispose();

  inst.toggle = toggle;
  inst.collapsed = (): boolean => isCollapsed;
  inst.getSize = (): number => currentSize;
  inst.setSize = (px: number): void => {
    currentSize = clampSize(px);
    // キャッシュ済み DOM 要素があれば即時反映。無ければ次の再描画で反映 (v1 継承)。
    const sideEl = guard.host?.app.refs.get(sideRefName) as HTMLElement | undefined;
    if (sideEl && !isCollapsed) sideEl.style.flexBasis = `${currentSize}px`;
  };

  return inst;
};
