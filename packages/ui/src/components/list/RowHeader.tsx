import styles from "./list.module.css";

export interface RowHeaderProps {
  label: string;
  value: string;
}

export function RowHeader({ label, value }: RowHeaderProps) {
  return (
    <div className={styles.rowHeader}>
      <span>{label}</span>
      <span className={styles.rowHeaderValue}>{value}</span>
    </div>
  );
}
