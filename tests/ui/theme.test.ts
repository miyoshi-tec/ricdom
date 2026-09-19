// applyTheme / createTheme / exportTheme (設計書 §4)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, createTheme, createDensity, createFontSize, exportTheme, exportSettings } from '../../src/ui/theme.js';

const THEMES = ['light', 'dark', 'teal', 'cyber', 'aqua', 'glass', 'glass-dark'] as const;
const DARK_LIKE = new Set(['dark', 'cyber', 'glass-dark']);

describe('applyTheme: 7 テーマの color-scheme が bg 明暗と整合する (2.0.0-alpha.18 で glass/glass-dark 追加)', () => {
  it.each(THEMES)('%s テーマは意図した color-scheme を持つ', (theme) => {
    const el = document.createElement('div');
    applyTheme(el, { theme });
    const expected = DARK_LIKE.has(theme) ? 'dark' : 'light';
    expect(el.style.getPropertyValue('color-scheme')).toBe(expected);
  });

  it('CSS 変数 (--ric-color-fg 等) が inline style に設定される', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'dark' });
    expect(el.style.getPropertyValue('--ric-color-fg')).toBe('#e5e7eb');
    expect(el.style.getPropertyValue('--ric-color-bg')).toBe('#111318');
  });

  it('density / fontSize も反映される', () => {
    const el = document.createElement('div');
    applyTheme(el, { density: 'compact', fontSize: 'lg' });
    expect(el.style.getPropertyValue('--ric-control-h')).toBe('28px');
    expect(el.style.getPropertyValue('--ric-font-size')).toBe('16px');
  });

  it('未指定の派生トークン (scrollbar-thumb 等) は color-mix で自動導出される', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'light' }); // 組み込みテーマは scrollbar-thumb を明示しない
    expect(el.style.getPropertyValue('--ric-scrollbar-thumb')).toContain('color-mix');
    expect(el.style.getPropertyValue('--ric-scrollbar-thumb-hover')).toContain('color-mix');
    expect(el.style.getPropertyValue('--ric-gap-md')).toContain('calc');
  });

  it('カスタムテーマで fg-muted を省略すると fg から color-mix で自動導出される', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: { '--ric-color-fg': '#000000' } });
    expect(el.style.getPropertyValue('--ric-color-fg-muted')).toContain('color-mix');
  });

  it('無効な要素を渡すと console.error して何もしない (throw しない)', () => {
    expect(() => applyTheme(null as unknown as Element)).not.toThrow();
    expect(() => applyTheme({} as Element)).not.toThrow();
  });

  it('同じ要素に複数回 applyTheme しても正しく上書きされる (テーマ切替)', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'light' });
    expect(el.style.getPropertyValue('color-scheme')).toBe('light');
    applyTheme(el, { theme: 'dark' });
    expect(el.style.getPropertyValue('color-scheme')).toBe('dark');
    expect(el.style.getPropertyValue('--ric-color-fg')).toBe('#e5e7eb');
  });

  it('data-ricdom-theme 属性を付与する (スクロールバー既定スタイルのスコープ用マーカー、設計書 §13)', () => {
    const el = document.createElement('div');
    expect(el.hasAttribute('data-ricdom-theme')).toBe(false);
    applyTheme(el, { theme: 'dark' });
    expect(el.hasAttribute('data-ricdom-theme')).toBe(true);
  });
});

