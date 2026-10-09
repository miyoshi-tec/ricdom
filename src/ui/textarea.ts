// ricdom/ui — uiTextarea (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/control/ui_textarea.js) の camelCase 移植。ui_input の <textarea> 版で、
// `autoResize` オプションで内容量に応じて高さを自動調整できる。
//
// rest スプレッド契約 (v1 A15 継承): onchange / onkeydown / id / data-* / aria-* / style 等の
// 任意属性を透過する。rest を先頭に展開してから計算済み tag/class/rows/value/oninput で
// 上書きするため、基底クラス `ric-textarea` は保たれる。
//
// ⚠️ IME 注意 (v1 bind_textarea の JSDoc を移植): controlled な textarea では IME 確定前に
//   value が上書きされる場合がある。日本語入力中心の場面では onchange 方式を検討すること
//   (コア側の編集中ガード (設計書 §3.2) は focus 中の value FORCE_REAPPLY を止めるが、
//   IME 変換中に oninput 経由で state → value を書き戻す setState 自体は防げない)。

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiTextareaAutoResize {
  /** 最小行数 (既定 1) */
  minRows?: number;
  /** 最大行数。省略時は上限なし (収まらない分はスクロール) */
  maxRows?: number;
}

export interface UiTextareaProps {
  value?: string;
  placeholder?: string;
  rows?: number;
  maxlength?: number;
  disabled?: boolean;
  /** 内容量に応じて高さを自動調整する (v1 の auto_resize) */
  autoResize?: UiTextareaAutoResize;
  class?: ClassValue;
  /** rest スプレッド経由で常に透過されていたが、型に無かった (LCP の指摘、2.0.0-alpha.9)。 */
  style?: StyleValue;
  oninput?: (ev: Event) => void;
  onkeydown?: (ev: KeyboardEvent) => void;
  [key: string]: unknown;
}

// DOM 要素に対して自動リサイズを適用する。render の oninput ハンドラ内から呼ばれる。
// line-height / padding を computed style から取得して scrollHeight と min/max 行数でクランプする。
//
// 高さの単位に注意: scrollHeight と minH / maxH は「中身 + 上下 padding」(= padding box) の高さ。
// style.height に書く値は box-sizing で意味が変わるので、最後に換算する:
//   border-box (.ric-textarea の既定、2.0.0-alpha.25〜) → padding box + 上下 border
//   content-box (アプリが上書きした場合)                  → padding box − 上下 padding
// alpha.24 以前は padding box の値をそのまま書いていたため、content-box では上下 padding 分
// 余白が増え (light テーマで 16px)、アプリが border-box にリセットしていると border 分 (2px)
// 見切れていた (設計書 §44、tests/browser/uiControlBoxSizing.test.ts)。
const applyAutoResize = (el: HTMLTextAreaElement | null, autoResize: UiTextareaAutoResize | undefined): void => {
  if (!el || !autoResize) return;
  if (typeof window === 'undefined') return; // SSR / Node 単体環境では getComputedStyle が無い
  const { minRows = 1, maxRows } = autoResize;
  el.style.height = 'auto'; // 現在の高さをリセットして scrollHeight を正しく測る
  const cs = window.getComputedStyle(el);
  const lineH = parseFloat(cs.lineHeight) || 22;
  const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
  const minH = minRows * lineH + pad;
  const maxH = maxRows != null ? maxRows * lineH + pad : Infinity;
  const paddingBoxH = Math.min(Math.max(el.scrollHeight, minH), maxH);
  const cssH = cs.boxSizing === 'border-box' ? paddingBoxH + border : paddingBoxH - pad;
  el.style.height = `${cssH}px`;
  el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
};

/**
 * `<textarea>`。`autoResize` で内容量に応じて高さを自動調整できる。状態を持たない純粋関数。
 *   uiTextarea({ value: s.memo, autoResize: { minRows: 2, maxRows: 8 } })
 */
export const uiTextarea = ({
  value = '',
  placeholder,
  rows = 1,
  maxlength,
  disabled = false,
  autoResize,
  class: extraClass,
  oninput,
  onkeydown,
  ...rest
}: UiTextareaProps = {}): RicNode => {
  // autoResize 指定時は oninput で高さを再計算してから本来のハンドラを呼ぶ。
  // oninput / autoResize のどちらかが指定されていれば合成ハンドラを付ける。
  const handleInput = oninput || autoResize ? (ev: Event) => {
    applyAutoResize(ev.target as HTMLTextAreaElement, autoResize);
    oninput?.(ev);
  } : undefined;

  return {
    ...rest,
    tag: 'textarea',
    class: mergeClass('ric-textarea', extraClass),
    'data-ricdom-role': UI_ROLE.textarea,
    rows: autoResize ? (autoResize.minRows ?? 1) : rows,
    value, // 常に含める (FORCE_REAPPLY 対象キーとして反映されるよう)
    ...(placeholder ? { placeholder } : {}),
    ...(handleInput ? { oninput: handleInput } : {}),
    ...(onkeydown ? { onkeydown } : {}),
    ...(disabled ? { disabled: true } : {}),
    ...(maxlength != null ? { maxlength } : {}),
  } as RicElementNode;
};
