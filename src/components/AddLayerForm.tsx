import { useId, useState, type ComponentPropsWithoutRef, type FormEvent } from 'react';
import type { OgcLayerConfig, OgcServiceType } from '../ogc/types';
import {
  fetchWmsLayers,
  type GeographicBoundingBox,
  type WmsLayerOption,
} from '../ogc/wmsCapabilities';

interface AddLayerFormProps {
  onAdd: (config: OgcLayerConfig) => void;
  /** True while the Cesium viewer hasn't finished initializing yet. */
  disabled: boolean;
}

/** State machine for the "Look up layers" button's WMS capabilities fetch. */
type WmsLookup =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; layers: WmsLayerOption[] };

/** A locally-unique id for a layer — no backend, so no need for a real uuid library. */
function generateId() {
  return crypto.randomUUID();
}

interface FieldProps extends Omit<ComponentPropsWithoutRef<'input'>, 'id'> {
  formId: string;
  fieldId: string;
  label: string;
  hint?: string;
}

/**
 * A labeled text input with an optional hint line underneath.
 *
 * Every simple text field in this form (name, URL, layer, style, format, ...)
 * is one of these — pulling it out avoids repeating the same
 * label/input/hint markup eight times below.
 */
function Field({ formId, fieldId, label, hint, ...inputProps }: FieldProps) {
  const htmlId = `${formId}-${fieldId}`;
  return (
    <div className="field">
      <label htmlFor={htmlId}>{label}</label>
      <input id={htmlId} {...inputProps} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

/**
 * Form for connecting to a new OGC layer.
 *
 * The fields shown change with the selected service type, because each
 * protocol needs different parameters to build a working tile request:
 *   - WMS needs a `LAYERS` name (or comma-separated list).
 *   - WMTS needs a layer, style, format, and tile matrix set identifier,
 *     since it fetches pre-baked tiles from a fixed grid rather than
 *     asking the server to render an arbitrary bounding box.
 *   - A generic XYZ template just needs a URL with {z}/{x}/{y} placeholders.
 */
export function AddLayerForm({ onAdd, disabled }: AddLayerFormProps) {
  const formId = useId();
  const [type, setType] = useState<OgcServiceType>('wms');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [layerName, setLayerName] = useState(''); // WMS `layers` / WMTS `layer`
  const [style, setStyle] = useState('default');
  const [format, setFormat] = useState('image/png');
  const [tileMatrixSetID, setTileMatrixSetID] = useState('GoogleMapsCompatible');
  const [urlTemplate, setUrlTemplate] = useState('');
  const [wmsLookup, setWmsLookup] = useState<WmsLookup>({ status: 'idle' });
  // The selected layer's real extent, if known from the capabilities
  // lookup — carried through to submit so "zoom to layer" (in the sidebar
  // list) can fly straight to it instead of a whole-globe fallback.
  const [wmsBoundingBox, setWmsBoundingBox] = useState<GeographicBoundingBox>();

  // Ask the WMS server what layers it has, and offer them as a picklist —
  // see src/ogc/wmsCapabilities.ts for how the request/parsing works.
  async function handleLookupLayers() {
    setWmsLookup({ status: 'loading' });
    try {
      const layers = await fetchWmsLayers(url);
      setWmsLookup({ status: 'success', layers });
    } catch (error) {
      setWmsLookup({
        status: 'error',
        message: error instanceof Error ? error.message : 'Lookup failed.',
      });
    }
  }

  // Selecting a discovered layer fills in its real identifier, and — if
  // the user hasn't already typed their own display name — also proposes
  // the layer's human-readable title as a starting point. Display name
  // stays fully optional either way: it's only ever used as a fallback
  // when left blank (see handleSubmit below).
  function handleSelectLayer(selectedName: string, layers: WmsLayerOption[]) {
    setLayerName(selectedName);
    const selected = layers.find((l) => l.name === selectedName);
    setWmsBoundingBox(selected?.boundingBox);
    if (!name.trim() && selected) {
      setName(selected.title);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const id = generateId();
    const label = name.trim() || `${type.toUpperCase()} layer`;

    // Build the discriminated-union config matching whichever type is
    // currently selected. TypeScript enforces that every branch produces
    // an object shaped like the `type` tag says it should.
    let config: OgcLayerConfig;
    if (type === 'wms') {
      config = { type, id, name: label, url, layers: layerName, boundingBox: wmsBoundingBox };
    } else if (type === 'wmts') {
      config = {
        type,
        id,
        name: label,
        url,
        layer: layerName,
        style,
        format,
        tileMatrixSetID,
      };
    } else {
      config = { type, id, name: label, url: urlTemplate, urlTemplate };
    }

    onAdd(config);

    // Reset the entered values but keep the selected service type, so
    // adding several layers of the same kind in a row stays quick.
    setName('');
    setUrl('');
    setLayerName('');
    setUrlTemplate('');
    setWmsLookup({ status: 'idle' });
    setWmsBoundingBox(undefined);
  }

  return (
    <form className="add-layer-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor={`${formId}-type`}>Service type</label>
        <select
          id={`${formId}-type`}
          value={type}
          onChange={(e) => setType(e.target.value as OgcServiceType)}
        >
          <option value="wms">WMS (Web Map Service)</option>
          <option value="wmts">WMTS (Web Map Tile Service)</option>
          <option value="xyz">XYZ tile template</option>
        </select>
      </div>

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
            // A previously-fetched layer list (and any bounding box it
            // gave us) belongs to whatever URL it was fetched for —
            // editing the URL invalidates both.
            setWmsLookup({ status: 'idle' });
            setWmsBoundingBox(undefined);
          }}
          placeholder={
            type === 'wms' ? 'https://ahocevar.com/geoserver/wms' : 'https://your-server/wmts'
          }
        />
      )}

      {type === 'wms' && (
        <>
          <button
            type="button"
            className="control control-button add-layer-form__lookup"
            onClick={handleLookupLayers}
            disabled={!url.trim() || wmsLookup.status === 'loading'}
          >
            {wmsLookup.status === 'loading' ? 'Looking up layers…' : 'Look up layers'}
          </button>

          {wmsLookup.status === 'error' && (
            <p className="add-layer-form__status add-layer-form__status--error">
              {wmsLookup.message} You can still enter the layer name manually below.
            </p>
          )}

          {wmsLookup.status === 'success' ? (
            <div className="field">
              <label htmlFor={`${formId}-layers`}>Layer</label>
              <select
                id={`${formId}-layers`}
                required
                value={layerName}
                onChange={(e) => handleSelectLayer(e.target.value, wmsLookup.layers)}
              >
                <option value="" disabled>
                  Select a layer…
                </option>
                {wmsLookup.layers.map((layer) => (
                  <option key={layer.name} value={layer.name}>
                    {layer.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Field
              formId={formId}
              fieldId="layers"
              label="Layer name(s)"
              required
              value={layerName}
              onChange={(e) => {
                setLayerName(e.target.value);
                // A hand-typed name isn't necessarily the layer a previous
                // lookup's bounding box was for — don't zoom to the wrong place.
                setWmsBoundingBox(undefined);
              }}
              placeholder="topp:states"
              hint="Comma-separated WMS LAYERS parameter, or use “Look up layers” above."
            />
          )}
        </>
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

      <button
        type="submit"
        className="control control-button add-layer-form__submit"
        disabled={disabled}
      >
        {disabled ? 'Loading map…' : 'Add layer'}
      </button>
    </form>
  );
}
