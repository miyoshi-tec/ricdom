// 実ブラウザ回帰テスト: createTweakPanel (設計書 §7)
//
// v1 の v0.3.37 バグ (number 行で小数点を打っている最中に別 state の再 render が走ると
// 入力が潰れる) が、v2 のコア規則 (編集中ガード、src/dom.ts の shouldSkipValueReapply) に
// 一般化されたことで **構造的に消えている** ことを実証する。tweakPanel.ts の number 行は
// v1 と違い onfocus マーカー等の局所対応を一切持たない (ヘッダコメント参照) — この
// テストはその設計判断そのものの回帰テストになる。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createTweakPanel } from '../../src/ui/tweakPanel.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

describe('実ブラウザ: createTweakPanel の number 行', () => {
  it('小数点を打っている最中 (userEvent.type) に無関係な state の再 render が走っても入力が潰れない', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { size: 1 };
    let other = 0;
    const handle = createApp('#app', {}, () => (tweak ? [tweak({ data }), String(other)] : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const input = app.querySelector('input[type="number"]') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.clear(input);
    // "0.3" を実際のキー入力で打つ (v1 のバグ報告と同じ操作: 打鍵の途中で "0." のような
    // badInput 状態を経由する)。
    await userEvent.type(input, '0.3');

    const typedValue = input.value;
    expect(typedValue).toBe('0.3');

    // 無関係な state 変更で再描画をトリガーする (data.size 自体は変えていない)。
    other = 1;
    handle.renderNow();
    await flush();

    // 編集中ガードが効き、打鍵直後の内容がそのまま保たれる (v1 なら "0.3" → "30" のように
    // 壊れていた実害)。
    expect(input.value).toBe(typedValue);
    expect(document.activeElement).toBe(input);
  });

  it('blur すると min/max の clamp を経て確定値が data に書き戻される', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { size: 1 };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, keys: { size: { min: 0, max: 10 } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const input = app.querySelector('input[type="number"]') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.type(input, '99'); // "1" の末尾に追記 → "199" (min/max: 0-10 を超える)
    expect(input.value).toBe('199');
    input.blur();
    await flush();

    expect(data.size).toBe(10); // clamp された確定値
    expect(input.value).toBe('10');
  });
});

describe('実ブラウザ: createTweakPanel の folder 開閉', () => {
  it('ヘッダをクリックすると実際に inert が切り替わり、中の行が見える/見えなくなる', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();

    const header = app.querySelector('.ric-tweak-folder__header') as HTMLButtonElement;
    const body = () => app.querySelector('.ric-tweak-folder__body') as HTMLElement;

    expect(body().inert).toBe(true);

    await userEvent.click(header);
    await flush();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(body().inert).toBe(false);
    // 折りたたみが開いた状態では実際に中の number input が操作可能 (見えている)
    const innerInput = app.querySelector('.ric-tweak-folder input[type="number"]') as HTMLInputElement;
    expect(innerInput).not.toBeNull();
    await userEvent.click(innerInput);
    expect(document.activeElement).toBe(innerInput);

    await userEvent.click(header);
    await flush();
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(body().inert).toBe(true);
  });
});

