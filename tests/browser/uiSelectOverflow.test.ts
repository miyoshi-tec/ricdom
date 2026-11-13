// 実ブラウザ契約テスト: uiSelect は、選んだ選択肢の文字が幅より長くても 1 行に収まり、
// 「…」で省略される (2.0.0-alpha.30、歯車DXFジェネレーターの報告)。
//
// 背景: `.ric-select` は `appearance: base-select` で描く。この見た目では、選んだ文字は
// 普通の文字として流し込まれ、幅が足りないと折り返す (OS の見た目のセレクトは 1 行で切る)。
// 高さは `--ric-control-h` 固定なので、折り返した行が枠の上下にはみ出して前後の行と重なる。
// tweak パネルの行 (セレクトの幅は 100px 前後) では「S45C（炭素鋼）」程度の長さで起きる。
// `.ric-select` に nowrap / overflow / text-overflow を足すだけでは直らない (文字は切れるが
// 「…」が出ず、右端の矢印が枠の外へ押し出される。実測)。
//
// 直し方: セレクトの先頭に `<button><selectedcontent></selectedcontent></button>` を置く。
// `<selectedcontent>` は、選んだ option の中身をブラウザが写して入れる要素で、ここに
// 省略の CSS を当てる。中身はブラウザが書くので ricdom の差分の対象から外す (island)。
//
// jsdom にはレイアウトも base-select も無いので、実ブラウザでしか検証できない。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { applyTheme } from '../../src/ui/theme.js';
import { uiSelect } from '../../src/ui/select.js';
import { createTweakPanel } from '../../src/ui/tweakPanel.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

const LONG = 'PLA（樹脂・3Dプリント用）';
const OPTIONS = [LONG, 'POM（樹脂・ポリアセタール）', 'S45C（炭素鋼）', 'A5052（アルミ）', '任意'];

// 寸法は --ric-* 変数で書かれているので、テーマを当てないと 0 になり検証にならない
const themedApp = (width: number): HTMLDivElement => {
  const app = setupApp();
  applyTheme(app, { theme: 'light', density: 'compact' });
  app.style.width = `${width}px`;
  app.style.fontSize = '13px';
  return app;
};

const selectOf = (root: ParentNode): HTMLSelectElement => root.querySelector('select.ric-select') as HTMLSelectElement;
const shownText = (sel: HTMLSelectElement): string => sel.querySelector('selectedcontent')?.textContent ?? '(selectedcontent なし)';

// 枠の内側に中身が収まっているか (折り返しも横あふれも無い) と、外形の高さが 1 行分のままか
const expectFits = (sel: HTMLSelectElement, label: string): void => {
  const controlH = parseFloat(getComputedStyle(sel).getPropertyValue('--ric-control-h'));
  expect(controlH, `${label}: 前提 = テーマの寸法が当たっている`).toBeGreaterThan(0);
  expect(getComputedStyle(sel).appearance, `${label}: 前提 = base-select で描いている`).toBe('base-select');
  expect(sel.scrollHeight, `${label}: 中身の高さ ≤ 枠の内寸`).toBeLessThanOrEqual(sel.clientHeight);
  expect(sel.scrollWidth, `${label}: 中身の幅 ≤ 枠の内寸`).toBeLessThanOrEqual(sel.clientWidth);
  expect(sel.getBoundingClientRect().height, `${label}: 外形の高さ`).toBeCloseTo(controlH, 0);
};

