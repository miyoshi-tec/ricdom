// 実ブラウザのテスト専用のヘルパー (`@vitest/browser/context` を使うので jsdom の unit からは import しない)。

import { userEvent } from '@vitest/browser/context';

/**
 * マウスポインタを、画面の右下の隅 (4×4px の一時的な要素の上) へ退避する。
 *
 * 実ブラウザのポインタ位置は **テストをまたいで、テストファイルをまたいでも残る**。前のテストが
 * どこかをクリックしたままだと、次のテストがその位置に描いた要素は最初から `:hover` になる。
 * 「何も操作していないときの見た目」(背景色・枠の色など) を assert するテストは、その前に
 * これを呼ぶ。呼ばないと、直前にどのファイルが走ったかで結果が変わる
 * (2026-11-14: uiButtonVariant の「link ボタンの背景は透明」が、全体実行の 4 回に 1〜2 回だけ
 * hover の背景色 `rgba(229, 231, 235, 0.576)` = 色の変化の途中の値で落ちた。単独実行では通る)。
 */
export const parkPointer = async (): Promise<void> => {
  const park = document.createElement('div');
  park.style.cssText = 'position:fixed;right:0;bottom:0;width:4px;height:4px;';
  document.body.appendChild(park);
  try {
    await userEvent.hover(park);
  } finally {
    park.remove();
  }
};