describe('applyTheme: 無効な theme/density/fontSize の warn (2.0.0-alpha.7)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  it('無効な theme 名は console.warn 1 回 + light にフォールバックする', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'nope' as unknown as 'light' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('theme "nope" は無効です');
    expect(el.style.getPropertyValue('color-scheme')).toBe('light'); // 既定 (light) にフォールバック
  });

  it('無効な density 名は console.warn 1 回 + comfortable にフォールバックする', () => {
    const el = document.createElement('div');
    applyTheme(el, { density: 'md' as unknown as 'comfortable' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('density "md" は無効です');
    expect(el.style.getPropertyValue('--ric-control-h')).toBe('36px'); // comfortable の値
  });

  it('無効な fontSize 名は console.warn 1 回 + md にフォールバックする', () => {
    const el = document.createElement('div');
    applyTheme(el, { fontSize: 'huge' as unknown as 'md' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('fontSize "huge" は無効です');
    expect(el.style.getPropertyValue('--ric-font-size')).toBe('14px'); // md の値
  });

  it('applyTheme を呼ぶたびに warn する (「1 回だけ」memo ではない)', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'nope' as unknown as 'light' });
    applyTheme(el, { theme: 'nope' as unknown as 'light' });
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('有効な文字列名では warn しない', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'dark', density: 'compact', fontSize: 'lg' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('ThemeVars (object) を渡した場合は warn しない (theme/density/fontSize いずれも)', () => {
    const el = document.createElement('div');
    applyTheme(el, {
      theme: { '--ric-color-fg': '#000' },
      density: { '--ric-gap': '2px' },
      fontSize: { '--ric-font-size': '20px' },
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('省略時 (undefined) は warn しない', () => {
    const el = document.createElement('div');
    applyTheme(el, {});
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// トークン集合の完全性 (2.0.0-alpha.18、glass/glass-dark 新設)。他の palette が定義する
// トークンキーはすべて glass/glass-dark にも存在しなければならない (fixed design decisions
// #1) — 1 つでも欠けると、そのテーマだけ該当コンポーネントの見た目が var() のフォール
// バック値に落ちて他テーマと挙動が変わってしまう。`--ric-surface-blur` は今回の新設
// トークンで、既存 5 テーマ側にも 'none' を明示済み (トークン集合を全テーマで揃える設計、
// theme.ts 参照) なので、7 テーマ共通の網羅チェックにそのまま含められる。
const CORE_TOKEN_KEYS = [
  '--ric-color-fg',
  '--ric-color-fg-muted',
  '--ric-color-bg',
  '--ric-color-control',
  '--ric-color-border',
  '--ric-color-accent',
  '--ric-color-accent-fg',
  '--ric-tooltip-bg',
  '--ric-tooltip-fg',
  '--ric-code-bg',
  '--ric-code-fg',
  '--ric-shadow',
  '--ric-radius',
  '--ric-surface-blur',
  '--ric-panel-bg',
  '--ric-md-heading',
  '--ric-md-emphasis',
  '--ric-md-link',
  '--ric-md-url',
  '--ric-md-code-bg',
  '--ric-md-quote',
  '--ric-md-marker',
  '--ric-md-meta',
  'color-scheme',
] as const;

describe('applyTheme: 7 テーマすべてが共通トークン一式を過不足なく定義する', () => {
  it.each(THEMES)('%s テーマは CORE_TOKEN_KEYS を漏れなく定義する', (theme) => {
    const el = document.createElement('div');
    applyTheme(el, { theme });
    for (const key of CORE_TOKEN_KEYS) {
      expect(el.style.getPropertyValue(key), `${theme} の ${key} が空`).not.toBe('');
    }
  });

  it('glass/glass-dark は --ric-popup-blur も (--ric-surface-blur と同じ値を) 明示する (cyber/aqua と同じ形)', () => {
    const light = document.createElement('div');
    applyTheme(light, { theme: 'glass' });
    expect(light.style.getPropertyValue('--ric-popup-blur')).toBe(light.style.getPropertyValue('--ric-surface-blur'));
    expect(light.style.getPropertyValue('--ric-surface-blur')).not.toBe('none');

    const dark = document.createElement('div');
    applyTheme(dark, { theme: 'glass-dark' });
    expect(dark.style.getPropertyValue('--ric-popup-blur')).toBe(dark.style.getPropertyValue('--ric-surface-blur'));
    expect(dark.style.getPropertyValue('--ric-surface-blur')).not.toBe('none');
  });

  it('glass 以外の 5 テーマは --ric-surface-blur が none (見た目が変わらないことの回帰ガード)', () => {
    for (const theme of ['light', 'dark', 'teal', 'cyber', 'aqua'] as const) {
      const el = document.createElement('div');
      applyTheme(el, { theme });
      expect(el.style.getPropertyValue('--ric-surface-blur'), theme).toBe('none');
    }
  });
});

// 全パレットのトークンキー集合が完全一致すること (2.0.0-alpha.21、Rancha 報告 #6)。
// 修正前は --ric-popup-bg/--ric-popup-blur/--ric-panel-shadow が cyber/aqua/glass/
// glass-dark だけの独自キーで、light/dark/teal (と glass/glass-dark の一部) に欠けていた
// — CORE_TOKEN_KEYS の固定リストはこの種の「新設テーマだけが持つキー」の漏れを検知
// できない (リスト自体を都度手で更新する必要があるため)。ここでは「テーマ間の合併集合
// との差分」を計算することで、今後 8 番目のテーマが追加されてもキーが 1 つでも欠けて
// いれば自動的に落ちるようにする。
describe('applyTheme: 全 7 パレットのトークンキー集合が完全一致する (2.0.0-alpha.21、Rancha #6)', () => {
  it('el.style のプロパティ名集合 (union) がどのテーマからも過不足なく揃う', () => {
    const keySetByTheme = new Map<(typeof THEMES)[number], Set<string>>();
    for (const theme of THEMES) {
      const el = document.createElement('div');
      applyTheme(el, { theme });
      const keys = new Set<string>();
      for (let i = 0; i < el.style.length; i++) keys.add(el.style.item(i)!);
      keySetByTheme.set(theme, keys);
    }
    const union = new Set<string>();
    for (const keys of keySetByTheme.values()) for (const key of keys) union.add(key);

    for (const theme of THEMES) {
      const keys = keySetByTheme.get(theme)!;
      const missing = [...union].filter((key) => !keys.has(key));
      expect(missing, `${theme} に不足しているキー`).toEqual([]);
    }
  });

  it('--ric-popup-bg/--ric-popup-blur/--ric-panel-shadow は 7 テーマ全てで空でない値を持つ', () => {
    for (const theme of THEMES) {
      const el = document.createElement('div');
      applyTheme(el, { theme });
      expect(el.style.getPropertyValue('--ric-popup-bg'), `${theme} の --ric-popup-bg`).not.toBe('');
      expect(el.style.getPropertyValue('--ric-popup-blur'), `${theme} の --ric-popup-blur`).not.toBe('');
      expect(el.style.getPropertyValue('--ric-panel-shadow'), `${theme} の --ric-panel-shadow`).not.toBe('');
    }
  });

  // light/dark/teal は今回のアルファで新規に --ric-popup-bg/--ric-panel-shadow を得た
  // 3 テーマ (2.0.0-alpha.21 以前は未定義だった) — その値は「見た目を一切変えない」
  // というのが設計上の要件なので、--ric-color-bg/--ric-shadow とリテラル一致する。
  // cyber/aqua は 2.0.0-alpha.18 以前から独自の (--ric-color-bg/--ric-shadow とは異なる)
  // popup-bg/panel-shadow を意図的に持っており、ここでの対象外 (既存の意図した差)。
  it('新規に値を得た 3 テーマ (light/dark/teal) は --ric-popup-bg が --ric-color-bg と、--ric-panel-shadow が --ric-shadow と一致する (見た目不変の回帰ガード)', () => {
    for (const theme of ['light', 'dark', 'teal'] as const) {
      const el = document.createElement('div');
      applyTheme(el, { theme });
      expect(el.style.getPropertyValue('--ric-popup-bg'), theme).toBe(el.style.getPropertyValue('--ric-color-bg'));
      expect(el.style.getPropertyValue('--ric-panel-shadow'), theme).toBe(el.style.getPropertyValue('--ric-shadow'));
    }
  });

  it('light/dark/teal (新設キーが元々無かった 3 テーマ) は --ric-popup-blur が none', () => {
    for (const theme of ['light', 'dark', 'teal'] as const) {
      const el = document.createElement('div');
      applyTheme(el, { theme });
      expect(el.style.getPropertyValue('--ric-popup-blur'), theme).toBe('none');
    }
  });
});

// applyTheme が inline `--ric-*` カスタムプロパティを所有し、テーマ切替のたびに前の
// テーマだけが持っていたキーを掃除すること (2.0.0-alpha.21、Rancha 報告 #6、SPEC §8
// FACT)。修正前は cyber → dark のように popup/panel トークンを持たないテーマへ切り替えても
// cyber の値が inline style に残ったままで、dark テーマなのに popup/panel だけ cyber 色に
// なるバグがあった。
describe('applyTheme: 同一要素へのテーマ切替で前テーマの余分な --ric-* が消える (2.0.0-alpha.21、Rancha #6)', () => {
  it('cyber → dark で --ric-popup-bg/--ric-popup-blur/--ric-panel-shadow が dark の値に正しく上書きされる (cyber の値が残らない)', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'cyber' });
    expect(el.style.getPropertyValue('--ric-popup-bg')).toBe('rgba(10,18,40,0.4)'); // cyber の値
    applyTheme(el, { theme: 'dark' });
    expect(el.style.getPropertyValue('--ric-popup-bg')).toBe('#111318'); // dark の値 (= --ric-color-bg)
    expect(el.style.getPropertyValue('--ric-popup-blur')).toBe('none');
    expect(el.style.getPropertyValue('--ric-panel-shadow')).toBe('0 4px 24px rgba(0,0,0,0.50)'); // dark の --ric-shadow と同じ
  });

  it('自前 ThemeVars が持つ独自キーは、そのキーを持たない新テーマへの切替で inline style から消える', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: { '--ric-color-fg': '#000000', '--ric-my-extra': '1px' } });
    expect(el.style.getPropertyValue('--ric-my-extra')).toBe('1px');
    applyTheme(el, { theme: 'dark' });
    expect(el.style.getPropertyValue('--ric-my-extra')).toBe('');
  });

  it('`--ric-` で始まらない inline プロパティ (consumer 独自の変数・通常の style) は影響を受けない', () => {
    const el = document.createElement('div');
    el.style.setProperty('--app-x', '1');
    el.style.width = '10px';
    applyTheme(el, { theme: 'cyber' });
    applyTheme(el, { theme: 'dark' });
    expect(el.style.getPropertyValue('--app-x')).toBe('1');
    expect(el.style.width).toBe('10px');
  });
});

// `--ric-panel-bg` (2.0.0-alpha.20、Trend Guard #16): .ric-panel/.ric-tweak が読む
// 「コンテナ面」トークン。cssTemplates.ts の PANEL_CSS 直前のコメント参照 —
// フローティング/コンテナ面は `--ric-color-bg` (ページ背景) を直接読んではいけない、という
// 原則の実装。既存 5 テーマは --ric-color-bg と完全に同じ値でなければならない (見た目不変の
// 回帰ガード)。glass/glass-dark だけ独立した半透明値を持つ。
describe('applyTheme: --ric-panel-bg (パネル/tweak の表面トークン、2.0.0-alpha.20)', () => {
  it('既存 5 テーマは --ric-panel-bg が --ric-color-bg と完全に一致する (見た目不変の回帰ガード)', () => {
    for (const theme of ['light', 'dark', 'teal', 'cyber', 'aqua'] as const) {
      const el = document.createElement('div');
      applyTheme(el, { theme });
      expect(el.style.getPropertyValue('--ric-panel-bg'), theme).toBe(el.style.getPropertyValue('--ric-color-bg'));
    }
  });

  it('glass/glass-dark は --ric-panel-bg が --ric-color-bg と異なる独立した半透明値を持つ', () => {
    const glass = document.createElement('div');
    applyTheme(glass, { theme: 'glass' });
    expect(glass.style.getPropertyValue('--ric-panel-bg')).toBe('rgba(255,255,255,0.55)');
    expect(glass.style.getPropertyValue('--ric-panel-bg')).not.toBe(glass.style.getPropertyValue('--ric-color-bg'));

    const glassDark = document.createElement('div');
    applyTheme(glassDark, { theme: 'glass-dark' });
    expect(glassDark.style.getPropertyValue('--ric-panel-bg')).toBe('rgba(15,23,42,0.72)');
    expect(glassDark.style.getPropertyValue('--ric-panel-bg')).not.toBe(glassDark.style.getPropertyValue('--ric-color-bg'));
  });

  // Electron 透明ウィンドウ recipe (TUTORIAL.md §6) を適用しても --ric-panel-bg は
  // --ric-color-bg を上書きした影響を一切受けない (別々の CSS カスタムプロパティなので当然
  // だが、これが本バグ修正の要点そのものなので明示的に確認する)。
  it('--ric-color-bg を transparent に上書きしても --ric-panel-bg は影響を受けない (Electron recipe)', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: createTheme('glass-dark', { '--ric-color-bg': 'transparent' }) });
    expect(el.style.getPropertyValue('--ric-color-bg')).toBe('transparent');
    expect(el.style.getPropertyValue('--ric-panel-bg')).toBe('rgba(15,23,42,0.72)');
  });

  it('reduce: true のとき glass/glass-dark は --ric-panel-bg が不透明な色になる (--ric-color-control の reduced 値と同じ)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }));

    const glass = document.createElement('div');
    applyTheme(glass, { theme: 'glass' });
    expect(glass.style.getPropertyValue('--ric-panel-bg')).toBe('#f1f5f9');
    expect(glass.style.getPropertyValue('--ric-panel-bg')).not.toContain('rgba');

    const glassDark = document.createElement('div');
    applyTheme(glassDark, { theme: 'glass-dark' });
    expect(glassDark.style.getPropertyValue('--ric-panel-bg')).toBe('#1e293b');

    vi.unstubAllGlobals();
  });

  it('exportTheme で --ric-panel-bg が往復する (glass テーマ)', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'glass' });
    const exported = exportTheme(el);
    expect(exported['--ric-panel-bg']).toBe('rgba(255,255,255,0.55)');

    const el2 = document.createElement('div');
    applyTheme(el2, { theme: exported });
    expect(el2.style.getPropertyValue('--ric-panel-bg')).toBe('rgba(255,255,255,0.55)');
  });
});

