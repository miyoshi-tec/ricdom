// ricdom/ui — uiSelect (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/control/ui_select.js) の camelCase 移植。CSS `appearance: base-select` により
// ドロップダウンの見た目をテーマ色で統一する (Chrome 135+)。ネイティブ <select> なので
// キーボード操作・アクセシビリティ・モバイル対応はブラウザが提供する。
//
// options: string[] または { value, label }[] を受け付ける。placeholder: 先頭に「未選択」
// オプション (選択不可) を追加する。
//
// v1 は selected を `selected: 1/0` の numeric 変換で個別 option に付与していた
// (select.value を初回ビルド時に設定しても option がまだ存在しないため)。v2 のコアは
// `<select>` の value を「option が生えた後に再適用する」構築順対策を既に持っている
// (src/dom.ts、`tag === 'select' && 'value' in attrs` の特別扱い) ため、部品側は素直に
// value を渡すだけでよい (設計書「options、value/option 構築順はコアが解決済み」)。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiSelectOption {
  value: string;
  label?: string | number;
}

export interface UiSelectProps {
  value?: string;
  options?: (string | UiSelectOption)[];
  placeholder?: string;
  disabled?: boolean;
  class?: ClassValue;
  // rest スプレッド経由で常に透過されていたが、型に無かった (LCP の指摘、2.0.0-alpha.9)。
  /** inline style。任意の属性と同じく要素にそのまま渡る (型の補完用に宣言している)。 */
  style?: StyleValue;
  onchange?: (ev: Event) => void;
  [key: string]: unknown;
}

// label を省略した { value } は value を表示する (HTML の <option value="x"> と同じ。
// 2.0.0-alpha.30 までは String(undefined) で「undefined」と表示されていた)。
const normalizeOption = (opt: string | UiSelectOption): UiSelectOption => (typeof opt === 'string' ? { value: opt, label: opt } : { ...opt, label: opt.label ?? opt.value });

/**
 * ネイティブ `<select>`。状態を持たない純粋関数 (双方向バインドは `bindSelect` 参照)。
 *   uiSelect({ value: s.role, options: ['viewer', 'editor', 'admin'] })
 */
export const uiSelect = ({ value = '', options = [], placeholder, disabled = false, class: extraClass, onchange, ...rest }: UiSelectProps = {}): RicNode => {
  const optionNodes: RicNode[] = [
    ...(placeholder ? [{ tag: 'option', value: '', disabled: true, children: [placeholder] } as RicElementNode] : []),
    ...options.map((opt) => {
      const { value: v, label: l } = normalizeOption(opt);
      return { tag: 'option', value: String(v), children: [String(l)] } as RicElementNode;
    }),
  ];

  // 選んだ文字の表示先 (2.0.0-alpha.30、歯車DXFジェネレーターの報告)。`appearance: base-select`
  // のセレクトでは、先頭の子の <button> が枠の中身になり、<selectedcontent> には「いま選ばれて
  // いる option の中身」をブラウザが写して入れる。ここに 1 行で省略 (…) する CSS を当てる
  // (cssTemplates.ts の SELECT_CSS)。これが無いと、選んだ文字は折り返して枠の上下にはみ出す。
  //   - island: 中身を書くのはブラウザなので、ricdom の差分の対象から外す
  //   - ブラウザが写し直すのは「選択が変わったとき」「selectedIndex / value が代入されたとき」
  //     「この要素が挿入されたとき」だけで、選ばれている option の文字が後から変わっても
  //     写し直さない (Chromium 140 で実測)。追従させるのはコアの役目 (src/dom.ts の
  //     reapplySelectValue): 毎 render で子を patch した後に select.value を入れ直し、
  //     入れ直さないフォーカス中は「写した中身が古いときだけ」写し直させる
  //     (2.0.0-alpha.35、設計書 §54。alpha.30〜34 はフォーカス中に古い文字が残る既知の制限だった)。
  //   - この要素に「選択肢の文字の並び」の key を付けて作り直させる案は効かない。先頭の子なので
  //     option の文字が patch される前に挿入され、ブラウザは古い文字を写す (実測)。
  //   - 中の <button> は入れ物で、ページの `button { … }` の規則が枠の中の文字に届かないよう
  //     CSS 側で固定している (cssTemplates.ts の SELECT_CSS 直前のコメント、2.0.0-alpha.35)。
  //   - base-select に対応していないブラウザでは、<select> は option 以外の子を描かないので
  //     従来どおりの見た目になる。
  const selectedContent = { tag: 'button', children: [{ tag: 'selectedcontent', island: true }] } as RicElementNode;

  return {
    ...rest,
    tag: 'select',
    class: mergeClass('ric-select', extraClass),
    'data-ricdom-role': UI_ROLE.select,
    value,
    ...(onchange ? { onchange } : {}),
    ...(disabled ? { disabled: true } : {}),
    children: [selectedContent, ...optionNodes],
  } as RicElementNode;
};
