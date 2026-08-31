import {
  CHAT_MAX_LENGTH,
  MAIL_MAX_BODY,
  type ChatScope,
  type Mail,
} from "@spacesim/shared";
import { Badge, Button, EmptyState, Field, Panel, Select } from "@spacesim/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDuration } from "./format.js";
import "./i18n.js";
import { useGameStore } from "./state/game-store.js";

/**
 * Canaux de discussion et courrier (chantier 32.17).
 *
 * L'appartenance à un canal n'est pas choisie ici : elle se dérive de l'état du jeu —
 * corporation, colonies — et le serveur n'envoie que les canaux auxquels l'empire
 * appartient ([ADR 0010](../../../docs/adr/0010-communication-canaux-bornes-et-courrier.md)).
 * La liste déroulante ne fait donc que refléter ce qui est arrivé.
 */
export function CommunicationView({ now }: { now: number }) {
  const { t } = useTranslation();
  const {
    chat,
    chatChannels,
    mails,
    corporation,
    universe,
    leaderboard,
    playerId,
    send,
    actionError,
  } = useGameStore();

  const [draft, setDraft] = useState("");
  const [channel, setChannel] = useState<string>("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [openMail, setOpenMail] = useState<string | null>(null);

  // Canaux publiés par le serveur. Les déduire des messages reçus rendait un canal
  // encore silencieux invisible — personne n'aurait jamais pu y parler en premier.
  const channels = useMemo(
    () => chatChannels.map((c) => ({ key: `${c.scope}:${c.scopeId}`, ...c })),
    [chatChannels],
  );

  const labelOf = (scope: ChatScope, scopeId: string): string => {
    if (scope === "corp") return corporation?.name ?? t("communication.corp");
    const galaxy = universe?.galaxies.find((g) => g.id === scopeId);
    return galaxy?.name ?? scopeId;
  };

  const active = channels.find((c) => c.key === channel) ?? channels[0];
  const shown = active
    ? chat.filter(
        (m) => m.scope === active.scope && m.scopeId === active.scopeId,
      )
    : [];

  const recipients = leaderboard.filter(
    (e) => e.id !== playerId && e.kind === "human",
  );
  const opened: Mail | undefined = mails.find((m) => m.id === openMail);
  const unread = mails.filter((m) => m.readAt === null).length;

  const sendMessage = () => {
    if (!active || !draft.trim()) return;
    send({
      type: "sendChatMessage",
      scope: active.scope,
      scopeId: active.scopeId,
      body: draft.trim(),
    });
    setDraft("");
  };

  return (
    <>
      <Panel title={t("communication.chatTitle")}>
        {channels.length === 0 ? (
          // Aucun canal = aucune colonie et aucune corporation : c'est un état de jeu,
          // pas une erreur.
          <EmptyState icon="💬">{t("communication.noChannel")}</EmptyState>
        ) : (
          <>
            <Select
              value={active?.key ?? ""}
              onChange={(e) => setChannel(e.target.value)}
              options={channels.map((c) => ({
                value: c.key,
                label: labelOf(c.scope, c.scopeId),
              }))}
            />
            <ul className="queue-list">
              {shown.length === 0 && (
                <li className="small muted">{t("communication.silence")}</li>
              )}
              {shown.map((message) => (
                <li key={message.id} className="queue-item">
                  <div className="queue-head">
                    <span>
                      <strong>{message.authorName}</strong>
                      {" · "}
                      {message.body}
                    </span>
                    <span className="muted small">
                      {t("communication.ago", {
                        duration: formatDuration(
                          Math.max(0, now - message.sentAt),
                        ),
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <Field
              label={t("communication.message")}
              value={draft}
              maxLength={CHAT_MAX_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
            />
            <Button disabled={!draft.trim()} onClick={sendMessage}>
              {t("communication.send")}
            </Button>
            {/* Le silence est appliqué par le SERVEUR à l'envoi : ce message n'est que
                le retour d'un refus, jamais la mesure elle-même (ADR 0010). */}
            {actionError && <p className="muted small">{actionError}</p>}
          </>
        )}
      </Panel>

      <Panel
        title={
          unread > 0
            ? t("communication.mailTitleUnread", { count: unread })
            : t("communication.mailTitle")
        }
      >
        {mails.length === 0 ? (
          <EmptyState icon="✉">{t("communication.noMail")}</EmptyState>
        ) : (
          <ul className="queue-list">
            {mails.map((mail) => (
              <li key={mail.id} className="queue-item">
                <div className="queue-head">
                  <Button
                    variant="link"
                    onClick={() => {
                      setOpenMail(mail.id === openMail ? null : mail.id);
                      if (mail.readAt === null)
                        send({ type: "markMailRead", mailId: mail.id });
                    }}
                  >
                    <strong>{mail.subject}</strong> — {mail.fromName}
                  </Button>
                  {mail.readAt === null && (
                    <Badge variant="info">{t("communication.unread")}</Badge>
                  )}
                </div>
                {opened?.id === mail.id && (
                  <>
                    <p className="small">{mail.body}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        send({ type: "deleteMail", mailId: mail.id })
                      }
                    >
                      {t("communication.deleteMail")}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t("communication.composeTitle")}>
        {recipients.length === 0 ? (
          <p className="muted small">{t("communication.noRecipient")}</p>
        ) : (
          <>
            <Select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              options={[
                { value: "", label: t("communication.chooseRecipient") },
                ...recipients.map((e) => ({ value: e.id, label: e.name })),
              ]}
            />
            <Field
              label={t("communication.subject")}
              value={subject}
              maxLength={120}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Field
              label={t("communication.body")}
              value={body}
              maxLength={MAIL_MAX_BODY}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button
              disabled={!to || !subject.trim() || !body.trim()}
              onClick={() => {
                send({
                  type: "sendMail",
                  toEmpireId: to,
                  subject: subject.trim(),
                  body: body.trim(),
                });
                setSubject("");
                setBody("");
              }}
            >
              {t("communication.sendMail")}
            </Button>
          </>
        )}
      </Panel>
    </>
  );
}
