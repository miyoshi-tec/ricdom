// ricdom/ui — createScrollPane (設計書 §3.4 部品契約)
//
// v1 (ric_ui/composite/create_ui_scroll_pane.js) の移植。「最下部 (または最上部) 追従型の
// スクロール領域」— チャット UI・ログビューアで「内容が追加されたら自動で端までスクロール、
// ただしユーザーが途中を見ている間は動かさない」を宣言的に実現する (設計OS consumer が
// 高評価だった機能)。
//
// v1 との相違点:
//   - 状態を持つので `app.use(createScrollPane(options))` で明示登録する (設計書 §3.4)。
//     `scrollToBottom()`/`scrollToTop()` は host.notify() 経由で強制スクロールを予約する
//     (v1 の safe_notify 相当)。
//   - DOM 要素の特定は v1 の `data-ric-sp` + querySelector と同じ考え方だが、
//     `data-ricdom-role` (UI_ROLE.scrollPane、E2E/CSS の安定セレクタ) とは別に
//     `data-ricdom-scroll-pane-id` (複数インスタンス識別用、popup.ts の bodyMarker と
//     同じ二層構成) を持たせる。
//
// 使い方:
//   const pane = app.use(createScrollPane({ follow: 'bottom', threshold: 50 }));
//   render 内で毎回呼ぶ: pane({ children: [...messages] })
//   強制的に端まで (例: ユーザー送信時): pane.scrollToBottom() / pane.scrollToTop()

import type { ClassValue, RicNode, StyleValue } from '../types.js';
import { type AttachGuard, type Component, createAttachGuard } from './internal/component.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export type ScrollPaneFollow = 'bottom' | 'top' | 'none';

export interface CreateScrollPaneOptions {
  /** 追従方向 (既定 'bottom') */
  follow?: ScrollPaneFollow;
  /** 端からこの px 以内なら「追従対象」とみなす (既定 50) */
  threshold?: number;
}

export interface ScrollPaneProps {
  children?: RicNode | RicNode[];
  class?: ClassValue;
  style?: StyleValue;
  [key: string]: unknown;
}

export interface ScrollPaneInstance extends Component<ScrollPaneProps> {
  scrollToBottom(): void;
  scrollToTop(): void;
}

let nextScrollPaneId = 0;

/**
 * 端まで自動追従するスクロール領域を作る (チャット UI 等)。状態を持つため `app.use()` で登録する。
 *   const pane = app.use(createScrollPane({ follow: 'bottom' }));
 *   pane({ children: [...messages] })
 */
