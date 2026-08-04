import type { ClientMessage } from "@spacesim/protocol";
import {
  BLUEPRINT_BUY_MARKUP,
  BLUEPRINT_SELL_FRACTION,
  blueprintValue,
  idleShips,
  PRESETS,
  resolveBlueprint,
  type Blueprint,
  type Colony,
  type Route,
} from "@spacesim/shared";
import { Button, ListRow, SectionTitle } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { shipLabel } from "./labels.js";

/**
 * Marché de plans en comptoir ou en station (chantiers 13/25) : acheter un design
 * tout fait au catalogue, revendre un plan possédé ou des vaisseaux civils
 * désœuvrés — transaction instantanée (contrairement au commerce de ressources,
 * rien n'est chargé sur un convoi). Extrait de `TradingPostPanel.tsx` et
 * paramétré par `venueId`/`venueKind` (au lieu de `tradingPost.id` en dur) pour
 * être réellement partagé avec `StationMarketPanel.tsx` — même précédent que
 * l'extraction de `BodyActions.tsx` depuis `SystemPanel.tsx`.
 */
export function BlueprintMarket({
  activeColony,
  venueId,
  venueKind,
  blueprints,
  routes,
  send,
}: {
  activeColony: Colony;
  venueId: string;
  venueKind: "tradingPost" | "station";
  blueprints: Blueprint[];
  routes: Route[];
  send: (msg: ClientMessage) => void;
}) {
  const { t } = useTranslation();
  const idle = idleShips(activeColony, routes);
  const idleShipEntries = Object.entries(activeColony.ships).filter(
    ([, n]) => (n ?? 0) > 0,
  );

  return (
    <>
      <SectionTitle>{t("blueprintMarket.title")}</SectionTitle>

      <span className="muted small">
        {t("blueprintMarket.catalog", {
          markup: Math.round((BLUEPRINT_BUY_MARKUP - 1) * 100),
        })}
      </span>
      <ul className="building-list">
        {PRESETS.map((preset) => {
          const price = Math.round(
            blueprintValue(resolveBlueprint(preset)) * BLUEPRINT_BUY_MARKUP,
          );
          const affordable = activeColony.resources.credits >= price;
          return (
            <ListRow
              key={preset.id}
              title={preset.name}
              meta={t("blueprintMarket.creditsAmount", { price })}
              right={
                <Button
                  size="sm"
                  disabled={!affordable}
                  title={
                    affordable ? "" : t("blueprintMarket.insufficientCredits")
                  }
                  onClick={() =>
                    send({
                      type: "buyBlueprint",
                      colonyId: activeColony.id,
                      venueId,
                      venueKind,
                      presetId: preset.id,
                    })
                  }
                >
                  {t("blueprintMarket.buy")}
                </Button>
              }
            />
          );
        })}
      </ul>

      {blueprints.length > 0 && (
        <>
          <span className="muted small">
            {t("blueprintMarket.resellBlueprint", {
              discount: Math.round((1 - BLUEPRINT_SELL_FRACTION) * 100),
            })}
          </span>
          <ul className="building-list">
            {blueprints.map((bp) => {
              const price = Math.round(
                blueprintValue(resolveBlueprint(bp)) * BLUEPRINT_SELL_FRACTION,
              );
              return (
                <ListRow
                  key={bp.id}
                  title={bp.name}
                  meta={t("blueprintMarket.creditsAmount", { price })}
                  right={
                    <Button
                      size="sm"
                      onClick={() =>
                        send({
                          type: "sellBlueprint",
                          colonyId: activeColony.id,
                          venueId,
                          venueKind,
                          blueprintId: bp.id,
                        })
                      }
                    >
                      {t("blueprintMarket.sell")}
                    </Button>
                  }
                />
              );
            })}
          </ul>
        </>
      )}

      {idleShipEntries.length > 0 && (
        <>
          <span className="muted small">{t("blueprintMarket.sellShip")}</span>
          <ul className="building-list">
            {idleShipEntries.map(([shipId, owned]) => {
              const dispo = Math.min(idle[shipId] ?? 0, owned ?? 0);
              const name =
                blueprints.find((b) => b.id === shipId)?.name ??
                shipLabel(shipId).name;
              return (
                <ListRow
                  key={shipId}
                  title={name}
                  meta={t("blueprintMarket.available", { count: dispo })}
                  right={
                    <Button
                      size="sm"
                      disabled={dispo === 0}
                      onClick={() =>
                        send({
                          type: "sellShip",
                          colonyId: activeColony.id,
                          venueId,
                          venueKind,
                          shipId,
                          count: 1,
                        })
                      }
                    >
                      {t("blueprintMarket.sellOne")}
                    </Button>
                  }
                />
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
