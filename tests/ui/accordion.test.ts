// createAccordion (設計書 §3.4 部品契約 + 付録 E a11y)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createAccordion } from '../../src/ui/accordion.js';
import { flush, setupApp } from '../_helpers/dom.js';

const ITEMS = [
  { id: 'a', title: 'タイトル A', children: [{ tag: 'span', children: ['本文 A'] }] },
  { id: 'b', title: 'タイトル B', children: [{ tag: 'span', children: ['本文 B'] }] },
];

describe('createAccordion: use() 忘れ検知 (設計書 A)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('use() されていない accordion を直接呼ぶと console.error を出し null を返す', () => {
    const acc = createAccordion();
    expect(acc({ items: ITEMS })).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('createAccordion: 構造 / ARIA', () => {
  it('ヘッダは button+aria-expanded+aria-controls、パネルは role=region+aria-labelledby', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const handle = createApp('#app', {}, () => (acc ? acc({ items: ITEMS }) : null));
    acc = handle.use(createAccordion());
    await flush();

    expect(app.querySelector('.ric-accordion')!.getAttribute('data-ricdom-role')).toBe('accordion');
    // UI_ROLE 経由の直書き解消 (docs/API_AUDIT.ja.md 参照)。title は独自の data-ricdom-role を持つ。
    // arrow は uiIcon() 経由で描画されるため data-ricdom-role は常に uiIcon 自身の 'icon' になる
    // (icon.ts が rest 展開後に上書きするため、呼び出し側からは指定できない — 意図どおり)。
    expect(app.querySelector('.ric-accordion__title')!.getAttribute('data-ricdom-role')).toBe('accordion-title');
    expect(app.querySelector('.ric-accordion__arrow')!.getAttribute('data-ricdom-role')).toBe('icon');

    const headers = app.querySelectorAll('.ric-accordion__header');
    expect(headers.length).toBe(2);
    const header = headers[0] as HTMLElement;
    expect(header.tagName).toBe('BUTTON');
    expect(header.getAttribute('aria-expanded')).toBe('false');

    const panel = app.querySelectorAll('.ric-accordion__body')[0] as HTMLElement;
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-labelledby')).toBe(header.id);
    expect(header.getAttribute('aria-controls')).toBe(panel.id);
  });

  it('閉じたパネルは inert 属性を持ち、開くと外れる (フォーカス・a11y ツリーから除外)', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const handle = createApp('#app', {}, () => (acc ? acc({ items: ITEMS }) : null));
    acc = handle.use(createAccordion());
    await flush();

    const panel = () => app.querySelectorAll('.ric-accordion__body')[0] as HTMLElement;
    // 初期状態: 両方閉じている → inert 属性が付く。role="region" は維持される。
    expect(panel().hasAttribute('inert')).toBe(true);
    expect(panel().hasAttribute('hidden')).toBe(false); // alpha.23 から hidden は付けない
    expect(panel().getAttribute('role')).toBe('region');

    const header = app.querySelectorAll('.ric-accordion__header')[0] as HTMLElement;
    header.click();
    await flush();
    expect(panel().hasAttribute('inert')).toBe(false);
    expect(panel().getAttribute('role')).toBe('region');

    header.click();
    await flush();
    expect(panel().hasAttribute('inert')).toBe(true);
  });

  it('title に VDOM 配列 (アイコン混在) を渡せる', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const items = [{ id: 'x', title: [{ tag: 'b', children: ['★'] }, ' write_file'], children: ['本文'] }];
    const handle = createApp('#app', {}, () => (acc ? acc({ items }) : null));
    acc = handle.use(createAccordion());
    await flush();
    const titleEl = app.querySelector('.ric-accordion__title')!;
    expect(titleEl.querySelector('b')!.textContent).toBe('★');
    expect(titleEl.textContent).toContain('write_file');
  });
});

describe('createAccordion: 開閉 (multi:true 既定)', () => {
  it('ヘッダクリックでトグルし、複数を同時に開ける', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const handle = createApp('#app', {}, () => (acc ? acc({ items: ITEMS }) : null));
    acc = handle.use(createAccordion());
    await flush();

    const headers = () => Array.from(app.querySelectorAll('.ric-accordion__header')) as HTMLElement[];
    headers()[0]!.click();
    await flush();
    expect(acc!.isOpen('a')).toBe(true);
    expect(headers()[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(headers()[0]!.className).toContain('ric-accordion__header--open');

    headers()[1]!.click();
    await flush();
    expect(acc!.isOpen('a')).toBe(true); // multi:true なので a は開いたまま
    expect(acc!.isOpen('b')).toBe(true);
  });

  it('再クリックで閉じる', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const handle = createApp('#app', {}, () => (acc ? acc({ items: ITEMS }) : null));
    acc = handle.use(createAccordion());
    await flush();

    const header = () => app.querySelector('.ric-accordion__header') as HTMLElement;
    header().click();
    await flush();
    expect(acc!.isOpen('a')).toBe(true);
    header().click();
    await flush();
    expect(acc!.isOpen('a')).toBe(false);
  });
});

