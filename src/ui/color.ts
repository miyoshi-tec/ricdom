// ricdom/ui — uiColor (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/control/ui_color.js) の camelCase 移植。hex (#rrggbb) と rgba(r,g,b,a) の
// 両方をサポートするカラーピッカー。
//
// レイアウト:
//   hex モード  : [picker ─ value] 横 1 行
//   rgba モード : [picker  ] 上段
//                 [slider α] 下段 — 横幅を丸ごと使えるようにするための 2 段組
//   CSS 側で flex-direction を切り替える (.ric-color--rgba 修飾子)。
//
// rest スプレッド契約 (v1 A15 継承): rest は外側のラッパー <div class="ric-color"> に付く。
// oninput/value は内部 <input> に掛ける必要があるため rest には入れない (隔離契約)。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiColorProps {
  value?: string;
  disabled?: boolean;
  class?: ClassValue;
  // rest スプレッド経由で常に透過されていたが、型に無かった (LCP の指摘、2.0.0-alpha.9)。
  // 隔離契約はファイル先頭のコメント参照。
  /** inline style。任意の属性と同じく要素にそのまま渡る (型の補完用に宣言している)。
   *  外側の .ric-color ラッパーに付く (value/oninput だけが内部の input に付く)。 */
  style?: StyleValue;
  oninput?: (ev: Event) => void;
  [key: string]: unknown;
}

const isHex6 = (v: string): boolean => /^#[0-9a-fA-F]{6}$/.test(v.trim());

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const parseRgba = (v: string): Rgba | null => {
  const m = v.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (!m) return null;
  return { r: parseInt(m[1]!, 10), g: parseInt(m[2]!, 10), b: parseInt(m[3]!, 10), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
};

const rgbToHex = (r: number, g: number, b: number): string =>
  '#' +
  [r, g, b]
    .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0'))
    .join('');

const hexToRgb = (hex: string): { r: number; g: number; b: number } => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const fakeEvent = (value: string): Event => ({ target: { value } }) as unknown as Event;

/**
 * カラーピッカー (hex または rgba(r,g,b,a) を自動判定)。状態を持たない純粋関数。
 *   uiColor({ value: s.color, oninput: (ev) => { s.color = ev.target.value; } })
 */
export const uiColor = ({ value = '#000000', disabled = false, class: extraClass, oninput, ...rest }: UiColorProps = {}): RicNode => {
  const current = String(value);
  const rgba = parseRgba(current);
  const isRgba = rgba !== null;

  const pickerVal = isHex6(current) ? current.trim() : rgba ? rgbToHex(rgba.r, rgba.g, rgba.b) : '#000000';
  const alphaVal = rgba ? rgba.a : 1;

  const onColor = !oninput
    ? undefined
    : (ev: Event) => {
        if (isRgba) {
          const { r, g, b } = hexToRgb((ev.target as HTMLInputElement).value);
          oninput(fakeEvent(`rgba(${r},${g},${b},${alphaVal})`));
        } else {
          oninput(ev);
        }
      };

  const onAlpha =
    !oninput || !isRgba
      ? undefined
      : (ev: Event) => {
          const a = Math.max(0, Math.min(1, parseFloat((ev.target as HTMLInputElement).value) || 0));
          const { r, g, b } = hexToRgb(pickerVal);
          oninput(fakeEvent(`rgba(${r},${g},${b},${a})`));
        };

  const pickerNode = {
    tag: 'input',
    type: 'color',
    class: 'ric-color__picker',
    value: pickerVal,
    ...(disabled ? { disabled: true } : {}),
    ...(onColor ? { oninput: onColor } : {}),
  } as RicElementNode;

  if (!isRgba) {
    return {
      ...rest,
      tag: 'div',
      class: mergeClass('ric-color', extraClass),
      'data-ricdom-role': UI_ROLE.color,
      children: [pickerNode, { tag: 'span', class: 'ric-color__value', children: [current || '—'] }],
    } as RicElementNode;
  }

  return {
    ...rest,
    tag: 'div',
    class: mergeClass('ric-color ric-color--rgba', extraClass),
    'data-ricdom-role': UI_ROLE.color,
    children: [
      pickerNode,
      {
        tag: 'div',
        class: 'ric-color__alpha-row',
        children: [
          {
            tag: 'input',
            type: 'range',
            class: 'ric-color__alpha',
            min: '0',
            max: '1',
            step: '0.01',
            value: String(alphaVal),
            ...(disabled ? { disabled: true } : {}),
            ...(onAlpha ? { oninput: onAlpha } : {}),
          },
          { tag: 'span', class: 'ric-color__value', children: [`α${alphaVal.toFixed(2)}`] },
        ],
      },
    ],
  } as RicElementNode;
};
