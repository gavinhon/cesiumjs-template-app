/**
 * Every side panel the app can open.
 *
 * `App` holds one `PanelId | null` rather than a boolean per panel, which
 * is what makes "only one panel open at a time" true by construction
 * instead of by careful bookkeeping.
 *
 * Most panels are opened from the top-left `<Toolbar>`, which renders a
 * button per entry in its `PANELS` registry. The layer manager is the
 * exception: its button lives in the right rail above the drawing tools,
 * so it appears here but not in that registry.
 */
export type PanelId = 'ogc-layers' | 'tiles-3d' | 'layers' | 'drawings';
