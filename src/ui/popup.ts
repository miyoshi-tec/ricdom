// ricdom/ui — createPopup (設計書 §3.4 部品契約 + §5/付録 E a11y)
//
// v1 (ric_ui/popup/create_ui_popup.js) を「menu に絞った」形で再設計し、a11y を新規実装する。
// v1 との相違点:
//   - v1 は label/icon/chevron の 3 モードを持つ汎用ドロップダウン (旧 dropdown/menu 統合) だったが、
//     設計書 E の記述 (aria-haspopup="menu" / role="menu" / menuitem 自動付与) に合わせて
//     「トリガー + role=menu の本体」に絞ったメニュー部品として実装し直した
//     (v1 の label/icon モード相当は `createDropdown` として別部品に分離、
//     設計書 §13 で確定済みの方針)。
//   - 矢印キー (↑↓) での項目間移動・Home/End・Esc でトリガーへ復帰を新規実装 (a11y、v1 未対応)。
//   - 排他制御 (他の popup を閉じる) は
//     `internal/exclusiveRegistry.ts` (host.app 単位、v1 の無制限成長するモジュール
//     レベル `_popup_registry` の後継、B13 解消) を使って実装した。createDropdown と
//     同じレジストリを共有する (「popup 系」全体で 1 つ開いたら他を閉じる、v1 踏襲)。
//   - 位置計算 (below/above flip・横 clamp) は `internal/popupPosition.ts` に切り出し、
//     createDropdown / createTooltip と共有する (重複を作らない)。
//
// 使い方:
//   const menu = app.use(createPopup());
//   render 内: menu({ trigger: ['⋯'], children: [uiButton({ children: ['削除'], onclick: ... })] })
//   → 戻り値はトリガーボタンの RicNode。
//   任意の座標に開く: menu.openAt(event) / menu.openAt({ x, y })

import type { ClassValue, RicNode, StyleValue } from '../types.js';
import { ANIMATION_FALLBACK_MS, type AttachGuard, type Component, createAttachGuard, type Host } from './internal/component.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';
import { clampLeft, computeAnchoredLeft, computeFlipDir, computeFlipDirAt, fitHeight, measuringLeft, type Pos, posToStyle, shouldCloseOnScroll } from './internal/popupPosition.js';
import { closeOthers, registerExclusive, unregisterExclusive } from './internal/exclusiveRegistry.js';

/**
 * トリガーの見た目を `uiButton` 相当 (icon + ghost の丸ボタン等) にしたいケース向けの
 * オブジェクト形 (2.0.0-alpha.2、v1 parity — v1 の icon/ghost トリガーが再現できず
 * consumer が構造セレクタで CSS 上書きしていた報告への対応)。`trigger` に直接
 * `RicNode`/`RicNode[]` (中身をそのままボタンに詰める、既存の形) を渡すのと二者択一。
 */
export interface PopupTriggerObject {
  icon?: RicNode;
  label?: RicNode | RicNode[];
  ghost?: boolean;
  size?: 'sm' | 'md' | 'lg';
  class?: ClassValue;
  style?: StyleValue;
  /** ツールチップ。アイコンだけのトリガーでは `aria-label` と合わせて付ける (2.0.0-alpha.28) */
  title?: string;
  /** その他の属性 (aria-label, data-*, id 等) はボタンへ素通しする (2.0.0-alpha.28)。
   *  class・data-ricdom-role・aria-haspopup・aria-expanded・onclick は契約側が優先 */
  [key: string]: unknown;
}

export interface PopupProps {
  /** トリガーボタンの中身。`RicNode`/`RicNode[]` (中身をそのまま詰める) か、
   *  見た目を指定する `PopupTriggerObject` のどちらか。
   *  省略すると何も描かず (戻り値 null)、`openAt()` 専用のメニューになる — 行ごとの「…」
   *  メニューを 1 インスタンスで賄う使い方 (2.0.0-alpha.27、SPEC §10.3.1f)。 */
  trigger?: RicNode | RicNode[] | PopupTriggerObject;
  /** メニュー項目 (各要素に role="menuitem" が自動付与される) */
  children?: RicNode[];
  /**
   * menuitem の活性化 (click。button 項目なら Enter/Space は native click として発火する)
   * で自動的に閉じてトリガーへフォーカス復帰するか (APG menu button パターン、既定 true、
   * 2.0.0-alpha.3 #10)。チェック型メニュー (選択後も開いたままにしたい) 向けの opt-out。
   * `disabled: true` または `aria-disabled="true"` の項目には無関係に効かない (そもそも
   * 活性化とみなさない)。role を明示的に上書きした項目 (`role !== 'menuitem'`、例:
   * separator) にも効かない。
   */
  closeOnSelect?: boolean;
}

