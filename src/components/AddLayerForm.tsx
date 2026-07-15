import { useId, useState, type FormEvent } from 'react';
import type { OgcLayerConfig, OgcServiceType } from '../ogc/types';

interface AddLayerFormProps {
  onAdd: (config: OgcLayerConfig) => void;
  /** True while the Cesium viewer hasn't finished initializing yet. */
  disabled: boolean;
}

/** A locally-unique id for a layer — no backend, so no need for a real uuid library. */
function generateId() {
  return crypto.randomUUID();
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const id = generateId();
    const label = name.trim() || `${type.toUpperCase()} layer`;

    // Build the discriminated-union config matching whichever type is
    // currently selected. TypeScript enforces that every branch produces
    // an object shaped like the `type` tag says it should.
    let config: OgcLayerConfig;
    if (type === 'wms') {
      config = { type, id, name: label, url, layers: layerName };
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

      <div className="field">
        <label htmlFor={`${formId}-name`}>Display name</label>
        <input
          id={`${formId}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My layer"
        />
      </div>

      {type !== 'xyz' && (
        <div className="field">
          <label htmlFor={`${formId}-url`}>Service URL</label>
          <input
            id={`${formId}-url`}
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={
              type === 'wms'
                ? 'https://ahocevar.com/geoserver/wms'
                : 'https://your-server/wmts'
            }
          />
        </div>
      )}

      {type === 'wms' && (
        <div className="field">
          <label htmlFor={`${formId}-layers`}>Layer name(s)</label>
          <input
            id={`${formId}-layers`}
            required
            value={layerName}
            onChange={(e) => setLayerName(e.target.value)}
            placeholder="topp:states"
          />
          <small>Comma-separated WMS LAYERS parameter.</small>
        </div>
      )}

      {type === 'wmts' && (
        <>
          <div className="field">
            <label htmlFor={`${formId}-layer`}>Layer</label>
            <input
              id={`${formId}-layer`}
              required
              value={layerName}
              onChange={(e) => setLayerName(e.target.value)}
              placeholder="layer_identifier"
            />
          </div>
          <div className="field">
            <label htmlFor={`${formId}-style`}>Style</label>
            <input
              id={`${formId}-style`}
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${formId}-format`}>Format</label>
            <input
              id={`${formId}-format`}
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${formId}-tms`}>Tile matrix set ID</label>
            <input
              id={`${formId}-tms`}
              required
              value={tileMatrixSetID}
              onChange={(e) => setTileMatrixSetID(e.target.value)}
            />
            <small>
              Must match an identifier from the server's GetCapabilities
              document (often "GoogleMapsCompatible" for web-mercator grids).
            </small>
          </div>
        </>
      )}

      {type === 'xyz' && (
        <div className="field">
          <label htmlFor={`${formId}-template`}>URL template</label>
          <input
            id={`${formId}-template`}
            required
            value={urlTemplate}
            onChange={(e) => setUrlTemplate(e.target.value)}
            placeholder="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <small>
            Must contain {'{z}'}/{'{x}'}/{'{y}'} placeholders.
          </small>
        </div>
      )}

      <button type="submit" disabled={disabled}>
        {disabled ? 'Loading map…' : 'Add layer'}
      </button>
    </form>
  );
}
