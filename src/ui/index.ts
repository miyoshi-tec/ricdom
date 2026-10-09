// ricdom/ui — 公開エントリポイント
// 部品契約 + portal + テーマ + CSS 配布、状態を持たない部品 (control/layout/text) + bind* を提供する。
//
// IIFE ビルド (dist/ricdom-ui.iife.min.js) はここから globalName `ricdomUI` として
// まとめてグローバルに公開される (tsup.config.ts 参照)。`ricdom` (コア) の後に
// 読み込む想定 (型のみの参照であり、バンドル上の実行時依存は無い — 詳細は最終報告)。

// `version` export (v1→v2 パリティ一括監査 #3、2.0.0-alpha.14)。コア src/index.ts の
// version と同じ理由・同じ仕組み (__RICDOM_VERSION__、tsup.config.ts / src/env.d.ts 参照)。
// ui はコアに実行時依存が無いので、コア側の export を re-export せず同じ定数を独立に読む
// (ui はコアと別々に import される場合がある — ricdomUI.version がコア読み込み無しでも
// 単独で使えることを保証する)。
export const version: string = typeof __RICDOM_VERSION__ === 'string' ? __RICDOM_VERSION__ : '0.0.0-dev';

export { applyTheme, createTheme, createDensity, createFontSize, exportTheme, exportSettings } from './theme.js';
export type { ThemeName, DensityName, FontSizeName, ThemeVars, ApplyThemeOptions, ExportedSettings } from './theme.js';

export { buildStylesheet } from './cssTemplates.js';
export { injectStyles } from './injectStyles.js';

export { uiButton } from './button.js';
export type { UiButtonProps, UiButtonVariant } from './button.js';

export { uiInput } from './input.js';
export type { UiInputProps } from './input.js';

// ── 状態を持たない部品 (control) ──
export { uiTextarea } from './textarea.js';
export type { UiTextareaProps, UiTextareaAutoResize } from './textarea.js';

export { uiCheckbox } from './checkbox.js';
export type { UiCheckboxProps } from './checkbox.js';

export { uiRadiobutton } from './radiobutton.js';
export type { UiRadiobuttonProps, UiRadiobuttonOption } from './radiobutton.js';

export { uiSelect } from './select.js';
export type { UiSelectProps, UiSelectOption } from './select.js';

export { uiRange } from './range.js';
export type { UiRangeProps } from './range.js';

export { uiColor } from './color.js';
export type { UiColorProps } from './color.js';

export { uiSeparator } from './separator.js';
export type { UiSeparatorProps } from './separator.js';

export { uiText } from './text.js';
export type { UiTextProps, UiTextVariant } from './text.js';

export { uiIcon } from './icon.js';
export type { IconDescriptor, UiIconOptions } from './icon.js';

export { bindInput, bindTextarea, bindCheckbox, bindSelect, bindRange, bindRadiobutton, bindColor } from './bind.js';

// ── レイアウト ──
export { uiCol } from './col.js';
export type { UiColProps } from './col.js';

export { uiRow } from './row.js';
export type { UiRowProps } from './row.js';

export { uiGrid } from './grid.js';
export type { UiGridProps } from './grid.js';

export { uiPanel } from './panel.js';
export type { UiPanelProps, UiPanelLayout } from './panel.js';

// ── テキスト ──
export { uiMdPre } from './mdPre.js';
export type { UiMdPreProps, MdTransformText, MdTransformImageSrc } from './mdPre.js';

export { uiCodePre } from './codePre.js';
export type { UiCodePreProps } from './codePre.js';

export { createDialog } from './dialog.js';
export type { DialogProps, DialogInstance, DialogCloseReason, DialogOpenOptions } from './dialog.js';

export { createPopup } from './popup.js';
export type { PopupProps, PopupInstance, PopupPoint } from './popup.js';

export { createToast } from './toast.js';
export type { ToastInstance, ToastShowOptions, ToastType } from './toast.js';

export { createTooltip } from './tooltip.js';
export type { TooltipProps, TooltipInstance, TooltipDir } from './tooltip.js';

// ── 状態を持つ部品 ──
export { createSplitter } from './splitter.js';
export type { SplitterProps, SplitterInstance, CreateSplitterOptions, SplitterSide } from './splitter.js';

export { createScrollPane } from './scrollPane.js';
export type { ScrollPaneProps, ScrollPaneInstance, CreateScrollPaneOptions, ScrollPaneFollow } from './scrollPane.js';

export { createCollapseBox } from './collapseBox.js';
export type { CollapseBoxProps, CollapseBoxInstance, CreateCollapseBoxOptions, CollapseBoxDirection } from './collapseBox.js';

export { createAccordion } from './accordion.js';
export type { AccordionProps, AccordionInstance, CreateAccordionOptions, AccordionItem } from './accordion.js';

export { createTabs } from './tabs.js';
export type { TabsProps, TabsInstance, TabItem, TabsVariant } from './tabs.js';

export { createDropdown } from './dropdown.js';
export type { DropdownProps, DropdownInstance } from './dropdown.js';

export { createFocusWhen } from './focusWhen.js';
export type { FocusWhenInstance } from './focusWhen.js';

// ── パラメータ調整パネル ──
export { createTweakPanel, inferTweakType } from './tweakPanel.js';
export type { TweakPanelProps, TweakPanelInstance, TweakKeyOverride, TweakKeys, TweakRowType, TweakInferredType } from './tweakPanel.js';

export type { Component, Host } from './internal/component.js';
