// ricdom/ui — テーマ (設計書 §4)
//
// v1 (ric_ui/context.js の make_css_vars / create_theme / export_theme) を
// TypeScript + camelCase へ移植したもの。v1 との相違点:
//   - `make_css_vars(opts)` (文字列を返す) → `applyTheme(el, opts)` (el.style に直接当てる)。
//     v1 は create_ui_page がこの文字列を受け取って `.ric-page` 要素の style に代入していたが、
//     v2 には page コンポーネントが無いため、el への適用まで 1 関数で完結させる
//     (`:root` は使わない。同一ページ内で複数要素が別テーマを持てる、v1 踏襲)。
//   - density / fontSize は camelCase 化 (v1 は density / font_size)。
//   - v1 の `create_density` / `create_font_size` は当初最小移植スコープに含めなかったが、
//     パイロット第 9 号 (Potopeta) の報告を受け 2.0.0-alpha.10 で追加した (下記参照)。
//     `export_settings` も当初は対象外だったが、v1→v2 パリティ一括監査 #2 を受け
//     2.0.0-alpha.14 で `exportSettings` として追加した (下記参照)。
//   - **無効な theme/density/fontSize 名を console.warn する** (2.0.0-alpha.7)。v1 は
//     タイポ (例 `density: 'md'` — 正しくは comfortable/compact/tight) を黙って既定値に
//     落としており、consumer が誤設定に気づかないまま動いていた実例がある。挙動 (既定値
//     フォールバック) 自体は変えず、気づけるようにするだけ (`src/ui/focusWhen.ts` /
//     `src/ui/inlineMenu.ts` と同じ dev-only warn の慣例に揃える — `ricdom/ui` はコアへの
//     実行時依存ゼロなので、コアの `isDevMode` を import せず `internal/pureHelpers.ts` に
//     複製されたものを使う)。

import { bakedDevMode, isDevMode } from './internal/pureHelpers.js';

export type ThemeName = 'light' | 'dark' | 'teal' | 'cyber' | 'aqua';
export type DensityName = 'comfortable' | 'compact' | 'tight';
export type FontSizeName = 'sm' | 'md' | 'lg';

/** CSS カスタムプロパティのキー (`--ric-*`) → 値、または `color-scheme` の素の値 */
export type ThemeVars = Record<string, string>;

export interface ApplyThemeOptions {
  theme?: ThemeName | ThemeVars;
  density?: DensityName | ThemeVars;
  fontSize?: FontSizeName | ThemeVars;
}

// ── theme → 色変数 (v1 ric_ui/context.js の COLOR_VARS_* をそのまま移植) ──

const COLOR_VARS_LIGHT: ThemeVars = {
  '--ric-color-fg': '#111827',
  '--ric-color-fg-muted': '#6b7280',
  '--ric-color-bg': '#f9fafb',
  '--ric-color-control': '#ffffff',
  '--ric-color-border': '#e5e7eb',
  '--ric-color-accent': '#2563eb',
  '--ric-color-accent-fg': '#ffffff',
  '--ric-tooltip-bg': '#1f2937',
  '--ric-tooltip-fg': '#f9fafb',
  '--ric-code-bg': '#f6f8fa',
  '--ric-code-fg': '#24292f',
  '--ric-shadow': '0 4px 16px rgba(0,0,0,0.10)',
  '--ric-radius': '8px',
  // ricdom/md-editor (opt-in サブパス) のトークン。VS Code の light テーマに寄せた配色。
  '--ric-md-heading': '#1f5fbf',
  '--ric-md-emphasis': '#b45309',
  '--ric-md-link': '#2563eb',
  '--ric-md-url': '#6b7280',
  '--ric-md-code-bg': 'rgba(0,0,0,0.06)',
  '--ric-md-quote': '#6b7280',
  '--ric-md-marker': '#6b7280',
  '--ric-md-meta': '#6b7280',
  'color-scheme': 'light',
};

