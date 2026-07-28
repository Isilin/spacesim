import { useId, type InputHTMLAttributes } from "react";
import styles from "./forms.module.css";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, className, id, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={styles.field}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <input id={inputId} className={[styles.input, className].filter(Boolean).join(" ")} {...inputProps} />
      {error ? (
        <span className={styles.error}>{error}</span>
      ) : hint ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  );
}
