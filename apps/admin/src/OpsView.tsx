import {
  useGetApiAdminOpsEmpires,
  useGetApiAdminOpsHealth,
} from "./api/generated/admin.js";
import {
  Gauge,
  Panel,
  Skeleton,
  Stat,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useTranslation } from "react-i18next";

interface EmpireSummary {
  id: string;
  name: string;
  kind: string;
  isDefault: boolean;
  influence: number;
  researched: number;
  claimed: number;
  exploredCount: number;
  colonies: { population: number }[];
  fleets: number;
}

const KIND_KEYS: Record<string, string> = {
  human: "opsView.kindPlayer",
  npc: "opsView.kindNpc",
};

/**
 * Tableau de bord ops (chantier 23.12) : additif, réservé au rôle "admin". `/ops/empires`
 * délègue à `devEmpireSummaries()` (même forme que `/dev/empires`) ; `/ops/health` expose
 * tick/flush/croissance de l'univers, jusqu'ici visibles seulement dans les logs serveur.
 * Client orval (chantier 27.15).
 */
export function OpsView() {
  const { t, i18n } = useTranslation();
  const formatDate = (ms: number | null): string =>
    ms ? new Date(ms).toLocaleString(i18n.language) : t("opsView.never");

  const empireColumns: TableColumn<EmpireSummary>[] = [
    { key: "name", label: t("opsView.colEmpire") },
    {
      key: "kind",
      label: t("opsView.colType"),
      render: (v) => {
        const key = KIND_KEYS[v as string];
        return key ? t(key) : (v as string);
      },
    },
    {
      key: "population",
      label: t("opsView.colPopulation"),
      align: "right",
      render: (_v, row) =>
        Math.round(row.colonies.reduce((s, c) => s + c.population, 0)),
    },
    {
      key: "colonyCount",
      label: t("opsView.colColonies"),
      align: "right",
      render: (_v, row) => row.colonies.length,
    },
    { key: "claimed", label: t("opsView.colClaimedSystems"), align: "right" },
    {
      key: "exploredCount",
      label: t("opsView.colExploredSystems"),
      align: "right",
    },
    { key: "researched", label: t("opsView.colTechs"), align: "right" },
    { key: "fleets", label: t("opsView.colFleets"), align: "right" },
  ];

  const healthQuery = useGetApiAdminOpsHealth();
  const empiresQuery = useGetApiAdminOpsEmpires();
  const health = healthQuery.data;
  const empires = (empiresQuery.data?.empires ?? []) as EmpireSummary[];
  const firstError = healthQuery.error ?? empiresQuery.error;
  const loadError = firstError
    ? firstError instanceof Error
      ? firstError.message
      : t("contentCommon.serverUnreachable")
    : null;
  const isPending = healthQuery.isPending || empiresQuery.isPending;

  return (
    <div className="detail-stack">
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("opsView.loading")} />
      )}

      {!loadError && !isPending && health && (
        <Panel title={t("opsView.engineHealth")}>
          <div className="stat-row">
            <Stat label={t("opsView.tick")} value={health.tick} />
            <Stat
              label={t("opsView.lastTick")}
              value={formatDate(health.lastTickAt)}
            />
            <Stat
              label={t("opsView.lastDbWrite")}
              value={formatDate(health.lastFlushAt)}
              tone={health.lastFlushError ? "amber" : "ok"}
            />
          </div>
          {health.lastFlushError && (
            <p className="auth-error">
              {t("opsView.writeFailure", { error: health.lastFlushError })}
            </p>
          )}
          <p className="muted small">
            {t("opsView.growth", {
              count: health.galaxyCount,
              max: health.maxGalaxies,
              frontier: health.frontierGalaxies,
            })}
          </p>
          <Gauge value={health.galaxyCount} capacity={health.maxGalaxies} />
        </Panel>
      )}

      {!loadError && !isPending && (
        <Panel title={t("opsView.empires")}>
          <Table columns={empireColumns} rows={empires} />
        </Panel>
      )}
    </div>
  );
}
