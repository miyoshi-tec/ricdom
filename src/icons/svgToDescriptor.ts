// ricdom/icons — SVG → アイコン descriptor 変換器
//
// v1 (docs/icons/svg_to_descriptor.js) の TS 化。任意のアイコン SVG 文字列を uiIcon の
// descriptor `{ v?, s?, p }` に変換する。CLI (`ricdom-icon`、Lucide fetch 経路) と
// アイコンピッカー相当の用途から使う (A17: 「データ + 変換器 + CLI」の変換器部分)。
//
// 対応要素: <path> <line> <polyline> <polygon> <rect> <circle> <ellipse>
//   path 以外はすべて path の d 文字列に厳密変換する (決定的・幾何計算のみ)。
//   これにより descriptor は常に path ベース ({ p }) で統一される。
//
// stroke / fill 判定 (ソースの <svg> ルート属性から):
//   fill="none" (Lucide/Feather/Tabler 等の線画)        → stroke モード (s = stroke-width or 2)
//   fill=色 かつ stroke 無し (Heroicons solid 等の塗り)  → fill モード   (s = null)
//   どちらとも取れない                                    → 既定 stroke 2
//
// 出力は正準形 (既定値を省く): v は '0 0 24 24' なら省略、s は 2 なら省略、
// fill モードは s:null を明示。

import type { IconDescriptor } from './types.js';

const DEFAULT_VIEWBOX = '0 0 24 24';

// 数値を短く整形 (小数 3 桁、末尾 0 / 不要な小数点を除去)
const num = (v: string | number): string => {
  const n = Math.round(parseFloat(String(v)) * 1000) / 1000;
  return String(n);
};

// 要素の属性を { name: value } に
const parseAttrs = (attrStr: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr))) attrs[m[1]!] = m[2]!;
  return attrs;
};

// points="x1,y1 x2,y2 ..." or "x1 y1 x2 y2 ..." → [[x,y], ...]
const parsePoints = (pts: string): [string, string][] => {
  const nums = pts.trim().split(/[\s,]+/).map(num);
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
  return out;
};

const polyToD = (pts: [string, string][], close: boolean): string => {
  if (pts.length === 0) return '';
  let d = 'M' + pts[0]![0] + ' ' + pts[0]![1];
  for (let i = 1; i < pts.length; i++) d += 'L' + pts[i]![0] + ' ' + pts[i]![1];
  return close ? d + 'z' : d;
};

// <rect> → path (rx があれば角丸)
const rectToD = (a: Record<string, string>): string => {
  const x = parseFloat(a.x || '0');
  const y = parseFloat(a.y || '0');
  const w = parseFloat(a.width || '0');
  const h = parseFloat(a.height || '0');
  let rx = a.rx != null ? parseFloat(a.rx) : a.ry != null ? parseFloat(a.ry) : 0;
  let ry = a.ry != null ? parseFloat(a.ry) : a.rx != null ? parseFloat(a.rx) : 0;
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (rx <= 0 || ry <= 0) {
    return `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`;
  }
  return (
    `M${num(x + rx)} ${num(y)}` +
    `h${num(w - 2 * rx)}a${num(rx)} ${num(ry)} 0 0 1 ${num(rx)} ${num(ry)}` +
    `v${num(h - 2 * ry)}a${num(rx)} ${num(ry)} 0 0 1 ${num(-rx)} ${num(ry)}` +
    `h${num(-(w - 2 * rx))}a${num(rx)} ${num(ry)} 0 0 1 ${num(-rx)} ${num(-ry)}` +
    `v${num(-(h - 2 * ry))}a${num(rx)} ${num(ry)} 0 0 1 ${num(rx)} ${num(-ry)}z`
  );
};

// <circle> / <ellipse> → path (2 つの弧で 1 周)
const ellipseToD = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${num(cx - rx)} ${num(cy)}` + `a${num(rx)} ${num(ry)} 0 1 0 ${num(2 * rx)} 0` + `a${num(rx)} ${num(ry)} 0 1 0 ${num(-2 * rx)} 0z`;

const elemToD = (tag: string, a: Record<string, string>): string => {
  switch (tag) {
    case 'path':
      return a.d ? a.d.trim() : '';
    case 'line':
      return `M${num(a.x1 || '0')} ${num(a.y1 || '0')}L${num(a.x2 || '0')} ${num(a.y2 || '0')}`;
    case 'polyline':
      return polyToD(parsePoints(a.points || ''), false);
    case 'polygon':
      return polyToD(parsePoints(a.points || ''), true);
    case 'rect':
      return rectToD(a);
    case 'circle':
      return ellipseToD(parseFloat(a.cx || '0'), parseFloat(a.cy || '0'), parseFloat(a.r || '0'), parseFloat(a.r || '0'));
    case 'ellipse':
      return ellipseToD(parseFloat(a.cx || '0'), parseFloat(a.cy || '0'), parseFloat(a.rx || '0'), parseFloat(a.ry || '0'));
    default:
      return '';
  }
};

// v1 svg_to_descriptor の TS 移植。
/** SVG 文字列 → uiIcon descriptor `{ v?, s?, p }`。 */
export const svgToDescriptor = (svg: string): IconDescriptor => {
  if (typeof svg !== 'string') throw new Error('svgToDescriptor: 文字列を渡してください');

  // <svg ...> ルートタグの属性
  const rootM = svg.match(/<svg\b([^>]*)>/i);
  const rootAttrs = rootM ? parseAttrs(rootM[1]!) : {};

  // viewBox
  const v = (rootAttrs.viewBox || DEFAULT_VIEWBOX).trim();

  // stroke / fill 判定
  const rootFill = (rootAttrs.fill || '').trim().toLowerCase();
  const rootStroke = (rootAttrs.stroke || '').trim().toLowerCase();
  let isFill: boolean;
  if (rootFill === 'none') isFill = false; // 明示 stroke
  else if (rootFill && rootFill !== 'none' && !rootStroke) isFill = true; // 塗り
  else isFill = false; // 既定 stroke
  const sw = rootAttrs['stroke-width'] != null ? parseFloat(rootAttrs['stroke-width']!) : 2;

  // 子要素を出現順に抽出 → path d 配列へ
  const paths: string[] = [];
  const re = /<(path|line|polyline|polygon|rect|circle|ellipse)\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const d = elemToD(m[1]!.toLowerCase(), parseAttrs(m[2]!));
    if (d) paths.push(d);
  }
  if (paths.length === 0) throw new Error('svgToDescriptor: 描画要素が見つかりません');

  // 正準化
  const out: IconDescriptor = {};
  if (v !== DEFAULT_VIEWBOX) out.v = v;
  if (isFill) out.s = null; // fill モードは明示
  else if (sw !== 2) out.s = sw; // 既定 2 は省略
  out.p = paths.length === 1 ? paths[0] : paths;
  return out;
};
