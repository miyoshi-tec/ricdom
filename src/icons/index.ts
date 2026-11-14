// ricdom/icons — 同梱アイコンデータ
//
// v1 (docs/icons/icons.json、36 個) の TS 化。設計書付録 B A17「アイコン手書き禁止 + CLI」
// の「データ層」部分 — 各アイコンは個別の named export (tree-shakable。バンドラは
// `import { check } from 'ricdom/icons'` で使わない他 35 個を drop できる)。
//
// AI エージェントへ: このファイルの内容 (path データ) を記憶から書き写して別の場所に
// 複製しないこと。使うときは `import { xxx } from 'ricdom/icons'` するか、
// `npx ricdom-icon <name>` で取得する (uiIcon の JSDoc、README 参照)。
//
// 命名: Lucide 由来のケバブケース名 (例 'refresh-cw') を camelCase にしたものを
// export 名にする (例 `refreshCw`)。元のケバブ名は `ICON_NAMES` (camelCase → kebab) で
// 引ける — CLI の検索・`--names` 一覧、および `npx ricdom-icon <kebab-name>` との
// 対応付けに使う。
//
// 帰属: このセットの大半は RicDOM オリジナルの単純幾何アイコン (Lucide 互換スタイル)。
// `contrast` のみ Lucide (ISC) から `ricdom-icon` CLI で取得した実物 (下記コメント参照)。
// ライセンス全文は THIRD_PARTY_NOTICES.md (リポジトリ直下) を参照。

import type { IconDescriptor } from './types.js';

export type { IconDescriptor } from './types.js';
export { svgToDescriptor } from './svgToDescriptor.js';

