import {
  getGetApiAdminAccountsIdQueryKey,
  useGetApiAdminAccountsId,
  usePostApiAdminAccountsIdSanctions,
} from "./api/generated/admin.js";
import type { RoleId, SanctionKind } from "@spacesim/protocol";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  Panel,
  Select,
  Skeleton,
  Stat,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { useModal } from "@spacesim/ui";
import { useQueryClient } from "@tanstack/react-query";

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

const SANCTION_KEYS: Record<SanctionKind, string> = {
  warn: "accountDetailView.sanctionWarn",
  suspend: "accountDetailView.sanctionSuspend",
  ban: "accountDetailView.sanctionBan",
  unban: "accountDetailView.sanctionUnban",
  force_logout: "accountDetailView.sanctionForceLogout",
};

function statusBadge(
  status: SanctionStatus,
  t: ReturnType<typeof useTranslation>["t"],
  locale: string,
) {
  if (!status.active)
    return <Badge variant="ok">{t("accountDetailView.noSanction")}</Badge>;
  const label =
    status.kind === "ban"
      ? t("accountDetailView.banned")
      : t("accountDetailView.suspendedUntil", {
          date: new Date(status.expiresAt!).toLocaleString(locale),
        });
  return <Badge variant="ko">{label}</Badge>;
}

/** Détail d'un compte : identité, sessions, empire, sanctions (chantier 23.3/23.4).
 *  Client orval (chantier 27.15). */
export function AccountDetailView() {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminAccountsId(id, {
    query: { enabled: !!id },
  });
  const account = data as AccountDetail | undefined;
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const colonyColumns: TableColumn<ColonyRow>[] = [
    { key: "name", label: t("accountDetailView.colColony") },
    { key: "systemId", label: t("accountDetailView.colSystem") },
    {
      key: "population",
      label: t("accountDetailView.colPopulation"),
      align: "right",
    },
    {
      key: "credits",
      label: t("accountDetailView.colCredits"),
      align: "right",
    },
    { key: "ore", label: t("accountDetailView.colOre"), align: "right" },
    { key: "energy", label: t("accountDetailView.colEnergy"), align: "right" },
    { key: "food", label: t("accountDetailView.colFood"), align: "right" },
  ];

  const sanctionKindOptions = (
    Object.keys(SANCTION_KEYS) as SanctionKind[]
  ).map((value) => ({ value, label: t(SANCTION_KEYS[value]) }));

  const historyColumns: TableColumn<SanctionEntry>[] = [
    {
      key: "kind",
      label: t("accountDetailView.colType"),
      render: (value) => t(SANCTION_KEYS[value as SanctionKind]),
    },
    { key: "reason", label: t("accountDetailView.colReason") },
    { key: "actorEmail", label: t("accountDetailView.colActor") },
    {
      key: "createdAt",
      label: t("accountDetailView.colDate"),
      render: (value) =>
        new Date(value as number).toLocaleString(i18n.language),
    },
  ];

  const { open, openModal, closeModal } = useModal();
  const [kind, setKind] = useState<SanctionKind>("warn");
  const [reason, setReason] = useState("");
  const [durationHours, setDurationHours] = useState(24);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const mutation = usePostApiAdminAccountsIdSanctions();

  const submitSanction = async () => {
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({
        id,
        data: {
          kind,
          reason,
          durationMs: kind === "suspend" ? durationHours * 3600_000 : undefined,
        },
      });
      queryClient.setQueryData(getGetApiAdminAccountsIdQueryKey(id), result);
      closeModal();
      setReason("");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("contentCommon.serverError"),
      );
    }
  };

  return (
    <div className="detail-stack">
      <Link to="/accounts">{t("accountDetailView.back")}</Link>
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("accountDetailView.loading")} />
      )}
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
                {statusBadge(account.sanctionStatus, t, i18n.language)}
                <Button variant="primary" onClick={openModal}>
                  {t("accountDetailView.sanction")}
                </Button>
              </>
            }
          >
            <div className="stat-row">
              <Stat
                label={t("accountDetailView.registeredAt")}
                value={new Date(account.createdAt).toLocaleDateString(
                  i18n.language,
                )}
              />
              <Stat
                label={t("accountDetailView.lastLogin")}
                value={
                  account.lastLoginAt
                    ? new Date(account.lastLoginAt).toLocaleString(
                        i18n.language,
                      )
                    : t("contentCommon.none")
                }
              />
              <Stat
                label={t("accountDetailView.activeSessions")}
                value={account.activeSessions}
                tone={account.activeSessions > 0 ? "ok" : "default"}
              />
            </div>
          </Panel>

          {account.empireSummary ? (
            <Panel
              title={t("accountDetailView.empireTitle", {
                name: account.empireSummary.name,
              })}
              accent="violet"
            >
              <div className="stat-row">
                <Stat
                  label={t("accountDetailView.influence")}
                  value={account.empireSummary.influence}
                />
                <Stat
                  label={t("accountDetailView.researchedTechs")}
                  value={account.empireSummary.researched}
                />
                <Stat
                  label={t("accountDetailView.exploredSystems")}
                  value={account.empireSummary.exploredCount}
                />
                <Stat
                  label={t("accountDetailView.claimedSystems")}
                  value={account.empireSummary.claimed}
                />
                <Stat
                  label={t("accountDetailView.fleets")}
                  value={account.empireSummary.fleets}
                />
              </div>
              {account.empireSummary.colonies.length > 0 ? (
                <Table
                  columns={colonyColumns}
                  rows={account.empireSummary.colonies}
                />
              ) : (
                <EmptyState>{t("accountDetailView.noColonies")}</EmptyState>
              )}
            </Panel>
          ) : (
            <EmptyState>{t("accountDetailView.noEmpire")}</EmptyState>
          )}

          <Panel title={t("accountDetailView.sanctionHistory")} accent="amber">
            {account.sanctionHistory.length > 0 ? (
              <Table columns={historyColumns} rows={account.sanctionHistory} />
            ) : (
              <EmptyState>{t("accountDetailView.noSanctions")}</EmptyState>
            )}
          </Panel>

          <Modal open={open} onClose={closeModal}>
            <Modal.Header
              closeLabel={t("contentCommon.close")}
              title={t("accountDetailView.sanctionModalTitle", {
                email: account.email,
              })}
            />
            <Modal.Body>
              <Select
                label={t("accountDetailView.sanctionType")}
                options={sanctionKindOptions}
                value={kind}
                onChange={(e) => setKind(e.target.value as SanctionKind)}
              />
              {kind === "suspend" && (
                <Field
                  label={t("accountDetailView.durationHours")}
                  type="number"
                  min={1}
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                />
              )}
              <Field
                label={t("accountDetailView.reason")}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {submitError && <p className="auth-error">{submitError}</p>}
            </Modal.Body>
            <Modal.Actions>
              <Button variant="ghost" onClick={closeModal}>
                {t("contentCommon.cancel")}
              </Button>
              <Button
                variant="danger"
                disabled={mutation.isPending || !reason.trim()}
                onClick={() => void submitSanction()}
              >
                {mutation.isPending
                  ? t("contentCommon.saving")
                  : t("accountDetailView.confirm")}
              </Button>
            </Modal.Actions>
          </Modal>
        </>
      )}
    </div>
  );
}
