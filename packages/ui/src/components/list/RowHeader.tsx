export interface RowHeaderProps {
  label: string;
  value: string;
}

export function RowHeader({ label, value }: RowHeaderProps) {
  return (
    <div className="ss-row-header">
      <span>{label}</span>
      <span className="ss-row-header-value">{value}</span>
    </div>
  );
}
