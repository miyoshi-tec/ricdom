import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// `version` export (コア/ui、v1→v2 パリティ一括監査 #3、2.0.0-alpha.14) 用に
// package.json の version を読み、__RICDOM_VERSION__ として焼き込む。__RICDOM_DEV__ と
// 違い dev/prod の分岐用ではなく「publish 時点の値を固定する」だけの定数なので、
// NODE_ENV を注入しない ESM/CJS エントリにも無条件で define する
// (src/env.d.ts の declare 直前のコメント参照)。
const pkgVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }).version;
const versionDefine = { __RICDOM_VERSION__: JSON.stringify(pkgVersion) };

// ビルド構成 (Phase 2 で ricdom/ui サブパスを追加、設計書 §4/§6):
//  - コア: ESM (dist/index.js) + CJS (dist/index.cjs) + 型宣言 (.d.ts / .d.cts)
//    → package.json の exports 条件分岐に対応 (制作側は TS、利用側はビルド不要)
//  - コア IIFE (dist/ricdom.iife.min.js、グローバル名 `ricdom`)
//    → `<script src>` 1 本で動くことの根拠 (G1)
//  - ui: ESM (dist/ui.js) + CJS (dist/ui.cjs) + 型宣言。`ricdom/ui` サブパスの実体。
//    コアへの依存は型のみ (RicNode/App/Host を import type するだけ) なので、
//    実行時のバンドル依存関係は無い (最終報告に記載)。
//  - ui IIFE (dist/ricdom-ui.iife.min.js、グローバル名 `ricdomUI`)
//    → コアの IIFE (`ricdom`) を先に読む使い方を想定するが、型のみ依存のため
//    バンドル的には自己完結する (external 指定は不要)。
//  - dist/ricdom-ui.css は `npm run build` の postbuild (scripts/build-css.mjs) が
//    ui の ESM ビルド (dist/ui.js の buildStylesheet()) から生成する (設計書 §4)。
// dev/prod の分岐 (深い代入警告など、§3.3) は process.env.NODE_ENV を tsup の
// define で差し替えることで実現する。production ビルド (このコマンド) では
// 'production' を注入し、テスト実行時 (vitest) は素の process.env.NODE_ENV を使う。
export default defineConfig([
  {
    // ESM/CJS は npm 経由でバンドラーを使う consumer 向け。process.env.NODE_ENV は
    // ここでは固定しない (consumer 側の bundler (Vite/webpack 等) が自分の
    // NODE_ENV で置換するのが標準的な作法。React 等主要ライブラリも同じ扱い)。
    // これにより dev ビルドの consumer では深い代入警告 (§3.3) が有効なまま届く。
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    minify: false,
    clean: true,
    target: 'es2020',
    define: versionDefine,
  },
  {
    // IIFE は「<script src> 1 本で動く」利用側ビルド不要デモ・配布用 (G1)。
    // CDN から素の状態で読み込まれる想定のため、ここだけ NODE_ENV='production' を
    // 焼き込み、深い代入警告 (§3.3) 等の dev 専用コードを esbuild の dead-code
    // elimination で丸ごと削り、最小サイズにする。
    // 2.0.0-alpha.10 で判明した穴の修正: `process.env.NODE_ENV` の define だけでは
    // isDevMode() (src/reactivity.ts) の `typeof process === 'undefined'` 等のガード節が
    // 置換対象外のまま残り、`process` の無いブラウザでは production ビルドでも
    // isDevMode() が true になってしまっていた (dev 専用コードが DCE されない)。
    // `__RICDOM_DEV__` を `false` の リテラルとして define することで、
    // `typeof __RICDOM_DEV__ === 'boolean'` ごと esbuild が定数畳み込みし、
    // NODE_ENV 判定を含む分岐全体を dead-code elimination できるようにする
    // (src/env.d.ts の型宣言、src/reactivity.ts のコメント参照)。
    entry: { ricdom: 'src/index.ts' },
    format: ['iife'],
    globalName: 'ricdom',
    dts: false,
    sourcemap: true,
    minify: true,
    clean: false,
    target: 'es2020',
    outExtension: () => ({ js: '.iife.min.js' }),
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      __RICDOM_DEV__: 'false',
      ...versionDefine,
    },
    // パイロット第 9 号 = Potopeta からの報告 (2.0.0-alpha.10): esbuild の IIFE 出力は
    // `var ricdom=(()=>{...})();` というトップレベル bare var で、通常の <script> 実行
    // (グローバルスコープ) では `var` がそのまま window のプロパティになるため問題ない。
    // ところが Potopeta の自己完結 HTML バンドル (v1 の LZ 自己展開ツールで生成) は
    // 復元コードを `(()=>{ eval(s) })()` という関数スコープの中で eval する形をとる。
    // 関数スコープの中の `var` はその関数のローカル変数になるだけで window には付かない
    // ため、eval 完了後に `window.ricdom` が存在しない (v1 の成果物は既にこの対策として
    // 明示的な global 代入を持っていた — v1 との非対称に気づかず素の esbuild 出力の
    // ままだったのが今回の穴)。footer で `globalThis.ricdom=ricdom;` を明示注入すること
    // で、`ricdom` ローカル変数 (トップレベル var なので同じ関数スコープ内では参照できる)
    // を確実に `globalThis` へ張り直す。`globalThis` が無い環境 (target es2020 は
    // globalThis 未対応ブラウザを最初から切っているため対象外) は考慮しない。
    // コア gzip 天井 (5,200B) への影響は実測して最終報告に記載する。
    footer: { js: 'globalThis.ricdom=ricdom;' },
  },
  {
    // dev 版 IIFE (`dist/ricdom.iife.js`、2.0.0-alpha.10、統括決定): 上の production
    // IIFE (`.iife.min.js`) は NODE_ENV='production' を静的注入するため、深い代入警告
    // (§3.3) 等の dev 専用コードが esbuild の dead-code elimination で最初から消えている
    // — 主要な配布形態である `<script> 1 行` では、これらの警告が仕組み上「最初から
    // 効かせようがない」ことを意味していた (V1_VS_V2 の「dev ビルドで警告」との整合が
    // 取れていなかった穴)。React の development/production ビルドと同じ発想で、
    // NODE_ENV を注入しない非 minify 版を別出力する。ブラウザには `process` グローバル
    // が無いため、`isDevMode()` (src/reactivity.ts) の
    // `typeof process === 'undefined' → dev 扱い` 分岐が自然に true になり、警告が有効に
    // なる。production 版 (`.iife.min.js`) はコア gzip 天井の対象のまま変更しない —
    // この dev 版は天井の対象外 (配布はしても CDN 常用を想定しない、ローカル開発用)。
    // 2.0.0-alpha.10 で `__RICDOM_DEV__: 'true'` を明示 define する (統括決定)。
    // NODE_ENV を注入しないだけでは「`process` が実在し NODE_ENV が 'production' 以外」
    // という consumer 環境 (Electron レンダラー等) との判別しかできておらず、
    // `__RICDOM_DEV__` 導入後の isDevMode() (src/reactivity.ts) は
    // `typeof __RICDOM_DEV__ === 'boolean'` を最優先で見るため、ここで明示しないと
    // 未定義 → 結局 `process` の有無で分岐するフォールバックに落ちてしまい、
    // production 版 (`.iife.min.js`, `__RICDOM_DEV__: 'false'`) との対比が
    // 「NODE_ENV の baked/非-baked」ではなく「define の有無」でしか効かなくなる。
    entry: { ricdom: 'src/index.ts' },
    format: ['iife'],
    globalName: 'ricdom',
    dts: false,
    sourcemap: true,
    minify: false,
    clean: false,
    target: 'es2020',
    outExtension: () => ({ js: '.iife.js' }),
    define: {
      __RICDOM_DEV__: 'true',
      ...versionDefine,
    },
    // production 版と同じ理由 (B) で、関数スコープ eval 耐性のため footer は dev 版にも付ける。
    footer: { js: 'globalThis.ricdom=ricdom;' },
  },
  {
    // ricdom/ui サブパスの ESM/CJS + 型宣言。コアと同じく consumer 側の bundler が
    // 自分の NODE_ENV で置換する (ui 側の dev-only warn = focusWhen / inlineMenu / theme も
    // src/ui/internal/pureHelpers.ts の isDevMode 経由で同じ NODE_ENV を見る)。
    entry: { ui: 'src/ui/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    minify: false,
    clean: false,
    target: 'es2020',
    define: versionDefine,
  },
  {
    // ricdomUI IIFE。`<script src>` 2 本 (ricdom → ricdom-ui) で部品が動くことの根拠。
    // `__RICDOM_DEV__` は src/ui/internal/pureHelpers.ts の独自 isDevMode / bakedDevMode
    // (コアの src/reactivity.ts と同じ規則の複製、ui はコアに実行時依存が無いため) が
    // 見る。コア修正時は define だけ先に置いてあり ui 側の判定が未対応だったが、
    // 同じ 2.0.0-alpha.10 内で focusWhen / inlineMenu / theme の dev-only warn も
    // この define で DCE されるようになった。
    entry: { 'ricdom-ui': 'src/ui/index.ts' },
    format: ['iife'],
    globalName: 'ricdomUI',
    dts: false,
    sourcemap: true,
    minify: true,
    clean: false,
    target: 'es2020',
    outExtension: () => ({ js: '.iife.min.js' }),
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      __RICDOM_DEV__: 'false',
      ...versionDefine,
    },
    // 上のコア IIFE と同じ理由・同じ対策 (2.0.0-alpha.10、パイロット第 9 号 = Potopeta)。
    footer: { js: 'globalThis.ricdomUI=ricdomUI;' },
  },
  {
    // dev 版 ui IIFE (`dist/ricdom-ui.iife.js`)。上のコア dev IIFE と同じ理由
    // (2.0.0-alpha.10、統括決定): `__RICDOM_DEV__: 'true'` で ui 側の dev-only warn
    // (focusWhen / inlineMenu / theme) が `process` の無いブラウザでも無条件に有効になる。
    entry: { 'ricdom-ui': 'src/ui/index.ts' },
    format: ['iife'],
    globalName: 'ricdomUI',
    dts: false,
    sourcemap: true,
    minify: false,
    clean: false,
    target: 'es2020',
    outExtension: () => ({ js: '.iife.js' }),
    define: {
      __RICDOM_DEV__: 'true',
      ...versionDefine,
    },
    footer: { js: 'globalThis.ricdomUI=ricdomUI;' },
  },
  {
    // ricdom/md-editor サブパスの ESM/CJS + 型宣言 (opt-in、Raccoon Memo パイロット第 5 号
    // からの要望、2.0.0-alpha.16)。`ricdom/ui` の一部として ui.js には含めない —
    // createMdEditor/tokenizeMarkdown を必要としない既存 consumer の `ricdom/ui` バンドル
    // サイズに一切影響を与えないための独立サブパス (src/mdEditor/index.ts のヘッダコメント
    // 参照)。src/ui/internal/* の値・型を import するが、実行時はそのままバンドルに
    // インライン化されるだけで `ricdom/ui` への実行時依存にはならない (コアとの関係と同じ
    // 「型のみ/インライン化のみ」の扱い)。
    entry: { 'md-editor': 'src/mdEditor/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    minify: false,
    clean: false,
    target: 'es2020',
    define: versionDefine,
  },
  {
    // ricdomMdEditor IIFE (production)。`<script src>` 1 本 (ricdom-md-editor) だけでも
    // createMdEditor が動く自己完結ビルド — ただし見た目 (CSS) は `ricdom-ui.css` 側にしか
    // 無いので、実際に使うには結局それも読み込む (src/mdEditor/index.ts 参照)。
    entry: { 'ricdom-md-editor': 'src/mdEditor/index.ts' },
    format: ['iife'],
    globalName: 'ricdomMdEditor',
    dts: false,
    sourcemap: true,
    minify: true,
    clean: false,
    target: 'es2020',
    outExtension: () => ({ js: '.iife.min.js' }),
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      __RICDOM_DEV__: 'false',
      ...versionDefine,
    },
    // コア/ui の IIFE と同じ理由・同じ対策 (2.0.0-alpha.10、パイロット第 9 号 = Potopeta):
    // 関数スコープ eval (v1 由来の自己展開ツール等) でも globalThis に確実に張る。
    footer: { js: 'globalThis.ricdomMdEditor=ricdomMdEditor;' },
  },
  {
    // dev 版 ricdomMdEditor IIFE。コア/ui の dev IIFE と同じ理由 (2.0.0-alpha.10 の
    // 統括決定を踏襲) — `process` の無いブラウザでも `__RICDOM_DEV__: 'true'` で
    // dev-only 分岐 (src/ui/internal/pureHelpers.ts 経由の isDevMode) を無条件で有効にする。
    entry: { 'ricdom-md-editor': 'src/mdEditor/index.ts' },
    format: ['iife'],
    globalName: 'ricdomMdEditor',
    dts: false,
    sourcemap: true,
    minify: false,
    clean: false,
    target: 'es2020',
    outExtension: () => ({ js: '.iife.js' }),
    define: {
      __RICDOM_DEV__: 'true',
      ...versionDefine,
    },
    footer: { js: 'globalThis.ricdomMdEditor=ricdomMdEditor;' },
  },
  {
    // ricdom/icons サブパスの ESM/CJS + 型宣言 (設計書付録 B A17、Phase 3c)。
    // データ + 変換器のみのパッケージで、コア/ui のどちらにも実行時依存が無い
    // (uiIcon の descriptor 引数と構造的に同じ形なだけ)。**IIFE は作らない**
    // (ビルド不要ユーザーは `npx ricdom-icon` で descriptor をコピーする、
    // v1 の「使う分だけ」哲学の継続 — 最終報告に記載)。
    entry: { icons: 'src/icons/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    minify: false,
    clean: false,
    target: 'es2020',
  },
  {
    // ricdom-icon CLI (package.json の `bin`)。Node 向け単体 CJS バイナリとして
    // dist/cli/ricdom-icon.cjs にビルドする (設計書付録 B A17「ヘッドレス CLI」)。
    // ブラウザ向け IIFE 群とは違う一群 (Node 専用、shebang 付き) なので platform を
    // 明示し、型宣言は不要 (実行専用のバイナリ)。
    entry: { 'ricdom-icon': 'src/cli/ricdomIcon.ts' },
    format: ['cjs'],
    outDir: 'dist/cli',
    platform: 'node',
    target: 'node18',
    dts: false,
    sourcemap: false,
    minify: false,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