describe('実ブラウザ: uiSelect は選んだ文字が長くても枠に収まる (2.0.0-alpha.30)', () => {
  it('幅 112px で、どの選択肢を選んでも 1 行に収まり、長いものは省略される', async () => {
    const app = themedApp(112);
    const handle = createApp('#app', { v: LONG }, (s) => uiSelect({ value: s.v, options: OPTIONS }));
    await flush();
    const sel = selectOf(app);

    for (const opt of OPTIONS) {
      handle.v = opt;
      handle.renderNow();
      expect(sel.value).toBe(opt);
      expectFits(sel, opt);
      expect(shownText(sel), `${opt}: 枠の中の文字`).toBe(opt);
    }

    // 長い選択肢は「…」で切れている (= 文字の箱が縮み、中身のほうが広い)。右端の矢印の分の
    // 余白が残っている (文字の箱の右端が、枠の右端より内側にある)
    handle.v = LONG;
    handle.renderNow();
    const sc = sel.querySelector('selectedcontent') as HTMLElement;
    expect(getComputedStyle(sc).textOverflow).toBe('ellipsis');
    expect(sc.scrollWidth).toBeGreaterThan(sc.clientWidth);
    expect(sc.getBoundingClientRect().right).toBeLessThan(sel.getBoundingClientRect().right - 10);
  });

  it('幅が足りていれば省略されず、全文が出る', async () => {
    const app = themedApp(320);
    createApp('#app', {}, () => uiSelect({ value: LONG, options: OPTIONS }));
    await flush();
    const sel = selectOf(app);
    expectFits(sel, LONG);
    const sc = sel.querySelector('selectedcontent') as HTMLElement;
    expect(sc.textContent).toBe(LONG);
    expect(sc.scrollWidth).toBeLessThanOrEqual(sc.clientWidth);
  });

  it('tweak パネルの行 (ラベルと並ぶ狭いセレクト) でも収まる', async () => {
    const app = themedApp(220);
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { material: LONG };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { material: { type: 'select', options: OPTIONS } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    const sel = selectOf(app);
    expect(sel.getBoundingClientRect().width).toBeLessThan(140); // 前提: 長い選択肢が入らない幅
    expectFits(sel, 'tweak の行');
    expect(shownText(sel)).toBe(LONG);
  });

  it('一覧から選ぶと枠の中の文字が変わり、change が出る', async () => {
    const app = themedApp(112);
    const changes: string[] = [];
    const handle = createApp('#app', { v: LONG }, (s) =>
      uiSelect({
        value: s.v,
        options: OPTIONS,
        onchange: (ev) => {
          const next = (ev.target as HTMLSelectElement).value;
          changes.push(next);
          handle.v = next;
        },
      }),
    );
    await flush();
    const sel = selectOf(app);

    await userEvent.selectOptions(sel, '任意');
    await flush();
    expect(changes).toEqual(['任意']);
    expect(sel.value).toBe('任意');
    expect(shownText(sel)).toBe('任意');
    expectFits(sel, '選び直した後');
  });

  // ブラウザは、選ばれている option の文字が後から変わっても <selectedcontent> を写し直さない。
  // コアが毎 render で select.value を入れ直すので、フォーカスが無ければその render で追従する。
  // フォーカス中は編集中ガードで入れ直さないので古い文字が残る (既知の制限、SPEC §10.1)。
  // 後半はその制限を「現状の挙動」として固定している: 直したらこのテストを書き換えること。
  it('選んでいる選択肢の文字が後から変わったら、枠の中の文字も変わる (フォーカス中は、外れた後の render で)', async () => {
    const app = themedApp(320);
    const handle = createApp('#app', { lang: 'en' }, (s) =>
      uiSelect({
        value: 'ja',
        options: [
          { value: 'en', label: s.lang === 'en' ? 'English' : '英語' },
          { value: 'ja', label: s.lang === 'en' ? 'Japanese' : '日本語' },
        ],
      }),
    );
    await flush();
    const sel = selectOf(app);
    expect(shownText(sel)).toBe('Japanese');

    // フォーカスなし
    handle.lang = 'ja';
    handle.renderNow();
    expect(shownText(sel)).toBe('日本語');

    // フォーカスあり: option の文字は変わるが、枠の中は古いまま (既知の制限)
    sel.focus();
    expect(document.activeElement).toBe(sel);
    handle.lang = 'en';
    handle.renderNow();
    expect(sel.options[1]!.textContent).toBe('Japanese'); // 前提: option の文字は変わった
    expect(shownText(sel), '既知の制限: フォーカス中は古い文字が残る').toBe('日本語');
    expect(sel.value).toBe('ja');

    // フォーカスが外れた後の render で追従する
    sel.blur();
    handle.renderNow();
    expect(shownText(sel)).toBe('Japanese');
  });

  it('中のボタンは Tab で止まらず、開いた一覧では選択肢の全文が見える', async () => {
    const app = themedApp(112);
    createApp('#app', {}, () => ({
      tag: 'div',
      children: [{ tag: 'input', id: 'before' }, uiSelect({ value: LONG, options: OPTIONS }), { tag: 'input', id: 'after' }],
    }));
    await flush();
    const sel = selectOf(app);

    (app.querySelector('#before') as HTMLElement).focus();
    await userEvent.tab();
    expect(document.activeElement, 'Tab 1 回でセレクト自身に止まる').toBe(sel);
    await userEvent.tab();
    expect(document.activeElement, '次の Tab で中のボタンに止まらず先へ進む').toBe(app.querySelector('#after'));

    await userEvent.click(sel);
    await flush(100);
    expect(sel.matches(':open'), '前提: 一覧が開いている').toBe(true);
    const first = sel.options[0]!;
    expect(first.scrollWidth, '一覧の中の選択肢は省略されない').toBeLessThanOrEqual(first.clientWidth);
    expect(first.getBoundingClientRect().width).toBeGreaterThan(sel.getBoundingClientRect().width);
    await userEvent.keyboard('{Escape}');
  });

  it('placeholder・選択肢の入れ替え・選択肢なしでも、先頭の子はボタンのままで高さは変わらない', async () => {
    const app = themedApp(112);
    const handle = createApp('#app', { v: '', opts: OPTIONS as string[] }, (s) => uiSelect({ value: s.v, options: s.opts, placeholder: '材質を選んでください' }));
    await flush();
    const sel = selectOf(app);
    expect(shownText(sel)).toBe('材質を選んでください');
    expectFits(sel, 'placeholder');

    handle.opts = ['鉄（一般構造用圧延鋼材）', '銅'];
    handle.v = '鉄（一般構造用圧延鋼材）';
    handle.renderNow();
    expect(sel.firstElementChild!.tagName).toBe('BUTTON');
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['', '鉄（一般構造用圧延鋼材）', '銅']);
    expect(shownText(sel)).toBe('鉄（一般構造用圧延鋼材）');
    expectFits(sel, '入れ替え後');

    handle.opts = [];
    handle.v = '';
    handle.renderNow();
    expect(shownText(sel)).toBe('材質を選んでください');
    expectFits(sel, '選択肢なし');
  });
});