const COLOR_VARS_DARK: ThemeVars = {
  '--ric-color-fg': '#e5e7eb',
  '--ric-color-fg-muted': '#9ca3af',
  '--ric-color-bg': '#111318',
  '--ric-color-control': '#1a1d24',
  '--ric-color-border': '#2a2f3a',
  '--ric-color-accent': '#60a5fa',
  '--ric-color-accent-fg': '#0f1115',
  '--ric-tooltip-bg': '#374151',
  '--ric-tooltip-fg': '#f9fafb',
  '--ric-code-bg': '#374151',
  '--ric-code-fg': '#f9fafb',
  '--ric-shadow': '0 4px 24px rgba(0,0,0,0.50)',
  '--ric-radius': '8px',
  '--ric-md-heading': '#8ab4f8',
  '--ric-md-emphasis': '#f59e0b',
  '--ric-md-link': '#60a5fa',
  '--ric-md-url': '#9ca3af',
  '--ric-md-code-bg': 'rgba(255,255,255,0.08)',
  '--ric-md-quote': '#9ca3af',
  '--ric-md-marker': '#9ca3af',
  '--ric-md-meta': '#9ca3af',
  'color-scheme': 'dark',
};

const COLOR_VARS_TEAL: ThemeVars = {
  '--ric-color-fg': '#0d2b24',
  '--ric-color-fg-muted': '#46605a',
  '--ric-color-bg': 'linear-gradient(135deg, #e6f9f0 0%, #f2f9f7 40%, #fef3c7 70%, #fce7f3 100%)',
  '--ric-color-control': 'rgba(255,255,255,0.9)',
  '--ric-color-border': '#c5ddd8',
  '--ric-color-accent': '#007f6d',
  '--ric-color-accent-fg': '#ffffff',
  '--ric-tooltip-bg': '#0d2b24',
  '--ric-tooltip-fg': '#f0fdf9',
  '--ric-code-bg': '#e6f2ef',
  '--ric-code-fg': '#0d2b24',
  '--ric-shadow': '0 4px 16px rgba(0,60,50,0.12)',
  '--ric-radius': '8px',
  '--ric-md-heading': '#1d6fa5',
  '--ric-md-emphasis': '#c2410c',
  '--ric-md-link': '#007f6d',
  '--ric-md-url': '#46605a',
  '--ric-md-code-bg': 'rgba(0,0,0,0.06)',
  '--ric-md-quote': '#46605a',
  '--ric-md-marker': '#46605a',
  '--ric-md-meta': '#46605a',
  'color-scheme': 'light',
};

const COLOR_VARS_CYBER: ThemeVars = {
  '--ric-color-fg': '#e2e8f0',
  '--ric-color-fg-muted': '#7aa8c8',
  '--ric-color-bg':
    'radial-gradient(ellipse at top left,#5500aa 0%,transparent 50%),radial-gradient(ellipse at top right,#007799 0%,transparent 50%),radial-gradient(ellipse at bottom left,#660033 0%,transparent 50%),radial-gradient(ellipse at bottom right,#003388 0%,transparent 50%),#04070f',
  '--ric-color-control': 'rgba(10,18,40,0.5)',
  '--ric-color-border': 'rgba(80,200,255,0.65)',
  '--ric-color-accent': '#38bdf8',
  '--ric-color-accent-fg': '#04070f',
  '--ric-tooltip-bg': 'rgba(4,7,15,0.92)',
  '--ric-tooltip-fg': '#38bdf8',
  '--ric-code-bg': 'rgba(4,7,15,0.92)',
  '--ric-code-fg': '#38bdf8',
  '--ric-popup-bg': 'rgba(10,18,40,0.4)',
  '--ric-popup-blur': 'blur(10px)',
  '--ric-panel-shadow': 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 0 0 1px rgba(80,200,255,0.5)',
  '--ric-radius': '0px',
  '--ric-shadow': '0 0 20px rgba(0,200,255,0.25), inset 0 1px 0 rgba(80,200,255,0.15)',
  '--ric-duration': '80ms',
  '--ric-easing': 'linear',
  '--ric-md-heading': '#7dd3fc',
  '--ric-md-emphasis': '#fb923c',
  '--ric-md-link': '#38bdf8',
  '--ric-md-url': '#7aa8c8',
  '--ric-md-code-bg': 'rgba(255,255,255,0.08)',
  '--ric-md-quote': '#7aa8c8',
  '--ric-md-marker': '#7aa8c8',
  '--ric-md-meta': '#7aa8c8',
  'color-scheme': 'dark',
};

