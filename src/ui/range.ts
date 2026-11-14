// ricdom/ui — uiRange (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/control/ui_range.js) の camelCase 移植。スライダー入力 + 現在値表示。
// ホイールでステップ単位の増減が可能。
//
// rest スプレッド契約 (v1 A15 継承): rest は外側のラッパー <div class="ric-range"> に付く。
// oninput/min/max/step/value は内部 <input> に掛けるため rest には入れない (隔離契約)。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiRangeProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  class?: ClassValue;
  // rest スプレッド経由で常に透過されていたが、型に無かった (LCP の指摘、2.0.0-alpha.9)。
  // 隔離契約はファイル先頭のコメント参照。
  /** inline style。任意の属性と同じく要素にそのまま渡る (型の補完用に宣言している)。
   *  外側の .ric-range ラッパーに付く (oninput/min/max/step/value だけが内部の input に付く)。 */
  style?: StyleValue;
  oninput?: (ev: Event) => void;
  [key: string]: unknown;
}

/**
 * スライダー入力 + 現在値表示。状態を持たない純粋関数 (双方向バインドは `bindRange` 参照)。
 *   uiRange({ value: s.volume, min: 0, max: 100, oninput: (ev) => { s.volume = +ev.target.value; } })
 */
export const uiRange = ({ value = 0, min = 0, max = 100, step = 1, disabled = false, class: extraClass, oninput, ...rest }: UiRangeProps = {}): RicNode => {
  const stepNum = Number(step) || 1;
  const minNum = Number(min);
  const maxNum = Number(max);

  const clamp = (v: number): number => Math.min(maxNum, Math.max(minNum, v));
  const align = (v: number): number => {
    const base = Number.isFinite(minNum) ? minNum : 0;
    return Number((Math.round((v - base) / stepNum) * stepNum + base).toFixed(6));
  };

  return {
    ...rest,
    tag: 'div',
    class: mergeClass('ric-range', extraClass),
    'data-ricdom-role': UI_ROLE.range,
    children: [
      {
        tag: 'input',
        type: 'range',
        min: String(min),
        max: String(max),
        step: String(step),
        value: String(value),
        ...(disabled ? { disabled: true } : {}),
        ...(oninput ? { oninput } : {}),
        onwheel: (ev: WheelEvent) => {
          ev.preventDefault();
          const target = ev.target as HTMLInputElement;
          const now = Number(target.value) || 0;
          const delta = ev.deltaY < 0 ? stepNum : -stepNum;
          const next = align(clamp(now + delta));
          target.value = String(next);
          oninput?.({ target: { value: String(next) } } as unknown as Event);
        },
      },
      { tag: 'span', class: 'ric-range__value', children: [String(value)] },
    ],
  } as RicElementNode;
};
