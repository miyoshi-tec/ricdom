// ricdom/ui 内部 — createPopup と createDropdown が共有する「基準に合わせて開く浮遊面」の本体
// (2.0.0-alpha.34、設計書 §53 のリファクタリング。外から見た動作は変えていない)。
//
// 2 つの部品は、位置の計算 (popupPosition.ts) と排他 (exclusiveRegistry.ts) は共有していたが、
// 開閉の状態と後始末を同じ名前の関数 10 個でそれぞれ持っていた。alpha.12 (外側クリックで閉じる)
// と alpha.28 (スクロールで閉じる、高さの制限) は、同じ変更を 2 か所に入れる必要があった。
// ここに 1 つにまとめ、部品側には「何を描くか」と部品固有の操作 (popup の矢印キー、openAt の
// 入口、dropdown のラベル幅) だけを残す。
//
// ここが持つもの:
//   - 状態: 開いている / 閉じるアニメーション中 / 実測中、向き (下・上)、位置
//   - 閉じ方: doClose (閉じアニメーション開始 → animationend か ANIMATION_FALLBACK_MS の
//     早いほうで片付け)、Escape と項目の選択ではフォーカスを開いた元へ戻す
//   - 外側の操作で閉じる: pointerdown (本体・トリガー・openAt の基準要素の上は除く)、
//     基準要素を含む領域かページの scroll
//   - 開き方: まず非表示で仮置きして実測し、次のフレームで向きと位置を決め直す
//     (横は基準に揃えて画面内へ、縦は入らなければ反転、どちらにも入らなければ高さを制限)
//   - document へのリスナーの付け外し (開いている間だけ付ける) と dispose

import { ANIMATION_FALLBACK_MS, type Host } from './component.js';
import { closeOthers, type Exclusive } from './exclusiveRegistry.js';
import { clampLeft, computeAnchoredLeft, computeFlipDir, computeFlipDirAt, fitHeight, measuringLeft, type Pos, posToStyle, shouldCloseOnScroll } from './popupPosition.js';

export type FloatingDir = 'below' | 'above';

export interface FloatingMenuOptions {
  /** 登録先 (未登録なら null)。再描画の依頼と排他の単位に使う。 */
  host: () => Host | null;
  /** portal に描いた本体の要素。 */
  bodyEl: () => HTMLElement | null;
  /** 部品が描いたトリガーの要素 (トリガーを描いていなければ null)。この上の pointerdown では閉じない。 */
  triggerEl: () => HTMLElement | null;
  /**
   * スクロールで閉じる判定の基準要素。省略時は「本体を置く基準にした要素」
   * (openFromElement に渡した要素。点で開いたときは null = ページのスクロールでだけ閉じる)。
   */
  scrollAnchor?: () => HTMLElement | null;
  /** Escape 以外のキー (popup の矢印・Home・End)。開いている間だけ呼ばれる。 */
  onKey?: (ev: KeyboardEvent) => void;
}

export interface OpenFromElementOptions {
  /**
   * この要素を「基準要素」として覚える (popup の openAt(element))。基準要素の上の pointerdown では
   * 閉じない — 閉じると、同じ要素をもう一度押したとき pointerdown で閉じ → click で開き直す、
   * になって閉じられない。部品自身のトリガーは triggerEl が同じ役を担うので false でよい。
   */
  asAnchor?: boolean;
  /** 本体の最小幅を基準要素の幅にする (dropdown のラベル形)。 */
  minWidthFromElement?: boolean;
}

export interface FloatingMenu {
  isOpen(): boolean;
  isClosing(): boolean;
  /** 本体のクラスに付ける向き。 */
  dir(): FloatingDir;
  /** 本体の inline style (位置・高さの制限。実測中は visibility: hidden)。 */
  bodyStyle(): Record<string, string>;
  /** openAt(element) で覚えた基準要素 (閉じ終わると null)。 */
  anchorEl(): HTMLElement | null;
  /** 同じ app の中で「1 つ開いたら他を閉じる」ための自分自身。registerExclusive に渡す。 */
  exclusiveSelf: Exclusive;
  /** 閉じる (フォーカスは戻さない)。 */
  close(): void;
  /** 閉じて、開いた元の要素へフォーカスを戻す (Escape・項目の選択・トリガーの toggle)。 */
  closeAndRestoreFocus(): void;
  /**
   * 部品の公開メソッド close() 用。フォーカスが本体の中にあれば、開いた元の要素へ戻してから閉じる。
   * 本体の外にあれば、フォーカスには触らない。
   */
  closeFromApi(): void;
  /** 本体の onanimationend に渡す。閉じアニメーションの終わりで片付ける (冪等)。 */
  handleAnimEnd(): void;
  /** 毎 render 呼ぶ: 開いている間だけ document のリスナーを付ける。 */
  syncListeners(): void;
  /** 要素の矩形を基準に開く (トリガー、または openAt(element))。 */
  openFromElement(el: HTMLElement, opts?: OpenFromElementOptions): void;
  /** 点を基準に開く (openAt({ x, y }))。restoreFocusTo は閉じたときにフォーカスを戻す先。 */
  openAtPoint(x: number, y: number, restoreFocusTo: HTMLElement | null): void;
  /** リスナーを外す (部品の dispose から)。 */
  dispose(): void;
}