const COLOR_VARS_AQUA: ThemeVars = {
  '--ric-color-fg': '#1a2c3c',
  '--ric-color-fg-muted': '#5c7a8a',
  '--ric-color-bg':
    'radial-gradient(ellipse at top left,#c0e8f8 0%,transparent 55%),radial-gradient(ellipse at top right,#a0d4f0 0%,transparent 55%),radial-gradient(ellipse at bottom left,#7ab8e8 0%,transparent 55%),radial-gradient(ellipse at bottom right,#90c8e0 0%,transparent 55%),#a0d8f0',
  '--ric-color-control': 'rgba(255,255,255,0.5)',
  '--ric-color-border': 'rgba(100,170,210,0.35)',
  '--ric-color-accent': '#0284c7',
  '--ric-color-accent-fg': '#ffffff',
  '--ric-tooltip-bg': 'rgba(20,45,70,0.92)',
  '--ric-tooltip-fg': '#f0f8ff',
  '--ric-code-bg': 'rgba(255,255,255,0.55)',
  '--ric-code-fg': '#1a2c3c',
  '--ric-popup-bg': 'rgba(255,255,255,0.4)',
  '--ric-popup-blur': 'blur(10px)',
  '--ric-panel-shadow': '0 8px 32px rgba(20,80,140,0.08), inset 0 1px 0 rgba(255,255,255,0.75)',
  '--ric-radius': '20px',
  '--ric-shadow': '0 4px 20px rgba(20,80,140,0.12), inset 0 1px 0 rgba(255,255,255,0.60)',
  '--ric-duration': '600ms',
  '--ric-easing':
    'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.069, 1.099 24.3%, 1.105 26%, 1.096 27.9%, 1.053 32.8%, 1.019 38.1%, 0.999 44.2%, 0.995 51.9%, 1.0 62.6%, 1.001 99.9%)',
  '--ric-md-heading': '#0b4f7a',
  '--ric-md-emphasis': '#c2410c',
  '--ric-md-link': '#0284c7',
  '--ric-md-url': '#5c7a8a',
  '--ric-md-code-bg': 'rgba(0,0,0,0.06)',
  '--ric-md-quote': '#5c7a8a',
  '--ric-md-marker': '#5c7a8a',
  '--ric-md-meta': '#5c7a8a',
  'color-scheme': 'light',
};

// ── density → 寸法変数 ──

const SIZE_VARS_COMFORTABLE: ThemeVars = { '--ric-gap': '6px', '--ric-pad-x': '14px', '--ric-pad-y': '8px', '--ric-control-h': '36px' };
const SIZE_VARS_COMPACT: ThemeVars = { '--ric-gap': '4px', '--ric-pad-x': '10px', '--ric-pad-y': '4px', '--ric-control-h': '28px' };
const SIZE_VARS_TIGHT: ThemeVars = { '--ric-gap': '1px', '--ric-pad-x': '6px', '--ric-pad-y': '1px', '--ric-control-h': '22px' };

// ── fontSize → ベースフォントサイズ ──

const FONT_VARS_SM: ThemeVars = { '--ric-font-size': '12px' };
const FONT_VARS_MD: ThemeVars = { '--ric-font-size': '14px' };
const FONT_VARS_LG: ThemeVars = { '--ric-font-size': '16px' };

// 有効な名前一覧 (無効値検知 + warn メッセージ組み立ての両方に使う、2.0.0-alpha.7)。
const THEME_NAMES: readonly ThemeName[] = ['light', 'dark', 'teal', 'cyber', 'aqua'];
const DENSITY_NAMES: readonly DensityName[] = ['comfortable', 'compact', 'tight'];
const FONT_SIZE_NAMES: readonly FontSizeName[] = ['sm', 'md', 'lg'];

