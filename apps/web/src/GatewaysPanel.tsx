import {
  GATEWAY_COST,
  galaxyIndexOfId,
  gatewayProgressRatio,
  gatewayRemaining,
  maxConvoyCapacity,
  type ResourceId,
} from "@spacesim/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, NumberInput, Panel, ProgressBar } from "@spacesim/ui";
import { formatDuration } from "./format.js";
import { resourceLabel } from "./labels.js";
import { useGameStore } from "./state/game-store.js";
import { selectActiveColony } from "./state/selectors.js";

interface Props {
  now: number;
  /**
   * Restreint l'affichage à une galaxie (chantier 35.6). Un portail appartient à une
   * galaxie ; le trouver dans sa fiche vaut mieux que de le chercher dans une liste de
   * tous les portails de l'univers.
   */
  galaxyId?: string;
}

const GATEWAY_RESOURCES = Object.keys(GATEWAY_COST) as ResourceId[];

export function GatewaysPanel({ now, galaxyId }: Props) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const activeColony = useGameStore(
    selectActiveColony(searchParams.get("colony")),
  );
  const {
    gateways: allGateways,
    universe,
    routes,
    game,
    send,
  } = useGameStore();
  const gateways = galaxyId
    ? allGateways.filter((g) => g.galaxyId === galaxyId)
    : allGateways;
  const [amounts, setAmounts] = useState<
    Record<string, Partial<Record<ResourceId, string>>>
  >({});
  const researched = game?.researched ?? [];
  const hasTech = researched.includes("gateway_engineering");
  const convoyCapacity = activeColony
    ? maxConvoyCapacity(activeColony, routes)
    : 0;

  if (!universe) return null;
  // Une galaxie sans portail n'a pas de panneau vide à montrer.
  if (galaxyId && gateways.length === 0) return null;

  return (
    <Panel title={t("gatewaysPanel.title")}>
      {!hasTech && <p className="muted small">{t("gatewaysPanel.needTech")}</p>}
      {gateways.map((gateway) => {
        const galaxy = universe.galaxies.find((g) => g.id === gateway.galaxyId);
        if (!galaxy) return null;
        const remaining = gatewayRemaining(gateway);
        const ratio = gatewayProgressRatio(gateway);
        const entry = amounts[gateway.galaxyId] ?? {};
        const cargo: Partial<Record<ResourceId, number>> = {};
        for (const res of GATEWAY_RESOURCES) {
          const n = Math.floor(Number(entry[res] ?? ""));
          if (Number.isFinite(n) && n > 0) cargo[res] = n;
        }
        const physical = Object.entries(cargo)
          .filter(([res]) => res !== "credits")
          .reduce((s, [, n]) => s + (n ?? 0), 0);
        const overCapacity = physical > convoyCapacity;

        return (
          <div key={gateway.galaxyId} className="gateway-item">
            <div className="queue-head">
              <strong>{galaxy.name}</strong>
              {gateway.active ? (
                <Badge variant="ok">{t("gatewaysPanel.active")}</Badge>
              ) : gateway.activatesAt ? (
                <Badge variant="ok">
                  {t("gatewaysPanel.finalBuild", {
                    duration: formatDuration(gateway.activatesAt - now),
                  })}
                </Badge>
              ) : (
                <Badge>{Math.round(ratio * 100)} %</Badge>
              )}
            </div>
            {!gateway.active && !gateway.activatesAt && (
              <>
                <ProgressBar value={ratio * 100} max={100} />
                <span className="small muted">
                  {t("gatewaysPanel.remaining", {
                    list:
                      Object.entries(remaining)
                        .map(
                          ([res, n]) =>
                            `${n} ${resourceLabel(res as ResourceId)}`,
                        )
                        .join(" · ") || t("gatewaysPanel.remainingNone"),
                  })}
                </span>
                {/* Le coût croît avec l'éloignement : la richesse promise justifie l'effort. */}
                <span className="small muted">
                  {t("gatewaysPanel.rank", {
                    rank: galaxyIndexOfId(gateway.galaxyId),
                    bonus: galaxy.depositBonus,
                  })}
                </span>
                {hasTech && activeColony && (
                  <div className="form-stack">
                    {GATEWAY_RESOURCES.filter(
                      (res) => (remaining[res] ?? 0) > 0,
                    ).map((res) => (
                      <NumberInput
                        key={res}
                        label={t("gatewaysPanel.resourceRemaining", {
                          resource: resourceLabel(res),
                          amount: remaining[res],
                        })}
                        min={0}
                        value={entry[res] ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          setAmounts({
                            ...amounts,
                            [gateway.galaxyId]: {
                              ...entry,
                              [res]: e.target.value,
                            },
                          })
                        }
                      />
                    ))}
                    <span className={`small ${overCapacity ? "ko" : "muted"}`}>
                      {t("gatewaysPanel.availableCargo", {
                        capacity: convoyCapacity,
                      })}
                      {overCapacity
                        ? t("gatewaysPanel.tooHeavy", { physical })
                        : ""}
                    </span>
                    <Button
                      disabled={Object.keys(cargo).length === 0 || overCapacity}
                      onClick={() => {
                        send({
                          type: "contributeGateway",
                          colonyId: activeColony.id,
                          galaxyId: gateway.galaxyId,
                          resources: cargo,
                        });
                        setAmounts({ ...amounts, [gateway.galaxyId]: {} });
                      }}
                    >
                      {t("gatewaysPanel.sendConvoy")}
                    </Button>
                  </div>
                )}
              </>
            )}
            {gateway.active && (
              <span className="small muted">
                {t("gatewaysPanel.activeHint", { bonus: galaxy.depositBonus })}
              </span>
            )}
          </div>
        );
      })}
    </Panel>
  );
}
