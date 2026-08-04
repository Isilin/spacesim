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

function formatDate(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString("fr-FR") : "jamais";
}

const KIND_LABELS: Record<string, string> = { human: "Joueur", npc: "PNJ" };

const EMPIRE_COLUMNS: TableColumn<EmpireSummary>[] = [
  { key: "name", label: "Empire" },
  {
    key: "kind",
    label: "Type",
    render: (v) => KIND_LABELS[v as string] ?? (v as string),
  },
  {
    key: "population",
    label: "Population",
    align: "right",
    render: (_v, row) =>
      Math.round(row.colonies.reduce((s, c) => s + c.population, 0)),
  },
  {
    key: "colonyCount",
    label: "Colonies",
    align: "right",
    render: (_v, row) => row.colonies.length,
  },
  { key: "claimed", label: "Systèmes revendiqués", align: "right" },
  { key: "exploredCount", label: "Systèmes explorés", align: "right" },
  { key: "researched", label: "Techs", align: "right" },
  { key: "fleets", label: "Flottes", align: "right" },
];

/**
 * Tableau de bord ops (chantier 23.12) : additif, réservé au rôle "admin". `/ops/empires`
 * délègue à `devEmpireSummaries()` (même forme que `/dev/empires`) ; `/ops/health` expose
 * tick/flush/croissance de l'univers, jusqu'ici visibles seulement dans les logs serveur.
 * Client orval (chantier 27.15).
 */
export function OpsView() {
  const healthQuery = useGetApiAdminOpsHealth();
  const empiresQuery = useGetApiAdminOpsEmpires();
  const health = healthQuery.data;
  const empires = (empiresQuery.data?.empires ?? []) as EmpireSummary[];
  const firstError = healthQuery.error ?? empiresQuery.error;
  const loadError = firstError
    ? firstError instanceof Error
      ? firstError.message
      : "Serveur injoignable"
    : null;
  const isPending = healthQuery.isPending || empiresQuery.isPending;

  return (
    <div className="detail-stack">
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label="Chargement de la santé du moteur…" />
      )}

      {!loadError && !isPending && health && (
        <Panel title="Santé du moteur">
          <div className="stat-row">
            <Stat label="Tick" value={health.tick} />
            <Stat label="Dernier tick" value={formatDate(health.lastTickAt)} />
            <Stat
              label="Dernière écriture DB"
              value={formatDate(health.lastFlushAt)}
              tone={health.lastFlushError ? "amber" : "ok"}
            />
          </div>
          {health.lastFlushError && (
            <p className="auth-error">
              Échec d'écriture : {health.lastFlushError}
            </p>
          )}
          <p className="muted small">
            Croissance de l'univers — {health.galaxyCount} /{" "}
            {health.maxGalaxies} galaxies ({health.frontierGalaxies} maintenues
            vierges devant les joueurs)
          </p>
          <Gauge value={health.galaxyCount} capacity={health.maxGalaxies} />
        </Panel>
      )}

      {!loadError && !isPending && (
        <Panel title="Empires">
          <Table columns={EMPIRE_COLUMNS} rows={empires} />
        </Panel>
      )}
    </div>
  );
}
