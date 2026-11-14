// 実ブラウザ回帰テスト: createDropdown の flip (viewport 下端付近で above になる、設計書 F)。
// jsdom は getBoundingClientRect/window.innerHeight による実測フローを持たないため、
// below/above の実測フリップはここでのみ検証できる。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createDropdown } from '../../src/ui/dropdown.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

describe('実ブラウザ: createDropdown', () => {
  it('viewport 上部のトリガーは below 方向に開く (通常ケース)', async () => {
    const app = setupApp();
    let dd: ReturnType<typeof createDropdown>;
    const handle = createApp('#app', {}, () => (dd ? dd({ label: '選択肢', children: [{ tag: 'div', children: ['項目'] }] }) : null));
    dd = handle.use(createDropdown());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await flush(100); // rAF 実測フェーズ
    expect(app.querySelector('.ric-dropdown__body')!.className).toContain('ric-popup__body--below');
  });

  it('viewport 下端付近のトリガーは above 方向に開く (flip)', async () => {
    const app = setupApp();
    let dd: ReturnType<typeof createDropdown>;
    const handle = createApp('#app', {}, () =>
      dd
        ? [
            { tag: 'div', style: { height: '92vh' } }, // トリガーを画面下端付近まで押し下げる
            dd({ label: '選択肢', children: Array.from({ length: 12 }, (_, i) => ({ tag: 'div', children: [`項目 ${i}`] })) }),
          ]
        : null,
    );
    dd = handle.use(createDropdown());
    await flush();

    const trigger = app.querySelector('button')!;
    await userEvent.click(trigger);
    await flush(100); // rAF 実測フェーズ

    const body = app.querySelector('.ric-dropdown__body')!;
    expect(body.className).toContain('ric-popup__body--above');
    // above 方向では top ではなく bottom で位置決めしている (viewport をはみ出さない)
    expect((body as HTMLElement).style.top).toBe('');
    expect((body as HTMLElement).style.bottom).not.toBe('');
  });

  it('label モードでは本体の minWidth がトリガー幅に合わせて実測される', async () => {
    const app = setupApp();
    let dd: ReturnType<typeof createDropdown>;
    const handle = createApp('#app', {}, () => (dd ? dd({ label: '幅の広いラベルです', children: [{ tag: 'div', children: ['項目'] }] }) : null));
    dd = handle.use(createDropdown());
    await flush();

    const trigger = app.querySelector('button')!;
    const triggerWidth = trigger.getBoundingClientRect().width;
    await userEvent.click(trigger);
    await flush(100);

    const body = app.querySelector('.ric-dropdown__body') as HTMLElement;
    expect(parseFloat(body.style.minWidth)).toBeCloseTo(triggerWidth, 0);
  });

  // #14 (2.0.0-alpha.5): 実測 render (visibility:hidden) の間、本体は `left: rect.left` の
  // ままだった — トリガーが viewport 右端に近いと、本体 (position:fixed, 幅未指定 =
  // shrink-to-fit) の利用可能幅が `innerWidth - rect.left` に制限され、折り返し可能な
  // 長文が本来より狭く折り返されて offsetWidth が過小に測られる。過小な幅で右端揃えの
  // clamp をすると、本体は本来より狭いまま viewport 右端に余白なしで張り付いていた。
  // 修正: 実測 render の間だけ本体を `left: margin (8px)` に仮置きし、実測時の利用可能幅を
  // ほぼ viewport 全幅にする (popupPosition.ts の measuringLeft)。
  it('viewport 右端に密着したトリガーから開いても、実測幅が本来幅より狭くならない (2.0.0-alpha.5、#14 バグ修正)', async () => {
    // 折り返し可能な単語区切りを含む長文 1 行。自然幅 (折り返しなしで収まる幅) は
    // 160px (.ric-popup__body の min-width) より十分広いが、viewport 幅よりは十分狭い —
    // 「本来幅が innerWidth − rect.left より広い」再現条件を単語区切りで作る。
    const LONG_TEXT = 'Alpha bravo charlie delta echo';

    const buildAndMeasure = async (triggerStyle: { left?: string; right?: string }): Promise<{ width: number; right: number }> => {
      const app = setupApp();
      let dd: ReturnType<typeof createDropdown>;
      const handle = createApp('#app', {}, () => (dd ? dd({ label: '選択肢', children: [{ tag: 'div', children: [LONG_TEXT] }] }) : null));
      dd = handle.use(createDropdown());
      await flush();
      const trigger = app.querySelector('button')!;
      Object.assign(trigger.style, { position: 'fixed', top: '50px' }, triggerStyle);
      trigger.click();
      await flush(100); // rAF 実測フェーズ + 再描画を待つ
      const body = app.querySelector('.ric-dropdown__body') as HTMLElement;
      // offsetWidth/rect は数値としてここで確定させる (次の buildAndMeasure が
      // setupApp() で DOM を丸ごと差し替えるため、要素参照のまま後段で読むと
      // detached 状態の offsetWidth=0 を拾ってしまう)。
      return { width: body.offsetWidth, right: body.getBoundingClientRect().right };
    };

    // 本来幅の参照値: トリガーを viewport 左端近くに置く (利用可能幅が広く、
    // 実測 render でも折り返されない = 本来の 1 行分の幅がそのまま測れる)。
    const reference = await buildAndMeasure({ left: '8px' });
    // 再現条件: トリガーを viewport 右端に密着させる (report の再現条件そのもの)。
    const actual = await buildAndMeasure({ right: '8px' });

    expect(Math.abs(actual.width - reference.width)).toBeLessThanOrEqual(2);
    expect(actual.right).toBeLessThanOrEqual(window.innerWidth - 8 + 1);
  });
});

