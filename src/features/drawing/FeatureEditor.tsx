import { useId } from 'react';
import { Field, SelectField } from '@/ui/Field';
import type { DrawnFeature, FeatureAttribute, LabelSource } from './types';
import { FIXED_LABEL_SOURCES } from './types';

interface FeatureEditorProps {
  feature: DrawnFeature;
  onRename: (name: string) => void;
  onSetLabelSource: (source: LabelSource) => void;
  onAddAttribute: () => void;
  onUpdateAttribute: (attributeId: string, patch: Partial<Omit<FeatureAttribute, 'id'>>) => void;
  onRemoveAttribute: (attributeId: string) => void;
}

/**
 * Everything you can change about one drawn shape: its name, the attributes
 * recorded against it, and which of them its map label shows.
 *
 * Attributes are free-form key/value pairs rather than a fixed schema,
 * because this is a template and nobody here knows what you're mapping.
 * Reshaping the geometry isn't in this panel — you do that by dragging the
 * vertex handles that appear on the map when a shape is selected, which is
 * where the shape actually is.
 */
export function FeatureEditor({
  feature,
  onRename,
  onSetLabelSource,
  onAddAttribute,
  onUpdateAttribute,
  onRemoveAttribute,
}: FeatureEditorProps) {
  const formId = useId();

  return (
    <div className="feature-editor">
      <Field
        formId={formId}
        fieldId="name"
        label="Name"
        value={feature.name}
        onChange={(e) => onRename(e.target.value)}
        placeholder="Unnamed"
      />

      <SelectField
        formId={formId}
        fieldId="label-source"
        label="Map label"
        value={feature.labelSource}
        onChange={(e) => onSetLabelSource(e.target.value)}
        hint="What this shape shows on the map."
      >
        {FIXED_LABEL_SOURCES.map((source) => (
          <option key={source.value} value={source.value}>
            {source.label}
          </option>
        ))}
        {/* Only measurements have one, so offering it elsewhere would be a
            choice that silently does nothing. */}
        {feature.measurement !== null && <option value="measurement">Measured distance</option>}
        {feature.attributes.map((attribute) => (
          <option key={attribute.id} value={attribute.id}>
            {attribute.key.trim() || 'Unnamed attribute'}
          </option>
        ))}
      </SelectField>

      <div className="feature-editor__attributes">
        <h3 className="feature-editor__heading">Attributes</h3>

        {feature.attributes.length === 0 ? (
          <p className="feature-editor__empty">
            No attributes yet. Add one to record something about this shape.
          </p>
        ) : (
          <ul className="feature-editor__list">
            {feature.attributes.map((attribute) => (
              <li key={attribute.id} className="feature-editor__attribute">
                <input
                  className="feature-editor__key"
                  value={attribute.key}
                  onChange={(e) => onUpdateAttribute(attribute.id, { key: e.target.value })}
                  placeholder="Key"
                  aria-label="Attribute key"
                />
                <input
                  className="feature-editor__value"
                  value={attribute.value}
                  onChange={(e) => onUpdateAttribute(attribute.id, { value: e.target.value })}
                  placeholder="Value"
                  aria-label="Attribute value"
                />
                <button
                  type="button"
                  className="resource-list__remove"
                  onClick={() => onRemoveAttribute(attribute.id)}
                  aria-label={`Remove attribute ${attribute.key || '(unnamed)'}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="control control-button panel-form__action"
          onClick={onAddAttribute}
        >
          Add attribute
        </button>
      </div>
    </div>
  );
}
