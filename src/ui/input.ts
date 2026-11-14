// ricdom/ui — uiInput (設計書 E: 検証用の純粋関数部品)
//
// v1 (ric_ui/control/ui_input.js) の camelCase 移植。既定で width:100% (CSS 側)。
// rest スプレッド契約 + 内部 input 隔離 (v1 A15 継承、設計書 E): 計算済み tag/class/type/value
// を rest の後に置き、rest からの上書きを防ぐ。value は常に含める (空文字でも
// `el.value = ''` が確実に走るよう、FORCE_REAPPLY 対象キーであることを尊重する)。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiInputProps {
  placeholder?: string;
  value?: string;
  type?: string;
  // v1 ui_input.js 継承、v1→v2 パリティ一括監査 #6。属性名も v1 と同じ。
  /** 最大入力文字数。属性名は小文字 `maxlength` (uiTextarea の同名プロパティと揃えている)。 */
  maxlength?: number;
  disabled?: boolean;
  class?: ClassValue;
  // rest スプレッド経由で常に透過されていたが、型に無かった (LCP の指摘、2.0.0-alpha.9)。
  /** inline style。任意の属性と同じく要素にそのまま渡る (型の補完用に宣言している)。 */
  style?: StyleValue;
  oninput?: (ev: Event) => void;
  [key: string]: unknown;
}

/**
 * テキスト入力。状態を持たない純粋関数 (controlled、双方向バインドは `bindInput` 参照)。
 *   uiInput({ value: s.name, oninput: (ev) => { s.name = ev.target.value; } })
 */
export const uiInput = ({ placeholder, value = '', type = 'text', maxlength, disabled = false, class: extraClass, ...rest }: UiInputProps = {}): RicNode =>
  ({
    ...rest,
    tag: 'input',
    class: mergeClass('ric-input', extraClass),
    'data-ricdom-role': UI_ROLE.input,
    type,
    value, // 常に含める (空文字でも FORCE_REAPPLY で反映されるよう)
    ...(placeholder ? { placeholder } : {}),
    ...(disabled ? { disabled: true } : {}),
    ...(maxlength != null ? { maxlength } : {}),
  }) as RicElementNode;