export const arrowDown: IconDescriptor = { p: 'M12 5v14M19 12l-7 7-7-7' };
export const arrowLeft: IconDescriptor = { p: 'M19 12H5M12 19l-7-7 7-7' };
export const arrowRight: IconDescriptor = { p: 'M5 12h14M12 5l7 7-7 7' };
export const arrowUp: IconDescriptor = { p: 'M12 19V5M5 12l7-7 7 7' };
export const arrowUpDown: IconDescriptor = { p: 'M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4' };
export const check: IconDescriptor = { p: 'M20 6 9 17l-5-5' };
export const chevronDown: IconDescriptor = { p: 'm6 9 6 6 6-6' };
export const chevronLeft: IconDescriptor = { p: 'm15 18-6-6 6-6' };
export const chevronRight: IconDescriptor = { p: 'm9 18 6-6-6-6' };
export const chevronUp: IconDescriptor = { p: 'm18 15-6-6-6 6' };
export const circleCheck: IconDescriptor = { p: ['M12 22a10 10 0 1 0 0-20 10 10 0 1 0 0 20z', 'm9 12 2 2 4-4'] };
export const circleDot: IconDescriptor = { s: null, p: 'M12 6a6 6 0 1 0 0 12 6 6 0 1 0 0-12z' };
export const circleX: IconDescriptor = { p: ['M12 22a10 10 0 1 0 0-20 10 10 0 1 0 0 20z', 'm15 9-6 6', 'm9 9 6 6'] };
// contrast: Lucide (ISC) 由来。`ricdom-icon contrast --json` (v1) で取得・path 化したもの
// (THIRD_PARTY_NOTICES.md 参照)。他のアイコンと違い RicDOM オリジナルではない。
export const contrast: IconDescriptor = { p: ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0z', 'M12 18a6 6 0 0 0 0-12v12z'] };
export const download: IconDescriptor = { p: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' };
export const externalLink: IconDescriptor = { p: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'] };
export const eye: IconDescriptor = { p: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 1 0 0 6z'] };
export const info: IconDescriptor = { p: ['M12 22a10 10 0 1 0 0-20 10 10 0 1 0 0 20z', 'M12 16v-4', 'M12 8h.01'] };
export const loader: IconDescriptor = { p: 'M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1' };
export const menu: IconDescriptor = { p: 'M4 6h16M4 12h16M4 18h16' };
export const minus: IconDescriptor = { p: 'M5 12h14' };
export const moreHorizontal: IconDescriptor = { p: 'M5 12h.01M12 12h.01M19 12h.01' };
export const moreVertical: IconDescriptor = { p: 'M12 5h.01M12 12h.01M12 19h.01' };
export const pencil: IconDescriptor = { p: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z' };
export const play: IconDescriptor = { p: 'M8 5.1 18.5 11.3a.8 .8 0 0 1 0 1.4L8 18.9a.8 .8 0 0 1-1.2-.7V5.8A.8 .8 0 0 1 8 5.1z' };
export const plus: IconDescriptor = { p: 'M12 5v14M5 12h14' };
export const search: IconDescriptor = { p: ['M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', 'm21 21-5-5'] };
export const send: IconDescriptor = { p: 'M22 2 11 13M22 2l-7 20-4-9-9-4z' };
export const square: IconDescriptor = { p: 'M4 4h16v16H4z' };
export const trash2: IconDescriptor = { p: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6' };
export const triangleAlert: IconDescriptor = {
  p: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
};
export const upload: IconDescriptor = { p: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12' };
export const windowMaximize: IconDescriptor = { p: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' };
export const windowMinimize: IconDescriptor = { p: 'M5 12h14' };
export const windowRestore: IconDescriptor = {
  p: ['M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2', 'M6 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z'],
};
export const x: IconDescriptor = { p: 'M18 6 6 18M6 6l12 12' };

/** camelCase export 名 → 元の Lucide 由来ケバブケース名 (CLI との対応付け用)。 */
export const ICON_NAMES: Readonly<Record<string, string>> = {
  arrowDown: 'arrow-down',
  arrowLeft: 'arrow-left',
  arrowRight: 'arrow-right',
  arrowUp: 'arrow-up',
  arrowUpDown: 'arrow-up-down',
  check: 'check',
  chevronDown: 'chevron-down',
  chevronLeft: 'chevron-left',
  chevronRight: 'chevron-right',
  chevronUp: 'chevron-up',
  circleCheck: 'circle-check',
  circleDot: 'circle-dot',
  circleX: 'circle-x',
  contrast: 'contrast',
  download: 'download',
  externalLink: 'external-link',
  eye: 'eye',
  info: 'info',
  loader: 'loader',
  menu: 'menu',
  minus: 'minus',
  moreHorizontal: 'more-horizontal',
  moreVertical: 'more-vertical',
  pencil: 'pencil',
  play: 'play',
  plus: 'plus',
  search: 'search',
  send: 'send',
  square: 'square',
  trash2: 'trash-2',
  triangleAlert: 'triangle-alert',
  upload: 'upload',
  windowMaximize: 'window-maximize',
  windowMinimize: 'window-minimize',
  windowRestore: 'window-restore',
  x: 'x',
};

// CLI の同梱解決は v1 CLI の `load_bundled` 相当。
/**
 * 元のケバブケース名 (Lucide 由来、`ricdom-icon` CLI の引数と同じ表記) → descriptor。
 * CLI の同梱解決と、動的に名前でアイコンを引きたい場合に使う。
 * 個別 import (`import { check } from 'ricdom/icons'`) の方が tree-shakable なので、
 * 静的に import 名が分かる場合はそちらを使うこと。
 */
export const ICONS_BY_NAME: Readonly<Record<string, IconDescriptor>> = {
  'arrow-down': arrowDown,
  'arrow-left': arrowLeft,
  'arrow-right': arrowRight,
  'arrow-up': arrowUp,
  'arrow-up-down': arrowUpDown,
  check,
  'chevron-down': chevronDown,
  'chevron-left': chevronLeft,
  'chevron-right': chevronRight,
  'chevron-up': chevronUp,
  'circle-check': circleCheck,
  'circle-dot': circleDot,
  'circle-x': circleX,
  contrast,
  download,
  'external-link': externalLink,
  eye,
  info,
  loader,
  menu,
  minus,
  'more-horizontal': moreHorizontal,
  'more-vertical': moreVertical,
  pencil,
  play,
  plus,
  search,
  send,
  square,
  'trash-2': trash2,
  'triangle-alert': triangleAlert,
  upload,
  'window-maximize': windowMaximize,
  'window-minimize': windowMinimize,
  'window-restore': windowRestore,
  x,
};
