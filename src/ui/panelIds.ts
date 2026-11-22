/**
 * Every side panel the app can open.
 *
 * `App` holds one `PanelId | null` per slot rather than a boolean per
 * panel, which is what makes "one panel per slot" true by construction
 * instead of by careful bookkeeping.
 *
 * All three are opened from the top-left `<AppToolbar>`, which renders a
 * button per entry in its `PANELS` registry; the Layers panel also opens
 * Add data from its own header.
 */
export type PanelId = 'layers' | 'add-data' | 'drawings';

/**
 * Where a panel docks: `'left'`, against the left edge, or `'beside'` —
 * immediately to the right of whatever left panel is open, or at the left
 * edge itself when none is.
 */
export type PanelSlot = 'left' | 'beside';

/**
 * Which slot each panel takes. `App` keeps one panel open per slot, so
 * Layers and Add data can be open at once, side by side: the catalogue
 * opens right next to the list it adds to, under the toolbar button that
 * opened it, and you watch each dataset arrive in Layers beside it. (Add
 * data used to dock to the right edge — the far side of the screen from
 * its own button.)
 */
export const PANEL_SLOT: Record<PanelId, PanelSlot> = {
  layers: 'left',
  drawings: 'left',
  'add-data': 'beside',
};
