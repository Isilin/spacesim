import { EmptyState, Panel, Table, type TableColumn } from "@spacesim/ui";
import { useEffect, useState } from "react";

interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  createdAt: number;
}

interface Props {
  token: string;
}

const COLUMNS: TableColumn<AuditEntry>[] = [
  {
    key: "createdAt",
    label: "Date",
    render: (value) => new Date(value as number).toLocaleString("fr-FR"),
  },
  { key: "actorEmail", label: "Acteur" },
  { key: "action", label: "Action" },
  {
    key: "targetType",
    label: "Cible",
    render: (_value, row) =>
      row.targetType ? `${row.targetType}:${row.targetId}` : "—",
  },
  {
    key: "reason",
    label: "Raison",
    render: (value) => (value as string | null) ?? "—",
  },
];

/**
 * Journal d'audit (chantier 23.1/23.2) : premier écran réel, prouve tout le tuyau
 * session → rôle → DB avant qu'aucune autre fonctionnalité admin n'existe.
 */
export function AuditLogView({ token }: Props) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/audit", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((body: { entries?: AuditEntry[]; error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          setError(body.error);
          return;
        }
        setEntries(body.entries ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Serveur injoignable");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Panel title="Journal d'audit">
      {error && <p className="auth-error">{error}</p>}
      {!error && entries === null && <p className="muted">Chargement…</p>}
      {!error && entries?.length === 0 && (
        <EmptyState>Aucune action journalisée.</EmptyState>
      )}
      {!error && entries && entries.length > 0 && (
        <Table columns={COLUMNS} rows={entries} />
      )}
    </Panel>
  );
}
