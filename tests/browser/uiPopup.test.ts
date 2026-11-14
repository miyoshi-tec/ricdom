// 実ブラウザ回帰テスト: createPopup の矢印キー移動と openAt 位置 (設計書 F、付録 E)。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createPopup } from '../../src/ui/popup.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

// CSS を読み込んでおく (`.ric-popup__body { position: fixed }` が無いと、
// 位置計算で入れる top/left の inline style が効かない — position:static のままだと
// top/left は無視される、という CSS の基礎仕様どおりの挙動)。
injectStyles(document);

describe('実ブラウザ: createPopup', () => {
  it('矢印キー (↓↑) でメニュー項目間をループ移動する', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu
        ? menu({
            trigger: ['⋯'],
            children: [
              { tag: 'button', class: 'ric-button', children: ['A'] },
              { tag: 'button', class: 'ric-button', children: ['B'] },
              { tag: 'button', class: 'ric-button', children: ['C'] },
            ],
          })
        : null,
    );
    menu = handle.use(createPopup());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await flush(100); // rAF 実測フェーズを待つ

    const items = app.querySelectorAll('[role="menuitem"]') as NodeListOf<HTMLElement>;
    items[0]!.focus();
    expect(document.activeElement).toBe(items[0]);

    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[2]);
    await userEvent.keyboard('{ArrowDown}'); // 末尾から先頭へループ
    expect(document.activeElement).toBe(items[0]);
    await userEvent.keyboard('{ArrowUp}'); // 先頭から末尾へループ
    expect(document.activeElement).toBe(items[2]);
  });

  it('Home/End で先頭/末尾の項目へ移動する', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu
        ? menu({
            trigger: ['⋯'],
            children: [
              { tag: 'button', class: 'ric-button', children: ['A'] },
              { tag: 'button', class: 'ric-button', children: ['B'] },
              { tag: 'button', class: 'ric-button', children: ['C'] },
            ],
          })
        : null,
    );
    menu = handle.use(createPopup());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await flush(100);

    const items = app.querySelectorAll('[role="menuitem"]') as NodeListOf<HTMLElement>;
    items[1]!.focus();
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(items[2]);
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(items[0]);
  });

  it('Esc でトリガーへフォーカスが復帰する', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () => (menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', class: 'ric-button', children: ['A'] }] }) : null));
    menu = handle.use(createPopup());
    await flush();

    const trigger = app.querySelector('button')!;
    await userEvent.click(trigger);
    await flush(100);
    expect(app.querySelector('[role="menu"]')).not.toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(trigger);
  });

  it('viewport 右端近くのトリガーから開いても、本体は画面外にはみ出ない (2.0.0-alpha.2、実機バグ修正)', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu
        ? menu({
            trigger: ['⋯'],
            children: [
              { tag: 'button', class: 'ric-button', children: ['項目 A'] },
              { tag: 'button', class: 'ric-button', children: ['項目 B'] },
              { tag: 'button', class: 'ric-button', children: ['非常に長いメニュー項目のラベル文字列'] },
            ],
          })
        : null,
    );
    menu = handle.use(createPopup());
    await flush();

    // トリガーを viewport 右端 40px の位置に固定 (report の再現条件)。
    const trigger = app.querySelector('button')! as HTMLElement;
    trigger.style.position = 'fixed';
    trigger.style.top = '50px';
    trigger.style.left = `${window.innerWidth - 40}px`;

    await userEvent.click(trigger);
    await flush(100); // rAF 実測フェーズを待つ

    const body = app.querySelector('[role="menu"]') as HTMLElement;
    expect(body).not.toBeNull();
    const rect = body.getBoundingClientRect();
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    expect(rect.left).toBeGreaterThanOrEqual(0);
  });

  // #14 (2.0.0-alpha.5): 上のテストは「画面外にはみ出さない」ことしか見ていなかったため、
  // 「本体が本来より狭く測られたまま右端に張り付く」(はみ出しはしないが右マージンが消える)
  // バグは検知できていなかった。ここでは offsetWidth 自体が本来幅と一致するかを見る
  // (dropdown 側と同じ再現方法・同じ許容差)。
  const LONG_TEXT = 'Alpha bravo charlie delta echo';

  it('トリガー経路: viewport 右端に密着したトリガーから開いても、実測幅が本来幅より狭くならない (2.0.0-alpha.5、#14 バグ修正)', async () => {
    const buildAndMeasure = async (triggerStyle: { left?: string; right?: string }): Promise<{ width: number; right: number }> => {
      const app = setupApp();
      let menu: ReturnType<typeof createPopup>;
      // 項目は `.ric-button` ではなく plain な div にする — `.ric-button` は
      // `white-space: nowrap` を持つため、折り返し可能な長文での再現条件 (available
      // width が狭いと折り返されて過小に測られる) が成り立たない。`.ric-popup__item`
      // 自体には white-space 指定が無いので既定 (normal、折り返し可) のまま使える。
      const handle = createApp('#app', {}, () => (menu ? menu({ trigger: ['⋯'], children: [{ tag: 'div', children: [LONG_TEXT] }] }) : null));
      menu = handle.use(createPopup());
      await flush();
      const trigger = app.querySelector('button')!;
      Object.assign(trigger.style, { position: 'fixed', top: '50px' }, triggerStyle);
      trigger.click();
      await flush(100); // rAF 実測フェーズ + 再描画を待つ
      const body = app.querySelector('[role="menu"]') as HTMLElement;
      return { width: body.offsetWidth, right: body.getBoundingClientRect().right };
    };

    const reference = await buildAndMeasure({ left: '8px' });
    const actual = await buildAndMeasure({ right: '8px' });

    expect(Math.abs(actual.width - reference.width)).toBeLessThanOrEqual(2);
    expect(actual.right).toBeLessThanOrEqual(window.innerWidth - 8 + 1);
  });

  it('openAt 経路: viewport 右端近くの座標に開いても、実測幅が本来幅より狭くならない (2.0.0-alpha.5、#14 バグ修正)', async () => {
    const buildAndMeasure = async (x: number): Promise<{ width: number; right: number }> => {
      const app = setupApp();
      let menu: ReturnType<typeof createPopup>;
      // 項目は `.ric-button` ではなく plain な div にする — `.ric-button` は
      // `white-space: nowrap` を持つため、折り返し可能な長文での再現条件 (available
      // width が狭いと折り返されて過小に測られる) が成り立たない。`.ric-popup__item`
      // 自体には white-space 指定が無いので既定 (normal、折り返し可) のまま使える。
      const handle = createApp('#app', {}, () => (menu ? menu({ trigger: ['⋯'], children: [{ tag: 'div', children: [LONG_TEXT] }] }) : null));
      menu = handle.use(createPopup());
      await flush();
      menu.openAt({ x, y: 50 });
      await flush(100); // rAF 実測フェーズ + 再描画を待つ
      const body = app.querySelector('[role="menu"]') as HTMLElement;
      return { width: body.offsetWidth, right: body.getBoundingClientRect().right };
    };

    // 本来幅の参照値: viewport 左端近くの座標に開く (利用可能幅が広い)。
    const reference = await buildAndMeasure(8);
    // 再現条件: viewport 右端近くの座標に開く (openAt には rect がなく、修正前は
    // `left: x` のまま実測していた)。
    const actual = await buildAndMeasure(window.innerWidth - 8);

    expect(Math.abs(actual.width - reference.width)).toBeLessThanOrEqual(2);
    expect(actual.right).toBeLessThanOrEqual(window.innerWidth - 8 + 1);
  });

  it('アイコン+テキストの menu 項目は中心 y が一致する (2.0.0-alpha.2、.ric-popup__item の align-items 修正)', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu
        ? menu({
            trigger: ['⋯'],
            children: [
              {
                tag: 'button',
                class: 'ric-button',
                children: [{ tag: 'span', id: 'icon-el', style: { display: 'inline-block', width: '20px', height: '20px', background: 'red' } }, { tag: 'span', id: 'text-el', children: ['項目'] }],
              },
            ],
          })
        : null,
    );
    menu = handle.use(createPopup());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await flush(100);

    const icon = app.querySelector('#icon-el')!.getBoundingClientRect();
    const text = app.querySelector('#text-el')!.getBoundingClientRect();
    const iconCenterY = icon.top + icon.height / 2;
    const textCenterY = text.top + text.height / 2;
    expect(Math.abs(iconCenterY - textCenterY)).toBeLessThan(2); // 誤差 2px 未満で一致
  });

  it('openAt({x,y}) で座標付近に開く', async () => {
    const app = setupApp();
    const handle = createApp('#app', {}, () => ({ tag: 'div' }));
    const menu = handle.use(createPopup());
    menu.openAt({ x: 100, y: 100 });
    await flush();
    await flush(100); // rAF 実測フェーズ

    const body = app.querySelector('[role="menu"]') as HTMLElement;
    expect(body).not.toBeNull();
    const rect = body.getBoundingClientRect();
    // below 方向で開くケース (十分な下スペースがある座標): top はクリック位置の少し下
    expect(rect.top).toBeGreaterThanOrEqual(100);
    expect(rect.top).toBeLessThan(150);
    expect(rect.left).toBeGreaterThanOrEqual(8); // 画面外にはみ出ないよう clamp されている
  });
});

