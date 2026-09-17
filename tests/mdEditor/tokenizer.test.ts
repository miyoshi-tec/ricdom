// tokenizeMarkdown (src/mdEditor/tokenizer.ts) の単体テスト。
//
// このテストが一番大事にしているのは「不変条件」: tokens.map(t=>t.text).join('') === src が
// あらゆる入力で成立すること (createMdEditor のミラー <pre> が本物の textarea と 1 文字も
// ずれないための前提)。分類 (見出し/フェンス/リンク 等) の正しさはその上に乗る副次的な確認。

import { describe, expect, it } from 'vitest';
import { tokenizeMarkdown } from '../../src/mdEditor/tokenizer.js';

const reconstruct = (src: string): string => tokenizeMarkdown(src).map((t) => t.text).join('');

describe('tokenizeMarkdown: 不変条件 (join した結果が元の src と完全一致する)', () => {
  const cases: Record<string, string> = {
    空文字列: '',
    プレーンテキスト: 'hello world',
    改行のみ: '\n\n\n',
    'CRLF 混じり': 'line1\r\nline2\r\nline3',
    タブ含み: 'a\tb\tc\n\t- item',
    絵文字: '見出し 🎉 **強調 🚀 文字**\n> 引用 😀\n',
    未閉じフェンス: '```js\nconst x = 1;\nno closing fence here',
    未閉じ強調: 'this is **not closed',
    未閉じインラインコード: 'here is `not closed',
    ネストしたマーカー: '**a *b* c**と_d_と~~e~~',
    フロントマター: '---\ntitle: hi\n---\n# body',
    未終端フロントマター: '---\ntitle: hi\nno closing',
    見出し1から6: '# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6\n####### not-heading\n',
    リストとタスク: '- a\n* b\n+ c\n1. one\n2) two\n- [ ] todo\n- [x] done\n',
    引用複数行: '> line1\n> line2\n通常行\n',
    テーブル: '| a | b |\n|---|---|\n| 1 | 2 |\n',
    水平線各種: '---\n***\n___\n- - -\n',
    リンクと画像: '[text](http://example.com) and ![alt](img.png)\n',
    オートリンク: '<https://example.com> と普通の文\n',
    HTMLタグ行: '<div class="x">\n本文\n</div>\n',
    末尾に改行なし: 'no trailing newline',
    行末に空白: 'trailing spaces   \nnext line\n',
    絵文字を含むコードフェンス: '```\nconsole.log("🎉")\n```\n',
  };

  for (const [label, src] of Object.entries(cases)) {
    it(`${label}: join(tokens) === src`, () => {
      expect(reconstruct(src)).toBe(src);
    });
  }

  it('ランダムに近い長文でも不変条件が成立する (性能テストと兼用の 5,000 行ドキュメント)', () => {
    const lines: string[] = [];
    for (let i = 0; i < 5000; i++) {
      lines.push(`# heading ${i}`, `**bold ${i}** and *em ${i}* and \`code ${i}\``, '> quote line', '- list item', '');
    }
    const src = lines.join('\n');
    expect(reconstruct(src)).toBe(src);
  });
});

