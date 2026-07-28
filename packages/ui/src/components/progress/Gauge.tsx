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
    <div className="ss-gauge">
      <div
        className={`ss-gauge-fill${over ? " ss-gauge-fill--over" : ""}`}
        style={{ width: `${pct}%` }}
      />
      {markAt && <div className="ss-gauge-max" style={{ left: `${markPct}%` }} />}
    </div>
  );
}
