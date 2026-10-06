// docs サイト (GitHub Pages 等で配信する静的サイト) の `_site/` を組み立てる。
//
// 事前に `npm run build` で dist/ ができている前提 (npm script `build:site` が先に build する)。
// 配信方法 (GitHub Actions でデプロイするか、出力をコミットするか) は未決なので、この
// スクリプトは「_site/ を作る」ことだけを担当し、デプロイには一切触れない。
//
// _site/ の構成 (相対パスがそのまま効くようにする。examples は `../dist/`、site は `dist/` を参照):
//   _site/index.html, tutorial.html, spec.html, icons.html, _site.css   ← site/**
//   _site/examples/**                                                   ← examples/**
//   _site/docs/*.md                                                     ← docs/*.md (チュートリアル・仕様を fetch して描画)
//   _site/dist/**                                                       ← dist/ のうちブラウザが直接読むもの
//   _site/README.md, README.ja.md, CHANGELOG.md, LICENSE, THIRD_PARTY_NOTICES.md
//   _site/.nojekyll                                                     ← Jekyll 処理を止める (アンダースコア始まりのファイルを配信するため)

import { cp, mkdir, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(repoRoot, '_site');

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

// dist/ の中でブラウザから直接読むもの: IIFE 2 種 (dev / min)、CSS、アイコンの ESM (icons.js)、
// それぞれの .map。型定義 (.d.ts) や CJS、CLI は配信しない。
const isBrowserDistFile = (name) => {
  const base = name.replace(/\.map$/, '');
  return /\.iife(\.min)?\.js$/.test(base) || base.endsWith('.css') || base === 'icons.js';
};

const main = async () => {
  const distDir = join(repoRoot, 'dist');
  if (!(await exists(join(distDir, 'ricdom.iife.min.js')))) {
    console.error('[build-site] dist/ がありません。先に `npm run build` を実行してください。');
    process.exitCode = 1;
    return;
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // site/** → _site/ (ランディング・チュートリアル・仕様・アイコン)
  const siteDir = join(repoRoot, 'site');
  if (await exists(siteDir)) await cp(siteDir, outDir, { recursive: true });

  // examples/** → _site/examples/
  await cp(join(repoRoot, 'examples'), join(outDir, 'examples'), { recursive: true });

  // docs/*.md → _site/docs/ (サブディレクトリは無いが、念のため .md だけを拾う)
  await mkdir(join(outDir, 'docs'), { recursive: true });
  for (const name of await readdir(join(repoRoot, 'docs'))) {
    if (name.endsWith('.md')) await cp(join(repoRoot, 'docs', name), join(outDir, 'docs', name));
  }

  // dist/ のブラウザ向けファイルだけ
  await mkdir(join(outDir, 'dist'), { recursive: true });
  for (const name of await readdir(distDir)) {
    if (isBrowserDistFile(name)) await cp(join(distDir, name), join(outDir, 'dist', name));
  }

  // リポジトリ直下のファイル (サイトからリンクする)
  for (const name of ['README.md', 'README.ja.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    if (await exists(join(repoRoot, name))) await cp(join(repoRoot, name), join(outDir, name));
  }

  await writeFile(join(outDir, '.nojekyll'), '');

  console.log('[build-site] _site/ を作成しました');
};

await main();
