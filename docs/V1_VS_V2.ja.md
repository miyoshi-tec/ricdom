# RicDOM v1 と ricdom v2 の違い (2026-09-02 時点)

> v1 = [miyoshi-tec/RicDOM-v1](https://github.com/miyoshi-tec/RicDOM-v1) (v0.4.4、保守モード)、v2 = このリポジトリ (2.0.0-alpha)。移行ガイドの土台。

## 基盤・配布

| 観点 | v1 | v2 |
|---|---|---|
| 実装言語 | JavaScript (CommonJS) | **TypeScript** (利用者はビルド不要のまま) |
| 型定義 | なし | **同梱** (`tag` から属性型を導出、render 内の `s` も型付き) |
| 命名 | snake_case、`create_RicDOM`、子要素は `ctx` | **camelCase**、`createApp`、子要素は **`children`** |
| モジュール形式 | CommonJS + グローバル min.js | **ESM / CJS / IIFE** (`exports` マップ) |
| 配布 | docs/ の min.js を手でコピー、npm 未公開 | **npm + jsDelivr** (`<script>` 1 行 / `import` 1 行)、サブパス `ricdom` / `ricdom/ui` / `ricdom/ui.css` / `ricdom/icons` |
| LZ 自己展開版 | あり (CSP で unsafe-eval 必要) | 本体には含めない (v1 の独立ツールとして継続) |
| ライセンス | PolyForm Noncommercial + Internal Use (v0.4.0〜) | **MIT** |
| コアサイズ | 10.5KB min | 11.5KB min / **5.0KB gzip** (天井 5KiB、以後コアに機能を足さない) |
| docs | 日本語のみ (約 3,900 行) | **英語が正** (README EN/JA、SPEC、TUTORIAL) + CONTRIBUTING / CoC / SECURITY / CHANGELOG |
| テスト | node:test + jsdom (1,023 件) | **Vitest unit 467 + Playwright 実ブラウザ 50**、GitHub Actions CI |

## コア API

| 観点 | v1 | v2 |
|---|---|---|
| 生成 | `create_RicDOM(target, { …state, render })` | **`createApp(target, state, render, { portalTo? })`** (render を分離することで `S` が state から推論される) |
| target 未解決時 | 20 秒ポーリング | **`DOMContentLoaded` を 1 回待つ**、それでも無ければ console.error + NOOP |
| 複数インスタンスの state 共有 | あり (同じ state を渡すと共有) | **なし** (共有したければ同じオブジェクトを明示的に渡す) |
| リアクティビティ | 浅い Proxy (トップ + 1 段)、深い代入は無警告 | 浅い Proxy (同じ) + **dev ビルドで深い代入を console.warn** |
| 元 state の直接変更 | 反応しない | 反応しない (**FACT として docs に明記**) |
| diff 対象外の島 | `ctx` を省略した要素 | **`island: true`** の明示フラグ (`children` 省略は空要素) |
| `{}` ノード | 不可視 | **`tag` は型上必須** (実行時欠落は console.error + 不可視) |
| `style` | string / object / array | **object のみ** |
| `class` | string / array | **string / array / `Record<string, boolean>`** (上位互換の追加。v1 の 2 形はそのまま動き、真偽値マップ `{ active: true, disabled: false }` も新たに受け付ける — v1→v2 パリティ一括監査 #13) |
| 編集中ガード | ui_tweak の number 行だけ部品側で実装 | **コアの規則**: フォーカス中の input/textarea/select に `value` を再適用しない |
| select の value/option 順 | v0.3.38 でコア修正 | 同じ (継承) |
| スケジューラ | rAF + 200ms バックストップ (v0.3.36〜) | 同じ (継承) |
| `render_now` / `next_render` | あり | **`renderNow()` / `nextRender()`** (契約同じ) |
| エラー時 | `NOOP_PROXY` (型は `any` 相当) | **型付き NOOP App** (インターフェースを満たす no-op) |
| 安定セレクタ | `data-ric-role` | **`data-ricdom-role`** (全部品 + portal ルート、`UI_ROLE` 列挙) |

## 部品・スタイル

| 観点 | v1 | v2 |
|---|---|---|
| 状態を持つ部品の契約 | `s.x = create_ui_x()` で `__notify` を**暗黙注入** (state トップレベル必須、誤ると silent failure) | **`const x = app.use(createX())`** で明示登録。未登録で呼ぶと console.error + NOOP、`dispose()` あり。**注意: `createApp` は同期で初回描画するため、`use()` は `render` 関数の外で行う** — canon は 2 通り: `setup` オプション (下記「`setup` オプション」節)、または `() => null` で作ってから `app.render` を後付けする (下記「二段階配線のもう 1 つの解」節、v1 の handle→配線→render 後付けの順序をそのまま再現したい場合向け) |
| 状態を持たない部品 | `ui_button(...)` 等 | `uiButton(...)` 等 (純粋関数、`use()` 不要) |
| portal (popup/dialog/toast/tooltip) | `create_ui_page` の render が drain (**page 必須**、css_for 島では不可) | **app 単位の portal ホスト** (page 部品なし)、`portalTo` で任意要素 |
| CSS 配布 | per-instance で使用クラスを収集注入 (通らない mount は**無装飾**)、`css_for` 3 点セット | **1 枚の `ricdom-ui.css`** (`<link>` or `injectStyles()`)、無装飾 silent failure は構造的に消滅。**LZ 自己展開ツールなど「関数スコープの中で eval する」ローダとの組み合わせ**は IIFE の footer による明示 global 代入で対応 (alpha.10〜、下記「移行の落とし穴」節)。**生 CSS を `<style>` に直接埋め込む単一ファイル配布**は、CSS 読込検知 (`warnIfStylesMissing`) を `document.styleSheets` 走査方式にしたことで false positive の warn が出なくなった (alpha.10〜、Potopeta = パイロット第 9 号からの報告) |
| テーマ | `create_ui_page({theme})` / `make_css_vars` / `create_theme` / `export_theme` | **`applyTheme(el, {theme, density, fontSize})`** (`data-ricdom-theme` 付与 + `color-scheme`) / `createTheme` / `exportTheme` / **`createDensity`** / **`createFontSize`** (density/fontSize 版の `createTheme`、alpha.10 で復活)。変数名 `--ric-*` は継続。**density の有効値は v1/v2 とも `comfortable` / `compact` / `tight`** の 3 つのみ (`spacious` 等は v1 でも無効で黙って既定値にフォールバックしていた — v2 の `applyTheme` invalid-name warn (alpha.7〜) がこれを初めて可視化する)。**`glass`/`glass-dark` (フロストガラス、alpha.18) は v2 のみの新設テーマ** — v1 に対応物なし。新設トークン `--ric-surface-blur` も同様に v2 のみ |
| page 部品 | `create_ui_page` (テーマ + CSS 注入 + portal drain の要 + `.ric-page` への bg/fg/font-size 塗り + `padding: var(--ric-gap-md)` / `overflow: hidden` / `box-sizing: border-box`) | **廃止** (役割は `applyTheme` / CSS 1 枚 / portal ホストに分解)。`create_ui_page` が塗っていた **bg/fg/font-size のみ** `applyTheme` した要素自身に塗られる形でパリティ確保 (bg/fg は alpha.3〜、font-size は alpha.6〜)。**`padding`/`overflow`/`box-sizing` はパリティ対象外** — `applyTheme` を当てた要素がページ全体とは限らないため (詳細・補償 CSS は下記「移行の落とし穴」節) |
| panel (状態を持つ) | `create_ui_panel` (state を持つ panel ファクトリ、`app.use()` 相当の暗黙注入で theme/density/fontSize を自身に適用) | **廃止** (v1→v2 パリティ一括監査 #11)。状態を持たない **`uiPanel`** (レイアウトのみ) + 要素への **`applyTheme`**(テーマの島) の組み合わせで同じ結果を表現する。`create_ui_panel` が内部で持っていた「自分の theme/density/fontSize を自分に適用する」処理を、`uiPanel` が返す要素の ref に対して呼び出し側が `applyTheme(el, {...})` するだけで再現できるため、専用ファクトリを維持する理由が無かった |
| a11y | 意図的に最小 (inline_menu に ARIA なし、dialog に focus trap なし) | **APG 準拠を初期設計に**: dialog = focus trap + `inert` + Esc 復帰、menu = 矢印キー、tabs = roving tabindex、splitter = 矢印キーリサイズ、toast = `aria-live` |
| popup | `create_ui_popup` (label / icon / menu モード混在、`open_at` v0.4.3) | **`createPopup` = menu 専用** (`openAt` 継承) + **`createDropdown`** (Popover、新設)。トリガーの見た目 (icon+ghost の丸ボタン等) は `trigger` に **object 形** `{ icon?, label?, ghost?, size?, class?, style? }` を渡すと再現できる (alpha.2、v1 parity)。従来の `RicNode`/`RicNode[]` 形と二択。**`createDropdown` は同じ見た目を top-level props (`label`/`icon`/`chevron`/`ghost`) で指定する** (`trigger` object 形は持たない、canon 1 つ) — 見た目の指定場所が部品によって違う点に注意。指定場所だけでなく **`label` の型の幅まで違っていた** (`PopupTriggerObject.label` は `RicNode \| RicNode[]` なのに `DropdownProps.label` は `string` のみ) が、線茶 (第 10 号) の報告で `DropdownProps.label` も `RicNode \| RicNode[]` に揃え解消した (2.0.0-alpha.12)。**`.ric-dropdown__trigger--label` の CSS `width` は v1 `100%` → v2 `auto`** (意図的な変更。v1 は親幅いっぱいに広がる見た目だったが、v2 は内容幅に収まる見た目にした。線茶 / Trend Guard / Potopeta の 3 パイロットが `auto` の見た目のまま移行を確認済み — v1→v2 パリティ一括監査 #9。再検討条件: 親幅いっぱいに依存したレイアウトを組んでいた consumer から実害報告があった場合) |
| 外側クリック検知 | `watch_outside_click(el, handler)` (公開ヘルパー、`ric_ui/dom_helpers.js`) | **廃止** (v1→v2 パリティ一括監査 #10)。中身は `document.addEventListener('pointerdown', handler)` 1 行相当 (v1 実装も 5 行程度) だったため、専用ヘルパーを持たず consumer が直接書く方針にした。代替:<br>`document.addEventListener('pointerdown', (ev) => { if (!el.contains(ev.target as Node)) handler(ev); });`<br>（`createPopup`/`createDropdown` 自身の light-dismiss は内部で同種のロジックを持っており、この項は「自作コンポーネントで同じことをしたい」consumer 向け）。再検討条件: 2 consumer 以上から専用ヘルパーの要望があった場合 |
| tabs | `ui_tabs` は**純関数** (`bind_tabs` で外側から controlled 制御、部品自体は状態を持たない) | **`createTabs` は状態を持つ部品** (`app.use(createTabs())` が必須、v1 の `ui_tabs` をそのまま呼ぶだけのコードは動かない)。controlled / **uncontrolled**。全 item に `children` が無ければ tabpanel を描かない**パネル無しモード** (alpha.2、セグメントコントロール用途)。**`bind_tabs` に対応する v2 専用ヘルパーは無い** (v1→v2 パリティ一括監査 #17) — `createTabs` 自体が controlled/uncontrolled の両方を内包する設計になったため、外付けの bind ヘルパーで controlled 化する必要がそもそも無くなった |
| layout の `gap` | `ui_row({gap})` は正式 prop | **`uiRow`/`uiCol` の `gap` prop は復活** (alpha.2 — v2 は当初 rest 経由の属性化で黙って崩れていた、25 箇所以上で報告)。`uiGrid` の `gap` は元から存在 |
| `focus_when` | 条件の立ち上がりで ref 先へ focus (4 箇所で使用) | **`createFocusWhen`** (`ricdom/ui`、alpha.2)。`app.use()` 登録 + `fw(refName, condition)`。dialog の既定初期フォーカスでは代替できない「特定要素へ」「dialog 以外のタイミングでも」のケース向け |
| tweak パネル | `create_ui_tweak_panel` + `ui_tweak_row` + folder | **`createTweakPanel` 1 部品** (Tier1 `data` / Tier2 `keys` / Tier3 `rows`) |
| 排他制御 | モジュール level の registry (削除なし) | **app 単位** + `dispose` で解除 |
| アニメ完了待ち | `animationend` のみ | `animationend` / `transitionend` + **700ms バックストップ** (CSS 未ロードでも固まらない) |
| アイコン | docs/icons/icons.json + ピッカー + `ricdom-icon` CLI | **`ricdom/icons`** の named export (tree-shakable) + `svgToDescriptor` + CLI (パリティ)。descriptor 形式 `{ v?, s?, p }` は同じ |
| スクロールバー既定 | `.ric-page`/`.ric-page *` 配下 (v0.4.2〜、`scrollbar-color: var(--ric-scrollbar-thumb) transparent` 常時 + hover で濃く) | `[data-ricdom-theme]`/`[data-ricdom-theme] *` 配下、**既定値そのものは v0.4.2 以降の v1 と同一** (`scrollbar-color: var(--ric-scrollbar-thumb) transparent` 常時 + hover で濃く)。変わったのは**スコープのみ** (`.ric-page` → `[data-ricdom-theme]`)。ただし **v0.4.1 以前の v1 から移るアプリは既定値も変わって見える** (v0.3.x〜v0.4.1 は常時 transparent、hover のみアクセント色。v0.4.2 で現行の既定値に置き換わった)。内側にスクロール領域を持つアプリは、移行元の版を確認すること |

## 移行の目安 (Phase 5 で検証)

| 領域 | 作業 |
|---|---|
| 純粋ノード (`ctx`→`children`、snake→camel、style を object に) | **機械変換可能 (ただし取りこぼす 2 形がある。下記「機械変換の節」参照)** |
| `s.x = create_ui_x()` → `app.use(createX())` | 手動 (最大の変更点)。**`createApp` は同期初回描画のため `setup` オプション内で行う** (下記「`setup` オプション」節) |
| `create_ui_page` の除去 → `applyTheme(el)` + CSS `<link>` | 手動 (単純)。ただし bg/fg/font-size 以外の旧 `.ric-page` の効果 (padding/overflow/box-sizing) は補償 CSS が要る (下記) |
| portal 系 (popup/dialog/toast/tooltip) の props | 手動 (API 変更) |
| アイコン descriptor | そのまま |

## 移行の落とし穴 (第 3〜8 号のフィードバックより — 表のとおりに書くと必ず 1 回踏む)

移行ガイドの対応表は「何が変わったか」を短く伝えるものだが、実際に手を動かすと表の 1 行だけでは
気づけない具体的な落とし穴がある。ここでは実際のパイロット移行 (第 3〜4 号、Electron 3 アプリ
同時移行だった第 5〜7 号 = RaccoonMemo/Rancha/Brownies Desktop、および第 8 号 = LCP) が踏んだものを、
再現手順ごと記録する。

### `setup` オプション: `app.use()` を呼ぶタイミング

`createApp(target, state, render, options?)` は**生成時に同期で初回描画する** (`target` が即時
解決する場合、[SPEC.md §5](SPEC.md) FACT)。つまり `render` 関数は `createApp` が返るより前に
少なくとも 1 回実行される。ここで罠になるのが、v1 スタイルの「まず `createApp` を呼び、戻り値を
受けてから部品を `use()` する」書き方:

```js
// ❌ これは動かない — 初回 render (createApp 呼び出し中に同期実行) の時点で
//    まだ acc/dlg が use() されていないため、render 内の acc(...)/dlg(...) が
//    host 未接続の console.error + NOOP になる。
const app = createApp('#app', {}, (s) => [acc({ ... }), dlg({ ... })]);
const acc = app.use(createAccordion());
const dlg = app.use(createDialog());
```

正しくは、`use()` を **`setup` オプション**の中で行う。`setup(app)` は `render` の初回実行より
前に呼ばれるため、この時点で `use()` した変数は初回 render から使える:

```js
// ✅ setup 内で use() し、外側の let 変数で受ける (render のクロージャから触れるように)。
//    setup は最初の render より前に走るため、acc/dlg は初回 render の時点で既に use()
//    済み — v1 の「まだ未設定かもしれないので毎回ガードする」ような分岐は要らない
//    (SPEC.md §5 `options.setup` FACT)。
let acc, dlg;
const app = createApp(
  '#app',
  {},
  (s) => [acc({ ... }), dlg({ ... })],
  { setup: (a) => { acc = a.use(createAccordion()); dlg = a.use(createDialog()); } },
);
```

v1 では `s.acc = create_ui_accordion()` のように **state のどのキーに部品を置くか**を意識するだけ
で済んでいたが (`__notify` が暗黙注入される)、v2 では**「setup 内で `use()` してどの変数で受けるか」**
を意識する必要がある。1 対 1 で並べると:

| v1 | v2 |
|---|---|
| `s.acc = create_ui_accordion({ default_open: { a: true } })` | `setup: (a) => { acc = a.use(createAccordion({ defaultOpen: { a: true } })); }` |
| `s.dlg = create_ui_dialog()` | `setup: (a) => { dlg = a.use(createDialog()); }` |

（render 内で使う呼び出し自体は `s.acc({ items, ctx })` → `acc({ items, children })` のような
ノード変換のみで、部品オブジェクトそのものの呼び出し方は変わらない。)

### 二段階配線のもう 1 つの解: `app.render` の後付け (第 5〜7 号・RaccoonMemo/Rancha 同型の報告より)

上の「`setup` オプション」節は「`use()` を先に済ませる」解だが、v1 の「まず handle を作り、
panel を配線してから render を後付けする」という順序そのものを再現したいケースもある
(例: panel オブジェクトの構築自体が複雑で、render 関数の外に出しておきたい)。v2 では
これも canon の書き方として許可されている ([SPEC.md §5](SPEC.md) の `App<S>.render` FACT
に一言だけ書かれている契約): **`createApp` の第 3 引数に `() => null` (何も描画しない
render) を渡してインスタンスを作ってから、`app.render` に本物の render 関数を代入する**。
代入は同期的にすぐ再描画をトリガーする — 「初回描画をスキップする」ような lenient モードは
存在しない (`() => null` も「今はまだ何も描画しない、ただの render 関数」として扱われる)。

```js
// v1: handle 生成 → panel 配線 → render 後付け
// const app = create_RicDOM('#app', { params: {...} });
// const panel = create_ui_tweak_panel();
// app.render = (s) => panel({ title: '設定', data: s.params });

// v2: 同じ順序をそのまま再現できる (setup オプションを使わない代替パターン)
const app = createApp('#app', { params: { size: 10 } }, () => null); // 初回は空描画
const panel = app.use(createTweakPanel()); // handle が要る組み立てをここで行う
app.render = (s) => panel({ title: '設定', data: s.params }); // 循環参照をここでほどく
```

`use()` を先に済ませられる (循環参照が生じない) なら「`setup` オプション」節のパターンの方が
コード量が少ないので、そちらを既定に推奨する。この節のパターンは「v1 の順序をそのまま踏襲
したい」「render の組み立てが `createApp` 呼び出し時点でまだ用意できない」ような場合の
代替として使う (canon はこの 2 つのみ)。

### `createApp` を呼ぶ位置: render が参照する `const` より後に書くと TDZ で落ちる (第 8 号・LCP)

`createApp` は**呼び出しそのものの最中に**同期で初回 render を実行する (上の 2 節で繰り返し
出てきた FACT)。ここまでは「`use()` した部品を render が参照できるタイミング」の話だったが、
同じ FACT がもう 1 つ別の踏み方をする: render 関数が閉じ込めている**普通の `const`** が、
`createApp(...)` の呼び出し行より**後ろ**で宣言されていると、初回 render の同期実行時点では
まだその `const` の初期化が (JS の実行順として) 済んでいない — TDZ (temporal dead zone) の
`ReferenceError` になる。`console.error` + NOOP で済む `use()` 忘れ (このページの最初の節) と
違い、こちらは例外で即死する:

```js
// ❌ ReferenceError: Cannot access 'CONFIG' before initialization.
// createApp の同期初回 render が render 関数を即座に呼ぶが、その時点で
// まだ CONFIG の const 宣言 (次の行) は実行されていない。
const app = createApp('#app', {}, () => uiText({ children: [CONFIG.title] }));
const CONFIG = { title: '設定' };
```

対応は簡単で、`CONFIG` の宣言を `createApp(...)` より前に移すか、上の「`app.render` の後付け」
節と同じパターン (`() => null` で作ってから本物の render を後付け) を使う — 後付けされた
render 関数は代入されるまで一度も呼ばれないので、それまでに `CONFIG` が用意されていれば
TDZ を踏まない。v1 で `handle.render = render` を「依存物を全部揃えてから最後に」代入する
書き方をしていたコードがこの罠を踏まなかったのも、同じ理由 (本物の render 関数は
代入されるまで呼ばれない) による。

### E2E テストの落とし穴: dialog の既定初期フォーカス + 編集中ガード (第 8 号・LCP)

alpha.9 で dialog の既定初期フォーカスが「本文 → フッター → ✕ → root」に変わった結果
(SPEC.md §10.3.1c)、本文の先頭が `textarea`/`input`/`select` の dialog は、開いた直後から
その要素にフォーカスが乗り、コアの編集中ガード (§2.4、SPEC.md の同 FACT) が即座に効く状態
になる。ここで「本文を state から書き戻すボタン」を E2E で検証しようとすると、JS の
`el.click()` は (実際のマウス操作と違い) フォーカスを移動させないため、本文の要素は
クリック後もフォーカスされたままになり、ガードが素通りしてボタンの書き戻しが無反映に
見える — 実際のマウス操作 (mousedown) ならボタンへフォーカスが移って本文側のガードが
外れるので、この問題は起きない。テストが実操作と食い違うのが原因なので、部品側やコアの
修正対象ではない。対処は `btn.focus()` してから `btn.click()` する (実際のクリックに
近い状態にしてから撃つ)。

### page 行の補足: `applyTheme` が塗るのは bg/fg/font-size のみ

`applyTheme` した要素に塗られるのは `background` / `color` / `font-size` の 3 つだけ。v1 の
`.ric-page` が同時に持っていた `padding: var(--ric-gap-md)` / `overflow: hidden` /
`box-sizing: border-box` は**塗らない** — `applyTheme` を呼ぶ要素は v2 では必ずしも「ページ全体」
とは限らない (テーマ付き island を任意の要素に当てられる設計、§4) ため、page 特有だったレイアウト
プロパティまでは引き継いでいない。旧 `.ric-page` と同じ見た目が必要なら、自分の CSS で補う:

```css
#root .page {
  min-height: 100%;
  box-sizing: border-box;
  padding: var(--ric-gap-md);
  font-size: var(--ric-font-size);
  color: var(--ric-color-fg);
  overflow: hidden;
}
```

(`#root .page` はセレクタ例。`applyTheme(el)` を呼んだ要素自身に相当するセレクタに置き換える。)

### LZ 自己展開ツールなど「関数スコープで eval する」ローダとの組み合わせ (第 9 号・Potopeta、alpha.10 で解決)

Potopeta (RicUI デザイナ) は v1 の LZ 自己展開ツール (`scripts/lz.js`) を流用し、`ricdom`/
`ricdom/ui` の IIFE を圧縮したうえで自己完結 HTML バンドルに埋め込んでいた。この手のツールは
復元コードを `(()=>{ eval(s) })()` という**関数スコープの中で eval する**形をとることが多い。
esbuild が出す IIFE のトップレベルは `var ricdom=(()=>{...})();` という bare `var` で、通常の
`<script>` 実行 (グローバルスコープでの評価) では問題なく `window.ricdom` になるが、関数スコープの
中で eval すると `var` はその関数のローカル変数になるだけで `window`/`globalThis` には現れない。
v1 の LZ 自己展開版 (`RicDOM.lz.min.js` 等) は元からこの対策 (明示的な global 代入) を持っていた
ため、この非対称に誰も気づいていなかった。**alpha.10 で解決**: `dist/ricdom.iife.min.js` /
`dist/ricdom-ui.iife.min.js` の末尾に `globalThis.ricdom=ricdom;` / `globalThis.ricdomUI=ricdomUI;`
を明示的に追加した (tsup の `footer` オプション)。同じ関数スコープ内であれば `var` のローカル
変数を参照できるため、eval のされ方に関わらず必ず `globalThis` に張られる。

### 単一ファイル配布 (CSS インライン埋め込み) の CSS 読込検知 (第 9 号・Potopeta、alpha.10 で解決)

`ricdomUI` の CSS 読込検知 (`warnIfStylesMissing`、未読み込みなら `console.warn` する仕組み) は
alpha.9 まで `injectStyles()` 自身のマーカーと `<link href="...ricdom-ui.css">` の 2 経路しか
見ておらず、`ricdom-ui.css` の生 CSS を `<style>` に直接埋め込む単一ファイル配布 (Potopeta の
自己完結 HTML バンドル) ではどちらにも一致しないため誤って「未読み込み」と警告していた
(false positive)。alpha.10 で `document.styleSheets` を走査し `.ric-button` セレクタを持つ
規則が実在するかを見る方式に変更、この構成でも警告が出なくなった。

### 機械変換の節: `s/\bctx:/children:/` が取りこぼす 2 形

`ctx` → `children` の一括置換は、素朴な正規表現 `s/\bctx:/children:/` だとオブジェクトリテラルの
`ctx: [...]` は捕まえるが、次の 2 形を取りこぼす。**壊れ方が静かなのが厄介**: 例外は出ず、その節
の子要素が黙って消える (VDOM 上は `children` が無いノードとして通り、レンダリング結果は空になる)。

1. **ES2015 短縮記法**: `uiCol({ style, ctx })` — これは `{ style: style, ctx: ctx }` の意味であり、
   `ctx:` という文字列自体が存在しないため正規表現に引っかからない。
2. **後付け代入**: `node.ctx = [...]` — オブジェクトリテラル外での代入のため、同上。

また、変換をかける前に**「`ctx` というキーを使うが ricdom の木ではない vnode 層」が同じアプリ内に
併存していないか**を確認する。canvas 描画やゲームループ用の独自 vnode/シーングラフが、たまたま
`ctx` という名前のプロパティ (例: canvas 2D の `CanvasRenderingContext2D` を指す変数名としての
`ctx`) を持つケースがあり得る。この場合、**リポジトリ全体に変換をかけてはいけない** — 変換対象の
ファイルを (v1 の `ricdom` API を呼んでいるファイルだけに) 明示的に列挙してから機械変換をかける。

上の「`ctx` を使うが ricdom ではない vnode 層」とは別に、もう 1 種類「機械変換をかけてはいけない
`ctx`」がある — **upstream から vendoring した vdom 生成器**である (線茶が同期している Rancha の
dxf-to-svg のように、別プロジェクトが v1 形 `{ tag, ctx }` を返す関数を書き出し、それをそのまま
取り込んで使っているケース)。こちらは「無関係な vnode 層」ではなく「本物の v1 ricdom ツリーを
生成するコードだが、自分のリポジトリの外 (upstream) が管理している」という点が違う — 機械変換を
かけて `children` に書き換えても、次に upstream から同期し直した瞬間にまた `ctx` へ巻き戻る
(変換が定着せず、同期のたびに再発する)。対応は「リポジトリ全体変換の対象外にし、vendoring した
ファイルは v1 形 (`ctx`) のまま残す」+「その出力が自分の木に入る境界 1 箇所 (アダプタ) だけで
`ctx` → `children` を再帰変換する」。upstream 自体が v2 に移行した時点で、この境界変換は不要に
なるので外す。

なお置換スクリプトは「何件置換したか」を必ず出力して確認する — heredoc 経由でシェルに渡した
正規表現から `\b` (単語境界) のエスケープが剥がれ、置換が無音で 0 件のまま素通りしていた実例が
ある (件数を出力していれば「0 件」でその場で気づけた)。

### `tag` 必須化 (RaccoonMemo からの報告)

もう 1 つ機械変換で見落としやすいのが `tag` の省略。v1 は `tag` を省略すると暗黙に `div` として
扱っていたが、v2 では **`tag` が型上必須** (実行時に欠落していれば `console.error` + 不可視) なので、
`{ children: [...] }` だけの (＝ `tag` を書いていない) 要素は v2 では動かない。`ctx`→`children` の
機械変換だけをかけて「`tag` が無いオブジェクトが残っていないか」を見ないまま済ませると、
TypeScript を使っていれば型エラーで気づけるが、JS のまま (`allowJs`) 移行している場合は
実行時まで気づけない。変換対象ファイルに対して `tag` を持たないオブジェクトリテラルを別途 grep
し、`tag: 'div'` を補う一括変換をもう 1 パス走らせておく。

### 部品に渡す props 名も snake_case → camelCase の対象 (RaccoonMemo からの報告、alpha.15)

識別子 (`ui_md_pre` → `uiMdPre` 等) の変換リストに載っていても、**その部品に渡す props 名**が
snake_case のまま残りやすい: `transform_text` / `transform_image_src` (`uiMdPre`)、
`on_resize_end` / `on_collapse_change` (`createSplitter`)、`default_open` (`createAccordion`)、
`stroke_width` (`uiIcon`) 等。部品は未知の prop を rest スプレッドで要素にそのまま透過する契約
(SPEC §10.5) なので、綴りが違っても `console.error` も型エラー (JS のまま移行している場合) も出ず、
**フックが黙って無効になる** (RaccoonMemo では画像相対リンクの解決 e2e が 1 本落ちて発覚)。
唯一の実行時シグナルは alpha.15〜の dev ビルドの警告 `attribute "transform_image_src" received a
function` (関数値が属性に落ちたときだけ。`default_open: true` のような真偽値・数値は検知できない)。
変換スクリプトの識別子リストに、各部品の props 名 (`docs/API_AUDIT.ja.md` の一覧、または
`dist/ui.d.ts` の `*Props` インターフェース) を含めること。

### CSS 1 枚はアプリ CSS より前に読む (RaccoonMemo からの報告、alpha.15)

v1 の `css_for('ric-splitter', 'ric-md-pre', …)` は注入する部品系統を選べたので、input / textarea /
button / select の部品 CSS を要求していないアプリではアプリ CSS と衝突する相手がそもそも無かった。
v2 の `ricdom-ui.css` 1 枚は**常に**それらの基底 (`.ric-textarea { font-family: inherit }`、
`.ric-select { width: 100% }`、各コントロールの `font-size` / 色) を含み、詳細度はクラス 1 つ
(0,1,0) で `@layer` も無い。`<link>` をアプリ CSS の**後**に置くと、同じ詳細度のアプリ規則
(`.editor-body-textarea { font-family: monospace }` 等) が後勝ちで潰される (RaccoonMemo では
等幅フォント・削除ボタンの赤・小ボタンの font-size など 15 箇所が v1 と違う見た目になっていた。
スクリーンショット比較で発覚)。**`ricdom-ui.css` の `<link>` は `styles.css` より前** (基底 → アプリ
上書き) に。`injectStyles()` は呼んだ時点で `<head>` 末尾に `<style>` を足すので、こちらを使う
場合はアプリ CSS の読み込みより前に呼ぶ。v1 側で衝突していなかった基底 (`.ric-select` の
`width: 100%` 等) はアプリ側で明示的に上書きする。

### 進め方の推奨: まず v1 依存を 1 ファイル (アダプタ) に寄せる

第 3 号・第 4 号の移行はいずれも、最初にアプリ全体を書き換えるのではなく、**v1 の API 呼び出しを
1 つのアダプタファイルに集約してから**移行作業に入った。アプリ本体は「アダプタが export する
薄い関数」だけを呼ぶ形にしておき、機械変換 (`ctx`→`children` 等) をアダプタ 1 ファイルだけに絞る
ことで、上記の「`ctx` だが ricdom ではない vnode 層」のような誤爆を防げる。両パイロットとも、この
手順でアダプタ外への機械変換の適用をゼロに抑えられた実績がある。
