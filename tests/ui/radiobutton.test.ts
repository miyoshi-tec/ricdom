// uiRadiobutton (設計書 §3.4、per-option 属性転送 + 隔離契約)

import { describe, expect, it, vi } from 'vitest';
import { uiRadiobutton } from '../../src/ui/radiobutton.js';

interface TestRadioLabelNode {
  tag: string;
  class: string;
  title?: string;
  id?: string;
  checked?: boolean;
  onchange?: (ev: unknown) => void;
  children: [TestRadioInputNode, TestRadioSpanNode];
  [key: string]: unknown;
}
interface TestRadioInputNode {
  tag: string;
  type: string;
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onchange?: (ev: unknown) => void;
}
interface TestRadioSpanNode {
  tag: string;
  class: string;
  children: unknown[];
}
interface TestRadiogroupNode {
  tag: string;
  class: string;
  'data-ricdom-role'?: string;
  children: TestRadioLabelNode[];
  [key: string]: unknown;
}

describe('uiRadiobutton', () => {
  it('文字列 options を正規化して radio の集合を作る', () => {
    const node = uiRadiobutton({ name: 'role', value: 'editor', options: ['viewer', 'editor', 'admin'] }) as unknown as TestRadiogroupNode;
    expect(node.tag).toBe('div');
    expect(node.class).toBe('ric-radiogroup');
    expect(node['data-ricdom-role']).toBe('radiogroup');
    expect(node.children.length).toBe(3);
    const editor = node.children[1]!;
    expect(editor.children[0].value).toBe('editor');
    expect(editor.children[0].checked).toBe(true);
    expect(node.children[0]!.children[0].checked).toBe(false);
  });

  it('name が各 input に共通で渡る', () => {
    const node = uiRadiobutton({ name: 'grp', value: 'a', options: ['a', 'b'] }) as unknown as TestRadiogroupNode;
    expect(node.children[0]!.children[0].name).toBe('grp');
    expect(node.children[1]!.children[0].name).toBe('grp');
  });

  it('{ value, label } 形式の options で label が反映される (span children)', () => {
    const node = uiRadiobutton({ name: 'lang', value: 'ja', options: [{ value: 'ja', label: '日本語' }] }) as unknown as TestRadiogroupNode;
    expect(node.children[0]!.children[1].children).toEqual(['日本語']);
  });

  // uiSelect と同じ穴 (2.0.0-alpha.31): label を省略すると「undefined」と表示されていた
  it('label を省略した { value } は、value を表示する (「undefined」と出さない)', () => {
    const node = uiRadiobutton({ name: 'k', value: 'x', options: [{ value: 'x' }, { value: 'y', label: 0 as unknown as string }] }) as unknown as TestRadiogroupNode;
    expect(node.children[0]!.children[1].children).toEqual(['x']);
    expect(node.children[1]!.children[1].children).toEqual(['0']);
  });

  it('label に配列 (RicNode 混在) を渡すとそのまま children になる', () => {
    const icon = { tag: 'svg' };
    const node = uiRadiobutton({ name: 'x', options: [{ value: 'a', label: [icon, ' List'] }] }) as unknown as TestRadiogroupNode;
    expect(node.children[0]!.children[1].children).toEqual([icon, ' List']);
  });

  it('per-option の追加キー (title/data-*/id/class) が各選択肢の label に転送される', () => {
    const node = uiRadiobutton({ name: 'x', options: [{ value: 'a', label: 'A', title: '説明', class: 'extra', 'data-x': '1' }] }) as unknown as TestRadiogroupNode;
    const opt = node.children[0]!;
    expect(opt.title).toBe('説明');
    expect(opt.class).toBe('ric-radio extra');
    expect(opt['data-x']).toBe('1');
  });

  it('隔離契約: onchange は各選択肢の内部 input にのみ付く (外側 label には漏れない)', () => {
    const handler = vi.fn();
    const node = uiRadiobutton({ name: 'x', options: ['a'], onchange: handler }) as unknown as TestRadiogroupNode;
    const opt = node.children[0]!;
    expect(opt.onchange).toBeUndefined();
    expect(opt.children[0].onchange).toBe(handler);
  });

  it('disabled: true で各選択肢の class に修飾子が付き、内部 input にも disabled が付く', () => {
    const node = uiRadiobutton({ name: 'x', options: ['a'], disabled: true }) as unknown as TestRadiogroupNode;
    expect(node.children[0]!.class).toBe('ric-radio ric-radio--disabled');
    expect(node.children[0]!.children[0].disabled).toBe(true);
  });

  it('rest スプレッドで id/class 等は外側 div (ric-radiogroup) に付く', () => {
    const node = uiRadiobutton({ name: 'x', options: [], id: 'grp', class: 'extra' }) as unknown as TestRadiogroupNode;
    expect(node.id).toBe('grp');
    expect(node.class).toBe('ric-radiogroup extra');
  });
});