// `--ric-theme` マーカー変数 (2.0.0-alpha.19)。CSS からは一切参照されないデータ専用
// トークンで、data-ricdom-theme 属性値と prefers-reduced-transparency の判定キーの両方が
// これに乗る (theme.ts の applyTheme コメント参照)。
describe('applyTheme: --ric-theme マーカー変数 (2.0.0-alpha.19)', () => {
  it.each(THEMES)('%s テーマは --ric-theme がテーマ名と一致する', (theme) => {
    const el = document.createElement('div');
    applyTheme(el, { theme });
    expect(el.style.getPropertyValue('--ric-theme')).toBe(theme);
  });

  it('data-ricdom-theme 属性の値も --ric-theme と同じテーマ名になる (以前は常に空文字だった)', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'dark' });
    expect(el.getAttribute('data-ricdom-theme')).toBe('dark');
  });

  // Electron 向け公式 recipe (TUTORIAL.md §6): createTheme('glass', overrides) の戻り値は
  // COLOR_VARS_GLASS を spread しているので --ric-theme を自動的に引き継ぐ。以前はこの
  // 経路だと data-ricdom-theme が '' になり、reduced-transparency の判定も opts.theme の
  // 文字列リテラル一致だけを見ていたため抜け落ちていた (下の describe で後者を検証)。
  it('createTheme("glass", overrides) を渡しても data-ricdom-theme が "glass" になる (Electron recipe)', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: createTheme('glass', { '--ric-color-bg': 'transparent' }) });
    expect(el.getAttribute('data-ricdom-theme')).toBe('glass');
    expect(el.style.getPropertyValue('--ric-color-bg')).toBe('transparent');
  });

  it('createTheme("dark") を渡すと data-ricdom-theme は "dark" になる', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: createTheme('dark') });
    expect(el.getAttribute('data-ricdom-theme')).toBe('dark');
  });

  it('--ric-theme を持たない自前の ThemeVars では属性値が空文字のまま (従来どおりの挙動)', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: { '--ric-color-fg': '#000000' } });
    expect(el.getAttribute('data-ricdom-theme')).toBe('');
    expect(el.style.getPropertyValue('--ric-theme')).toBe('');
  });
});

