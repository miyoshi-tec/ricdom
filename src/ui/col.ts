// ricdom/ui — uiCol (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/layout/ui_col.js) の camelCase 移植。縦方向フレックスコンテナ。
// gap は CSS 変数 (--ric-gap-md) から自動で取得される。色・背景は持たない
// (v2 に page 部品が無いため、テーマ変数は applyTheme(el) が当てた祖先要素から継承する)。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiColProps {
  // v1 parity (2.0.0-alpha.2)。経緯は row.ts の UiRowProps.gap のコメント参照。
  /** 子要素の間隔。uiRow の `gap` と同じ意味・実装 (`style.gap` に書く。数値は px 扱い)。 */
  gap?: string | number;
  children?: RicNode | RicNode[];
  style?: StyleValue;
  class?: ClassValue;
  [key: string]: unknown;
}

/**
 * 縦方向フレックスコンテナ。状態を持たない純粋関数。
 *   uiCol({ children: [uiText({ children: ['a'] }), uiText({ children: ['b'] })] })
 */
export const uiCol = ({ children = [], style, gap, class: extraClass, ...rest }: UiColProps = {}): RicNode => {
  const finalStyle: StyleValue | undefined = gap !== undefined ? { ...style, gap: typeof gap === 'number' ? `${gap}px` : gap } : style;
  return {
    ...rest,
    tag: 'div',
    class: mergeClass('ric-col', extraClass),
    'data-ricdom-role': UI_ROLE.col,
    ...(finalStyle ? { style: finalStyle } : {}),
    children,
  } as RicElementNode;
};
