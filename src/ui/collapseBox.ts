// ricdom/ui — createCollapseBox (設計書 §3.4 部品契約 + 付録 E a11y)
//
// v1 (ric_ui/composite/create_ui_collapse_box.js) の移植。子要素を「アニメーションしながら
// 現れる/消える」コンテナの汎用 primitive。**複数 instance 対応** (v1 v0.3.11〜継承):
// 1 factory を `key` で区別される多数の独立アニメーションに使える (sparse list animation 用途)。
//
// v1 との相違点:
//   - 状態を持つので `app.use(createCollapseBox(options))` で明示登録する (設計書 §3.4)。
//   - **完了検知は `transitionend` + 700ms setTimeout backstop** (§13 で確立した
//     animationend+backstop の考え方を transitionend に適用したもの)。v1 も元々
//     `ontransitionend` を使っていた (height/width は個体ごとに実測値が異なる動的な
//     ターゲットなので、値が固定な CSS `@keyframes` では表現できない — `transition` が
//     正しい選択)。ANIMATION_FALLBACK_MS の setTimeout backstop を追加で併設し、
//     consumer が ricdom-ui.css を読み込み忘れる等で transition 自体が発火しない場合でも
//     「開閉が完了しない」が起きない構造にする (dialog/popup/toast と同じ設計判断。
//     設計書の「animationend + 700ms バックストップ」を文字通り animationend にしなかった
//     判断は最終報告の §15 候補に記載)。
//   - a11y (v1 未対応、今回の追加): collapseBox 自体には開閉ボタンが無い (v1 から
//     ヘッドレスな primitive) ため、`aria-expanded` は付けられる側 (consumer が用意する
//     trigger) に置くのが正しい。collapseBox は代わりに各 key に対応する安定 `id`
//     (未指定なら自動生成) を要素に付与し、`inst.idFor(key)` で取得できるようにする —
//     consumer は自分の trigger に `aria-expanded={visible}` +
//     `aria-controls={box.idFor(key)}` を付ければ APG の disclosure パターンを満たせる
//     (createAccordion のように専用の trigger を持つ部品とはここが異なる、最終報告に記載)。
//
// 使い方:
//   const box = app.use(createCollapseBox({ direction: 'v', duration: 200 }));
//   単独 (key 省略 → 内部的に '_default'): box({ visible: s.expanded, children: [...] })
//   複数 (sparse animation):
//     children: sorted.map((f) => animating.has(f.path)
//       ? box({ key: f.path, visible: animating.get(f.path), children: [row] })
//       : row)

import type { RicNode } from '../types.js';
import { ANIMATION_FALLBACK_MS, type AttachGuard, type Component, createAttachGuard } from './internal/component.js';
import { UI_ROLE } from './internal/pureHelpers.js';

export type CollapseBoxDirection = 'v' | 'h' | 'both';

export interface CreateCollapseBoxOptions {
  direction?: CollapseBoxDirection;
  duration?: number;
  easing?: string;
}

export interface CollapseBoxProps {
  /** 複数インスタンス識別用のキー (省略時 '_default') */
  key?: string;
  visible?: boolean;
  children?: RicNode | RicNode[];
  /** 要素の id を明示指定したいとき (省略時は自動生成、aria-controls 用に安定) */
  id?: string;
}

export interface CollapseBoxInstance extends Component<CollapseBoxProps> {
  /** 指定 key (省略時 '_default') が entering/closing アニメーション中か */
  isAnimating(key?: string): boolean;
  /** 指定 key (省略時 '_default') が現在描画する要素の id (aria-controls 用) */
  idFor(key?: string): string;
}

interface BoxState {
  open: boolean;
  entering: boolean;
  closing: boolean;
  tw: number;
  th: number;
  // 現在の entering/closing フェーズ用に ANIMATION_FALLBACK_MS backstop を既にスケジュール
  // 済みか。render のたびに際限なく setTimeout を積み増さないためのガード
  // (1 フェーズにつき 1 回だけ仕掛ける)。
  backstopArmed: boolean;
}

let nextFactoryId = 0;

/**
 * 開閉をアニメーションするコンテナ primitive を作る (複数 instance は `key` で区別)。
 *   const box = app.use(createCollapseBox({ direction: 'v' }));
 *   box({ visible: s.expanded, children: [...] })
 */
