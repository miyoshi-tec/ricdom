// 実ブラウザ契約テスト: 描き直しで要素が移されても、キーボードのフォーカスを失わない (2.0.0-alpha.38)。
//
// Rancha の報告 (alpha.36 の取り込み): 行の「…」メニューで「ピン留め」などを選ぶと、閉じたあとの
// フォーカスが <body> に落ちる。原因はコア: keyed の子の並べ替えは要素を insertBefore で移し、
// ブラウザは、フォーカスのある要素 (またはその祖先) が移されるとフォーカスを外す。しかも今の照合は、
// 1 行が末尾へ移るだけでも、ほかの行を全部 1 つずつ移す — フォーカスのある行が論理的には
// 動いていなくても外れる。
//
// jsdom は「移すとフォーカスが外れる」を再現しないので、実ブラウザで確かめる。

import { describe, expect, it } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { createApp } from '../../src/app.js';
import { createPopup } from '../../src/ui/popup.js';
import { applyTheme } from '../../src/ui/theme.js';
import { injectStyles } from '../../src/ui/injectStyles.js';
import { flush, setupApp } from '../_helpers/dom.js';

type RowsState = { rows: string[]; note: Record<string, string> };

// 5 行の keyed のリスト。各行にボタンと入力欄が 1 つずつ
const mountRows = () => {
  const app = setupApp();
  const handle = createApp('#app', { rows: ['a', 'b', 'c', 'd', 'e'], note: {} } as RowsState, (s) => ({
    tag: 'ul',
    children: s.rows.map((k) => ({
      tag: 'li',
      key: k,
      children: [k + (s.note[k] ?? ''), { tag: 'button', id: `btn-${k}`, children: ['…'] }, { tag: 'input', id: `in-${k}` }],
    })),
  }));
  handle.renderNow();
  const order = (): string => [...app.querySelectorAll('li')].map((li) => (li.firstChild as Text).data.charAt(0)).join('');
  return { app, handle, order };
};

