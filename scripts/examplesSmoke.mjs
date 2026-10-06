// docs サイト + examples のスモークテスト (2.0.0-alpha.3 の examples 版を、サイト化に合わせて拡張)。
//
// `examples/` はビルド不要を証明する生 HTML デモ、`site/` はそのデモ集を束ねるドキュメントサイト
// (どちらも ricdom 自身で描画する)。本物のビルド成果物を本物のブラウザで開いて初めて分かる種類の
// 壊れ方 (dist/ のパス間違い、IIFE のグローバル名食い違い、CSS の読み込み漏れ、Markdown の fetch
// 失敗 等) を確認する。
//
// 対象は `npm run build:site` が作る `_site/` (package.json の `pretest:examples` が
// build → build-site → check:i18n を先に回す)。Node 組み込みの http で `_site/` を配信し、
// Playwright (devDependency) で各ページを開いて確認する:
//   - 全ページ: console error / pageerror が 0 件
//   - examples/*.html (アンダースコア始まり以外): `button[aria-haspopup]` を順にクリックして
//     開いた popup/dropdown/dialog の本体 rect が viewport 内、Escape で閉じる
//   - サンプル (NN-*.html): #ricdom-nav にテーマ <select> (7 択) と言語 <select> (2 択)、
//     Source ボタンでソースのダイアログが開く、言語/テーマの切替が反映される
//   - _samples.js の一覧と NN-*.html が 1 対 1 で一致する
//   - tutorial.html: en / ja の両方で h2 が 5 個以上、ja はライブデモの iframe が 3 個以上で中身が動いている
//   - spec.html: h2 が 5 個以上、icons.html: アイコンのセルが 30 個以上

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { chromium } from 'playwright';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const siteDir = join(repoRoot, '_site');
const examplesDir = join(siteDir, 'examples');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

// _site/ を素朴に配信する静的サーバ (examples は `../dist/`、site は `dist/` を相対パスで参照する)。
const startServer = () =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const filePath = join(siteDir, relPath || 'index.html');
        const body = await readFile(filePath);
        res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });

// Playwright の boundingBox() は {x, y, width, height} を返す — left/top/right/bottom に揃えて判定する。
const rectWithinViewport = (box, vw, vh, margin = 2) => {
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  return left >= -margin && top >= -margin && right <= vw + margin && bottom <= vh + margin;
};