describe('実ブラウザ: createPopup のメニューが項目選択で閉じる (2.0.0-alpha.3、#10)', () => {
  it('button 項目の click で閉じ、トリガーへフォーカスが復帰する (既定 closeOnSelect: true)', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', class: 'ric-button', children: ['削除'] }] }) : null,
    );
    menu = handle.use(createPopup());
    await flush();

    const trigger = app.querySelector('button')!;
    await userEvent.click(trigger);
    await flush(100);
    expect(app.querySelector('[role="menu"]')).not.toBeNull();

    const item = app.querySelector('[role="menuitem"]') as HTMLElement;
    await userEvent.click(item);
    await flush(300); // exit アニメーション終了 (700ms backstop 前) を待つ

    expect(app.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('button 項目への Enter (native click) でも閉じる', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', class: 'ric-button', children: ['A'] }] }) : null,
    );
    menu = handle.use(createPopup());
    await flush();

    const trigger = app.querySelector('button')!;
    await userEvent.click(trigger);
    await flush(100);

    const item = app.querySelector('[role="menuitem"]') as HTMLElement;
    item.focus();
    await userEvent.keyboard('{Enter}'); // <button> はネイティブに Enter → click を発火する
    await flush(300);

    expect(app.querySelector('[role="menu"]')).toBeNull();
  });

  it('button 項目への Space (native click) でも閉じる', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', class: 'ric-button', children: ['A'] }] }) : null,
    );
    menu = handle.use(createPopup());
    await flush();

    const trigger = app.querySelector('button')!;
    await userEvent.click(trigger);
    await flush(100);

    const item = app.querySelector('[role="menuitem"]') as HTMLElement;
    item.focus();
    await userEvent.keyboard(' ');
    await flush(300);

    expect(app.querySelector('[role="menu"]')).toBeNull();
  });

  it('closeOnSelect: false では項目を選択しても閉じない (チェック型メニュー用)', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu ? menu({ trigger: ['⋯'], closeOnSelect: false, children: [{ tag: 'button', class: 'ric-button', children: ['チェック'] }] }) : null,
    );
    menu = handle.use(createPopup());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await flush(100);

    const item = app.querySelector('[role="menuitem"]') as HTMLElement;
    await userEvent.click(item);
    await flush(100);

    expect(app.querySelector('[role="menu"]')).not.toBeNull(); // 閉じていない
  });

  it('disabled な項目をクリックしても閉じない', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    let clicked = false;
    const handle = createApp('#app', {}, () =>
      menu
        ? menu({
            trigger: ['⋯'],
            children: [{ tag: 'button', class: 'ric-button', disabled: true, onclick: () => { clicked = true; }, children: ['無効'] }],
          })
        : null,
    );
    menu = handle.use(createPopup());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await flush(100);

    const item = app.querySelector('[role="menuitem"]') as HTMLElement;
    expect(item.hasAttribute('disabled')).toBe(true);
    item.click(); // ネイティブ disabled な <button> は実ブラウザでは click 自体を発火しない
    await flush(100);

    expect(clicked).toBe(false); // 発火していないことの確認 (ブラウザの標準挙動)
    expect(app.querySelector('[role="menu"]')).not.toBeNull(); // 閉じていない
  });

  it('aria-disabled="true" な項目 (soft disabled) はクリックが発火しても閉じない', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    let clicked = false;
    const handle = createApp('#app', {}, () =>
      menu
        ? menu({
            trigger: ['⋯'],
            children: [
              { tag: 'button', class: 'ric-button', 'aria-disabled': 'true', onclick: () => { clicked = true; }, children: ['ソフト無効'] },
            ],
          })
        : null,
    );
    menu = handle.use(createPopup());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await flush(100);

    const item = app.querySelector('[role="menuitem"]') as HTMLElement;
    // userEvent.click (Playwright 経由) は aria-disabled="true" を「操作不能」とみなして
    // actionability チェックでタイムアウトする (native disabled と違い、ブラウザの
    // click() メソッド自体は aria-disabled を尊重しないため実際には発火できる操作) —
    // ここで見たいのは「aria-disabled でも onclick は発火するが popup は閉じない」という
    // 部品の契約そのものなので、native の click() で直接発火させる。
    item.click();
    await flush(100);

    expect(clicked).toBe(true); // aria-disabled は見た目だけなので onclick 自体は発火する
    expect(app.querySelector('[role="menu"]')).not.toBeNull(); // それでも閉じない
  });

  it('項目の onclick が stopPropagation() していても閉じる', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu
        ? menu({
            trigger: ['⋯'],
            children: [{ tag: 'button', class: 'ric-button', onclick: (ev: MouseEvent) => ev.stopPropagation(), children: ['A'] }],
          })
        : null,
    );
    menu = handle.use(createPopup());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await flush(100);

    const item = app.querySelector('[role="menuitem"]') as HTMLElement;
    await userEvent.click(item);
    await flush(300);

    // popup 側は「document 全体の click 監視」ではなく項目の onclick 呼び出しそのものを
    // 包んでいるため (wrapMenuItem)、consumer の stopPropagation() の影響を受けない。
    expect(app.querySelector('[role="menu"]')).toBeNull();
  });

  it('openAt() 経路で開いたメニューでも、項目選択で閉じる', async () => {
    const app = setupApp();
    // openAt はトリガーボタンを経由しないが、renderPortal が参照する menuChildrenLast/
    // closeOnSelectLast は通常の menu({...}) 呼び出し (render 内で毎回呼ぶ) で確定する —
    // 右クリックのコンテキストメニュー等、見えないトリガーで menu({...}) を呼びつつ
    // openAt() で座標指定して開く使い方を模す。
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', class: 'ric-button', children: ['A'] }] }) : null,
    );
    menu = handle.use(createPopup());
    await flush();

    menu.openAt({ x: 100, y: 100 });
    await flush();
    await flush(100); // rAF 実測フェーズ
    expect(app.querySelector('[role="menu"]')).not.toBeNull();

    const item = app.querySelector('[role="menuitem"]') as HTMLElement;
    await userEvent.click(item);
    await flush(300); // exit アニメーション終了を待つ

    expect(app.querySelector('[role="menu"]')).toBeNull();
  });
});