describe('tokenizeMarkdown: 分類', () => {
  it('front matter は文書先頭の --- から閉じる --- まで ric-md-meta になる', () => {
    const tokens = tokenizeMarkdown('---\ntitle: hi\n---\n# body\n');
    const metaTokens = tokens.filter((t) => t.cls === 'ric-md-meta');
    expect(metaTokens.length).toBeGreaterThan(0);
    // 閉じた後の見出し行は meta ではなく heading/marker になる
    expect(tokens.some((t) => t.cls === 'ric-md-heading')).toBe(true);
  });

  it('文書先頭が --- でなければ front matter 扱いされない', () => {
    const tokens = tokenizeMarkdown('# not front matter\n---\n');
    expect(tokens.some((t) => t.cls === 'ric-md-meta')).toBe(false);
  });

  it('未終端の front matter は文書全体が ric-md-meta になる', () => {
    const src = '---\na: 1\nb: 2';
    const tokens = tokenizeMarkdown(src);
    const nonNewlineTokens = tokens.filter((t) => t.text !== '\n');
    expect(nonNewlineTokens.every((t) => t.cls === 'ric-md-meta')).toBe(true);
  });

  it('見出し # 〜 ###### を ric-md-marker + ric-md-heading に分ける', () => {
    const tokens = tokenizeMarkdown('### hello');
    expect(tokens[0]).toEqual({ text: '###', cls: 'ric-md-marker' });
    expect(tokens[1]).toEqual({ text: ' hello', cls: 'ric-md-heading' });
  });

  it('7 個以上の # は見出しとして扱わない', () => {
    const tokens = tokenizeMarkdown('####### not a heading');
    expect(tokens.some((t) => t.cls === 'ric-md-heading')).toBe(false);
  });

  it('フェンスコード (lang あり) は開始/終了マーカーと本文トークンに分かれる', () => {
    const tokens = tokenizeMarkdown('```js\nconst x = 1;\n```\n');
    expect(tokens[0]).toEqual({ text: '```js', cls: 'ric-md-fence-marker' });
    const body = tokens.find((t) => t.fenceBody);
    expect(body).toBeTruthy();
    expect(body!.lang).toBe('js');
    expect(body!.text).toBe('const x = 1;');
    expect(body!.cls).toBe('ric-md-fence');
  });

  it('~~~ フェンスにも対応する', () => {
    const tokens = tokenizeMarkdown('~~~\nplain\n~~~\n');
    expect(tokens[0]!.cls).toBe('ric-md-fence-marker');
    expect(tokens.some((t) => t.fenceBody && t.text === 'plain')).toBe(true);
  });

  it('フェンス内はインラインパースされない (** がそのまま fenceBody テキストに残る)', () => {
    const tokens = tokenizeMarkdown('```\n**not bold**\n```\n');
    const body = tokens.find((t) => t.fenceBody);
    expect(body!.text).toBe('**not bold**');
  });

  it('未閉じフェンスは残り全行が fenceBody になる', () => {
    const tokens = tokenizeMarkdown('```\nline1\nline2');
    const bodies = tokens.filter((t) => t.fenceBody);
    expect(bodies.map((t) => t.text)).toEqual(['line1', 'line2']);
  });

  it('引用 > は marker + 単一の ric-md-quote トークンになる (中身は再パースしない)', () => {
    const tokens = tokenizeMarkdown('> **not bold inside quote**');
    expect(tokens[0]).toEqual({ text: '> ', cls: 'ric-md-marker' });
    expect(tokens[1]).toEqual({ text: '**not bold inside quote**', cls: 'ric-md-quote' });
  });

  it('箇条書きリストは marker + inline パースされた rest になる', () => {
    const tokens = tokenizeMarkdown('- **bold** item');
    expect(tokens[0]!.cls).toBe('ric-md-marker');
    expect(tokens.some((t) => t.cls === 'ric-md-strong' && t.text === '**bold**')).toBe(true);
  });

  it('タスクリストの [ ]/[x] も marker になる', () => {
    const tokens = tokenizeMarkdown('- [x] done');
    expect(tokens.some((t) => t.cls === 'ric-md-marker' && t.text.includes('[x]'))).toBe(true);
  });

  it('順序ありリスト N. / N) の両方を認識する', () => {
    const t1 = tokenizeMarkdown('1. one');
    const t2 = tokenizeMarkdown('1) one');
    expect(t1[0]!.cls).toBe('ric-md-marker');
    expect(t2[0]!.cls).toBe('ric-md-marker');
  });

  it('水平線 (---/***/___、空白混じり) を ric-md-hr にする', () => {
    // 単独の '---' は文書先頭では front matter 開始と区別が付かない (仕様どおり) ので、
    // 見出し行を前に置いて「先頭行ではない ---」として水平線判定を確認する。
    for (const marker of ['---', '***', '___', '- - -']) {
      const tokens = tokenizeMarkdown(`# heading\n${marker}\n`);
      const hr = tokens.find((t) => t.text === marker);
      expect(hr?.cls).toBe('ric-md-hr');
    }
  });

  it('テーブル行は | を marker に、セルを inline パースする', () => {
    const tokens = tokenizeMarkdown('| **a** | b |');
    const pipes = tokens.filter((t) => t.cls === 'ric-md-marker' && t.text === '|');
    expect(pipes.length).toBe(3);
    expect(tokens.some((t) => t.cls === 'ric-md-strong')).toBe(true);
  });

  it('テーブル区切り行 (|---|---|) も table として扱う', () => {
    const tokens = tokenizeMarkdown('|---|---|');
    expect(tokens.filter((t) => t.cls === 'ric-md-marker' && t.text === '|').length).toBe(3);
  });

  it('HTML タグ単体の行は ric-md-meta になる', () => {
    const tokens = tokenizeMarkdown('<div class="x">');
    expect(tokens).toEqual([{ text: '<div class="x">', cls: 'ric-md-meta' }]);
  });

  it('インラインコード `code` を ric-md-code (バッククォート込み) にする', () => {
    const tokens = tokenizeMarkdown('here `code` there');
    const code = tokens.find((t) => t.cls === 'ric-md-code');
    expect(code!.text).toBe('`code`');
  });

  it('太字 **x** / __x__ を ric-md-strong にする (マーカー込みの 1 トークン)', () => {
    expect(tokenizeMarkdown('**bold**').find((t) => t.cls === 'ric-md-strong')!.text).toBe('**bold**');
    expect(tokenizeMarkdown('__bold__').find((t) => t.cls === 'ric-md-strong')!.text).toBe('__bold__');
  });

  it('斜体 *x* / _x_ を ric-md-em にする (_ は単語の途中では発火しない)', () => {
    expect(tokenizeMarkdown('*em*').find((t) => t.cls === 'ric-md-em')!.text).toBe('*em*');
    expect(tokenizeMarkdown('_em_').find((t) => t.cls === 'ric-md-em')!.text).toBe('_em_');
    expect(tokenizeMarkdown('foo_bar_baz').some((t) => t.cls === 'ric-md-em')).toBe(false);
  });

  it('打ち消し線 ~~x~~ を ric-md-strike にする', () => {
    expect(tokenizeMarkdown('~~gone~~').find((t) => t.cls === 'ric-md-strike')!.text).toBe('~~gone~~');
  });

  it('リンク [text](url) を marker/link/url に分ける', () => {
    const tokens = tokenizeMarkdown('[hello](http://x.test)');
    expect(tokens.find((t) => t.cls === 'ric-md-link')!.text).toBe('hello');
    expect(tokens.find((t) => t.cls === 'ric-md-url')!.text).toBe('http://x.test');
    expect(tokens.filter((t) => t.cls === 'ric-md-marker').map((t) => t.text)).toEqual(['[', ']', '(', ')']);
  });

  it('画像 ![alt](src) は ! も含めて marker/link/url に分ける', () => {
    const tokens = tokenizeMarkdown('![alt text](img.png)');
    expect(tokens.find((t) => t.cls === 'ric-md-link')!.text).toBe('alt text');
    expect(tokens.find((t) => t.cls === 'ric-md-url')!.text).toBe('img.png');
    expect(tokens.filter((t) => t.cls === 'ric-md-marker').map((t) => t.text)).toEqual(['!', '[', ']', '(', ')']);
  });

  it('オートリンク <http://...> を ric-md-url にする', () => {
    const tokens = tokenizeMarkdown('<https://example.com>');
    expect(tokens.find((t) => t.cls === 'ric-md-url')!.text).toBe('<https://example.com>');
  });

  it('未閉じの強調・コードは色分けされず plain のまま残る (cls: null)', () => {
    const tokens = tokenizeMarkdown('this is **not closed and `not closed either');
    expect(tokens.some((t) => t.cls === 'ric-md-strong')).toBe(false);
    expect(tokens.some((t) => t.cls === 'ric-md-code')).toBe(false);
    expect(tokens.every((t) => t.cls === null)).toBe(true);
  });
});

describe('tokenizeMarkdown: 性能 (目安、生成に時間をかけすぎない)', () => {
  it('20,000 文字規模のドキュメントを 200ms 未満で処理する', () => {
    const src = Array.from({ length: 400 }, (_, i) => `# heading ${i}\n\nSome **bold** and *em* text with a [link](http://x.test/${i}) and \`code\`.\n`).join('\n');
    expect(src.length).toBeGreaterThan(20_000 * 0.5); // 目安の桁を確認 (厳密な文字数は問わない)
    const start = performance.now();
    tokenizeMarkdown(src);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});
