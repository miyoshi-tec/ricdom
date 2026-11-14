// ricdom/ui — CSS 1 枚配布 (設計書 §4)
//
// per-instance の使用クラス収集 (v1 の css_registry/css_for) を廃止し、CSS は
// 1 枚のスタイルシートとして配布する。`<link rel="stylesheet" href=".../ricdom-ui.css">`
// で読み込むほか、ビルド不要で `<script>` だけ読んだ consumer 向けに
// `injectStyles()` で同じ内容を実行時注入できる (document ごとに 1 回、idempotent)。
// `ricdomUI` IIFE を読むだけでは自動注入しない (明示、設計書 §4)。

import { buildStylesheet } from './cssTemplates.js';

const STYLE_MARKER_ATTR = 'data-ricdom-role';
const STYLE_MARKER_VALUE = 'styles';

/**
 * ricdom/ui の CSS 1 枚 (`buildStylesheet()`) を `doc` の `<head>` に注入する。
 * 同じ doc に対して 2 回目以降は no-op (`<style data-ricdom-role="styles">` の
 * 存在を見て判定する、idempotent)。既定は `document`。
 */
export const injectStyles = (doc: Document = document): void => {
  if (!doc || typeof doc.createElement !== 'function') {
    console.error('RicDOM UI: injectStyles には有効な Document を渡してください。');
    return;
  }
  if (doc.querySelector(`style[${STYLE_MARKER_ATTR}="${STYLE_MARKER_VALUE}"]`)) return; // 既に注入済み

  const styleEl = doc.createElement('style');
  styleEl.setAttribute(STYLE_MARKER_ATTR, STYLE_MARKER_VALUE);
  styleEl.textContent = buildStylesheet();
  (doc.head ?? doc.documentElement).appendChild(styleEl);
};

// CSS 読込検知の false positive 解消 (パイロット第 9 号 = Potopeta からの報告、
// 2.0.0-alpha.10): 従来は injectStyles 自身のマーカー (`style[data-ricdom-role="styles"]`)
// と `link[href$="ricdom-ui.css"]` の 2 経路しか見ておらず、`ricdom-ui.css` の中身を
// consumer が自前で `<style>` にインライン埋め込みした単一ファイル配布 (Potopeta の
// 自己完結 HTML バンドル、v1 の LZ 自己展開ツールで生成) では、そのどちらにも
// マッチしないため誤って「未読み込み」と警告していた。
//
// 「CSS テキストの内容で判定」が本質であり、コメント検索 (cssTemplates.ts の
// `/*! ricdom-ui */` マーカー) より確実な方法として `document.styleSheets` を走査し、
// ricdom の規則 (`.ric-button` セレクタを持つ CSSStyleRule) が実際に存在するかを見る
// 方式を採用する。理由:
//   - コメントは `<style>`/`<link>` どちらでも DOM/CSSOM からは読めない
//     (style.textContent はコメントも含む生テキストだが、consumer が minify した CSS を
//     埋め込むとコメントごと消える可能性がある一方、規則そのものは CSS として機能する
//     以上 CSSOM には必ず現れる — 「動くかどうか」に一致する判定基準になる)
//   - cross-origin の <link rel="stylesheet"> は `sheet.cssRules` へのアクセスで
//     SecurityError を投げる (CORS 未許可の場合) ため、シートごとに try/catch で読み飛ばす
//     (読めないシートは「ricdom かどうか判定不能」なだけで、他のシートに本物があれば
//     そちらで検知できる)
const hasRicdomStylesheetLoaded = (doc: Document): boolean => {
  const sheets = doc.styleSheets;
  for (let i = 0; i < sheets.length; i++) {
    try {
      const rules = sheets[i]!.cssRules; // cross-origin シートはここで例外を投げる
      for (let j = 0; j < rules.length; j++) {
        const rule = rules[j] as CSSStyleRule;
        if (typeof rule.selectorText === 'string' && rule.selectorText.includes('.ric-button')) return true;
      }
    } catch {
      continue; // 読み取り不可 (cross-origin 等) → このシートは判定不能として次へ
    }
  }
  return false;
};

// 設計書 §4。
let warnedMissingStyles = false;
/** 部品の初回 use() 時、スタイルが未注入なら案内を出す (throw しない・1 回だけ) */
export const warnIfStylesMissing = (doc: Document = document): void => {
  if (warnedMissingStyles) return;
  if (!doc || typeof doc.querySelector !== 'function') return;
  if (doc.querySelector(`style[${STYLE_MARKER_ATTR}="${STYLE_MARKER_VALUE}"]`)) return;
  if (doc.querySelector('link[href$="ricdom-ui.css"]')) return; // <link> 読み込み済みの可能性が高い
  if (hasRicdomStylesheetLoaded(doc)) return; // 生 CSS を <style> にインライン埋め込み済み (#Potopeta)
  warnedMissingStyles = true;
  console.warn(
    'RicDOM UI: ricdom-ui.css がまだ読み込まれていないようです。\n' +
      '✅ <link rel="stylesheet" href=".../dist/ricdom-ui.css"> を読み込むか、' +
      "コード側で import { injectStyles } from 'ricdom/ui'; injectStyles(); を呼んでください。",
  );
};

/** テスト用: warnIfStylesMissing の「1 回だけ」状態をリセットする */
export const _resetStyleWarningForTest = (): void => {
  warnedMissingStyles = false;
};
