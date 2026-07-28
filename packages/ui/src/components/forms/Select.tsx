import { useId, type SelectHTMLAttributes } from "react";

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

export function Select({
  label,
  hint,
  error,
  options = [],
  className,
  id,
  ...selectProps
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className="ss-field">
      {label && <label htmlFor={selectId}>{label}</label>}
      <select
        id={selectId}
        className={["ss-select", className ?? ""].filter(Boolean).join(" ")}
        {...selectProps}
      >
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
