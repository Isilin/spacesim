import type { CSSProperties, ReactNode } from "react";

export interface PopoverProps {
  style?: CSSProperties;
  children?: ReactNode;
}

export function Popover({ style, children }: PopoverProps) {
  return (
    <div className="ss-cut-frame ss-popover" style={style}>
      <div className="ss-cut-in">{children}</div>
    </div>
  );
}
