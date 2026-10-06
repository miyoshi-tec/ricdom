// createTweakPanel (設計書 §3.4 部品契約 + 付録 E a11y)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createTweakPanel, inferTweakType } from '../../src/ui/tweakPanel.js';
import { flush, setupApp } from '../_helpers/dom.js';

describe('createTweakPanel: use() 忘れ検知 (設計書 A)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('use() されていない panel を直接呼ぶと console.error を出し null を返す', () => {
    const tweak = createTweakPanel();
    expect(tweak({ data: { a: 1 } })).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('inferTweakType: Tier1 型推論', () => {
  it('boolean → checkbox / number → number / plain object → folder', () => {
    expect(inferTweakType(true)).toBe('checkbox');
    expect(inferTweakType(1.5)).toBe('number');
    expect(inferTweakType({ a: 1 })).toBe('folder');
  });

  it('hex / rgba 文字列 → color、それ以外の文字列 → text', () => {
    expect(inferTweakType('#fff')).toBe('color');
    expect(inferTweakType('#ff0000')).toBe('color');
    expect(inferTweakType('rgba(1,2,3,0.5)')).toBe('color');
    expect(inferTweakType('rgb(1,2,3)')).toBe('color');
    expect(inferTweakType('hello')).toBe('text');
  });

  it('配列・class instance 等 → json (フォールバック)', () => {
    expect(inferTweakType([1, 2, 3])).toBe('json');
    expect(inferTweakType(new Map())).toBe('json');
    expect(inferTweakType(null)).toBe('json');
  });
});

describe('createTweakPanel: Tier1 (data のみ) — 型ごとの行生成', () => {
  it('boolean は checkbox 行 (uiCheckbox 内蔵ラベル、row 側に __label は出ない)', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { flag: true };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const row = app.querySelector('.ric-tweak-row--checkbox')!;
    expect(row.querySelector('.ric-tweak-row__label')).toBeNull();
    const input = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it('number は <label> + type=number input', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { size: 10 };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const row = app.querySelector('.ric-tweak-row') as HTMLLabelElement;
    expect(row.tagName).toBe('LABEL');
    const input = row.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input.value).toBe('10');
    expect(row.querySelector('.ric-tweak-row__label')!.textContent).toBe('size');
  });

  it('hex 文字列は color 行 (input[type=color])', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { tint: '#ff0000' };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    expect(app.querySelector('input[type="color"]')).not.toBeNull();
  });

  it('通常の文字列は text 行', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { name: 'hello' };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const input = app.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  it('配列値は json プレビュー (<pre>) にフォールバックする', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { list: [1, 2, 3] };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const pre = app.querySelector('.ric-tweak-row__json') as HTMLElement;
    expect(pre).not.toBeNull();
    expect(pre.textContent).toContain('1');
  });

  it('plain object は folder になり、子の行を再帰生成する', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    expect(app.querySelector('.ric-tweak-folder')).not.toBeNull();
    expect(app.querySelector('.ric-tweak-folder__label')!.textContent).toBe('nested');
    // 初期状態は閉じている (inert) が、子行自体は DOM 上に存在する
    const body = app.querySelector('.ric-tweak-folder__body') as HTMLElement;
    expect(body.hasAttribute('inert')).toBe(true);
  });
});

describe('createTweakPanel: 値の変更が data に反映される (set)', () => {
  it('number 行の oninput が data[k] を更新する', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { size: 10 };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const input = app.querySelector('input[type="number"]') as HTMLInputElement;
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    expect(data.size).toBe(42);
  });

  it('checkbox 行の onchange が data[k] を更新する', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { flag: false };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const input = app.querySelector('input[type="checkbox"]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    expect(data.flag).toBe(true);
  });

  it('nested folder 内の行も set が正しいパスの値を更新する', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { nested: { open: true } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const input = app.querySelector('.ric-tweak-folder input[type="number"]') as HTMLInputElement;
    input.value = '99';
    input.dispatchEvent(new Event('input'));
    expect(data.nested.inner).toBe(99);
  });
});

