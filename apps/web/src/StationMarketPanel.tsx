import type { ClientMessage } from "@spacesim/protocol";
import {
  BASE_PRICES,
  canTradeAtStation,
  jumpDistanceInUniverse,
  MARKET_RESOURCES,
  maxConvoyCapacity,
  resolvePurchase,
  resolveSale,
  tradingPostPrice,
  transferCostCredits,
  transferDurationMs,
  type Blueprint,
  type Colony,
  type MarketResource,
  type Mission,
  type RelationState,
  type ResourceId,
  type Route,
  type StationMarketAccess,
  type Universe,
} from "@spacesim/shared";
import { useState } from "react";
import { Button, NumberInput, Panel, SectionTitle, Select, Table, type TableColumn } from "@spacesim/ui";
import { BlueprintMarket } from "./BlueprintMarket.js";
import { formatDuration, systemIdOf } from "./format.js";
import { RESOURCE_LABELS, STATION_MARKET_ACCESS_LABELS } from "./labels.js";

interface Props {
  id: string;
  name: string;
  systemId: string;
  ownerId: string;
  ownerName?: string;
  isOwn: boolean;
  viewerEmpireId: string | null;
  relation: RelationState;
  hasResourceMarket: boolean;
  hasBlueprintMarket: boolean;
  access: StationMarketAccess;
  taxRate: number;
  tradableStocks: Partial<Record<ResourceId, number>>;
  activeColony: Colony | null;
  missions: Mission[];
  universe: Universe;
  transferSpeedMult: number;
  routes: Route[];
  blueprints: Blueprint[];
  portalLinks: [string, string][];
  now: number;
  send: (msg: ClientMessage) => void;
}

/**
 * Marché d'une station orbitale (chantier 25) : la sienne ou celle d'un autre empire,
 * découverte dans un système exploré. Miroir de `TradingPostPanel.tsx` (même formulaire
 * de vente/achat, même `BlueprintMarket` partagé), avec en plus la validation d'accès
 * (`canTradeAtStation`, calculée ici côté client sur le même modèle que le serveur
 * — la vraie garde reste `StationService.resolveTradeAccess`) et l'affichage d'un
 * message explicite si la politique du propriétaire refuse le visiteur.
 */
