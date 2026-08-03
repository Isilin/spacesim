import type { AnchorHTMLAttributes, ReactNode } from "react";
import styles from "./link.module.css";

export interface LinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  variant?: "inline" | "nav" | "quiet";
  href?: string;
  active?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}

export function Link({
  variant = "inline",
  href,
  active = false,
  disabled = false,
  icon,
  className,
  children,
  onClick,
  ...props
}: LinkProps) {
  const cls = [styles.link, className].filter(Boolean).join(" ");
  return (
    <a
      className={cls}
      data-variant={variant}
      data-active={active}
      href={disabled ? undefined : href}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      {...props}
    >
      {icon}
      {children}
    </a>
  );
}