/**
 * 無効な theme/density/fontSize の文字列値を検知して console.warn する
 * (2.0.0-alpha.7、dev ビルドのみ — focusWhen/inlineMenu と同じ慣例)。object (ThemeVars)
 * や既知の名前、`undefined` (= 省略。既定値を使う正常系) は対象外。
 */
const warnIfInvalidName = <T extends string>(kind: string, value: T | ThemeVars | undefined, validNames: readonly T[], fallbackLabel: string): void => {
  if (value === undefined || typeof value === 'object') return;
  if ((validNames as readonly string[]).includes(value)) return;
  // `!isDevMode()` ではなく `!(bakedDevMode ?? isDevMode())` (定数を `??` の左) にする理由は
  // internal/pureHelpers.ts の bakedDevMode 定義直前のコメント参照。production IIFE では
  // `!(false ?? …)` → `true` に畳み込まれて無条件 return になり、続く console.warn が
  // 到達不能コードとして dead-code elimination される。
  if (!(bakedDevMode ?? isDevMode())) return;
  console.warn(`RicDOM UI: applyTheme の ${kind} "${value}" は無効です (有効: ${validNames.join(' / ')})。既定値 ${fallbackLabel} を使います。`);
};

const resolveColorVars = (theme: ThemeName | ThemeVars | undefined): ThemeVars => {
  if (theme && typeof theme === 'object') return theme;
  warnIfInvalidName('theme', theme, THEME_NAMES, 'light');
  return theme === 'dark' ? COLOR_VARS_DARK : theme === 'teal' ? COLOR_VARS_TEAL : theme === 'cyber' ? COLOR_VARS_CYBER : theme === 'aqua' ? COLOR_VARS_AQUA : COLOR_VARS_LIGHT;
};

const resolveSizeVars = (density: DensityName | ThemeVars | undefined): ThemeVars => {
  if (density && typeof density === 'object') return density;
  warnIfInvalidName('density', density, DENSITY_NAMES, 'comfortable');
  return density === 'tight' ? SIZE_VARS_TIGHT : density === 'compact' ? SIZE_VARS_COMPACT : SIZE_VARS_COMFORTABLE;
};

const resolveFontVars = (fontSize: FontSizeName | ThemeVars | undefined): ThemeVars => {
  if (fontSize && typeof fontSize === 'object') return fontSize;
  warnIfInvalidName('fontSize', fontSize, FONT_SIZE_NAMES, 'md');
  return fontSize === 'sm' ? FONT_VARS_SM : fontSize === 'lg' ? FONT_VARS_LG : FONT_VARS_MD;
};

/**
 * theme/density/fontSize から実際に適用する CSS 変数一式を計算する
 * (v1 の make_css_vars 本体。文字列化する直前の object 表現)。
 */
const computeThemeVars = ({ theme, density, fontSize }: ApplyThemeOptions): ThemeVars => {
  const color = resolveColorVars(theme);
  const size = resolveSizeVars(density);
  const font = resolveFontVars(fontSize);
  const vars: ThemeVars = { ...size, ...font, ...color };

  if (!vars['--ric-color-fg-muted']) vars['--ric-color-fg-muted'] = 'color-mix(in srgb, var(--ric-color-fg) 50%, transparent)';
  if (!vars['--ric-color-border']) vars['--ric-color-border'] = 'color-mix(in srgb, var(--ric-color-fg) 15%, transparent)';
  if (!vars['--ric-scrollbar-thumb']) vars['--ric-scrollbar-thumb'] = 'color-mix(in srgb, var(--ric-color-fg) 30%, transparent)';
  if (!vars['--ric-scrollbar-thumb-hover']) vars['--ric-scrollbar-thumb-hover'] = 'color-mix(in srgb, var(--ric-color-fg) 50%, transparent)';
  if (!vars['--ric-gap-md']) vars['--ric-gap-md'] = 'calc(var(--ric-gap) * 2)';
  if (!vars['--ric-duration']) vars['--ric-duration'] = '200ms';
  if (!vars['--ric-easing']) vars['--ric-easing'] = 'ease';
  return vars;
};

