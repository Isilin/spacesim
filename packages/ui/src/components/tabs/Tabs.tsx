import styles from "./tabs.module.css";

export interface TabItem {
  value: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange?: (value: string) => void;
}

export function Tabs({ items = [], active, onChange }: TabsProps) {
  return (
    <nav className={styles.tabs}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          className={styles.tab}
          data-active={it.value === active}
          onClick={() => onChange?.(it.value)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}
