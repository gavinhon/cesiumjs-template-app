/**
 * Every side panel the app can open.
 *
 * `App` holds one `PanelId | null` per side rather than a boolean per
 * panel, which is what makes "one panel per side" true by construction
 * instead of by careful bookkeeping.
 *
 * All three are opened from the top-left `<AppToolbar>`, which renders a
 * button per entry in its `PANELS` registry; the Layers panel also opens
 * Add data from its own header.
 */
export type PanelId = 'layers' | 'add-data' | 'drawings';

/**
 * Which edge each panel docks to. `App` keeps one panel open per side, so
 * Layers on the left and Add data on the right can be open at once — you
 * add a dataset on one side and watch it arrive on the other — without ever
 * overlapping.
 */
export const PANEL_SIDE: Record<PanelId, 'left' | 'right'> = {
  layers: 'left',
  drawings: 'left',
  'add-data': 'right',
};
