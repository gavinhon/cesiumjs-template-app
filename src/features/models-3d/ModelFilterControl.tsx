import { useId } from 'react';
import { SelectField } from '@/ui/Field';
import type { FilterableAttribute, ModelFilter } from './modelFilter';
import './ModelFilterControl.css';

interface ModelFilterControlProps {
  attributes: FilterableAttribute[];
  filter: ModelFilter;
  onChange: (change: Partial<ModelFilter>) => void;
  sectionRange: { min: number; max: number } | null;
}

const EVERYTHING = '';

export function ModelFilterControl({
  attributes,
  filter,
  onChange,
  sectionRange,
}: ModelFilterControlProps) {
  const formId = useId();
  if (attributes.length === 0 && !sectionRange) return null;

  const attribute = attributes.find((entry) => entry.id === filter.attributeId) ?? null;
  const hasFloors = attributes.some((entry) => entry.isFloor);
  const toggle = (value: string) =>
    onChange({
      values: filter.values.includes(value)
        ? filter.values.filter((entry) => entry !== value)
        : [...filter.values, value],
    });

  return (
    <div className="model-filter">
      {attributes.length > 0 && (
        <SelectField
          formId={formId}
          fieldId="attribute"
          label="Show only"
          value={filter.attributeId ?? EVERYTHING}
          onChange={(event) => onChange({ attributeId: event.target.value || null, values: [] })}
          hint={hasFloors ? undefined : 'No floor attribute in this model — use the cut below.'}
        >
          <option value={EVERYTHING}>Everything</option>
          {attributes.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.isFloor ? `Floor — ${entry.label}` : entry.label}
            </option>
          ))}
        </SelectField>
      )}

      {attribute && (
        <>
          <ul className="model-filter__values" aria-label={`${attribute.label} values`}>
            {attribute.values.map((value) => (
              <li key={value}>
                <label className="control-check model-filter__value">
                  <input
                    type="checkbox"
                    checked={filter.values.includes(value)}
                    onChange={() => toggle(value)}
                  />
                  <span>{value}</span>
                </label>
              </li>
            ))}
          </ul>
          {filter.values.length > 0 && (
            <button
              type="button"
              className="control control-button model-filter__reset"
              onClick={() => onChange({ values: [] })}
            >
              Show all
            </button>
          )}
        </>
      )}

      {sectionRange && (
        <label className="model-filter__section">
          <span className="control-check model-filter__section-label">
            <input
              type="checkbox"
              checked={filter.section !== null}
              onChange={(event) =>
                onChange({ section: event.target.checked ? sectionRange.max : null })
              }
            />
            Cut at height
          </span>
          <input
            type="range"
            min={sectionRange.min}
            max={sectionRange.max}
            step={0.1}
            value={filter.section ?? sectionRange.max}
            disabled={filter.section === null}
            onChange={(event) => onChange({ section: Number(event.target.value) })}
            aria-label="Cut height"
          />
          <span className="model-filter__section-value">
            {((filter.section ?? sectionRange.max) - sectionRange.min).toFixed(1)} m
          </span>
        </label>
      )}
    </div>
  );
}
