import { useId, useState, type FormEvent } from 'react';
import { Field } from '@/ui/Field';
import { createId } from '@/lib/createId';
import type { TilesetConfig } from './tilesetTypes';

interface AddTilesetFormProps {
  onAdd: (config: TilesetConfig) => Promise<void>;
  /** True while the Cesium viewer hasn't finished initializing yet. */
  disabled: boolean;
}

type SubmitStatus = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string };

/**
 * Form for connecting to a 3D Tiles dataset by URL.
 *
 * Unlike adding an OGC layer (which is just filling in a config object),
 * loading a tileset means actually fetching and parsing tileset.json
 * before we know it worked — so this form has its own loading/error state
 * around the `await onAdd(...)` call, rather than firing and forgetting.
 */
export function AddTilesetForm({ onAdd, disabled }: AddTilesetFormProps) {
  const formId = useId();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<SubmitStatus>({ state: 'idle' });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus({ state: 'loading' });
    try {
      await onAdd({ id: createId(), name: name.trim() || 'Untitled tileset', url });
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
      <Field
        formId={formId}
        fieldId="name"
        label="Display name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My tileset"
      />

      <Field
        formId={formId}
        fieldId="url"
        label="Tileset URL"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://your-server/tileset.json"
        hint={
          <>
            Must point directly at a tileset.json — either a remote 3D Tiles service (or an
            S3/CloudFront URL, with CORS enabled), or a relative path like{' '}
            <code>/tilesets/my-data/tileset.json</code> pointing at a dataset placed under this
            project's <code>public/</code> folder.
          </>
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