// ── ギア軽量化デモ報告 (14 番目の consumer、alpha.22 で計測): 閉じた folder 本体は
// `display: grid` (閉じアニメーション用) が UA の `[hidden] { display: none }` に勝つため、
// `hidden` 属性には a11y 上の効果が無く、中の input が Tab でフォーカスされ AX ツリーにも
// 残っていた。alpha.23 から `inert` で除外する。
describe('実ブラウザ: createTweakPanel の閉じた folder は inert (フォーカス・AX ツリーから除外)', () => {
  const mount = async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { a: 1, b: 2 } };
    const handle = createApp('#app', {}, () => (tweak ? [tweak({ data }), { tag: 'button', id: 'after', children: ['after'] }] : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    return { app, handle };
  };

  it('閉じた folder のヘッダから Tab すると、中の input ではなく後ろの button にフォーカスが移る', async () => {
    const { app } = await mount();
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLButtonElement;
    header.focus();
    expect(document.activeElement).toBe(header);

    await userEvent.tab();
    expect(document.activeElement).toBe(document.getElementById('after'));
  });

  it('開くと Tab で中の input に入れる (inert が外れている)', async () => {
    const { app } = await mount();
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLButtonElement;
    await userEvent.click(header);
    await flush();

    await userEvent.tab();
    expect(document.activeElement).toBe(app.querySelector('.ric-tweak-folder input[type="number"]'));
  });

  it('body.inert は閉じている間 true、開くと false。閉じても display: grid のままで、閉じ後は高さ 0', async () => {
    const { app } = await mount();
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLButtonElement;
    const body = app.querySelector('.ric-tweak-folder__body') as HTMLElement;

    expect(body.inert).toBe(true);
    // クローズアニメーション (grid-template-rows) を温存するため display は grid のまま
    expect(getComputedStyle(body).display).toBe('grid');
    expect(body.getBoundingClientRect().height).toBe(0);
    // 中の要素はレイアウトボックスを持ち続ける (inert なので操作・AX からは除外される)
    expect(body.querySelector('input')).not.toBeNull();

    await userEvent.click(header);
    await flush();
    expect(body.inert).toBe(false);
    await new Promise((r) => setTimeout(r, 400)); // transition 完了を待つ
    expect(body.getBoundingClientRect().height).toBeGreaterThan(0);

    await userEvent.click(header);
    await flush();
    expect(body.inert).toBe(true);
    expect(getComputedStyle(body).display).toBe('grid');
    await new Promise((r) => setTimeout(r, 400));
    expect(body.getBoundingClientRect().height).toBe(0);
  });
});

