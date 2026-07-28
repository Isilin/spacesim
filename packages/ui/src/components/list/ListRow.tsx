import type { ReactNode } from "react";

export interface ListRowProps {
  title: string;
  level?: string;
  meta?: string;
  right?: ReactNode;
  children?: ReactNode;
}

export function ListRow({ title, level, meta, right, children }: ListRowProps) {
  return (
    <li className="ss-row">
      <div className="ss-row-main">
        <div className="ss-row-title">
          <span>{title}</span>
          {level && <span className="ss-row-level">{level}</span>}
        </div>
        {meta && <span className="ss-row-meta">{meta}</span>}
      </div>
      {right || children}
    </li>
  );
}
