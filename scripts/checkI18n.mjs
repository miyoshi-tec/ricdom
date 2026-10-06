// docs サイトの i18n 未翻訳チェック (`npm run check:i18n`)。
//
// 方針 (examples/_i18n.js の冒頭コメント参照): 英語の文字列そのものがキーで、英語辞書は無い。
// 日本語の辞書は各ファイルが `ricdomI18n.addDict('ja', { 'English text': '日本語' })` で持つ。
// このスクリプトは examples/*.html, examples/*.js, site/*.html, site/*.js から
//   - t('...') / t("...") / t`...` のキー (テンプレートの ${} は {0},{1}… に置換)
//   - addDict('ja', { ... }) のキー
// を集め、辞書に無いキーを「未翻訳」として表示して exit 1 する。
//
// 正規表現だけで JS を読むと文字列中のバッククォートや正規表現リテラルで壊れるので、
// 文字列・テンプレート・コメント・正規表現リテラルを読み飛ばす小さなトークナイザを使う。
// (t(変数) のような動的キーは検査対象外。その種の文字列は辞書側にだけ置く。)

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const TARGET_DIRS = ['examples', 'site'];
const TARGET_EXT = /\.(html|js)$/;

// ── トークナイザ ──
// 返すトークン: { type: 'str' | 'tpl' | 'id' | 'p', value, pos }
//   str  文字列リテラル (エスケープ解決済み)
//   tpl  テンプレートリテラル (${...} は {0},{1}… に置換した文字列)
//   id   識別子  p  1 文字の記号
const decodeEscape = (src, i) => {
  // src[i] は '\' の次の文字。{ ch, next } を返す
  const c = src[i];
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  if (c === 'u') {
    if (src[i + 1] === '{') {
      const end = src.indexOf('}', i);
      return { ch: String.fromCodePoint(parseInt(src.slice(i + 2, end), 16)), next: end + 1 };
    }
    return { ch: String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16)), next: i + 5 };
  }
  if (c === 'x') return { ch: String.fromCharCode(parseInt(src.slice(i + 1, i + 3), 16)), next: i + 3 };
  if (c === '\n') return { ch: '', next: i + 1 }; // 行継続
  return { ch: simple[c] ?? c, next: i + 1 };
};

const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

const tokenize = (src) => {
  const tokens = [];
  let i = 0;
  let prev = ''; // 直前の有意トークンの種別 ('p:x' / 'id' / 'val')
  const push = (tok) => {
    tokens.push(tok);
    prev = tok.type === 'p' ? tok.value : tok.type === 'id' && /^(return|typeof|case|in|of)$/.test(tok.value) ? '(' : 'val';
  };

  // テンプレートの本文を読み、{ value, end } を返す。i はバッククォートの次を指す。
  const readTemplate = (start) => {
    let j = start;
    let out = '';
    let n = 0;
    while (j < src.length && src[j] !== '`') {
      if (src[j] === '\\') {
        const r = decodeEscape(src, j + 1);
        out += r.ch;
        j = r.next;
      } else if (src[j] === '$' && src[j + 1] === '{') {
        out += `{${n++}}`;
        j = skipBalanced(j + 2);
      } else {
        out += src[j++];
      }
    }
    return { value: out, end: j + 1 };
  };

  // `${` の次から対応する `}` の次までを読み飛ばす (中の文字列・入れ子テンプレートを考慮)。
  const skipBalanced = (start) => {
    let j = start;
    let depth = 1;
    while (j < src.length && depth > 0) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === "'" || c === '"') {
        j++;
        while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      } else if (c === '`') {
        j = readTemplate(j + 1).end - 1;
      }
      j++;
    }
    return j;
  };

  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === "'" || c === '"') {
      const pos = i;
      i++;
      let out = '';
      while (i < src.length && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\') { const r = decodeEscape(src, i + 1); out += r.ch; i = r.next; } else out += src[i++];
      }
      i++;
      push({ type: 'str', value: out, pos });
      continue;
    }
    if (c === '`') {
      const pos = i;
      const r = readTemplate(i + 1);
      i = r.end;
      push({ type: 'tpl', value: r.value, pos });
      continue;
    }
    if (c === '/' && (prev === '' || REGEX_PREV.has(prev))) {
      // 正規表現リテラルを読み飛ばす
      i++;
      let inClass = false;
      while (i < src.length && (src[i] !== '/' || inClass) && src[i] !== '\n') {
        if (src[i] === '\\') i++;
        else if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        i++;
      }
      i++;
      while (/[a-z]/i.test(src[i] ?? '')) i++;
      prev = 'val';
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const pos = i;
      while (i < src.length && /[\w$]/.test(src[i])) i++;
      push({ type: 'id', value: src.slice(pos, i), pos });
      continue;
    }
    if (/[0-9]/.test(c)) {
      while (i < src.length && /[\w.]/.test(src[i])) i++;
      prev = 'val';
      continue;
    }
    push({ type: 'p', value: c, pos: i });
    i++;
  }
  return tokens;
};

