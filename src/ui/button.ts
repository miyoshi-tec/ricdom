// ricdom/ui — uiButton (設計書 E: 検証用の純粋関数部品)
//
// v1 (ric_ui/control/ui_button.js) の camelCase 移植。状態を持たないので `app.use()` は
// 不要 — props → RicNode の純粋関数 (設計書 §3.4)。
//
// rest スプレッド契約 (v1 A15 継承): onClick / id / data-* / aria-* / style 等の任意属性を
// 透過する。rest を先頭に展開してから計算済み tag/class/children で上書きするため、
// rest から tag や class を渡しても基底クラスは保たれる
// (rest を最後に置くと class: 'ric-button foo' が rest.class='foo' で上書きされてしまう)。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

// 'link' は v1 (ric_ui/control/ui_button.js) の正式 variant の復活 (Rancha からの報告、
// 2.0.0-alpha.8)。背景・枠・高さ制限を全部外したテキスト風ボタン (breadcrumb / inline
// link 用途、density の高さ制約も無視する)。設計書 §20「v1 で正式 prop だったものは
// 復活が原則」に基づき、他 variant と同じ `.ric-button--${variant}` 命名規則にそのまま乗る
// (JS 側は class 文字列を付与するだけで済み、CSS_TEMPLATES 側で見た目を定義する)。
export type UiButtonVariant = 'default' | 'primary' | 'ghost' | 'link';
// v1 ric_ui/css_templates.js の .ric-button--sm/--lg を移植。
/** ボタンの寸法 (既定は 'md')。 */
export type UiButtonSize = 'sm' | 'md' | 'lg';

export interface UiButtonProps {
  children?: RicNode | RicNode[];
  variant?: UiButtonVariant;
  // v1 は .ric-button--md を明示定義していたが、値がコアの既定と同じため
  // v2 では冗長なクラスを増やさない。
  /** 既定 'md' — コア (.ric-button) の高さ/フォントサイズをそのまま使うので 'md' 用の
   *  修飾クラスは付与しない。 */
  size?: UiButtonSize;
  disabled?: boolean;
  class?: ClassValue;
  // rest スプレッド経由で常に透過されていたが、型に無かった (LCP の指摘、2.0.0-alpha.9)。
  /** inline style。任意の属性と同じく要素にそのまま渡る (型の補完用に宣言している)。 */
  style?: StyleValue;
  onclick?: (ev: MouseEvent) => void;
  [key: string]: unknown;
}

/**
 * ボタン。状態を持たない純粋関数。
 *   uiButton({ children: ['保存'], variant: 'primary', size: 'sm', onclick: () => save() })
 */
export const uiButton = ({ children = [], variant = 'default', size = 'md', disabled = false, class: extraClass, ...rest }: UiButtonProps = {}): RicNode => {
  const baseClass = [variant === 'default' ? 'ric-button' : `ric-button ric-button--${variant}`, size !== 'md' ? `ric-button--${size}` : null]
    .filter(Boolean)
    .join(' ');
  return {
    ...rest,
    tag: 'button',
    class: mergeClass(baseClass, extraClass),
    'data-ricdom-role': UI_ROLE.button,
    ...(disabled ? { disabled: true } : {}),
    children,
  } as RicElementNode;
};