describe('実ブラウザ: 描き直しで要素が移されても、フォーカスを失わない (2.0.0-alpha.38)', () => {
  it('フォーカスのある行そのものが先頭へ移っても、同じボタンにフォーカスが残る', () => {
    const { handle, order } = mountRows();
    const btn = document.getElementById('btn-c')!;
    btn.focus();
    handle.rows = ['c', 'a', 'b', 'd', 'e'];
    handle.renderNow();
    expect(order()).toBe('cabde');
    expect(document.getElementById('btn-c')).toBe(btn); // 要素は作り直されていない
    expect(document.activeElement).toBe(btn);
  });

  it('別の行が末尾へ移るだけ (フォーカスのある行は論理的には動かない) でも、フォーカスが残る', () => {
    const { handle, order } = mountRows();
    const btn = document.getElementById('btn-c')!;
    btn.focus();
    handle.rows = ['b', 'c', 'd', 'e', 'a'];
    handle.renderNow();
    expect(order()).toBe('bcdea');
    expect(document.activeElement).toBe(btn);
  });

  it('逆順の並べ替えでも残る / 並びが変わらない描き直しでも残る (従来どおり)', () => {
    const { handle, order } = mountRows();
    const btn = document.getElementById('btn-c')!;
    btn.focus();
    handle.rows = ['e', 'd', 'c', 'b', 'a'];
    handle.renderNow();
    expect(order()).toBe('edcba');
    expect(document.activeElement).toBe(btn);
    handle.note = { c: '!' };
    handle.renderNow();
    expect(document.activeElement).toBe(btn);
  });

  it('入力欄: 行が移っても、打った文字とカーソルの位置がそのまま残り、続きを打てる', async () => {
    const { handle } = mountRows();
    const input = document.getElementById('in-c') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.type(input, 'hello');
    input.setSelectionRange(2, 2); // 「he|llo」
    handle.rows = ['c', 'a', 'b', 'd', 'e'];
    handle.renderNow();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('hello');
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
    await userEvent.keyboard('X');
    expect(input.value).toBe('heXllo');
  });

  // 編集中ガード (フォーカス中の入力欄には value を入れ直さない、設計書 §3.2) は、行が移る描き直しでも守る。
  // 移された瞬間はブラウザ上のフォーカスが外れているので、ガードが「描き直しの前にフォーカスがあった要素」も
  // 見ないと、state より先に進んでいる打ちかけの文字が、state の値で上書きされる。
  it('value を渡した入力欄 (state と同期): 行が移っても、文字とカーソルの位置が残る', async () => {
    const app = setupApp();
    const handle = createApp('#app', { rows: ['a', 'b', 'c'], text: { a: '', b: '', c: '' } as Record<string, string> }, (s) => ({
      tag: 'ul',
      children: s.rows.map((k) => ({
        tag: 'li',
        key: k,
        children: [{ tag: 'input', id: `in-${k}`, value: s.text[k], oninput: (e: Event) => { s.text = { ...s.text, [k]: (e.target as HTMLInputElement).value }; } }],
      })),
    }));
    handle.renderNow();
    const input = app.querySelector('#in-c') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.type(input, 'hello');
    input.setSelectionRange(2, 2);
    handle.rows = ['c', 'a', 'b'];
    handle.renderNow();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('hello');
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
  });

  it('value を渡した入力欄 (state が打鍵に追いついていない): 行が移っても、打ちかけの文字を state の値で上書きしない', async () => {
    const app = setupApp();
    // oninput を持たない = state は '' のまま。フォーカス中は編集中ガードが打った文字を守る
    const handle = createApp('#app', { rows: ['a', 'b', 'c'], other: 0 }, (s) => ({
      tag: 'ul',
      children: s.rows.map((k) => ({ tag: 'li', key: k, children: [{ tag: 'input', id: `in-${k}`, value: '' }, String(s.other)] })),
    }));
    handle.renderNow();
    const input = app.querySelector('#in-c') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.type(input, 'hello');
    handle.other = 1; // 並びが変わらない描き直し: 従来どおり守られる
    handle.renderNow();
    expect(input.value).toBe('hello');
    handle.rows = ['c', 'a', 'b']; // 行が移る描き直し
    handle.renderNow();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('hello');
  });

  it('フォーカスを戻すとき、ページをスクロールさせない', () => {
    const { app, handle } = mountRows();
    // 一覧の上に高い余白を置いて、フォーカスのある行を画面の外に出す
    app.style.paddingTop = '3000px';
    const btn = document.getElementById('btn-c')!;
    btn.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    handle.rows = ['b', 'c', 'd', 'e', 'a'];
    handle.renderNow();
    expect(document.activeElement).toBe(btn);
    expect(window.scrollY).toBe(0);
    app.style.paddingTop = '';
  });

  it('フォーカスのある行が描き直しで消えたときは、戻さない (フォーカスは <body>)', () => {
    const { handle } = mountRows();
    document.getElementById('btn-c')!.focus();
    handle.rows = ['a', 'b', 'd', 'e'];
    handle.renderNow();
    expect(document.getElementById('btn-c')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('アプリの外の要素にフォーカスがあるときは、何もしない', () => {
    const { handle } = mountRows();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    handle.rows = ['e', 'd', 'c', 'b', 'a'];
    handle.renderNow();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('描き直しの中で意図してフォーカスを別の要素へ移した場合は、そちらが勝つ', () => {
    const app = setupApp();
    const handle = createApp('#app', { rows: ['a', 'b', 'c'], go: false }, (s) => {
      // 描画の途中で、アプリ自身がフォーカスを動かす (ref の後処理などの代わり)
      if (s.go) document.getElementById('other')!.focus();
      return { tag: 'div', children: [{ tag: 'button', id: 'other', children: ['other'] }, { tag: 'ul', children: s.rows.map((k) => ({ tag: 'li', key: k, children: [{ tag: 'button', id: `b-${k}`, children: [k] }] })) }] };
    });
    handle.renderNow();
    app.querySelector<HTMLElement>('#b-b')!.focus();
    handle.rows = ['b', 'c', 'a'];
    handle.go = true;
    handle.renderNow();
    expect(document.activeElement).toBe(document.getElementById('other'));
  });
});

// Rancha の経路そのもの: 行の「…」メニュー (createPopup の openAt) で、行の並びを変える項目を選ぶ。
// popup は項目の onclick の後に閉じて「…」へフォーカスを戻す。その後の描き直しで行が移る。
describe('実ブラウザ: 行の「…」メニューで並びを変える項目を選んでも、「…」にフォーカスが残る (2.0.0-alpha.38)', () => {
  injectStyles(document);

  it('「先頭へ」を選ぶと、メニューが閉じ、行が先頭へ移り、フォーカスはその行の「…」にある', async () => {
    document.body.innerHTML = '<div id="host"><div id="app"></div></div>';
    applyTheme(document.getElementById('host')!, { theme: 'light' });
    let menu: ReturnType<typeof createPopup>;
    const handle = createApp(
      '#app',
      { rows: ['a', 'b', 'c', 'd'], row: '' },
      (s) => [
        {
          tag: 'ul',
          children: s.rows.map((name) => ({
            tag: 'li',
            key: name,
            children: [
              name,
              {
                tag: 'button',
                id: `more-${name}`,
                'aria-haspopup': 'menu',
                onclick: (e: MouseEvent) => {
                  s.row = name;
                  menu.openAt(e.currentTarget as HTMLElement);
                },
                children: ['⋯'],
              },
            ],
          })),
        },
        menu({
          children: [
            {
              tag: 'button',
              id: 'item-pin',
              // ピン留め: その行を先頭へ移す
              onclick: () => {
                s.rows = [s.row, ...s.rows.filter((r) => r !== s.row)];
              },
              children: ['Pin to top'],
            },
          ],
        }),
      ],
      { setup: (a) => { menu = a.use(createPopup()); } },
    );
    await flush();
    const more = document.getElementById('more-c')!;
    await userEvent.click(more);
    await flush(150);
    await userEvent.click(document.getElementById('item-pin')!);
    await flush(400);
    expect(handle.rows).toEqual(['c', 'a', 'b', 'd']);
    expect(document.getElementById('more-c')).toBe(more);
    expect(document.getElementById('item-pin')).toBeNull(); // メニューは閉じている
    expect(document.activeElement).toBe(more);
  });
});
