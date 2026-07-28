import type { ReactNode } from "react";

export interface TableColumn<Row = Record<string, unknown>> {
  key: string;
  label: string;
  align?: "left" | "right";
  render?: (value: unknown, row: Row) => ReactNode;
  trend?: (row: Row) => "up" | "down" | undefined;
}

export interface TableProps<Row = Record<string, unknown>> {
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
}

export function Table<Row = Record<string, unknown>>({ columns = [], rows = [] }: TableProps<Row>) {
  return (
    <table className="ss-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.align === "right" ? "num" : ""}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((c) => {
              const raw = (row as Record<string, unknown>)[c.key];
              const content = c.render ? c.render(raw, row) : (raw as ReactNode);
              const trend = c.trend?.(row);
              const cls = [
                c.align === "right" ? "num" : "",
                trend === "up" ? "up" : "",
                trend === "down" ? "down" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <td key={c.key} className={cls}>
                  {content}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
