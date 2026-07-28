export interface ProgressBarProps {
  value: number;
  max?: number;
  size?: "md" | "lg";
  status?: "default" | "ok" | "over";
}

export function ProgressBar({ value = 0, max = 100, size = "md", status }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const cls = [
    "ss-progress-fill",
    status === "ok" ? "ss-progress-fill--ok" : "",
    status === "over" ? "ss-progress-fill--over" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={`ss-progress${size === "lg" ? " ss-progress--lg" : ""}`}>
      <div className={cls} style={{ width: `${pct}%` }} />
    </div>
  );
}
