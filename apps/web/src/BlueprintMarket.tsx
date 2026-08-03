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
  const idle = idleShips(activeColony, routes);
  const idleShipEntries = Object.entries(activeColony.ships).filter(([, n]) => (n ?? 0) > 0);

  return (
    <>
      <SectionTitle>Plans de vaisseaux</SectionTitle>

      <span className="muted small">
        Catalogue (marge {Math.round((BLUEPRINT_BUY_MARKUP - 1) * 100)} %)
      </span>
      <ul className="building-list">
        {PRESETS.map((preset) => {
          const price = Math.round(blueprintValue(resolveBlueprint(preset)) * BLUEPRINT_BUY_MARKUP);
          const affordable = activeColony.resources.credits >= price;
          return (
            <ListRow
              key={preset.id}
              title={preset.name}
              meta={`${price} crédits`}
              right={
                <Button
                  size="sm"
                  disabled={!affordable}
                  title={affordable ? "" : "Crédits insuffisants"}
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
                  Acheter
                </Button>
              }
            />
          );
        })}
      </ul>

      {blueprints.length > 0 && (
        <>
          <span className="muted small">
            Revendre un plan (décote {Math.round((1 - BLUEPRINT_SELL_FRACTION) * 100)} %)
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
                  meta={`${price} crédits`}
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
                      Vendre
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
          <span className="muted small">Vendre un vaisseau assemblé (désœuvré)</span>
          <ul className="building-list">
            {idleShipEntries.map(([shipId, owned]) => {
              const dispo = Math.min(idle[shipId] ?? 0, owned ?? 0);
              const name = blueprints.find((b) => b.id === shipId)?.name ?? shipLabel(shipId).name;
              return (
                <ListRow
                  key={shipId}
                  title={name}
                  meta={`${dispo} disponible(s)`}
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
                      Vendre ×1
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
