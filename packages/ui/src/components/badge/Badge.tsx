import type { HTMLAttributes } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "ok" | "ko" | "info" | "violet" | "amber";
  solid?: boolean;
}

export function Badge({ variant = "neutral", solid, className, ...props }: BadgeProps) {
  const cls = [
    "ss-badge",
    variant !== "neutral" ? `ss-badge--${variant}` : "",
    solid ? "ss-badge--solid" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={cls} {...props} />;
}
