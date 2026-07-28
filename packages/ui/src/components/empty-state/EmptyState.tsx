import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  children?: ReactNode;
}

export function EmptyState({ icon, children }: EmptyStateProps) {
  return (
    <div className="ss-empty">
      <div className="ss-empty-icon">{icon || "—"}</div>
      <div className="ss-empty-text">{children}</div>
    </div>
  );
}
