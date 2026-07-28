import type { ReactNode } from "react";

export interface PanelProps {
  title?: string;
  accent?: "cyan" | "violet" | "amber";
  glow?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Panel({ title, accent = "cyan", glow, actions, children }: PanelProps) {
  const cls = [
    "ss-cut-frame",
    "ss-panel",
    accent !== "cyan" ? `ss-panel--${accent}` : "",
    glow ? "ss-panel--glow" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <div className="ss-cut-in">
        {title && (
          <div className="ss-panel-head">
            <h3 className="ss-panel-title">{title}</h3>
            {actions && <div className="ss-panel-actions">{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
