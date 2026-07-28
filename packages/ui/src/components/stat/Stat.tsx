export interface StatProps {
  label: string;
  value: string | number;
  tone?: "default" | "ok" | "violet" | "amber" | "cyan";
}

export function Stat({ label, value, tone = "default" }: StatProps) {
  const cls = ["ss-stat", tone !== "default" ? `ss-stat--${tone}` : ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span className="ss-stat-label">{label}</span>
      <span className="ss-stat-value">{value}</span>
    </div>
  );
}
