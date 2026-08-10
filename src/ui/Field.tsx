import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import './Field.css';

interface FieldProps extends Omit<ComponentPropsWithoutRef<'input'>, 'id'> {
  /**
   * The owning form's `useId()` value. Ids must be unique per *document*,
   * not per component, so two panels rendering a "name" field at the same
   * time would otherwise collide and break label-to-input association.
   */
  formId: string;
  /** Unique within the form, e.g. "url". Combined with `formId` into the DOM id. */
  fieldId: string;
  label: string;
  /** Optional help text under the input, e.g. the expected URL shape. */
  hint?: ReactNode;
}

/**
 * A labeled text input with an optional hint line underneath — the standard
 * form row for every panel in this app.
 *
 * Use this rather than hand-rolling `<label>`/`<input>`: it is what
 * guarantees the label is actually associated with its input (screen
 * readers, and click-the-label-to-focus) and that every field in every
 * panel looks the same.
 */
export function Field({ formId, fieldId, label, hint, ...inputProps }: FieldProps) {
  const htmlId = `${formId}-${fieldId}`;
  return (
    <div className="field">
      <label htmlFor={htmlId}>{label}</label>
      <input id={htmlId} {...inputProps} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

interface SelectFieldProps extends Omit<ComponentPropsWithoutRef<'select'>, 'id'> {
  formId: string;
  fieldId: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}

/** The `<select>` counterpart of `<Field>`, with the same label/hint layout. */
export function SelectField({
  formId,
  fieldId,
  label,
  hint,
  children,
  ...selectProps
}: SelectFieldProps) {
  const htmlId = `${formId}-${fieldId}`;
  return (
    <div className="field">
      <label htmlFor={htmlId}>{label}</label>
      <select id={htmlId} {...selectProps}>
        {children}
      </select>
      {hint && <small>{hint}</small>}
    </div>
  );
}