describe('createTweakPanel: blur 時の clamp (v1 継承、部品固有の責務)', () => {
  it('min/max を超えた値は blur で clamp され、set() で書き戻される', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { size: 10 };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { size: { min: 0, max: 100 } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const input = app.querySelector('input[type="number"]') as HTMLInputElement;
    input.value = '999';
    input.dispatchEvent(new Event('input'));
    expect(data.size).toBe(999); // oninput はそのまま反映 (clamp は blur の責務)
    input.dispatchEvent(new Event('blur'));
    expect(data.size).toBe(100);
    expect(input.value).toBe('100');
  });

  it('badInput 相当 (NaN) の blur は直近の確定値へフォールバックする', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { size: 10 };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { size: { min: 0, max: 100 } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const input = app.querySelector('input[type="number"]') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('blur'));
    expect(input.value).toBe('10');
  });
});

describe('createTweakPanel: Tier2 (keys で部分上書き)', () => {
  it('type: select + options', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { mode: 'a' };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { mode: { type: 'select', options: ['a', 'b', 'c'] } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const select = app.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe('a');
    expect(select.querySelectorAll('option').length).toBe(3);
  });

  it('type: range + min/max/step', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { size: 10 };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { size: { type: 'range', min: 0, max: 20, step: 2 } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const range = app.querySelector('input[type="range"]') as HTMLInputElement;
    expect(range).not.toBeNull();
    expect(range.min).toBe('0');
    expect(range.max).toBe('20');
    expect(range.step).toBe('2');
  });

  it('type: radiobutton + options (fieldset/legend で構成される)', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { mode: 'a' };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { mode: { type: 'radiobutton', options: ['a', 'b'] } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const fieldset = app.querySelector('fieldset.ric-tweak-row--radiobutton') as HTMLFieldSetElement;
    expect(fieldset).not.toBeNull();
    expect(fieldset.querySelector('legend')!.textContent).toBe('mode');
    expect(fieldset.querySelectorAll('input[type="radio"]').length).toBe(2);
  });

  it('label 上書き、disabled、placeholder/maxlength (text)', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nm: 'x' };
    const handle = createApp('#app', {}, () =>
      tweak ? tweak({ data, keys: { nm: { label: 'Name', disabled: true, placeholder: 'ph', maxlength: 5 } } }) : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();

    const row = app.querySelector('.ric-tweak-row') as HTMLElement;
    expect(row.querySelector('.ric-tweak-row__label')!.textContent).toBe('Name');
    const input = row.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe('ph');
    expect(input.maxLength).toBe(5);
  });

  it('false を指定すると行が非表示になる', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { a: 1, b: 2 };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { b: false } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const labels = Array.from(app.querySelectorAll('.ric-tweak-row__label')).map((n) => n.textContent);
    expect(labels).toEqual(['a']);
  });
});