describe('createAccordion: 排他モード (multi:false)', () => {
  it('1 つ開くと他が閉じる', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const handle = createApp('#app', {}, () => (acc ? acc({ items: ITEMS, multi: false }) : null));
    acc = handle.use(createAccordion());
    await flush();

    const headers = () => Array.from(app.querySelectorAll('.ric-accordion__header')) as HTMLElement[];
    headers()[0]!.click();
    await flush();
    expect(acc!.isOpen('a')).toBe(true);

    headers()[1]!.click();
    await flush();
    expect(acc!.isOpen('a')).toBe(false);
    expect(acc!.isOpen('b')).toBe(true);
  });
});

describe('createAccordion: defaultOpen', () => {
  it('初期展開状態を指定できる', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const handle = createApp('#app', {}, () => (acc ? acc({ items: ITEMS }) : null));
    acc = handle.use(createAccordion({ defaultOpen: { b: true } }));
    await flush();
    expect(acc!.isOpen('a')).toBe(false);
    expect(acc!.isOpen('b')).toBe(true);
    expect(app.querySelectorAll('.ric-accordion__header')[1]!.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('createAccordion: controlled (2.0.0-alpha.7)', () => {
  it('open props が表示を決め、内部状態 (openMap) は変わらない', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const state = { acc: { a: true, b: false } };
    const handle = createApp('#app', state, (s) => (acc ? acc({ items: ITEMS, open: s.acc, onToggle: () => {} }) : null));
    acc = handle.use(createAccordion());
    await flush();

    const headers = () => Array.from(app.querySelectorAll('.ric-accordion__header')) as HTMLElement[];
    expect(headers()[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(headers()[1]!.getAttribute('aria-expanded')).toBe('false');
    expect(acc!.isOpen('a')).toBe(true);
    expect(acc!.isOpen('b')).toBe(false);

    // ヘッダをクリックしても、親が open を更新しない限り表示は変わらない (controlled)
    headers()[1]!.click();
    await flush();
    expect(headers()[1]!.getAttribute('aria-expanded')).toBe('false');
  });

  it('ヘッダクリックで onToggle(id, nextOpen, nextMap) が来て、multi:true では現在の open にマージした map になる', async () => {
    const app = setupApp();
    const calls: [string, boolean, Record<string, boolean>][] = [];
    let acc: ReturnType<typeof createAccordion>;
    const state: { acc: Record<string, boolean> } = { acc: { a: true, b: false } };
    const handle = createApp('#app', state, (s) =>
      acc
        ? acc({
            items: ITEMS,
            open: s.acc,
            onToggle: (id, next, map) => calls.push([id, next, map]),
          })
        : null,
    );
    acc = handle.use(createAccordion());
    await flush();

    const headers = () => Array.from(app.querySelectorAll('.ric-accordion__header')) as HTMLElement[];
    headers()[1]!.click();
    await flush();

    expect(calls.length).toBe(1);
    expect(calls[0]![0]).toBe('b');
    expect(calls[0]![1]).toBe(true);
    expect(calls[0]![2]).toEqual({ a: true, b: true }); // 現在の open + b の反転値をマージ、a はそのまま

    // 親が代入すれば表示に反映される (state ではなく、reactive proxy である handle に代入する)
    handle.acc = calls[0]![2];
    await flush();
    expect(headers()[1]!.getAttribute('aria-expanded')).toBe('true');
  });

  it('multi:false の nextMap は押した節だけ true、他の全節が false になる', async () => {
    const app = setupApp();
    const calls: Record<string, boolean>[] = [];
    let acc: ReturnType<typeof createAccordion>;
    const state = { acc: { a: true, b: false } };
    const handle = createApp('#app', state, (s) =>
      acc
        ? acc({
            items: ITEMS,
            multi: false,
            open: s.acc,
            onToggle: (_id, _next, map) => calls.push(map),
          })
        : null,
    );
    acc = handle.use(createAccordion());
    await flush();

    const headers = () => Array.from(app.querySelectorAll('.ric-accordion__header')) as HTMLElement[];
    headers()[1]!.click(); // b を開く → a は排他で閉じるはず
    await flush();

    expect(calls[0]).toEqual({ a: false, b: true });
  });

  it('onToggle 未指定なら何も起きない (tabs の active-only 指定時と同じ扱い)', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const state = { acc: { a: false, b: false } };
    const handle = createApp('#app', state, (s) => (acc ? acc({ items: ITEMS, open: s.acc }) : null));
    acc = handle.use(createAccordion());
    await flush();

    const header = () => app.querySelectorAll('.ric-accordion__header')[0] as HTMLElement;
    expect(() => header().click()).not.toThrow();
    await flush();
    expect(header().getAttribute('aria-expanded')).toBe('false'); // 何も変わらない
  });
});

describe('createAccordion: dispose', () => {
  it('unmount 後は再度呼んでも描画されない', async () => {
    const app = setupApp();
    let acc: ReturnType<typeof createAccordion>;
    const handle = createApp('#app', {}, () => (acc ? acc({ items: ITEMS }) : null));
    acc = handle.use(createAccordion());
    await flush();
    handle.unmount();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(acc!({ items: ITEMS })).toBeNull();
    errorSpy.mockRestore();
  });
});
