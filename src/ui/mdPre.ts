// ricdom/ui — uiMdPre (設計書 §3.4 純粋関数部品)
//
// v1 (ric_ui/text/ui_md_pre.js) の camelCase 移植。Markdown テキストを RicNode 木に変換する
// 部品。ヘルプ画面・チュートリアル表示用の簡易パーサー。外部ライブラリ不要。完全な
// CommonMark 準拠ではなく、実用的なサブセットを対応する。
//
// 使い方:
//   uiMdPre({ children: ['# 見出し\n\nテキスト'] })
//
// 対応構文:
//   # 〜 ######        見出し (h1〜h6)
//   **text**           太字
//   *text*             斜体
//   `code`             インラインコード
//   ```lang ... ```    コードブロック (``` / ~~~ 両対応)
//   ~~~lang ... ~~~    コードブロック (チルダフェンス)
//   - item             箇条書きリスト (ネストなし)
//   1. item            順序ありリスト (ネストなし、start 属性対応)
//   > quote            引用
//   [text](url)        リンク (javascript:/data:/vbscript: は href を出力しない)
//   ![alt](src)        画像
//   | a | b |          テーブル (ヘッダ + 区切り + 本体)
//   ---                水平線
//   空行               段落区切り
//
// Props:
//   children        Markdown テキスト (複数渡すと連結される)
//   transformText       (str) => (RicNode|string)[] | string   (任意)
//                       プロセ (通常テキスト) のテキストノードだけに適用され、戻り値
//                       (RicNode/string の配列、または string 単体) で置換される。
//                       FACT: コードブロック/インラインコードには適用されない (リテラル性を
//                       守るため)。例外を投げた場合は console.error を出し、元のテキストの
//                       まま表示する (NOOP フォールバック)。戻り値への再帰適用はしない
//                       (無限ループ対策、1 パスのみ)。
//   transformImageSrc   (src, alt) => string   (任意)
//                       `![alt](src)` の img 生成前に src を差し替えられる (相対パス →
//                       カスタムプロトコル解決等)。string 以外を返した場合/例外時は
//                       console.error を出し、元の src のまま表示する (NOOP フォールバック)。

import type { RicElementNode, RicNode, StyleValue } from '../types.js';
import { hljsKnows, warnHljsMissing } from './internal/hljs.js';
import { UI_ROLE, mergeClass } from './internal/pureHelpers.js';

export type MdTransformText = (text: string) => (RicNode | string)[] | string;
export type MdTransformImageSrc = (src: string, alt: string) => string;

export interface UiMdPreProps {
  children?: string | string[];
  transformText?: MdTransformText;
  transformImageSrc?: MdTransformImageSrc;
  class?: import('../types.js').ClassValue;
  // rest スプレッド経由で常に透過されていたが、型に無かった (LCP の指摘、2.0.0-alpha.9)。
  /** inline style。任意の属性と同じく要素にそのまま渡る (型の補完用に宣言している)。
   *  変換結果を包む外側の .ric-md-pre に付く。 */
  style?: StyleValue;
  [key: string]: unknown;
}

// transformText を安全に適用してノード配列へ push する。例外時は console.error + 元テキストのまま。
const pushProseText = (nodes: RicNode[], str: string, transformText: MdTransformText | undefined): void => {
  if (!str) return;
  if (typeof transformText !== 'function') {
    nodes.push(str);
    return;
  }
  try {
    const result = transformText(str);
    if (typeof result === 'string') nodes.push(result);
    else if (Array.isArray(result)) nodes.push(...result);
    else nodes.push(str);
  } catch (e) {
    console.error('RicDOM UI: uiMdPre の transformText が例外を投げました。元のテキストで表示を続けます。', e);
    nodes.push(str);
  }
};

// transformImageSrc を安全に適用して src 文字列を返す。
const resolveImageSrc = (src: string, alt: string, transformImageSrc: MdTransformImageSrc | undefined): string => {
  if (typeof transformImageSrc !== 'function') return src;
  try {
    const result = transformImageSrc(src, alt);
    if (typeof result === 'string') return result;
    console.error('RicDOM UI: uiMdPre の transformImageSrc は string を返す必要があります。元の src で表示を続けます。');
    return src;
  } catch (e) {
    console.error('RicDOM UI: uiMdPre の transformImageSrc が例外を投げました。元の src で表示を続けます。', e);
    return src;
  }
};