// trigger が PopupTriggerObject かどうかの判定。RicElementNode は型上 `tag` が必須
// (設計書 §3.1) なので、「object かつ配列でない かつ tag を持たない」で確実に区別できる。
const isTriggerObject = (t: PopupProps['trigger']): t is PopupTriggerObject =>
  t !== null && typeof t === 'object' && !Array.isArray(t) && !('tag' in (t as Record<string, unknown>));

export interface PopupPoint {
  x?: number;
  y?: number;
  clientX?: number;
  clientY?: number;
  target?: EventTarget | null;
}

export interface PopupInstance extends Component<PopupProps> {
  close(): void;
  isOpen(): boolean;
  /**
   * trigger ボタンを使わずに開く。
   * - `openAt({ x, y })` / `openAt(mouseEvent)`: その点に開く (右クリックのコンテキストメニュー等、v1 v0.4.3 継承)
   * - `openAt(element)`: その要素の下端の直下 (入らなければ上端の直上) に、トリガーから開くときと
   *   同じ規則で開く。行ごとの「…」ボタンを渡す使い方 (2.0.0-alpha.27)。同じ要素で開いている
   *   ときに再度呼ぶと閉じ、別の要素なら 1 回でそちらへ開き直す。閉じたらその要素へフォーカスを戻す
   */
  openAt(point: PopupPoint | Element): void;
}

let nextPopupId = 0;

/** wrapMenuItem に渡す「閉じる」側の依存 (#10)。close は closeAndRestoreFocus を渡す。 */
interface WrapMenuItemOptions {
  closeOnSelect: boolean;
  close: () => void;
}

// disabled 判定 (#10): `disabled: true` prop (ネイティブ disabled 属性、button/input 等が
// 対象) または `aria-disabled="true"` (見た目だけの soft disabled、クリック自体は発火しうる
// 要素向け) のどちらか。ネイティブ disabled な <button> は元々ブラウザが click を発火させ
// ないため、ここでの判定は主に aria-disabled 側の「クリックは通るが活性化とはみなさない」
// ケースを拾う。
const isMenuItemDisabled = (el: Record<string, unknown>): boolean => el.disabled === true || el['aria-disabled'] === 'true';

// メニューの項目として扱う role (矢印キーの移動先になり、項目の装飾が付く)。
const MENU_ITEM_ROLES = new Set(['menuitem', 'menuitemcheckbox', 'menuitemradio']);

const wrapMenuItem = (node: RicNode, opts: WrapMenuItemOptions): RicNode => {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;
  const el = node as unknown as Record<string, unknown>;
  const role = (el.role as string | undefined) ?? 'menuitem';
  // 項目ではない子 (区切り線の role="separator"、role="group"/"none" 等) は何も付けずに素通しする
  // (2.0.0-alpha.28、Rancha の報告)。以前は popup-item の role・tabIndex・.ric-popup__item を一律に
  // 付けていたため、矢印キーで区切り線にフォーカスが止まり、区切り線に項目の枠線・ホバー色が乗っていた。
  if (!MENU_ITEM_ROLES.has(role)) return node;
  // menuitem の活性化 (click) で閉じる (#10、APG menu button パターン)。項目の onclick を
  // 先に呼んでから閉じる — consumer の onclick が `ev.stopPropagation()` していても
  // (ドキュメント全体の Esc/外側クリック監視をバイパスする意図であっても) 確実に閉じる
  // ため、popup 側は「項目の click イベント」ではなく「項目の onclick 呼び出しそのもの」を
  // 包む。role が 'menuitem' 以外に明示上書きされている項目 (separator 等) は活性化の
  // 対象外として素通しする。
  const originalOnclick = el.onclick as ((ev: MouseEvent) => void) | undefined;
  const shouldCloseOnActivate = role === 'menuitem' && opts.closeOnSelect && !isMenuItemDisabled(el);
  const onclick = shouldCloseOnActivate
    ? (ev: MouseEvent): void => {
        if (typeof originalOnclick === 'function') originalOnclick(ev);
        opts.close();
      }
    : originalOnclick;
  // v1 由来の `typeof el.class === 'string' ? el.class : ''` は配列/真偽値マップ形の
  // class を黙って捨てていた (2.0.0-alpha.2、パイロット第 2 号の報告)。他部品と同じ
  // mergeClass (internal/pureHelpers.ts) を使い、3 形態すべてを連結する。
  return {
    ...el,
    role,
    tabIndex: -1,
    // getMenuItems() (矢印キー/Home/End のフォーカス移動) が問い合わせる安定セレクタ。
    // これが無いと handleKeydown が常に items.length===0 で無反応になる (実ブラウザ
    // テストで発見・修正)。
    'data-ricdom-role': UI_ROLE.popupItem,
    class: mergeClass('ric-popup__item', el.class as ClassValue | undefined),
    onclick,
  } as unknown as RicNode;
};

