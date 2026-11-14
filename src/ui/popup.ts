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
import { type AttachGuard, type Component, createAttachGuard, type Host } from './internal/component.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';
import { registerExclusive, unregisterExclusive } from './internal/exclusiveRegistry.js';
import { createFloatingMenu } from './internal/floatingMenu.js';

// 2.0.0-alpha.2、v1 parity — v1 の icon/ghost トリガーが再現できず consumer が
// 構造セレクタで CSS 上書きしていた報告への対応。
/**
 * トリガーの見た目を `uiButton` 相当 (icon + ghost の丸ボタン等) にしたいケース向けの
 * オブジェクト形。`trigger` に直接 `RicNode`/`RicNode[]` (中身をそのままボタンに詰める形)
 * を渡すのと二者択一。
 */
export interface PopupTriggerObject {
  icon?: RicNode;
  label?: RicNode | RicNode[];
  ghost?: boolean;
  size?: 'sm' | 'md' | 'lg';
  class?: ClassValue;
  style?: StyleValue;
  // title と属性の素通しは 2.0.0-alpha.28 で追加。
  /** ツールチップ。アイコンだけのトリガーでは `aria-label` と合わせて付ける */
  title?: string;
  /** その他の属性 (aria-label, data-*, id 等) はボタンへ素通しする。
   *  class・data-ricdom-role・aria-haspopup・aria-expanded・onclick は契約側が優先 */
  [key: string]: unknown;
}

export interface PopupProps {
  // trigger の省略 (openAt 専用のメニュー) は 2.0.0-alpha.27 で追加。
  /** トリガーボタンの中身。`RicNode`/`RicNode[]` (中身をそのまま詰める) か、
   *  見た目を指定する `PopupTriggerObject` のどちらか。
   *  省略すると何も描かず (戻り値 null)、`openAt()` 専用のメニューになる — 行ごとの「…」
   *  メニューを 1 インスタンスで賄う使い方 (SPEC §10.3.1f)。 */
  trigger?: RicNode | RicNode[] | PopupTriggerObject;
  /** メニュー項目 (各要素に role="menuitem" が自動付与される) */
  children?: RicNode[];
  // 2.0.0-alpha.3 #10 で追加。
  /**
   * menuitem の活性化 (click。button 項目なら Enter/Space は native click として発火する)
   * で自動的に閉じてトリガーへフォーカス復帰するか (APG menu button パターン、既定 true)。
   * チェック型メニュー (選択後も開いたままにしたい) 向けの opt-out。
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
  // 点に開く形は v1 v0.4.3 継承。要素を渡す形は 2.0.0-alpha.27 で追加。
  /**
   * trigger ボタンを使わずに開く。
   * - `openAt({ x, y })` / `openAt(mouseEvent)`: その点に開く (右クリックのコンテキストメニュー等)
   * - `openAt(element)`: その要素の下端の直下 (入らなければ上端の直上) に、トリガーから開くときと
   *   同じ規則で開く。行ごとの「…」ボタンを渡す使い方。同じ要素で開いている
   *   ときに再度呼ぶと閉じ、別の要素なら 1 回でそちらへ開き直す。閉じたらその要素へフォーカスを戻す
   */
  openAt(point: PopupPoint | Element): void;
}

let nextPopupId = 0;

