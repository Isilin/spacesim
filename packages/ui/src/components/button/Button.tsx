import type { ButtonHTMLAttributes } from "react";
import styles from "./button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "link" | "danger";
  size?: "md" | "sm";
}

export function Button({
  variant = "ghost",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  const cls = [styles.button, className].filter(Boolean).join(" ");
  return (
    <button
      className={cls}
      data-variant={variant}
      data-size={size}
      {...props}
    />
  );
}
