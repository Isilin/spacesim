import styles from "./progress.module.css";

export interface GaugeProps {
  value: number;
  capacity: number;
  markAt?: number;
}

export function Gauge({ value = 0, capacity = 100, markAt }: GaugeProps) {
  const over = value > capacity;
  const pct = Math.min(100, (value / (markAt || capacity)) * 100);
  const markPct = markAt ? Math.min(100, (capacity / markAt) * 100) : 100;
  return (
    <div className={styles.gauge}>
      <div
        className={styles.gaugeFill}
        data-status={over ? "over" : "default"}
        style={{ width: `${pct}%` }}
      />
      {markAt && <div className={styles.gaugeMax} style={{ left: `${markPct}%` }} />}
    </div>
  );
}