describe('applyTheme: prefers-reduced-transparency (2.0.0-alpha.18)', () => {
  const mockMatchMedia = (matches: boolean): void => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reduce: true のとき glass は --ric-surface-blur が none になり control が不透明になる', () => {
    mockMatchMedia(true);
    const el = document.createElement('div');
    applyTheme(el, { theme: 'glass' });
    expect(el.style.getPropertyValue('--ric-surface-blur')).toBe('none');
    expect(el.style.getPropertyValue('--ric-popup-blur')).toBe('none');
    expect(el.style.getPropertyValue('--ric-color-control')).not.toContain('rgba');
  });

  it('reduce: true のとき glass-dark も同様にオパーク化する', () => {
    mockMatchMedia(true);
    const el = document.createElement('div');
    applyTheme(el, { theme: 'glass-dark' });
    expect(el.style.getPropertyValue('--ric-surface-blur')).toBe('none');
    expect(el.style.getPropertyValue('--ric-color-control')).not.toContain('rgba');
  });

  // 2.0.0-alpha.19 の回帰ガード: 修正前は opts.theme が文字列リテラルのときしかこの分岐が
  // 発動しなかったため、TUTORIAL.md §6 の Electron recipe (createTheme 経由) では
  // reduced-transparency が一切効かなかった。`--ric-color-bg: transparent` という
  // consumer の意図した上書きは GLASS_REDUCED_TRANSPARENCY に含まれないので生き残ることも
  // 合わせて確認する (上のコメント参照)。
  it('reduce: true のとき createTheme("glass", { "--ric-color-bg": "transparent" }) でも不透明化され、かつ transparent 背景は維持される', () => {
    mockMatchMedia(true);
    const el = document.createElement('div');
    applyTheme(el, { theme: createTheme('glass', { '--ric-color-bg': 'transparent' }) });
    expect(el.style.getPropertyValue('--ric-surface-blur')).toBe('none');
    expect(el.style.getPropertyValue('--ric-color-control')).not.toContain('rgba');
    expect(el.style.getPropertyValue('--ric-color-bg')).toBe('transparent');
    expect(el.getAttribute('data-ricdom-theme')).toBe('glass');
  });

  it('reduce: false のとき glass は半透明のまま (既定どおり blur が入る)', () => {
    mockMatchMedia(false);
    const el = document.createElement('div');
    applyTheme(el, { theme: 'glass' });
    expect(el.style.getPropertyValue('--ric-surface-blur')).toContain('blur(');
    expect(el.style.getPropertyValue('--ric-color-control')).toContain('rgba');
  });

  it('reduce: true でも glass/glass-dark 以外のテーマは影響を受けない', () => {
    mockMatchMedia(true);
    const el = document.createElement('div');
    applyTheme(el, { theme: 'light' });
    expect(el.style.getPropertyValue('--ric-color-control')).toBe('#ffffff'); // COLOR_VARS_LIGHT のまま
  });

  it('matchMedia が無い環境 (jsdom 相当) では reduce ではない扱いになり、glass は半透明のまま', () => {
    vi.stubGlobal('matchMedia', undefined);
    const el = document.createElement('div');
    applyTheme(el, { theme: 'glass' });
    expect(el.style.getPropertyValue('--ric-surface-blur')).toContain('blur(');
  });
});

