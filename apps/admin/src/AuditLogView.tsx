import { useGetApiAdminAudit } from "./api/generated/admin.js";
import {
  EmptyState,
  Panel,
  Skeleton,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useTranslation } from "react-i18next";

interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  createdAt: number;
}

/**
 * Journal d'audit (chantier 23.1/23.2) : premier écran réel, prouve tout le tuyau
 * session → rôle → DB avant qu'aucune autre fonctionnalité admin n'existe.
 * Client orval (chantier 27.15).
 */
export function AuditLogView() {
  const { t, i18n } = useTranslation();
  const { data, error, isPending } = useGetApiAdminAudit();
  const entries = (data?.entries ?? []) as AuditEntry[];
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const columns: TableColumn<AuditEntry>[] = [
    {
      key: "createdAt",
      label: t("auditLogView.colDate"),
      render: (value) =>
        new Date(value as number).toLocaleString(i18n.language),
    },
    { key: "actorEmail", label: t("auditLogView.colActor") },
    { key: "action", label: t("auditLogView.colAction") },
    {
      key: "targetType",
      label: t("auditLogView.colTarget"),
      render: (_value, row) =>
        row.targetType
          ? `${row.targetType}:${row.targetId}`
          : t("contentCommon.none"),
    },
    {
      key: "reason",
      label: t("auditLogView.colReason"),
      render: (value) => (value as string | null) ?? t("contentCommon.none"),
    },
  ];

  return (
    <Panel title={t("auditLogView.title")}>
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("auditLogView.loading")} />
      )}
      {!loadError && !isPending && entries.length === 0 && (
        <EmptyState>{t("auditLogView.empty")}</EmptyState>
      )}
      {!loadError && !isPending && entries.length > 0 && (
        <Table columns={columns} rows={entries} />
      )}
    </Panel>
  );
}
