import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "link" | "danger";
  size?: "md" | "sm";
}

export function Button({ variant = "ghost", size = "md", className, ...props }: ButtonProps) {
  const cls = ["ss-btn", `ss-btn--${variant}`, size === "sm" ? "ss-btn--sm" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <button className={cls} {...props} />;
}