/**
 * `role="menu"` のドロップダウンメニューを作る。状態を持つため `app.use(createPopup())` で登録する。
 *   const menu = app.use(createPopup());
 *   menu({ trigger: ['⋯'], children: [uiButton({ children: ['削除'], onclick: ... })] })
 */
export const createPopup = (): PopupInstance => {
  const id = ++nextPopupId;
  const bodyMarker = `ricdom-popup-${id}`;
  const guard: AttachGuard = createAttachGuard('createPopup', { topLayer: true });

  let isOpen = false;
  let isClosing = false;
  let isMeasuring = false;
  let dir: 'below' | 'above' = 'below';
  let pos: Pos = {};
  let escBound = false;
  let lightDismissBound = false;
  let triggerChildrenLast: RicNode | RicNode[] = [];
  let menuChildrenLast: RicNode[] = [];
  let closeOnSelectLast = true;
  let restoreFocusEl: HTMLElement | null = null;
  // openAt(element) で開いたときの基準要素 (2.0.0-alpha.27)。light dismiss がこの要素上の
  // pointerdown を「外側」と見なさないために使う — 見なすと、同じ「…」をもう一度押したとき
  // pointerdown で閉じ → click で開き直す、になり閉じられない。閉じ終わったら null に戻す。
  let anchorEl: HTMLElement | null = null;
  // 本体をどの要素の矩形に合わせて置いたか (トリガー、または openAt(element) の要素)。点の形の openAt
  // では null。スクロールで閉じる判定 (handleScroll) が「その要素を含む領域が動いたか」を見るのに使う (alpha.28)。
  let placedFrom: HTMLElement | null = null;

  const getBodyEl = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-popup-id="${bodyMarker}"]`));
  // light dismiss (#A、2.0.0-alpha.12) が「トリガー上のクリックか」を判定するための参照。
  // トリガーはこの部品自身の描画結果 (inst の戻り値) の一部で portal の外にあるため、
  // getBodyEl と同じ「マーカー属性を都度クエリする」方式にする — onclick 内で要素を
  // 変数に保持する方式だと openAt() 経由 (トリガーボタンをクリックせずに開く) で
  // 一度も更新されず stale になる (openAt でも menu({...}) は毎 render 呼ばれ続けるため
  // トリガー自体は常に存在する、トリガー経由で開いていないだけ)。
  const getTriggerEl = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-popup-trigger-id="${bodyMarker}"]`));

  const getMenuItems = (): HTMLElement[] => {
    const body = getBodyEl();
    if (!body) return [];
    return Array.from(body.querySelectorAll<HTMLElement>(`[data-ricdom-role="${UI_ROLE.popupItem}"]`));
  };

  // handleAnimEnd は冪等 (isClosing チェック) — 実 animationend と
  // ANIMATION_FALLBACK_MS のフォールバックタイマーの両方から安全に呼べる。
  // consumer が ricdom-ui.css を読み込み忘れている等でアニメーションが走らない場合、
  // animationend が永久に発火せず popup が閉じたまま DOM に残り続けるのを防ぐ。
  const handleAnimEnd = (): void => {
    if (!isClosing) return;
    isOpen = false;
    isClosing = false;
    anchorEl = null;
    guard.host?.notify();
  };

  const doClose = (): void => {
    if (isClosing || !isOpen) return;
    isClosing = true;
    guard.host?.notify();
    if (typeof setTimeout !== 'undefined') setTimeout(handleAnimEnd, ANIMATION_FALLBACK_MS);
  };

  const closeAndRestoreFocus = (): void => {
    doClose();
    if (restoreFocusEl && typeof restoreFocusEl.focus === 'function') restoreFocusEl.focus();
  };

  // 排他制御 (host.app 単位、internal/exclusiveRegistry.ts、設計書「共通」節)。
  // createDropdown と同じレジストリを共有し、「popup 系」全体で 1 つ開いたら他を閉じる。
  const exclusiveSelf = { close: doClose };

  const handleKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      closeAndRestoreFocus();
      return;
    }
    const items = getMenuItems();
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      items[(currentIndex + 1 + items.length) % items.length]!.focus();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]!.focus();
    } else if (ev.key === 'Home') {
      ev.preventDefault();
      items[0]!.focus();
    } else if (ev.key === 'End') {
      ev.preventDefault();
      items[items.length - 1]!.focus();
    }
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

  // light dismiss (#A、2.0.0-alpha.12): HTML `popover="auto"` と同じ「外側の pointerdown
  // で閉じつつ、そのクリックは下の要素にそのまま届く」挙動。alpha.11 以前は
  // `.ric-popup__overlay` (viewport 全面を覆う要素) が click を吸っていたため、
  // 「dropdown を開いたまま別のボタンを押す」操作が「閉じるだけ」になり、consumer は
  // 2 回目のクリックを要求されていた (パイロット第 10 号・線茶からの報告)。
  // capture phase で見るのは、項目 (menuitem) 側が stopPropagation() していても
  // (wrapMenuItem と同じ理由で) 確実に検知するため。
  const handleOutsidePointerDown = (ev: PointerEvent): void => {
    if (!isOpen || isClosing) return;
    const target = ev.target as Node | null;
    if (!target) return;
    const body = getBodyEl();
    if (body && body.contains(target)) return; // 本体内クリックでは閉じない
    const triggerEl = getTriggerEl();
    if (triggerEl && triggerEl.contains(target)) return; // トリガー上は既存の toggle に任せる (二重に閉じない)
    if (anchorEl && anchorEl.contains(target)) return; // openAt(element) の基準要素も同じ (openAt 側が toggle する)
    doClose(); // 外側クリックはフォーカス復帰しない (Esc/項目活性化は closeAndRestoreFocus のまま)
  };

  // 基準要素を含む領域 (またはページ) のスクロールで閉じる (alpha.28、popupPosition.ts の
  // shouldCloseOnScroll 参照)。基準要素は placedFrom (トリガー or openAt の要素)。openAt({x,y}) で
  // 開いた場合は null で、ページのスクロールだけで閉じる。
  const handleScroll = (ev: Event): void => {
    if (!isOpen || isClosing) return;
    if (shouldCloseOnScroll(ev.target, placedFrom, getBodyEl())) doClose();
  };

  const bindLightDismissIfNeeded = (): void => {
    if (typeof document === 'undefined') return;
    if (isOpen && !lightDismissBound) {
      document.addEventListener('pointerdown', handleOutsidePointerDown, true);
      document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
      lightDismissBound = true;
    }
    if (!isOpen && lightDismissBound) {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      document.removeEventListener('scroll', handleScroll, true);
      lightDismissBound = false;
    }
  };

  // #14 (2.0.0-alpha.5): 実測前 (measuredWidth undefined、= 実測 render の間) は
  // `measuringLeft()` で本体を viewport マージン位置に仮置きし、実測を横幅制約なしで
  // 行う (popupPosition.ts の `measuringLeft` コメント参照)。実測後は従来どおり
  // `computeAnchoredLeft`/`clampLeft` で最終位置を決める。トリガー経路・openAt 経路の
  // 両方で同じ関数を使う (dropdown とも共有)。
  // measuredH (実測後のみ) を渡すと、上下どちらにも入りきらないときに maxHeight で画面内に収める (alpha.28)。
  const computePos = (rect: DOMRect, chosenDir: 'below' | 'above', measuredWidth?: number, measuredH?: number): Pos => ({
    top: chosenDir === 'below' ? rect.bottom + 4 : undefined,
    bottom: chosenDir === 'above' ? window.innerHeight - rect.top + 4 : undefined,
    left: measuredWidth === undefined ? measuringLeft() : computeAnchoredLeft(rect, measuredWidth),
    maxHeight: measuredH === undefined ? undefined : fitHeight(chosenDir, chosenDir === 'below' ? rect.bottom + 4 : rect.top - 4, measuredH),
  });

  const computePosAt = (x: number, y: number, chosenDir: 'below' | 'above', measuredWidth: number | undefined, measuredH?: number): Pos => ({
    top: chosenDir === 'below' ? y + 4 : undefined,
    bottom: chosenDir === 'above' ? window.innerHeight - y + 4 : undefined,
    left: measuredWidth === undefined ? measuringLeft() : clampLeft(x, measuredWidth),
    maxHeight: measuredH === undefined ? undefined : fitHeight(chosenDir, chosenDir === 'below' ? y + 4 : y - 4, measuredH),
  });

  const beginMeasuredOpen = (initialDir: 'below' | 'above', initialPos: Pos, remeasure: () => void): void => {
    if (guard.host) closeOthers(guard.host.app, exclusiveSelf);
    dir = initialDir;
    pos = initialPos;
    const canMeasure = typeof requestAnimationFrame !== 'undefined' && typeof document !== 'undefined';
    isMeasuring = canMeasure;
    isClosing = false;
    isOpen = true;
    guard.host?.notify();
    if (canMeasure) requestAnimationFrame(remeasure);
  };

  // 要素 (トリガーボタン、または openAt(element) の基準要素) の矩形を基準に開く。下端の直下に
  // 入らなければ上端の直上に反転し、横は要素に揃えて viewport 内に収める。トリガー経路と
  // openAt(element) 経路で共有する (2.0.0-alpha.27 に切り出し、以前はトリガーの onclick 内にあった)。
  const openFromElement = (el: HTMLElement): void => {
    restoreFocusEl = el;
    placedFrom = el;
    const rect = el.getBoundingClientRect();
    const initialDir = computeFlipDir(rect, 160);
    beginMeasuredOpen(initialDir, computePos(rect, initialDir), () => {
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
      pos = computePos(rect, newDir, measuredW, measuredH);
      isMeasuring = false;
      guard.host?.notify();
    });
  };

  const inst = ((props: PopupProps): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    menuChildrenLast = props.children ?? [];
    closeOnSelectLast = props.closeOnSelect ?? true;
    bindKeydownIfNeeded();
    bindLightDismissIfNeeded();

    // trigger 省略 = openAt() 専用 (2.0.0-alpha.27)。メニューの中身 (children / closeOnSelect) は
    // 上で記録済みなので、トリガーボタンを描かずに終える。
    if (props.trigger === undefined) return null;

    // object 形トリガー (2.0.0-alpha.2、PopupTriggerObject) は icon/label を
    // uiButton 相当の見た目 (.ric-button + --ghost + --sm/--lg) に組み立てる。
    // 従来の RicNode/RicNode[] 形はそのまま children に詰める (後方互換)。
    const triggerObj = isTriggerObject(props.trigger) ? props.trigger : null;
    triggerChildrenLast = triggerObj
      ? [...(triggerObj.icon !== undefined ? [triggerObj.icon] : []), ...(triggerObj.label !== undefined ? (Array.isArray(triggerObj.label) ? triggerObj.label : [triggerObj.label]) : [])]
      : (props.trigger as RicNode | RicNode[]);
    const triggerBaseClass = triggerObj
      ? mergeClass(['ric-button', triggerObj.ghost ? 'ric-button--ghost' : '', triggerObj.size && triggerObj.size !== 'md' ? `ric-button--${triggerObj.size}` : ''].filter(Boolean).join(' '), triggerObj.class)
      : 'ric-button';
    // オブジェクト形の予約外のキー (title, aria-label, data-*, id 等) はボタンへ素通しする
    // (2.0.0-alpha.28、Rancha の報告: アイコンだけのトリガーにツールチップもアクセシブルネームも
    // 付けられなかった)。§10.5 の rest-spread 契約と同じく先に展開し、後に書く class・role・
    // aria-haspopup・aria-expanded・onclick 等の契約の属性は上書きさせない。
    let triggerRest: Record<string, unknown> = {};
    if (triggerObj) {
      const { icon: _icon, label: _label, ghost: _ghost, size: _size, class: _class, style: _style, ...rest } = triggerObj;
      triggerRest = rest;
    }

    return {
      ...triggerRest,
      tag: 'button',
      class: `${triggerBaseClass}${isOpen ? ' ric-popup__trigger--open' : ''}`,
      ...(triggerObj?.style ? { style: triggerObj.style } : {}),
      // dropdown には dropdownTrigger role があるのに popup のトリガーには無かった非対称を
      // 解消 (#2 の役割棚卸しで発見、2.0.0-alpha.8)。
      'data-ricdom-role': UI_ROLE.popupTrigger,
      // light dismiss (#A) の getTriggerEl が問い合わせる安定セレクタ。getBodyEl の
      // data-ricdom-popup-id と対になる (両方とも bodyMarker を共有する)。
      'data-ricdom-popup-trigger-id': bodyMarker,
      'aria-haspopup': 'menu',
      'aria-expanded': isOpen ? 'true' : 'false',
      onclick: (ev: MouseEvent) => {
        if (isClosing) return;
        if (isOpen) {
          closeAndRestoreFocus();
          return;
        }
        anchorEl = null; // トリガー経路は getTriggerEl() が light dismiss の例外を担う
        openFromElement(ev.currentTarget as HTMLElement);
      },
      children: triggerChildrenLast,
    } as unknown as RicNode;
  }) as PopupInstance;

  inst.renderPortal = (): RicNode => {
    if (!guard.host || !isOpen) return null;
    return [
      // light dismiss (#A、2.0.0-alpha.12): overlay は視覚・role (popup-overlay) 用に
      // 残すが pointer-events: none にして onclick は持たない (CSS 側、cssTemplates.ts)。
      // 閉じる判定・下要素へのクリック透過は handleOutsidePointerDown (document 監視) が担う。
      { tag: 'div', class: 'ric-popup__overlay', 'data-ricdom-role': UI_ROLE.popupOverlay },
      {
        tag: 'div',
        class: `ric-popup__body ric-popup__body--${dir}${isClosing ? ' ric-popup__body--out' : ''}`,
        role: 'menu',
        'data-ricdom-role': UI_ROLE.popup,
        'data-ricdom-popup-id': bodyMarker,
        style: { ...posToStyle(pos), ...(isMeasuring ? { visibility: 'hidden' } : {}) },
        onanimationend: handleAnimEnd,
        children: menuChildrenLast.map((child) => wrapMenuItem(child, { closeOnSelect: closeOnSelectLast, close: closeAndRestoreFocus })),
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
      document.removeEventListener('scroll', handleScroll, true);
      lightDismissBound = false;
    }
    if (guard.host) unregisterExclusive(guard.host.app, exclusiveSelf);
    guard.dispose();
  };

  inst.close = (): void => doClose();
  inst.isOpen = (): boolean => isOpen;

  inst.openAt = (point: PopupPoint | Element): void => {
    // 要素の形 (2.0.0-alpha.27): 行ごとの「…」ボタン等を基準に、トリガーと同じ規則で開く。
    // 閉じアニメーション中でも受け付ける — 別の行の「…」を押すと、pointerdown の light dismiss で
    // 閉じ始めた直後にこの click が来るため、ここで弾くと 2 回押さないと開かない。
    if (typeof Element !== 'undefined' && point instanceof Element) {
      const el = point as HTMLElement;
      if (isOpen && !isClosing && anchorEl === el) {
        closeAndRestoreFocus(); // 同じ要素でもう一度 = 閉じる (トリガーの toggle と同じ)
        return;
      }
      anchorEl = el;
      openFromElement(el);
      return;
    }
    if (isClosing) return;
    if (!point || typeof point !== 'object') {
      console.error('RicDOM UI: createPopup().openAt には要素、または { x, y } / { clientX, clientY } を持つオブジェクトを渡してください。');
      return;
    }
    // ここに来るのは点の形だけ (要素は上で return 済み。`typeof Element` の確認を挟むので TS は絞り込めない)
    const p = point as PopupPoint;
    const x = p.x ?? p.clientX;
    const y = p.y ?? p.clientY;
    if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) {
      console.error('RicDOM UI: createPopup().openAt: x/y (または clientX/clientY) が数値ではありません。');
      return;
    }
    anchorEl = null; // 点の形は基準要素を持たない (前回の openAt(element) の値を残さない)
    placedFrom = null;
    restoreFocusEl = p.target instanceof HTMLElement ? p.target : (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
    const initialDir = computeFlipDirAt(y, 160);
    beginMeasuredOpen(initialDir, computePosAt(x, y, initialDir, undefined), () => {
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
      const newDir = computeFlipDirAt(y, measuredH);
      dir = newDir;
      pos = computePosAt(x, y, newDir, measuredW, measuredH);
      isMeasuring = false;
      guard.host?.notify();
    });
  };

  return inst;
};
