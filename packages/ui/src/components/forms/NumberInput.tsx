import type { InputHTMLAttributes } from "react";

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  unit?: string;
  hint?: string;
  error?: string;
}

export function NumberInput({ label, unit, hint, error, ...inputProps }: NumberInputProps) {
  return (
    <div className="ss-field">
      {label && <label>{label}</label>}
      <div style={{ position: "relative" }}>
        <input
          type="number"
          className="ss-input"
          style={unit ? { paddingRight: 36, width: "100%" } : { width: "100%" }}
          {...inputProps}
        />
        {unit && (
          <span
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted)",
              fontSize: "var(--fs-xs)",
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {error ? (
        <span className="ss-field-error">{error}</span>
      ) : hint ? (
        <span className="ss-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