/**
 * 要素にテーマ CSS 変数 (`--ric-*` + `color-scheme`) を inline style として当てる
 * (v1 の make_css_vars 後継。`:root` は使わない — 同一ページ内で複数要素が別テーマを
 * 持てる、設計書 §4)。`color-scheme` を設定するので、要素の子孫にあるネイティブ部品
 * (スクロールバー・select・checkbox・日付ピッカー等) も自動でライト/ダークに追従する
 * (v1 v0.4.2 由来)。
 *
 * `data-ricdom-theme` 属性を el に付与する (設計書 §13 で確定した方式)。
 * v1 はページ全体のスクロールバー既定スタイルを `.ric-page, .ric-page *` に適用していたが、
 * v2 に page 部品が無いため、この属性を CSS 側 (`[data-ricdom-theme]`/`[data-ricdom-theme] *`)
 * のスコープ用マーカーとして使う (cssTemplates.ts 参照)。同じ属性を使い、el 自身にも
 * `background`/`color` を塗る規則が ricdom-ui.css 側にある (#11、2.0.0-alpha.3。
 * v1 の create_ui_page が `.ric-page` に塗っていたパリティ — この関数自体は CSS 変数を
 * 当てるだけで、実際に塗るのは CSS 側の `[data-ricdom-theme]` 規則)。
 */
export const applyTheme = (el: Element, opts: ApplyThemeOptions = {}): void => {
  if (!el || typeof (el as HTMLElement).style === 'undefined') {
    console.error('RicDOM UI: applyTheme の第 1 引数には有効な DOM 要素を渡してください。');
    return;
  }
  const vars = computeThemeVars(opts);
  const style = (el as HTMLElement).style;
  // vars のキーは常に `--ric-*` か `color-scheme` のいずれか (COLOR_VARS_*/SIZE_VARS_*/
  // FONT_VARS_* の定義・createTheme の overrides とも同じ形)。setProperty はどちらの
  // 形にも使える (CSS カスタムプロパティ / 通常プロパティ)。
  for (const [key, val] of Object.entries(vars)) style.setProperty(key, val);
  el.setAttribute('data-ricdom-theme', '');
};

/**
 * ベーステーマに部分上書きしたカスタムテーマオブジェクトを返す (v1 の create_theme 継承)。
 *   const myTheme = createTheme('teal', { '--ric-color-accent': '#e91e8c' });
 *   applyTheme(el, { theme: myTheme });
 */
export const createTheme = (base: ThemeName | ThemeVars = 'light', overrides: ThemeVars = {}): ThemeVars => ({
  ...resolveColorVars(base),
  ...overrides,
});

/**
 * ベース密度に部分上書きした ThemeVars を返す (v1 `ric_ui/context.js` の
 * `create_density(base='comfortable', overrides={})` 継承、パイロット第 9 号 = Potopeta
 * からの報告、2.0.0-alpha.10)。v1 のこの関数は値をそのまま返す純粋関数で、consumer
 * (RicUI デザイナ) はプリセットの寸法一式を「テーマ適用前に」読み取って UI 自体の
 * レイアウト計算に使っていた。v2 には `createTheme` (色) しか無く、consumer は
 * 「detached div に applyTheme して el.style から読み戻す」という回避策 — しかも
 * `--ric-gap`/`--ric-pad-x` 等の非公開の変数名決め打ちに依存する — を書かざるを得な
 * かった。`createTheme` と同じ形 (base → 解決 → overrides 上書き) にすることで、
 * `applyTheme(el, { density: createDensity('compact') })` にそのまま渡せる。
 *   const myDensity = createDensity('compact', { '--ric-gap': '2px' });
 *   applyTheme(el, { density: myDensity });
 */
export const createDensity = (base: DensityName | ThemeVars = 'comfortable', overrides: ThemeVars = {}): ThemeVars => ({
  ...resolveSizeVars(base),
  ...overrides,
});

/**
 * ベースフォントサイズに部分上書きした ThemeVars を返す (v1 `ric_ui/context.js` の
 * `create_font_size(base='md', overrides={})` 継承、createDensity と同じ理由・同じ形、
 * 2.0.0-alpha.10)。
 *   const myFontSize = createFontSize('lg', { '--ric-font-size': '18px' });
 *   applyTheme(el, { fontSize: myFontSize });
 */
