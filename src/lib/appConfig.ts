/**
 * Settings decided where the app is *deployed*, not where it was built:
 * read once at startup from `app-config.json` beside `index.html`.
 *
 * **Why a fetched file rather than `import.meta.env`.** Vite inlines
 * environment variables into the bundle at build time, so changing one
 * means rebuilding. The Docker image is built once on a connected machine
 * and carried to air-gapped ones (docs/deployment-docker.md); there,
 * "offline or not" and "where are the datasets" are properties of the
 * site, so the container's entrypoint writes this file from its
 * environment each time it starts (`scripts/writeRuntimeConfig.ts`).
 *
 * In `npm run dev` and on GitHub Pages there is no such file, and the
 * defaults below are exactly how the app behaved before it existed:
 * online, with the datasets the build-time scan of `public/` found.
 *
 * **One switch, read in one place each.** Every internet dependency checks
 * `APP_CONFIG.offline` where it's defined — the basemap list, the example
 * services, place search, the I3S geoid — rather than each feature
 * probing the network its own way. That keeps "what does offline turn
 * off?" answerable by searching for one name.
 *
 * Kept free of Cesium and React so anything can import it.
 */
export interface AppConfig {
  /**
   * No internet access: hide every feature that needs a server outside
   * this app (online basemaps, place search, example services) instead of
   * letting each one fail on its own.
   */
  offline: boolean;
  /**
   * URL of a dataset catalogue written at runtime, relative to the page
   * (e.g. `datasets.json`). Absent means use the one baked in by the
   * build-time scan of `public/` — see `publicDatasets.ts`.
   */
  datasetCatalogue?: string;
  /** Id of the basemap to start with, if not the default (see `basemaps.ts`). */
  defaultBasemap?: string;
}

const DEFAULTS: AppConfig = { offline: false };

/** The deployment's settings, resolved before any module that reads them runs. */
export const APP_CONFIG: AppConfig = await loadAppConfig();

/**
 * Fetches and validates `app-config.json`, falling back to the defaults if
 * it's missing or unreadable.
 *
 * "Missing" has two faces: a 404 on a static host, and — in `vite dev` —
 * a 200 carrying `index.html`, because Vite answers any unknown path with
 * the app shell. Parsing as JSON catches both. Each field is checked
 * rather than cast, since the file is hand-editable in a deployment.
 */
async function loadAppConfig(): Promise<AppConfig> {
  // No document under Vitest (Node): there's no page to be relative to.
  if (typeof document === 'undefined') return DEFAULTS;
  try {
    const response = await fetch(new URL('app-config.json', document.baseURI), {
      // Re-read on every load: the file changes whenever the container is
      // reconfigured, while its URL never does.
      cache: 'no-store',
    });
    if (!response.ok) return DEFAULTS;
    const raw: unknown = await response.json();
    if (typeof raw !== 'object' || raw === null) return DEFAULTS;
    const record = raw as Record<string, unknown>;
    return {
      offline: record.offline === true,
      ...(typeof record.datasetCatalogue === 'string' &&
        record.datasetCatalogue && { datasetCatalogue: record.datasetCatalogue }),
      ...(typeof record.defaultBasemap === 'string' &&
        record.defaultBasemap && { defaultBasemap: record.defaultBasemap }),
    };
  } catch {
    return DEFAULTS;
  }
}
