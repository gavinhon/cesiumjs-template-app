import { useId } from 'react';
import { Field, SelectField } from '@/ui/Field';
import type { DrawnFeature, FeatureAttribute, LabelSource } from './drawingTypes';
import { FIXED_LABEL_SOURCES } from './drawingTypes';

interface DrawnFeatureEditorProps {
  feature: DrawnFeature;
  onRename: (name: string) => void;
  onSetLabelSource: (source: LabelSource) => void;
  onAddAttribute: () => void;
  onUpdateAttribute: (attributeId: string, patch: Partial<Omit<FeatureAttribute, 'id'>>) => void;
  onRemoveAttribute: (attributeId: string) => void;
}

export function DrawnFeatureEditor({
  feature,
  onRename,
  onSetLabelSource,
  onAddAttribute,
  onUpdateAttribute,
  onRemoveAttribute,
}: DrawnFeatureEditorProps) {
  const formId = useId();

  return (
    <div className="drawn-feature-editor">
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
        {feature.measurement !== null && <option value="measurement">Measurement</option>}
        {feature.attributes.map((attribute) => (
          <option key={attribute.id} value={attribute.id}>
            {attribute.key.trim() || 'Unnamed attribute'}
          </option>
        ))}
      </SelectField>

      <div className="drawn-feature-editor__attributes">
        <h3 className="drawn-feature-editor__heading">Attributes</h3>

        {feature.attributes.length === 0 ? (
          <p className="drawn-feature-editor__empty">
            No attributes yet. Add one to record something about this shape.
          </p>
        ) : (
          <ul className="drawn-feature-editor__list">
            {feature.attributes.map((attribute) => (
              <li key={attribute.id} className="drawn-feature-editor__attribute">
                <input
                  className="drawn-feature-editor__key"
                  value={attribute.key}
                  onChange={(e) => onUpdateAttribute(attribute.id, { key: e.target.value })}
                  placeholder="Key"
                  aria-label="Attribute key"
                />
                <input
                  className="drawn-feature-editor__value"
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
