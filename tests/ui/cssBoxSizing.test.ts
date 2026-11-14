// CSS の静的な契約テスト: 「大きさを指定した箱」は border-box である (2.0.0-alpha.32)。
//
// alpha.25 (width: 100% の入力欄が親からはみ出す) と alpha.31 (max-height を付けたメニューが
// 画面からはみ出す) は同じ型のバグだった: 規則が width / height / min-* / max-* を指定し、
// 同じ要素に padding か枠線があるのに box-sizing を宣言していない。その要素の UA 既定が
// content-box だと、指定した大きさに padding と枠線が上乗せされる。v1 は `.ric-page *` の
// 全称リセットで全部 border-box だったので、v2 で規則ごとに書き足す必要があった。
//
// alpha.25 は `width: 100%` を条件に走査して 7 規則を直したが、max-height / min-width を持つ
// 規則は条件から漏れた。ここでは buildStylesheet() の全規則を「寸法 + (padding か枠線)」で
// 機械的に走査し、box-sizing の宣言が無いものを落とす。新しい規則を足したときの見張りになる。
// 実際の描画は tests/browser/uiControlBoxSizing.test.ts / uiBrowserDefaults.test.ts が見る。

import { describe, expect, it } from 'vitest';
import { buildStylesheet } from '../../src/ui/cssTemplates.js';

interface Rule {
  selectors: string[];
  body: string;
}

const parseRules = (css: string): Rule[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selectors: m[1]!.split(',').map((s) => s.trim().replace(/\s+/g, ' ')), body: m[2]! }))
    .filter((r) => !/^(@|from|to|\d)/.test(r.selectors[0]!));

const decl = (body: string, prop: string): string | undefined => body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`))?.[1]?.trim();

// 箱の大きさを決める宣言を持つか (auto / none / 0 は「決めていない」とみなす)
const SIZE_PROPS = ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height'];
const sizedProps = (body: string): string[] => SIZE_PROPS.filter((p) => { const v = decl(body, p); return v !== undefined && !/^(auto|none|0)$/.test(v); });
const hasPaddingOrBorder = (body: string): boolean => {
  const padding = decl(body, 'padding');
  const border = decl(body, 'border') ?? decl(body, 'border-top') ?? decl(body, 'border-left') ?? decl(body, 'border-bottom');
  return (padding !== undefined && !/^0(\s|$)/.test(`${padding} `.replace(/^0 0 /, '0 ')) && padding !== '0') || (border !== undefined && !/^(none|0)/.test(border));
};

describe('ricdom-ui.css: 大きさを指定した箱は border-box', () => {
  const rules = parseRules(buildStylesheet());
  // あるセレクタに box-sizing: border-box を与えている規則 (共通の規則も含む) を集める
  const borderBoxSelectors = new Set(rules.filter((r) => decl(r.body, 'box-sizing') === 'border-box').flatMap((r) => r.selectors));

  it('前提: 走査が機能している (規則が十分にあり、既知の規則を拾えている)', () => {
    expect(rules.length).toBeGreaterThan(150);
    expect(borderBoxSelectors.has('.ric-input')).toBe(true);
    expect(borderBoxSelectors.has('.ric-popup__body')).toBe(true);
  });

  it('寸法と padding / 枠線を同じ規則で指定しているセレクタは、box-sizing: border-box を持つ', () => {
    const missing: string[] = [];
    for (const r of rules) {
      const sized = sizedProps(r.body);
      if (sized.length === 0 || !hasPaddingOrBorder(r.body)) continue;
      for (const sel of r.selectors) {
        // 修飾クラス (.ric-button--sm など) は、基のクラスが border-box なら足りる
        const base = sel.replace(/--[a-z-]+$/, '');
        if (borderBoxSelectors.has(sel) || borderBoxSelectors.has(base)) continue;
        missing.push(`${sel}  { ${sized.map((p) => `${p}: ${decl(r.body, p)}`).join('; ')} }`);
      }
    }
    expect(missing).toEqual([]);
  });
});
