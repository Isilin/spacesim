import { corpCan, type CorpRole } from "@spacesim/shared";
import {
  Button,
  EmptyState,
  Field,
  ListRow,
  NumberInput,
  Panel,
  Select,
} from "@spacesim/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useGameStore } from "./state/game-store.js";
import { selectActiveColony } from "./state/selectors.js";

/**
 * Corporation de l'empire (chantier 32.11) : fondation, membres, rôles, coffre,
 * invitations.
 *
 * Les boutons sont montrés ou non selon `corpCan`, la MÊME table de permissions que le
 * serveur applique — elle vit dans `packages/shared` précisément pour ça. Le client ne
 * décide rien pour autant : le serveur revérifie chaque action, l'affichage ne fait
 * qu'éviter de proposer un geste qui sera refusé.
 */
export function CorporationView() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const activeColony = useGameStore(
    selectActiveColony(searchParams.get("colony")),
  );
  const {
    corporation,
    corporationMembers,
    corporationInvites,
    leaderboard,
    playerId,
    send,
  } = useGameStore();

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [amount, setAmount] = useState("100");

  const myRole: CorpRole =
    corporationMembers.find((m) => m.empireId === playerId)?.role ?? "member";
  const nameOf = (empireId: string) =>
    leaderboard.find((e) => e.id === empireId)?.name ?? empireId;
  const received = corporationInvites.filter((i) => i.empireId === playerId);

  // Les invitations reçues comptent même sans corporation — c'est le seul endroit où on
  // peut y répondre, et elles arrivent forcément avant l'appartenance.
  const inviteList = received.length > 0 && (
    <Panel title={t("corporation.invitesTitle")}>
      <ul className="queue-list">
        {received.map((invite) => (
          <ListRow
            key={invite.id}
            title={invite.corporationName}
            right={
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    send({
                      type: "respondCorporationInvite",
                      inviteId: invite.id,
                      accept: true,
                    })
                  }
                >
                  {t("corporation.accept")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    send({
                      type: "respondCorporationInvite",
                      inviteId: invite.id,
                      accept: false,
                    })
                  }
                >
                  {t("corporation.decline")}
                </Button>
              </>
            }
          />
        ))}
      </ul>
    </Panel>
  );

  if (!corporation) {
    return (
      <>
        {inviteList}
        <Panel title={t("corporation.foundTitle")}>
          <EmptyState icon="◈">{t("corporation.none")}</EmptyState>
          <Field
            label={t("corporation.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            label={t("corporation.tag")}
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
          <Button
            // Bornes reprises du schéma Zod du protocole : le serveur refuserait de
            // toute façon, autant ne pas proposer le clic.
            disabled={name.trim().length < 3 || tag.trim().length < 2}
            onClick={() =>
              send({
                type: "foundCorporation",
                name: name.trim(),
                tag: tag.trim(),
              })
            }
          >
            {t("corporation.found")}
          </Button>
        </Panel>
      </>
    );
  }

  const canInvite = corpCan(myRole, "corp.invite");
  const canKick = corpCan(myRole, "corp.kick");
  const canSetRole = corpCan(myRole, "corp.role.set");
  const canWithdraw = corpCan(myRole, "corp.treasury.withdraw");
  const value = Math.floor(Number(amount));
  const validAmount = Number.isFinite(value) && value > 0;
  const invitable = leaderboard.filter(
    (e) =>
      e.id !== playerId &&
      // Ni PNJ (le serveur refuse — rien ne les ferait jouer, ADR 0009), ni déjà
      // engagé ailleurs : proposer un clic voué au refus n'est pas une interface.
      e.kind === "human" &&
      !e.corporationTag &&
      !corporationMembers.some((m) => m.empireId === e.id) &&
      !corporationInvites.some((i) => i.empireId === e.id),
  );

  return (
    <>
      {inviteList}
      <Panel title={`${corporation.name} [${corporation.tag}]`}>
        <ul className="queue-list">
          {corporationMembers.map((member) => (
            <ListRow
              key={member.empireId}
              title={nameOf(member.empireId)}
              level={t(`corporation.role.${member.role}`)}
              right={
                member.role !== "founder" && member.empireId !== playerId ? (
                  <>
                    {canSetRole && (
                      <Select
                        value={member.role}
                        onChange={(e) =>
                          send({
                            type: "setCorporationRole",
                            targetEmpireId: member.empireId,
                            role: e.target.value as "member" | "officer",
                          })
                        }
                        options={[
                          {
                            value: "member",
                            label: t("corporation.role.member"),
                          },
                          {
                            value: "officer",
                            label: t("corporation.role.officer"),
                          },
                        ]}
                      />
                    )}
                    {canKick && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          send({
                            type: "kickFromCorporation",
                            targetEmpireId: member.empireId,
                          })
                        }
                      >
                        {t("corporation.kick")}
                      </Button>
                    )}
                  </>
                ) : undefined
              }
            />
          ))}
        </ul>
        <div className="route-actions">
          {myRole === "founder" ? (
            <Button
              variant="ghost"
              onClick={() => send({ type: "dissolveCorporation" })}
            >
              {t("corporation.dissolve")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => send({ type: "leaveCorporation" })}
            >
              {t("corporation.leave")}
            </Button>
          )}
        </div>
      </Panel>

      <Panel title={t("corporation.treasuryTitle")}>
        <p className="stat-value">
          {t("corporation.treasury", {
            value: Math.floor(corporation.treasury),
          })}
        </p>
        {/* Le coffre ne contient que des crédits : une ressource est toujours située
            (ADR 0004), un coffre de matière sans lieu serait un téléporteur. */}
        <p className="muted small">{t("corporation.treasuryHint")}</p>
        <NumberInput
          label={t("corporation.amount")}
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <div className="route-actions">
          <Button
            disabled={!validAmount || !activeColony}
            onClick={() =>
              activeColony &&
              send({
                type: "depositToTreasury",
                colonyId: activeColony.id,
                amount: value,
              })
            }
          >
            {t("corporation.deposit")}
          </Button>
          {canWithdraw && (
            <Button
              disabled={!validAmount || !activeColony}
              onClick={() =>
                activeColony &&
                send({
                  type: "withdrawFromTreasury",
                  colonyId: activeColony.id,
                  amount: value,
                })
              }
            >
              {t("corporation.withdraw")}
            </Button>
          )}
        </div>
      </Panel>

      {canInvite && (
        <Panel title={t("corporation.inviteTitle")}>
          {invitable.length === 0 ? (
            <p className="muted small">{t("corporation.noOneToInvite")}</p>
          ) : (
            <ul className="queue-list">
              {invitable.map((e) => (
                <ListRow
                  key={e.id}
                  title={e.name}
                  right={
                    <Button
                      size="sm"
                      onClick={() =>
                        send({
                          type: "inviteToCorporation",
                          targetEmpireId: e.id,
                        })
                      }
                    >
                      {t("corporation.invite")}
                    </Button>
                  }
                />
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  );
}
