import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import './Field.css';

interface FieldProps extends Omit<ComponentPropsWithoutRef<'input'>, 'id'> {
  formId: string;
  fieldId: string;
  label: string;
  hint?: ReactNode;
}

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
