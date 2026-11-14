// uiProgress (2.0.0-alpha.33、Paper Bridge の依頼): 状態を持たない進捗棒

import { describe, expect, it } from 'vitest';
import { uiProgress } from '../../src/ui/progress.js';

interface TestNode {
  tag: string;
  class?: string;
  role?: string;
  style?: Record<string, string>;
  children?: unknown[];
  [key: string]: unknown;
}

const kids = (n: TestNode): TestNode[] => (n.children ?? []).filter((c): c is TestNode => typeof c === 'object' && c !== null) as TestNode[];
const find = (n: TestNode, cls: string): TestNode | undefined => {
  if (typeof n.class === 'string' && n.class.split(' ').includes(cls)) return n;
  for (const c of kids(n)) {
    const hit = find(c, cls);
    if (hit) return hit;
  }
  return undefined;
};

describe('uiProgress', () => {
  it('value (0〜1) を % にして、棒の幅・aria-valuenow・表示の数字に出す', () => {
    const node = uiProgress({ value: 0.42, label: 'けいさん中' }) as unknown as TestNode;
    expect(node.tag).toBe('div');
    expect(node.class).toBe('ric-progress');
    expect(node['data-ricdom-role']).toBe('progress');

    const track = find(node, 'ric-progress__track')!;
    expect(track.role).toBe('progressbar');
    expect(track['aria-valuemin']).toBe('0');
    expect(track['aria-valuemax']).toBe('100');
    expect(track['aria-valuenow']).toBe('42');
    expect(find(node, 'ric-progress__fill')!.style).toEqual({ width: '42%' });
    expect(find(node, 'ric-progress__percent')!.children).toEqual(['42%']);
  });

  it('範囲外は 0〜1 に収め、% は四捨五入する', () => {
    const pct = (value: number): unknown => find(uiProgress({ value }) as unknown as TestNode, 'ric-progress__track')!['aria-valuenow'];
    expect(pct(-0.5)).toBe('0');
    expect(pct(1.7)).toBe('100');
    expect(pct(0.004)).toBe('0');
    expect(pct(0.005)).toBe('1');
    expect(pct(0.996)).toBe('100');
  });

  it('value を省略 (または null / NaN) すると「不定」: aria-valuenow も % も出さない', () => {
    for (const value of [undefined, null, Number.NaN]) {
      const node = uiProgress({ value, label: 'まっています' }) as unknown as TestNode;
      const track = find(node, 'ric-progress__track')!;
      expect(track.class).toBe('ric-progress__track ric-progress__track--indeterminate');
      expect('aria-valuenow' in track).toBe(false);
      expect(find(node, 'ric-progress__fill')!.style).toBeUndefined();
      expect(find(node, 'ric-progress__percent')).toBeUndefined();
    }
  });

  it('label は role=status の中に出す。% は status の外で aria-hidden (進むたびに読み上げさせない)', () => {
    const node = uiProgress({ value: 0.5, label: 'しらべています' }) as unknown as TestNode;
    const label = find(node, 'ric-progress__label')!;
    expect(label.role).toBe('status');
    expect(label.children).toEqual(['しらべています']);
    const percent = find(node, 'ric-progress__percent')!;
    expect(percent['aria-hidden']).toBe('true');
    expect(kids(label)).toEqual([]); // % は label (status) の子ではない
  });

  it('棒の読み上げ名: label が文字列ならそれ、barLabel があればそちらが優先', () => {
    const name = (props: Parameters<typeof uiProgress>[0]): unknown => find(uiProgress(props) as unknown as TestNode, 'ric-progress__track')!['aria-label'];
    expect(name({ value: 0.1, label: 'よみこみ' })).toBe('よみこみ');
    expect(name({ value: 0.1, label: 'よみこみ', barLabel: 'ファイルの読み込み' })).toBe('ファイルの読み込み');
    expect(name({ value: 0.1, label: [{ tag: 'b', children: ['x'] }], barLabel: 'すすみぐあい' })).toBe('すすみぐあい');
    expect(name({ value: 0.1 })).toBeUndefined();
  });

  it('showPercent: false で % を出さない。label も無ければ見出しの行ごと出さない', () => {
    const node = uiProgress({ value: 0.5, showPercent: false }) as unknown as TestNode;
    expect(find(node, 'ric-progress__percent')).toBeUndefined();
    expect(find(node, 'ric-progress__head')).toBeUndefined();
    expect(find(node, 'ric-progress__track')).toBeDefined();
  });

  it('children (補足の文) と action (やめるボタンなど) は棒の下の行に出す。どちらも無ければ行ごと出さない', () => {
    const cancel = { tag: 'button', children: ['やめる'] };
    const node = uiProgress({ value: 0.5, children: ['はじめてから 12 びょう'], action: cancel }) as unknown as TestNode;
    expect(find(node, 'ric-progress__detail')!.children).toEqual(['はじめてから 12 びょう']);
    expect(find(node, 'ric-progress__action')!.children).toEqual([cancel]);
    // 補足の文は毎秒変わりうるので status にしない (読み上げさせない)
    expect(find(node, 'ric-progress__detail')!.role).toBeUndefined();

    expect(find(uiProgress({ value: 0.5 }) as unknown as TestNode, 'ric-progress__foot')).toBeUndefined();
    // action だけでも行は出て、ボタンは右に寄る (detail の箱が幅を引き受ける)
    const onlyAction = uiProgress({ value: 0.5, action: cancel }) as unknown as TestNode;
    expect(find(onlyAction, 'ric-progress__detail')).toBeDefined();
    expect(find(onlyAction, 'ric-progress__action')).toBeDefined();
  });

  it('rest スプレッドと class / style は外側の div に付く', () => {
    const node = uiProgress({ value: 0.5, id: 'run', class: 'mine', style: { marginTop: '8px' }, 'data-x': '1' }) as unknown as TestNode;
    expect(node.id).toBe('run');
    expect(node.class).toBe('ric-progress mine');
    expect(node.style).toEqual({ marginTop: '8px' });
    expect(node['data-x']).toBe('1');
  });
});
