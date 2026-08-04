import type { HTMLAttributes } from "react";
import styles from "./skeleton.module.css";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "block";
  /** Libellé accessible (ex. "Chargement des comptes…") — fourni par l'appelant,
   *  jamais de texte en dur ici : `packages/ui` reste agnostique de la traduction
   *  (vague i18n, chantier 27.16+). Omis, le placeholder reste décoratif seul
   *  (aria-hidden), le contenu réel portant déjà son propre libellé accessible. */
  label?: string;
}

export function Skeleton({
  variant = "block",
  label,
  className,
  ...props
}: SkeletonProps) {
  const cls = [styles.skeleton, className].filter(Boolean).join(" ");
  return (
    <div
      className={cls}
      data-variant={variant}
      aria-busy="true"
      aria-hidden={label ? undefined : true}
      {...props}
    >
      {label && <span className={styles.srOnly}>{label}</span>}
    </div>
  );
}