// 実測前に向きを仮決めするときの、本体の高さの見込み (px)
const ASSUMED_HEIGHT = 160;
// 基準と本体の間隔 (px)
const GAP = 4;

export const createFloatingMenu = (options: FloatingMenuOptions): FloatingMenu => {
  let isOpen = false;
  let isClosing = false;
  let isMeasuring = false;
  let dir: FloatingDir = 'below';
  let pos: Pos = {};
  let keydownBound = false;
  let dismissBound = false;
  let restoreFocusEl: HTMLElement | null = null;
  // openAt(element) の基準要素 (asAnchor)。閉じ終わったら null に戻す。
  let anchorEl: HTMLElement | null = null;
  // 本体をどの要素の矩形に合わせて置いたか (点で開いたときは null)。スクロールで閉じる判定の既定の基準。
  let placedFrom: HTMLElement | null = null;

  const notify = (): void => options.host()?.notify();

  // 冪等 (isClosing を見る): 実際の animationend と ANIMATION_FALLBACK_MS のタイマーの両方から呼べる。
  // ricdom-ui.css を読み込み忘れている等でアニメーションが走らないと animationend は来ないので、
  // タイマーが無いと閉じたまま DOM に残り続ける。
  const handleAnimEnd = (): void => {
    if (!isClosing) return;
    isOpen = false;
    isClosing = false;
    anchorEl = null;
    notify();
  };

  const close = (): void => {
    if (isClosing || !isOpen) return;
    isClosing = true;
    notify();
    if (typeof setTimeout !== 'undefined') setTimeout(handleAnimEnd, ANIMATION_FALLBACK_MS);
  };

  const closeAndRestoreFocus = (): void => {
    close();
    if (restoreFocusEl && typeof restoreFocusEl.focus === 'function') restoreFocusEl.focus();
  };

  // 公開メソッドの close() (2.0.0-alpha.36): 本体の中のボタンが `dd.close()` を呼ぶ使い方では、
  // そのボタンが本体ごと DOM から消えるので、フォーカスを戻さないと <body> に落ちる。
  // フォーカスが本体の外にあるとき (タイマーや外のボタンから閉じた) は、利用者がいま居る場所から
  // フォーカスを奪わないよう、何もしない。
  const closeFromApi = (): void => {
    const body = options.bodyEl();
    const focusInside = !!body && typeof document !== 'undefined' && body.contains(document.activeElement);
    if (focusInside) closeAndRestoreFocus();
    else close();
  };

  const exclusiveSelf: Exclusive = { close };

  const handleKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      closeAndRestoreFocus();
      return;
    }
    options.onKey?.(ev);
  };

  // 外側の pointerdown で閉じる (light dismiss、2.0.0-alpha.12)。HTML の popover="auto" と同じく、
  // 閉じつつ、その操作は下の要素にそのまま届く。capture で見るのは、項目側が stopPropagation()
  // していても確実に検知するため。外側クリックではフォーカスを戻さない。
  const handleOutsidePointerDown = (ev: PointerEvent): void => {
    if (!isOpen || isClosing) return;
    const target = ev.target as Node | null;
    if (!target) return;
    const body = options.bodyEl();
    if (body && body.contains(target)) return; // 本体の中では閉じない
    const triggerEl = options.triggerEl();
    if (triggerEl && triggerEl.contains(target)) return; // トリガーの上は toggle に任せる (二重に閉じない)
    if (anchorEl && anchorEl.contains(target)) return; // openAt(element) の基準要素も同じ
    close();
  };

  // 基準要素を含む領域 (またはページ) のスクロールで閉じる (2.0.0-alpha.28)。scroll は
  // バブリングしないので document の capture で受ける。判定は popupPosition.ts の shouldCloseOnScroll。
  const handleScroll = (ev: Event): void => {
    if (!isOpen || isClosing) return;
    const anchor = options.scrollAnchor ? options.scrollAnchor() : placedFrom;
    if (shouldCloseOnScroll(ev.target, anchor, options.bodyEl())) close();
  };

  const syncListeners = (): void => {
    if (typeof document === 'undefined') return;
    if (isOpen && !keydownBound) {
      document.addEventListener('keydown', handleKeydown);
      keydownBound = true;
    }
    if (!isOpen && keydownBound) {
      document.removeEventListener('keydown', handleKeydown);
      keydownBound = false;
    }
    if (isOpen && !dismissBound) {
      document.addEventListener('pointerdown', handleOutsidePointerDown, true);
      document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
      dismissBound = true;
    }
    if (!isOpen && dismissBound) {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      document.removeEventListener('scroll', handleScroll, true);
      dismissBound = false;
    }
  };

  const dispose = (): void => {
    if (typeof document === 'undefined') return;
    if (keydownBound) {
      document.removeEventListener('keydown', handleKeydown);
      keydownBound = false;
    }
    if (dismissBound) {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      document.removeEventListener('scroll', handleScroll, true);
      dismissBound = false;
    }
  };

  // 位置の計算。実測前 (measuredW が undefined = 実測 render の間) は measuringLeft() で画面の
  // 余白の位置に仮置きし、横幅の制約なしで測る (#14、2.0.0-alpha.5)。実測後は基準に揃えて
  // 画面内に収める。measuredH を渡すと、上下どちらにも入りきらないときに maxHeight で画面内に
  // 収める (2.0.0-alpha.28)。
  const posFromRect = (rect: DOMRect, chosen: FloatingDir, minWidth: boolean, measuredW?: number, measuredH?: number): Pos => ({
    top: chosen === 'below' ? rect.bottom + GAP : undefined,
    bottom: chosen === 'above' ? window.innerHeight - rect.top + GAP : undefined,
    left: measuredW === undefined ? measuringLeft() : computeAnchoredLeft(rect, measuredW),
    ...(minWidth ? { minWidth: rect.width } : {}),
    maxHeight: measuredH === undefined ? undefined : fitHeight(chosen, chosen === 'below' ? rect.bottom + GAP : rect.top - GAP, measuredH),
  });

  const posFromPoint = (x: number, y: number, chosen: FloatingDir, measuredW?: number, measuredH?: number): Pos => ({
    top: chosen === 'below' ? y + GAP : undefined,
    bottom: chosen === 'above' ? window.innerHeight - y + GAP : undefined,
    left: measuredW === undefined ? measuringLeft() : clampLeft(x, measuredW),
    maxHeight: measuredH === undefined ? undefined : fitHeight(chosen, chosen === 'below' ? y + GAP : y - GAP, measuredH),
  });

  // 開く: 他を閉じ、仮の向きと位置で非表示のまま描き、次のフレームで本体を測って決め直す。
  // dirFor / posFor は基準 (矩形か点) ごとの計算で、実測の前後どちらにも使う。
  const openMeasured = (dirFor: (height: number) => FloatingDir, posFor: (chosen: FloatingDir, measuredW?: number, measuredH?: number) => Pos): void => {
    const host = options.host();
    if (host) closeOthers(host.app, exclusiveSelf);
    dir = dirFor(ASSUMED_HEIGHT);
    pos = posFor(dir);
    const canMeasure = typeof requestAnimationFrame !== 'undefined' && typeof document !== 'undefined';
    isMeasuring = canMeasure;
    isClosing = false;
    isOpen = true;
    notify();
    if (!canMeasure) return;
    requestAnimationFrame(() => {
      if (!isOpen || isClosing) {
        isMeasuring = false;
        return;
      }
      const body = options.bodyEl();
      if (!body) {
        isMeasuring = false;
        notify();
        return;
      }
      const measuredW = body.offsetWidth;
      const measuredH = body.offsetHeight;
      dir = dirFor(measuredH);
      pos = posFor(dir, measuredW, measuredH);
      isMeasuring = false;
      notify();
    });
  };

  // 要素の矩形を基準に開く: 下端の直下に入らなければ上端の直上に反転し、横は要素に揃える。
  const openFromElement = (el: HTMLElement, opts: OpenFromElementOptions = {}): void => {
    anchorEl = opts.asAnchor ? el : null;
    restoreFocusEl = el;
    placedFrom = el;
    const rect = el.getBoundingClientRect();
    const minWidth = !!opts.minWidthFromElement;
    openMeasured(
      (height) => computeFlipDir(rect, height),
      (chosen, measuredW, measuredH) => posFromRect(rect, chosen, minWidth, measuredW, measuredH),
    );
  };

  // 点を基準に開く。基準要素を持たないので、前回の openAt(element) の値は残さない。
  const openAtPoint = (x: number, y: number, restoreFocusTo: HTMLElement | null): void => {
    anchorEl = null;
    placedFrom = null;
    restoreFocusEl = restoreFocusTo;
    openMeasured(
      (height) => computeFlipDirAt(y, height),
      (chosen, measuredW, measuredH) => posFromPoint(x, y, chosen, measuredW, measuredH),
    );
  };

  return {
    isOpen: () => isOpen,
    isClosing: () => isClosing,
    dir: () => dir,
    bodyStyle: () => ({ ...posToStyle(pos), ...(isMeasuring ? { visibility: 'hidden' } : {}) }),
    anchorEl: () => anchorEl,
    exclusiveSelf,
    close,
    closeAndRestoreFocus,
    closeFromApi,
    handleAnimEnd,
    syncListeners,
    openFromElement,
    openAtPoint,
    dispose,
  };
};
