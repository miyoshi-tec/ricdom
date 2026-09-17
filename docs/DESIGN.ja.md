# ricdom 2 設計書 (内部記録・日本語)

> この文書はプロジェクト内部の設計判断の記録です (Phase ごとの確定事項を追記して育てる)。利用者向けの契約は [docs/SPEC.md](SPEC.md) (英語、FACT のみ)、導入は [docs/TUTORIAL.md](TUTORIAL.md) を参照してください。「統括」= 設計・検証を担当する AI (Claude)、判断の承認者 = 山崎 (三好製作所)。

## 経緯: ドラフト v0.2 (2026-09-02)

- 作成: 2026-09-02、統括 (Claude) ドラフト、山崎レビュー待ち
- 位置づけ: RicDOM/RicUI v1 (v0.4.3) を**プロトタイプ FIX**とし、思想と実戦知見を引き継いだ後継を新規構築する
- 決定済み: **TypeScript 実装 / 公開 API は camelCase / ライセンスは全体 MIT / 設計書先行**
- 未決: §11 (名称・リポジトリ・設計選択 5 点)
- v0.1 → v0.2: 競合調査 (付録 A/E) と v1 棚卸し (付録 B/C/D) を反映。本文 §2 / §3.1 / §3.2 / §3.6 / §6 / §9 を更新

---

## 0. 一言で

> オブジェクトで UI ツリーを書き、Proxy state を代入するだけで実 DOM が差分更新される、ビルド不要・型付き・アクセシブルな軽量 UI ライブラリ。Electron・社内ツール・計測/制御系 UI のために。

**差別化 (付録 A)**: 「手書き plain object の UI 木 × Proxy 再描画 × ビルド不要」を全部揃えた競合は 2026-09 時点で不在。VanJS は関数呼び出し、Mithril は `m()` の戻り値、Alpine/petite-vue は HTML 属性、Solid は JSX 必須。README 冒頭はこの 1 行と比較表で位置を示す。

## 1. なぜ作り直すか (v1 監査の要約)

v1 は 5 か月・46 リリース・社内 11 アプリの実戦で API が磨かれたが、以下は**継ぎ足しでは直せない**構造の問題 (詳細は付録 C):

| # | v1 の構造的弱点 | 症状 (実害) |
|---|---|---|
| 1 | `__notify` の暗黙注入 (state トップレベル配置で set trap が注入) | 置き場所を誤ると silent failure。**controlled dialog など親 state 駆動の部品は警告すら出ない**。ほぼ全 consumer が 1 回は踏んだ |
| 2 | portal が `create_ui_page` の render に結合 | page 無しで dialog が消えない・css_for 島で portal 不可・「意図しない別 page に出る」は検知不能 |
| 3 | per-instance の使用クラス収集による CSS 注入 | page を通らない mount が**無装飾のまま DOM テストは通る**。5 consumer が同じ穴 |
| 4 | 浅い Proxy (1〜2 段) で未追跡代入が無警告 | `s.a.b.c = 1` が描画されない。canon は正しいが検知が無い |
| 5 | 公式 API の穴 → consumer が DOM 直書き → 次 render で上書き | Trend Guard の popup 横伸び |
| 6 | a11y が設計目標外 | menu の ARIA/キーボードを意図的に不搭載、dialog に focus trap なし |
| 7 | テストが jsdom のみ | 直近の重大バグ 3 件は全てブラウザ固有 |
| 8 | 発見性・信頼シグナル | snake_case・`ctx`・CJS・日本語のみ・npm 未公開・型なし (★1) |

**引き継ぐ思想**: plain object → 実 DOM 差分 (VDOM なし)、Proxy 代入で自動再描画、IME/フォーカスを壊さない、**利用者はビルド不要**、canon は 1 つ、docs は FACT、speculative fix しない、consumer 駆動、diff 対象外の島、CSS 変数テーマの島ごと適用、アイコンは「データ + 変換器 + CLI」、throw しない (グルーコードを連鎖破壊しない)、「consumer の DOM 直書き = 公式 API の穴のシグナル」。

## 2. ゴール / 非ゴール

**ゴール**
- G1 `<script>` 1 本 (jsDelivr IIFE) または `import` 1 本 (ESM) で 10 秒で動く。**TypeScript は制作側の道具であり、利用者にビルドを強いない** (付録 C の B16 への回答: ビルド不要哲学は「利用側」の性質として再定義する)
- G2 型でオブジェクトツリーの補完・検査が効く (タグ名 → 属性型、アイコン名 → Union 型)
- G3 部品の置き場所・page の有無・CSS の到達を**間違えようがない**構造 (silent failure の構造的排除)
- G4 主要部品が WAI-ARIA APG 準拠のキーボード操作を最初から持つ
- G5 実ブラウザテストが CI で回る
- G6 英語が正のドキュメント、日本語は翻訳。競合比較表を README 冒頭に
- G7 v1 の 11 アプリが段階移行できる (純粋ノードは自動変換、部品/portal は移行ガイド)

**非ゴール**: 大規模 SPA のルーティング/状態管理化、SSR/hydration、v1 との字面互換。

## 3. コア設計

### 3.1 ノード表現
- `{ tag, class, style, children, ref, key, ...attrs }`。**`ctx` → `children`** (付録 E: React/Preact/Solid/Mithril の多数派、確定)
- 文字列/number はテキスト、`null`/`false`/`undefined` は不可視 (v1 継承)
- 型: `type Node = string | number | null | false | undefined | Element | Node[]`。`Element` はタグ名で属性型を導く discriminated union。`style` は object のみ (v1 の string/object/array 3 形態を 1 つに)
- **島 (diff 対象外)**: v1 は「`ctx` キーを省略した要素の子孫は触らない」。v2 では **明示フラグ `{ tag: 'div', island: true }`** を推奨 — TS では `children` の省略忘れが silent な島になり、v1 と逆向きの罠になるため。`children` を持たない通常要素は「空として管理」。**(§11 判断事項 e)**

### 3.2 差分パッチ
- 継承: position-based + key-based reconciliation (A5)、`FORCE_REAPPLY` (value/checked/selected/scroll、A3)、select の value 再適用 (A4)、SVG namespace 継承、`data-*-role` 安定セレクタ (A14)
- **一般化**: v1 が ui_tweak にだけ入れた「編集中ガード」(A7) を**コアの規則**にする — `document.activeElement` である input/textarea/select には `value` の FORCE_REAPPLY を行わない (ユーザーの編集バッファを潰さない)。blur 後の render で同期。v1 の実害 (小数点ドロップ) の根本解消
- style の全キー再適用 (VDOM が正) は維持。dev モードで管理下属性への直書きを検知 (§3.6)

### 3.3 リアクティビティ
- 案 A: **浅い Proxy (v1 と同じ) + 深い代入を dev で検知して警告** (2 段目以降を read-only Proxy で包み set を捕まえる)
- 案 B: 深い Proxy (全追跡)。直感的だが Proxy 化コストと巨大データの逃げ道 (`ignore`) が要る
- **統括推奨: A**。shallow copy 差し替え canon (A10) は性能と予測可能性で正しかった。欠けていたのは検知だけ **(§11 b)**
- `renderNow()` / `nextRender()` の対 (A2)、rAF + setTimeout バックストップ (A6)、2 rAF ルールの FACT (A1) は継承

### 3.4 部品契約 — v1 最大の負債 (B1) の解消
- v1: `s.foo = createX()` で set trap が `__notify` を注入 (置き場所依存、型で検出不能、親 state 駆動部品は無警告)
- v2: **状態を持つ部品は `app.use(createDialog())` で明示登録** (notify と portal ホストを受け取る)。**状態を持たない部品は純粋関数** (v1 の `ui_inline_menu` 方式を button/input/icon… 全部に)。登録忘れは render 中に未登録インスタンスが呼ばれた瞬間に検知できる (暗黙注入が無い = 検知の穴が構造的に無い)
- `use()` は dispose を返し、v1 の `_popup_registry` 無制限成長 (B13) も解消 (登録解除 or WeakRef)
- controlled / uncontrolled 二重モード (A20)、`onClose(reason)` (A18)、rest スプレッド契約 + 内部 input 隔離 (A15) は継承。boolean/number の内部変換漏れ (B15) は型で吸収 **(§11 c)**

### 3.5 portal 層 (B2/B3)
- **mount 単位の portal ホスト**: `createApp(target)` がマウント直下に portal 要素を 1 つ持ち、`use()` 登録済みの popup/dialog/toast/tooltip はそこへ描画。page 部品への依存を廃止。テーマは §4 の CSS 変数継承で portal にも届く
- 複数 mount = 複数 portal (v1 の「最深 page 直下」不変条件 A13 を「自分の app の portal」に置き換え)。`portalTo(el)` で任意要素も指定可 (v1 の portal_to / page 非依存 dialog 要望 2 系統を吸収)
- v1 の SPEC と実装の乖離 (B3、スタック記述 vs 単純配列) は「型定義と実ブラウザテストを spec の単一ソース」にして再発防止

### 3.6 dev モードの安全網 + 「throw しない」の型付き再定義
- dev ビルド: 深い代入の警告 (§3.3) / `use()` 忘れ / 管理下 DOM への直書き検知 (MutationObserver、任意) / a11y 属性欠落の警告
- **NOOP の再定義 (B14)**: v1 の `NOOP_PROXY` は TS では `any` になり型が嘘をつく。v2 は**インターフェースごとの型付き NOOP オブジェクト** (例: 無効な target で `createApp` は console.error し、`App` 型を満たす no-op 実装を返す)。「グルーコードを連鎖破壊しない」哲学 (A9) を型安全のまま継承

## 4. スタイル配布 — 無装飾 silent failure (B4) の構造的排除
- UI 部品の CSS は **1 枚のスタイルシート**として配布 (`<link>` or JS から 1 回注入)。per-instance 収集を廃止 = 「知らないと踏む」問題自体が消える
- テーマは **CSS 変数を要素に当てる** (`applyTheme(el, 'dark')` = make_css_vars 後継、`color-scheme` 込み、A12 の 3 点セットは 1 関数に)。`:root` 強制なし、島ごと共存維持
- サイズ想定: 全規則常時ロードで 60〜70KB (gzip ~12KB)。「使う分だけ」は gzip に任せる **(§11 d)**
- `:active` は translate (A16) 等の CSS 契約は継承

## 5. アクセシビリティ (B7、初期設計に含める)
付録 E の APG 要点をそのまま契約に: dialog (role/aria-modal/focus trap/Esc 復帰/inert)、menu (haspopup/expanded/矢印/Home・End/Esc)、tabs (tablist/roving tabindex)、toast (role=status / alert、フォーカスを奪わない)、tooltip (describedby)。

## 6. 配布・ツールチェーン (B9/B12)
- TypeScript → **tsup** で ESM + CJS + IIFE (グローバル) + 単一 `.d.ts`。`exports` 条件分岐 (付録 E)
- npm 公開 + **jsDelivr** で `<script src>` 1 行、esm.sh で `import` 1 行。README 冒頭に両方
- LZ 自己展開版は v1 の独立 product として継続、v2 本体には含めない (CSP 誤解の回避)
- アイコン: v1 の descriptor 形式 `{ v?, s?, p }` (A17、型化しやすい) と CLI を継承。アイコン名を Union 型にして「手書き禁止」をコンパイル時に強制

## 7. テスト戦略 (B8)
- 単体: Vitest (jsdom) + 型テスト (expect-type)
- 実ブラウザ: **Vitest browser mode (Playwright provider)** を CI で。v1 でブラウザ固有だった 3 件 (rAF 停止環境 / select value / 編集中の number 入力) を**最初の回帰テスト**として移植
- consumer の adversarial lab 文化を CONTRIBUTING に明記

## 8. ドキュメント (B11)
- 英語 README (30 秒で価値 + 比較表 + CDN 1 行 + 3 行の例)、日本語は翻訳
- SPEC は FACT のみ、TUTORIAL は 10 章以内、CHANGELOG (Keep a Changelog)、SemVer、tag は 1.0.0 から途切れさせない

## 9. 移行 (v1 の 11 アプリ、付録 D)
- **自動変換できる**: 純粋ノード (`ctx`→`children`、snake_case → camelCase の対応表、style 3 形態 → object)
- **手動書き換え**: 状態を持つ部品 (`s.x = create_ui_x()` → `app.use(createX())`)、portal 系 (API 自体が変わる)
- **説明が要る**: ビルド不要を採用理由にしている consumer (Potopeta の single-file、展示ビューアの vendoring) へ「利用側は IIFE 1 本で従来どおり」を明示
- パイロット: 最小の consumer 1 つで移行し摩擦を測る (候補: 歯車DXF or Trend Guard)

## 10. フェーズ
| Phase | 内容 | 完了条件 |
|---|---|---|
| 0 | 本設計書の確定 + 名称/リポジトリ | 山崎承認 |
| 1 | コア (木→DOM、差分、Proxy、スケジューラ、島、編集中ガード、型) | 単体 + ブラウザで v1 回帰 3 件 pass、`<script>` 1 本デモ |
| 2 | 部品契約 (`use`) + portal ホスト + テーマ + CSS 1 枚配布 | dialog/popup/toast が page 無しで動く、a11y キーボード操作 |
| 3 | UI 部品の移植 (v1 RicUI から、a11y を足しながら) | v1 部品の 8 割 |
| 4 | docs (EN/JA)・npm・CDN・CI・CHANGELOG | 外部の人が README だけで動かせる |
| 5 | パイロット移行 1 アプリ → 自動変換ツール → 他 consumer | 1 アプリ本番 |

## 11. 判断事項

**決定済み (2026-09-02、山崎承認)**
- b. リアクティビティ: **浅い Proxy + dev で深い代入を警告** (§3.3 案 A)
- c. 部品契約: **`app.use(createX())` 明示登録 + 状態なし部品は純粋関数** (§3.4)
- d. CSS 配布: **1 枚のスタイルシート** (§4)
- e. 島の表現: **明示フラグ `island: true`** (§3.1)

- a. 名称・リポジトリ: **ブランド継続 `ricdom` (npm 無スコープ、2026-09-02 時点で未登録を確認)、新規リポジトリ `miyoshi-tec/ricdom`**。v1 は `miyoshi-tec/RicDOM` として凍結 (保守モード)。バージョンは **2.0.0** から (v1 = 0.x/0.4.x なので 1.0 を飛ばして「後継」を明示)