describe('createTweakPanel: Tier3 (rows にカスタム RicNode)', () => {
  it('自動生成行の後ろに rows がそのまま追加される', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { a: 1 };
    const handle = createApp('#app', {}, () =>
      tweak ? tweak({ data, rows: [{ tag: 'div', class: 'my-custom-row', children: ['custom'] }] }) : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();

    const custom = app.querySelector('.my-custom-row');
    expect(custom).not.toBeNull();
    expect(custom!.textContent).toBe('custom');
    // 自動行の後ろに位置する
    const children = Array.from(app.querySelector('.ric-tweak')!.children);
    expect(children[children.length - 1]!.className).toBe('my-custom-row');
  });

  it('data 省略 + rows のみ (stateless 相当の使い方)', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const handle = createApp('#app', {}, () => (tweak ? tweak({ title: 'T', rows: [{ tag: 'span', children: ['x'] }] }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    expect(app.querySelector('.ric-tweak__title')!.textContent).toBe('T');
    expect(app.querySelector('span')!.textContent).toBe('x');
  });
});

describe('createTweakPanel: width', () => {
  it('数値は px 化、文字列はそのまま style.width に反映', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const handle = createApp('#app', {}, () => (tweak ? tweak({ width: 240 }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    expect((app.querySelector('.ric-tweak') as HTMLElement).style.width).toBe('240px');
  });
});

describe('createTweakPanel: folder 開閉', () => {
  it('ヘッダは button+aria-expanded+aria-controls、クリックで開閉しトグルする', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const header = app.querySelector('.ric-tweak-folder__header') as HTMLButtonElement;
    expect(header.tagName).toBe('BUTTON');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(tweak!.isOpen('nested')).toBe(false);

    const body = () => app.querySelector('.ric-tweak-folder__body') as HTMLElement;
    expect(body().getAttribute('role')).toBe('region');
    expect(body().hasAttribute('inert')).toBe(true);
    expect(body().getAttribute('aria-labelledby')).toBe(header.id);
    expect(header.getAttribute('aria-controls')).toBe(body().id);

    header.click();
    await flush();
    expect(tweak!.isOpen('nested')).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(body().hasAttribute('inert')).toBe(false);

    header.click();
    await flush();
    expect(tweak!.isOpen('nested')).toBe(false);
    expect(body().hasAttribute('inert')).toBe(true);
  });

  it('keys.open で初期展開状態を指定できる', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { nested: { open: true } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    expect(tweak!.isOpen('nested')).toBe(true);
    expect((app.querySelector('.ric-tweak-folder__body') as HTMLElement).hasAttribute('inert')).toBe(false);
  });

  it('ネストした folder は path (a.b 形式) で区別される', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { outer: { inner: { deep: 1 } } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { outer: { open: true, keys: { inner: { open: true } } } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    expect(tweak!.isOpen('outer')).toBe(true);
    expect(tweak!.isOpen('outer.inner')).toBe(true);
    // 深い階層のフォルダも DOM に現れる (両方開いているので祖先を辿れる)
    const headers = app.querySelectorAll('.ric-tweak-folder__label');
    const texts = Array.from(headers).map((n) => n.textContent);
    expect(texts).toEqual(['outer', 'inner']);
  });
});

describe('createTweakPanel: radiobutton 行の name 既知制約 (v1 から移植)', () => {
  it('同じ label の radiobutton 行を 2 つ置くと同じ name (= 同一グループ) になる', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const dataA = { mode: 'a' };
    const dataB = { mode: 'b' };
    const handle = createApp('#app', {}, () =>
      tweak
        ? [
            tweak({ data: dataA, keys: { mode: { type: 'radiobutton', options: ['a', 'b'] } } }),
            tweak({ data: dataB, keys: { mode: { type: 'radiobutton', options: ['a', 'b'] } } }),
          ]
        : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();

    const names = new Set(Array.from(app.querySelectorAll('input[type="radio"]')).map((el) => (el as HTMLInputElement).name));
    // 既知の制約: label が同じ ('mode') なので name も同じになり、1 グループに merge される
    expect(names.size).toBe(1);
  });
});

describe('createTweakPanel: keys の get/set (計算値の行、data に無いキーもキーだけで宣言できる)', () => {
  it('data に存在するキーでも get/set があれば data[k] を触らずそちらに委ねる', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { size: 10 };
    let backing = 5;
    const handle = createApp('#app', {}, () =>
      tweak
        ? tweak({
            data,
            keys: {
              size: {
                get: () => backing,
                set: (v) => {
                  backing = v as number;
                },
              },
            },
          })
        : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();

    const input = app.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input.value).toBe('5'); // get() の戻り値 (5) が表示される。data.size (10) ではない
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    expect(backing).toBe(42);
    expect(data.size).toBe(10); // data[k] には一切書き込まれない
  });

  it('data に無いキーでも keys.get だけで行を宣言できる (計算値、歯車DXF のユースケース)', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { module: 2, teeth: 20 };
    const handle = createApp('#app', {}, () =>
      tweak
        ? tweak({
            data,
            keys: {
              // 中心距離 a = module * teeth / 2 (data に存在しない計算値)
              centerDistance: { label: '中心距離', get: () => (data.module * data.teeth) / 2 },
            },
          })
        : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();

    const labels = Array.from(app.querySelectorAll('.ric-tweak-row__label')).map((n) => n.textContent);
    expect(labels).toEqual(['module', 'teeth', '中心距離']); // data 由来の行の後ろに置かれる
    const rows = app.querySelectorAll('[data-ricdom-tweak-key]');
    const last = rows[rows.length - 1] as HTMLElement;
    expect(last.getAttribute('data-ricdom-tweak-key')).toBe('centerDistance');
    expect((last.querySelector('input') as HTMLInputElement).value).toBe('20');
  });

  it('get 未指定 (set のみ、または override 無し) の data に無いキーは行が生成されない', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { a: 1 };
    const handle = createApp('#app', {}, () =>
      tweak
        ? tweak({
            data,
            keys: { orphan: { set: () => {} } },
          })
        : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();

    const labels = Array.from(app.querySelectorAll('.ric-tweak-row__label')).map((n) => n.textContent);
    expect(labels).toEqual(['a']);
  });

  it('data 省略 + keys.get のみでもパネルを組める', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const handle = createApp('#app', {}, () => (tweak ? tweak({ keys: { computed: { get: () => 'hi' } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const input = app.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('hi');
  });

  it('get が例外を投げても render は落ちず console.error のみ (throw しない方針)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { a: 1 };
    const handle = createApp('#app', {}, () =>
      tweak
        ? tweak({
            data,
            keys: {
              bad: {
                get: () => {
                  throw new Error('boom');
                },
              },
            },
          })
        : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();

    expect(app.querySelector('.ric-tweak')).not.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('createTweakPanel: folder override の rows (Tier3 の folder 版)', () => {
  it('folder override.rows がその folder 本体の末尾に描画される', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () =>
      tweak
        ? tweak({
            data,
            keys: {
              nested: {
                open: true,
                rows: [{ tag: 'div', class: 'folder-custom-row', children: ['x'] }],
              },
            },
          })
        : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();

    const body = app.querySelector('.ric-tweak-folder__body-inner') as HTMLElement;
    const children = Array.from(body.children);
    expect(children[children.length - 1]!.className).toBe('folder-custom-row');
    // 自動生成された 'inner' 行より後ろに位置する
    expect(children.length).toBe(2);
  });
});

describe('createTweakPanel: leaf row の安定フック (data-ricdom-role="tweak-row" + data-ricdom-tweak-key)', () => {
  it('各行種別のコンテナに role/key 属性が付く', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = {
      num: 10,
      flag: true,
      name: 'x',
      tint: '#ff0000',
    };
    const handle = createApp('#app', {}, () =>
      tweak
        ? tweak({
            data,
            keys: {
              num: { type: 'range', min: 0, max: 100 },
              mode: { type: 'select', options: ['a', 'b'] },
            },
          })
        : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();

    const rows = app.querySelectorAll('[data-ricdom-role="tweak-row"]');
    // num(range) / flag(checkbox) / name(text) / tint(color) の 4 行 (mode は data に無いので出ない)
    expect(rows.length).toBe(4);
    const keys = Array.from(rows).map((el) => el.getAttribute('data-ricdom-tweak-key'));
    expect(keys.sort()).toEqual(['flag', 'name', 'num', 'tint']);
  });

  it('checkbox 行はラベル span が無い (uiCheckbox 内蔵の label のみ) が role/key は付く', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { flag: true };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const row = app.querySelector('[data-ricdom-role="tweak-row"]') as HTMLElement;
    expect(row.getAttribute('data-ricdom-tweak-key')).toBe('flag');
    expect(row.querySelector('.ric-tweak-row__label')).toBeNull();
  });

  it('key path はネストで dot 連結される (folder 内の行)', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { outer: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { outer: { open: true } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const row = app.querySelector('[data-ricdom-role="tweak-row"]') as HTMLElement;
    expect(row.getAttribute('data-ricdom-tweak-key')).toBe('outer.inner');
  });

  it('計算値 (keys.get) の行にも role/key が付く', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { a: 1 };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { computed: { get: () => 42 } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const rows = app.querySelectorAll('[data-ricdom-role="tweak-row"]');
    const keys = Array.from(rows).map((el) => el.getAttribute('data-ricdom-tweak-key'));
    expect(keys).toContain('computed');
  });
});

describe('createTweakPanel: dispose', () => {
  it('unmount 後は再度呼んでも描画されない', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { a: 1 };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    handle.unmount();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(tweak!({ data })).toBeNull();
    errorSpy.mockRestore();
  });
});

describe('createTweakPanel: 閉じた folder 本体は inert (hidden は付かない、2.0.0-alpha.23)', () => {
  it('閉じている間は inert 属性があり hidden 属性は無い。開くと inert が外れる', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const body = () => app.querySelector('.ric-tweak-folder__body') as HTMLElement;
    expect(body().hasAttribute('inert')).toBe(true);
    expect(body().hasAttribute('hidden')).toBe(false);
    expect(body().getAttribute('role')).toBe('region');

    (app.querySelector('.ric-tweak-folder__header') as HTMLElement).click();
    await flush();
    expect(body().hasAttribute('inert')).toBe(false);
    expect(body().hasAttribute('hidden')).toBe(false);
  });
});

describe('createTweakPanel: folder の summary (閉じている間だけ、alpha.23)', () => {
  const mount = async (summary: unknown, extra: Record<string, unknown> = {}) => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 }, leaf: 5 };
    const handle = createApp('#app', {}, () =>
      tweak ? tweak({ data, keys: { nested: { summary: summary as never, ...extra }, leaf: { summary: 'ignored' as never } } }) : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();
    return { app, tweak: tweak! };
  };
  const summaryEl = (app: HTMLElement) => app.querySelector('.ric-tweak-folder__summary') as HTMLElement | null;

  it('文字列の summary は閉じている間だけ出る (aria-hidden + role)。開くと消え、閉じると戻る', async () => {
    const { app } = await mount('M2.5 / 24T');
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLElement;

    const el = summaryEl(app)!;
    expect(el).not.toBeNull();
    expect(el.textContent).toBe('M2.5 / 24T');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('data-ricdom-role')).toBe('tweak-folder-summary');
    // ヘッダ内の並びは label → summary → arrow
    const kids = Array.from(header.children).map((c) => c.getAttribute('class') ?? '');
    expect(kids[0]).toContain('ric-tweak-folder__label');
    expect(kids[1]).toContain('ric-tweak-folder__summary');
    expect(kids[2]).toContain('ric-tweak-folder__arrow');

    header.click();
    await flush();
    expect(summaryEl(app)).toBeNull();

    header.click();
    await flush();
    expect(summaryEl(app)!.textContent).toBe('M2.5 / 24T');
  });

  it('RicNode の summary も渡せる', async () => {
    const { app } = await mount({ tag: 'b', class: 'sum-b', children: ['bold'] });
    const el = summaryEl(app)!;
    expect(el.querySelector('b.sum-b')!.textContent).toBe('bold');
  });

  it('keys[k].open: true で最初から開いていれば summary は出ない', async () => {
    const { app } = await mount('x', { open: true });
    expect(summaryEl(app)).toBeNull();
  });

  it('null / undefined / 空文字なら出さない', async () => {
    for (const v of [null, undefined, '']) {
      const { app } = await mount(v);
      expect(summaryEl(app)).toBeNull();
    }
  });

  it('leaf 行の summary は無視される (folder 専用)', async () => {
    const { app } = await mount(undefined);
    expect(app.querySelector('[data-ricdom-tweak-key="leaf"]')).not.toBeNull();
    expect(app.querySelector('.ric-tweak-folder__summary')).toBeNull();
  });
});

describe('createTweakPanel: folder に data-ricdom-tweak-key (alpha.23)', () => {
  it('folder コンテナに dot 連結のキー鎖が付く (ネストは a.b)', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { a: { b: { c: 1 } }, top: 1 };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const folders = Array.from(app.querySelectorAll('[data-ricdom-role="tweak-folder"]'));
    expect(folders.map((f) => f.getAttribute('data-ricdom-tweak-key'))).toEqual(['a', 'a.b']);
    expect(folders[0]!.classList.contains('ric-tweak-folder')).toBe(true);
    // leaf 行は従来どおり (folder と同じ属性で取れるが role で区別できる)
    expect(app.querySelector('[data-ricdom-role="tweak-row"][data-ricdom-tweak-key="top"]')).not.toBeNull();
  });
});

describe('createTweakPanel: folder の controlled open / onToggle (alpha.23)', () => {
  const NESTED = () => ({ outer: { inner: { deep: 1 } }, other: { x: 1 } });

  it('controlled: クリックは onToggle(path, next, nextMap) を呼ぶだけで、props が変わるまで表示は変わらない', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const calls: [string, boolean, Record<string, boolean>][] = [];
    let open: Record<string, boolean> = { outer: true };
    const data = NESTED();
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, open, onToggle: (p, n, m) => calls.push([p, n, m]) }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const header = (path: string) => app.querySelector(`[data-ricdom-tweak-key="${path}"] > .ric-tweak-folder__header`) as HTMLElement;
    expect(header('outer').getAttribute('aria-expanded')).toBe('true');
    expect(header('other').getAttribute('aria-expanded')).toBe('false');
    // 入れ子の inner は open に無いので閉じている (missing key = closed)
    expect(header('outer.inner').getAttribute('aria-expanded')).toBe('false');

    header('other').click();
    await flush();
    expect(calls).toEqual([['other', true, { outer: true, other: true }]]);
    // 親が open を更新しない限り表示は変わらない
    expect(header('other').getAttribute('aria-expanded')).toBe('false');
    expect(tweak!.isOpen('other')).toBe(false);

    // 開いている folder のクリックは next=false
    header('outer').click();
    await flush();
    expect(calls[1]).toEqual(['outer', false, { outer: false }]);
    expect(header('outer').getAttribute('aria-expanded')).toBe('true');

    // props を差し替えると反映される。isOpen() も controlled の値を返す
    open = { outer: true, other: true, 'outer.inner': true };
    handle.renderNow();
    expect(header('other').getAttribute('aria-expanded')).toBe('true');
    expect(header('outer.inner').getAttribute('aria-expanded')).toBe('true');
    expect(tweak!.isOpen('other')).toBe(true);
    expect(tweak!.isOpen('outer.inner')).toBe(true);
    expect(tweak!.isOpen('nope')).toBe(false);
  });

  it('controlled では keys[k].open の初期値は無視される', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, open: {}, keys: { nested: { open: true } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    expect(tweak!.isOpen('nested')).toBe(false);
    expect((app.querySelector('.ric-tweak-folder__header') as HTMLElement).getAttribute('aria-expanded')).toBe('false');
    expect(app.querySelector('.ric-tweak-folder__body')!.hasAttribute('inert')).toBe(true);
  });

  it('controlled で onToggle 未指定ならクリックしても何も起きない (例外も出ない)', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, open: {} }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLElement;
    header.click();
    await flush();
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('uncontrolled は従来どおり内部状態で開閉し、onToggle は呼ばれない (createAccordion と同じ)', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const onToggle = vi.fn();
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, onToggle, keys: { nested: { open: true } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLElement;
    expect(header.getAttribute('aria-expanded')).toBe('true'); // keys.open が seed
    header.click();
    await flush();
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(tweak!.isOpen('nested')).toBe(false);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('controlled から uncontrolled に戻すと内部 openMap (keys.open の seed) に従う', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    let open: Record<string, boolean> | undefined = { nested: false };
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, open, keys: { nested: { open: true } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    expect(tweak!.isOpen('nested')).toBe(false);
    open = undefined;
    handle.renderNow();
    expect(tweak!.isOpen('nested')).toBe(true);
    expect((app.querySelector('.ric-tweak-folder__header') as HTMLElement).getAttribute('aria-expanded')).toBe('true');
  });
});
