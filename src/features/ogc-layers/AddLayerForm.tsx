import { useId, useState, type FormEvent } from 'react';
import { Field, SelectField } from '@/ui/Field';
import { createId } from '@/lib/ids';
import type {
  GeographicBoundingBox,
  OgcLayerConfig,
  OgcServiceType,
  ServiceLayerOption,
  WfsVersion,
} from './types';
import { fetchWmsLayers } from './wmsCapabilities';
import { fetchWfsFeatureTypes } from './wfsCapabilities';

interface AddLayerFormProps {
  onAdd: (config: OgcLayerConfig) => Promise<void>;
  /** True while the Cesium viewer hasn't finished initializing yet. */
  disabled: boolean;
}

/**
 * State machine for the capabilities lookup — the "Look up layers" button
 * for WMS and "Look up feature types" for WFS. One state for both, because
 * from the form's point of view the two are the same interaction: ask the
 * server what it has, then pick from a list.
 */
type Lookup =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; options: ServiceLayerOption[] };

/** State machine for the submit itself, which can fail for WFS. */
type Submit = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string };

/** Service types whose layer/feature list can be discovered from GetCapabilities. */
const LOOKUP_SUPPORTED: OgcServiceType[] = ['wms', 'wfs'];

/**
 * Form for connecting to a new OGC service.
 *
 * The fields change with the selected service type, because each protocol
 * needs different parameters to build a working request:
 *
 *   - **WMS** needs a `LAYERS` name (or comma-separated list).
 *   - **WMTS** needs a layer, style, format, and tile matrix set identifier,
 *     since it fetches pre-baked tiles from a fixed grid rather than asking
 *     the server to render an arbitrary bounding box.
 *   - **XYZ** just needs a URL with {z}/{x}/{y} placeholders.
 *   - **WFS** needs a feature type, a protocol version (which decides the
 *     query parameter names — see `createWfsDataSource`), and a feature
 *     cap, because WFS has no tiling and will otherwise try to hand back
 *     an entire dataset in one response.
 *
 * WMS and WFS additionally offer a capabilities lookup, so you can pick a
 * real identifier off the server instead of having to already know it.
 */