// #10 (menuitem の活性化で閉じる) のための依存。
/** wrapMenuItem に渡す「閉じる」側の依存。close は closeAndRestoreFocus を渡す。 */
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

  let triggerChildrenLast: RicNode | RicNode[] = [];
  let menuChildrenLast: RicNode[] = [];
  let closeOnSelectLast = true;

  const getBodyEl = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-popup-id="${bodyMarker}"]`));
  // 「トリガーの上の操作か」を判定するための参照。トリガーはこの部品自身の描画結果の一部で portal の
  // 外にあるため、getBodyEl と同じ「マーカー属性を都度クエリする」方式にする — onclick の中で要素を
  // 変数に保持する方式だと、openAt() 経由 (トリガーを押さずに開く) では一度も更新されず古くなる。
  const getTriggerEl = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-popup-trigger-id="${bodyMarker}"]`));

  const getMenuItems = (): HTMLElement[] => {
    const body = getBodyEl();
    if (!body) return [];
    return Array.from(body.querySelectorAll<HTMLElement>(`[data-ricdom-role="${UI_ROLE.popupItem}"]`));
  };

  // メニューの中のキー操作 (矢印・Home・End)。Escape は共有の本体が受ける。
  // native の disabled な項目はフォーカスを受けないので、巡る対象から外す。外さないと、↓ がその
  // 項目に focus() して何も起きず「いまの位置」が進まないので、無効な項目の手前で止まる
  // (2.0.0-alpha.36)。aria-disabled="true" の項目はフォーカスを受けるので残す (読み上げで存在が伝わる)。
  const handleMenuKey = (ev: KeyboardEvent): void => {
    const items = getMenuItems().filter((el) => !el.matches(':disabled'));
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

  // 開閉の状態・外側の操作で閉じる処理・実測して置く処理は createDropdown と共有する
  // (internal/floatingMenu.ts)。同じ排他の登録簿も共有し、「popup 系」全体で 1 つ開いたら他を閉じる。
  // スクロールで閉じる判定の基準は既定のまま (本体を置く基準にした要素 = トリガーか openAt の要素。
  // 点で開いたときは基準なし = ページのスクロールでだけ閉じる)。
  const menu = createFloatingMenu({ host: () => guard.host, bodyEl: getBodyEl, triggerEl: getTriggerEl, onKey: handleMenuKey });

  const inst = ((props: PopupProps): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    menuChildrenLast = props.children ?? [];
    closeOnSelectLast = props.closeOnSelect ?? true;
    menu.syncListeners();

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
      class: `${triggerBaseClass}${menu.isOpen() ? ' ric-popup__trigger--open' : ''}`,
      ...(triggerObj?.style ? { style: triggerObj.style } : {}),
      // dropdown には dropdownTrigger role があるのに popup のトリガーには無かった非対称を
      // 解消 (#2 の役割棚卸しで発見、2.0.0-alpha.8)。
      'data-ricdom-role': UI_ROLE.popupTrigger,
      // getTriggerEl が問い合わせる安定セレクタ。getBodyEl の data-ricdom-popup-id と対になる
      // (両方とも bodyMarker を共有する)。
      'data-ricdom-popup-trigger-id': bodyMarker,
      'aria-haspopup': 'menu',
      'aria-expanded': menu.isOpen() ? 'true' : 'false',
      onclick: (ev: MouseEvent) => {
        if (menu.isClosing()) return;
        if (menu.isOpen()) {
          menu.closeAndRestoreFocus();
          return;
        }
        // トリガー経路は基準要素として覚えない (getTriggerEl が「この上では閉じない」を担う)
        menu.openFromElement(ev.currentTarget as HTMLElement);
      },
      children: triggerChildrenLast,
    } as unknown as RicNode;
  }) as PopupInstance;

  inst.renderPortal = (): RicNode => {
    if (!guard.host || !menu.isOpen()) return null;
    return [
      // overlay は視覚・role (popup-overlay) 用に残すが pointer-events: none にして onclick は
      // 持たない (CSS 側、cssTemplates.ts)。外側クリックで閉じる処理と下の要素へのクリックの透過は
      // floatingMenu.ts が document で受ける (2.0.0-alpha.12)。
      { tag: 'div', class: 'ric-popup__overlay', 'data-ricdom-role': UI_ROLE.popupOverlay },
      {
        tag: 'div',
        class: `ric-popup__body ric-popup__body--${menu.dir()}${menu.isClosing() ? ' ric-popup__body--out' : ''}`,
        role: 'menu',
        'data-ricdom-role': UI_ROLE.popup,
        'data-ricdom-popup-id': bodyMarker,
        style: menu.bodyStyle(),
        onanimationend: menu.handleAnimEnd,
        children: menuChildrenLast.map((child) => wrapMenuItem(child, { closeOnSelect: closeOnSelectLast, close: menu.closeAndRestoreFocus })),
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

  inst.close = (): void => menu.closeFromApi();
  inst.isOpen = (): boolean => menu.isOpen();

  inst.openAt = (point: PopupPoint | Element): void => {
    // 要素の形 (2.0.0-alpha.27): 行ごとの「…」ボタン等を基準に、トリガーと同じ規則で開く。
    // 閉じアニメーション中でも受け付ける — 別の行の「…」を押すと、pointerdown で閉じ始めた直後に
    // この click が来るため、ここで弾くと 2 回押さないと開かない。
    if (typeof Element !== 'undefined' && point instanceof Element) {
      const el = point as HTMLElement;
      if (menu.isOpen() && !menu.isClosing() && menu.anchorEl() === el) {
        menu.closeAndRestoreFocus(); // 同じ要素でもう一度 = 閉じる (トリガーの toggle と同じ)
        return;
      }
      // 基準要素として覚える: この要素の上の pointerdown では閉じない (閉じると、同じ「…」を
      // もう一度押したとき pointerdown で閉じ → click で開き直す、になり閉じられない)
      menu.openFromElement(el, { asAnchor: true });
      return;
    }
    if (menu.isClosing()) return;
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
    menu.openAtPoint(x, y, p.target instanceof HTMLElement ? p.target : typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
  };

  return inst;
};
