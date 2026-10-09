// ricdom/ui — createToast (設計書 §3.4 部品契約 + §5/付録 E a11y)
//
// v1 (ric_ui/popup/create_ui_toast.js) の移植。v1 との相違点は portal の描画先が
// host.portal になったこと (§3.5)、app.use() 経由でしか動かないこと (§3.4) に加えて、
// a11y (role="status"/"alert" + aria-live) — v1 には無く、v2 で新設した
// (v1_parity_audit #8。v1 は data-ric-role のみで aria 属性を持たず、スクリーンリーダーは
// トースト表示に気づけなかった)。
//
// 使い方:
//   const toast = app.use(createToast());
//   render 内で毎回呼ぶ (登録のみ、戻り値は null): toast();
//   どこからでも: toast.show('保存しました', { type: 'success', duration: 3000 });
//                 toast.show('エラー', { type: 'error', duration: 0 }); // 0 = 自動消去なし

import type { RicNode } from '../types.js';
import { ANIMATION_FALLBACK_MS, type AttachGuard, type Component, createAttachGuard } from './internal/component.js';
import { UI_ROLE } from './internal/pureHelpers.js';

export type ToastType = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface ToastShowOptions {
  type?: ToastType;
  /** ミリ秒。0 で自動消去なし (Esc/✕ での手動クローズのみ)。既定 3000。 */
  duration?: number;
}

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
  closing: boolean;
  entering: boolean;
}

export interface ToastInstance extends Component<void> {
  show: (msg: string, options?: ToastShowOptions) => void;
}

/**
 * トースト通知キューを作る。状態を持つため `app.use(createToast())` で登録する。
 *   const toast = app.use(createToast());
 *   toast.show('保存しました', { type: 'success' });
 */
export const createToast = (): ToastInstance => {
  const guard: AttachGuard = createAttachGuard('createToast', { topLayer: true });
  const items: ToastItem[] = [];
  let nextId = 0;

  // remove は「見つかれば消す」だけの冪等な処理 (2 回目は findIndex が -1 で no-op)。
  // 実 animationend と ANIMATION_FALLBACK_MS のフォールバックタイマーの両方から
  // 安全に呼べる。consumer が ricdom-ui.css を読み込み忘れている等でアニメーションが
  // 走らない場合、animationend が永久に発火せず toast が消えないまま残るのを防ぐ。
  const remove = (id: number): void => {
    const idx = items.findIndex((x) => x.id === id);
    if (idx >= 0) items.splice(idx, 1);
    guard.host?.notify();
  };

  const beginClose = (item: ToastItem): void => {
    if (item.closing) return;
    item.closing = true;
    guard.host?.notify();
    if (typeof setTimeout !== 'undefined') setTimeout(() => remove(item.id), ANIMATION_FALLBACK_MS);
  };

  const inst = (() => {
    guard.ensure();
    return null;
  }) as ToastInstance;

  inst.renderPortal = (): RicNode => {
    if (!guard.host || items.length === 0) return null;
    return {
      tag: 'div',
      class: 'ric-toast__container',
      'data-ricdom-role': UI_ROLE.toast,
      children: items.map((item) => ({
        tag: 'div',
        class: `ric-toast__item${item.entering ? ' ric-toast__item--in' : ''}${item.type !== 'default' ? ` ric-toast__item--${item.type}` : ''}${item.closing ? ' ric-toast__item--out' : ''}`,
        role: item.type === 'error' ? 'alert' : 'status',
        'aria-live': item.type === 'error' ? 'assertive' : 'polite',
        'data-ricdom-role': UI_ROLE.toastItem,
        onanimationend: item.closing ? () => remove(item.id) : item.entering ? () => { item.entering = false; } : undefined,
        children: [
          { tag: 'span', class: 'ric-toast__msg', 'data-ricdom-role': UI_ROLE.toastMsg, children: [item.msg] },
          { tag: 'button', class: 'ric-toast__close', 'data-ricdom-role': UI_ROLE.toastClose, 'aria-label': 'Close', onclick: () => beginClose(item), children: ['✕'] },
        ],
      })),
    } as unknown as RicNode;
  };

  inst.attach = guard.attach;
  inst.dispose = (): void => {
    items.length = 0;
    guard.dispose();
  };

  inst.show = (msg: string, options: ToastShowOptions = {}): void => {
    const { type = 'default', duration = 3000 } = options;
    const item: ToastItem = { id: nextId++, msg, type, closing: false, entering: true };
    items.push(item);
    guard.host?.notify();
    if (duration > 0) setTimeout(() => beginClose(item), duration);
  };

  return inst;
};
