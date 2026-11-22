/**
 * Every side panel the app can open. Both dock to the left edge, one at a
 * time — `App` holds a single `PanelId | null`, which is what makes "one
 * panel at a time" true by construction instead of by bookkeeping.
 *
 * Both are opened from the top-left `<AppToolbar>`, which renders a button
 * per entry in its `PANELS` registry. What's on the map isn't a panel: the
 * layer list (top-right) is always in view, so it needs no button.
 */
export type PanelId = 'add-data' | 'drawings';
