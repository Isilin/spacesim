import type { ReactNode } from "react";

export interface BadgeProps {
  variant?: "neutral" | "ok" | "ko" | "info" | "violet" | "amber";
  solid?: boolean;
  children?: ReactNode;
}

export function Badge({ variant = "neutral", solid, children }: BadgeProps) {
  const cls = [
    "ss-badge",
    variant !== "neutral" ? `ss-badge--${variant}` : "",
    solid ? "ss-badge--solid" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={cls}>{children}</span>;
}