export const createFontSize = (base: FontSizeName | ThemeVars = 'md', overrides: ThemeVars = {}): ThemeVars => ({
  ...resolveFontVars(base),
  ...overrides,
});

// `color-scheme` は `--ric-` プレフィックスを持たない通常の CSS プロパティだが、
// テーマの一部として export 対象に含める (他の --ric-* と同様、v1 v0.4.2 由来)。
const isThemeKey = (key: string): boolean => key === 'color-scheme' || key.startsWith('--ric-');
const DENSITY_PREFIXES = ['--ric-gap', '--ric-pad-', '--ric-control-h'];
const FONT_PREFIXES = ['--ric-font-'];
const isDensityVar = (key: string): boolean => DENSITY_PREFIXES.some((p) => key.startsWith(p));
const isFontVar = (key: string): boolean => FONT_PREFIXES.some((p) => key.startsWith(p));

/**
 * 要素から現在のテーマ変数をオブジェクトで取り出す (v1 の export_theme 継承)。
 * density・fontSize 系の変数は除外し、テーマ固有の変数 (色・装飾) のみ返す。
 *   const saved = exportTheme(document.querySelector('#app'));
 *   localStorage.setItem('theme', JSON.stringify(saved));
 *   applyTheme(el, { theme: JSON.parse(localStorage.getItem('theme')!) });
 */
export const exportTheme = (el: Element): ThemeVars => {
  if (!el || typeof (el as HTMLElement).style === 'undefined') {
    console.error('RicDOM UI: exportTheme には有効な DOM 要素を渡してください。');
    return {};
  }
  const style = (el as HTMLElement).style;
  const result: ThemeVars = {};
  for (let i = 0; i < style.length; i++) {
    const key = style.item(i);
    if (!key || !isThemeKey(key) || isDensityVar(key) || isFontVar(key)) continue;
    result[key] = style.getPropertyValue(key).trim();
  }
  return result;
};

/** exportSettings の戻り値 (v1 export_settings の 3 グループ、camelCase 化)。 */
export interface ExportedSettings {
  theme: ThemeVars;
  density: ThemeVars;
  fontSize: ThemeVars;
}

/**
 * 要素から theme / density / fontSize をグループ別にまとめて取り出す
 * (v1 `ric_ui/context.js` の `export_settings` 継承、v1→v2 パリティ一括監査 #2、
 * 2.0.0-alpha.14)。`exportTheme` は density/fontSize 系の変数を除外して返すが、
 * それらを保存したい consumer は本来 v1 でも `export_settings` を使っていた
 * (`export_theme` の JSDoc にも明記されている使い分け)。分類ロジックは exportTheme と
 * 同じ判定 (isThemeKey/isDensityVar/isFontVar) を使うため、
 * `exportSettings(el).theme` は必ず `exportTheme(el)` と一致する。
 *   const saved = exportSettings(document.querySelector('#app'));
 *   localStorage.setItem('settings', JSON.stringify(saved));
 *   const restored = JSON.parse(localStorage.getItem('settings')!);
 *   applyTheme(el2, restored); // { theme, density, fontSize } をそのまま渡せる
 */
export const exportSettings = (el: Element): ExportedSettings => {
  if (!el || typeof (el as HTMLElement).style === 'undefined') {
    console.error('RicDOM UI: exportSettings には有効な DOM 要素を渡してください。');
    return { theme: {}, density: {}, fontSize: {} };
  }
  const style = (el as HTMLElement).style;
  const theme: ThemeVars = {};
  const density: ThemeVars = {};
  const fontSize: ThemeVars = {};
  for (let i = 0; i < style.length; i++) {
    const key = style.item(i);
    if (!key || !isThemeKey(key)) continue;
    if (isFontVar(key)) {
      fontSize[key] = style.getPropertyValue(key).trim();
    } else if (isDensityVar(key)) {
      density[key] = style.getPropertyValue(key).trim();
    } else {
      theme[key] = style.getPropertyValue(key).trim();
    }
  }
  return { theme, density, fontSize };
};
