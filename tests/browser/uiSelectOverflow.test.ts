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
  // フォーカスが無ければ、コアが毎 render で select.value を入れ直すのでその render で追従する。
  // フォーカス中は編集中ガードで value を入れ直さないが、コアが「枠の中が古い」ときだけ
  // 写し直させる (2.0.0-alpha.35。alpha.30〜34 は、フォーカスが外れた後の render まで古い文字が
  // 残る「既知の制限」だった)。
  it('選んでいる選択肢の文字が後から変わったら、枠の中の文字も変わる (フォーカス中でも、その render で)', async () => {
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

    // フォーカスあり: 同じ render で枠の中も変わる。選択とフォーカスは動かない
    sel.focus();
    expect(document.activeElement).toBe(sel);
    handle.lang = 'en';
    handle.renderNow();
    expect(sel.options[1]!.textContent).toBe('Japanese'); // 前提: option の文字は変わった
    expect(shownText(sel)).toBe('Japanese');
    expect(sel.value).toBe('ja');
    expect(document.activeElement).toBe(sel);
  });

  // ── フォーカス中の写し直し (2.0.0-alpha.35、コア src/dom.ts の reapplySelectValue) ──
  // 写し直させる手段は `selectedIndex = selectedIndex` (選択を変えずにブラウザに写し直させる)。
  // 編集中ガードが守っているもの (利用者がいま選んでいる途中の状態) を壊さないよう、
  // 「枠の中が、選ばれている option の中身と違うとき」だけ実行する。
  describe('フォーカス中の写し直しは、枠の中が古いときだけ行う (2.0.0-alpha.35)', () => {
    // selectedIndex への代入回数を数える (要素自身にプロパティを被せ、本来の動作へ中継する)
    const countIndexWrites = (sel: HTMLSelectElement): (() => number) => {
      const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex')!;
      let n = 0;
      Object.defineProperty(sel, 'selectedIndex', {
        configurable: true,
        get: () => proto.get!.call(sel),
        set: (v: number) => {
          n += 1;
          proto.set!.call(sel, v);
        },
      });
      return () => n;
    };
    const labels = (lang: string): { value: string; label: string }[] => [
      { value: 'en', label: lang === 'en' ? 'English' : '英語' },
      { value: 'ja', label: lang === 'en' ? 'Japanese' : '日本語' },
    ];

    it('文字が変わっていない render では何も代入しない / 変わった render で 1 回だけ', async () => {
      const app = themedApp(320);
      const handle = createApp('#app', { lang: 'en', tick: 0 }, (s) => ({ tag: 'div', 'data-tick': s.tick, children: [uiSelect({ value: 'ja', options: labels(s.lang) })] }));
      await flush();
      const sel = selectOf(app);
      sel.focus();
      const writes = countIndexWrites(sel);

      handle.tick = 1;
      handle.renderNow();
      handle.tick = 2;
      handle.renderNow();
      expect(writes(), '文字が変わらない render').toBe(0);

      handle.lang = 'ja';
      handle.renderNow();
      expect(shownText(sel)).toBe('日本語');
      expect(writes(), '文字が変わった render').toBe(1);

      handle.tick = 3;
      handle.renderNow();
      expect(writes(), 'その後の render').toBe(1);
    });

    it('利用者が選び直した選択 (state はまだ古い) を、写し直しが巻き戻さない', async () => {
      const app = themedApp(320);
      // onchange を受けない = state.v は 'ja' のまま。フォーカス中は利用者の選択を残すのが編集中ガード
      const handle = createApp('#app', { lang: 'en' }, (s) => uiSelect({ value: 'ja', options: labels(s.lang) }));
      await flush();
      const sel = selectOf(app);
      sel.focus();
      sel.selectedIndex = 0; // 利用者が English を選んだ状態
      expect(shownText(sel)).toBe('English');

      handle.lang = 'ja'; // 選ばれている option の文字が変わる render
      handle.renderNow();
      expect(sel.value, '選択は利用者のまま').toBe('en');
      expect(shownText(sel), '枠の中は、利用者が選んだ option の新しい文字').toBe('英語');
    });

    it('同じ value の option が複数あっても、選択が先頭へ移らない', async () => {
      const app = themedApp(320);
      const handle = createApp('#app', { suffix: '' }, (s) =>
        uiSelect({
          value: 'x',
          options: [
            { value: 'x', label: `first${s.suffix}` },
            { value: 'x', label: `second${s.suffix}` },
          ],
        }),
      );
      await flush();
      const sel = selectOf(app);
      sel.focus();
      sel.selectedIndex = 1;
      handle.suffix = '!';
      handle.renderNow();
      expect(sel.selectedIndex).toBe(1);
      expect(shownText(sel)).toBe('second!');
    });

    it('一覧を開いてキーボードで選んでいる最中でも、一覧は閉じず、選んでいる位置も動かない', async () => {
      const app = themedApp(320);
      const handle = createApp('#app', { lang: 'en' }, (s) => uiSelect({ value: 'ja', options: [...labels(s.lang), { value: 'fr', label: s.lang === 'en' ? 'French' : 'フランス語' }] }));
      await flush();
      const sel = selectOf(app);
      await userEvent.click(sel);
      await flush(100);
      expect(sel.matches(':open'), '前提: 一覧が開いている').toBe(true);
      await userEvent.keyboard('{ArrowDown}');
      const focused = document.activeElement;

      handle.lang = 'ja';
      handle.renderNow();
      expect(sel.matches(':open'), '一覧は開いたまま').toBe(true);
      expect(document.activeElement, 'キーボードで選んでいる位置').toBe(focused);
      expect(sel.value, '確定済みの選択').toBe('ja');
      expect(shownText(sel)).toBe('日本語');
      await userEvent.keyboard('{Escape}');
    });

    it('value を渡していない素の <select> でも、選ばれている option の文字が変われば枠の中が変わる', async () => {
      const app = themedApp(320);
      const handle = createApp('#app', { lang: 'en' }, (s) => ({
        tag: 'select',
        class: 'ric-select',
        children: [{ tag: 'button', children: [{ tag: 'selectedcontent', island: true }] }, ...labels(s.lang).map((o) => ({ tag: 'option', value: o.value, children: [o.label] }))],
      }));
      await flush();
      const sel = selectOf(app);
      expect(shownText(sel)).toBe('English');
      handle.lang = 'ja';
      handle.renderNow();
      expect(shownText(sel), 'フォーカスなし').toBe('英語');
      sel.focus();
      handle.lang = 'en';
      handle.renderNow();
      expect(shownText(sel), 'フォーカスあり').toBe('English');
    });

    it('multiple の <select> には手を出さない (複数の選択が 1 つに潰れない)', async () => {
      const app = themedApp(320);
      const handle = createApp('#app', { lang: 'en' }, (s) => ({
        tag: 'select',
        multiple: true,
        children: [{ tag: 'button', children: [{ tag: 'selectedcontent', island: true }] }, ...labels(s.lang).map((o) => ({ tag: 'option', value: o.value, children: [o.label] }))],
      }));
      await flush();
      const sel = app.querySelector('select') as HTMLSelectElement;
      sel.options[0]!.selected = true;
      sel.options[1]!.selected = true;
      sel.focus();
      const writes = countIndexWrites(sel);
      handle.lang = 'ja';
      handle.renderNow();
      expect(Array.from(sel.selectedOptions).map((o) => o.value)).toEqual(['en', 'ja']);
      expect(writes()).toBe(0);
    });
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

  // 2.0.0-alpha.35: 中の <button> は <selectedcontent> を置くための入れ物で、見た目を持たない
  // (display: contents)。それでも継承されるプロパティ (文字の大きさ・書体・色など) は、ボタンを
  // 経由して枠の中の文字に届く。ページが `button { font-size: 1.2rem; }` のように要素名で
  // ボタンを装飾していると、セレクトの枠の中の文字だけがその大きさになった
  // (サンプル 01-hello のナビで実際に起きた。開いた一覧の文字は影響を受けない)。
  // 枠の中の文字は、ページのボタン向けの規則ではなく `.ric-select` 自身に従う。
  describe('ページの button 向けの規則は、枠の中の文字に届かない (2.0.0-alpha.35)', () => {
    const INHERITED = ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'color', 'letterSpacing', 'wordSpacing', 'textTransform', 'lineHeight', 'cursor'] as const;
    const pick = (el: Element): Record<string, string> => {
      const cs = getComputedStyle(el);
      return Object.fromEntries(INHERITED.map((k) => [k, cs[k]]));
    };
    const withPageCss = async (css: string, run: (sel: HTMLSelectElement, sc: HTMLElement) => void): Promise<void> => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style); // injectStyles より後ろ = 同じ強さならページ側が勝つ並び
      try {
        const app = themedApp(320);
        createApp('#app', {}, () => ({ tag: 'div', class: 'toolbar', children: [uiSelect({ value: LONG, options: OPTIONS }), { tag: 'button', id: 'plain', children: ['+'] }] }));
        await flush();
        const sel = selectOf(app);
        run(sel, sel.querySelector('selectedcontent') as HTMLElement);
      } finally {
        style.remove();
      }
    };
    const PAGE_BUTTON = 'font-size: 30px; font-family: serif; font-weight: 700; font-style: italic; color: rgb(255, 0, 0); letter-spacing: 3px; word-spacing: 5px; text-transform: uppercase; line-height: 3; cursor: wait;';

    it('要素名だけの規則 (button { … })', async () => {
      await withPageCss(`button { ${PAGE_BUTTON} }`, (sel, sc) => {
        expect(getComputedStyle(document.getElementById('plain')!).fontSize, '前提: ページの規則は普通のボタンに効いている').toBe('30px');
        expect(pick(sc)).toEqual(pick(sel));
        expectFits(sel, 'ページの button 規則あり');
      });
    });

    it('クラスや id を含む、より強い規則 (.toolbar button / #app button)', async () => {
      await withPageCss(`.toolbar button { ${PAGE_BUTTON} } #app button { font-size: 28px; color: rgb(0, 0, 255); }`, (sel, sc) => {
        expect(getComputedStyle(document.getElementById('plain')!).fontSize, '前提: ページの規則は普通のボタンに効いている').toBe('28px');
        expect(pick(sc)).toEqual(pick(sel));
        expectFits(sel, 'ページの強い button 規則あり');
      });
    });

    it('枠の中の文字を変えたいときは selectedcontent を指す規則が効く', async () => {
      await withPageCss('.ric-select selectedcontent { font-weight: 700; }', (sel, sc) => {
        expect(getComputedStyle(sc).fontWeight).toBe('700');
        expect(getComputedStyle(sel).fontWeight).toBe('400');
      });
    });
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