// ── summary (閉じた folder のヘッダに出す要約、alpha.23): 長い要約は省略記号で切れ、
// ラベルは全文を保ち、開閉矢印はヘッダからはみ出さない。実レイアウトは jsdom では測れない。
describe('実ブラウザ: createTweakPanel folder の summary レイアウト (幅 240px)', () => {
  const mount = async (summary: string, label?: string) => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, width: 240, keys: { nested: { ...(label ? { label } : {}), summary } } }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    return { app, handle };
  };

  it('長い要約は省略記号で切れ (scrollWidth > clientWidth)、ラベルは全文、矢印はヘッダ内に収まる', async () => {
    const { app } = await mount('モジュール 2.5 / 歯数 24 / 圧力角 20° / 幅 30mm / 材質 S45C 焼入れ');
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLElement;
    const label = app.querySelector('.ric-tweak-folder__label') as HTMLElement;
    const summary = app.querySelector('.ric-tweak-folder__summary') as HTMLElement;
    const arrow = app.querySelector('.ric-tweak-folder__arrow') as Element;

    expect(getComputedStyle(summary).textOverflow).toBe('ellipsis');
    expect(summary.scrollWidth).toBeGreaterThan(summary.clientWidth); // 実際に切れている
    expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth); // ラベルは切れない
    expect(label.getBoundingClientRect().height).toBeLessThan(30); // 折り返していない (1 行)

    const h = header.getBoundingClientRect();
    const a = arrow.getBoundingClientRect();
    const s = summary.getBoundingClientRect();
    expect(a.width).toBeGreaterThan(0);
    expect(a.left).toBeGreaterThanOrEqual(h.left);
    expect(a.right).toBeLessThanOrEqual(h.right);
    // 要約は矢印に重ならない
    expect(s.right).toBeLessThanOrEqual(a.left + 0.5);
    // ラベル → 要約 → 矢印の順で左から並ぶ
    expect(label.getBoundingClientRect().right).toBeLessThanOrEqual(s.left + 0.5);
  });

  it('短い要約は切れず、ラベルの直後に左寄せで並ぶ (矢印は右端)', async () => {
    const { app } = await mount('M2.5');
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLElement;
    const label = app.querySelector('.ric-tweak-folder__label') as HTMLElement;
    const summary = app.querySelector('.ric-tweak-folder__summary') as HTMLElement;
    const arrow = app.querySelector('.ric-tweak-folder__arrow') as Element;
    expect(summary.scrollWidth).toBeLessThanOrEqual(summary.clientWidth);
    // 要約のテキストはラベルのすぐ右 (ヘッダ中央に浮かない)
    const textLeft = summary.getBoundingClientRect().left;
    expect(textLeft - label.getBoundingClientRect().right).toBeLessThan(24);
    expect(header.getBoundingClientRect().right - arrow.getBoundingClientRect().right).toBeLessThan(24);
  });

  it('要約なしの folder でも矢印は従来どおり右端 (ラベルの flex:1 を外した影響が無い)', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const handle = createApp('#app', {}, () => (tweak ? tweak({ data, width: 240 }) : null));
    tweak = handle.use(createTweakPanel());
    await flush();
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLElement;
    const arrow = app.querySelector('.ric-tweak-folder__arrow') as Element;
    expect(header.getBoundingClientRect().right - arrow.getBoundingClientRect().right).toBeLessThan(24);
  });

  it('ラベル自体が長くて要約もある場合でも矢印はヘッダからはみ出さない', async () => {
    const { app } = await mount('M2.5 / 24T', 'とても長いフォルダ名とても長いフォルダ名とても長いフォルダ名');
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLElement;
    const arrow = app.querySelector('.ric-tweak-folder__arrow') as Element;
    const h = header.getBoundingClientRect();
    const a = arrow.getBoundingClientRect();
    expect(a.right).toBeLessThanOrEqual(h.right);
    expect(a.width).toBeGreaterThan(0);
  });

  it('開くと要約は消え、閉じると戻る (実ブラウザの click 経由)', async () => {
    const { app } = await mount('M2.5');
    const header = app.querySelector('.ric-tweak-folder__header') as HTMLButtonElement;
    expect(app.querySelector('.ric-tweak-folder__summary')).not.toBeNull();
    await userEvent.click(header);
    await flush();
    expect(app.querySelector('.ric-tweak-folder__summary')).toBeNull();
    await userEvent.click(header);
    await flush();
    expect(app.querySelector('.ric-tweak-folder__summary')).not.toBeNull();
  });
});

// ── controlled open / onToggle (alpha.23): consumer が state の open を書き換えると folder が開く。
describe('実ブラウザ: createTweakPanel folder の controlled open', () => {
  it('open を state で書き換えると folder が開閉し、ヘッダクリックは onToggle 経由で state を更新する', async () => {
    const app = setupApp();
    let tweak: ReturnType<typeof createTweakPanel>;
    const data = { nested: { inner: 1 } };
    const state = { open: {} as Record<string, boolean> };
    const handle = createApp('#app', state, (s) =>
      tweak
        ? tweak({
            data,
            open: s.open,
            onToggle: (_p, _n, map) => {
              handle.open = map;
            },
          })
        : null,
    );
    tweak = handle.use(createTweakPanel());
    await flush();

    const header = () => app.querySelector('[data-ricdom-tweak-key="nested"] > .ric-tweak-folder__header') as HTMLButtonElement;
    const body = () => app.querySelector('.ric-tweak-folder__body') as HTMLElement;
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(body().inert).toBe(true);

    // consumer 側 (外部) から開く
    handle.open = { nested: true };
    await flush();
    expect(header().getAttribute('aria-expanded')).toBe('true');
    expect(body().inert).toBe(false);
    await new Promise((r) => setTimeout(r, 400));
    expect(body().getBoundingClientRect().height).toBeGreaterThan(0);

    // ヘッダクリック → onToggle → state 更新 → 閉じる
    await userEvent.click(header());
    await flush();
    expect(handle.open).toEqual({ nested: false });
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(body().inert).toBe(true);
  });
});
