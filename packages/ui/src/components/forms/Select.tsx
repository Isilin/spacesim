import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
}

export function Select({ label, hint, error, options = [], ...selectProps }: SelectProps) {
  return (
    <div className="ss-field">
      {label && <label>{label}</label>}
      <select className="ss-select" {...selectProps}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <span className="ss-field-error">{error}</span>
      ) : hint ? (
        <span className="ss-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
