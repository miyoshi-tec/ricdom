// uiSelect (設計書 §3.4、value/option 構築順はコアが解決済み)

import { describe, expect, it, vi } from 'vitest';
import { uiSelect } from '../../src/ui/select.js';

interface TestOptionNode {
  tag: string;
  value: string;
  disabled?: boolean;
  children: string[];
}
interface TestSelectNode {
  tag: string;
  class: string;
  value: string;
  disabled?: boolean;
  'data-ricdom-role'?: string;
  onchange?: (ev: unknown) => void;
  children: unknown[];
  [key: string]: unknown;
}

// 子の先頭は選んだ文字の表示先 (<button><selectedcontent>、2.0.0-alpha.30)、option はその後ろ
const optionsOf = (node: TestSelectNode): TestOptionNode[] => node.children.slice(1) as TestOptionNode[];

describe('uiSelect', () => {
  it('文字列 options を { value, label } に正規化する', () => {
    const node = uiSelect({ value: 'b', options: ['a', 'b', 'c'] }) as unknown as TestSelectNode;
    expect(node.tag).toBe('select');
    expect(node.class).toBe('ric-select');
    expect(node['data-ricdom-role']).toBe('select');
    expect(node.value).toBe('b');
    expect(optionsOf(node).map((o) => o.value)).toEqual(['a', 'b', 'c']);
    expect(optionsOf(node)[1]!.children).toEqual(['b']);
  });

  it('{ value, label } 形式の options を扱える', () => {
    const node = uiSelect({ options: [{ value: 'ja', label: '日本語' }] }) as unknown as TestSelectNode;
    expect(optionsOf(node)[0]!.value).toBe('ja');
    expect(optionsOf(node)[0]!.children).toEqual(['日本語']);
  });

  // label は型の上で省略できるのに、省略すると String(undefined) で「undefined」と表示されていた
  // (2.0.0-alpha.31)。HTML の <option value="x"> と同じく、値をそのまま表示する。
  it('label を省略した { value } は、value を表示する (「undefined」と出さない)', () => {
    const node = uiSelect({ options: [{ value: 'x' }, { value: 'y', label: 0 }, { value: 'z', label: '' }] }) as unknown as TestSelectNode;
    expect(optionsOf(node)[0]!.children).toEqual(['x']);
    expect(optionsOf(node)[1]!.children).toEqual(['0']); // 0 は有効なラベル
    expect(optionsOf(node)[2]!.children).toEqual(['']); // 空文字も指定どおり
  });

  it('placeholder があると先頭に選択不可オプションが追加される', () => {
    const node = uiSelect({ options: ['a'], placeholder: '選んでください' }) as unknown as TestSelectNode;
    expect(optionsOf(node).length).toBe(2);
    expect(optionsOf(node)[0]!.value).toBe('');
    expect(optionsOf(node)[0]!.disabled).toBe(true);
    expect(optionsOf(node)[0]!.children).toEqual(['選んでください']);
  });

  it('placeholder が無ければ選択不可オプションは追加されない', () => {
    const node = uiSelect({ options: ['a'] }) as unknown as TestSelectNode;
    expect(optionsOf(node).length).toBe(1);
  });

  it('子の先頭は <button><selectedcontent> で、selectedcontent は island (中身はブラウザが書く)', () => {
    const node = uiSelect({ options: ['a'] }) as unknown as TestSelectNode;
    expect(node.children[0]).toEqual({ tag: 'button', children: [{ tag: 'selectedcontent', island: true }] });
    // 選択肢が無くても先頭の子は変わらない (子の位置がずれると option の差分がずれる)
    expect((uiSelect() as unknown as TestSelectNode).children).toEqual([{ tag: 'button', children: [{ tag: 'selectedcontent', island: true }] }]);
  });

  it('rest スプレッドで onchange/disabled/id/class 等を透過する', () => {
    const handler = vi.fn();
    const node = uiSelect({ onchange: handler, disabled: true, id: 'role', class: 'extra' }) as unknown as TestSelectNode;
    expect(node.onchange).toBe(handler);
    expect(node.disabled).toBe(true);
    expect(node.id).toBe('role');
    expect(node.class).toBe('ric-select extra');
  });

  it('value は空文字でも常に含まれる', () => {
    const node = uiSelect() as unknown as TestSelectNode;
    expect('value' in node).toBe(true);
    expect(node.value).toBe('');
  });
});
