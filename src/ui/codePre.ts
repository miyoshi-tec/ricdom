// ricdom/ui — uiCodePre (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/text/ui_code_pre.js) の camelCase 移植。コード・JSON をダークテーマの <pre> で
// 表示する部品。テーマに関わらず常にダーク表示とする (コードブロックの慣習、--ric-code-bg/fg
// トークンが担う)。window.hljs (highlight.js) が存在する場合は自動でシンタックスハイライトを
// 適用する。
//
// 使い方:
//   uiCodePre({ children: ['const x = 1;'] })
//   uiCodePre({ children: [code], lang: 'javascript' })
//   uiCodePre({ obj: { count: s.count, name: s.name } })       // JSON.stringify → json ハイライト
//   uiCodePre({ obj: s, maxHeight: '200px' })                  // 高さ制限 (超えるとスクロール)

import type { ClassValue, RicElementNode, RicNode, StyleValue } from '../types.js';
import { hljsKnows, warnHljsMissing } from './internal/hljs.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export interface UiCodePreProps {
  children?: string | string[];
  /** JSON.stringify して表示するオブジェクト (渡すと children より優先される) */
  obj?: unknown;
  /** hljs 言語ヒント ('auto' | 'javascript' | 'json' | ...)。obj を渡した場合は自動で 'json' */
  lang?: string;
  /** 最大高さ ('200px' 等)。省略で制限なし */
  maxHeight?: string;
  style?: StyleValue;
  class?: ClassValue;
  [key: string]: unknown;
}

// window.hljs でシンタックスハイライトを試みる。成功時は hljs が生成した HTML 文字列、失敗時は null。
const tryHighlight = (raw: string, lang: string): string | null => {
  if (typeof window === 'undefined') return null; // SSR / Node 環境
  if (typeof window.hljs === 'undefined') {
    warnHljsMissing(); // dev hint (一度だけ)
    return null;
  }
  if (lang !== 'auto' && !hljsKnows(lang)) return null;
  try {
    const result = lang === 'auto' ? window.hljs.highlightAuto(raw) : window.hljs.highlight(raw, { language: lang });
    return result.value;
  } catch {
    return null; // 未知の言語や hljs エラーはプレーンテキストにフォールバック
  }
};

/**
 * コード・JSON をダークテーマの `<pre>` で表示する (`window.hljs` があれば自動ハイライト)。
 *   uiCodePre({ obj: s.params, maxHeight: '200px' })
 */
export const uiCodePre = ({ children = [], obj, lang = 'auto', maxHeight, style, class: extraClass, ...rest }: UiCodePreProps = {}): RicNode => {
  const childArray = Array.isArray(children) ? children : [children];
  const raw = obj !== undefined ? JSON.stringify(obj, null, 2) : childArray.join('');
  const effectiveLang = obj !== undefined ? 'json' : lang;

  const highlighted = tryHighlight(raw, effectiveLang);
  const codeNode = highlighted !== null ? ({ tag: 'code', class: 'hljs', innerHTML: highlighted } as RicElementNode) : ({ tag: 'code', children: [raw] } as RicElementNode);

  const baseStyle: StyleValue = maxHeight ? { maxHeight, overflowY: 'auto' } : {};
  const mergedStyle: StyleValue = { ...baseStyle, ...(style ?? {}) };

  return {
    ...rest,
    tag: 'pre',
    class: mergeClass('ric-code-pre', extraClass),
    'data-ricdom-role': UI_ROLE.codePre,
    ...(Object.keys(mergedStyle).length ? { style: mergedStyle } : {}),
    children: [codeNode],
  } as RicElementNode;
};
