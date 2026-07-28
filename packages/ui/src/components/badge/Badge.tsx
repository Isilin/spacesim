import type { HTMLAttributes } from "react";
import styles from "./badge.module.css";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "ok" | "ko" | "info" | "violet" | "amber";
  solid?: boolean;
}

export function Badge({ variant = "neutral", solid = false, className, ...props }: BadgeProps) {
  const cls = [styles.badge, className].filter(Boolean).join(" ");
  return <span className={cls} data-variant={variant} data-solid={solid} {...props} />;
}