export const createScrollPane = (options: CreateScrollPaneOptions = {}): ScrollPaneInstance => {
  const { follow = 'bottom', threshold = 50 } = options;
  const id = ++nextScrollPaneId;
  const guard: AttachGuard = createAttachGuard('createScrollPane');

  let followNow = false; // render 前に計測した「追従すべきか」
  let forceTo: 'bottom' | 'top' | null = null;

  // 利用者が端から離れたか (2.0.0-alpha.36、設計書 §55)。
  // render の時点の位置だけで判定すると、内容が増え続けている間 (チャットの応答が流れている間) は
  // 端から離れられない:
  //   - 「端にいた」と測ってから scrollTop を書くまでに 1 フレームある。その間のスクロールは
  //     上書きされる (ホイール 1 目盛りが毎フレーム戻される)
  //   - 1 回の移動が threshold より小さい操作 (↑キーは 40px) は、何度やっても「まだ端の近く」
  //     と判定されて戻される
  // そこで scroll イベントで「端から離れる向きに動いた」ことを見て、その時点で追従をやめる。
  // 端 (threshold 以内) まで戻ったら再開する。scroll イベントは描画の更新の中で rAF の
  // コールバックより先に配られるので、書き込みの直前に見れば間に合う。
  // 自分の書き込みで起きる scroll イベントは「端へ向かう動き」なので、特別扱いは要らない。
  // 内容が減ってブラウザが scrollTop を押し戻した場合は「離れる向き」に見えるが、行き先が
  // 端そのものなので、先に「端にいるか」を見て区別する。
  let userAway = false;
  let lastTop: number | null = null;
  const distanceFromEnd = (el: HTMLElement): number => (follow === 'bottom' ? el.scrollHeight - el.scrollTop - el.clientHeight : el.scrollTop);
  const noteScroll = (el: HTMLElement): void => {
    if (follow === 'none') return;
    const top = el.scrollTop;
    const movedAway = lastTop !== null && (follow === 'bottom' ? top < lastTop : top > lastTop);
    lastTop = top;
    const dist = distanceFromEnd(el);
    if (dist <= 1) userAway = false;
    else if (movedAway) userAway = true;
    else if (dist <= threshold) userAway = false;
  };

  // rAF + setTimeout(200ms) バックストップの二重化用の状態 (LCP #5)。
  // 「先に来た方が実行し、後発は no-op」はコアの描画スケジューラ (src/scheduler.ts) と
  // 同じ考え方 (コア自体は import せず、同じアルゴリズムをここに複製する — 状態が
  // インスタンスごとに閉じているべきで、かつ createScrollPane はコア (src/*.ts 直下) の
  // 一部ではないため)。
  let applyScheduled = false;
  let applyRafId: number | null = null;
  let applyBackstopId: ReturnType<typeof setTimeout> | null = null;

  const findEl = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector(`[data-ricdom-scroll-pane-id="${id}"]`));

  const shouldFollow = (el: HTMLElement): boolean => {
    if (follow === 'bottom') return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    if (follow === 'top') return el.scrollTop <= threshold;
    return false;
  };

  // rAF 後にスクロール位置を適用する (render で計測した状態を実 DOM に反映)
  const applyScroll = (): void => {
    const el = findEl();
    if (!el) return;
    if (forceTo === 'bottom') el.scrollTop = el.scrollHeight;
    else if (forceTo === 'top') el.scrollTop = 0;
    // userAway は書き込みの直前に見る (render の後に届いた scroll イベントを反映するため)
    else if (followNow && !userAway) {
      if (follow === 'bottom') el.scrollTop = el.scrollHeight;
      else if (follow === 'top') el.scrollTop = 0;
    }
    // 強制スクロールは「そこへ行く」という利用者側の指示なので、追従の向きと同じなら再開する
    if (forceTo === follow) userAway = false;
    lastTop = el.scrollTop;
    forceTo = null;
    followNow = false;
  };

  // requestAnimationFrame だけに頼ると、hidden ウィンドウ (Electron の隠れウィンドウ・
  // 最小化タブ等) では rAF が止まり追従が効かなくなる (LCP #5、コアのスケジューラが
  // v1 から抱えているのと同じ問題)。rAF と setTimeout(200ms) の両方を張り、先に来た方が
  // 適用して後発は no-op にする (applyScheduled フラグでガード)。
  const scheduleApplyScroll = (): void => {
    if (applyScheduled) return; // 同一フレーム内の重複予約を防ぐ
    applyScheduled = true;
    const run = (): void => {
      if (!applyScheduled) return; // 相方が既に処理済み
      applyScheduled = false;
      applyRafId = null;
      if (applyBackstopId !== null) {
        clearTimeout(applyBackstopId);
        applyBackstopId = null;
      }
      applyScroll();
    };
    if (typeof requestAnimationFrame !== 'undefined') applyRafId = requestAnimationFrame(run);
    if (typeof setTimeout !== 'undefined') applyBackstopId = setTimeout(run, 200);
  };

  const inst = ((props: ScrollPaneProps = {}): RicNode => {
    const host = guard.ensure();
    if (!host) return null;

    const { children = [], class: extraClass, style, onscroll, ...rest } = props;

    // render 前に「追従中か」を計測。DOM がまだ無い場合 (初回) は false。
    const el = findEl();
    if (el) {
      followNow = shouldFollow(el);
      if (lastTop === null) lastTop = el.scrollTop;
    }

    // 描画後にスクロール位置を適用する (rAF + 200ms バックストップの二重化、LCP #5)
    scheduleApplyScroll();

    return {
      ...rest,
      tag: 'div',
      class: mergeClass('ric-scroll-pane', extraClass),
      'data-ricdom-role': UI_ROLE.scrollPane,
      'data-ricdom-scroll-pane-id': String(id),
      style: { ...(style ?? {}), overflowY: 'auto' },
      // 端から離れたかを見る (上のコメント)。利用者が渡した onscroll も呼ぶ。
      onscroll: (ev: Event) => {
        noteScroll(ev.currentTarget as HTMLElement);
        if (typeof onscroll === 'function') (onscroll as (ev: Event) => void)(ev);
      },
      children,
    } as unknown as RicNode;
  }) as ScrollPaneInstance;

  inst.attach = guard.attach;
  inst.dispose = (): void => {
    // 保留中の rAF/バックストップを解除する (unmount 後に発火して findEl() が null を
    // 返すだけの空振りになるとはいえ、タイマーを残さないほうが行儀が良い)。
    if (applyScheduled) {
      applyScheduled = false;
      if (applyRafId !== null) {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(applyRafId);
        applyRafId = null;
      }
      if (applyBackstopId !== null) {
        clearTimeout(applyBackstopId);
        applyBackstopId = null;
      }
    }
    guard.dispose();
  };

  inst.scrollToBottom = (): void => {
    forceTo = 'bottom';
    guard.host?.notify();
  };
  inst.scrollToTop = (): void => {
    forceTo = 'top';
    guard.host?.notify();
  };

  return inst;
};
