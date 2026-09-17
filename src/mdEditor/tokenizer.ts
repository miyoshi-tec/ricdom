// ricdom/md-editor — tokenizeMarkdown (純粋関数、DOM 非依存)
//
// createMdEditor (mdEditor.ts) の「テキストと同じ文字幅を保ったまま Markdown を色分けする」
// ミラー <pre> を組み立てるための下請け。line-based (1 行ずつ分類する) の実用サブセットで、
// uiMdPre (src/ui/mdPre.ts) のような RicNode 木への変換ではなく「元のテキストを 1 文字も
// 変えずに、色分け区間だけを切り出す」ことが目的 — テキストエリア本体 (透明文字) の上に
// 重ねるミラーなので、1 文字でも足りない/多いとキャレット位置と表示がずれる。
//
// 不変条件 (呼び出し側・テストの両方が依存する契約):
//   tokens.map(t => t.text).join('') === src   … 必ず成立する (CRLF・タブ・絵文字・
//   閉じていないフェンス/強調 も含めて)。分類できない/未対応の構文は cls: null (無色) の
//   プレーンテキストとして温存するだけで、文字を足したり削ったりしない。
//
// 色分けは「文字の見た目の幅を変えないプロパティ (color/background-color/text-decoration/
// text-shadow/opacity/border-radius) だけ」を CSS 側 (cssTemplates.ts の MD_EDITOR_CSS) が
// 使う前提。ここではクラス名を返すだけで、実際の色は関与しない。

export interface MdToken {
  text: string;
  /** 色分けクラス名 (`ric-md-*`)。無色のプレーンテキストは null */
  cls: string | null;
  /** フェンスコードのブロック言語 (info string の先頭語)。fenceBody の行のみ意味を持つ */
  lang?: string | null;
  /** フェンスコード本文の 1 行であることを示す (hljs を通す判断に使う) */
  fenceBody?: boolean;
}

// ── 行分割 (改行文字を保持する) ──
// CRLF/LF どちらでも「その行の内容」と「改行文字」を別トークンに分けて返せるよう、
// \n の直前までを 1 行として保持する (\r は次の \n にくっついたまま前の要素に残る ので
// CRLF は 1 個の終端文字列 "\r\n" として扱われる)。最終行に改行が無ければ終端なしの
// 要素になる。
const splitLinesKeepEnds = (src: string): string[] => {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') {
      lines.push(src.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < src.length) lines.push(src.slice(start));
  return lines;
};

// 1 行 (改行込み) を「内容」と「改行文字列 ('' | '\n' | '\r\n')」に分ける。
const splitTerm = (line: string): [content: string, term: string] => {
  if (line.endsWith('\r\n')) return [line.slice(0, -2), '\r\n'];
  if (line.endsWith('\n')) return [line.slice(0, -1), '\n'];
  return [line, ''];
};