// light dismiss (#A、2.0.0-alpha.12、パイロット第 10 号・線茶からの報告)。詳細は
// uiPopup.test.ts の同名 describe のコメント参照 (userEvent.click が必須な理由 = pointerdown
// を発火させるため)。
describe('実ブラウザ: createDropdown の light dismiss (2.0.0-alpha.12)', () => {
  it('外側のボタンをクリックすると閉じ、かつそのクリックがボタンの onclick まで届く (修正前は閉じるだけでボタンは呼ばれなかった)', async () => {
    const app = setupApp();
    let dd: ReturnType<typeof createDropdown>;
    const handle = createApp('#app', {}, () => (dd ? dd({ label: '選択肢', children: [{ tag: 'div', children: ['項目'] }] }) : null));
    dd = handle.use(createDropdown());
    await flush();

    const outsideBtn = document.createElement('button');
    Object.assign(outsideBtn.style, { position: 'fixed', top: '450px', left: '10px' });
    outsideBtn.textContent = '外側';
    let clicked = 0;
    outsideBtn.addEventListener('click', () => {
      clicked++;
    });
    document.body.appendChild(outsideBtn);

    await userEvent.click(app.querySelector('button')!);
    await flush(100);
    expect(dd!.isOpen()).toBe(true);

    await userEvent.click(outsideBtn);
    await flush(350); // exit アニメーション終了を待つ

    expect(dd!.isOpen()).toBe(false);
    expect(clicked).toBe(1); // 修正前: 0 (overlay がクリックを吸っていた)
  });

  it('本体内のチェックボックスを切り替えても閉じない (外側判定に巻き込まれない)', async () => {
    const app = setupApp();
    let dd: ReturnType<typeof createDropdown>;
    const handle = createApp('#app', {}, () => (dd ? dd({ label: '選択肢', children: [{ tag: 'input', type: 'checkbox', id: 'chk' }] }) : null));
    dd = handle.use(createDropdown());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await flush(100);
    expect(dd!.isOpen()).toBe(true);

    const checkbox = app.querySelector('#chk') as HTMLInputElement;
    await userEvent.click(checkbox);
    await flush(100);

    expect(checkbox.checked).toBe(true);
    expect(dd!.isOpen()).toBe(true); // 閉じていない (開いたまま)
  });

  it('トリガーを再クリックすると閉じてフォーカスが復帰する (outside pointerdown 判定はトリガー上のクリックを除外するため、二重に close が走らない)', async () => {
    const app = setupApp();
    let dd: ReturnType<typeof createDropdown>;
    const handle = createApp('#app', {}, () => (dd ? dd({ label: '選択肢', children: [{ tag: 'div', children: ['項目'] }] }) : null));
    dd = handle.use(createDropdown());
    await flush();

    const trigger = app.querySelector('button')!;
    await userEvent.click(trigger);
    await flush(100);
    expect(dd!.isOpen()).toBe(true);

    await userEvent.click(trigger); // 再クリック (トグルで close)
    await flush(350); // exit アニメーション終了を待つ

    expect(dd!.isOpen()).toBe(false);
    // outside-pointerdown 経路 (doClose のみ、フォーカス復帰なし) がトリガークリックにも
    // 反応してしまっていると、toggle 側の closeAndRestoreFocus() が isClosing ガードで
    // 早期 return し、フォーカスが復帰しなくなる — この assert がその回帰を検知する。
    expect(document.activeElement).toBe(trigger);
  });
});
