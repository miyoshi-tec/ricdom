// ricdom/ui — uiSeparator (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/control/ui_separator.js) の camelCase 移植。水平区切り線 (装飾要素)。
// rest スプレッド契約 (v1 A15 継承): id/data-*/aria-*/style 等の任意属性を透過する。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiSeparatorProps {
  class?: ClassValue;
  // rest スプレッド経由で常に透過されていたが、型に無かった (LCP の指摘、2.0.0-alpha.9)。
  /** inline style。任意の属性と同じく要素にそのまま渡る (型の補完用に宣言している)。 */
  style?: StyleValue;
  [key: string]: unknown;
}

/**
 * 水平区切り線 (装飾要素)。状態を持たない純粋関数。
 *   uiSeparator()
 */
export const uiSeparator = ({ class: extraClass, ...rest }: UiSeparatorProps = {}): RicNode =>
  ({
    ...rest,
    tag: 'hr',
    class: mergeClass('ric-separator', extraClass),
    'data-ricdom-role': UI_ROLE.separator,
  }) as RicElementNode;