export function AddLayerForm({ onAdd, disabled }: AddLayerFormProps) {
  const formId = useId();
  const [type, setType] = useState<OgcServiceType>('wms');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  // Shared by WMS `layers`, WMTS `layer`, and WFS `typeName` — all three are
  // "which thing on this server", and only one is ever visible at a time.
  const [layerName, setLayerName] = useState('');
  const [style, setStyle] = useState('default');
  const [format, setFormat] = useState('image/png');
  const [tileMatrixSetID, setTileMatrixSetID] = useState('GoogleMapsCompatible');
  const [urlTemplate, setUrlTemplate] = useState('');
  const [wfsVersion, setWfsVersion] = useState<WfsVersion>('2.0.0');
  const [maxFeatures, setMaxFeatures] = useState('1000');
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' });
  const [submit, setSubmit] = useState<Submit>({ status: 'idle' });
  // The selected layer's real extent, if known from the capabilities lookup
  // — carried through to submit so "zoom to layer" can fly straight to it
  // instead of falling back to a whole-globe view.
  const [boundingBox, setBoundingBox] = useState<GeographicBoundingBox>();

  const supportsLookup = LOOKUP_SUPPORTED.includes(type);

  /** Anything that invalidates a previous lookup: a new URL, or a new service type. */
  function resetLookup() {
    setLookup({ status: 'idle' });
    setBoundingBox(undefined);
  }

  async function handleLookup() {
    setLookup({ status: 'loading' });
    try {
      const options =
        type === 'wfs' ? await fetchWfsFeatureTypes(url, wfsVersion) : await fetchWmsLayers(url);
      setLookup({ status: 'success', options });
    } catch (error) {
      setLookup({
        status: 'error',
        message: error instanceof Error ? error.message : 'Lookup failed.',
      });
    }
  }

  // Selecting a discovered layer fills in its real identifier, and — if the
  // user hasn't already typed their own display name — proposes the layer's
  // human-readable title as a starting point. Display name stays optional
  // either way: it's only ever a fallback when left blank.
  function handleSelectDiscovered(selectedName: string, options: ServiceLayerOption[]) {
    setLayerName(selectedName);
    const selected = options.find((option) => option.name === selectedName);
    setBoundingBox(selected?.boundingBox);
    if (!name.trim() && selected) {
      setName(selected.title);
    }
  }

  /** Builds the discriminated-union config matching the selected service type. */
  function buildConfig(): OgcLayerConfig {
    const id = createId();
    const label = name.trim() || `${type.toUpperCase()} layer`;

    switch (type) {
      case 'wms':
        return { type, id, name: label, url, layers: layerName, boundingBox };
      case 'wmts':
        return { type, id, name: label, url, layer: layerName, style, format, tileMatrixSetID };
      case 'xyz':
        return { type, id, name: label, url: urlTemplate, urlTemplate };
      case 'wfs':
        return {
          type,
          id,
          name: label,
          url,
          typeName: layerName,
          version: wfsVersion,
          // A blank or nonsense cap would mean "no limit" to the server.
          maxFeatures: Number(maxFeatures) || 1000,
          boundingBox,
        };
      default: {
        // Exhaustiveness check: adding a service type without a case here
        // is a compile error rather than a runtime surprise.
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
      // Reset the entered values but keep the selected service type, so
      // adding several layers of the same kind in a row stays quick.
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
          setType(e.target.value as OgcServiceType);
          // A discovered layer list belongs to the service it came from.
          resetLookup();
          setLayerName('');
        }}
      >
        <option value="wms">WMS (Web Map Service)</option>
        <option value="wmts">WMTS (Web Map Tile Service)</option>
        <option value="wfs">WFS (Web Feature Service)</option>
        <option value="xyz">XYZ tile template</option>
      </SelectField>

      <Field
        formId={formId}
        fieldId="name"
        label="Display name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My layer"
      />

      {type !== 'xyz' && (
        <Field
          formId={formId}
          fieldId="url"
          label="Service URL"
          required
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            // A previously-fetched list (and any bounding box it gave us)
            // belongs to whatever URL it was fetched for.
            resetLookup();
          }}
          placeholder={
            type === 'wmts' ? 'https://your-server/wmts' : 'https://ahocevar.com/geoserver/wms'
          }
          hint={
            type === 'wfs'
              ? 'A WFS endpoint. GeoServer typically serves WMS and WFS from the same base URL.'
              : undefined
          }
        />
      )}

      {/* WFS version first: it changes which parameters the capabilities
          request and the eventual GetFeature request use, so it has to be
          right before the lookup runs. */}
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

      {/* WMS layer / WFS feature type: a picklist once discovered, a plain
          text field otherwise. Same control either way, so the form doesn't
          reshape itself around whether the lookup happened to work. */}
      {(type === 'wms' || type === 'wfs') &&
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
            label={type === 'wfs' ? 'Feature type name' : 'Layer name(s)'}
            required
            value={layerName}
            onChange={(e) => {
              setLayerName(e.target.value);
              // A hand-typed name isn't necessarily the one a previous
              // lookup's bounding box was for — don't zoom to the wrong place.
              setBoundingBox(undefined);
            }}
            placeholder="topp:states"
            hint={
              type === 'wfs'
                ? 'The WFS typeName parameter, or use “Look up feature types” above.'
                : 'Comma-separated WMS LAYERS parameter, or use “Look up layers” above.'
            }
          />
        ))}

      {type === 'wfs' && (
        <Field
          formId={formId}
          fieldId="max-features"
          label="Max features"
          type="number"
          min={1}
          required
          value={maxFeatures}
          onChange={(e) => setMaxFeatures(e.target.value)}
          hint="WFS sends every matching feature in one response — there is no tiling, so a large layer without a cap will hang the browser."
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
