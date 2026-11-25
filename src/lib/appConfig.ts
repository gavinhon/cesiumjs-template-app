export interface AppConfig {
  offline: boolean;
  datasetCatalogue?: string;
  defaultBasemap?: string;
  nominatimUrl?: string;
  liveTraffic?: string;
}

const DEFAULTS: AppConfig = { offline: false };

export const APP_CONFIG: AppConfig = await loadAppConfig();

async function loadAppConfig(): Promise<AppConfig> {
  if (typeof document === 'undefined') return DEFAULTS;
  try {
    const response = await fetch(new URL('app-config.json', document.baseURI), {
      cache: 'no-store',
    });
    if (!response.ok) return DEFAULTS;
    // Vite dev answers unknown paths with index.html; the JSON parse catches that.
    const raw: unknown = await response.json();
    if (typeof raw !== 'object' || raw === null) return DEFAULTS;
    const record = raw as Record<string, unknown>;
    return {
      offline: record.offline === true,
      ...(typeof record.datasetCatalogue === 'string' &&
        record.datasetCatalogue && { datasetCatalogue: record.datasetCatalogue }),
      ...(typeof record.defaultBasemap === 'string' &&
        record.defaultBasemap && { defaultBasemap: record.defaultBasemap }),
      ...(typeof record.nominatimUrl === 'string' &&
        record.nominatimUrl && { nominatimUrl: record.nominatimUrl }),
      ...(typeof record.liveTraffic === 'string' &&
        record.liveTraffic && { liveTraffic: record.liveTraffic }),
    };
  } catch {
    return DEFAULTS;
  }
}
