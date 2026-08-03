import type { ReactNode } from "react";
import styles from "./table.module.css";

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

export function Table<Row = Record<string, unknown>>({
  columns = [],
  rows = [],
}: TableProps<Row>) {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={c.align === "right" ? styles.num : undefined}
              >
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
                const content = c.render
                  ? c.render(raw, row)
                  : (raw as ReactNode);
                const trend = c.trend?.(row);
                return (
                  <td
                    key={c.key}
                    className={c.align === "right" ? styles.num : undefined}
                    data-trend={trend}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