// light dismiss (#A、2.0.0-alpha.12、パイロット第 10 号・線茶からの報告)。
// alpha.11 以前は `.ric-popup__overlay` (viewport 全面、pointer-events:auto + onclick) が
// 外側クリックを吸っていたため、「開いたまま別のボタンを押す」操作は「閉じるだけ」に
// なり、実ユーザー・Playwright の actionability 待ち双方で「1 回目のクリックは効かない」
// 問題になっていた。ここでは userEvent.click (実マウスイベント列 = pointerdown を含む) を
// 使う — `element.click()` (プログラム的呼び出し) は 'click' イベントのみで pointerdown を
// 発火しないため、light dismiss の再現には userEvent 経由が必須。
describe('実ブラウザ: createPopup の light dismiss (2.0.0-alpha.12)', () => {
  it('外側のボタンをクリックすると閉じ、かつそのクリックがボタンの onclick まで届く (修正前は閉じるだけでボタンは呼ばれなかった)', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', class: 'ric-button', children: ['A'] }] }) : null,
    );
    menu = handle.use(createPopup());
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
    expect(menu!.isOpen()).toBe(true);

    await userEvent.click(outsideBtn);
    await flush(350); // exit アニメーション終了を待つ

    expect(menu!.isOpen()).toBe(false);
    expect(clicked).toBe(1); // 修正前: 0 (overlay がクリックを吸っていた)
  });

  it('本体内 (menuitem ではない領域) をクリックしても閉じない (外側判定に巻き込まれない)', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu ? menu({ trigger: ['⋯'], closeOnSelect: false, children: [{ tag: 'div', style: { padding: '20px' }, children: ['本文'] }] }) : null,
    );
    menu = handle.use(createPopup());
    await flush();

    await userEvent.click(app.querySelector('button')!);
    await flush(100);
    expect(menu!.isOpen()).toBe(true);

    const body = app.querySelector('[role="menu"]') as HTMLElement;
    await userEvent.click(body);
    await flush(100);

    expect(menu!.isOpen()).toBe(true); // 閉じていない
  });

  it('トリガーを再クリックすると閉じてフォーカスが復帰する (outside pointerdown 判定はトリガー上のクリックを除外するため、二重に close が走らない)', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', class: 'ric-button', children: ['A'] }] }) : null,
    );
    menu = handle.use(createPopup());
    await flush();

    const trigger = app.querySelector('button')!;
    await userEvent.click(trigger);
    await flush(100);
    expect(menu!.isOpen()).toBe(true);

    await userEvent.click(trigger); // 再クリック (トグルで close)
    await flush(350); // exit アニメーション終了を待つ

    expect(menu!.isOpen()).toBe(false);
    // outside-pointerdown 経路 (doClose のみ、フォーカス復帰なし) がトリガークリックにも
    // 反応してしまっていると、toggle 側の closeAndRestoreFocus() が isClosing ガードで
    // 早期 return し、フォーカスが復帰しなくなる — この assert がその回帰を検知する。
    expect(document.activeElement).toBe(trigger);
  });

  it('openAt() で開いた popup も外側クリックで閉じる (トリガーボタンをクリックせずに開いた場合)', async () => {
    const app = setupApp();
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp('#app', {}, () =>
      menu ? menu({ trigger: ['⋯'], children: [{ tag: 'button', class: 'ric-button', children: ['A'] }] }) : null,
    );
    menu = handle.use(createPopup());
    await flush();

    menu.openAt({ x: 100, y: 100 });
    await flush();
    await flush(100); // rAF 実測フェーズ
    expect(menu!.isOpen()).toBe(true);

    const outsideBtn = document.createElement('button');
    Object.assign(outsideBtn.style, { position: 'fixed', top: '450px', left: '10px' });
    let clicked = 0;
    outsideBtn.addEventListener('click', () => {
      clicked++;
    });
    document.body.appendChild(outsideBtn);

    await userEvent.click(outsideBtn);
    await flush(350);

    expect(menu!.isOpen()).toBe(false);
    expect(clicked).toBe(1);
  });
});