describe('createTheme: 継承・上書き', () => {
  it('ベーステーマの値を継承する', () => {
    const custom = createTheme('teal');
    expect(custom['--ric-color-accent']).toBe('#007f6d');
  });

  it('overrides で個別の変数を上書きできる', () => {
    const custom = createTheme('teal', { '--ric-color-accent': '#e91e8c' });
    expect(custom['--ric-color-accent']).toBe('#e91e8c');
    expect(custom['--ric-color-fg']).toBe('#0d2b24'); // 上書きしていない値は teal のまま
  });

  it('applyTheme に渡してそのまま使える', () => {
    const el = document.createElement('div');
    const custom = createTheme('dark', { '--ric-color-accent': '#ff00ff' });
    applyTheme(el, { theme: custom });
    expect(el.style.getPropertyValue('--ric-color-accent')).toBe('#ff00ff');
    expect(el.style.getPropertyValue('color-scheme')).toBe('dark'); // dark ベースの color-scheme も継承
  });

  // Electron の透明ウィンドウ対応 (2.0.0-alpha.18、docs/TUTORIAL.md §6「Frosted glass over
  // the desktop (Electron)」): `--ric-color-bg` に 'transparent' を渡しても
  // バリデーションで弾かれず、そのまま applyTheme → 要素の inline style に通ることを確認する。
  // applyTheme 自身は任意の文字列値を素通しするだけ (theme.ts に値の妥当性チェックは無い)
  // ので、ここでは「glass ベースに transparent を上書きしても他の glass トークンは
  // そのまま残る」ことも合わせて確認する。
  it('createTheme("glass", { "--ric-color-bg": "transparent" }) は透明な bg を継承する (Electron 透明ウィンドウ対応)', () => {
    const custom = createTheme('glass', { '--ric-color-bg': 'transparent' });
    expect(custom['--ric-color-bg']).toBe('transparent');
    expect(custom['--ric-color-accent']).toBe('#2563eb'); // 上書きしていない値は glass のまま

    const el = document.createElement('div');
    applyTheme(el, { theme: custom });
    expect(el.style.getPropertyValue('--ric-color-bg')).toBe('transparent');
    expect(el.style.getPropertyValue('color-scheme')).toBe('light'); // glass ベースの color-scheme も継承
  });
});