// ── インライン (1 行の中身、ブロック記号を消費した後の「残り」に対して適用) ──
// 優先順位: コード → 画像 → リンク → オートリンク → 強調(**/__) → 打ち消し線(~~) → 斜体(*/_)。
// グループ番号: 1=code内側 2=image alt 3=image src 4=link text 5=link url 6=autolink url
// 7=strong(**)内側 8=strong(__)内側 9=strike内側 10=em(*)内側 11=em(_)内側
const INLINE_RE =
  /`([^`]+)`|!\[([^\]]*)\]\(([^)]*)\)|\[([^\]]*)\]\(([^)]*)\)|<((?:https?|mailto):[^<>\s]+)>|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|(?<![\w*])\*([^*\s](?:[^*]*?[^*\s])?)\*(?!\w)|(?<![\w_])_([^_\s](?:[^_]*?[^_\s])?)_(?!\w)/g;

// テキスト片 (ブロック記号を含まない生テキスト) を色分けトークン列へ変換する。
// join すると入力と完全一致する (不変条件)。マッチしなかった区切り文字 (未閉じの `*`/`` ` `` 等)
// は cls:null のまま残る。
const parseInline = (text: string): MdToken[] => {
  if (!text) return [];
  const out: MdToken[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), cls: null });
    if (m[1] !== undefined) {
      out.push({ text: m[0], cls: 'ric-md-code' });
    } else if (m[2] !== undefined) {
      // ![alt](src)
      out.push({ text: '!', cls: 'ric-md-marker' });
      out.push({ text: '[', cls: 'ric-md-marker' });
      out.push({ text: m[2], cls: 'ric-md-link' });
      out.push({ text: ']', cls: 'ric-md-marker' });
      out.push({ text: '(', cls: 'ric-md-marker' });
      out.push({ text: m[3] ?? '', cls: 'ric-md-url' });
      out.push({ text: ')', cls: 'ric-md-marker' });
    } else if (m[4] !== undefined) {
      // [text](url)
      out.push({ text: '[', cls: 'ric-md-marker' });
      out.push({ text: m[4], cls: 'ric-md-link' });
      out.push({ text: ']', cls: 'ric-md-marker' });
      out.push({ text: '(', cls: 'ric-md-marker' });
      out.push({ text: m[5] ?? '', cls: 'ric-md-url' });
      out.push({ text: ')', cls: 'ric-md-marker' });
    } else if (m[6] !== undefined) {
      // <http://...> オートリンク
      out.push({ text: m[0], cls: 'ric-md-url' });
    } else if (m[7] !== undefined || m[8] !== undefined) {
      // **strong** / __strong__ (中身は再帰パースしない — フラットな 1 トークン)
      out.push({ text: m[0], cls: 'ric-md-strong' });
    } else if (m[9] !== undefined) {
      // ~~strike~~
      out.push({ text: m[0], cls: 'ric-md-strike' });
    } else if (m[10] !== undefined || m[11] !== undefined) {
      // *em* / _em_
      out.push({ text: m[0], cls: 'ric-md-em' });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), cls: null });
  return out;
};

// ── フェンス開始/終了の判定 ──
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

const matchFenceClose = (content: string, fenceChar: string, fenceLen: number): boolean => {
  const escaped = fenceChar === '`' ? '`' : '~';
  const re = new RegExp(`^ {0,3}${escaped}{${fenceLen},}\\s*$`);
  return re.test(content);
};

// ── 水平線 (---/***/___、間に空白を挟んでもよい、3 文字以上) ──
const HR_RES = [/^ {0,3}(?:-[ \t]*){3,}$/, /^ {0,3}(?:\*[ \t]*){3,}$/, /^ {0,3}(?:_[ \t]*){3,}$/];
const isHr = (content: string): boolean => HR_RES.some((re) => re.test(content));

// ── テーブル行判定 (ヘッダ/本体行 or 区切り行) ──
const TABLE_DELIM_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const isTableLine = (content: string): boolean => content.includes('|') && (/^\s*\|/.test(content) || TABLE_DELIM_RE.test(content));

