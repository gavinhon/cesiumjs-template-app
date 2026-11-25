import { useId, useState, type FormEvent } from 'react';
import { Field, SelectField } from '@/ui/Field';
import { createId } from '@/lib/createId';
import type {
  GeographicBoundingBox,
  MapServiceConfig,
  MapServiceType,
  ServiceLayerOption,
  WfsVersion,
} from './mapServiceTypes';
import { featureLayerUrl, urlNamesLayer } from './arcGisRest';
import { fetchArcGisServiceLayers } from './fetchArcGisServiceLayers';
import { fetchWmsLayers } from './fetchWmsLayers';
import { fetchWfsFeatureTypes } from './fetchWfsFeatureTypes';

interface AddMapServiceFormProps {
  onAdd: (config: MapServiceConfig) => Promise<void>;
  disabled: boolean;
}

type Lookup =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; options: ServiceLayerOption[] };

type Submit = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string };

const LOOKUP_SUPPORTED: MapServiceType[] = ['wms', 'wfs', 'arcgis-feature'];

const DEFAULT_NAME: Record<MapServiceType, string> = {
  wms: 'WMS layer',
  wmts: 'WMTS layer',
  xyz: 'XYZ layer',
  wfs: 'WFS layer',
  'arcgis-map': 'ArcGIS map service',
  'arcgis-feature': 'ArcGIS feature layer',
};

const URL_PLACEHOLDER: Record<MapServiceType, string> = {
  wms: 'https://ahocevar.com/geoserver/wms',
  wmts: 'https://your-server/wmts',
  xyz: '',
  wfs: 'https://ahocevar.com/geoserver/wfs',
  'arcgis-map': 'https://…/arcgis/rest/services/<name>/MapServer',
  'arcgis-feature': 'https://…/arcgis/rest/services/<name>/FeatureServer',
};

const URL_HINT: Partial<Record<MapServiceType, string>> = {
  wfs: 'A WFS endpoint. GeoServer typically serves WMS and WFS from the same base URL.',
  'arcgis-map':
    'The service URL, ending in /MapServer. Cached services load as tiles; others are drawn per request.',
  'arcgis-feature':
    'A FeatureServer, a MapServer, or one layer of either (ending in its id, e.g. /FeatureServer/0).',
};

const LAYER_FIELD_LABEL: Partial<Record<MapServiceType, string>> = {
  wms: 'Layer name(s)',
  wfs: 'Feature type name',
  'arcgis-feature': 'Layer id',
};

