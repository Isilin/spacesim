import { Gauge, Panel, Stat, Table, type TableColumn } from "@spacesim/ui";
import { useEffect, useState } from "react";

interface Health {
  tick: number;
  lastTickAt: number;
  lastFlushAt: number | null;
  lastFlushError: string | null;
  galaxyCount: number;
  maxGalaxies: number;
  frontierGalaxies: number;
}

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

interface Props {
  token: string;
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
 */
export function OpsView({ token }: Props) {
  const [health, setHealth] = useState<Health | null>(null);
  const [empires, setEmpires] = useState<EmpireSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/admin/ops/health", { headers }).then((res) => res.json()),
      fetch("/api/admin/ops/empires", { headers }).then((res) => res.json()),
    ])
      .then(([healthBody, empiresBody]) => {
        if (cancelled) return;
        if (healthBody.error || empiresBody.error) {
          setError(healthBody.error ?? empiresBody.error);
          return;
        }
        setHealth(healthBody);
        setEmpires(empiresBody.empires ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Serveur injoignable");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="detail-stack">
      {error && <p className="auth-error">{error}</p>}
      {!error && !health && <p className="muted">Chargement…</p>}

      {!error && health && (
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

      {!error && empires && (
        <Panel title="Empires">
          <Table columns={EMPIRE_COLUMNS} rows={empires} />
        </Panel>
      )}
    </div>
  );
}