// href の危険スキーム判定。javascript:/data:/vbscript: を大文字小文字を問わず前方一致で
// ブロックする。制御文字 (改行・タブ等) を取り除いてから trim + toLowerCase → 前方一致判定
// (出力する href 自体は元の文字列のまま加工しない)。whitelist にはしない (http/https/
// mailto/相対パス/app:// 等のカスタムプロトコルは全て素通しする、Electron consumer 向け)。
const DANGEROUS_HREF_SCHEMES = ['javascript:', 'data:', 'vbscript:'];
const stripControlChars = (str: string): string => {
  let out = '';
  for (const ch of String(str)) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x1f && code !== 0x7f) out += ch;
  }
  return out;
};
const isDangerousHref = (href: string): boolean => {
  const cleaned = stripControlChars(href).trim().toLowerCase();
  return DANGEROUS_HREF_SCHEMES.some((scheme) => cleaned.startsWith(scheme));
};

// ── インライン Markdown → RicNode 配列 ──
const parseInline = (text: string, transformText: MdTransformText | undefined, transformImageSrc: MdTransformImageSrc | undefined): RicNode[] => {
  const nodes: RicNode[] = [];
  // コード → 画像 → リンク → 太字 → 斜体 の優先度で探す。
  // 画像 `![alt](src)` はリンクより前に置く (そうしないと `!` が単独プロセになった後
  // `[alt](src)` だけがリンクとして誤マッチする)。
  const re = /`([^`]+)`|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pushProseText(nodes, text.slice(last, m.index), transformText);
    if (m[1] !== undefined) {
      // `code` — インラインコードなので transformText を適用しない
      nodes.push({ tag: 'code', class: 'ric-md-pre__code', children: [m[1]] } as RicElementNode);
    } else if (m[2] !== undefined) {
      // ![alt](src) — 同じ正規表現の同じ選択肢内なので m[2] が捕まった時点で m[3] も必ず捕まる
      const alt = m[2];
      const src = resolveImageSrc(m[3]!, alt, transformImageSrc);
      nodes.push({ tag: 'img', class: 'ric-md-pre__img', src, alt } as RicElementNode);
    } else if (m[4] !== undefined) {
      // [text](url) — javascript:/data:/vbscript: は href を出力しない (m[4] と同じ選択肢の m[5])
      const href = m[5]!;
      nodes.push(
        isDangerousHref(href)
          ? ({ tag: 'a', class: 'ric-md-pre__link', children: [m[4]] } as RicElementNode)
          : ({ tag: 'a', class: 'ric-md-pre__link', href, target: '_blank', rel: 'noopener', children: [m[4]] } as RicElementNode),
      );
    } else if (m[6] !== undefined) {
      // **bold** — 中身を再帰パースして斜体等に対応
      nodes.push({ tag: 'strong', children: parseInline(m[6], transformText, transformImageSrc) } as RicElementNode);
    } else if (m[7] !== undefined) {
      // *italic*
      nodes.push({ tag: 'em', children: parseInline(m[7], transformText, transformImageSrc) } as RicElementNode);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) pushProseText(nodes, text.slice(last), transformText);
  return nodes;
};

// hljs でハイライトを試みる (ui_code_pre と同じロジック)。lang 指定ありのときのみ hljs を呼ぶ。
const highlightFenceCode = (raw: string, lang: string | null): RicElementNode => {
  if (lang && typeof window !== 'undefined') {
    if (typeof window.hljs === 'undefined') {
      warnHljsMissing();
      return { tag: 'code', children: [raw] } as RicElementNode;
    }
    if (!hljsKnows(lang)) return { tag: 'code', children: [raw] } as RicElementNode;
    try {
      const result = window.hljs.highlight(raw, { language: lang });
      return { tag: 'code', class: 'hljs', innerHTML: result.value } as RicElementNode;
    } catch {
      return { tag: 'code', children: [raw] } as RicElementNode;
    }
  }
  return { tag: 'code', children: [raw] } as RicElementNode;
};

// ── ブロックレベル Markdown → RicNode 配列 ──
const parseBlocks = (src: string, transformText: MdTransformText | undefined, transformImageSrc: MdTransformImageSrc | undefined): RicNode[] => {
  const lines = src.split('\n');
  const blocks: RicNode[] = [];
  let i = 0;
  // noUncheckedIndexedAccess: while (i < lines.length) で範囲を保証した直後の添字アクセスは
  // 常に存在するとみなせるため、この 1 箇所だけ non-null で「行を取得する」ことを明示する。
  const at = (idx: number): string => lines[idx]!;

  while (i < lines.length) {
    const line = at(i);

    // ── コードブロック ``` / ~~~ (開始と同じ文字種で閉じる) ──
    const fenceTrimmed = line.trimStart();
    if (fenceTrimmed.startsWith('```') || fenceTrimmed.startsWith('~~~')) {
      const fenceStr = fenceTrimmed.slice(0, 3);
      const lang = fenceTrimmed.slice(3).trim() || null;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !at(i).trimStart().startsWith(fenceStr)) {
        codeLines.push(at(i));
        i++;
      }
      i++; // 閉じフェンス行をスキップ

      const raw = codeLines.join('\n');
      // 注: フェンスコードブロックの中身には transformText を適用しない (リテラル性を守る)
      const codeNode = highlightFenceCode(raw, lang);
      blocks.push({ tag: 'pre', class: 'ric-md-pre__fence', children: [codeNode] } as RicElementNode);
      continue;
    }

    // ── 空行 (段落区切り) ──
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ── 水平線 --- ──
    if (/^-{3,}\s*$/.test(line.trim())) {
      blocks.push({ tag: 'hr', class: 'ric-md-pre__hr' } as RicElementNode);
      i++;
      continue;
    }

    // ── 見出し # 〜 ###### ──
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const tag = `h${level}`;
      const cls = level <= 3 ? `ric-md-pre__h${level}` : 'ric-md-pre__h3';
      blocks.push({ tag, class: cls, children: parseInline(headingMatch[2]!, transformText, transformImageSrc) } as RicElementNode);
      i++;
      continue;
    }

    // ── 引用 > ──
    if (line.trimStart().startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && at(i).trimStart().startsWith('> ')) {
        quoteLines.push(at(i).trimStart().slice(2));
        i++;
      }
      blocks.push({ tag: 'blockquote', class: 'ric-md-pre__quote', children: parseBlocks(quoteLines.join('\n'), transformText, transformImageSrc) } as RicElementNode);
      continue;
    }

    // ── リスト - ──
    if (/^\s*[-*]\s+/.test(line)) {
      const items: RicNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(at(i))) {
        const itemText = at(i).replace(/^\s*[-*]\s+/, '');
        items.push({ tag: 'li', children: parseInline(itemText, transformText, transformImageSrc) } as RicElementNode);
        i++;
      }
      blocks.push({ tag: 'ul', class: 'ric-md-pre__list', children: items } as RicElementNode);
      continue;
    }

    // ── 順序ありリスト 1. item (ネスト非対応、start 属性対応) ──
    if (/^\s*\d+\.\s+/.test(line)) {
      const firstNumMatch = line.match(/^\s*(\d+)\.\s+/);
      const firstNum = firstNumMatch ? parseInt(firstNumMatch[1]!, 10) : 1;
      const items: RicNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(at(i))) {
        const itemText = at(i).replace(/^\s*\d+\.\s+/, '');
        items.push({ tag: 'li', children: parseInline(itemText, transformText, transformImageSrc) } as RicElementNode);
        i++;
      }
      const olNode = { tag: 'ol', class: 'ric-md-pre__ol', children: items } as RicElementNode & { start?: number };
      if (firstNum !== 1) olNode.start = firstNum;
      blocks.push(olNode);
      continue;
    }

    // ── テーブル | ... | ──
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(at(i + 1).trim())) {
      const splitRow = (row: string): string[] => {
        let s = row.trim();
        if (s.startsWith('|')) s = s.slice(1);
        if (s.endsWith('|')) s = s.slice(0, -1);
        return s.split('|').map((c) => c.trim());
      };
      const parseAlign = (sep: string): ('left' | 'center' | 'right')[] =>
        splitRow(sep).map((c) => {
          const t = c.trim().replace(/\s/g, '');
          if (t.startsWith(':') && t.endsWith(':')) return 'center';
          if (t.endsWith(':')) return 'right';
          return 'left';
        });
      const headerCells = splitRow(at(i));
      const aligns = parseAlign(at(i + 1));
      i += 2; // ヘッダ行 + 区切り行をスキップ

      const alignOf = (ci: number): 'left' | 'center' | 'right' => aligns[ci] ?? 'left';
      const alignStyle = (align: 'left' | 'center' | 'right'): StyleValue | undefined => (align !== 'left' ? { textAlign: align } : undefined);

      const thead = {
        tag: 'thead',
        children: [
          {
            tag: 'tr',
            children: headerCells.map((cell, ci) => {
              const style = alignStyle(alignOf(ci));
              return { tag: 'th', class: 'ric-md-pre__th', ...(style ? { style } : {}), children: parseInline(cell, transformText, transformImageSrc) } as RicElementNode;
            }),
          } as RicElementNode,
        ],
      } as RicElementNode;

      const bodyRows: RicNode[] = [];
      while (i < lines.length && at(i).trim().startsWith('|')) {
        const cells = splitRow(at(i));
        bodyRows.push({
          tag: 'tr',
          children: cells.map((cell, ci) => {
            const style = alignStyle(alignOf(ci));
            return { tag: 'td', class: 'ric-md-pre__td', ...(style ? { style } : {}), children: parseInline(cell, transformText, transformImageSrc) } as RicElementNode;
          }),
        } as RicElementNode);
        i++;
      }
      blocks.push({ tag: 'table', class: 'ric-md-pre__table', children: [thead, { tag: 'tbody', children: bodyRows } as RicElementNode] } as RicElementNode);
      continue;
    }

    // ── 段落 (連続する非空行をまとめる) ──
    // 注意: 「# で始まる」だけで終端にしてはいけない。正しい見出しパターンに限定して
    // 終端判定する (`#hello` 等を誤って段落から追い出すと i++ が走らず無限ループになる)。
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      at(i).trim() !== '' &&
      !/^#{1,6}\s+\S/.test(at(i).trimStart()) &&
      !at(i).trimStart().startsWith('```') &&
      !at(i).trimStart().startsWith('~~~') &&
      !at(i).trimStart().startsWith('> ') &&
      !/^\s*[-*]\s+/.test(at(i)) &&
      !/^\s*\d+\.\s+/.test(at(i)) &&
      !/^-{3,}\s*$/.test(at(i).trim()) &&
      !at(i).trim().startsWith('|')
    ) {
      paraLines.push(at(i));
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ tag: 'p', class: 'ric-md-pre__p', children: parseInline(paraLines.join('\n'), transformText, transformImageSrc) } as RicElementNode);
      continue;
    }

    // ── セーフティネット (無限ループ防止) ──
    // どの分岐でも line を消費できなかった場合は、その 1 行を素の段落として吐き出し、
    // 必ず i++ する。
    blocks.push({ tag: 'p', class: 'ric-md-pre__p', children: parseInline(line, transformText, transformImageSrc) } as RicElementNode);
    i++;
  }

  return blocks;
};

/**
 * 実用的な Markdown サブセットを RicNode 木に変換して表示する。状態を持たない純粋関数。
 *   uiMdPre({ children: ['# 見出し\n\n**本文**'] })
 */
export const uiMdPre = ({ children = [], transformText, transformImageSrc, class: extraClass, ...rest }: UiMdPreProps = {}): RicNode => {
  const childArray = Array.isArray(children) ? children : [children];
  const src = childArray.join('\n');
  const parsedChildren = parseBlocks(src, transformText, transformImageSrc);

  return {
    ...rest,
    tag: 'div',
    class: mergeClass('ric-md-pre', extraClass),
    'data-ricdom-role': UI_ROLE.mdPre,
    children: parsedChildren,
  } as RicElementNode;
};
