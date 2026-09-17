# ricdom

[![CI](https://github.com/miyoshi-tec/ricdom/actions/workflows/ci.yml/badge.svg)](https://github.com/miyoshi-tec/ricdom/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**UI をオブジェクトで書く。state に代入する。実 DOM が更新される。**

- **オブジェクトで書く UI ツリー。** JSX もテンプレートコンパイラも専用構文も不要 —
  コンポーネントはただのオブジェクトリテラル (`{ tag: 'div', children: [...] }`) で、
  最初から最後まで型が付く。
- **儀式のいらない Proxy state。** `app.count += 1` で再描画される。ストアもリデューサも
  手書きの購読も不要。
- **利用側にビルド不要。** `<script>` 1 本、または `import` 1 本で動く — TypeScript は
  *ricdom 自身* を作るための道具であり、利用者に強制するものではない。

English version: [README.md](README.md)

## Quick start

```html
<script src="https://cdn.jsdelivr.net/npm/ricdom@2/dist/ricdom.iife.min.js"></script>
<div id="app"></div>
<script>
  ricdom.createApp('#app', { count: 0 }, (s) => ({
    tag: 'div',
    children: [
      { tag: 'button', onclick: () => { s.count -= 1; }, children: ['-'] },
      { tag: 'output', children: [String(s.count)] },
      { tag: 'button', onclick: () => { s.count += 1; }, children: ['+'] },
    ],
  }));
</script>
```

ネイティブ ESM / バンドラー経由なら:

```js
import { createApp } from 'https://esm.sh/ricdom@2';
```

開発中は `dist/ricdom.iife.min.js` の代わりに `dist/ricdom.iife.js` (非 minify、dev 警告あり) を、
配布には `.iife.min.js` を使ってください。

## 競合との位置づけ

| | UI ツリー記法 | リアクティビティ | gzip | ビルド不要 | TS 型 | 導線 |
|---|---|---|---|---|---|---|
| VanJS | 関数呼び出し (`tags.div(...)`) | 独自 state (`.val`) | ~1KB | 可 | あり | npm/CDN |
| Alpine.js | HTML 属性 (`x-data`) | Proxy | 7〜15KB | 可 | 限定的 | CDN 中心 |
| petite-vue | HTML 属性 (`v-`/`@`/`:`) | Vue3 型 Proxy | ~6KB | 可 | あり | CDN |
| htmx | HTML 属性 (`hx-*`) | なし (サーバー主導) | ~14KB | 可 | 補助的 | CDN/npm |
| Lit | タグ付きテンプレート + Web Components | `@property` 宣言 | 5〜6KB | 概ね可 | 一級 | npm/CDN |
| Preact + htm | タグ付きテンプレート | VDOM 差分 (+Signals) | ~4KB | 可 | あり | npm/CDN |
| Solid.js | JSX | signal (VDOM なし) | ~7.6KB | **不可** | 一級 | npm |
| Mithril | `m(sel, attrs, children)` → vnode | VDOM 差分、手動 redraw | ~8.8KB | 可 | 同梱 | npm/CDN |
| **ricdom** | **手書き plain object** | **Proxy (浅い + dev 警告)** | **≤ 5.1KB (コア)** | 可 | 一級 | npm/jsDelivr |

「手書きの plain object ツリー × Proxy 再描画 × 利用側ビルド不要」を同時に満たす
組み合わせは、この領域では他に見当たらない。

## 中身

- **`ricdom`** — コア: plain object のツリー → 実 DOM、浅い Proxy によるリアクティビティ、
  rAF + タイムアウトのバックストップを持つ描画スケジューラ、外部管理サブツリー用の島。
  コアバンドルは gzip ≤ 5,200B。
- **`ricdom/ui`** — 29 部品 (ボタン・入力・レイアウト・Markdown/コード表示・dialog・
  popup・toast・tooltip・dropdown・splitter・tabs・accordion・dat.GUI 風パラメータ調整
  パネル 他)。それぞれが後付けではない本物の WAI-ARIA APG アクセシビリティ契約
  (focus trap・roving tabindex・キーボード操作) を持ち、CSS は 1 ファイル
  (`ricdom-ui.css`) として配布される。テーマは 7 種 (Electron の透明ウィンドウ向けの
  フロストガラス風テーマを含む)。
- **`ricdom/icons`** + `ricdom-icon` CLI — 少数の同梱アイコンセットを tree-shakable な
  named export として提供し、CLI で任意の [Lucide](https://lucide.dev/) アイコンを
  その場で取得・変換できる。アイコンの path データを手書きすることは想定していない。
- **`ricdom/md-editor`** — opt-in の別サブパス (独自 IIFE、`ricdom/ui` のバンドルには
  含まれない)。`createMdEditor()` は入力しながら Markdown 構文を色分け表示する
  `uiTextarea`。
- 意図的に同梱しないもの: LZ 自己展開版。gzip の無い環境で単一ファイル配布したい場合は
  MIT の別ツール [ricdom-lz](https://github.com/miyoshi-tec/ricdom-lz) を使う (CSP に
  `'unsafe-eval'` が必要。IIFE は `globalThis.ricdom` / `ricdomUI` を明示代入するので
  関数スコープの `eval` でも global が立つ)。

## 現在の状態

`2.0.0-alpha` — API は確定し活発にテスト中、npm には未公開。alpha ごとに annotated tag
(`v2.0.0-alpha.N`) を打っているので、npm 公開までは tag で pin して `npm ci && npm run build` で
`dist/` を生成してください。

本パッケージは [RicDOM v1](https://github.com/miyoshi-tec/RicDOM-v1) (現在は保守モード)
の後継として、TypeScript・camelCase API・本物のアクセシビリティ・ブラウザテスト付き
CI パイプラインで一から作り直したもの。v1 とのソース互換性は無い — 既存 v1 アプリを
移行する場合の破壊的変更は [CHANGELOG.md](CHANGELOG.md) を参照。

ライセンス: [MIT](LICENSE)。同梱アイコンの一部は Lucide (ISC) 由来 →
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 詳しく知る

- [docs/TUTORIAL.md](docs/TUTORIAL.md) — 10 章構成、コード先行のチュートリアル (英語)
- [docs/SPEC.md](docs/SPEC.md) — 契約全体: 差分パッチの規則・リアクティビティ・各部品の
  props と ARIA 契約 (英語)
- [examples/](examples/index.html) — ビルド不要のデモ 7 本
- [CHANGELOG.md](CHANGELOG.md) — リリース履歴
- [CONTRIBUTING.md](CONTRIBUTING.md) — ricdom 自体の開発 (英語)
