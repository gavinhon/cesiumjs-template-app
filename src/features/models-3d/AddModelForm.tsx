import { useId, useState, type FormEvent } from 'react';
import { Field, SelectField } from '@/ui/Field';
import { createId } from '@/lib/createId';
import type { ModelConfig, ModelFormat } from './modelTypes';

interface AddModelFormProps {
  onAdd: (config: ModelConfig) => Promise<void>;
  disabled: boolean;
}

type SubmitStatus = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string };

const SCENE_SERVER = /\/SceneServer(\/|$|\?)/i;

export function AddModelForm({ onAdd, disabled }: AddModelFormProps) {
  const formId = useId();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<ModelFormat>('3d-tiles');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<SubmitStatus>({ state: 'idle' });

  function handleUrlChange(value: string) {
    setUrl(value);
    if (SCENE_SERVER.test(value)) setFormat('i3s');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus({ state: 'loading' });
    try {
      await onAdd({ id: createId(), name: name.trim() || 'Untitled tileset', format, url });
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
        fieldId="format"
        label="Format"
        value={format}
        onChange={(e) => setFormat(e.target.value as ModelFormat)}
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
          format === 'i3s'
            ? 'A scene layer, or a whole SceneServer to load every layer in it.'
            : 'A tileset.json URL — remote (with CORS), or a path under public/.'
        }
      />

      <Field
        formId={formId}
        fieldId="name"
        label="Display name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={format === 'i3s' ? 'My scene layer' : 'My tileset'}
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
          ? 'Loading…'
          : disabled
            ? 'Loading map…'
            : format === 'i3s'
              ? 'Add scene layer'
              : 'Add tileset'}
      </button>
    </form>
  );
}