describe('createDensity: v1 create_density 継承 (2.0.0-alpha.10)', () => {
  it('3 名前 (comfortable/compact/tight) それぞれの寸法値を返す', () => {
    expect(createDensity('comfortable')['--ric-control-h']).toBe('36px');
    expect(createDensity('compact')['--ric-control-h']).toBe('28px');
    expect(createDensity('tight')['--ric-control-h']).toBe('22px');
  });

  it('省略時は comfortable が既定', () => {
    expect(createDensity()).toEqual(createDensity('comfortable'));
  });

  it('overrides で個別の変数を上書きできる (継承していない値はベースのまま)', () => {
    const custom = createDensity('compact', { '--ric-gap': '2px' });
    expect(custom['--ric-gap']).toBe('2px');
    expect(custom['--ric-pad-x']).toBe('10px'); // compact のまま (上書きしていない)
  });

  it('ThemeVars (object) を直接渡すとそのまま (name 解決をバイパス)', () => {
    const custom = createDensity({ '--ric-control-h': '99px' });
    expect(custom).toEqual({ '--ric-control-h': '99px' });
  });

  it('applyTheme との round-trip: createDensity(\'compact\') を渡した結果が SIZE_VARS_COMPACT と一致する', () => {
    const el = document.createElement('div');
    applyTheme(el, { density: createDensity('compact') });
    expect(el.style.getPropertyValue('--ric-control-h')).toBe('28px');
    expect(el.style.getPropertyValue('--ric-gap')).toBe('4px');
    expect(el.style.getPropertyValue('--ric-pad-x')).toBe('10px');
    expect(el.style.getPropertyValue('--ric-pad-y')).toBe('4px');
  });
});

describe('createFontSize: v1 create_font_size 継承 (2.0.0-alpha.10)', () => {
  it('3 名前 (sm/md/lg) それぞれのフォントサイズを返す', () => {
    expect(createFontSize('sm')['--ric-font-size']).toBe('12px');
    expect(createFontSize('md')['--ric-font-size']).toBe('14px');
    expect(createFontSize('lg')['--ric-font-size']).toBe('16px');
  });

  it('省略時は md が既定', () => {
    expect(createFontSize()).toEqual(createFontSize('md'));
  });

  it('overrides で上書きできる', () => {
    const custom = createFontSize('sm', { '--ric-font-size': '10px' });
    expect(custom['--ric-font-size']).toBe('10px');
  });

  it('ThemeVars (object) を直接渡すとそのまま (name 解決をバイパス)', () => {
    const custom = createFontSize({ '--ric-font-size': '99px' });
    expect(custom).toEqual({ '--ric-font-size': '99px' });
  });

  it('applyTheme との round-trip: createFontSize(\'lg\') を渡した結果が FONT_VARS_LG と一致する', () => {
    const el = document.createElement('div');
    applyTheme(el, { fontSize: createFontSize('lg') });
    expect(el.style.getPropertyValue('--ric-font-size')).toBe('16px');
  });
});

