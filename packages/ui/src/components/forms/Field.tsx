import type { InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, ...inputProps }: FieldProps) {
  return (
    <div className="ss-field">
      {label && <label>{label}</label>}
      <input className="ss-input" {...inputProps} />
      {error ? (
        <span className="ss-field-error">{error}</span>
      ) : hint ? (
        <span className="ss-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
