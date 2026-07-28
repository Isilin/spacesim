import { useId, type InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, className, id, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="ss-field">
      {label && <label htmlFor={inputId}>{label}</label>}
      <input
        id={inputId}
        className={["ss-input", className ?? ""].filter(Boolean).join(" ")}
        {...inputProps}
      />
      {error ? (
        <span className="ss-field-error">{error}</span>
      ) : hint ? (
        <span className="ss-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
