import type { ClientMessage } from "@spacesim/protocol";
import {
  BASE_PRICES,
  jumpDistanceInUniverse,
  MARKET_RESOURCES,
  maxConvoyCapacity,
  repBonus,
  resolvePurchase,
  resolveSale,
  tradingPostPrice,
  transferCostCredits,
  transferDurationMs,
  type Blueprint,
  type Colony,
  type FactionId,
  type MarketResource,
  type Mission,
  type ResourceId,
  type Route,
  type TradingPostMarket,
  type TradingPost,
  type Universe,
} from "@spacesim/shared";
import { useState } from "react";
import {
  Button,
  NumberInput,
  Panel,
  SectionTitle,
  Select,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { BlueprintMarket } from "./BlueprintMarket.js";
import { formatDuration, systemIdOf } from "./format.js";
import { FACTION_LABELS, RESOURCE_LABELS, repTierName } from "./labels.js";

interface Props {
  tradingPost: TradingPost;
  market: TradingPostMarket | undefined;
  activeColony: Colony | null;
  missions: Mission[];
  universe: Universe;
  transferSpeedMult: number;
  factionRep: Record<string, number>;
  routes: Route[];
  /** Plans de vaisseaux de l'empire (chantier 13) : marché de plans en comptoir. */
  blueprints: Blueprint[];
  portalLinks: [string, string][];
  now: number;
  send: (msg: ClientMessage) => void;
}

export function TradingPostPanel({
  tradingPost,
  market,
  activeColony,
  missions,
  universe,
  transferSpeedMult,
  factionRep,
  routes,
  blueprints,
  portalLinks,
  now,
  send,
}: Props) {
  const [sellAmounts, setSellAmounts] = useState<
    Partial<Record<ResourceId, string>>
  >({});
  const [buyResource, setBuyResource] = useState<MarketResource>("metals");
  const [buyBudget, setBuyBudget] = useState("");
  const faction = FACTION_LABELS[tradingPost.factionId as FactionId];

  // Contexte régional (chantier 12) : le comptoir a son propre barème selon son
  // éloignement — c'est ce qui fait qu'un aller-retour peut valoir le carburant.
  const priceContext = {
    venueId: tradingPost.id,
    galaxyIndex: universe.galaxies.findIndex((g) =>
      g.systems.some((s) => s.id === tradingPost.systemId),
    ),
    factionId: tradingPost.factionId,
  };

  const fromSystem = activeColony
    ? systemIdOf(universe, activeColony.planetId)
    : undefined;
  const jumps = fromSystem
    ? jumpDistanceInUniverse(
        universe,
        fromSystem,
        tradingPost.systemId,
        portalLinks,
      )
    : -1;
  const fee = jumps >= 0 ? transferCostCredits(jumps) : 0;
  const eta = jumps >= 0 ? transferDurationMs(jumps) * transferSpeedMult : 0;

  const related = missions.filter(
    (m) =>
      (m.kind === "sell" || m.kind === "buy" || m.kind === "buy_return") &&
      m.targetId === tradingPost.id,
  );

  const cargo: Partial<Record<ResourceId, number>> = {};
  for (const res of MARKET_RESOURCES) {
    const n = Math.floor(Number(sellAmounts[res] ?? ""));
    if (Number.isFinite(n) && n > 0) cargo[res] = n;
  }
  const hasCargo = Object.keys(cargo).length > 0;
  const totalCargo = Object.values(cargo).reduce((s, n) => s + n, 0);
  const convoyCapacity = activeColony
    ? maxConvoyCapacity(activeColony, routes)
    : 0;
  const overCapacity = totalCargo > convoyCapacity;
  const estimatedRevenue =
    market && hasCargo
      ? resolveSale(market.stocks, cargo, priceContext).revenue
      : 0;

  const budget = Math.floor(Number(buyBudget));
  const validBudget = Number.isFinite(budget) && budget > 0;
  const estimatedPurchase =
    market && validBudget
      ? resolvePurchase(
          market.stocks,
          buyResource,
          budget,
          Infinity,
          priceContext,
        )
      : null;

  const canTrade = activeColony && jumps >= 0;

  return (
    <Panel title={`⬡ ${tradingPost.name}`}>
      <p className="muted small">
        {faction?.name ?? tradingPost.factionId} — {faction?.description ?? ""}
      </p>
      {jumps >= 0 && (
        <p className="small muted">
          {jumps} saut{jumps > 1 ? "s" : ""} — {formatDuration(eta)} — frais{" "}
          {fee} crédits par convoi
        </p>
      )}
      {(() => {
        const rep = factionRep[tradingPost.factionId] ?? 0;
        const bonus = repBonus(rep);
        return (
          <p className="small">
            Réputation : <span className="ok">{repTierName(rep)}</span>{" "}
            <span className="muted">({Math.floor(rep)})</span>
            {bonus > 0 && (
              <span className="ok">
                {" "}
                — ventes +{bonus * 100} %, achats −{bonus * 100} %
              </span>
            )}
          </p>
        );
      })()}

      {market ? (
        <Table
          columns={
            [
              {
                key: "res",
                label: "Ressource",
                render: (_, res) => RESOURCE_LABELS[res],
              },
              {
                key: "stock",
                label: "Stock",
                align: "right",
                render: (_, res) => Math.floor(market.stocks[res]),
              },
              {
                key: "price",
                label: "Prix",
                align: "right",
                trend: (res) => {
                  const gap =
                    tradingPostPrice(res, market.stocks[res], priceContext) /
                      BASE_PRICES[res] -
                    1;
                  return gap > 0.15 ? "up" : gap < -0.15 ? "down" : undefined;
                },
                render: (_, res) => {
                  const price = tradingPostPrice(
                    res,
                    market.stocks[res],
                    priceContext,
                  );
                  const gap = price / BASE_PRICES[res] - 1;
                  return `${price.toFixed(2)} (${gap >= 0 ? "+" : ""}${Math.round(gap * 100)} %)`;
                },
              },
            ] satisfies TableColumn<MarketResource>[]
          }
          rows={MARKET_RESOURCES}
        />
      ) : (
        <p className="muted small">Marché inconnu.</p>
      )}

      {related.length > 0 && (
        <ul className="queue-list">
          {related.map((m) => (
            <li key={m.id} className="queue-item">
              <div className="queue-head">
                <span>
                  {m.kind === "sell"
                    ? "Vente"
                    : m.kind === "buy"
                      ? "Achat (aller)"
                      : "Achat (retour)"}
                </span>
                <span className="muted">
                  {formatDuration(m.arrivesAt - now)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canTrade && market && (
        <>
          <SectionTitle>Vendre</SectionTitle>
          <div className="form-stack">
            {/* On ne vend que ce qui est déjà en orbite (chantier 12). */}
            {MARKET_RESOURCES.map((res) => (
              <NumberInput
                key={res}
                label={`${RESOURCE_LABELS[res]} (orbite : ${Math.floor(activeColony.orbitalResources[res] ?? 0)})`}
                min={0}
                max={Math.floor(activeColony.orbitalResources[res] ?? 0)}
                value={sellAmounts[res] ?? ""}
                placeholder="0"
                onChange={(e) =>
                  setSellAmounts({ ...sellAmounts, [res]: e.target.value })
                }
              />
            ))}
            <span className={`small ${overCapacity ? "ko" : "muted"}`}>
              Soute disponible : {convoyCapacity}
              {overCapacity ? ` — cargaison trop lourde (${totalCargo})` : ""}
            </span>
            {hasCargo && !overCapacity && (
              <span className="small ok">
                Revenu estimé au prix actuel : ~{estimatedRevenue} crédits
              </span>
            )}
            <Button
              disabled={!hasCargo || overCapacity || convoyCapacity === 0}
              onClick={() => {
                send({
                  type: "sell",
                  colonyId: activeColony.id,
                  venueId: tradingPost.id,
                  venueKind: "tradingPost",
                  resources: cargo,
                });
                setSellAmounts({});
              }}
            >
              Envoyer le convoi de vente
            </Button>
          </div>

          <SectionTitle>Acheter</SectionTitle>
          <div className="form-stack">
            <Select
              label="Ressource"
              value={buyResource}
              onChange={(e) => setBuyResource(e.target.value as MarketResource)}
              options={MARKET_RESOURCES.map((res) => ({
                value: res,
                label: RESOURCE_LABELS[res],
              }))}
            />
            <NumberInput
              label="Budget (crédits)"
              min={0}
              value={buyBudget}
              placeholder="0"
              onChange={(e) => setBuyBudget(e.target.value)}
            />
            {estimatedPurchase && estimatedPurchase.bought > 0 && (
              <span className="small ok">
                ~{estimatedPurchase.bought} {RESOURCE_LABELS[buyResource]} pour{" "}
                {estimatedPurchase.spent} crédits (au prix actuel)
              </span>
            )}
            <Button
              disabled={
                !validBudget || activeColony.resources.credits < budget + fee
              }
              title={
                activeColony.resources.credits < budget + fee
                  ? "Crédits insuffisants (budget + frais)"
                  : ""
              }
              onClick={() => {
                send({
                  type: "buy",
                  colonyId: activeColony.id,
                  venueId: tradingPost.id,
                  venueKind: "tradingPost",
                  resource: buyResource,
                  budget,
                });
                setBuyBudget("");
              }}
            >
              Envoyer le convoi d'achat
            </Button>
          </div>

          <BlueprintMarket
            activeColony={activeColony}
            venueId={tradingPost.id}
            venueKind="tradingPost"
            blueprints={blueprints}
            routes={routes}
            send={send}
          />
        </>
      )}
    </Panel>
  );
}
