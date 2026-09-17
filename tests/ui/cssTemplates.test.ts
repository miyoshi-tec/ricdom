// buildStylesheet (設計書 §4/§13、状態を持たない部品 + スクロールバー既定スタイル)

import { describe, expect, it } from 'vitest';
import { buildStylesheet } from '../../src/ui/cssTemplates.js';

describe('buildStylesheet: 状態を持たない部品の規則を含む', () => {
  const css = buildStylesheet();

  it.each(['.ric-textarea', '.ric-checkbox', '.ric-select', '.ric-radiogroup', '.ric-range', '.ric-color', '.ric-separator', '.ric-text', '.ric-icon', '.ric-col', '.ric-row', '.ric-grid', '.ric-panel', '.ric-md-pre', '.ric-code-pre'])(
    '%s の規則を含む',
    (selector) => {
      expect(css).toContain(selector);
    },
  );

  // 2.0.0-alpha.21 (オーナー決定、Rancha 報告): [data-ricdom-theme] スコープの既定
  // スクロールバースタイルから `::-webkit-scrollbar*` 疑似要素ルールを削除し、標準の
  // scrollbar-width/scrollbar-color だけにした。理由は Chromium 121+ で標準プロパティが
  // auto 以外の値を持つ要素には ::-webkit-scrollbar* 系ルールが一切適用されない
  // (dead code だった、実機のデバイスピクセル計測で発覚) — 詳細は cssTemplates.ts の
  // SCROLLBAR_CSS 直前のコメント、SPEC §8 の FACT 参照。
  it('[data-ricdom-theme] スコープのスクロールバー既定スタイルを含む (v1 の .ric-page 相当、設計書 §13、標準プロパティのみ)', () => {
    expect(css).toContain('[data-ricdom-theme]');
    expect(css).toContain('scrollbar-width: thin');
    expect(css).toContain('scrollbar-color');
  });

  it('[data-ricdom-theme] スコープには ::-webkit-scrollbar* ルールがもう無い (2.0.0-alpha.21、dead code 削除)', () => {
    expect(css).not.toContain('[data-ricdom-theme])::-webkit-scrollbar');
  });

  // .ric-scroll-pane も同じ要素に標準の scrollbar-width / scrollbar-color を当てているので、
  // 併記していた ::-webkit-scrollbar* は同じ理由で dead code だった → 同じ alpha で削除。
  // stylesheet 全体に webkit 疑似要素のスクロールバー規則が 1 つも残らないことを固定する
  // (標準プロパティ 1 本、canon は 1 つ)。
  it('stylesheet 全体に ::-webkit-scrollbar* ルールが残っていない (標準プロパティ 1 本)', () => {
    expect(css).not.toContain('::-webkit-scrollbar');
    expect(css).toContain('.ric-scroll-pane {');
    expect(css).toMatch(/\.ric-scroll-pane \{[^}]*scrollbar-width: thin/);
  });

  it('.ric-panel[inert] で disabled の見た目 (opacity) を表現する', () => {
    expect(css).toContain('.ric-panel[inert]');
  });

  it('既存の規則も引き続き含まれる', () => {
    expect(css).toContain('.ric-button');
    expect(css).toContain('.ric-dialog');
    expect(css).toContain('.ric-popup__body');
    expect(css).toContain('.ric-toast__item');
    expect(css).toContain('.ric-tooltip__popup');
  });

  it('uiButton の size (.ric-button--sm/--lg) の規則を含む (v1 css_templates.js から移植)', () => {
    expect(css).toContain('.ric-button--sm');
    expect(css).toContain('.ric-button--lg');
  });

  it('.ric-popup__item は align-items:center を持つ (2.0.0-alpha.2、アイコン+テキスト項目の中心 y 不一致の実機バグ修正)', () => {
    const itemRuleMatch = css.match(/\.ric-popup__item\s*\{[^}]*\}/);
    expect(itemRuleMatch).not.toBeNull();
    expect(itemRuleMatch![0]).toContain('align-items: center');
    expect(itemRuleMatch![0]).toContain('gap:');
  });
});
