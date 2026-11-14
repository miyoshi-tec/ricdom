// 実ブラウザ回帰テスト: createTabs の矢印キー移動で実フォーカスが動く (付録 E: roving tabindex)。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createTabs } from '../../src/ui/tabs.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { applyTheme } from '../../src/ui/theme.js';
import { flush, setupApp } from '../_helpers/dom.js';

injectStyles(document);

const ITEMS = [
  { key: 'a', label: 'A', children: ['content-a'] },
  { key: 'b', label: 'B', children: ['content-b'] },
  { key: 'c', label: 'C', children: ['content-c'] },
];

describe('実ブラウザ: createTabs', () => {
  it('ArrowRight/ArrowLeft で実フォーカスが隣のタブへ移動する (ループする)', async () => {
    const app = setupApp();
    let tabs: ReturnType<typeof createTabs>;
    const handle = createApp('#app', {}, () => (tabs ? tabs({ items: ITEMS }) : null));
    tabs = handle.use(createTabs());
    await flush();

    const tabEls = () => Array.from(app.querySelectorAll('[role="tab"]')) as HTMLElement[];
    tabEls()[0]!.focus();
    expect(document.activeElement).toBe(tabEls()[0]);

    await userEvent.keyboard('{ArrowRight}');
    await flush(50);
    expect(document.activeElement).toBe(tabEls()[1]);

    await userEvent.keyboard('{ArrowRight}');
    await flush(50);
    expect(document.activeElement).toBe(tabEls()[2]);

    await userEvent.keyboard('{ArrowRight}'); // 末尾から先頭へループ
    await flush(50);
    expect(document.activeElement).toBe(tabEls()[0]);

    await userEvent.keyboard('{ArrowLeft}'); // 先頭から末尾へループ
    await flush(50);
    expect(document.activeElement).toBe(tabEls()[2]);
  });

  it('Home/End で実フォーカスが先頭/末尾のタブへ移動する', async () => {
    const app = setupApp();
    let tabs: ReturnType<typeof createTabs>;
    const handle = createApp('#app', {}, () => (tabs ? tabs({ items: ITEMS }) : null));
    tabs = handle.use(createTabs());
    await flush();

    const tabEls = () => Array.from(app.querySelectorAll('[role="tab"]')) as HTMLElement[];
    tabEls()[0]!.focus();

    await userEvent.keyboard('{End}');
    await flush(50);
    expect(document.activeElement).toBe(tabEls()[2]);

    await userEvent.keyboard('{Home}');
    await flush(50);
    expect(document.activeElement).toBe(tabEls()[0]);
  });
});

// SPEC §10.3.1b に書いた「帯の中のタブの寄せ方」が実際に効くことを固定する (2.0.0-alpha.32、
// Paper Bridge の問い合わせ: 外側の要素に justify-content を書いても効かない)。
describe('実ブラウザ: createTabs の帯の中のタブを中央に寄せる (アプリの CSS 1 行)', () => {
  const gaps = (app: HTMLElement): { left: number; right: number; bar: number } => {
    const bar = app.querySelector('.ric-tabs__bar')!.getBoundingClientRect();
    const tabsEls = Array.from(app.querySelectorAll('[role="tab"]')).map((el) => el.getBoundingClientRect());
    const container = app.getBoundingClientRect();
    return { left: tabsEls[0]!.left - container.left, right: container.right - tabsEls[tabsEls.length - 1]!.right, bar: bar.width };
  };

  for (const [variant, css] of [
    ['line', '.ric-tabs__bar { justify-content: center; }'],
    ['pill', '.ric-tabs--pill .ric-tabs__bar { align-self: center; }'],
  ] as const) {
    it(`${variant}: 既定は左寄せ、\`${css}\` で中央`, async () => {
      const app = setupApp();
      app.style.width = '600px';
      let tabs: ReturnType<typeof createTabs>;
      const handle = createApp('#app', {}, () => (tabs ? tabs({ items: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], variant }) : null));
      tabs = handle.use(createTabs());
      await flush();

      const before = gaps(app);
      expect(before.left, '既定は左端から').toBeLessThan(8);
      expect(before.right, '前提: 右に余白がある').toBeGreaterThan(300);

      const st = document.createElement('style');
      st.textContent = css;
      document.head.appendChild(st);
      try {
        const after = gaps(app);
        expect(Math.abs(after.left - after.right), '左右の余白が同じ').toBeLessThan(1.5);
        expect(after.left).toBeGreaterThan(200);
      } finally {
        st.remove();
      }

      // 外側の要素に書いても効かない (.ric-tabs が幅いっぱいなので)
      app.style.display = 'flex';
      app.style.justifyContent = 'center';
      expect(gaps(app).left, '外側の justify-content では動かない').toBeLessThan(8);
    });
  }
});

// 2.0.0-alpha.36: サンプル 15 (AI チャット) を書く過程で見つかった。タブの帯は折り返さないので、
// タブが多い・幅が狭いと親からはみ出す。ダイアログ (overflow: hidden) の中では切れて押せなくなる
// (幅 640px のダイアログで 8 個目のタブが切れ、420px の画面では 5 個が切れた)。
describe('実ブラウザ: createTabs のタブは、入りきらないとき折り返す (2.0.0-alpha.36)', () => {
  const ITEMS = ['Demo (no server)', 'LM Studio', 'Ollama', 'OpenAI', 'Claude', 'Gemini', 'Grok', 'Other'].map((label, i) => ({ key: `k${i}`, label }));

  for (const variant of ['pill', 'default'] as const) {
    it(`variant: '${variant}' — 幅 300px の箱の中で、どのタブも箱からはみ出さない`, async () => {
      document.body.innerHTML = '<div id="box" style="width:300px;overflow:hidden"><div id="app"></div></div>';
      applyTheme(document.getElementById('box')!, { theme: 'light' });
      let tabs: ReturnType<typeof createTabs>;
      const handle = createApp('#app', {}, () => (tabs ? tabs({ items: ITEMS, ...(variant === 'pill' ? { variant: 'pill' as const } : {}) }) : null));
      tabs = handle.use(createTabs());
      handle.renderNow();
      const box = document.getElementById('box')!.getBoundingClientRect();
      const list = Array.from(document.querySelectorAll('[role="tab"]')) as HTMLElement[];
      expect(list.length).toBe(8);
      for (const tab of list) {
        const r = tab.getBoundingClientRect();
        expect(r.right, `${tab.textContent}: 右端が箱の中`).toBeLessThanOrEqual(box.right + 0.5);
        expect(r.left, `${tab.textContent}: 左端が箱の中`).toBeGreaterThanOrEqual(box.left - 0.5);
      }
      const rows = new Set(list.map((tab) => Math.round(tab.getBoundingClientRect().top)));
      expect(rows.size, '前提: 1 行には入りきらず、複数の行になっている').toBeGreaterThan(1);
      handle.unmount();
    });
  }

  it('入りきるときは 1 行のまま (見た目は変わらない)', async () => {
    document.body.innerHTML = '<div id="box" style="width:900px"><div id="app"></div></div>';
    applyTheme(document.getElementById('box')!, { theme: 'light' });
    let tabs: ReturnType<typeof createTabs>;
    const handle = createApp('#app', {}, () => (tabs ? tabs({ items: ITEMS, variant: 'pill' }) : null));
    tabs = handle.use(createTabs());
    handle.renderNow();
    const list = Array.from(document.querySelectorAll('[role="tab"]')) as HTMLElement[];
    expect(new Set(list.map((tab) => Math.round(tab.getBoundingClientRect().top))).size).toBe(1);
    handle.unmount();
  });
});