// ── キーの収集 ──
const collect = (src, lineOf) => {
  const tokens = tokenize(src);
  const used = []; // { key, line }
  const dict = new Set();
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    // t('...') / t`...` (`.t(` の形も許す)
    if (tok.type === 'id' && tok.value === 't') {
      const next = tokens[k + 1];
      const arg = tokens[k + 2];
      if (next?.type === 'tpl') used.push({ key: next.value, line: lineOf(next.pos) });
      else if (next?.type === 'p' && next.value === '(' && (arg?.type === 'str' || arg?.type === 'tpl')) {
        used.push({ key: arg.value, line: lineOf(arg.pos) });
      }
    }
    // addDict('ja', { 'key': 'value', ... })
    if (tok.type === 'id' && tok.value === 'addDict') {
      const open = tokens[k + 1];
      const lang = tokens[k + 2];
      const comma = tokens[k + 3];
      const brace = tokens[k + 4];
      if (open?.value === '(' && lang?.type === 'str' && lang.value === 'ja' && comma?.value === ',' && brace?.value === '{') {
        let depth = 1;
        for (let m = k + 5; m < tokens.length && depth > 0; m++) {
          const x = tokens[m];
          if (x.type === 'p' && (x.value === '{' || x.value === '[' || x.value === '(')) depth++;
          else if (x.type === 'p' && (x.value === '}' || x.value === ']' || x.value === ')')) depth--;
          else if (depth === 1 && x.type === 'str' && tokens[m + 1]?.value === ':') dict.add(x.value);
        }
      }
    }
  }
  return { used, dict };
};

// HTML からは src の無い <script> の中身だけを取り出す (HTML コメントは先に潰す)。
const scriptBlocks = (html) => {
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    const offset = m.index + m[0].indexOf('>') + 1;
    blocks.push({ code: m[2], offset });
  }
  return { blocks, text: cleaned };
};

const main = async () => {
  const files = [];
  for (const dir of TARGET_DIRS) {
    let names = [];
    try {
      names = await readdir(join(repoRoot, dir));
    } catch {
      continue;
    }
    for (const name of names.sort()) if (TARGET_EXT.test(name)) files.push(join(repoRoot, dir, name));
  }

  const allUsed = [];
  const allDict = new Set();
  for (const file of files) {
    const text = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
    const rel = relative(repoRoot, file).replace(/\\/g, '/');
    const lineOfIn = (base) => (pos) => text.slice(0, base + pos).split('\n').length;
    const sources = file.endsWith('.html')
      ? scriptBlocks(text).blocks.map((b) => ({ code: b.code, base: b.offset }))
      : [{ code: text, base: 0 }];
    for (const { code, base } of sources) {
      const { used, dict } = collect(code, lineOfIn(base));
      for (const u of used) allUsed.push({ ...u, file: rel });
      for (const key of dict) allDict.add(key);
    }
  }

  const missing = allUsed.filter((u) => !allDict.has(u.key));
  if (missing.length > 0) {
    console.error(`[check:i18n] 日本語訳 (addDict('ja', ...)) の無いキーが ${missing.length} 件あります:`);
    for (const u of missing) console.error(`  ${u.file}:${u.line}  ${JSON.stringify(u.key)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[check:i18n] OK (${files.length} files, ${new Set(allUsed.map((u) => u.key)).size} keys, ${allDict.size} ja entries)`);
};

await main();
