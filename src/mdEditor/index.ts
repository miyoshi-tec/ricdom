// ricdom/md-editor — 公開エントリポイント (opt-in サブパス)
//
// `ricdom/ui` の一部としてではなく、独立したサブパスとして配布する (設計上の理由:
// パイロット第 5 号 = Raccoon Memo 以外の consumer はこの機能を一切必要としないため、
// `ricdom/ui` を読み込むだけの既存 consumer のバンドルサイズに一切影響を与えない —
// tsup.config.ts の md-editor 専用エントリ、`dist/ricdom-ui.iife.min.js` には
// createMdEditor/tokenizeMarkdown のコードは含まれない)。
//
// IIFE ビルド (dist/ricdom-md-editor.iife.min.js) はここから globalName `ricdomMdEditor`
// として公開される。tsup は uiTextarea/internal ヘルパーの実装をそのままバンドルするため
// (ricdom/ui を external 化しない)、この IIFE 単体で createMdEditor が動く — ただし
// CSS (`.ric-md-editor`/`.ric-textarea` 等) は `ricdom-ui.css` 側にしか無いので、見た目を
// 出すには結局 `ricdom-ui.css` の読み込みが要る。examples/md-editor.html は
// `ricdom` → `ricdom-ui` → `ricdom-md-editor` の順に読む構成にしてあるが、これは
// 「同じページで他の ricdom/ui 部品も使う」典型的な consumer 構成を示すためで、
// md-editor 単体使用時の技術的な必須順序ではない。

export { createMdEditor } from './mdEditor.js';
export type { MdEditorProps, MdEditorInstance } from './mdEditor.js';

export { tokenizeMarkdown } from './tokenizer.js';
export type { MdToken } from './tokenizer.js';
