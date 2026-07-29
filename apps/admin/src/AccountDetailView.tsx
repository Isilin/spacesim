import type { RoleId } from "@spacesim/protocol";
import { Badge, EmptyState, Panel, Stat, Table, type TableColumn } from "@spacesim/ui";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface ColonyRow {
  name: string;
  systemId: string;
  population: number;
  credits: number;
  ore: number;
  energy: number;
  food: number;
}

/** Même forme que `GameEngine.devEmpireSummaries()` (une entrée), côté serveur. */
interface EmpireSummary {
  id: string;
  name: string;
  color: string;
  kind: "human" | "npc";
  influence: number;
  researched: number;
  claimed: number;
  exploredCount: number;
  colonies: ColonyRow[];
  fleets: number;
}

interface AccountDetail {
  id: string;
  email: string;
  role: RoleId;
  createdAt: number;
  lastLoginAt: number | null;
  activeSessions: number;
  empireSummary: EmpireSummary | null;
}

interface Props {
  token: string;
}

const COLONY_COLUMNS: TableColumn<ColonyRow>[] = [
  { key: "name", label: "Colonie" },
  { key: "systemId", label: "Système" },
  { key: "population", label: "Population", align: "right" },
  { key: "credits", label: "Crédits", align: "right" },
  { key: "ore", label: "Minerai", align: "right" },
  { key: "energy", label: "Énergie", align: "right" },
  { key: "food", label: "Nourriture", align: "right" },
];

/** Détail d'un compte : identité, sessions, empire (chantier 23.3). */
export function AccountDetailView({ token }: Props) {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/accounts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((body: AccountDetail & { error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          setError(body.error);
          return;
        }
        setAccount(body);
      })
      .catch(() => {
        if (!cancelled) setError("Serveur injoignable");
      });
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  return (
    <div className="detail-stack">
      <Link to="/accounts">← Retour aux comptes</Link>
      {error && <p className="auth-error">{error}</p>}
      {!error && !account && <p className="muted">Chargement…</p>}
      {account && (
        <>
          <Panel
            title={account.email}
            actions={
              <Badge variant={account.role === "player" ? "neutral" : "violet"}>
                {account.role}
              </Badge>
            }
          >
            <div className="stat-row">
              <Stat
                label="Inscrit le"
                value={new Date(account.createdAt).toLocaleDateString("fr-FR")}
              />
              <Stat
                label="Dernière connexion"
                value={
                  account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("fr-FR") : "—"
                }
              />
              <Stat
                label="Sessions actives"
                value={account.activeSessions}
                tone={account.activeSessions > 0 ? "ok" : "default"}
              />
            </div>
          </Panel>

          {account.empireSummary ? (
            <Panel title={`Empire — ${account.empireSummary.name}`} accent="violet">
              <div className="stat-row">
                <Stat label="Influence" value={account.empireSummary.influence} />
                <Stat label="Techs acquises" value={account.empireSummary.researched} />
                <Stat label="Systèmes explorés" value={account.empireSummary.exploredCount} />
                <Stat label="Systèmes revendiqués" value={account.empireSummary.claimed} />
                <Stat label="Flottes" value={account.empireSummary.fleets} />
              </div>
              {account.empireSummary.colonies.length > 0 ? (
                <Table columns={COLONY_COLUMNS} rows={account.empireSummary.colonies} />
              ) : (
                <EmptyState>Aucune colonie.</EmptyState>
              )}
            </Panel>
          ) : (
            <EmptyState>Ce compte n'a pas encore d'empire dans cette partie.</EmptyState>
          )}
        </>
      )}
    </div>
  );
}
