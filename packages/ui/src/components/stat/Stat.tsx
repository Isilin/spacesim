import styles from "./stat.module.css";

export interface StatProps {
  label: string;
  value: string | number;
  tone?: "default" | "ok" | "violet" | "amber" | "cyan";
}

export function Stat({ label, value, tone = "default" }: StatProps) {
  return (
    <div className={styles.stat} data-tone={tone}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}
