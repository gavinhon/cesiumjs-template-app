import { useId, useState, type FormEvent } from 'react';
import { Field, SelectField } from '@/ui/Field';
import { createId } from '@/lib/createId';
import { EXAMPLE_TILESETS } from './exampleTilesets';
import type { TilesetConfig, TilesetFormat } from './tilesetTypes';

interface AddTilesetFormProps {
  onAdd: (config: TilesetConfig) => Promise<void>;
  /** True while the Cesium viewer hasn't finished initializing yet. */
  disabled: boolean;
}

type SubmitStatus = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string };

/** `<select>` values are strings; this one is the "pick one" prompt. */
const NO_EXAMPLE = '';

/** The example picker's headings, each with its examples, in list order. */
const EXAMPLE_GROUPS = [...new Set(EXAMPLE_TILESETS.map((entry) => entry.group))].map((group) => ({
  group,
  examples: EXAMPLE_TILESETS.filter((entry) => entry.group === group),
}));

/** Every ArcGIS scene service URL contains this, which is how a pasted one is recognised. */
const SCENE_SERVER = /\/SceneServer(\/|$|\?)/i;

/**
 * Form for connecting to a 3D Tiles dataset or an I3S scene layer by URL.
 *
 * Unlike adding an OGC layer (which is just filling in a config object),
 * loading a tileset means actually fetching and parsing it before we know
 * it worked — so this form has its own loading/error state around the
 * `await onAdd(...)` call, rather than firing and forgetting.
 *
 * The format follows the URL: pasting an ArcGIS `SceneServer` URL switches
 * it to I3S, which is right for every scene layer ArcGIS serves. It stays
 * a visible choice for I3S hosted elsewhere, such as static files in a
 * bucket.
 */
export function AddTilesetForm({ onAdd, disabled }: AddTilesetFormProps) {
  const formId = useId();
  const [example, setExample] = useState(NO_EXAMPLE);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TilesetFormat>('3d-tiles');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<SubmitStatus>({ state: 'idle' });

  function handleSelectExample(value: string) {
    setExample(value);
    const picked = EXAMPLE_TILESETS.find((entry) => entry.url === value);
    if (!picked) return;
    setName(picked.name);
    setFormat(picked.format);
    setUrl(picked.url);
  }

  function handleUrlChange(value: string) {
    setUrl(value);
    if (SCENE_SERVER.test(value)) setFormat('i3s');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus({ state: 'loading' });
    try {
      await onAdd({ id: createId(), name: name.trim() || 'Untitled tileset', format, url });
      setExample(NO_EXAMPLE);
      setName('');
      setUrl('');
      setStatus({ state: 'idle' });
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Failed to load tileset.',
      });
    }
  }

  return (
    <form className="panel-form" onSubmit={handleSubmit}>
      <SelectField
        formId={formId}
        fieldId="example"
        label="Example dataset"
        value={example}
        onChange={(e) => handleSelectExample(e.target.value)}
        hint="Free public Singapore datasets that fill in the form below, to try each format."
      >
        <option value={NO_EXAMPLE}>Choose an example…</option>
        {EXAMPLE_GROUPS.map(({ group, examples }) => (
          <optgroup key={group} label={group}>
            {examples.map((entry) => (
              <option key={entry.url} value={entry.url}>
                {entry.name}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>

      <Field
        formId={formId}
        fieldId="name"
        label="Display name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My tileset"
      />

      <SelectField
        formId={formId}
        fieldId="format"
        label="Format"
        value={format}
        onChange={(e) => setFormat(e.target.value as TilesetFormat)}
      >
        <option value="3d-tiles">3D Tiles (tileset.json)</option>
        <option value="i3s">I3S scene layer (ArcGIS SceneServer)</option>
      </SelectField>

      <Field
        formId={formId}
        fieldId="url"
        label={format === 'i3s' ? 'Scene layer URL' : 'Tileset URL'}
        required
        value={url}
        onChange={(e) => handleUrlChange(e.target.value)}
        placeholder={
          format === 'i3s'
            ? 'https://…/arcgis/rest/services/<name>/SceneServer/layers/0'
            : 'https://your-server/tileset.json'
        }
        hint={
          format === 'i3s' ? (
            <>
              A scene layer (<code>…/SceneServer/layers/0</code>), or a whole scene service (
              <code>…/SceneServer</code>), which loads every layer in it. Meshes, 3D objects and
              building layers load; point layers don't.
            </>
          ) : (
            <>
              Must point directly at a tileset.json — either a remote 3D Tiles service (or an
              S3/CloudFront URL, with CORS enabled), or a relative path like{' '}
              <code>/tilesets/my-data/tileset.json</code> pointing at a dataset placed under this
              project's <code>public/</code> folder.
            </>
          )
        }
      />

      {status.state === 'error' && (
        <p className="panel-form__status panel-form__status--error">{status.message}</p>
      )}

      <button
        type="submit"
        className="control control-button control-button--primary panel-form__submit"
        disabled={disabled || status.state === 'loading'}
      >
        {status.state === 'loading'
          ? 'Loading tileset…'
          : disabled
            ? 'Loading map…'
            : 'Add tileset'}
      </button>
    </form>
  );
}