**Phase 0 完了 (2026-09-02)。以降は Phase 1 (コア) へ。**

## 12. Phase 1 実装での確定事項 (2026-09-02、実装からのフィードバック)

- 型名は **`RicNode` / `RicElementNode`** (設計書の `Node` / `Element` は DOM のグローバル型と衝突するため改名)
- **`createApp(target, state, render)` の 3 引数**に変更。v1 の「state の中に render を置く」形は TS で `S` の推論が自己参照になり render 内の `s` が `any` に落ちるため。render を分離すると `S` が state から素直に推論され、render 内も完全に型付く。v1 からの移行は機械的 (`render` プロパティを第 3 引数へ)
- target が未解決のとき: v1 の 20 秒ポーリングは持たず、**`DOMContentLoaded` を 1 回だけ待って再解決** (それでも無ければ console.error + 型付き NOOP)。`<head>` 内 script の典型ケースだけを救う、予測可能な挙動
- 複数 `createApp` 間の state 共有 (v1 の WeakMap 共有) は**持たない**。必要なら state オブジェクトを外で作って各 app に渡す (明示的)
- HTML/SVG で同名タグ (`a` / `title` / `script` / `style`) は HTML 側の属性型を採用 (SVG 側は `svg` 配下でも HTML 型で受ける。実害が出たら再検討)
- `tag` は型上**必須** (`{}` は型エラー)。実行時に tag 欠落なら console.error + 不可視扱い (v1 踏襲)
- gzip 目標: IIFE **4.6KB** (Phase 1 実測、≤5KB 達成)

## 13. Phase 2 実装での確定事項 (2026-09-02)

- **部品契約**: `UsePart` = `attach(host)` / `dispose()` / `renderPortal()`。`Host = { notify(), portal, app }` は `app.use()` 経由でのみ渡される。`Host.app` の型は `App<any>` (ジェネリック化すると構造的部分型の分散で `attach` が合わなくなるため。部品側が state の型に依存しない設計なので実害なし)
- **portal**: `createApp(target, state, render, { portalTo? })`。portal 要素は差分の位置ズレを防ぐため **安定 key 付きの sentinel** として管理 (Phase 2 で実際に踏んだバグ: render 結果の可視/不可視切替で index がずれ portal が再生成されていた)
- **dialog の `inert`**: portal の兄弟要素に対して掛ける (単一 app の一般ケース)。ページ内の無関係な他 app までは inert にしない。document 全体を inert にするオプションは要望が出たら (再検討条件)
- **`createPopup` は menu 専用** (ARIA の `role="menu"` 前提)。v1 の label/icon/chevron ドロップダウンモードは **Phase 3 で `createDropdown` (Popover 系) として別部品に** — canon 1 つを守るため 1 部品に 2 つの意味論を持たせない
- **ページ全体のスクロールバー既定スタイルは Phase 3 で**: v2 に page 部品が無いため、`applyTheme(el)` が付与するマーカー属性 (`data-ricdom-theme`) 配下にスクロールバー規則を当てる方式で移植する (トークンは Phase 2 で用意済み)
- **部品ごとのテーマ上書き props (v1 の `{theme, density, fontSize}`) は持たない**。portal は target 配下なので `applyTheme` の CSS 変数継承で足りる。再検討条件: 「同一 app 内で portal だけ別テーマ」の具体要望
- **`ricdom/ui` はコアへの実行時依存ゼロ** (型のみ)。部品は `host` 経由でしか app に触らないため、IIFE 2 本は論理的な組でありバンドラ的な依存ではない。意図どおりとして確定
- **アニメ完了待ちは `animationend` + 700ms setTimeout バックストップ** (CSS 未ロード / `--ric-duration` 未設定でも状態遷移が固まらない。コアの rAF+バックストップと同じ思想)。CSS 変数は `var(--x, fallback)` で既定値を持つ
- focus trap の可視要素フィルタ (`offsetParent` 判定) は Phase 2 では省略 → **Phase 3 で実ブラウザテスト付きで追加**
- **コア gzip 5,037B (5KiB 天井)。Phase 3 以降、コアには機能を足さない** (部品側・ui 側で解決する)

## 14. Phase 3a 実装での確定事項 (2026-09-02)

- **`data-ricdom-role` は全部品に付与する** (Phase 2 の `uiButton` / `uiInput` は Phase 3b で追補)。値は `UI_ROLE` 列挙で一元管理
- bind 系は `bindInput` / `bindTextarea` / `bindCheckbox` / `bindSelect` / `bindRange` の 5 つ。`bindColor` / `bindRadiobutton` は要望が出たら (再検討条件)
- **v1 の潜在バグを移植時に発見**: `bind_textarea` だけ `...options` を value/oninput の後に展開しており、options が計算済み値を上書きできた。v2 は 5 つとも「options → 計算済み」の順で統一 (rest スプレッド契約 A15 と同じ)。v1 側は保守モードのため記録のみ
- `uiIcon` の「descriptor 手書き禁止」は **Phase 3c (アイコン同梱データ + `ricdom-icon` CLI 移植) で完成**。それまでテスト/デモは v1 の検証済み descriptor を再利用
- CSS: cyber/aqua のみ定義する `--ric-popup-blur` / `--ric-panel-shadow` は `var(--x, fallback)` で他テーマにも既定値を持たせる (宣言全体が invalid になるのを防ぐ)
## 22. パイロット第 2 号の追報 3 (#13 重複 key) からの確定事項 (2026-09-04、2.0.0-alpha.4)

