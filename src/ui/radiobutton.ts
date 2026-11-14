// ricdom/ui — uiRadiobutton (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/control/ui_radiobutton.js) の camelCase 移植。ui_select と同じ options
// インターフェースを持つラジオボタングループ。
//
// options: string[] または { value, label }[] を受け付ける。label は文字列・数値のほか
// RicNode (uiIcon 等) やその配列も渡せる (例: label: [uiIcon(...), ' List'])。
// 各選択肢の追加キー (title/data-*/id/class 等) は per-option 属性転送として、その
// 選択肢の <label> に転送される (v1 v0.3.32〜、rest スプレッド契約の per-option 版)。
//
// checked: v1 は `checked ? 1 : 0` の numeric 変換で el.checked = val のプロパティパスを
// 強制していたが、v2 のコアは checked を常にプロパティ代入するため (src/dom.ts の
// DOM_PROPERTY_KEYS)、boolean をそのまま渡せば型で吸収される (uiCheckbox と同じ理由、B15 解消)。
//
// ⚠️ name の既知制約 (v1 bind_radiobutton.js の JSDoc を移植): name はブラウザが「同じ name の
//   radio input を 1 グループとして扱う」ための識別子であり、RicDOM 側での回避策は無い。
//   同一ページに独立した複数のラジオボタングループを置く場合は、name を必ず別々にすること
//   (同じ name を共有すると、意図せず 1 つのグループとして連動してしまう — ブラウザネイティブの
//   仕様であり、RicDOM 固有のバグではない)。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiRadiobuttonOption {
  value: string;
  label?: RicNode | RicNode[];
  [key: string]: unknown;
}

export interface UiRadiobuttonProps {
  name: string;
  value?: string;
  options?: (string | UiRadiobuttonOption)[];
  disabled?: boolean;
  class?: ClassValue;
  /** rest スプレッド経由で常に透過されていたが、型に無かった (LCP の指摘、2.0.0-alpha.9)。
   *  外側の .ric-radiogroup ラッパーに付く。 */
  style?: StyleValue;
  onchange?: (ev: Event) => void;
  [key: string]: unknown;
}

// options を { value, label, ...rest } 形式に正規化する
// label を省略した { value } は value を表示する (uiSelect と同じ。2.0.0-alpha.30 までは
// labelChildren の String(undefined) で「undefined」と表示されていた)。
const normalizeOption = (opt: string | UiRadiobuttonOption): UiRadiobuttonOption => (typeof opt === 'string' ? { value: opt, label: opt } : { ...opt, label: opt.label ?? opt.value });

// label を children 配列に変換する。
//   配列        → そのまま children (例: [uiIcon(...), ' List'])
//   RicNode     → 単一要素 children (uiIcon 等のオブジェクト)
//   文字列/数値 → String 化
const labelChildren = (l: RicNode | RicNode[] | undefined): RicNode[] => {
  if (Array.isArray(l)) return l;
  if (l != null && typeof l === 'object') return [l];
  return [String(l)];
};

/**
 * ラジオボタングループ。状態を持たない純粋関数。
 *   uiRadiobutton({ name: 'role', value: s.role, options: ['viewer', 'editor'], onchange: (ev) => { s.role = ev.target.value; } })
 */
export const uiRadiobutton = ({ name, value = '', options = [], disabled = false, class: extraClass, onchange, ...rest }: UiRadiobuttonProps): RicNode => {
  const strVal = String(value);

  const radioNodes = options.map((opt) => {
    const { value: v, label: l, ...optRest } = normalizeOption(opt);
    const strV = String(v);
    const clsBase = disabled ? 'ric-radio ric-radio--disabled' : 'ric-radio';
    return {
      ...optRest,
      tag: 'label',
      class: mergeClass(clsBase, optRest.class as ClassValue | undefined),
      children: [
        {
          tag: 'input',
          type: 'radio',
          name,
          value: strV,
          checked: strV === strVal,
          ...(onchange ? { onchange } : {}),
          ...(disabled ? { disabled: true } : {}),
        },
        { tag: 'span', class: 'ric-radio__label', children: labelChildren(l) },
      ],
    } as RicElementNode;
  });

  return {
    ...rest,
    tag: 'div',
    class: mergeClass('ric-radiogroup', extraClass),
    'data-ricdom-role': UI_ROLE.radiogroup,
    children: radioNodes,
  } as RicElementNode;
};
