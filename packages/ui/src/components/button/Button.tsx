import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "link" | "danger";
  size?: "md" | "sm";
}

export function Button({ variant = "ghost", size = "md", ...props }: ButtonProps) {
  const cls = ["ss-btn", `ss-btn--${variant}`, size === "sm" ? "ss-btn--sm" : ""]
    .filter(Boolean)
    .join(" ");
  return <button className={cls} {...props} />;
}