export function AddMapServiceForm({ onAdd, disabled }: AddMapServiceFormProps) {
  const formId = useId();
  const [type, setType] = useState<MapServiceType>('wms');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [layerName, setLayerName] = useState('');
  const [style, setStyle] = useState('default');
  const [format, setFormat] = useState('image/png');
  const [tileMatrixSetID, setTileMatrixSetID] = useState('GoogleMapsCompatible');
  const [urlTemplate, setUrlTemplate] = useState('');
  const [wfsVersion, setWfsVersion] = useState<WfsVersion>('2.0.0');
  const [maxFeatures, setMaxFeatures] = useState('1000');
  const [token, setToken] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' });
  const [submit, setSubmit] = useState<Submit>({ status: 'idle' });
  const [boundingBox, setBoundingBox] = useState<GeographicBoundingBox>();

  const isArcGis = type === 'arcgis-map' || type === 'arcgis-feature';
  const needsLayer =
    type === 'wms' || type === 'wfs' || (type === 'arcgis-feature' && !urlNamesLayer(url));
  const supportsLookup = LOOKUP_SUPPORTED.includes(type) && needsLayer;

  function resetLookup() {
    setLookup({ status: 'idle' });
    setBoundingBox(undefined);
  }

  async function handleLookup() {
    setLookup({ status: 'loading' });
    try {
      const options =
        type === 'wfs'
          ? await fetchWfsFeatureTypes(url, wfsVersion)
          : type === 'arcgis-feature'
            ? await fetchArcGisServiceLayers(url, token.trim() || undefined)
            : await fetchWmsLayers(url);
      setLookup({ status: 'success', options });
    } catch (error) {
      setLookup({
        status: 'error',
        message: error instanceof Error ? error.message : 'Lookup failed.',
      });
    }
  }

  function handleSelectDiscovered(selectedName: string, options: ServiceLayerOption[]) {
    setLayerName(selectedName);
    const selected = options.find((option) => option.name === selectedName);
    setBoundingBox(selected?.boundingBox);
    if (!name.trim() && selected) {
      setName(selected.title);
    }
  }

  function buildConfig(): MapServiceConfig {
    const id = createId();
    const label = name.trim() || DEFAULT_NAME[type];
    const featureCap = Number(maxFeatures) || 1000;
    const accessToken = token.trim() || undefined;

    switch (type) {
      case 'wms':
        return { type, id, name: label, url, layers: layerName, boundingBox };
      case 'wmts':
        return { type, id, name: label, url, layer: layerName, style, format, tileMatrixSetID };
      case 'xyz':
        return { type, id, name: label, url: urlTemplate };
      case 'wfs':
        return {
          type,
          id,
          name: label,
          url,
          typeName: layerName,
          version: wfsVersion,
          maxFeatures: featureCap,
          boundingBox,
        };
      case 'arcgis-map':
        return { type, id, name: label, url, token: accessToken };
      case 'arcgis-feature':
        return {
          type,
          id,
          name: label,
          url: featureLayerUrl(url, layerName),
          maxFeatures: featureCap,
          token: accessToken,
        };
      default: {
        const exhaustive: never = type;
        throw new Error(`Unsupported service type: ${String(exhaustive)}`);
      }
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmit({ status: 'loading' });
    try {
      await onAdd(buildConfig());
      setName('');
      setUrl('');
      setLayerName('');
      setUrlTemplate('');
      resetLookup();
      setSubmit({ status: 'idle' });
    } catch (error) {
      setSubmit({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to add layer.',
      });
    }
  }

  return (
    <form className="panel-form" onSubmit={handleSubmit}>
      <SelectField
        formId={formId}
        fieldId="type"
        label="Service type"
        value={type}
        onChange={(e) => {
          setType(e.target.value as MapServiceType);
          resetLookup();
          setLayerName('');
        }}
      >
        <option value="wms">WMS (Web Map Service)</option>
        <option value="wmts">WMTS (Web Map Tile Service)</option>
        <option value="wfs">WFS (Web Feature Service)</option>
        <option value="xyz">XYZ tile template</option>
        <option value="arcgis-map">ArcGIS MapServer (imagery)</option>
        <option value="arcgis-feature">ArcGIS FeatureServer / layer (vector)</option>
      </SelectField>

      {type !== 'xyz' && (
        <Field
          formId={formId}
          fieldId="url"
          label="Service URL"
          required
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            resetLookup();
          }}
          placeholder={URL_PLACEHOLDER[type]}
          hint={URL_HINT[type]}
        />
      )}

      {isArcGis && (
        <Field
          formId={formId}
          fieldId="token"
          label="Token (optional)"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            resetLookup();
          }}
          autoComplete="off"
          hint="Only for secured services. It's sent in every request URL, so treat it as visible."
        />
      )}

      {type === 'wfs' && (
        <SelectField
          formId={formId}
          fieldId="wfs-version"
          label="WFS version"
          value={wfsVersion}
          onChange={(e) => {
            setWfsVersion(e.target.value as WfsVersion);
            resetLookup();
          }}
          hint="2.0.0 unless the server is older. This decides the request parameter names."
        >
          <option value="2.0.0">2.0.0</option>
          <option value="1.1.0">1.1.0</option>
        </SelectField>
      )}

      {supportsLookup && (
        <>
          <button
            type="button"
            className="control control-button panel-form__action"
            onClick={handleLookup}
            disabled={!url.trim() || lookup.status === 'loading'}
          >
            {lookup.status === 'loading'
              ? 'Looking up…'
              : type === 'wfs'
                ? 'Look up feature types'
                : 'Look up layers'}
          </button>

          {lookup.status === 'error' && (
            <p className="panel-form__status panel-form__status--error">
              {lookup.message} You can still enter the name manually below.
            </p>
          )}
        </>
      )}

      {needsLayer &&
        (lookup.status === 'success' ? (
          <SelectField
            formId={formId}
            fieldId="layers"
            label={type === 'wfs' ? 'Feature type' : 'Layer'}
            required
            value={layerName}
            onChange={(e) => handleSelectDiscovered(e.target.value, lookup.options)}
          >
            <option value="" disabled>
              {type === 'wfs' ? 'Select a feature type…' : 'Select a layer…'}
            </option>
            {lookup.options.map((option) => (
              <option key={option.name} value={option.name}>
                {option.title}
              </option>
            ))}
          </SelectField>
        ) : (
          <Field
            formId={formId}
            fieldId="layers"
            label={LAYER_FIELD_LABEL[type] ?? 'Layer'}
            required
            value={layerName}
            onChange={(e) => {
              setLayerName(e.target.value);
              setBoundingBox(undefined);
            }}
            placeholder={type === 'arcgis-feature' ? '0' : 'topp:states'}
            hint={
              type === 'wfs'
                ? 'The WFS typeName parameter, or use “Look up feature types” above.'
                : type === 'arcgis-feature'
                  ? 'The layer’s numeric id, or use “Look up layers” above.'
                  : 'Comma-separated WMS LAYERS parameter, or use “Look up layers” above.'
            }
          />
        ))}

      {(type === 'wfs' || type === 'arcgis-feature') && (
        <Field
          formId={formId}
          fieldId="max-features"
          label="Max features"
          type="number"
          min={1}
          required
          value={maxFeatures}
          onChange={(e) => setMaxFeatures(e.target.value)}
          hint={
            type === 'wfs'
              ? 'WFS sends every matching feature in one response — there is no tiling, so a large layer without a cap will hang the browser.'
              : 'Features arrive in one response, like WFS. The server also applies its own limit (maxRecordCount), whichever is smaller.'
          }
        />
      )}

      {type === 'wmts' && (
        <>
          <Field
            formId={formId}
            fieldId="layer"
            label="Layer"
            required
            value={layerName}
            onChange={(e) => setLayerName(e.target.value)}
            placeholder="layer_identifier"
          />
          <Field
            formId={formId}
            fieldId="style"
            label="Style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
          />
          <Field
            formId={formId}
            fieldId="format"
            label="Format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          />
          <Field
            formId={formId}
            fieldId="tms"
            label="Tile matrix set ID"
            required
            value={tileMatrixSetID}
            onChange={(e) => setTileMatrixSetID(e.target.value)}
            hint={`Must match an identifier from the server's GetCapabilities document (often "GoogleMapsCompatible" for web-mercator grids).`}
          />
        </>
      )}

      {type === 'xyz' && (
        <Field
          formId={formId}
          fieldId="template"
          label="URL template"
          required
          value={urlTemplate}
          onChange={(e) => setUrlTemplate(e.target.value)}
          placeholder="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          hint="Must contain {z}/{x}/{y} placeholders."
        />
      )}

      <Field
        formId={formId}
        fieldId="name"
        label="Display name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My layer"
      />

      {submit.status === 'error' && (
        <p className="panel-form__status panel-form__status--error">{submit.message}</p>
      )}

      <button
        type="submit"
        className="control control-button control-button--primary panel-form__submit"
        disabled={disabled || submit.status === 'loading'}
      >
        {submit.status === 'loading' ? 'Adding layer…' : disabled ? 'Loading map…' : 'Add layer'}
      </button>
    </form>
  );
}
