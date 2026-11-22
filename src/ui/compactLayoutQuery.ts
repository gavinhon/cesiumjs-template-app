/**
 * The media query for the compact (phone) layout: panels become bottom
 * sheets, the toolbar folds its panel buttons into a menu, and the feature
 * card docks to the bottom instead of following the clicked point.
 *
 * CSS media queries can't read a custom property, so the stylesheets that
 * switch layout (`Panel.css`, `AppToolbar.css`, `FeatureInfoCard.css`,
 * `LayerList.css`, `LayerListButton.css`, `BasemapSwitcher.css`,
 * `global.css`) repeat this width literally. Change them together.
 */
export const COMPACT_LAYOUT_QUERY = '(max-width: 640px)';

/**
 * Where a side panel and the open layer list don't both fit, so opening
 * one closes (or collapses) the other — see `showPanel` in App.tsx.
 * Narrow windows, where a 320px panel and the 264px list would meet, and
 * short ones: a phone on its side is ~800px wide but only ~375 tall, and
 * two lists side by side left a strip of map between two ~200px stubs.
 * Short screens keep the side layout rather than bottom sheets, which
 * would have even less height to work with.
 */
export const SINGLE_PANEL_QUERY = '(max-width: 800px), (max-height: 500px)';
