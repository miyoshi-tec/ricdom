// internal/hljs.ts — warnHljsMissing (v1 `_factory_helpers.js:59-69` の
// warn_hljs_missing 継承、v1→v2 パリティ一括監査 #7)。console 自体が無い/console.warn が
// 関数でない環境 (一部の組み込み/SSR 実行系) でも throw しないことを確認する。
// 通常の warn 挙動 (1 回だけ、mdPre/codePre から共有) は tests/ui/mdPre.test.ts /
// tests/ui/codePre.test.ts で確認済み。

import { afterEach, describe, expect, it, vi } from 'vitest';
import { uiCodePre } from '../../src/ui/codePre.js';
import { uiMdPre } from '../../src/ui/mdPre.js';
import { _resetHljsWarningForTest, warnHljsMissing } from '../../src/ui/internal/hljs.js';

describe('warnHljsMissing: console 未対応環境の防御', () => {
  afterEach(() => {
    _resetHljsWarningForTest();
  });

  it('console が存在しなくても throw しない', () => {
    const original = globalThis.console;
    // @ts-expect-error -- テストのため意図的に console を消す
    delete globalThis.console;
    try {
      expect(() => warnHljsMissing()).not.toThrow();
    } finally {
      globalThis.console = original;
    }
  });

  it('console.warn が関数でなくても throw しない', () => {
    const original = globalThis.console;
    globalThis.console = { ...original, warn: undefined } as unknown as Console;
    try {
      expect(() => warnHljsMissing()).not.toThrow();
    } finally {
      globalThis.console = original;
    }
  });

  it('console が使えない間は「1 回だけ」の状態を消費しない (後で使えるようになれば warn できる)', () => {
    const original = globalThis.console;
    // @ts-expect-error -- テストのため意図的に console を消す
    delete globalThis.console;
    warnHljsMissing();
    globalThis.console = original;

    let called = false;
    const warnSpy = (globalThis.console.warn = () => {
      called = true;
    });
    warnHljsMissing();
    expect(called).toBe(true);
    void warnSpy;
  });
});

// 2.0.0-alpha.36: サンプル 15 (AI チャット) を書く過程で見つかった。本物の highlight.js は、
// 知らない言語名で highlight() を呼ばれると、例外を投げる前に console.error を出す
// ("Could not find the language 'foo', did you forget to load/include a language module?")。
// 部品は例外を受けてプレーン表示に落としていたが、エラーの出力は止められず、描画のたびに出ていた。
// 流れてくる応答を描くと、```js が ```j まで届いた瞬間の描画でも同じことが起きる。
// 直した後は、先に getLanguage() で知っている言語かを確かめ、知らなければ highlight() を呼ばない。
describe('highlight.js が知らない言語名では highlight() を呼ばない (2.0.0-alpha.36)', () => {
  // 本物と同じ振る舞いをする最小の代役: 知らない言語なら console.error を出してから投げる
  const fakeHljs = (known: string[], withGetLanguage: boolean) => {
    const highlight = vi.fn((raw: string, opts: { language: string }) => {
      if (!known.includes(opts.language)) {
        console.error(`Could not find the language '${opts.language}', did you forget to load/include a language module?`);
        throw new Error('Unknown language: "' + opts.language + '"');
      }
      return { value: `<span>${raw}</span>` };
    });
    const hljs = {
      highlight,
      highlightAuto: (raw: string) => ({ value: `<i>${raw}</i>` }),
      ...(withGetLanguage ? { getLanguage: (name: string) => (known.includes(name) ? {} : undefined) } : {}),
    };
    (window as unknown as { hljs: unknown }).hljs = hljs;
    return highlight;
  };
  type N = { children: N[]; class?: string; innerHTML?: string };
  const fenceCode = (md: string): N => ((uiMdPre({ children: [md] }) as unknown as N).children[0] as N).children[0] as N;

  afterEach(() => {
    delete (window as unknown as { hljs?: unknown }).hljs;
  });

  it('uiMdPre: 知らない言語のフェンスは highlight() を呼ばず、エラーも出さず、プレーン表示になる', () => {
    const highlight = fakeHljs(['js'], true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = fenceCode('```foo\nx\n```');
    expect(highlight).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(code.children).toEqual(['x']);
    errorSpy.mockRestore();
  });

  it('uiMdPre: 流れてくる途中の言語名 (js の j まで) でもエラーを出さない / 知っている言語は従来どおり色が付く', () => {
    const highlight = fakeHljs(['js'], true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fenceCode('```j\nconst a = 1');
    expect(errorSpy).not.toHaveBeenCalled();
    const code = fenceCode('```js\nconst a = 1\n```');
    expect(highlight).toHaveBeenCalledTimes(1);
    expect(code.class).toBe('hljs');
    errorSpy.mockRestore();
  });

  it('uiCodePre: 知らない言語を lang に渡しても highlight() を呼ばない / auto は従来どおり', () => {
    const highlight = fakeHljs(['js'], true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pre = uiCodePre({ lang: 'foo', children: ['x'] }) as unknown as N;
    expect(highlight).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect((pre.children[0] as N).children).toEqual(['x']);
    const auto = uiCodePre({ children: ['y'] }) as unknown as N;
    expect((auto.children[0] as N).innerHTML).toBe('<i>y</i>');
    errorSpy.mockRestore();
  });

  it('getLanguage を持たない実装 (window.hljs を自前で差し替えた場合) では、従来どおり highlight() を試す', () => {
    const highlight = fakeHljs(['js'], false);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = fenceCode('```js\nx\n```');
    expect(highlight).toHaveBeenCalledTimes(1);
    expect(code.class).toBe('hljs');
    errorSpy.mockRestore();
  });
});