describe('exportTheme: round-trip', () => {
  it('applyTheme した内容を exportTheme で取り出せる (round-trip)', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'dark' });
    const exported = exportTheme(el);
    expect(exported['color-scheme']).toBe('dark');
    expect(exported['--ric-color-fg']).toBe('#e5e7eb');
  });

  it('density / fontSize 系の変数は除外される', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'light', density: 'compact', fontSize: 'lg' });
    const exported = exportTheme(el);
    expect(exported['--ric-control-h']).toBeUndefined();
    expect(exported['--ric-font-size']).toBeUndefined();
    expect(exported['--ric-color-fg']).toBeDefined();
  });

  // 2.0.0-alpha.18 で新設した --ric-surface-blur が exportTheme で正しく往復することの確認
  // (glass のトークンはすべて `--ric-*` のリテラル文字列なので、他のトークンと同じ判定
  // ロジック (isThemeKey) で自然に拾われる — density/fontSize 系ではないので除外もされない)。
  it('--ric-surface-blur が exportTheme で往復する (glass テーマ)', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'glass' });
    const exported = exportTheme(el);
    expect(exported['--ric-surface-blur']).toBe('blur(24px) saturate(160%)');
    expect(exported['--ric-popup-blur']).toBe('blur(24px) saturate(160%)');

    const el2 = document.createElement('div');
    applyTheme(el2, { theme: exported });
    expect(el2.style.getPropertyValue('--ric-surface-blur')).toBe('blur(24px) saturate(160%)');
  });

  // --ric-theme (2.0.0-alpha.19) は `--ric-` プレフィックスを持つ通常のトークンなので、
  // 他の色トークンと同じ isThemeKey 判定で自然に往復する。exportTheme → applyTheme の
  // 往復で data-ricdom-theme 属性名も引き継がれることが要点 (--ric-theme マーカーから
  // 再度 attribute が解決されるため)。
  it('--ric-theme が exportTheme で往復し、再適用すると data-ricdom-theme も同じ名前になる', () => {
    const el1 = document.createElement('div');
    applyTheme(el1, { theme: 'glass-dark' });
    const exported = exportTheme(el1);
    expect(exported['--ric-theme']).toBe('glass-dark');

    const el2 = document.createElement('div');
    applyTheme(el2, { theme: exported });
    expect(el2.style.getPropertyValue('--ric-theme')).toBe('glass-dark');
    expect(el2.getAttribute('data-ricdom-theme')).toBe('glass-dark');
  });

  it('exportTheme の結果を別要素に applyTheme できる (往復)', () => {
    const el1 = document.createElement('div');
    applyTheme(el1, { theme: 'cyber' });
    const exported = exportTheme(el1);

    const el2 = document.createElement('div');
    applyTheme(el2, { theme: exported });
    expect(el2.style.getPropertyValue('color-scheme')).toBe('dark');
    expect(el2.style.getPropertyValue('--ric-color-accent')).toBe('#38bdf8');
  });

  it('無効な要素を渡すと console.error して空オブジェクトを返す', () => {
    expect(exportTheme(null as unknown as Element)).toEqual({});
  });
});

// v1 `ric_ui/context.js` の export_settings 継承 (v1→v2 パリティ一括監査 #2、2.0.0-alpha.14)
describe('exportSettings: theme/density/fontSize のグループ分け + round-trip', () => {
  it('applyTheme した内容を 3 グループに正しく分類する', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'dark', density: 'compact', fontSize: 'lg' });
    const settings = exportSettings(el);
    expect(settings.theme['color-scheme']).toBe('dark');
    expect(settings.theme['--ric-color-fg']).toBe('#e5e7eb');
    expect(settings.density['--ric-control-h']).toBe('28px');
    expect(settings.fontSize['--ric-font-size']).toBe('16px');
    // density/fontSize の変数が theme 側に紛れ込んでいないこと
    expect(settings.theme['--ric-control-h']).toBeUndefined();
    expect(settings.theme['--ric-font-size']).toBeUndefined();
  });

  it('exportSettings(el).theme は exportTheme(el) と一致する', () => {
    const el = document.createElement('div');
    applyTheme(el, { theme: 'cyber', density: 'tight', fontSize: 'sm' });
    expect(exportSettings(el).theme).toEqual(exportTheme(el));
  });

  it('round-trip: applyTheme → exportSettings → 別要素に applyTheme で全変数が一致する', () => {
    const el1 = document.createElement('div');
    applyTheme(el1, { theme: 'dark', density: 'compact', fontSize: 'lg' });
    const settings = exportSettings(el1);

    const el2 = document.createElement('div');
    applyTheme(el2, settings);

    for (let i = 0; i < el1.style.length; i++) {
      const key = el1.style.item(i)!;
      expect(el2.style.getPropertyValue(key)).toBe(el1.style.getPropertyValue(key));
    }
    expect(el2.style.length).toBe(el1.style.length);
  });

  it('無効な要素を渡すと console.error して 3 つとも空オブジェクトを返す', () => {
    expect(exportSettings(null as unknown as Element)).toEqual({ theme: {}, density: {}, fontSize: {} });
  });
});