- **バグ**: 兄弟内で `key` が重複すると render ごとに子要素が増殖・リークする (5 → 7 → 9 → 11 → 13)。`patchChildrenByKey` の prev 側 Map 上書きで DOM が削除パスから漏れ、next 側は 2 個目以降を毎回新規生成していた。**v1 の `patch_children_by_key` から継承したバグ** (v1 でも同じ入力で同じ増殖を再現。v1 は v0.4.5 として develop に修正、警告なし)
- **修正の範囲は「重複」に限定する**: prev 側は各 key の最初の 1 個だけ keyed map へ、2 個目以降は unkeyed キューへ。next 側は「同じ pass で既出の key (= 重複の 2 個目以降)」のときだけ位置ベースの unkeyed 経路へフォールスルーし、**新規 key (prev に無く同 pass でも初出) は従来どおり新規生成**。広く「map miss なら unkeyed 経路」に倒すと、keyed/unkeyed 混在リストで新規 keyed 要素が同 tag の unkeyed prev DOM (input の入力状態など) を奪う挙動変更になるため (統括レビューで差し戻し)。実装は consumed を delete せず `null` でマークして `get()` の undefined/null で「初出/既出」を区別する sentinel 方式 (Set 方式より gzip で 29B 小さい)
- **dev 警告**: 重複を検知したら `isDevMode()` (reactivity.ts から export、定義は 1 箇所) で `console.warn` を親要素 1 render につき 1 回。検知は next 側のみで十分 (prev 側の重複は前回 render の next 側で検知済み)。初回 mount は `buildDomNode` 経由で `patchChildrenByKey` を通らないため対象外
- **コア gzip 天井を 5,120B → 5,200B に再設定 (ユーザー決定)**: 修正のみで 5,126B (+6B)、警告込みで 5,215B。相殺 (属性適用分岐の `applyPlainAttr` 共通化、内部構造体のプロパティ名短縮) を尽くしても収まらず、選択肢 (修正のみ / 短い警告 / 長い警告 / 入れない) を実測付きで提示 → **修正 + 短い警告文言 (5,169B)、天井 5,200B** を採用。理由: 「silent failure を dev 警告で可視化する」は v2 の思想 (README の競合表にも掲げている) で、バグ修正に付随する警告まで削るのは本末転倒。README の「≤ 5KB (core) / ≤ 5,120B」は「≤ 5.1KB / ≤ 5,200B」に更新。**§13 の「コアに機能を足さない」は継続** — 今回はバグ修正 + その可視化であり、機能追加ではない。残り 31B
- 警告文言は gzip に効く (日本語長文 +95B → 短文 +49B → 英語短文 +27B)。既存の警告が日本語なので一貫性を優先して日本語短文。以後コアの文字列は最小に
- **SPEC FACT**: key は兄弟内で一意であること。重複は 2 個目以降が unkeyed 扱い (位置ベース、tag 一致なら再利用)、新規 key は新規生成、dev で console.warn
- 移行プロンプトの罠 11 に追加 (v1 全版と alpha.3 以前は増殖する)。**v1 consumer 全員に潜在する穴**なので、v0.4.5 のリリース時に告知する
- **追報 4 (alpha.4 取り込み) で第 2 号は完了**: 再現スクリプト 5→5→5→5→5、E2E 10/10、回避策ゼロ。初報 10 + 追報 5 = 15 件が同日中に公式 API で閉じた
- ~~観察 (対応なし)~~ → **§23 で実バグ (#14) と判明**。DPI 150% の実機で右端密着トリガーの dropdown body の `right` が `innerWidth` を 0.33px 超えた件、統括は「`clampLeft` が右端も収めるので最終位置では起き得ない、実測フェーズの rect を拾ったのでは」と判断したが誤り。consumer が再計測後 (200ms / 600ms) の inline `left` / `offsetWidth` / 本来幅を取り直し、**測った幅そのものが位置依存で過小**になっていることを示した (§23)。教訓: 「式は正しい」で止めず、式に入る実測値の取り方まで疑う

## 37. 全 consumer へのテーマ 7 種対応依頼と、依頼文の執筆で見つかった穴 → `--ric-theme` マーカー (2026-09-17、2.0.0-alpha.19)

- **ユーザー指示**: v2 に移行済みの全アプリに「テーマセレクタを入れて 7 種類に対応、Electron はウィンドウも透過」を依頼する。依頼文 `_announce_v2_glass_theme_request.md` (v1 リポジトリ、gitignored): 取り込み手順 / そのまま貼れる `uiSelect` 版セレクタ (`localStorage` 保存、`applyTheme` は `onchange` の中で明示的に呼ぶ = render とは別軸の副作用) / Electron の main・renderer 手順 / **アプリ側 CSS を透けさせる指針** (コンテナの不透明背景を外すか `var(--ric-color-control)`、`backdrop-filter` は浮遊面だけ) / 報告フォーマット (スクリーンショットは業務データなし、README・告知に使う)
- **依頼文のサンプルを実 Chromium で検証して見つけた穴 2 件** (alpha.18 の状態): ①`data-ricdom-theme` 属性は常に空文字 (CSS が存在だけを見る設計) で、consumer が `[data-ricdom-theme="glass"]` で分岐できない。②Electron 手順の `createTheme('glass', {'--ric-color-bg':'transparent'})` は ThemeVars オブジェクトになるため、`prefers-reduced-transparency` の不透明フォールバックの対象外だった (文字列 `'glass'` のときだけ判定)。依頼文に「`[data-ricdom-theme="glass"]` で切替」「透明ウィンドウでも透明効果オフが効く」と書くには両方が要る
- **修正 (alpha.19)**: 全 7 パレットに **`--ric-theme` マーカー変数** (値 = テーマ名、CSS からは一切参照しないデータ専用。`createTheme` は base を spread するので自動的に引き継ぐ)。`applyTheme` は解決した vars の `--ric-theme` から属性値と reduced-transparency 判定を引く (merge 順: base → consumer overrides → reduced overrides、reduced セットは `--ric-color-bg` を含まないので `transparent` が生き残る)。自前パレットで `--ric-theme` が無ければ従来どおり空文字。`exportTheme` で往復。**教訓: docs の手順 (createTheme で上書き) と実装の判定 (文字列比較) が別々に書かれると、手順どおりの consumer だけが機能を失う。「手順に書いた形」でテストを書く**
- red-first 12 件 (マーカー ×7、属性値 ×4、createTheme 経由の reduced、往復)。unit 707 / browser 17 (glass + theme)。ui IIFE 26,164 → 26,204B (+40B)、コア不変

## 36. glass テーマ (曇りガラス / Windows 11 Acrylic / iOS 半透明) (2026-09-17、2.0.0-alpha.18、ユーザー指示)

- **発端**: ユーザーの問い「iOS や Windows 11 の曇りガラスのように背景が透けるテーマは作れないか」→ 統括の見立て: **`aqua` が既にそれの半分** (コントロール `rgba(255,255,255,0.5)`、popup `--ric-popup-blur: blur(10px)`、panel も同じ blur トークン)。ただし blur が効くのは popup と panel だけで、dialog / toast / tooltip / dropdown / tweak は「半透明だがボケない」。**「何が透けるか」は 2 段階**: ①ricdom のページ背景 (CSS だけで完結) ②OS のデスクトップ・後ろのウィンドウ (Electron の `BrowserWindow` 側 `backgroundMaterial: 'mica' | 'acrylic'` / macOS `vibrancy` + body と `--ric-color-bg` を `transparent`。ブラウザ配布では原理的に不可)。**ユーザー決定: 作る。「実用になるかは置いておいて、Electron で背景が透けるアプリは映えるし話題になる」** = 採用の第一因 (発見性・話題性、adoption 監査) に効く投資として
- **設計**: `glass` (明るい霜、`color-scheme: light`) と `glass-dark` (暗い霜) の 2 テーマ (light/dark と同じ対). 既定の `--ric-color-bg` は壁紙風グラデーション (素のブラウザでも成立させる)、Electron では `createTheme('glass', { '--ric-color-bg': 'transparent' })` で上書き。**新トークン `--ric-surface-blur`** (filter 式全体を持つ、既存 5 テーマは `none`) を **浮遊面すべて** (dialog / popup / dropdown / toast / tooltip / panel / tweak / inline menu) に `backdrop-filter` として通す。既存の `--ric-popup-blur` は `var(--ric-popup-blur, var(--ric-surface-blur, none))` の fallback 連鎖で温存。**入力欄・ボタン・表には blur を掛けない** (半透明のみ。`backdrop-filter` の GPU 負荷は要素数に比例 — Trend Guard の 800 行テーブルで各セルにガラスは成立しない)
- **`prefers-reduced-transparency`**: テーマ変数は `applyTheme` が inline style で当てるので、スタイルシートの `@media` では上書きできない → `applyTheme` が呼び出し時点で `matchMedia` を見て glass 系だけ不透明の override を merge する (一発判定、追従したい consumer は `change` で再 apply。TUTORIAL に snippet)。Windows 11 自身が「透明効果を切る」設定を持つので、揃えておくのが筋
- **正直に書くこと**: 文字コントラストは背景次第で保証できない (最低不透明度 + ガラス縁の inset ハイライトで補う)。透明ウィンドウは見栄えのためのもので、アプリが自分の背景の面倒を見る
- **実装・検証結果 (2026-09-17)**: `tsc --noEmit` 0 エラー、unit 694/694 pass (`tests/ui/theme.test.ts` を 40→58 テストに拡張: 7 テーマの token 網羅・`--ric-surface-blur`/`--ric-popup-blur` 一致・5 テーマは `none` のまま・`prefers-reduced-transparency` mock 5 件・`createTheme('glass', {'--ric-color-bg':'transparent'})`・exportTheme 往復)、実ブラウザ新規 `tests/browser/uiGlassTheme.test.ts` 4/4 pass (dialog/popup/toast/tooltip/dropdown/panel の computed `backdropFilter` が glass で `blur(` を含み light で `none`、`.ric-input` は `backdrop-filter: none` かつ `rgba()` 背景、`--ric-color-bg: transparent` で computed background-color が `rgba(0, 0, 0, 0)`)、既存 browser 33 ファイル 155/155 pass (回帰なし)、`examples/glass.html` 追加 (壁紙は CSS のみ、外部アセット無し) を含め `npm run test:examples` 8 ページ全 OK。サイズ実測 (gzip): core `ricdom.iife.min.js` 4,877B (不変)、`ricdom-md-editor.iife.min.js` 4,566B (不変)、`ricdom-ui.iife.min.js` 25,637→26,164B (+527B、2 テーマ分の palette + backdrop-filter 8 箇所 + reduced-transparency ロジック)、`ricdom-ui.css` 6,917 → 6,966B (+49B)。README.md/README.ja.md のバイト上限 (5,300 / 6,300) は文言を削って収めた

## 35. 第 5 号 (Raccoon Memo) の要望「軽い色付き Markdown 編集部品」→ `ricdom/md-editor` (2026-09-17、2.0.0-alpha.16)

- **要望**: `uiTextarea` と同じ props / DOM 挙動 (value / oninput / selectionStart / setSelectionRange / onpaste / ondrop / onscroll / scrollTop / onkeydown / ref / class / placeholder / spellcheck) を保ったまま、Markdown ソース自体に VS Code 風の色が付く部品。自前実装を IME (変換中の見え方) の理由で断念し、**「IME を面倒見る層はアプリごとではなく部品層に 1 つ」** = ricdom に依頼 (山崎の 5 アプリが v2 に乗るため 1 回作れば全部に効く)。断る場合の代案として TUTORIAL 1 節 or `uiTextarea` に鏡フックの提示あり
- **判断 (ユーザー決定、2026-09-17)**: 作る。置き場所は **別サブパス `ricdom/md-editor`** (ESM / CJS / IIFE `ricdomMdEditor` + dev IIFE)。ui バンドルに JS を足さない (「コアに機能を足さない」と同じ発想、使うアプリだけが読む)。CSS は「1 枚」の canon を守って `ricdom-ui.css` に同梱 (色トークン `--ric-md-*` 8 つは 5 テーマの palette に入るため、CSS を分けても palette は分けられない)。**代案の鏡フックは採らない** (「公式 workaround API」= canon 2 系統目)
- **形**: Raccoon 提案どおり「本物の `<textarea>` を文字透明・最前面、後ろに `aria-hidden` の鏡 `<pre>`」。鏡は `island: true` で ricdom の diff から外し、部品が DOM を直接管理する。**状態を持つ部品 `app.use(createMdEditor())`** (`createScrollPane` と同型) — 鏡の同期 (入力 / スクロール / サイズ変化 / render 後) の主体に DOM を掴む口が要るため。consumer の差分は「import 1 行」ではなく「use() 1 行 + 呼び先の置換」になる (返信に明記)。全 props は textarea 本体に落ちる (`app.refs.get(ref)` = textarea、`createFocusWhen` 無変更)。`highlight: 'none'` と 200,000 文字超 (`maxHighlightLength`) は **`uiTextarea(props)` の戻り値そのもの**を返す退路
- **設計原則 (SPEC FACT 化)**: ①**鏡では字幅を変える CSS を使わない** (color / background / text-decoration / text-shadow / opacity のみ)。`font-weight: bold` はプロポーショナルフォントで字送りが変わり、鏡だけ先に折り返す → Raccoon の「太字」要望は意図的に不採用、`**強調**` は `text-shadow` の疑似太字。②鏡は textarea の **computed font 系 (family / size / line-height / letter-spacing / tab-size / padding / border) を実測してコピー**する → consumer が textarea に当てた CSS (等幅指定等) が鏡に乗る。③幅は `clientWidth + border` (textarea のスクロールバー溝を除く)。④IME は凍結しない — Chromium は変換中も `input` を発火するので鏡は自然に追随、`compositionend` で念押し同期。⑤字句解析は行単位の純粋関数 `tokenizeMarkdown`、不変条件 `tokens.map(t=>t.text).join('') === src` (1 文字でも足りない/多いとキャレットと表示がずれる)
- **統括の独立検証で見つけた実装の穴 2 件 (エージェント報告は全 green だった)**: (a) **鏡の幅計算が `box-sizing: border-box` 前提**で、textarea が既定の `content-box` (`.ric-textarea` は border-box を指定していない) だと鏡の内容幅が padding 分広くなり折り返しがずれる (デモで scrollHeight 814 vs 793、矩形幅差 19px)。browser テストは通っていた = テキストが偶然ずれない長さで、矩形幅を assert していなかった → 鏡を常に border-box に固定 + スクロールバー有り・content-box / border-box 両方で矩形幅と scrollHeight を assert する形に強化。(b) **`oncompositionend` を `on*` prop で渡していたが Chromium に IDL 属性 `oncompositionend` は無い** (`'oncompositionend' in textarea` === false) → ricdom のプロパティ代入は expando を作るだけで発火しない dead code。IME テストが通っていたのは `input` 経路が同期していたから → `addEventListener` に変更、テストは「`input` 無しで `compositionend` だけ」で鏡が更新されることを見る形に。**教訓: 「テストが緑」は「観測が正しい」を意味しない。実ブラウザで rect の実数を見る**。**コアの FACT として追記**: `on*` は `el.onxxx = fn` のプロパティ代入なので、IDL ハンドラ属性を持たないイベント (composition*、カスタムイベント) には効かない → render 後に `addEventListener` (`app.refs` or use() 部品から)
- **サイズ**: コア 4,877B 不変、**ui IIFE 24,994 → 25,637B (+643B、CSS 文字列の同梱分。JS は 0 件を grep で確認。テンプレートリテラル内の CSS コメント 1 つで +280B 増えていたのを JS コメントに移して削減)**、ui.css gzip 6,629 → 6,917B、md-editor IIFE 4,535B (新規)。unit 673 / browser 148 / examples 7 ページ
- 受け入れは Raccoon の 7 条件 (変換中の行高・折り返し・カーソル不変 / selectionStart 挿入 / Ctrl+V・D&D / スクロール同期 / 5,000 行で遅れなし / テーマ追従 / 'none' で見分け不可) で consumer 側が数字で返す。再検討条件: 行番号・行単位の差分再解析 (数千行で遅れの実測報告が来たとき)、`@layer` (§34 と同じ)
- **追報 4 (2026-09-17、要望と同日に採用) で 7 条件すべて合格**: 差し替えは `uiTextarea({...})` → `md({...同じ props})` の 1 箇所 + `use()` 1 行、既存 e2e 97 件は 1 文字も直さず全緑 + 新規 5 件 (e2e 全量 102/102、unit 853)。**実機 (Windows 11 / Microsoft IME) で開発者本人が日本語を打って、変換中も確定後も行高・折り返し・カーソルが動かない**ことを確認。**177,160 文字 (5,000 行) で 1 打鍵の中央値 12.5ms / 最悪 17.3ms** (鏡の再構築込み) = 「打鍵ごとに O(文書長)」の心配は杞憂、`maxHighlightLength` 200,000 の既定は妥当。鏡の背景は Raccoon の入力欄背景がもともと `--ric-color-control` のエイリアスだったので一致、consumer の素の `textarea { background }` は `.ric-md-editor .ric-md-editor__input` (クラス 2 個) に詳細度で負けるので鏡が隠れる事故は起きない (読み込み順ではなく詳細度で守られている点を評価)。`--ric-md-*` の複製 0 箇所
- **提案 4 件 → alpha.17**: ①ラッパ `div.ric-md-editor` に consumer の class を付ける手段 (`class` は textarea に落ちるのが仕様どおりだが、flex アイテムとしての位置が textarea からラッパへ移るため、親いっぱいに広げる consumer は必ずラッパに CSS を当てる) → **`wrapperClass` / `wrapperStyle` prop** を追加、安定セレクタは `[data-ricdom-role="md-editor"]`。②ラッパの既定を `display: block` → **`flex; flex-direction: column`** (block だと `height: 100%` の textarea がベースライン分はみ出す。alpha.16 の唯一の consumer が Raccoon なので Changed として明記)。③SPEC の `'none'` FACT に「ラッパ前提の CSS は `'none'` でラッパごと消える (退路として正しい挙動、両モードで生きる CSS は textarea の `class` へ)」。④hljs 未読込で md-editor が警告しない件は同意のうえ、`uiMdPre` と併用時に「Preview は色付き、本文のフェンスだけ素」が silent に起きうる → 読み込み順の注意を SPEC に 1 文

## 34. パイロット第 5 号 (Raccoon Memo) の追報 1・2 (alpha.8 / alpha.14 を main へ取り込み) からの確定事項 (2026-09-10、2.0.0-alpha.15)

- **報告**: 追報 1 (alpha.8、2026-09-06) は変化なし (unit 223 / e2e 39 全緑)。追報 2 (2026-09-10) は評価用 worktree (alpha.8) をレシピとして **main 系 (16 コミット先、パネル分割済み) に変換を新規適用し alpha.14 を取り込み** (45 ファイル +702/−648、`ctx:`→`children:` 147 箇所、`renderNow` 84 箇所)。**v1 時代の非公開プロパティ `_om` 直読みによるアコーディオン永続化の回避策を全削除し、controlled モード (`open` / `onToggle(id,next,nextMap)`) へ置換** (59 行 → 38 行、フェイルセーフごと不要に)。alpha.9〜14 のうち当たったのは `createScrollPane` の 200ms バックストップ (Electron 非表示中の自動追従、consumer 側の変更なしで恩恵) と `createFocusWhen` の disabled ガード (挙動不変)。起動〜操作でコンソール 0 件
- **実害 1: `<select>` の value が、options が後から増える描画で反映されない (build 経路と patch 経路の非対称)**。起動列「provider を state に入れて初回描画 (options 1 件) → 設定読み込み完了で `renderNow()` して options が増える」で `.provider-select` が先頭 option に戻る。統括の再現 (alpha.14 dist、jsdom): options 増加直後の value が `'default'`、次の render で正しくなる。**v1 コアも同じ順序 (統括が v0.4.5 で同条件を再現、value が `'default'`) だが、v1 `ui_select` が各 option に `selected: 1/0` を付けていたため consumer からは見えなかった**。v2 `uiSelect` が「コアが構築順を解決済み」と単純化した際、コアの対策は build 経路 (`buildDomNode` の子 append 後の再適用) にしか無かった = **§32 の監査 (inline style / 暗黙挙動のカタログ 18 行) では捕捉できない種類の移植時消失** (「DOM プロパティ適用と子 patch の順序」というコード上に文字として無い挙動)。**修正 (alpha.15)**: 再適用を `reapplySelectValue(el, normalized)` に括り出し、build 経路に加えて **patch 経路の両 call site (keyed / positional) で `patchChildren` の後に呼ぶ**。編集中ガード (§3.2) は select にも同様に効く (activeElement の間は当てない)。Raccoon の `key: options.join('|')` による再生成回避策は不要になる (SPEC §2.6 に FACT)
- **実害 2: snake_case のまま渡した props (`transform_image_src`、`on_resize_end`) が無言で無効になる**。UI 部品は未知の prop を rest スプレッドで要素に素通しする契約 (SPEC §10.5) のため、コアの `applyPlainAttr` が `String(fn)` を setAttribute するだけで、`console.error` も型エラーも出ない。Raccoon では e2e 1 本 (画像相対リンクの解決) が落ちて発覚。**判断**: Raccoon 提案の「既知フック名の snake_case 別名を dev で warn」は alias 一覧 = speculative な個別対応で、canon は 1 つの方針に反する。§29 の原則「実害が確定した時点で警告する」で見ると、**関数値が HTML 属性として意味を持つことは絶対に無い = `applyPlainAttr` に関数が届いた瞬間が実害確定**なので、そこ 1 箇所で汎用的に検知する (`/^on[a-z]/` に一致しない `on_xxx` も同じ場所に落ちるので同時に拾える)。dev で key 単位に 1 回 `console.warn`、**dev/prod ともに関数を stringify して属性に入れない** (壊れた属性値が DOM に残る方が有害)。SPEC §2.1 に FACT
- **DCE の規律 (実測)**: 警告本体を別の top-level 関数に切り出すと、呼び出し側が `bakedDevMode ?? isDevMode()` で消えても**関数宣言そのものが min に残った** (esbuild の tree-shaking は dead-branch 畳み込みの結果を再フィードしない)。→ **dev 専用の警告は分岐の中にインラインで書く** (重複 key 警告 #13 が最初から踏んでいなかった形)。`grep -c "received a function"` で min 0 / dev 1 を確認。コア min gzip 4,831 → **4,877B (+46B、天井 5,200B)**
- **据え置き**: (a) 編集中ガードでプログラム書き込みが textarea に出ない件は alpha.8 の FACT (フォーカス中は DOM が正) どおりで、Raccoon は `el.value` 明示書き込みを維持 — 変更なし。(b) ダークテーマで `<button>`/`<textarea>` がスクリーンショット上薄く見える件は computed 色が正しく実害未確認 (v2 の `.ric-button` / `.ric-input` は `appearance: none` 設定済みで、Raccoon の推定「appearance 未設定」とは異なる。v1 vendoring 時のスクリーンショットとの比較で v2 固有かが確定する)。(c) `request_body_focus` の二重 `renderNow()`: v2 の `createFocusWhen` は「fw() を呼んだ render の完了 (`nextRender`) 後に ref を探して focus する」設計なので 1 回で足りる見込み、単純化は consumer 判断
- **docs**: `V1_VS_V2.ja.md` の機械変換節と移行打診文 (罠 27) に「識別子だけでなく **部品に渡す props 名の snake_case → camelCase** (`transformText` / `transformImageSrc` / `onResizeEnd` / `onCollapseChange` / `defaultOpen` / `strokeWidth`) も変換対象」を追記。rest スプレッド契約の裏返しとして、綴り違いの props は dev の関数値警告以外では検知できない
- **追報 3 (2026-09-10、alpha.15 取り込み) で第 5 号は完了**: unit 374 / e2e 全量 65/65 (21 ファイル)、コンソール 0 件。`key` 回避策の撤去を「旧 dist で赤 → alpha.15 で緑」の両方向で確認 (consumer 側の取り込み手順として定着 = 「回避策撤去は旧 dist で赤を先に見る」)。`request_body_focus` の二重 `renderNow()` も 1 回に (e2e 緑)。ダークテーマの薄灰色は **v1 vendoring 最終コミットの worktree で同じ台本のスクリーンショットを撮って v1 でも v2 でも出ない = v2 固有ではないと確定**、クローズ
- **同じ比較で見つかった新規 1 件: CSS の読み込み順**。v1 の `css_for(...)` は注入する系統を選べたため、textarea/input/button/select の部品 CSS を要求していない Raccoon ではアプリ CSS と衝突する相手が無かった。v2 の 1 枚は常にそれらの基底 (`.ric-textarea { font-family: inherit }`、`.ric-select { width: 100% }` 等、詳細度 (0,1,0)) を含み、`<link>` を `styles.css` の後に置いていたため同じ詳細度のアプリ規則が後勝ちで潰れていた (等幅フォント・削除ボタンの赤・小ボタンの font-size など 15 箇所、v1 との比較で発覚)。対処は `<link>` をアプリ CSS の前へ (基底 → 上書き) + `.ric-select` の width だけ明示上書き。**判断: docs のみ** (TUTORIAL §4、SPEC FACT、V1_VS_V2、移行打診文 罠 29)。`injectStyles()` は `<head>` 末尾に足すので同じ罠を持つことも FACT に。**構造的な選択肢 = `ricdom-ui.css` 全体を `@layer ricdom {}` で包む** (レイヤ無しのアプリ CSS が順序・詳細度によらず必ず勝つ、alpha.8 の `:where()` と同じ思想)。ただし「ricdom の CSS が自分の CSS より強い」前提で書かれた consumer CSS の見た目が変わり得るため、**再検討条件: 読み込み順の衝突を 2 件目の consumer が踏んだとき、または beta 前の破壊的変更の棚卸し時**
- 第 5 号は 3 通で完了 (追報 2 = 実装 2 + docs 1、追報 3 = docs 1)。**パイロット 10 アプリで計 59 件**

## 33. 第 2 号 追報 7 (#15: alpha.9 以前の production IIFE が dev モードだったことの性能面の実害) (2026-09-09)

- **報告**: Trend Guard (alpha.5 のまま評価中) が「他の画面から戻った直後に長時間、以後 1 分おきにホバーが効かない」を CPU プロファイル (500µs サンプリング) と `process` ダミー注入の A/B で機構特定: `isDevMode()` が `process` 無しの Electron renderer (`contextIsolation: true`、推奨設定) で dev 判定 → 入れ子読み取りごとに Proxy `get` + WeakMap → 800 銘柄のソートで **1〜1.8 秒の long task** (最小化 3 分で 123 件、復帰後 25 秒で 19 件)。ダミー注入で復帰後 0 件、プロファイル上位から `get@ricdom` が消える
- **事実関係**: この穴は §28 (alpha.10) で修正済み (`__RICDOM_DEV__` のビルド時定数、min から警告コードを DCE)。Potopeta が「min に警告文字列が残っている」と見つけた同じ穴だが、**性能面の実害を定量化したのは今回が初めて**。統括の再現 (alpha.14 dist、jsdom、4 万回の入れ子読み取り): min 9.5ms / dev IIFE 24.3ms (TG の 3.4 / 7.6ms と同じ比)。production min は `process` 無しでも dev 判定にならないことを確認
- **統括の反省**: alpha.10 の告知は「警告文字列が残っていた」と書いただけで、「alpha.9 以前の min を使う IIFE consumer は全員、本番で dev モード = 入れ子読み取りが数倍重い」という影響範囲を伝えていなかった。→ 全パイロット向けに改めて告知 (`_announce_v2_alpha10_perf.md`)。**教訓: バグの修正告知には「誰が・どの条件で・どの実害を受けていたか」を書く。「何を直したか」だけでは consumer は自分事にできない**
- **SPEC に FACT**: dev ビルド (`.iife.js`、バンドラなしの ESM) は state の入れ子読み取りに Proxy コストが乗る (ホットループで数倍)。production には一切乗らない。性能計測は必ず min で。TG の提案 2 (render 中の読み取りはラップしない等の dev 最適化) は、dev で操作不能になる実害報告が来たときに再検討
- TG は alpha.5 → alpha.14 への更新 (9 段分) と `process` ダミーの撤去を依頼。`tickScanner` の Map 化 (比較ごとの `.find` → tick ごとの Map、v1 にも適用) は Proxy の有無に関係なく正しい改善
- **追報 8 (2026-09-09) で #15 完了・第 2 号は 17 件すべてクローズ (回避策ゼロ)**: alpha.14 取り込み + `process` ダミー撤去で、`typeof process` が undefined のまま復帰後 30 秒の long task **0 件** (alpha.5 シム無しは 19 件 / 5,235ms)、最小化 60 秒は 27 件 / 4,846ms → 7 件 / 466ms。production min に `typeof process` 0 件を consumer 側でも確認。**alpha.6〜14 の 9 段分をまとめて取り込んでも追随のコード変更はゼロ** (`:where()` の詳細度 0 でアプリ CSS が勝つ / 初期フォーカス順は「既に内側にあれば尊重」が先に効く / light dismiss は明示 `close()` と非競合 / `triggerVariant` は自前トリガーのため影響なし) — 互換性の維持が実証された。E2E 10/10 × 3 連続、unit 145
- consumer 側の教訓: 固定 300ms 待ちの E2E がフェードアウトと競合して flake → 状態ポーリングに (「落ち着いた後で assert する」の consumer 側の実例)

## 32. v1 inline style / 暗黙挙動 / 正式 API の一括パリティ監査 (2026-09-07、ユーザー指示)

- **動機**: パイロット 10 アプリの実バグの半数以上 (dialog/popup の z-index、dropdown の `position: fixed`、page の bg/fg/font-size、`gap` prop、`variant: 'link'`、`create_density` / `create_font_size`) が「v1 の inline style・暗黙挙動・正式 API を v2 の CSS クラス・props に移植したときの取りこぼし」という同じ型だった。個別対応を重ねてきたが系統的な監査をしていなかった (統括の見落とし) → 残りを consumer に踏ませる前に洗う
- **方法**: 読み取り専用の Sonnet 3 系統を並列 (A: control / layout / text 約 1,300 行、B: popup / composite 約 2,300 行、C: テーマ・コア + 公開 export 突合 + `--ric-*` 24 トークン突合 + 5 テーマのパレット値突合、約 1,900 行)。各項目を v1 `file:line` → v2 `file:line` で突き合わせ、判定 (同等 / 意図的・docs あり / 意図的・docs なし / 欠落 / 要確認)。alpha.1〜13 で対応済みは除外。結果は `docs/V1_PARITY_AUDIT.ja.md` (内部記録) に集約
- **結果**: **欠落 6 / 意図的・docs なし 4 / 要確認 14**。**既知パターン (z-index / position / 塗り / prop 消失 / variant 消失) の再発はゼロ** — パイロット報告で塞いだものが全部だった。パレット 5 種・トークン 24 種は名前・値とも完全一致、コアの契約 (diff / スケジューラ / FORCE_REAPPLY / key / 編集中ガード) は FACT 化済みで挙動一致
- **統括の振り分け** (詳細は V1_PARITY_AUDIT の表 1〜18): **復活・修正 (alpha.14 候補、ユーザー確認後)** = `bindRadiobutton` / `bindColor` (実装ごと不在)、`exportSettings` (density / fontSize の読み戻し)、`version` export (core / ui)、`createDialog` の `triggerVariant`、`createFocusWhen` の `!el.disabled` ガード、`uiInput.maxlength` の型、hljs 未読込 warn の console ガード、`toast.ts` のコメント誤り。**現状維持 + docs 明記 (再検討条件つき)** = dropdown label トリガーの `width: auto` (v1 `100%`。3 パイロットが auto で確認済み)、`watch_outside_click` 廃止 (v1 でも 5 行、代替 1 行を明記)、`create_ui_panel` 廃止 (`uiPanel` + `applyTheme` の島)、`ric-theme-change` 非同期、`class` の Record 形、containing block 探索の簡略化、tweak folder の `<details>` → `hidden` (条件: find-in-page の要望 → `hidden="until-found"`)、`bind_tabs` 廃止
- **原則の再確認**: 「v1 で正式だった prop / API は復活が原則」(§20) は、rest スプレッドで黙って崩れるものに限らず、import で落ちるものにも適用する (気づけるからよいのではなく、移行コストの問題)。ただし v1 でも数行の汎用ヘルパー (`watch_outside_click`) は代替を明記して廃止でよい
- **次回同種の監査をする条件**: v2 の破壊的変更、または v1 に新 API が入ったとき
- **alpha.14 で実装 (2026-09-07、ユーザー決定「8 件すべて + docs 9 件」)**: `bindRadiobutton` / `bindColor` (v1 と同じ契約、`name` は key 既定で `options.name` で上書き可) / `exportSettings(el)` (`{ theme, density, fontSize }`、`exportTheme` と分類整合、round-trip テスト) / `version` (core・ui、tsup define で package.json から注入、IIFE からも読める。コア +28B → 4,831B) / `createDialog` の `triggerVariant` / `createFocusWhen` の `!el.disabled` / `uiInput.maxlength` 型 / hljs warn の console ガード / toast コメント修正。docs 9 件は V1_VS_V2 / SPEC に反映。unit 606 / browser 139
- **判断: `triggerVariant` の既定は v1 と同じ `primary`** にした。alpha.0〜13 の v2 は v1 由来の `trigger_variant` キーが dead code (API_AUDIT §1 で削除済み) で plain だったため、alpha 利用者には見た目が変わる Changed になる。それでも「v1 の正式挙動は復活が原則」(§20) を優先し、偶然の alpha の見た目を凍結しない。CHANGELOG と移行プロンプトに「plain に戻すには `triggerVariant: 'default'`」を明記
- `on*` の `null` / `undefined` (#16) は v1 と v2 で**完全一致** (build: undefined は無視・null は代入 / patch: 関数以外は前のハンドラを null に) — 差は無かった。SPEC に FACT 化

## 31. alpha.11 の regression (spread による dev Proxy の state 混入) と配布・ライセンスの確定事項 (2026-09-07、2.0.0-alpha.13)

- **regression の内容**: alpha.11 で 1 段目の配列も dev の deep-warn Proxy で包んだ結果、canon の `app.pages = [...app.pages]` が **Proxy 化された要素を新配列に写し、root の set で生 state に Proxy が混入**。以後 `pages[0]` は「Proxy の Proxy」(キャッシュが生 object キーなのでミス)、mutating メソッドの `apply` 先が内側 Proxy になり内部 set が pending に積まれて `push()` で 3 件、spread のたびに 1 枚増え、`structuredClone(state)` が **state 自体**で DataCloneError。production では起きない = dev/prod で state の中身が違う。canon を使う consumer 全員が踏む経路
- **発見の経緯 (統括の反省)**: Potopeta が「push で 3 件」を報告 → 統括は CJS+jsdom / dev IIFE+jsdom / dev IIFE+実 Chromium の 3 経路で「1 件」を確認し、方針 (再現できないものに対症療法を入れない) に従って再現条件の提示を依頼 → Potopeta が差分実験 (A: push のみ = 1 / B: 直前に canon の spread = 3) で真因を特定。**統括の 3 経路はすべて「spread を通さない」A で、条件の探索が狭かった**。方針自体は維持するが、「再現しない」と返す前に consumer の実コードパス (canon を含む) を 1 度は通す
- **修正 (Potopeta の案 1 + 2 を両方)**: (1) `Proxy → raw` の WeakMap で `wrapDeepWarn` / `wrapChild` を冪等に (キャッシュのキーは常に raw、mutating メソッドの `apply` も raw に) (2) root / 1 段目 / deep の set で代入値を**再帰的に unwrap** (plain object / 配列のみ再帰、Date/Map/DOM ノード/class instance は raw 化のみ、循環は WeakSet、変更が無ければ同じ参照 = 不要コピーなし)。**不変条件を FACT に: dev でも生 state に Proxy は入らない (dev と production で state の中身は同一)。読んだ値が dev で Proxy になるのは従来どおり、書き戻せば生に戻る**
- **サイズ規律の実務**: production 分岐を修正前とソース行単位で同一に保たないと、`let raw = val; if (dev) …` の残骸 (宣言) が DCE 後に残って gzip が増える → dev/production の小さな分岐を共有せず複製する形に。コア min 4,801 → 4,803B (+2B は minifier の識別子割当のノイズ、min に dev シンボル無し)、dev IIFE 8,668B。red-first: 3→1 / `isProxy` true→false / DataCloneError→ok を統括も独立に再現。unit 582 / browser 139
- **alpha ごとの annotated tag `v2.0.0-alpha.N` (ユーザー決定)**: alpha.0〜12 を「その alpha を閉じる § コミット = consumer に告知した hash」に遡って付与 (version bump 基準にしなかったのは、bump が各 alpha の最後の docs コミットで行われるため、bump 基準だと次の alpha の実装コミットが前の alpha 側に混ざるから)。alpha.1 は package.json の bump が漏れていた (tag メッセージに注記)。**以後は § コミット直後に tag、bump 確認を運用に追加**。README の Status 節と移行プロンプトに案内
- **ricdom-lz を MIT の別リポジトリに (ユーザー決定)**: Potopeta の「v2 (MIT) + app + v1 由来の展開 wrapper (PolyForm) の混在で、wrapper の数十行だけが PolyForm を引きずる」相談が起点。v1 `scripts/lz.js` は自作 LZSS (他者コードの派生ではない) なので再許諾に障害なし → `miyoshi-tec/ricdom-lz` (private、`e684895`)。アルゴリズム・出力形式は不変 (v1 v0.4.5 の `RicDOM.lz.min.js` と byte 一致の回帰テスト 48 件)、v1 側のコピーは PolyForm のまま。v2 本体に LZ を含めない方針 (§13) は維持し、README から「意図的に同梱しない、ricdom-lz を使う」でリンク。副産物: Windows の `core.autocrlf=true` では LZ 成果物内の意図的な生 LF が作業ツリー上で CRLF 化され壊れる (git blob は正しい) → ricdom-lz は fixtures を `.gitattributes -text` に
- **パイロット 10 アプリ・13 consumer で計 56 件** (alpha.13 = regression 1)
- **第 9 号 (Potopeta) 完全クローズ (2026-09-07)**: alpha.13 で再現 4 指標 (B 3→1 / structuredClone ok / isProxy false / spread 3 回で warn 0) すべて解消、906/906・warn 0・error 0。ricdom-lz も実入力 3 本 (core / ui / app.js) で v1 コピーと sha256 一致を確認し vendoring で差し替え。consumer 側の教訓「再現できないと返されたら環境差ではなく条件差を疑う」は統括側の教訓と対。次は beta で pin 固定

## 30. パイロット移行第 10 号 (線茶 Sencha、Rancha 派生 Electron) + 第 9 号の alpha.11 結果 からの確定事項 (2026-09-07、2.0.0-alpha.12)

- **第 10 号 (線茶)**: 打診一覧外から自発参加 (13 番目の consumer)。v1 v0.4.5 → alpha.9、「移行できた」(E2E 62/62、機械変換 253 箇所を 7 ファイル明示列挙)。**v2 で構造的に消えた自前コード 2 点**: number 入力の編集中ガード 40 行 + 回帰 e2e (コアの規則で代替できることをガードを外して実証) / CSP の `script-src 'unsafe-eval'` (LZ 版を本体から外した効果、Electron の Insecure CSP 警告も消滅)。「`children` 省略 = 空要素」は SVG の葉要素 (line/circle/path) にちょうどよく island 不要 — 罠 2 の設計判断が SVG 用途では利点になる実例
- **popup / dropdown の外側クリックを light dismiss に** (HTML `popover="auto"` と同じ: 外側の pointerdown で閉じ、そのクリックは下の要素に届く)。v1 も overlay で吸っていたので **v1 パリティではなく設計変更**。理由: 「dropdown を開いたまま別のボタンを押す」E2E が Playwright の actionability 待ちで 30 秒 timeout、実ユーザーも 1 回目のクリックが閉じるだけになる (線茶で実測、他アプリの E2E でも同型が出るはず)。overlay 要素は role 用に残し `pointer-events: none`、document の capture `pointerdown` で外側判定 (トリガー上は既存の toggle に任せ二重 close を防ぐ、`openAt` 経路も同じ)。外側 dismiss は `doClose()` (フォーカス復帰なし = popover の semantics)、Esc / トリガー / 項目活性化は従来どおり復帰あり。dialog の overlay はモーダル backdrop として据え置き。red-first: 9 件中 7 件が修正前に Playwright timeout (`subtree intercepts pointer events`) で赤
- **`DropdownProps.label` を `RicNode | RicNode[]` に** (実装は元から描けていた、型だけの穴。`PopupTriggerObject.label` と揃えた)。「popup は trigger の中、dropdown は top-level」の非対称は据え置きだが、型の幅の違いは解消
- **upstream から vendoring した vdom 生成器** (Rancha の dxf-to-svg が v1 形 `{ tag, ctx }` を返す) は罠 13 の新しい実例 → 境界 1 箇所で `ctx`→`children` を再帰変換、upstream が v2 に移った時点で外す。Rancha 派生アプリはすべて同型。置換スクリプトは件数を出力して確認 (heredoc で `\b` のエスケープが剥がれ無音で 0 件になった実例)
- **配布の穴 (ユーザー判断待ち)**: `dist/` が gitignore で、alpha 期間は fetch ベースの pin ができない (線茶は clone → `npm ci` → build の 1〜2 分の sync に書き換え)。選択肢: alpha ごとの annotated tag / release asset に dist を添付 / 早期 npm publish
- **リポジトリ改名の副作用**: 旧名 `miyoshi-tec/RicDOM` は v2 の `ricdom` に解決される (大文字小文字非区別) → v1 の sync が v2 リポジトリに v0.4.x を探しに行き**無音で 404**。v0.4.5 告知と移行プロンプトに明記。v0.4.4 の告知では「旧名が v2 に取られる」まで書いていなかった
- **第 9 号の alpha.11 結果**: dev IIFE で 906 check → **warn 2 件 = 本物 (テストハーネスの後始末の深い代入 2 path)、canon 由来 0 件** (`mutate()` 数百回で 0)。遅延判定方式が意図どおり働いた証拠。修正後 906/906・warn 0。Potopeta の canon 運用 (CLAUDE.md で規約化) が v1 時代から本体に発火忘れを作っていなかったことも判明
- **再現しない報告の扱い**: Potopeta の「`push()` 1 回で warn 3 件」は、統括が `f918134` の dist で CJS+jsdom / dev IIFE+jsdom / dev IIFE+実 Chromium の 3 経路で試して**すべて 1 件**。方針どおり推測でガードを入れず、再現ページと取り込み commit の提示を依頼。文言の残り (「mutating メソッドは検知対象外です」= alpha.10 以前の残骸) と「どのトップレベル代入でも pending は破棄 (path は見ない)」の FACT は再現済みなので alpha.12 に含めた
- コア 4,801B (不変)、ui 25,049B (+574B、light dismiss)。unit 573 / browser 139。**パイロット 10 アプリ・13 consumer で計 55 件** (第 10 号 = 変更 1 + 型 1 + docs 3 + 配布/告知 1、第 9 号追報 = 文言 1 + FACT 1)
- **追検証 (2026-09-07、alpha.12) で第 10 号は完了**: Escape の回避策を外しても light dismiss 経路が 1 クリックで通る (E2E 62/62)、`label` に palette アイコンが型どおりに戻る、dev IIFE で ricdom 由来の警告 0。回避策ゼロ (`v1_to_v2()` は Rancha が v2 に移るまで維持する upstream 依存の吸収)。提案の「TUTORIAL §1 に dev / min の使い分け」を反映 (移行プロンプト B-5 の 1 行では見落とされる位置だった)。線茶は shallow copy 差し替えの規律で書いていたため alpha.11 の警告も 0 — 「発火忘れだけを鳴らす」設計と整合

## 29. パイロット第 9 号の追報 (配列経由の深い代入 / 発火忘れ判定) からの確定事項 (2026-09-07、2.0.0-alpha.11)

- **第 9 号完了**: alpha.10 で回避策 3 つ (`globalize()` / CSS マーカー / `theme_vars_of()`) を撤去し 906/906・console 0、**v2 の非公開実装に依存する箇所ゼロ**。`spacious` は v1 時点のバグとして `tight` に (v1 本番にも)
- **配列経由の深い代入が dev 警告の死角だった**: `wrapDeepWarn` が配列を素通し (`if (Array.isArray(value)) return value`) するため、`app.pages[0].page.width = 1` のような**リスト状 state 経由の代入はどの深さでも warn 0**。SPEC の「Arrays are never wrapped … not warned about」は実装と一致していたが、「再描画の追跡対象外」と「警告もされない」を一文にまとめたことで、consumer が最も深い代入をやりがちな形が丸ごと死角に。Potopeta の 880 check を dev で通しても warn 0 だったのはこのため。**dev 限定で配列も警告 Proxy で包む** (要素 get で object を包む、要素代入・`length`・mutating メソッドを記録。mutating メソッドは 1 回で 1 件、target に直接 apply して set トラップの多重発火を避ける)。再描画の追跡 (`isTrackableObject` の配列除外、差し替え canon) は不変
- **push 前の設計指摘 (Potopeta 2 通目) で判定方式を変更**: v1 の canon「その場で深く書いてから `handle.pages = [...handle.pages]` / `handle.render_tick++` で発火」(v1 docs 自身が推奨、Potopeta は 22 + 29 箇所) では、代入時 warn は canon 準拠でも必ず鳴り本物が埋もれる。→ **深い代入は pending に記録するだけ、同じ同期タスク内にトップレベル代入 / 1 段目 tracked 代入 / `renderNow()` があれば破棄、microtask の時点で残っていたものだけ path ごとに 1 回 warn**。render は木全体を再読するので「深く書いてから発火」は正しく写る = 無警告が正しい。**深い代入 → `await` → 差し替え は鳴る** (await の間 UI が古い実害の検出、FACT)。`renderNow()` は Proxy を経由しないため `app.ts` から pending 破棄を呼ぶ (production min に `.pending` プロパティ名 1 語だけ残る = `isDevMode` 単体と同じ扱いの小さな例外)
- **red-first**: canon 4 パターン ((a) 深く書いて spread / (b) push + 無関係な `++` / (c) 複数書いて spread / (d) 深く書いて renderNow) は代入時 warn 版 (1bd53fb) で 1〜2 回鳴り、遅延版で 0。統括も dist の CJS で独立に再現
- **設計原則として記録**: dev 警告は「規則に反した瞬間」ではなく「**実害が確定した時点**」で出す。警告の目的は canon の強制ではなく silent failure の可視化なので、v1 の正当なスタイルを鳴らすのは目的に反する。production は `__RICDOM_DEV__=false` で全コード DCE (min に `microtask` 等の文字列なし)
- 前の実装者が途中で停止 (600 秒無応答) → 未コミット差分を別の実装者が引き継いで完成。「esbuild が畳めない三項演算子」は独立 repro では畳めていた (慣習統一のため if/else に変更、サイズ不変)
- コア min gzip 4,767 → **4,801B** (+34B、`renderNow()` からの破棄経路)、dev IIFE 8,275B。unit 572 / browser 130。**パイロット 9 アプリで計 49 件**。Potopeta に alpha.11 dev IIFE での warn 件数 (= v1 時代から潜んでいた発火忘れの数) の報告を依頼

## 28. パイロット移行第 9 号 (Potopeta = RicUI デザイナ、単一 HTML 配布) からの確定事項 (2026-09-06、2.0.0-alpha.10)

- **移行実績**: v1 v0.4.5 → v2 alpha.9、5,647 行 + 906 check、**v2 のバグ 0 件**。自作トークナイザで識別子のみ 166 箇所を機械変換 (コメント・文字列・正規表現リテラルを保護)。統括者による独立検収記録 (技術的主張 6 件を dist で裏取り) 付き — パイロット報告の品質基準として参照する
- **`spacious` は v1 でも無効値**: consumer は「v1→v2 の仕様差」と報告したが、v1 `ric_ui/context.js` の density も `comfortable / compact / tight`。v1 の頃から黙ってフォールバックしており、v2 の warn (alpha.7) が炙り出した (第 4 号の `density: 'md'` と同型、2 件目)。返信で訂正。**教訓: consumer の「v1 ではこうだった」も v1 ソースで裏取りする**
- **`createDensity` / `createFontSize` 復活** (v1 `create_density` / `create_font_size`、値を返す純粋関数。§20 の原則)。consumer は detached div に applyTheme して変数を読み戻す、非公開の変数命名に依存した回避策を書いていた
- **IIFE は末尾で `globalThis.ricdom` / `globalThis.ricdomUI` に明示代入**: esbuild の bare `var ricdom=` は、関数スコープで eval するローダ (v1 の LZ 自己展開) では global に立たない。footer で +13B
- **CSS 読込検知は `document.styleSheets` 走査に**: `<link href$=…>` と injectStyles のマーカーだけでは、生 CSS を `<style>` にインラインする単一ファイル配布で false positive。「規則が実在するか」を見る
- **dev / production の IIFE を 2 本に** (`.iife.js` = 警告あり・非 minify、`.iife.min.js` = production)。React の development/production と同じ形。README に 1 行
- **重大な副産物 (実装中に発見): production の `.iife.min.js` でも dev 警告が生きていた**。`isDevMode()` の `typeof process === 'undefined'` 節が define で畳めず、`process` の無いブラウザでは production でも true → 警告コード・文字列が出荷 min に残って実行されていた (SPEC の「DCE される」は事実に反していた)。Potopeta の「min では警告が出ない」という観察はむしろ逆で、**別の理由 (再確認を依頼)**。修正: `__RICDOM_DEV__` をビルド時定数 (`declare const` + tsup define: min=false / dev=true / ESM・CJS は未定義でバンドラの NODE_ENV に委ねる)、`bakedDevMode` をファイル先頭の top-level const にし、**呼び出し側で `(bakedDevMode ?? isDevMode()) && …` の左オペランド**に置く (esbuild は関数の定数戻り値を呼び出し境界を越えて畳まない / `&&` の右側の定数も畳まない / `bakedDevMode` をオブジェクトリテラルの後ろに置くとインライン化されない / 判定は warn を含む関数の先頭で早期 return しないと tree shaking で宣言が残る — いずれも esbuild 直叩きの二分探索で実測)。**コア gzip 5,182B → 4,768B (−414B)**、ui min 24,970B → 24,472B。**天井 5,200B に対し 432B の余裕が戻った** (「コアに機能を足さない」方針は継続)
- UI 側 `pureHelpers.ts` の `isDevMode` 複製も同じ穴 → 同じ方式で修正 (`4d07b94`)。**この修正は統括の Agent と、統括が spawn した提案タスクを起動した別セッションとが同一ツリーで並行して行い、別セッション側が採用された** (Agent 側の CHANGELOG 記述「ui 固有の変更は不要」は事実誤認で、別セッションが二分探索で反証)。教訓: 同一ツリーでの並行編集は避ける。提案タスクは Agent 委任と二重にしない
- **良かった点 (据え置き)**: `use()` の failure mode / `renderPortal()` を core が呼ぶ設計 (portal は消えないが内容は毎 render) / splitter の `side`/`main` ラッパー廃止 / dialog a11y / applyTheme の warn / クラス名・role 値の据え置き
- コア 4,768B、ui 24,472B、css 6,300B。unit 550 / browser 126。**パイロット 9 アプリで計 47 件** (第 9 号 = 復活 1 + 配布 3 + isDevMode 2 + docs 1、うち v2 の実バグは isDevMode の 2 件)

## 27. パイロット移行第 8 号 (LCP = Local Code Pilot v2、Electron classic script + contextIsolation) からの確定事項 (2026-09-06、2.0.0-alpha.9)

- **移行実績**: v1 v0.4.2 → v2 alpha.8、「移行できた」。E2E 24/24、機械変換 220 箇所 + 手作業 10 点、約 2 時間 (うち移行 40 分、残りは切り分け)。IIFE グローバル (`ricdom` / `ricdomUI`) が classic script + contextIsolation 構成の唯一の導線 — **据え置き対象**。v1 と v2 のスクリーンショット並列比較、v1 develop を同条件で走らせる対照実験、`ricdom-ui.css` を grep しての原因特定 (5 分) — 外部 CSS 1 枚と role レジストリを選んだ理由がそのまま効いた
- **z-index が CSS クラス化で落ちていた**: v1 は dialog overlay/本体 `zIndex: 500/501`、popup `401` を inline で持っていたが、v2 の CSS 化で dialog / popup / dropdown の分だけ落ち (toast 600 / tooltip 401 は残っていた)、`.ric-splitter__divider { z-index: 1 }` がモーダルを貫通した。CSS クラスに v1 と同じ値を復元 (序列 toast 600 > dialog 501 > popup/dropdown/tooltip 401)。「portal に stacking context」案は `portalTo` で外部要素を使う consumer に効かないので不採用。**教訓: inline style → CSS クラスの移植は、値だけでなく「inline で持っていた理由 (stacking)」ごと移す。Phase 2 の移植レビューで見落とした**
- **テスト設計の罠 (実装中に発見)**: dialog は開くと portal の兄弟を `inert` にし、`inert` 要素は `elementFromPoint()` のヒットテストから外れる → splitter を兄弟に置いた素朴な構成では **z-index 未修正でも緑になる偽陽性**。`portalTo` で portal を splitter の main 内に置いて初めて赤/緑を正しく判定できた。「観測結果を assert する」テストでも、観測手段そのものが仕様 (inert) に影響される場合がある — テストが赤になることの確認 (red-first) を必須にしている理由
- **dialog の既定初期フォーカス順を「本文 → フッター → ✕ → root」に変更** (LCP #4、Trend Guard も同じ経験で 2 件目)。DOM 順で最初 = ヘッダの ✕ にリングが付き、スクリーンリーダーが「閉じる」を最初に読んでいた。`[autofocus]` 最優先と「既に内側にあれば奪わない」ガードは維持。**`initialFocus` prop は引き続き作らない** (§21)。見た目が変わるので CHANGELOG は Changed
- **`createScrollPane` の追従に rAF + 200ms バックストップ** (コアのスケジューラと同じ二重化、UI 側にローカル実装 — 状態が pane ごと)。v1 と同じ rAF のみだった
- **純粋関数部品の Props 型に `style?: StyleValue` を明示** (10 部品)。rest 透過で動いてはいたが型に無かった
- **docs**: `createApp` の同期初回描画と TDZ (render が参照する `const` より後に書く、v1 の `handle.render = render` 後付けと同じ理由) / **Electron の隠れウィンドウは rAF 停止 + setTimeout ≈1s 間引き** (コアの backstop も間引かれる、v1 と同じ、E2E は `backgroundThrottling: false`) を SPEC §7 脚注に
- 出荷 CSS に長い説明コメントを入れると css gzip が肥大する (+850B) → 説明は TS 側の `//` に、出荷 CSS は 1 行コメントまで
- コア未変更 (gzip 5,169B)、ui 24,726B、css 6,288B。unit 540 / browser 113。**パイロット 8 アプリで計 41 件** (第 8 号 = バグ 1 + 変更 1 + 追加 2 + docs 2)
- **追検証 (2026-09-06、alpha.9) で第 8 号は完了**: z-index 回避策撤去で貫通なし、3 ダイアログの初期フォーカスが本文/フッターへ (E2E 30/30、alpha.8 の dist で 5 件赤 → alpha.9 で緑)。回避策ゼロ
- **LCP も同じ `elementFromPoint` の偽陽性を踏み `capturePage` のピクセル比較へ切り替えていた**。v2 側の `portalTo` 回避は「CSS 規則」は検証するが「LCP 型の構造 (splitter = portal の兄弟)」を検証しない、という指摘を受け、**兄弟構造のまま dialog を開き、判定直前にテスト側で兄弟の `inert` を外してから `elementFromPoint` する変種**を追加 (`inert` はヒットテストにだけ効き描画順には影響しない)。修正前 CSS で赤、`inert` を外さない素朴版は修正前でも緑 = 偽陽性、を両方固定。browser 114
- **初期フォーカス変更 × 編集中ガードの組み合わせ** (LCP B): 本文先頭が textarea/input の dialog は開いた直後からガードが効く。E2E の JS `.click()` はフォーカスを移さないので「state から本文を書き戻す」ボタンが無反映になる → `focus()` → `click()`。仕様どおりの帰結だが alpha.9 で新しく生まれた組み合わせなので SPEC / TUTORIAL / V1_VS_V2 / 移行プロンプトに FACT 化

## 26. パイロット移行第 5〜7 号 (RaccoonMemo / Rancha / Brownies Desktop、Electron 3 アプリ同時) からの確定事項 (2026-09-06、2.0.0-alpha.8)

- **移行実績**: v1 v0.4.5 → v2 alpha.7、3 アプリとも「移行できた」。unit + e2e (スナップショット含む) が v1 と同数で全緑 (Brownies 361+27 / Rancha 392+116 / Raccoon 223+39)。推奨手順 0 (v1 依存を 1 ファイルに寄せる) は打診より前に自発的に完了しており、v2 化は「アダプタ 1 本 + 機械変換 1 種類」。**アダプタ先行の有効性を第 3〜7 号の 5 アプリで確認**
- **既定塗りの詳細度は 0 でなければならない**: `[data-ricdom-theme]` (0,1,0) は consumer の要素セレクタ `body { background }` (0,0,1) より高く、Brownies のアプリテーマを黙って上書きしていた (theme e2e が `rgb(51,51,51)` vs `rgb(30,30,30)` で検出)。§21 で「属性セレクタ 1 つなので詳細度は低く上書きできる」と書いたのは**統括の事実誤認**。`THEME_PAINT_CSS` と `SCROLLBAR_CSS` のセレクタを `:where([data-ricdom-theme])` で包んで詳細度 0 に。**原則: ライブラリの「既定」は consumer のどんな規則にも負けることをコードで保証する** (`:where`)。`portal:empty` は既定塗りではないので対象外
- **二段階配線 (v1 の handle 生成 → 配線 → render 後付け)**: 「render 未指定なら初回描画をスキップする lenient モード」の提案は**見送り** — canon は既存の 2 つ: `options.setup`、または `createApp(target, state, () => null)` で作ってから `app.render = fn` を代入 (許可された再代入、同期描画。v1 の `shared_proxy.render` 踏襲、SPEC に一言しか無かった穴)。コアに 2 つ目の起動モードを足さない。再検討の条件: 上の 2 つでほどけない循環参照の実例
- **編集中ガード (コア規則) の帰結を FACT 化**: フォーカスを保ったままのプログラム的挿入 (貼り付けで Markdown 差し込み、DnD) は要素に対して行い (`setRangeText` / `value` + selection)、同じ値を state に写す。フォーカス中は DOM が正。ガードにより次の render は上書きしない。規則は変えない
- **`data-ricdom-role` の棚卸し**: `dialog-title` (報告) に加え `popup-trigger` / `tooltip-trigger` / `toast-msg` / `tweak-title`、dialog の自前トリガーに `button`。tweak の行ラベル等の反復装飾 span は付けない (行に `data-ricdom-tweak-key` / folder role の固有フックが既にある)。方針: **consumer が CSS / E2E で掴みたくなる構造要素にはすべて role、装飾 span には付けない**
- **`uiButton` の `variant: 'link'` 復活** (§20 の原則。v1 の正式 variant、テキスト風ボタン)。alpha.7 以前で `ghost` + 自前 class に逃げた consumer は撤去可
- docs: `children` 省略 = 空要素の grep 指針 (`ref` だけの要素、innerHTML 注入 host → `island: true`)、`tag` 必須 (v1 暗黙 div の機械変換パス) を V1_VS_V2 / TUTORIAL に
- **良かった点 (据え置き)**: page の 3 分解で Brownies の css_for 島ハックが消滅 / `use()` 忘れの即時 error / descriptor と dialog クラスの 1:1 互換で見た目回帰ゼロ / `.d.ts` が prop 名ミスを事前に止めた / `createFocusWhen` の ref 名設計
- コア未変更 (gzip 5,169B)、ui 24,509B、css 6,230B。unit 538 / browser 107。**パイロット 7 アプリで計 35 件** (第 5〜7 号 = 実装 3 + docs 4)。次のパイロット指名は規模順 Raccoon → Rancha → Brownies で受けられる旨の申し出あり

## 25. パイロット移行第 4 号 (章動減速機 設計ツール v8、classic script) からの確定事項 (2026-09-05、2.0.0-alpha.7)

- **移行実績**: v1 v0.3.37 → v2 alpha.5、**部分的** (1 機能のみ不可 = accordion を外から閉じる)。ricdom は右ペイン 1 木 (アコーディオン 5 節 + 表 2 + 散布図 SVG、部品呼び出し 251 箇所、9 部品のみ、portal 系不使用)。**アダプタ 1 ファイルが先にあった**ため機械変換は `ctx`→`children` 1 種類 295 箇所、呼び出し側は 1 文字も変えず。差分全行を逆変換して突合 (不一致 0)。テスト 1,654 件・全スイート 277 秒
- **`createAccordion` に controlled モード** (`open: Record<id, bool>` + `onToggle(id, nextOpen, nextMap)`)。**`setOpen()` は作らない** — 外部制御の canon は controlled 1 つ、`createTabs` (`active` + `onChange`) と一貫。`nextMap` は「uncontrolled ならこうなっていた」次状態 (`multi: false` なら現在の items 全 id から作った他閉じ map) で、consumer は代入するだけ。controlled + `onToggle` 未指定はクリックで何も起きない (tabs と同規則)。`isOpen(id)` は両モードで有効。v1 の `_om` 私的プロパティ直接操作の公式代替
- **`applyTheme` の無効な theme / density / fontSize を dev で `console.warn`** (有効値一覧 + 使う既定値)。挙動 (既定へのフォールバック) は変えない。consumer が `density: 'md'` (無効) を v1 から気づかず持ち越していた実例。dev ゲートは UI 側の `isDevMode` (コアへの実行時依存ゼロは維持)
- **移行ガイドの穴 (docs)**: (1) 対応表の `app.use()` セルに `setup` が無く、表どおりに書くと初回 render で未登録 error を必ず 1 回踏む → setup を明記し、v1 の state キー ↔ setup 内 use の 1 対 1 例を追加。**仕組み (未登録 = error + 未描画) は consumer も「絶対に残して」と評価、変えない** (2) `applyTheme` が塗るのは bg / fg / font-size のみ、`padding` / `overflow` / `box-sizing` は塗らない (テーマ要素 = ページ全体とは限らない) → 補償 CSS のスニペット (3) スクロールバー: 既定値は v1 v0.4.2 以降と同一、変わったのはスコープ。ただし v0.3.x からの移行者には既定値も変わって見える (v0.3.x は常時透明・hover でアクセント) と両方書く (4) 機械変換の取りこぼし 2 形 (ES2015 短縮記法 `{ …, ctx }` と後付け代入 `node.ctx =`、壊れ方は静か) と「`ctx` を使うが ricdom の木ではない vnode 層」の併存 → リポジトリ全体に変換をかけない (5) **推奨手順「まず v1 依存を 1 ファイル (アダプタ) に寄せてから移る」** — 第 3 号・第 4 号がこれで手の量を 300 行台に抑えた
- 第 4 号の「良かった点」7 件 (未登録 error / CSS 1 枚 + warn / setup / data-ricdom-role 全部品 / gap 復活 / renderNow・nextRender の契約 / エラーの「✅ 例:」) は据え置き対象
- コア未変更 (gzip 5,169B)、ui gzip 23,649→23,949B。unit 537 / browser 104。パイロット 4 アプリで計 28 件 (第 4 号 = API 1 + warn 1 + docs 5)
- **追報 (2026-09-05、alpha.7 取り込み) で第 4 号は「移行できた」に**: controlled モードで「探索で①が閉じる」が v1 と同じ挙動、**共有 URL の開閉復元まで同じ道で通った** (consumer 評: 「要望どおり setOpen を作らなかったほうが良かった例」)。density warn が 1 回出て `comfortable` に直すと無音。font-size の補償 CSS 1 行を撤去 (padding/overflow/box-sizing は「色と文字サイズは vendor、余白とはみ出しは consumer」の切り分けとして残す方針に同意)。1,658 テスト、凍結ディレクトリ変更 0、DOM 直書き 0
- **FACT 追加 (docs のみ)**: `nextMap` は直近の描画時の `open` 由来。重い再描画 (実測 227ms) の完了前の連打は落ちる (150ms 間隔 3 回で 2 回反転) — controlled の一般的性質 (React と同じ)、バグではない。SPEC に「重い画面では live な state から作り直す (`{...s.x, [id]: next}`)」を明記、TUTORIAL の例もその形に。**関数形 `(current) => nextMap` の引数追加は見送り** (consumer 自身が「docs 1 行で十分」、API を増やさない)。再検討の条件: live 値から作るのが `multi: false` で煩雑だという実害報告

## 24. パイロット移行第 3 号 (Unizon 展示ビューア、kiosk/embed、file:// 直開き) からの確定事項 (2026-09-05、2.0.0-alpha.6)

- **移行実績**: v1 v0.4.2 → v2 alpha.5。RicDOM で描くのは再生パネル 1 枚 (3D/2D は three.js / 生 SVG で非依存) という**極小利用**。前段で v1 依存を `mount_ui()` 1 関数に隔離するリファクタを v1 のまま独立コミット → v2 化は「アダプタ 2 行 + 機械変換 40 行」、計約 35 分。**検証方法 (移行前後で同じ computed style probe を全要素・両テーマで採取して比較) は他 consumer への推奨手順として採用**
- **portal の空要素が flex/grid の gap に数えられる**: コアは `portalTo` 無指定で target 末尾に portal 要素を常に置く (§3.5、変更しない)。UI CSS に `[data-ricdom-role="portal"]:empty { display: none }` を追加 (consumer 提案 (a))。子が入れば `:empty` が外れる。`display: contents` は不採用 — Electron consumer が portal の box に `-webkit-app-region: no-drag` を当てる SPEC §7 脚注と衝突し、a11y ツリーの既知の癖もある。コアのみ (UI CSS なし) の利用者は同じ 1 行を自分で入れるか `portalTo` (SPEC §7 FACT)。再検討の条件: コアのみ利用者から同じ実害報告が来たら、コア側で `hidden` の切替を実測して検討 (残り 31B)
- **`applyTheme` は `font-size` も塗る**: `[data-ricdom-theme]` の規則に `font-size: var(--ric-font-size)` を追加。§21 の bg/fg と同じ v1 `.ric-page` パリティ。「`fontSize` オプションが panel/md-pre 以外では無効」は docs からも読めない穴だった。**既存 v2 consumer の見た目が変わりうる変更** (テーマ要素直下のテキストが 16px→14px) なので CHANGELOG は Changed、移行プロンプト B-13 に追記
- **`.ric-button` の詳細度低下 (0,2,0 → 0,1,0) で consumer の CSS が初めて効くようになった**件は v2 が正しい (§9 単一クラス方針)。対応なし、注意点として記録
- 極小利用の consumer が「部品を 1 つも portal しない」「テーマ要素の直下にテキストを置く」という、フル利用の第 1・2 号では踏まない経路を通した。パイロットは用途の違うアプリで直列に回す意味の実証 (第 1 号: tweak / 第 2 号: portal 系フル / 第 3 号: 極小 + file://)
- コア未変更 (gzip 5,169B)、ricdom-ui.css 5,661→5,686B。unit 526 / browser 103。パイロット 3 アプリで計 23 件
- **追検証 (2026-09-05、alpha.6 取り込み) で第 3 号は完了**: consumer が保険 CSS と `portalTo` の回避策 2 つを撤去し、両テーマで mount / panel の幅が alpha.5 + 回避策時と完全一致 (gap 増加なし)、portal は `display: none` 幅 0、mount の font-size 16→14px (アプリ側 `0.85rem` 指定のボタンは予告どおり無変化)、機能・console 正常。回避策ゼロ

## 23. パイロット第 2 号の追報 5 (#14 実測フェーズの幅歪み) からの確定事項 (2026-09-05、2.0.0-alpha.5)

- **バグ**: popup / dropdown の「開く → `visibility: hidden` で実測 render → 幅・高さを測って再配置」フローで、実測 render の本体を `left = rect.left` (トリガー左端、`openAt` は `x`) に置いていた。本体は `position: fixed` で幅未指定 (shrink-to-fit) なので利用可能幅が `innerWidth − rect.left` に制限され、右端付近のトリガーでは中身が折り返されて `offsetWidth` が過小に測られる。その幅で右端揃えすると本体が本来より狭く、右端に余白なしで張り付く (実測: rect.left 1213.33 / 実測 224 / 本来 417 / 最終 right 1361.33)
- **修正**: 実測 render の間だけ本体を `left: margin` (8px) に置く (`measuringLeft()` を `popupPosition.ts` に新設、dropdown・popup トリガー経路・`openAt` の 3 箇所で共有)。測った幅が「viewport に収まる最大幅」と一致するので、既存の `computeAnchoredLeft` → `clampLeft` は無変更で正しく効く。`width: max-content` 方式は不採用 (viewport より広いコンテンツで clamp 後の折り返し幅と食い違う)
- **テスト (観測結果を assert)**: 右端密着トリガーから開いた本体の `offsetWidth` が、左端トリガーで開いた同内容の幅と一致 (±2px)、かつ right ≤ innerWidth − 8。dropdown / popup トリガー / `openAt` の 3 経路 + portalContract の横断版。**修正前に赤 (dropdown 132px 過小、popup 30px 過小) → 修正後に緑**を統括も独立に再現
- 判明した周辺事実: vitest browser の実 viewport は 414×896 (想定より狭い)。再現テキストは自然幅がそれに収まる長さにする。幅が viewport 幅とほぼ等しいコンテンツでは `clampLeft` の左右 margin を両立できない (別件、実害報告なし、記録のみ)
- consumer 側 E2E の「1px 許容」は端数ではなく本症状 (右端密着) を通していた → alpha.5 取り込み後に許容を外して `right ≤ innerWidth − 8` に戻してもらう
- コア未変更 (gzip 5,169B)。unit 526 / browser 96。第 2 号は初報 10 + 追報 6 = **16 件**

## 21. パイロット第 2 号の追報 (alpha.2 取り込み後の実機 4 件 + テスト戦略) からの確定事項 (2026-09-04、2.0.0-alpha.3)

- **alpha.2 の裏取り**: 回避策 4 つ (空振り renderNow / 構造セレクタ / align-items 上書き / focus_when 手動再現) を consumer が撤去し、公式 API だけで表現できたことを確認。`focus_when` の使用箇所は 4→1 の訂正あり (grep の出現数と呼び出し数の区別)。設計判断への影響なし
- **`.ric-dropdown__body` に `position: fixed`** (createDropdown 新設時からの欠落。alpha.2 の退行ではない)。popup 側にはあった — 同種の部品の CSS は**共通コントラクトテストで揃える** (下記)
- **popup は menuitem の活性化で閉じる** (既定、APG menu button)。`closeOnSelect: false` で opt-out (チェック型メニュー)。実装は項目の `onclick` を包む方式 — body の click 監視だと consumer の `stopPropagation()` で閉じなくなるため。`disabled` / `aria-disabled="true"` / `role` を menuitem 以外に上書きした項目は活性化とみなさない。v1 パリティでもある
- **`[data-ricdom-theme]` 自身に bg/fg を塗る** (v1 `.ric-page` パリティ)。子孫セレクタは付けない (consumer 要素の背景を勝手に上書きしない)。属性セレクタ 1 つで詳細度を低く保ち、上書きで opt-out できることを FACT 化
- **dialog の初期フォーカス**: 「既に dialog 内にフォーカスがあれば何もしない」→ `[autofocus]` 優先 → 最初の focusable → root。**`DialogProps.initialFocus` は新設しない** — `autofocus: true` と `createFocusWhen` で表現でき、3 つ目を足すと canon が割れる。再検討の条件: 「フォーカス先が開くたびに動的に変わり、createFocusWhen の条件式でも書けない」実例
- **テスト方針の転換 (consumer の診断を採用)**: alpha.2 までのテストは「部品内部の決定 (class 名・inline 値)」を assert しており、「利用者が観測する結果 (どこに出る・何にフォーカスがあるか・閉じたか)」を見ていなかった。#9〜#12 はすべてその隙間から出た。以後の実ブラウザテストは観測結果を assert する:
  - `portalContract.test.ts`: popup / dropdown / tooltip / toast / dialog をパラメタライズ (rect が viewport 内、computed `position: fixed`、flex 縦並び target で兄弟の rect が動かない、トリガーから 32px 以内)
  - 「落ち着いた後」で assert する: animationend / 700ms バックストップを持つ処理は、必ずその時刻より**後** (800ms) で判定する
  - `applyTheme` は computed `background-color` / `color` で判定 (変数値ではなく)
  - `scripts/examplesSmoke.mjs` (`npm run test:examples`、CI 追加): examples/*.html を実ブラウザで開き console/pageerror 0、`aria-haspopup` トリガーを順に開いて rect 確認・Esc で閉じる
- 「テストが実装と同じメンタルモデルで書かれる以上、盲点は共有される」— **パイロットの実機が最終審査**という運用は維持し、上記でその一部を CI へ前倒しする
- **既知の未対応 (テスト作成中に露出)**: `createTooltip` に横方向の viewport clamp が無い (トリガーが端に密着すると切れる)。今回の報告対象外なので手を入れず記録のみ。対応の条件: consumer からの実害報告、または次に tooltip に触る変更のとき `computeAnchoredLeft` を流用して揃える
- **docs の穴を解消**: SPEC §10.3.3 に `createTabs` / `createSplitter` / `createScrollPane` / `createCollapseBox` / `createAccordion` の部品表を追加 (§20 で記録した穴)
- コア未変更 (gzip 5,107B)。unit 516 / browser 91 / examples 6 ページ

## 20. パイロット移行第 2 号 (Trend Guard、Electron) からの確定事項 (2026-09-04、2.0.0-alpha.2)

- **移行実績**: v1 v0.4.2 → v2 `916a61c`、Electron 42 / DPI 150%。20 ファイル +806/-711、機械変換 150〜200 行、部品の `setup`/parts 化 313 行、AI 1 セッション約 30 分。第 1 号で入れた `setup` が第 2 号の所要を直接短縮した (パイロットを直列に回す意味の実証)
- **popup/dropdown のトリガー経路の横位置**: `computeAnchoredLeft(rect, width)` = 「`rect.left` に収まればそのまま → 収まらなければトリガー右端揃え (`rect.right - width`) → それでも負なら clamp」を popup・dropdown・`openAt` で共有。§15 の再検討条件 (「右端トリガーで左に展開してほしい」実害) が来たので、v1 の論理コンテナ・ヒューリスティックではなく**右端揃えフォールバック**で解消 (viewport 基準は維持)
- **portal 内 `ref`**: `registerRefs` は portal patch の**後**、`target` と `portalTo` の両方から収集 (コア修正。gzip 5,107B、天井まで 13B — コアはこれで本当に打ち止め)
- **v1 で正式 prop だったものは復活が原則** (`uiRow`/`uiCol` の `gap`)。rest スプレッド契約は「未知 prop を属性に流す」ため、廃止した prop は黙って崩れる — 廃止するなら V1_VS_V2 に明記し、原則は復活
- 部品側の `class` 取り扱いはコアと同じ正規化 (`mergeClass`) を使う。string 判定の握りつぶしは禁止
- `.ric-popup__item` は `align-items:center; gap: var(--ric-gap)` (専用トークン `--ric-gap-sm` は作らない、既存トークンを使う)
- portal 系サブパーツにも `data-ricdom-role` (dialog-overlay/header/body/footer/close、popup-overlay、toast-item/close)。**クラス名は据え置き対象と明言しない** (role が公式フック)
- `createPopup` の `trigger` は `RicNode | { icon, label, ghost, size, class, style }` の 2 形 (`tag` キーの有無で判別)。`createDropdown` は既存の top-level `label/icon/ghost` があるため object 形を**追加しない** (canon 1 つ)
- `createTabs`: 全 item に `children` が無ければ tabpanel も `aria-controls` も描かない (セグメントコントロール用途)
- **`createFocusWhen`** (v1 `focus_when` 後継): `use()` 部品、`fw(refName, condition)` を render 内で呼ぶ、false→true の立ち上がりで当該 render 完了後に focus。「render 中に `nextRender()` を呼ぶとその render の完了で resolve する」契約を利用
- **Electron FACT**: portal 要素に `-webkit-app-region: no-drag` が要る (SPEC §7 脚注)
- **docs の穴 (要フォローアップ)**: SPEC に `createTabs` / `createSplitter` / `createScrollPane` / `createCollapseBox` / `createAccordion` の部品表が無い (Phase 3b の部品群)。alpha.3 の docs 整備で追加する

## 19. パイロット移行第 1 号 (歯車DXFジェネレーター) からの確定事項 (2026-09-03、2.0.0-alpha.1)

- **移行実績**: v1 v0.4.2 → v2 `a2f444e`、機能フル動作。機械変換 ~450 行 (ctx→children 73 箇所、関数名 11 種 40 箇所、handle→app 35 箇所)、手動 150〜180 行。歯形エンジン (変更禁止ゾーン) は無変更 = 「UI 層だけ差し替えられる」設計が実証された
- **API の穴 3 件を採用**: ① `TweakKeyOverride` に `get` / `set` (data に無い計算値の行を keys だけで宣言可、v1 `ui_tweak_row` 相当) + フォルダ単位 `rows` ②全 leaf row に `data-ricdom-role="tweak-row"` + `data-ricdom-tweak-key` (checkbox 行にラベル span が無いことは FACT) ③ `uiButton({ size })` (v1 parity)
- **dialog のフォーカス復帰**: 既定は APG (開く前の activeElement へ) を維持。`returnFocus: false | Element` で無効化/明示指定。「フォーカス不可能な起動元 → 直前の入力欄に着地 → アプリの document 直付け focusin 監視が誤発火」は consumer 側の相互作用として SPEC に FACT
- **`createApp(..., { setup(app) })`**: 初回同期描画の直前に 1 回呼ばれ、中で `app.use()` した部品を初回 render から使える (「プレースホルダ + renderNow の 2 段構え」を不要に)。TUTORIAL/examples はこのパターンに統一。**コア gzip 5,097B (天井まで 23B)** — setup 実装は 61B に圧縮した (naive 実装は天井超え)。**以後コアは完全凍結**: 追加が要る場合は同量以上の削減とセット
- **相互作用 FACT**: hidden タブでは rAF に加え setTimeout も ~1s に throttle されるためバックストップも遅れる (v1 と同じ)。即時反映が要るテストは `renderNow()`
- **良かった点として確認された v1 継承の性質**: `App<S>` の代入操作感、NOOP の壊れ方 (console.error だけで白画面にならない → 原因特定が速い)、tweak の `tw({...})` 毎 render 契約、クラス名 (`.ric-tweak-row__label` 等) の据え置き、`DialogProps.width`、MIT

## 18. Phase 4a (docs) での確定事項 (2026-09-02)

- 内部記録 (本設計書・API_AUDIT) は「内部記録」注記を付けて**公開リポジトリに残す** (OSS の ADR と同じ扱い。AI 統括の関与は Co-Authored-By で透明)。利用者向け docs (README / SPEC / TUTORIAL / CHANGELOG / CONTRIBUTING) には制作過程語を入れない
- README の部品数は実数を書く (FACT 方針)。CHANGELOG の未公開版は「not yet published」と明記し日付を捏造しない
- README の Quick start は render 内で引数 `s` を使う例に統一 (「元 state を直接変えても反応しない」FACT と一貫)

## 17. Phase 3d (API 整合レビュー) での確定事項 (2026-09-02)

- 監査結果は `docs/API_AUDIT.ja.md`。命名逸脱 1 (内部関数、許容)、型重複 1 (`IconDescriptor` に一本化済み、`ricdom/ui` → `ricdom/icons` は type-only import)、dead code 2 (削除済み)、公開関数 29 に JSDoc 補完済み。flake 3 連走ゼロ
- **ソース内の「Phase N」言及 (ファイルヘッダ約 75 箇所) は Phase 4a で全て除去する**。公開リポジトリのコメントは「このコードは何をするか・なぜそうなっているか」を語り、制作履歴は CHANGELOG と git log に置く (監査エージェントは「履歴として有用」と保留したが、v1 で確立した「コメントは次の読者のためのもの」原則を優先)
- **portal 系部品 (dialog/popup/toast/tooltip/dropdown) の portal ルート要素にも `data-ricdom-role` を付与する** (§14 の全部品方針との整合。DOM 出力の追加変更だが破壊的ではなく、E2E の安定セレクタとして価値がある)。Phase 4a で追補 + テスト
- `Host.app: App<any>` は §13 の判断を維持 (コード内に理由コメントあり)

## 16. Phase 3c 実装での確定事項 (2026-09-02)

- `createTweakPanel` は **1 部品** (v1 の create_ui_tweak_panel / ui_tweak_row / folder を統合)。Tier1 `data` / Tier2 `keys` / Tier3 `rows`。v1 の「keys を関数で渡す動的再評価」「keys[k] を vdom 丸ごと差し替え」は Tier3 `rows` で代替できるため持たない
- tweak の **radiobutton 行は `<fieldset><legend>`** (複数 input を `<label>` で包むのは HTML 的に不正。§3c 指示の「各行は label で結合」は単一 input 行に限る、と読み替える)
- **number 行の編集中ガードはコアの規則が肩代わり** (部品側の focus マーカーは無い)。v1 v0.3.37 の小数点ドロップが構造的に消えていることを browser テストで実証済み。blur 時の min/max clamp + `set()` は部品の責務
- `IconDescriptor` 型は `ricdom/icons` で独立宣言 (`ricdom/ui` の `UiIconDescriptor` と構造同一)。**`ricdom/icons` は `ricdom/ui` にも依存しない** (アイコンデータだけを使う consumer を想定)。両型の一本化は Phase 3d の API 整合レビューで検討
- 同梱 36 アイコンのうち Lucide 由来は `contrast` のみ (v1 ATTRIBUTION 継承)。`settings` 等は同梱せず CLI の Lucide 取得で対応 (「使う分だけ」哲学)
- CLI は lib (`ricdomIconLib.ts`、`lucideFetcher` 注入でネット無しテスト可) + entry の 2 層。v1 より testability を上げた追加であり機能パリティは維持

## 15. Phase 3b 実装での確定事項 (2026-09-02)

- `createCollapseBox` の完了検知は **`transitionend` + 700ms バックストップ** (高さは per-instance の動的値で `@keyframes` では表現できないため。§13 の「animationend」は「CSS のアニメ完了イベント + バックストップ」の総称として読む)。ヘッドレス部品なので `aria-expanded` は呼び出し側のトリガーが持ち、`idFor(key)` で `aria-controls` を結ぶ
- `createSplitter`: render props は `side` / `main` にノードを直接渡す (v1 の `{ctx}` ラッパーは廃止)。**矢印キーでのリサイズ (10px、`onResizeEnd` は押下ごと)** は v2 新規。`max` が null なら `aria-valuemax` を省略
- `createTabs`: **automatic activation** (矢印キー移動で即切替、APG の両方式のうち一般的な方)。v1 の `bind_tabs` は uncontrolled モードが代替するため復活させない
- `createDropdown`: トリガーは `aria-haspopup="dialog"` (汎用 Popover の APG 上の最近傍値)。v1 の `_get_expand_ref` (論理コンテナ基準の展開方向ヒューリスティック) は移植せず、viewport 基準の flip + clamp で統一 (Phase 2 と同じ簡素化)。再検討条件: 「広い行の右端トリガーで左に展開してほしい」類の実害報告
- 排他制御は **app 単位の 1 レジストリを popup と dropdown で共有** (v1 の単一 registry を app スコープにしたもの、dispose で解除)
- **accordion の閉じたパネルは `hidden` 属性を付けて a11y ツリーから除外する** (`role="region"` を全パネルに付ける実装のままだと閉じたパネルがランドマークノイズになる → Phase 3c で追補)
- CSS 微差 (dropdown trigger の `width:auto`、splitter ボタン hover の共通トークン化) は v2 の判断を正とする
- **FACT (docs へ)**: `createApp(target, state, render)` に渡した **元の `state` オブジェクトを直接変更しても再描画されない**。反応するのは戻り値の `app` と render の引数 `s` (= Proxy) だけ。Phase 3a のデモで実際に踏んだ罠 (v1 でも同じ)。TUTORIAL の最初の章と型ドキュメントに明記し、dev モードで検知できる方法があれば Phase 4 で検討 (元オブジェクトの参照を差し替えられないため現時点では docs で対処)

---

## 付録

### A. 競合比較 (2026-09 調査)

| ライブラリ | UI ツリー記法 | リアクティビティ | gzip | ビルド不要 | TS 型 | 導線 |
|---|---|---|---|---|---|---|
| VanJS | 関数呼び出し `tags.div(...)` | 独自 state (`.val`) | ~1KB | 可 | あり | npm/CDN |
| Alpine.js | HTML 属性 (`x-data`) | Proxy | 7〜15KB | 可 | 限定的 | CDN 中心 |
| petite-vue | HTML 属性 (`v-` / `@` / `:`) | Vue3 型 Proxy | ~6KB | 可 | あり | CDN |
| htmx | HTML 属性 (`hx-*`) | なし (サーバー主導) | ~14KB | 可 | 補助的 | CDN/npm |
| Lit | タグ付きテンプレート + Web Components | `@property` 宣言 | 5〜6KB | 概ね可 | 一級 | npm/CDN |
| Preact + htm | タグ付きテンプレート | VDOM 差分 (+Signals) | ~4KB | 可 | あり | npm/CDN |
| Solid.js | JSX | signal (VDOM なし) | ~7.6KB | **不可** | 一級 | npm |
| Mithril | `m(sel, attrs, children)` → vnode | VDOM 差分、手動 redraw | ~8.8KB | 可 | 同梱 | npm/CDN |
| **RicDOM 2** | **plain object 手書き** | **Proxy (浅い + dev 警告)** | 目標 ≤ 5KB (コア) | 可 | 一級 | npm/jsDelivr |

近縁: JsonML (静的表現のみ)、Mithril vnode (`m()` の戻り値)、json-render 系 (React 前提の Schema 生成)。「手書き JSON 木 + Proxy + ビルド不要」の組み合わせは不在。

### B. v1 から引き継ぐ契約・FACT (棚卸し §A、20 件)

| # | 契約 | 由来 | v2 での扱い |
|---|---|---|---|
| A1 | 2 rAF ルール (DOM commit ≠ layout/paint) | ブラウザ仕様 | FACT として継承 |
| A2 | `render_now` / `next_render` の対 | Potopeta の flaky E2E 決定論化 | `renderNow` / `nextRender` |
| A3 | FORCE_REAPPLY (value/checked/selected/scroll) | TrendGuard、controlled drift | 継承 + §3.2 の編集中ガードで補完 |
| A4 | select の value/option 構築順対策 | 設計OS 第 2 信 | 継承 (DOM 制約) |
| A5 | key ベース reconciliation | TrendGuard | 継承、key 型を絞る |
| A6 | rAF + setTimeout バックストップ | Unizon kiosk (重大) | 継承 (Electron/kiosk 必須) |
| A7 | controlled input の編集中ガード | 歯車DXF | **コア規則に一般化** (§3.2) |
| A8 | 内部イベント → 再描画の仕組みの必要性 | 全部品 | 必要性は継承、方式は `use()` に (§3.4) |
| A9 | throw しない・NOOP | AI 協働前提 | **型付き NOOP** に再定義 (§3.6) |
| A10 | 浅い Proxy + shallow copy canon | 10KB コア | 継承 + dev 検知 (§3.3) |
| A11 | diff 対象外の島 | canvas 保護の転用 | **明示フラグ化を推奨** (§3.1) |
| A12 | css_for 3 点セット | 展示ビューア | `applyTheme` 1 関数 + CSS 1 枚に統合 (§4) |
| A13 | portal は最深 page 直下 | stacking context 回避 | 「自分の app の portal」に置換 (§3.5) |
| A14 | `data-*-role` 安定セレクタ | E2E/CSS カスタマイズ | 継承、列挙型化 |
| A15 | rest スプレッド契約 + 内部 input 隔離 | ui_button/ui_input 回帰 | 継承、型で「計算済み上書き不可」 |
| A16 | `:active` は translate | Rancha の transform 衝突 | 継承 |
| A17 | アイコン手書き禁止 + CLI | LCP 中心円欠落 | 継承、名前を Union 型に |
| A18 | `on_close(reason)` | 誤クローズ防止 | 継承、portal 系全体へ展開 |
| A19 | 「DOM 直書き = API の穴のシグナル」 | Trend Guard | 設計プロセスの原則として継承 |
| A20 | controlled / uncontrolled 二重モード | 11 consumer が使用 | 継承 |

### C. v1 設計負債と解消方針 (棚卸し §B、16 件 + 見送り再評価)

| # | 負債 | 根因 | v2 解消 |
|---|---|---|---|
| B1 | `__notify` 暗黙注入・state 配置制約 | set trap の副作用で実現、型で検出不能 | `app.use()` 明示登録 (§3.4) |
| B2 | portal と page の結合 | 単一グローバルバッファを page が drain | mount 単位 portal ホスト + `portalTo` (§3.5) |
| B3 | portal の SPEC と実装の乖離 | docs ドリフト | 型 + ブラウザテストを spec の単一ソース |
| B4 | per-instance CSS 収集の無装飾 silent failure | 収集漏れ = 即無装飾、テストは通る | CSS 1 枚配布 (§4) |
| B5 | 浅い Proxy の未追跡代入が無警告 | 検知機構なし | dev 警告 (§3.3) |
| B6 | DOM 直書きの上書き | 公式 API の穴 | 島の明示フラグ + `use()` で意図的 imperative 領域を型で区別 |
| B7 | a11y 不在 | 設計目標外 | §5 |
| B8 | jsdom のみ | 実ブラウザ CI なし | §7 |
| B9 | CJS のみ | — | ESM/CJS/IIFE (§6) |
| B10 | 命名 (snake_case / `ctx` / 例外 PascalCase) | — | camelCase / `children` (決定) |
| B11 | 日本語のみ | — | 英語正 (§8) |
| B12 | 型定義なし | JSDoc は日本語散文 | TS でゼロから (決定) |
| B13 | `_popup_registry` 無制限成長 | 削除 API なし | `use()` の dispose / WeakRef |
| B14 | NOOP_PROXY の型付け不能 | `any` 化 | 型付き NOOP (§3.6) |
| B15 | checked/selected の boolean/number 内部漏れ | 実装詳細が暗黙知 | 型で吸収 |
| B16 | 「ビルド不要 10KB」と TS 化の緊張 | 哲学の定義が制作側/利用側で未分離 | **利用側ビルド不要**として再定義 (G1) |

見送り案件の再評価: `portal_to` → §3.5 で最初から採用 / ESM → 自動解消 / watch・effect → 「宣言的 render + 明示的副作用」原則は維持、型安全な effect は Phase 3 以降で再検討 / audit_unstyled → CSS 1 枚配布で問題自体が消滅 / camelCase → 決定 / 同梱アイコン方針 → 維持 + Union 型 / 自前スクロールバー → 優先度低、標準スクロールバー API として再設計余地。

### D. 移行で壊れる点 (棚卸し §C)

| 領域 | 壊れ方 | 対応 |
|---|---|---|
| JSON 木の形 | `ctx`→`children`、style 3 形態 → object、snake_case → camelCase | **自動変換ツール** (機械的) |
| 部品の置き場所 | `s.x = create_ui_x()` → `app.use(createX())` | 手動 (最大の破壊点、移行ガイド) |
| テーマ API | `--ric-*` flat object の形、export_theme 系 | 対応表 + 手動 |
| アイコン descriptor | `{ v?, s?, p }` | **そのまま** (低コスト) |
| CLI | `ricdom-icon` / `ricdom-lz` | インターフェース維持、配置変更のみ確認 |
| portal 系 | popup/dialog/toast/tooltip の API 変更 | 手動 |
| ビルド有無 | Potopeta / 展示ビューアは「ビルド不要」が採用理由 | 「利用側は IIFE 1 本で不変」を個別説明 |

全 11 consumer が同一組織内のため、外部向け後方互換保証の優先度は低い。「純粋ノードの自動変換 + 個別移行ガイド」が現実的な着地。

### E. 配布・CI・a11y の標準形 (2026-09 調査)

**パッケージ**: `"type": "module"` + `exports` 条件分岐 (`import` → `.mjs` + `.d.mts`、`require` → `.cjs` + `.d.cts`)。ビルドは **tsup** (esbuild ベース、ESM/CJS/IIFE + 単一 d.ts を一括生成)。Electron 旧版 consumer のため当面は ESM/CJS 両方。

**CDN**: **jsDelivr** を正。README 冒頭に `<script src="https://cdn.jsdelivr.net/npm/<pkg>@1/dist/<pkg>.iife.min.js">` と `import … from 'https://esm.sh/<pkg>@1'` を並記。

**信頼シグナル**: Actions バッジ / CHANGELOG (Keep a Changelog) / Conventional Commits / CONTRIBUTING / CODE_OF_CONDUCT / SECURITY.md。

**実ブラウザテスト**: **Vitest browser mode (Playwright provider)**。Actions 最小構成: `setup-node` → `npm ci` → `npx playwright install --with-deps` → `vitest run --browser`。

**a11y 最低線 (WAI-ARIA APG)**: dialog (`role="dialog"` + `aria-modal` + labelledby/describedby、focus trap、Esc 復帰、背景 `inert`) / menu (`aria-haspopup` + `aria-expanded`、`role="menu"`/`menuitem`、矢印・Home/End・Esc、Tab 停止点 1 つ) / tabs (`tablist`/`tab`/`tabpanel`、roving tabindex) / toast (`role="status"` polite、緊急は `alert`、フォーカスを奪わない)。

**命名**: create / mount / render / bind / use。子要素キーは `children` (確定)。
