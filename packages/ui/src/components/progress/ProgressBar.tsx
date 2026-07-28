import styles from "./progress.module.css";

export interface ProgressBarProps {
  value: number;
  max?: number;
  size?: "md" | "lg";
  status?: "default" | "ok" | "over";
}

export function ProgressBar({ value = 0, max = 100, size = "md", status = "default" }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={styles.progress} data-size={size}>
      <div className={styles.progressFill} data-status={status} style={{ width: `${pct}%` }} />
    </div>
  );
}
