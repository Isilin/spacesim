import { useId, type InputHTMLAttributes } from "react";
import styles from "./forms.module.css";

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  unit?: string;
  hint?: string;
  error?: string;
}

export function NumberInput({
  label,
  unit,
  hint,
  error,
  className,
  id,
  ...inputProps
}: NumberInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={styles.field}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className={styles.numberWrap}>
        <input
          id={inputId}
          type="number"
          className={[styles.input, unit ? styles.numberInput : "", className].filter(Boolean).join(" ")}
          {...inputProps}
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : hint ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  );
}
