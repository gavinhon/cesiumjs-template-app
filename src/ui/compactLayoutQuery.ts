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