// ページを開き、console error / pageerror / 失敗したリクエストを集める。
// lang を渡すと ricdom-site.lang を先に localStorage へ入れて、その言語で開く。
const openPage = async (browser, baseUrl, path, { lang } = {}) => {
  const context = await browser.newContext({ locale: 'en-US' });
  if (lang) {
    // init script は sandbox 付き iframe (localStorage 不可) でも走るので try で囲む
    await context.addInitScript((l) => {
      try { localStorage.setItem('ricdom-site.lang', l); } catch { /* sandboxed frame */ }
    }, lang);
  }
  const page = await context.newPage();
  const problems = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${String(err)}`));
  page.on('requestfailed', (req) => problems.push(`request failed: ${req.url()}`));
  page.on('response', (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  await page.goto(`${baseUrl}/${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(150); // createApp の初回同期描画 + 初期 rAF が落ち着くのを待つ
  return { page, context, problems };
};

// 共通ナビ (#ricdom-nav) の確認: テーマ 7 択 + 言語 2 択。
const checkNav = async (page, issues) => {
  const nav = page.locator('#ricdom-nav');
  if ((await nav.count()) === 0) {
    issues.push('#ricdom-nav がない');
    return false;
  }
  const selects = nav.locator('select');
  const n = await selects.count();
  if (n !== 2) {
    issues.push(`#ricdom-nav の <select> が ${n} 個 (期待: 2)`);
    return false;
  }
  const themeOptions = await selects.nth(0).locator('option').count();
  const langOptions = await selects.nth(1).locator('option').count();
  if (themeOptions !== 7) issues.push(`テーマ <select> の選択肢が ${themeOptions} 個 (期待: 7)`);
  if (langOptions !== 2) issues.push(`言語 <select> の選択肢が ${langOptions} 個 (期待: 2)`);
  return true;
};

// popup/dropdown/dialog のトリガーを順に開いて rect と Escape を確認する (従来のスモークテスト)。
const checkPopups = async (page, issues) => {
  const triggers = await page.locator('button[aria-haspopup]').all();
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const bodySelector = '[data-ricdom-role="popup"], [data-ricdom-role="dropdown"], [data-ricdom-role="dialog"]';
  for (let i = 0; i < triggers.length; i++) {
    await triggers[i].click();
    await page.waitForTimeout(150); // rAF 実測フェーズ + アニメーション開始を待つ
    const body = page.locator(bodySelector).first();
    if ((await body.count()) === 0) {
      issues.push(`trigger #${i} (aria-haspopup) をクリックしても popup/dropdown/dialog の本体が現れなかった`);
      continue;
    }
    const role = await body.getAttribute('data-ricdom-role');
    const rect = await body.boundingBox();
    if (!rect || !rectWithinViewport(rect, viewport.width, viewport.height)) {
      issues.push(`trigger #${i} (${role}) の本体 rect が viewport 外: ${JSON.stringify(rect)} (viewport ${viewport.width}x${viewport.height})`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350); // exit アニメーション終了を待つ
    if ((await body.count()) > 0) issues.push(`trigger #${i} (${role}) が Escape で閉じなかった`);
  }
  return triggers.length;
};

// サンプル 1 ページ分の確認。
const checkExample = async (browser, baseUrl, file, isSample) => {
  const { page, context, problems } = await openPage(browser, baseUrl, `examples/${file}`);
  const issues = [];
  const triggerCount = await checkPopups(page, issues);

  if (file === 'index.html') await checkNav(page, issues);
  if (isSample) {
    if (await checkNav(page, issues)) {
      const nav = page.locator('#ricdom-nav');

      // Source ボタン: ページ自身の HTML がダイアログに出る
      await nav.getByRole('button', { name: 'Source' }).click();
      await page.waitForTimeout(250);
      const pre = page.locator('[data-ricdom-role="dialog"] pre');
      const sourceLength = (await pre.count()) > 0 ? (await pre.first().textContent())?.length ?? 0 : 0;
      if (sourceLength < 200) issues.push(`Source ダイアログにページのソースが出ていない (長さ ${sourceLength})`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(350);

      // テーマ切替: body 全体に反映され、localStorage に保存される
      await nav.locator('select').nth(0).selectOption('dark');
      await page.waitForTimeout(100);
      const themed = await page.evaluate(() => ({
        attr: document.body.getAttribute('data-ricdom-theme'),
        stored: localStorage.getItem('ricdom-site.theme'),
      }));
      if (themed.attr !== 'dark' || themed.stored !== 'dark') issues.push(`テーマ切替が反映されない: ${JSON.stringify(themed)}`);

      // 08-themes: ページ内の 7 ボタンもナビと同じテーマを指す
      if (file === '08-themes.html') {
        const primary = await page.locator('button.ric-button--primary', { hasText: /^dark$/ }).count();
        if (primary === 0) issues.push('08-themes のテーマボタンがナビのテーマ (dark) に追従していない');
      }

      // 言語切替: <html lang> と localStorage が更新され、エラーが出ない
      await nav.locator('select').nth(1).selectOption('ja');
      await page.waitForTimeout(150);
      const langState = await page.evaluate(() => ({ lang: document.documentElement.lang, stored: localStorage.getItem('ricdom-site.lang') }));
      if (langState.lang !== 'ja' || langState.stored !== 'ja') issues.push(`言語切替が反映されない: ${JSON.stringify(langState)}`);
    }
  }

  if (problems.length > 0) issues.push(...problems);
  await context.close();
  return { label: `examples/${file}`, issues, note: `trigger ${triggerCount} 件` };
};

// 見出し数 (.doc-body 内の h2) を数える。
const countH2 = (page) => page.locator('.doc-body h2').count();

const checkTutorial = async (browser, baseUrl, lang) => {
  const { page, context, problems } = await openPage(browser, baseUrl, 'tutorial.html', { lang });
  const issues = [];
  await page.waitForSelector('.doc-body h2', { timeout: 5000 }).catch(() => issues.push('h2 が描画されなかった (Markdown の fetch に失敗?)'));
  const h2 = await countH2(page);
  if (h2 < 5) issues.push(`h2 が ${h2} 個 (期待: 5 以上)`);
  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  if (htmlLang !== lang) issues.push(`<html lang> が ${htmlLang} (期待: ${lang})`);
  const toc = await page.locator('.doc-toc a').count();
  if (toc < 5) issues.push(`目次のリンクが ${toc} 個 (期待: 5 以上)`);
  const idsOk = await page.evaluate(() => [...document.querySelectorAll('.doc-body h2')].every((h) => h.id));
  if (!idsOk) issues.push('h2 に id が付いていない (目次のリンク先がない)');

  let frames = 0;
  if (lang === 'ja') {
    frames = await page.locator('iframe.doc-demo__frame').count();
    if (frames < 3) issues.push(`ライブデモの iframe が ${frames} 個 (期待: 3 以上)`);
    await page.waitForTimeout(500); // iframe 内の ricdom が描画されるのを待つ
    // 少なくとも 1 つの iframe の中に、実際に描画された要素がある
    const rendered = await Promise.all(
      page.frames().filter((f) => f !== page.mainFrame()).map((f) => f.evaluate(() => document.querySelector('#app')?.children.length ?? 0).catch(() => 0)),
    );
    if (!rendered.some((n) => n > 0)) issues.push('iframe の中で ricdom が描画されていない');
    // 高さが postMessage で調整されている (初期値 120px 以外のものがある)
    const heights = await page.locator('iframe.doc-demo__frame').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    if (heights.length > 0 && heights.every((h) => Math.round(h) === 120)) issues.push('iframe の高さが自動調整されていない');
  }
  issues.push(...problems);
  await context.close();
  return { label: `tutorial.html (${lang})`, issues, note: `h2 ${h2}, toc ${toc}, live iframe ${frames}` };
};

const checkSpec = async (browser, baseUrl) => {
  const { page, context, problems } = await openPage(browser, baseUrl, 'spec.html');
  const issues = [];
  await page.waitForSelector('.doc-body h2', { timeout: 5000 }).catch(() => issues.push('h2 が描画されなかった'));
  const h2 = await countH2(page);
  if (h2 < 5) issues.push(`h2 が ${h2} 個 (期待: 5 以上)`);
  await checkNav(page, issues);
  issues.push(...problems);
  await context.close();
  return { label: 'spec.html', issues, note: `h2 ${h2}` };
};

const checkIcons = async (browser, baseUrl) => {
  const { page, context, problems } = await openPage(browser, baseUrl, 'icons.html');
  const issues = [];
  await page.waitForSelector('.icon-cell', { timeout: 5000 }).catch(() => issues.push('アイコンのセルが描画されなかった'));
  const cells = await page.locator('.icon-cell').count();
  if (cells < 30) issues.push(`アイコンのセルが ${cells} 個 (期待: 30 以上)`);
  await checkNav(page, issues);
  issues.push(...problems);
  await context.close();
  return { label: 'icons.html', issues, note: `${cells} icons` };
};

const checkLanding = async (browser, baseUrl) => {
  const { page, context, problems } = await openPage(browser, baseUrl, 'index.html');
  const issues = [];
  await checkNav(page, issues);
  const links = await page.locator('.site-links a').count();
  if (links < 6) issues.push(`リンクカードが ${links} 個 (期待: 6)`);
  issues.push(...problems);
  await context.close();
  return { label: 'index.html', issues, note: `${links} links` };
};

// _samples.js の一覧と NN-*.html の 1 対 1 対応 (どちらかだけ増やし忘れるのを防ぐ)。
const checkSamplesConsistency = async (files) => {
  const issues = [];
  const sandbox = { window: {} };
  vm.runInNewContext(await readFile(join(examplesDir, '_samples.js'), 'utf8'), sandbox);
  const listed = (sandbox.window.RICDOM_SAMPLES ?? []).map((s) => s.file);
  const numbered = files.filter((f) => /^\d\d-.+\.html$/.test(f));
  for (const f of numbered) if (!listed.includes(f)) issues.push(`${f} が _samples.js に載っていない`);
  for (const f of listed) if (!numbered.includes(f)) issues.push(`_samples.js の ${f} に対応する NN-*.html がない`);
  for (const s of sandbox.window.RICDOM_SAMPLES ?? []) {
    if (!s.title?.en || !s.title?.ja || !s.blurb?.en || !s.blurb?.ja) issues.push(`${s.file} の title/blurb に en/ja のどちらかがない`);
  }
  return { label: '_samples.js <-> NN-*.html', issues, note: `${numbered.length} samples` };
};

const main = async () => {
  try {
    await stat(join(siteDir, 'index.html'));
  } catch {
    console.error('[examplesSmoke] _site/ がありません。`npm run build:site` を先に実行してください (npm run test:examples は自動で行います)。');
    process.exitCode = 1;
    return;
  }

  const files = (await readdir(examplesDir)).filter((f) => f.endsWith('.html') && !f.startsWith('_')).sort();
  if (files.length === 0) {
    console.error('[examplesSmoke] _site/examples/*.html が見つかりません。');
    process.exitCode = 1;
    return;
  }

  const server = await startServer();
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  // 既存の vitest browser (Playwright provider) は headless chromium で動いている実績がある。
  const browser = await chromium.launch({ headless: true });

  let failed = false;
  const report = (result) => {
    if (result.issues.length === 0) {
      console.log(`[examplesSmoke] OK   ${result.label} (${result.note})`);
    } else {
      failed = true;
      console.error(`[examplesSmoke] NG   ${result.label}`);
      for (const issue of result.issues) console.error(`  - ${issue}`);
    }
  };

  try {
    report(await checkSamplesConsistency(files));
    for (const file of files) report(await checkExample(browser, baseUrl, file, /^\d\d-/.test(file)));
    report(await checkLanding(browser, baseUrl));
    report(await checkTutorial(browser, baseUrl, 'en'));
    report(await checkTutorial(browser, baseUrl, 'ja'));
    report(await checkSpec(browser, baseUrl));
    report(await checkIcons(browser, baseUrl));
  } finally {
    await browser.close();
    server.close();
  }

  if (failed) {
    console.error('[examplesSmoke] failed');
    process.exitCode = 1;
  } else {
    console.log('[examplesSmoke] all pages passed');
  }
};

await main();
