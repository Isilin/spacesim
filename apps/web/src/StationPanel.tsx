import {
  BASE_PRICES,
  jumpDistanceInUniverse,
  MARKET_RESOURCES,
  maxConvoyCapacity,
  repBonus,
  resolvePurchase,
  resolveSale,
  stationPrice,
  transferCostCredits,
  transferDurationMs,
  type ClientMessage,
  type Colony,
  type FactionId,
  type MarketResource,
  type Mission,
  type ResourceId,
  type Route,
  type StationMarket,
  type TradeStation,
  type Universe,
} from "@spacesim/shared";
import { useState } from "react";
import { formatDuration, systemIdOf } from "./format.js";
import { FACTION_LABELS, RESOURCE_LABELS, repTierName } from "./labels.js";

interface Props {
  station: TradeStation;
  market: StationMarket | undefined;
  activeColony: Colony | null;
  missions: Mission[];
  universe: Universe;
  transferSpeedMult: number;
  factionRep: Record<string, number>;
  routes: Route[];
  portalLinks: [string, string][];
  now: number;
  send: (msg: ClientMessage) => void;
}



export function StationPanel({
  station,
  market,
  activeColony,
  missions,
  universe,
  transferSpeedMult,
  factionRep,
  routes,
  portalLinks,
  now,
  send,
}: Props) {
  const [sellAmounts, setSellAmounts] = useState<Partial<Record<ResourceId, string>>>({});
  const [buyResource, setBuyResource] = useState<MarketResource>("metals");
  const [buyBudget, setBuyBudget] = useState("");
  const faction = FACTION_LABELS[station.factionId as FactionId];

  // Contexte régional (chantier 12) : le comptoir a son propre barème selon son
  // éloignement — c'est ce qui fait qu'un aller-retour peut valoir le carburant.
  const priceContext = {
    stationId: station.id,
    galaxyIndex: universe.galaxies.findIndex((g) =>
      g.systems.some((s) => s.id === station.systemId),
    ),
    factionId: station.factionId,
  };

  const fromSystem = activeColony ? systemIdOf(universe, activeColony.planetId) : undefined;
  const jumps = fromSystem
    ? jumpDistanceInUniverse(universe, fromSystem, station.systemId, portalLinks)
    : -1;
  const fee = jumps >= 0 ? transferCostCredits(jumps) : 0;
  const eta = jumps >= 0 ? transferDurationMs(jumps) * transferSpeedMult : 0;

  const related = missions.filter(
    (m) => (m.kind === "sell" || m.kind === "buy" || m.kind === "buy_return") && m.targetId === station.id,
  );

  const cargo: Partial<Record<ResourceId, number>> = {};
  for (const res of MARKET_RESOURCES) {
    const n = Math.floor(Number(sellAmounts[res] ?? ""));
    if (Number.isFinite(n) && n > 0) cargo[res] = n;
  }
  const hasCargo = Object.keys(cargo).length > 0;
  const totalCargo = Object.values(cargo).reduce((s, n) => s + n, 0);
  const convoyCapacity = activeColony ? maxConvoyCapacity(activeColony, routes) : 0;
  const overCapacity = totalCargo > convoyCapacity;
  const estimatedRevenue = market && hasCargo ? resolveSale(market.stocks, cargo, priceContext).revenue : 0;

  const budget = Math.floor(Number(buyBudget));
  const validBudget = Number.isFinite(budget) && budget > 0;
  const estimatedPurchase =
    market && validBudget ? resolvePurchase(market.stocks, buyResource, budget, Infinity, priceContext) : null;

  const canTrade = activeColony && jumps >= 0;

  return (
    <div className="station-panel">
      <h2>⬡ {station.name}</h2>
      <p className="muted small">
        {faction?.name ?? station.factionId} — {faction?.description ?? ""}
      </p>
      {jumps >= 0 && (
        <p className="small muted">
          {jumps} saut{jumps > 1 ? "s" : ""} — {formatDuration(eta)} — frais {fee} crédits par convoi
        </p>
      )}
      {(() => {
        const rep = factionRep[station.factionId] ?? 0;
        const bonus = repBonus(rep);
        return (
          <p className="small">
            Réputation : <span className="ok">{repTierName(rep)}</span>{" "}
            <span className="muted">({Math.floor(rep)})</span>
            {bonus > 0 && (
              <span className="ok"> — ventes +{bonus * 100} %, achats −{bonus * 100} %</span>
            )}
          </p>
        );
      })()}

      {market ? (
        <table className="market-table">
          <thead>
            <tr>
              <th>Ressource</th>
              <th>Stock</th>
              <th>Prix</th>
            </tr>
          </thead>
          <tbody>
            {MARKET_RESOURCES.map((res) => {
              const stock = market.stocks[res];
              const price = stationPrice(res, stock, priceContext);
              // Écart au prix de référence : c'est lui qui signale une occasion.
              const gap = price / BASE_PRICES[res] - 1;
              const trend = gap > 0.15 ? "high" : gap < -0.15 ? "low" : "";
              return (
                <tr key={res}>
                  <td>{RESOURCE_LABELS[res]}</td>
                  <td className="muted">{Math.floor(stock)}</td>
                  <td className={trend === "high" ? "ok" : trend === "low" ? "ko" : ""}>
                    {price.toFixed(2)}
                    <span className="muted small">
                      {" "}
                      ({gap >= 0 ? "+" : ""}
                      {Math.round(gap * 100)} %)
                    </span>
                    {trend === "high" ? " ▲" : trend === "low" ? " ▼" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="muted small">Marché inconnu.</p>
      )}

      {related.length > 0 && (
        <ul className="queue-list">
          {related.map((m) => (
            <li key={m.id} className="queue-item">
              <div className="queue-head">
                <span>
                  {m.kind === "sell" ? "Vente" : m.kind === "buy" ? "Achat (aller)" : "Achat (retour)"}
                </span>
                <span className="muted">{formatDuration(m.arrivesAt - now)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canTrade && market && (
        <>
          <div className="transfer-form">
            <strong className="small">Vendre</strong>
            {/* On ne vend que ce qui est déjà en orbite (chantier 12). */}
            {MARKET_RESOURCES.map((res) => (
              <label key={res} className="small muted transfer-amount">
                {RESOURCE_LABELS[res]} (orbite : {Math.floor(activeColony.orbitalResources[res] ?? 0)})
                <input
                  type="number"
                  min={0}
                  max={Math.floor(activeColony.orbitalResources[res] ?? 0)}
                  value={sellAmounts[res] ?? ""}
                  placeholder="0"
                  onChange={(e) => setSellAmounts({ ...sellAmounts, [res]: e.target.value })}
                />
              </label>
            ))}
            <span className={`small ${overCapacity ? "ko" : "muted"}`}>
              Soute disponible : {convoyCapacity}
              {overCapacity ? ` — cargaison trop lourde (${totalCargo})` : ""}
            </span>
            {hasCargo && !overCapacity && (
              <span className="small ok">Revenu estimé au prix actuel : ~{estimatedRevenue} crédits</span>
            )}
            <button
              disabled={!hasCargo || overCapacity || convoyCapacity === 0}
              onClick={() => {
                send({
                  type: "sell",
                  colonyId: activeColony.id,
                  stationId: station.id,
                  resources: cargo,
                });
                setSellAmounts({});
              }}
            >
              Envoyer le convoi de vente
            </button>
          </div>

          <div className="transfer-form">
            <strong className="small">Acheter</strong>
            <label className="small muted">
              Ressource{" "}
              <select
                value={buyResource}
                onChange={(e) => setBuyResource(e.target.value as MarketResource)}
              >
                {MARKET_RESOURCES.map((res) => (
                  <option key={res} value={res}>
                    {RESOURCE_LABELS[res]}
                  </option>
                ))}
              </select>
            </label>
            <label className="small muted transfer-amount">
              Budget (crédits)
              <input
                type="number"
                min={0}
                value={buyBudget}
                placeholder="0"
                onChange={(e) => setBuyBudget(e.target.value)}
              />
            </label>
            {estimatedPurchase && estimatedPurchase.bought > 0 && (
              <span className="small ok">
                ~{estimatedPurchase.bought} {RESOURCE_LABELS[buyResource]} pour{" "}
                {estimatedPurchase.spent} crédits (au prix actuel)
              </span>
            )}
            <button
              disabled={!validBudget || activeColony.resources.credits < budget + fee}
              title={
                activeColony.resources.credits < budget + fee ? "Crédits insuffisants (budget + frais)" : ""
              }
              onClick={() => {
                send({
                  type: "buy",
                  colonyId: activeColony.id,
                  stationId: station.id,
                  resource: buyResource,
                  budget,
                });
                setBuyBudget("");
              }}
            >
              Envoyer le convoi d'achat
            </button>
          </div>
        </>
      )}
    </div>
  );
}