export function StationMarketPanel({
  id,
  name,
  systemId,
  ownerId,
  ownerName,
  isOwn,
  viewerEmpireId,
  relation,
  hasResourceMarket,
  hasBlueprintMarket,
  access,
  taxRate,
  tradableStocks,
  activeColony,
  missions,
  universe,
  transferSpeedMult,
  routes,
  blueprints,
  portalLinks,
  now,
  send,
}: Props) {
  const [sellAmounts, setSellAmounts] = useState<Partial<Record<ResourceId, string>>>({});
  const [buyResource, setBuyResource] = useState<MarketResource>("metals");
  const [buyBudget, setBuyBudget] = useState("");

  const allowed =
    isOwn || canTradeAtStation(ownerId, viewerEmpireId ?? "", access, relation);

  const priceContext = {
    venueId: id,
    galaxyIndex: universe.galaxies.findIndex((g) => g.systems.some((s) => s.id === systemId)),
  };

  const fromSystem = activeColony ? systemIdOf(universe, activeColony.planetId) : undefined;
  const jumps = fromSystem
    ? jumpDistanceInUniverse(universe, fromSystem, systemId, portalLinks)
    : -1;
  const fee = jumps >= 0 ? transferCostCredits(jumps) : 0;
  const eta = jumps >= 0 ? transferDurationMs(jumps) * transferSpeedMult : 0;

  const related = missions.filter(
    (m) =>
      (m.kind === "sell" || m.kind === "buy" || m.kind === "buy_return") &&
      m.venueKind === "station" &&
      m.targetId === id,
  );

  // Prix appliqué au visiteur, taxe comprise — même formule que
  // `resolveStationSale`/`resolveStationPurchase` côté serveur, en estimation seulement
  // (le serveur reste la seule source de vérité au règlement).
  const cargo: Partial<Record<ResourceId, number>> = {};
  for (const res of MARKET_RESOURCES) {
    const n = Math.floor(Number(sellAmounts[res] ?? ""));
    if (Number.isFinite(n) && n > 0) cargo[res] = n;
  }
  const hasCargo = Object.keys(cargo).length > 0;
  const totalCargo = Object.values(cargo).reduce((s, n) => s + n, 0);
  const convoyCapacity = activeColony ? maxConvoyCapacity(activeColony, routes) : 0;
  const overCapacity = totalCargo > convoyCapacity;
  const stockForPricing = { ...tradableStocks } as Record<ResourceId, number>;
  const estimatedRevenue =
    hasCargo && isOwn
      ? Math.floor(resolveSale(stockForPricing, cargo, priceContext).revenue * (1 - taxRate))
      : 0;

  const budget = Math.floor(Number(buyBudget));
  const validBudget = Number.isFinite(budget) && budget > 0;
  const estimatedPurchase =
    validBudget && isOwn
      ? resolvePurchase(stockForPricing, buyResource, budget / (1 + taxRate), Infinity, priceContext)
      : null;

  const canTrade = allowed && activeColony && jumps >= 0;

  return (
    <Panel title={`◆ ${name}${ownerName ? ` — ${ownerName}` : ""}`}>
      {jumps >= 0 && (
        <p className="small muted">
          {jumps} saut{jumps > 1 ? "s" : ""} — {formatDuration(eta)} — frais {fee} crédits par
          convoi
        </p>
      )}
      {!isOwn && (
        <p className="small muted">
          Accès : {STATION_MARKET_ACCESS_LABELS[access].name}
          {taxRate > 0 ? ` · taxe ${Math.round(taxRate * 100)} %` : ""}
        </p>
      )}
      {!allowed && (
        <p className="small ko">
          Accès refusé — politique de marché : {STATION_MARKET_ACCESS_LABELS[access].name}.
        </p>
      )}

      {hasResourceMarket ? (
        <Table
          columns={
            [
              { key: "res", label: "Ressource", render: (_, res) => RESOURCE_LABELS[res] },
              {
                key: "stock",
                label: "Stock",
                align: "right",
                render: (_, res) => Math.floor(tradableStocks[res] ?? 0),
              },
              {
                key: "price",
                label: "Prix",
                align: "right",
                trend: (res) => {
                  const gap =
                    tradingPostPrice(res, tradableStocks[res] ?? 0, priceContext) /
                      BASE_PRICES[res] -
                    1;
                  return gap > 0.15 ? "up" : gap < -0.15 ? "down" : undefined;
                },
                render: (_, res) => {
                  const price = tradingPostPrice(res, tradableStocks[res] ?? 0, priceContext);
                  const gap = price / BASE_PRICES[res] - 1;
                  return `${price.toFixed(2)} (${gap >= 0 ? "+" : ""}${Math.round(gap * 100)} %)`;
                },
              },
            ] satisfies TableColumn<MarketResource>[]
          }
          rows={MARKET_RESOURCES}
        />
      ) : (
        <p className="muted small">Aucun marché de ressources sur cette station.</p>
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
                <span className="muted">{formatDuration(m.arrivesAt - now)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canTrade && hasResourceMarket && (
        <>
          <SectionTitle>Vendre</SectionTitle>
          <div className="form-stack">
            {MARKET_RESOURCES.map((res) => (
              <NumberInput
                key={res}
                label={`${RESOURCE_LABELS[res]} (orbite : ${Math.floor(activeColony.orbitalResources[res] ?? 0)})`}
                min={0}
                max={Math.floor(activeColony.orbitalResources[res] ?? 0)}
                value={sellAmounts[res] ?? ""}
                placeholder="0"
                onChange={(e) => setSellAmounts({ ...sellAmounts, [res]: e.target.value })}
              />
            ))}
            <span className={`small ${overCapacity ? "ko" : "muted"}`}>
              Soute disponible : {convoyCapacity}
              {overCapacity ? ` — cargaison trop lourde (${totalCargo})` : ""}
            </span>
            {hasCargo && !overCapacity && isOwn && (
              <span className="small ok">
                Revenu estimé net de taxe : ~{estimatedRevenue} crédits
              </span>
            )}
            <Button
              disabled={!hasCargo || overCapacity || convoyCapacity === 0}
              onClick={() => {
                send({
                  type: "sell",
                  colonyId: activeColony.id,
                  venueId: id,
                  venueKind: "station",
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
              options={MARKET_RESOURCES.map((res) => ({ value: res, label: RESOURCE_LABELS[res] }))}
            />
            <NumberInput
              label="Budget (crédits, taxe comprise)"
              min={0}
              value={buyBudget}
              placeholder="0"
              onChange={(e) => setBuyBudget(e.target.value)}
            />
            {estimatedPurchase && estimatedPurchase.bought > 0 && (
              <span className="small ok">
                ~{estimatedPurchase.bought} {RESOURCE_LABELS[buyResource]} (au prix actuel)
              </span>
            )}
            <Button
              disabled={!validBudget || activeColony.resources.credits < budget + fee}
              title={
                activeColony.resources.credits < budget + fee
                  ? "Crédits insuffisants (budget + frais)"
                  : ""
              }
              onClick={() => {
                send({
                  type: "buy",
                  colonyId: activeColony.id,
                  venueId: id,
                  venueKind: "station",
                  resource: buyResource,
                  budget,
                });
                setBuyBudget("");
              }}
            >
              Envoyer le convoi d'achat
            </Button>
          </div>
        </>
      )}

      {canTrade && hasBlueprintMarket && (
        <BlueprintMarket
          activeColony={activeColony}
          venueId={id}
          venueKind="station"
          blueprints={blueprints}
          routes={routes}
          send={send}
        />
      )}
    </Panel>
  );
}