export const createCollapseBox = (options: CreateCollapseBoxOptions = {}): CollapseBoxInstance => {
  const { direction = 'v', duration = 200, easing = 'ease' } = options;
  const fid = ++nextFactoryId;
  const doH = direction !== 'h';
  const doW = direction !== 'v';
  const transitionValue = [doW && `width ${duration}ms ${easing}`, doH && `height ${duration}ms ${easing}`].filter(Boolean).join(', ');

  const guard: AttachGuard = createAttachGuard('createCollapseBox');

  // key → state。closing 完了 / corner case の即 closed で entry を delete する (GC、v1 継承)。
  const states = new Map<string, BoxState>();
  const newState = (): BoxState => ({ open: false, entering: false, closing: false, tw: 0, th: 0, backstopArmed: false });

  const attrValue = (key: string): string => `${fid}-${encodeURIComponent(key)}`;
  const idFor = (key = '_default'): string => `ricdom-collapse-box-${attrValue(key)}`;

  const findEl = (key: string): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-collapse-box-id="${attrValue(key)}"]`));

  // entering 中の rAF コールバック: natural サイズを測って tw/th を更新し、再描画を予約する。
  const measure = (key: string): void => {
    const st = states.get(key);
    if (!st || !st.entering) return;
    const el = findEl(key);
    if (!el) return;
    if (doW) st.tw = el.scrollWidth;
    if (doH) st.th = el.scrollHeight;
    // 測った大きさが 0 (中身が空) なら、動かすものが無い: `0px → 0px` では transition が起きず
    // transitionend も来ないので、ここで「開いている途中」を終える。終えないと保険のタイマー
    // (ANIMATION_FALLBACK_MS) まで height: 0px が付いたままになり、その間に足された中身が
    // 見えない (2.0.0-alpha.36、空のフォルダを開いてから値を足す操作で実際に起きた)。
    if ((!doH || st.th === 0) && (!doW || st.tw === 0)) st.entering = false;
    guard.host?.notify();
  };

  const inst = ((props: CollapseBoxProps = {}): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    const { key = '_default', visible = false, children = [], id } = props;
    let st = states.get(key);

    // ── 状態遷移 (v1 継承) ──
    if (visible && !st) {
      // 通常 enter (mount)
      st = newState();
      st.open = true;
      st.entering = true;
      states.set(key, st);
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => measure(key));
    } else if (visible && st && st.closing) {
      // 中断: closing → entering (再 measure。transition は VDOM diff が発動)
      st.closing = false;
      st.entering = true;
      st.backstopArmed = false; // フェーズが変わったので backstop を仕切り直す
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => measure(key));
    } else if (!visible && st && !st.closing) {
      // 通常 close (entering 中断含む)
      st.entering = false;
      // open 中に content が変わって th が古くなっている可能性があるので、この瞬間の
      // DOM の natural size を再測定する (close の起点を確定させる)。
      const el = findEl(key);
      if (el) {
        if (doW) st.tw = el.scrollWidth;
        if (doH) st.th = el.scrollHeight;
      }
      if (st.th === 0 && st.tw === 0) {
        // 測定値も 0 (content 空/未マウント/entering 直後の連打) なら animate せず即 closed
        st.open = false;
      } else {
        st.closing = true;
        st.backstopArmed = false; // フェーズが変わったので backstop を仕切り直す
        const closingState = st;
        // 2 段クロージング: CSS transition は `auto → 0px` を補間しないので、
        //   1) 今フレームの render で `height: Npx` を inline style に焼き付ける
        //   2) 次の rAF で th/tw = 0 にして再描画 → `height: 0px` を emit
        //   3) browser が Npx → 0px を transition で補間
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => {
            if (!closingState.closing) return; // 中断 (closing → entering) されていたら no-op
            if (doW) closingState.tw = 0;
            if (doH) closingState.th = 0;
            guard.host?.notify();
          });
        } else {
          // rAF が無い環境 (SSR 等、本来ここに到達しない safety net)。animation 自体が
          // 動かないので th/tw を即 0 にして閉じ切った状態にする。
          if (doW) st.tw = 0;
          if (doH) st.th = 0;
        }
      }
    }
    // visible && st && (entering/open/closing→entering 既処理): 何もしない (steady state)
    // !visible && !st: state 未存在 = 既に closed、何もしない

    // 描画不要 (= 完全に closed) なら state を GC して null を返す
    if (!st || (!st.open && !st.closing)) {
      if (st) states.delete(key);
      return null;
    }

    const style: Record<string, string> = { overflow: 'hidden', transition: transitionValue };
    if (st.entering || st.closing) {
      if (doH) style.height = `${st.th}px`;
      if (doW) style.width = `${st.tw}px`;
    }

    const closureState = st;
    const onTransitionEnd = (ev: TransitionEvent): void => {
      if (ev.propertyName !== 'width' && ev.propertyName !== 'height') return;
      const cur = states.get(key);
      if (!cur || cur !== closureState) return; // state が外から delete されている corner case を保護
      if (closureState.closing) {
        closureState.open = false;
        closureState.closing = false;
        states.delete(key); // closing 完了 → GC
        guard.host?.notify();
      } else if (closureState.entering) {
        closureState.entering = false;
        guard.host?.notify();
      }
    };

    // ANIMATION_FALLBACK_MS の setTimeout backstop (transitionend が consumer の
    // ricdom-ui.css 未読み込み等で発火しない場合の保険、ヘッダコメント参照)。
    // onTransitionEnd 自体が「まだこのフェーズの state か」を見て冪等に振る舞うので、
    // 実 transitionend と backstop のどちらが先に来ても安全 — backstopArmed は
    // 「render のたびに setTimeout を際限なく積み増さない」ためだけのガード。
    if ((st.entering || st.closing) && !st.backstopArmed) {
      st.backstopArmed = true;
      if (typeof setTimeout !== 'undefined') {
        setTimeout(() => onTransitionEnd({ propertyName: doH ? 'height' : 'width' } as TransitionEvent), ANIMATION_FALLBACK_MS);
      }
    }

    return {
      tag: 'div',
      id: id ?? idFor(key),
      class: `ric-collapse-box${st.entering ? ' ric-collapse-box--entering' : ''}${st.closing ? ' ric-collapse-box--closing' : ''}`,
      'data-ricdom-role': UI_ROLE.collapseBox,
      'data-ricdom-collapse-box-id': attrValue(key),
      // 論理的な可視性 (v1 v0.3.22〜継承): closing 中は "false"、それ以外 (entering/open) は
      // "true"。完全に閉じた状態 (= DOM 上に要素が無い) は存在チェック側で判別する。
      'data-ricdom-visible': st.closing ? 'false' : 'true',
      style,
      ontransitionend: onTransitionEnd,
      children,
    } as unknown as RicNode;
  }) as CollapseBoxInstance;

  inst.attach = guard.attach;
  inst.dispose = (): void => {
    states.clear();
    guard.dispose();
  };

  inst.isAnimating = (key = '_default'): boolean => {
    const st = states.get(key);
    return !!(st && (st.entering || st.closing));
  };
  inst.idFor = idFor;

  return inst;
};
