// サンプルページ (examples/NN-*.html) のコメント検査 (`npm run check:comments`)。
//
// サンプルの HTML はサイトの「ソース」ボタンでそのまま読者に見せる。そのためコメントは読者向けの
// 解説でなければならない (設計書 §42、2026-10-09 オーナー指示):
//   1. 英日併記: コメントの塊ごとに、英語の行と日本語の行の両方があること
//      (塊 = <!-- -->、/* */、連続する // 行、コードの行末の // ...)
//   2. 内部向けの記述を含まないこと: 作業メモ (TODO)、設計書の番号 (design goal / design section /
//      §)、ビルド設定 (tsup)、アルファ版の番号 (alpha.N)、リポジトリ内のパス (docs/*.md)
// 違反があれば一覧を出して exit 1。

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const examplesDir = join(repoRoot, 'examples');

const JA = /[぀-ヿ㐀-鿿]/;
const INTERNAL = [
  [/\bTODO\b/, 'TODO (work note)'],
  [/design (goal|section)/i, 'design-doc reference'],
  [/§\s*\d/, 'design-doc section mark'],
  [/\btsup\b/, 'build config'],
  [/\balpha\.\d+/, 'alpha version number'],
  [/\bdocs\/[\w.-]+\.md\b/, 'repository path'],
];

// コメントの塊を集める。返り値: { kind, text, line }[]
const collectComments = (src) => {
  const lineOf = (index) => src.slice(0, index).split('\n').length;
  const blocks = [];
  for (const m of src.matchAll(/<!--([\s\S]*?)-->/g)) blocks.push({ kind: 'html', text: m[1], line: lineOf(m.index) });
  for (const m of src.matchAll(/\/\*([\s\S]*?)\*\//g)) blocks.push({ kind: 'css/js', text: m[1], line: lineOf(m.index) });
  let current = null;
  src.split(/\r?\n/).forEach((l, i) => {
    const whole = l.match(/^\s*\/\/(.*)$/);
    // 行末コメント: 空白 + // + 空白 (https:// のような URL は空白を挟まないので拾わない)
    const tail = !whole && l.match(/\s\/\/\s(.*)$/);
    if (whole) {
      if (!current) current = { kind: '//', text: '', line: i + 1 };
      current.text += `${whole[1]}\n`;
      return;
    }
    if (current) {
      blocks.push(current);
      current = null;
    }
    if (tail) blocks.push({ kind: '// (end of line)', text: tail[1], line: i + 1 });
  });
  if (current) blocks.push(current);
  return blocks;
};

const main = async () => {
  const files = (await readdir(examplesDir)).filter((f) => /^\d\d-.+\.html$/.test(f)).sort();
  const problems = [];
  let count = 0;
  for (const f of files) {
    const src = await readFile(join(examplesDir, f), 'utf8');
    for (const b of collectComments(src)) {
      count++;
      const lines = b.text.split('\n').map((s) => s.trim()).filter(Boolean);
      const hasJa = lines.some((s) => JA.test(s));
      const hasEn = lines.some((s) => !JA.test(s) && /[A-Za-z]{3,}/.test(s));
      const head = lines.join(' | ').slice(0, 100);
      if (!hasJa) problems.push(`examples/${f}:${b.line} [${b.kind}] Japanese is missing: ${head}`);
      if (!hasEn) problems.push(`examples/${f}:${b.line} [${b.kind}] English is missing: ${head}`);
      for (const [re, what] of INTERNAL) {
        if (re.test(b.text)) problems.push(`examples/${f}:${b.line} [${b.kind}] internal note (${what}) shown to readers: ${head}`);
      }
    }
  }
  if (problems.length) {
    console.error(`[check:comments] ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`[check:comments] OK (${files.length} samples, ${count} comments, all bilingual, no internal notes)`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
