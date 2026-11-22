/**
 * The media query for the compact (phone) layout: panels become bottom
 * sheets, the toolbar folds its panel buttons into a menu, and the feature
 * card docks to the bottom instead of following the clicked point.
 *
 * CSS media queries can't read a custom property, so the stylesheets that
 * switch layout (`Panel.css`, `AppToolbar.css`, `FeatureInfoCard.css`,
 * `global.css`) repeat this width literally. Change them together.
 */
export const COMPACT_LAYOUT_QUERY = '(max-width: 640px)';

/**
 * Where only one side panel fits at a time, so opening one closes the
 * other (`showPanel` in App.tsx). Narrow windows, and short ones: a phone
 * on its side is ~800px wide — room for two 320px panels — but only ~375
 * tall, so two panels left a strip of map between two ~200px-tall lists.
 * Short screens keep side panels rather than bottom sheets, which would
 * have even less height to work with.
 */
export const SINGLE_PANEL_QUERY = '(max-width: 800px), (max-height: 500px)';
