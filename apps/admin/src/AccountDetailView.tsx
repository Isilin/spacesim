import type { RoleId, SanctionKind } from "@spacesim/protocol";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Panel,
  Select,
  Stat,
  Table,
  type TableColumn,
} from "@spacesim/ui";
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

interface SanctionStatus {
  active: boolean;
  kind: "ban" | "suspend" | null;
  reason: string | null;
  expiresAt: number | null;
}

interface SanctionEntry {
  id: string;
  kind: SanctionKind;
  reason: string;
  actorEmail: string;
  createdAt: number;
  expiresAt: number | null;
}

interface AccountDetail {
  id: string;
  email: string;
  role: RoleId;
  createdAt: number;
  lastLoginAt: number | null;
  activeSessions: number;
  empireSummary: EmpireSummary | null;
  sanctionStatus: SanctionStatus;
  sanctionHistory: SanctionEntry[];
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

const SANCTION_LABELS: Record<SanctionKind, string> = {
  warn: "Avertissement",
  suspend: "Suspension temporaire",
  ban: "Bannissement",
  unban: "Lever le bannissement",
  force_logout: "Déconnexion forcée",
};

const SANCTION_KIND_OPTIONS = Object.entries(SANCTION_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

const HISTORY_COLUMNS: TableColumn<SanctionEntry>[] = [
  {
    key: "kind",
    label: "Type",
    render: (value) => SANCTION_LABELS[value as SanctionKind],
  },
  { key: "reason", label: "Raison" },
  { key: "actorEmail", label: "Par" },
  {
    key: "createdAt",
    label: "Date",
    render: (value) => new Date(value as number).toLocaleString("fr-FR"),
  },
];

function statusBadge(status: SanctionStatus) {
  if (!status.active) return <Badge variant="ok">Aucune sanction active</Badge>;
  const label =
    status.kind === "ban"
      ? "Banni"
      : `Suspendu jusqu'au ${new Date(status.expiresAt!).toLocaleString("fr-FR")}`;
  return <Badge variant="ko">{label}</Badge>;
}

/** Détail d'un compte : identité, sessions, empire, sanctions (chantier 23.3/23.4). */
export function AccountDetailView({ token }: Props) {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [kind, setKind] = useState<SanctionKind>("warn");
  const [reason, setReason] = useState("");
  const [durationHours, setDurationHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/admin/accounts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body: AccountDetail & { error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setAccount(body);
      })
      .catch(() => setError("Serveur injoignable"));
  };

  useEffect(load, [token, id]);

  const submitSanction = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/accounts/${id}/sanctions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kind,
          reason,
          durationMs: kind === "suspend" ? durationHours * 3600_000 : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? "Erreur serveur");
        return;
      }
      setAccount(body);
      setModalOpen(false);
      setReason("");
    } catch {
      setSubmitError("Serveur injoignable");
    } finally {
      setSubmitting(false);
    }
  };

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
              <>
                <Badge
                  variant={account.role === "player" ? "neutral" : "violet"}
                >
                  {account.role}
                </Badge>
                {statusBadge(account.sanctionStatus)}
                <Button variant="primary" onClick={() => setModalOpen(true)}>
                  Sanctionner
                </Button>
              </>
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
                  account.lastLoginAt
                    ? new Date(account.lastLoginAt).toLocaleString("fr-FR")
                    : "—"
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
            <Panel
              title={`Empire — ${account.empireSummary.name}`}
              accent="violet"
            >
              <div className="stat-row">
                <Stat
                  label="Influence"
                  value={account.empireSummary.influence}
                />
                <Stat
                  label="Techs acquises"
                  value={account.empireSummary.researched}
                />
                <Stat
                  label="Systèmes explorés"
                  value={account.empireSummary.exploredCount}
                />
                <Stat
                  label="Systèmes revendiqués"
                  value={account.empireSummary.claimed}
                />
                <Stat label="Flottes" value={account.empireSummary.fleets} />
              </div>
              {account.empireSummary.colonies.length > 0 ? (
                <Table
                  columns={COLONY_COLUMNS}
                  rows={account.empireSummary.colonies}
                />
              ) : (
                <EmptyState>Aucune colonie.</EmptyState>
              )}
            </Panel>
          ) : (
            <EmptyState>
              Ce compte n'a pas encore d'empire dans cette partie.
            </EmptyState>
          )}

          <Panel title="Historique des sanctions" accent="amber">
            {account.sanctionHistory.length > 0 ? (
              <Table columns={HISTORY_COLUMNS} rows={account.sanctionHistory} />
            ) : (
              <EmptyState>Aucune sanction journalisée.</EmptyState>
            )}
          </Panel>

          <Modal open={modalOpen} onClickOutside={() => setModalOpen(false)}>
            <Modal.Header
              title={`Sanctionner ${account.email}`}
              onClose={() => setModalOpen(false)}
            />
            <Select
              label="Type de sanction"
              options={SANCTION_KIND_OPTIONS}
              value={kind}
              onChange={(e) => setKind(e.target.value as SanctionKind)}
            />
            {kind === "suspend" && (
              <Field
                label="Durée (heures)"
                type="number"
                min={1}
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
              />
            )}
            <Field
              label="Raison (obligatoire, journalisée)"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {submitError && <p className="auth-error">{submitError}</p>}
            <Modal.Actions>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Annuler
              </Button>
              <Button
                variant="danger"
                disabled={submitting || !reason.trim()}
                onClick={() => void submitSanction()}
              >
                {submitting ? "…" : "Confirmer"}
              </Button>
            </Modal.Actions>
          </Modal>
        </>
      )}
    </div>
  );
}
