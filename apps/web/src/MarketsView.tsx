import {
  allTradingPosts,
  allSystems,
  BASE_PRICES,
  convoyFees,
  convoyFuel,
  findGalaxyOfSystem,
  jumpDistanceInUniverse,
  MARKET_RESOURCES,
  tradingPostPrice,
  type Colony,
  type MarketResource,
  type TradingPostMarket,
  type Universe,
} from "@spacesim/shared";
import { useMemo, useState } from "react";
import { Panel, Select, Stat, Table, type TableColumn } from "@spacesim/ui";
import { RESOURCE_LABELS } from "./labels.js";

interface Props {
  universe: Universe;
  markets: TradingPostMarket[];
  colonies: Colony[];
  /** Colonie de référence pour les distances et les marges. */
  activeColony: Colony | null;
  exploredSystemIds: string[];
  portalLinks: [string, string][];
}

/** Convoi de référence du comparateur : un cargo léger plein. */
const REFERENCE_LOT = 200;
const REFERENCE_CONVOY = { cargo_small: 1 } as const;

/**
 * Comparateur de marchés (chantier 12) : sans lui, les prix régionaux ne seraient
 * qu'un bruit invisible — c'est ce tableau qui transforme l'écart de prix en décision.
 * Ne montre que les comptoirs déjà découverts.
 */
export function MarketsView({
  universe,
  markets,
  colonies,
  activeColony,
  exploredSystemIds,
  portalLinks,
}: Props) {
  const [resource, setResource] = useState<MarketResource>("components");

  const fromSystem = useMemo(() => {
    if (!activeColony) return undefined;
    return allSystems(universe).find((s) => s.planets.some((p) => p.id === activeColony.planetId))
      ?.id;
  }, [universe, activeColony]);

  const rows = useMemo(() => {
    const explored = new Set(exploredSystemIds);
    const marketById = new Map(markets.map((m) => [m.tradingPostId, m]));
    return allTradingPosts(universe)
      .filter((post) => explored.has(post.systemId) && marketById.has(post.id))
      .map((post) => {
        const market = marketById.get(post.id)!;
        const galaxy = findGalaxyOfSystem(universe, post.systemId);
        const galaxyIndex = universe.galaxies.findIndex((g) => g.id === galaxy?.id);
        const price = tradingPostPrice(resource, market.stocks[resource], {
          venueId: post.id,
          galaxyIndex,
          factionId: post.factionId,
        });
        const jumps = fromSystem
          ? jumpDistanceInUniverse(universe, fromSystem, post.systemId, portalLinks)
          : -1;
        const portals =
          galaxyIndex > 0 && fromSystem && !fromSystem.startsWith(`${galaxy?.id}-`) ? 1 : 0;
        // Marge d'un lot de référence, nette des frais et du carburant du voyage.
        const gross = price * REFERENCE_LOT;
        const fees = jumps >= 0 ? convoyFees(jumps, portals) : 0;
        const fuel = jumps >= 0 ? convoyFuel(jumps, REFERENCE_CONVOY, REFERENCE_LOT) : 0;
        return {
          post,
          galaxyName: galaxy?.name ?? "?",
          stock: market.stocks[resource],
          price,
          jumps,
          fees,
          fuel,
          net: jumps >= 0 ? Math.round(gross - fees) : null,
        };
      })
      .sort((a, b) => b.price - a.price);
  }, [universe, markets, exploredSystemIds, resource, fromSystem, portalLinks]);

  const best = rows[0];
  type MarketRow = (typeof rows)[number];
  const gapOf = (row: MarketRow) => row.price / BASE_PRICES[resource] - 1;

  const columns: TableColumn<MarketRow>[] = [
    {
      key: "post",
      label: "Comptoir",
      render: (_, row) => (row.post.id === best?.post.id ? `★ ${row.post.name}` : row.post.name),
    },
    { key: "galaxyName", label: "Galaxie" },
    { key: "stock", label: "Stock", align: "right", render: (_, row) => Math.floor(row.stock) },
    {
      key: "price",
      label: "Prix",
      align: "right",
      render: (_, row) => row.price.toFixed(2),
      trend: (row) => (gapOf(row) > 0.15 ? "up" : gapOf(row) < -0.15 ? "down" : undefined),
    },
    {
      key: "gap",
      label: "Écart",
      align: "right",
      render: (_, row) => `${gapOf(row) >= 0 ? "+" : ""}${Math.round(gapOf(row) * 100)} %`,
      trend: (row) => (gapOf(row) >= 0 ? "up" : "down"),
    },
    {
      key: "jumps",
      label: "Distance",
      render: (_, row) => (row.jumps >= 0 ? `${row.jumps} sauts` : "hors portée"),
    },
    {
      key: "fees",
      label: "Frais + carburant",
      render: (_, row) => (row.jumps >= 0 ? `${row.fees} cr · ${row.fuel} én.` : "—"),
    },
    {
      key: "net",
      label: `Lot de ${REFERENCE_LOT} net`,
      align: "right",
      render: (_, row) => (row.net === null ? "—" : `${row.net} cr`),
    },
  ];

  return (
    <Panel title="Comparateur de marchés">
      <div className="research-header">
        <Select
          label="Ressource"
          value={resource}
          onChange={(e) => setResource(e.target.value as MarketResource)}
          options={MARKET_RESOURCES.map((res) => ({ value: res, label: RESOURCE_LABELS[res] }))}
        />
        <Stat label="Prix de référence" value={BASE_PRICES[resource]} />
        {activeColony && <Stat label="Depuis" value={activeColony.name} />}
      </div>

      {rows.length === 0 ? (
        <p className="muted">
          Aucun comptoir découvert. Explorez des systèmes pour comparer les marchés.
        </p>
      ) : (
        <Table columns={columns} rows={rows} />
      )}

      <p className="small muted">
        Le prix d'un comptoir dépend de son stock, de son biais local et de l'éloignement de sa
        galaxie : les anneaux lointains paient cher le manufacturé et bradent le brut. La colonne «
        net » retranche les frais du voyage pour un cargo léger plein.
      </p>
    </Panel>
  );
}