const tokenizeTableRow = (content: string): MdToken[] => {
  const out: MdToken[] = [];
  let buf = '';
  for (const ch of content) {
    if (ch === '|') {
      if (buf) {
        out.push(...parseInline(buf));
        buf = '';
      }
      out.push({ text: '|', cls: 'ric-md-marker' });
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(...parseInline(buf));
  return out;
};

// ── HTML タグ単体の行 (<div ...> / </div> など、ブロックレベル) ──
const HTML_TAG_LINE_RE = /^\s*<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>\s*$/;

// ── リスト行 (箇条書き/順序あり、タスクボックス対応) ──
const LIST_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)(\[[ xX]\]\s+)?(.*)$/;

// ── 見出し行 (ATX、# 1〜6 個 + 空白 + 本文、または # のみ) ──
const HEADING_RE = /^(#{1,6})(\s.*)?$/;

// ── 引用行 (> の後ろ最大 1 個の空白まで消費してマーカーにする) ──
const BLOCKQUOTE_RE = /^( {0,3}> ?)(.*)$/;

/**
 * Markdown ソース全体を色分けトークン列へ変換する (純粋関数、DOM 非依存)。
 * `tokens.map(t => t.text).join('') === src` が常に成立する (createMdEditor のミラー <pre>
 * が textarea と 1 文字もずれないための不変条件)。
 */
export const tokenizeMarkdown = (src: string): MdToken[] => {
  const lines = splitLinesKeepEnds(src);
  const tokens: MdToken[] = [];
  const n = lines.length;
  const pushTerm = (term: string): void => {
    if (term) tokens.push({ text: term, cls: null });
  };

  let i = 0;

  // ── フロントマター: 文書の先頭行が厳密に '---' の場合のみ、閉じる '---' 行まで
  // (閉じなければ文書全体を) 1 ブロックの ric-md-meta として扱う。
  if (n > 0) {
    const [firstContent] = splitTerm(lines[0]!);
    if (firstContent === '---') {
      let closeIdx = -1;
      for (let j = 1; j < n; j++) {
        const [c] = splitTerm(lines[j]!);
        if (c === '---') {
          closeIdx = j;
          break;
        }
      }
      const endIdx = closeIdx === -1 ? n - 1 : closeIdx;
      for (let j = 0; j <= endIdx; j++) {
        const [c, t] = splitTerm(lines[j]!);
        if (c) tokens.push({ text: c, cls: 'ric-md-meta' });
        pushTerm(t);
      }
      i = endIdx + 1;
    }
  }

  // フェンスコード中の状態 (開始文字・開始時の長さ・言語)
  let fence: { char: string; len: number; lang: string | null } | null = null;

  while (i < n) {
    const [content, term] = splitTerm(lines[i]!);
    i++;

    // ── フェンスコード本文/終端行 ──
    if (fence) {
      if (matchFenceClose(content, fence.char, fence.len)) {
        if (content) tokens.push({ text: content, cls: 'ric-md-fence-marker' });
        pushTerm(term);
        fence = null;
        continue;
      }
      // インラインパースは無効 (リテラル性を守る)。空行も含め 1 トークン。
      tokens.push({ text: content, cls: 'ric-md-fence', fenceBody: true, lang: fence.lang });
      pushTerm(term);
      continue;
    }

    // ── フェンス開始 ──
    const fenceOpen = content.match(FENCE_OPEN_RE);
    if (fenceOpen) {
      const markerStr = fenceOpen[1]!;
      const infoStr = fenceOpen[2]!.trim();
      const lang = infoStr.split(/\s+/)[0] || null;
      fence = { char: markerStr[0]!, len: markerStr.length, lang };
      tokens.push({ text: content, cls: 'ric-md-fence-marker' });
      pushTerm(term);
      continue;
    }

    // ── 水平線 ──
    if (isHr(content)) {
      tokens.push({ text: content, cls: 'ric-md-hr' });
      pushTerm(term);
      continue;
    }

    // ── 見出し ──
    const heading = content.match(HEADING_RE);
    if (heading) {
      tokens.push({ text: heading[1]!, cls: 'ric-md-marker' });
      if (heading[2]) tokens.push({ text: heading[2], cls: 'ric-md-heading' });
      pushTerm(term);
      continue;
    }

    // ── 引用 (BLOCKQUOTE_RE は '>' 自体を必須文字として要求するため、マッチした時点で
    // quote[1] には必ず '>' が含まれる) ──
    const quote = content.match(BLOCKQUOTE_RE);
    if (quote) {
      tokens.push({ text: quote[1]!, cls: 'ric-md-marker' });
      if (quote[2]) tokens.push({ text: quote[2], cls: 'ric-md-quote' });
      pushTerm(term);
      continue;
    }

    // ── リスト ──
    const list = content.match(LIST_RE);
    if (list) {
      tokens.push({ text: list[1]!, cls: 'ric-md-marker' });
      if (list[2]) tokens.push({ text: list[2], cls: 'ric-md-marker' });
      if (list[3]) tokens.push(...parseInline(list[3]));
      pushTerm(term);
      continue;
    }

    // ── テーブル ──
    if (isTableLine(content)) {
      tokens.push(...tokenizeTableRow(content));
      pushTerm(term);
      continue;
    }

    // ── HTML タグ単体行 ──
    if (HTML_TAG_LINE_RE.test(content)) {
      tokens.push({ text: content, cls: 'ric-md-meta' });
      pushTerm(term);
      continue;
    }

    // ── 段落 (インラインパース) ──
    tokens.push(...parseInline(content));
    pushTerm(term);
  }

  return tokens;
};