// glass/glass-dark の半透明面 (panel-bg/popup-bg/control) の WCAG AA コントラスト契約
// (2.0.0-alpha.22、Trend Guard 追報 2)。半透明の rgba() は「何の上に乗るか」次第で
// 実効色が変わるため、テーマ CSS 変数の文字列値そのものを assert しても不十分 — ここでは
// 最悪ケース (glass-dark は明るい壁紙 = 白背景、glass は暗い壁紙 = 黒背景) の上に
// 合成した実効色と、そのテーマの本文文字色 (--ric-color-fg) とのコントラスト比を
// WCAG 2.x の相対輝度式で計算し、AA (4.5:1、通常文字サイズ) を満たすことを contract として
// 固定する。旧値 (glass-dark: panel-bg/popup-bg 0.5、control 0.45) がこのテストで実際に
// RED になることを ↓ 手動確認済み (計算結果はコメントに記載、このテスト自体は新値を
// 固定するのでその場に old/new を再現するコードは残さない):
//   旧 panel-bg 0.5  → rgb(135,139,149) → 3.11:1 (未達)
//   旧 control  0.45 → rgb(147,151,159) → 2.68:1 (未達)
//   旧 popup-bg 0.5  → rgb(135,139,149) → 3.11:1 (未達)
// 新値 (下の CONTRAST_CASES) はいずれも 4.5:1 以上 (実測値は it.each の説明文に出る)。
describe('applyTheme: glass/glass-dark の半透明面が WCAG AA (4.5:1) を満たす (2.0.0-alpha.22、Trend Guard 追報 2)', () => {
  // sRGB (0-255) 1 チャンネルを相対輝度計算用に線形化する (WCAG 2.x 定義どおり)。
  const srgbToLinear = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const relativeLuminance = ([r, g, b]: readonly [number, number, number]): number =>
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
  const contrastRatio = (a: readonly [number, number, number], b: readonly [number, number, number]): number => {
    const lumA = relativeLuminance(a);
    const lumB = relativeLuminance(b);
    const lighter = Math.max(lumA, lumB);
    const darker = Math.min(lumA, lumB);
    return (lighter + 0.05) / (darker + 0.05);
  };
  // rgba(r,g,b,a) を不透明な backdrop の上に sRGB 空間でそのまま合成する (CSS のアルファ
  // 合成と同じ、線形化はしない — 線形化は輝度計算の内部でのみ行う)。
  const compositeOverBackdrop = (fg: readonly [number, number, number], alpha: number, backdrop: readonly [number, number, number]): [number, number, number] => [
    alpha * fg[0] + (1 - alpha) * backdrop[0],
    alpha * fg[1] + (1 - alpha) * backdrop[1],
    alpha * fg[2] + (1 - alpha) * backdrop[2],
  ];
  // `rgba(r,g,b,a)` 文字列から [r,g,b,a] を取り出す (このテーマの該当トークンは全て
  // この形式で書かれている前提、unexpected な形式ならテスト自体が例外で落ちて気づける)。
  const parseRgba = (value: string): { rgb: [number, number, number]; alpha: number } => {
    const m = value.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/);
    if (!m) throw new Error(`予期しない色の形式: ${value}`);
    return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) };
  };
  const parseHex = (value: string): [number, number, number] => {
    const m = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) throw new Error(`予期しない色の形式: ${value}`);
    return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
  };

  const WHITE: [number, number, number] = [255, 255, 255];
  const BLACK: [number, number, number] = [0, 0, 0];

  // 最悪ケースの backdrop: glass-dark は明るい壁紙 (白)、glass (light frost/dark text) は
  // 暗い壁紙 (黒) — Trend Guard 報告どおり、glass はより明るい背景ほど有利になる非対称形。
  const CONTRAST_CASES: Array<{ label: string; theme: 'glass' | 'glass-dark'; token: '--ric-panel-bg' | '--ric-popup-bg' | '--ric-color-control'; backdrop: [number, number, number] }> = [
    { label: 'glass-dark panel-bg over white', theme: 'glass-dark', token: '--ric-panel-bg', backdrop: WHITE },
    { label: 'glass-dark popup-bg over white', theme: 'glass-dark', token: '--ric-popup-bg', backdrop: WHITE },
    { label: 'glass-dark control over white', theme: 'glass-dark', token: '--ric-color-control', backdrop: WHITE },
    { label: 'glass panel-bg over black', theme: 'glass', token: '--ric-panel-bg', backdrop: BLACK },
    { label: 'glass popup-bg over black', theme: 'glass', token: '--ric-popup-bg', backdrop: BLACK },
    { label: 'glass control over black', theme: 'glass', token: '--ric-color-control', backdrop: BLACK },
  ];

  it.each(CONTRAST_CASES)('$label は本文文字とのコントラストが 4.5:1 以上', ({ theme, token, backdrop }) => {
    const el = document.createElement('div');
    applyTheme(el, { theme });
    const fg = parseHex(el.style.getPropertyValue('--ric-color-fg'));
    const { rgb, alpha } = parseRgba(el.style.getPropertyValue(token));
    const composited = compositeOverBackdrop(rgb, alpha, backdrop);
    const ratio = contrastRatio(fg, composited);
    // 失敗時にメッセージへ実測比率が出るよう toBeGreaterThanOrEqual の第 2 引数ではなく
    // 独自メッセージにする (vitest の toBeGreaterThanOrEqual は expected 側しか出さないため)。
    expect(ratio, `${theme} ${token}: 実測 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
