// ricdom/ui — uiRow (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/layout/ui_row.js) の camelCase 移植。横方向フレックスコンテナ。
// gap は CSS 変数 (--ric-gap-md) から自動で取得される。色・背景は持たない。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiRowProps {
  // v1 parity (2.0.0-alpha.2、パイロット第 2 号の報告 — v1 `ui_row({gap})` は正式 prop
  // だったが、v2 は当初 rest スプレッドに紛れて `setAttribute('gap', ...)` になり
  // 黙って効かなくなっていた、25 箇所以上で発生)。省略時の値は既存 CSS の既定値のまま (変更なし)。
  /**
   * 子要素の間隔。`style.gap` に書く。数値は px 扱い。
   * 省略時はテーマの `--ric-gap-md`。
   */
  gap?: string | number;
  children?: RicNode | RicNode[];
  style?: StyleValue;
  class?: ClassValue;
  [key: string]: unknown;
}

/**
 * 横方向フレックスコンテナ。状態を持たない純粋関数。
 *   uiRow({ children: [uiButton({ children: ['OK'] }), uiButton({ children: ['Cancel'] })] })
 */
export const uiRow = ({ children = [], style, gap, class: extraClass, ...rest }: UiRowProps = {}): RicNode => {
  const finalStyle: StyleValue | undefined = gap !== undefined ? { ...style, gap: typeof gap === 'number' ? `${gap}px` : gap } : style;
  return {
    ...rest,
    tag: 'div',
    class: mergeClass('ric-row', extraClass),
    'data-ricdom-role': UI_ROLE.row,
    ...(finalStyle ? { style: finalStyle } : {}),
    children,
  } as RicElementNode;
};
