import {
  allSystems,
  type EmpireEvent,
  type EmpireEventKind,
  type ObjectiveKind,
  type RelationState,
  type TechId,
  type Universe,
} from "@spacesim/shared";
import { Badge, Button, EmptyState, ListRow, Panel } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { formatDuration } from "./format.js";
import { objectiveKindLabel, relationBadge, techLabel } from "./labels.js";
import { useGameStore } from "./state/game-store.js";

/**
 * Boîte de réception d'empire (chantier 32.5) — ce qui s'est passé pendant que le joueur
 * n'était pas là.
 *
 * Le serveur n'envoie que des identifiants et des nombres : toute la rédaction se fait
 * ici, dans la langue du joueur ([ADR 0008](../../../docs/adr/0008-journal-d-evenements-d-empire.md)).
 * C'est ce qui rend l'ajout d'un `kind` visible à la compilation — le typage i18n
 * (`commonEn: typeof commonFr`) réclame sa traduction.
 */

/** Ton et pictogramme par nature d'événement — même patron que `worldEventLabel`. */
const LOOK: Record<
  EmpireEventKind,
  { icon: string; tone: "ok" | "ko" | "neutral" }
> = {
  battle_won: { icon: "⚔", tone: "ok" },
  battle_lost: { icon: "⚔", tone: "ko" },
  colony_attacked: { icon: "🔥", tone: "ko" },
  lair_appeared: { icon: "☠", tone: "ko" },
  claim_lost: { icon: "🏳", tone: "ko" },
  contract_fulfilled: { icon: "📦", tone: "ok" },
  research_completed: { icon: "🔬", tone: "ok" },
  relation_changed: { icon: "🤝", tone: "neutral" },
  objective_completed: { icon: "★", tone: "ok" },
  corp_invited: { icon: "✉", tone: "neutral" },
  corp_left: { icon: "🚪", tone: "ko" },
  corp_dissolved: { icon: "🏚", tone: "ko" },
  mail_received: { icon: "✉", tone: "neutral" },
  corp_relation_changed: { icon: "⚑", tone: "neutral" },
};

function systemName(universe: Universe | null, systemId?: string): string {
  if (!universe || !systemId) return "";
  return allSystems(universe).find((s) => s.id === systemId)?.name ?? systemId;
}

export function InboxView({ now }: { now: number }) {
  const { t } = useTranslation();
  const { events, unreadEventCount, universe, colonies, send } = useGameStore();

  const describe = (event: EmpireEvent): string => {
    // Chaque `kind` a ses propres substitutions : une seule chaîne générique aurait
    // forcé des tournures vagues (« événement sur X ») là où le joueur veut savoir qui
    // l'a attaqué et ce qu'il a perdu.
    const other = event.otherName ?? t("inbox.unknownParty");
    const system = systemName(universe, event.systemId);
    const colony =
      colonies.find((c) => c.id === event.colonyId)?.name ?? t("inbox.aColony");
    const amount = Math.round(event.amount ?? 0);
    switch (event.kind) {
      case "battle_won":
        return t("inbox.battleWon", { other, system });
      case "battle_lost":
        return t("inbox.battleLost", { other, system });
      case "colony_attacked":
        return t("inbox.colonyAttacked", { other, colony, amount });
      case "lair_appeared":
        return t("inbox.lairAppeared", { system, colony });
      case "claim_lost":
        return t("inbox.claimLost", { other, system });
      case "contract_fulfilled":
        return t("inbox.contractFulfilled", { other, colony, amount });
      // Les trois `subjectId` ci-dessous désignent du CONTENU, traduit par les mêmes
      // helpers que partout ailleurs. Repli sur l'id brut : une techno peut avoir
      // disparu du contenu depuis (édition admin) alors que l'événement, lui, reste.
      case "research_completed":
        return t("inbox.researchCompleted", {
          tech:
            techLabel(event.subjectId as TechId)?.name ?? event.subjectId ?? "",
        });
      case "relation_changed":
        return t("inbox.relationChanged", {
          other,
          state: relationBadge(event.subjectId as RelationState),
        });
      case "objective_completed":
        return t("inbox.objectiveCompleted", {
          objective: objectiveKindLabel(event.subjectId as ObjectiveKind),
          amount,
        });
      // `otherName` porte ici le nom de la CORPORATION : c'est un nom choisi par un
      // joueur, comme un nom d'empire — il n'existe dans aucune locale.
      case "corp_invited":
        return t("inbox.corpInvited", { corp: other });
      case "corp_left":
        return t("inbox.corpLeft", { corp: other });
      case "corp_dissolved":
        return t("inbox.corpDissolved", { corp: other });
      // Le journal PRÉVIENT, la boîte aux lettres CONSERVE : une seule pastille à tenir
      // cohérente, et le courrier reste relisible après purge de l'événement (ADR 0010).
      case "mail_received":
        return t("inbox.mailReceived", { other });
      // Tout le camp d'en face est prévenu : une guerre déclarée pendant qu'ils dorment
      // est exactement ce que le journal existe pour couvrir (ADR 0011).
      case "corp_relation_changed":
        return t("inbox.corpRelationChanged", {
          corp: other,
          state: relationBadge(event.subjectId as RelationState),
        });
    }
  };

  return (
    <Panel
      title={t("inbox.title")}
      actions={
        unreadEventCount > 0 ? (
          <Button onClick={() => send({ type: "markAllEventsRead" })}>
            {t("inbox.markAllRead")}
          </Button>
        ) : undefined
      }
    >
      {unreadEventCount > 0 && (
        // Le digest d'absence : le compteur porte sur le TOTAL, pas sur la page reçue.
        <p className="muted small">
          {t("inbox.digest", { count: unreadEventCount })}
        </p>
      )}
      {events.length === 0 ? (
        <EmptyState icon="✉">{t("inbox.empty")}</EmptyState>
      ) : (
        <ul className="queue-list">
          {events.map((event) => {
            const look = LOOK[event.kind];
            const unread = event.readAt === null;
            return (
              <ListRow
                key={event.id}
                title={`${look.icon} ${describe(event)}`}
                meta={t("inbox.ago", {
                  duration: formatDuration(Math.max(0, now - event.createdAt)),
                })}
                // `ListRow` n'affiche `children` que faute de `right` : tout ce qui
                // doit coexister passe donc par `right`.
                right={
                  unread ? (
                    <>
                      <Badge variant={look.tone === "ko" ? "ko" : "info"}>
                        {t("inbox.unread")}
                      </Badge>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          send({ type: "markEventRead", eventId: event.id })
                        }
                      >
                        {t("inbox.markRead")}
                      </Button>
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
