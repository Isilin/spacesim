import { useGetApiAdminAudit } from "./api/generated/admin.js";
import {
  EmptyState,
  Panel,
  Skeleton,
  Table,
  type TableColumn,
} from "@spacesim/ui";

interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  createdAt: number;
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
 * Client orval (chantier 27.15).
 */
export function AuditLogView() {
  const { data, error, isPending } = useGetApiAdminAudit();
  const entries = (data?.entries ?? []) as AuditEntry[];
  const loadError = error
    ? error instanceof Error
      ? error.message
      : "Serveur injoignable"
    : null;

  return (
    <Panel title="Journal d'audit">
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label="Chargement du journal d'audit…" />
      )}
      {!loadError && !isPending && entries.length === 0 && (
        <EmptyState>Aucune action journalisée.</EmptyState>
      )}
      {!loadError && !isPending && entries.length > 0 && (
        <Table columns={COLUMNS} rows={entries} />
      )}
    </Panel>
  );
}
