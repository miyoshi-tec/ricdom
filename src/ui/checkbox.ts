// ricdom/ui — uiCheckbox (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/control/ui_checkbox.js) の camelCase 移植。チェックボックス + ラベルをまとめた
// control 部品。
//
// rest スプレッド契約 (v1 A15 継承): rest は外側の <label> に付く (onclick 等の wrapper
// ハンドラを想定)。checked/onchange は内部 <input> に掛ける必要があるため rest には
// 入れない — 隔離契約 (設計書付録 B「内部 input を持つコンポーネント」): 外側 wrapper 要素に
// checked/onchange は漏れない。
//
// v1 は `checked ? 1 : 0` の numeric 変換で `el.checked = val` のプロパティパスを強制していた
// (v1 B15、checked が DOM 属性として setAttribute される事故を避けるため)。v2 のコアは
// `checked` を DOM_PROPERTY_KEYS に含み、常にプロパティ代入 (`el.checked = val`) を行うため
// (src/dom.ts)、boolean をそのまま渡せば型で吸収される (設計書 §3.4 / B15 の解消)。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiCheckboxProps {
  children?: RicNode | RicNode[];
  checked?: boolean;
  disabled?: boolean;
  class?: ClassValue;
  // rest スプレッド経由で常に透過されていたが、型に無かった (LCP の指摘、2.0.0-alpha.9)。
  // 隔離契約はファイル先頭のコメント参照。
  /** inline style。任意の属性と同じく要素にそのまま渡る (型の補完用に宣言している)。
   *  外側の <label> ラッパーに付く (checked/onchange だけが内部の input に付く)。 */
  style?: StyleValue;
  onchange?: (ev: Event) => void;
  [key: string]: unknown;
}

/**
 * チェックボックス + ラベル。状態を持たない純粋関数 (双方向バインドは `bindCheckbox` 参照)。
 *   uiCheckbox({ checked: s.agree, children: ['同意する'], onchange: (ev) => { s.agree = ev.target.checked; } })
 */
export const uiCheckbox = ({ children = [], checked = false, disabled = false, class: extraClass, onchange, ...rest }: UiCheckboxProps = {}): RicNode => {
  const childArray = Array.isArray(children) ? children : [children];
  const baseClass = disabled ? 'ric-checkbox ric-checkbox--disabled' : 'ric-checkbox';
  return {
    ...rest,
    tag: 'label',
    class: mergeClass(baseClass, extraClass),
    'data-ricdom-role': UI_ROLE.checkbox,
    children: [
      {
        tag: 'input',
        type: 'checkbox',
        checked,
        ...(onchange ? { onchange } : {}),
        ...(disabled ? { disabled: true } : {}),
      },
      // ラベルテキストがある場合は span で包む
      ...(childArray.length ? [{ tag: 'span', children: childArray }] : []),
    ],
  } as RicElementNode;
};
