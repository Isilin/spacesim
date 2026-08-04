import {
  allTradingPosts,
  allSystems,
  BASE_PRICES,
  canTradeAtStation,
  convoyFees,
  convoyFuel,
  findGalaxyOfSystem,
  hasResourceMarket,
  jumpDistanceInUniverse,
  MARKET_RESOURCES,
  tradingPostPrice,
  type Colony,
  type ForeignStation,
  type LeaderboardEntry,
  type MarketResource,
  type Station,
  type TradingPostMarket,
  type Universe,
} from "@spacesim/shared";
import { useMemo, useState } from "react";
import { Panel, Select, Stat, Table, type TableColumn } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { resourceLabel } from "./labels.js";

interface Props {
  universe: Universe;
  markets: TradingPostMarket[];
  colonies: Colony[];
  /** Colonie de référence pour les distances et les marges. */
  activeColony: Colony | null;
  exploredSystemIds: string[];
  portalLinks: [string, string][];
  /** Stations commerciales qualifiées (chantier 25) : les siennes + celles d'autres
   *  empires dont la politique de marché autorise le viewer. */
  stations: Station[];
  foreignStations: ForeignStation[];
  leaderboard: LeaderboardEntry[];
  playerId: string | null;
}

/** Convoi de référence du comparateur : un cargo léger plein. */
const REFERENCE_LOT = 200;
const REFERENCE_CONVOY = { cargo_small: 1 } as const;

interface MarketVenue {
  id: string;
  name: string;
  systemId: string;
  factionId?: string;
}

/**
 * Comparateur de marchés (chantier 12, étendu au chantier 25) : sans lui, les prix
 * régionaux ne seraient qu'un bruit invisible — c'est ce tableau qui transforme
 * l'écart de prix en décision. Ne montre que les comptoirs déjà découverts et les
 * stations commerciales qualifiées (marché de ressources + accès autorisé pour le
 * viewer) — sinon l'outil devient trompeur une fois les stations de joueur courantes.
 */
export function MarketsView({
  universe,
  markets,
  colonies,
  activeColony,
  exploredSystemIds,
  portalLinks,
  stations,
  foreignStations,
  leaderboard,
  playerId,
}: Props) {
  const { t } = useTranslation();
  const [resource, setResource] = useState<MarketResource>("components");

  const fromSystem = useMemo(() => {
    if (!activeColony) return undefined;
    return allSystems(universe).find((s) =>
      s.planets.some((p) => p.id === activeColony.planetId),
    )?.id;
  }, [universe, activeColony]);

  const venues = useMemo(() => {
    const explored = new Set(exploredSystemIds);
    const marketById = new Map(markets.map((m) => [m.tradingPostId, m]));
    const tradingPostVenues: { venue: MarketVenue; stock: number }[] =
      allTradingPosts(universe)
        .filter(
          (post) => explored.has(post.systemId) && marketById.has(post.id),
        )
        .map((post) => ({
          venue: {
            id: post.id,
            name: post.name,
            systemId: post.systemId,
            factionId: post.factionId,
          },
          stock: marketById.get(post.id)!.stocks[resource],
        }));

    const ownStationVenues: { venue: MarketVenue; stock: number }[] = stations
      .filter((s) => hasResourceMarket(s))
      .map((s) => ({
        venue: { id: s.id, name: s.name, systemId: s.systemId },
        stock: s.resources[resource],
      }));

    const foreignStationVenues: { venue: MarketVenue; stock: number }[] =
      foreignStations
        .filter((s) => {
          if (!s.market?.hasResourceMarket) return false;
          const relation =
            leaderboard.find((e) => e.id === s.ownerId)?.relation ?? "neutral";
          return canTradeAtStation(
            s.ownerId,
            playerId ?? "",
            s.market.access,
            relation,
          );
        })
        .map((s) => ({
          venue: {
            id: s.id,
            name: `${s.name} (${s.ownerName})`,
            systemId: s.systemId,
          },
          stock: s.market!.tradableStocks[resource] ?? 0,
        }));

    return [...tradingPostVenues, ...ownStationVenues, ...foreignStationVenues];
  }, [
    universe,
    markets,
    stations,
    foreignStations,
    leaderboard,
    playerId,
    exploredSystemIds,
    resource,
  ]);

  const rows = useMemo(() => {
    return venues
      .map(({ venue, stock }) => {
        const galaxy = findGalaxyOfSystem(universe, venue.systemId);
        const galaxyIndex = universe.galaxies.findIndex(
          (g) => g.id === galaxy?.id,
        );
        const price = tradingPostPrice(resource, stock, {
          venueId: venue.id,
          galaxyIndex,
          factionId: venue.factionId,
        });
        const jumps = fromSystem
          ? jumpDistanceInUniverse(
              universe,
              fromSystem,
              venue.systemId,
              portalLinks,
            )
          : -1;
        const portals =
          galaxyIndex > 0 &&
          fromSystem &&
          !fromSystem.startsWith(`${galaxy?.id}-`)
            ? 1
            : 0;
        // Marge d'un lot de référence, nette des frais et du carburant du voyage.
        const gross = price * REFERENCE_LOT;
        const fees = jumps >= 0 ? convoyFees(jumps, portals) : 0;
        const fuel =
          jumps >= 0 ? convoyFuel(jumps, REFERENCE_CONVOY, REFERENCE_LOT) : 0;
        return {
          venue,
          galaxyName: galaxy?.name ?? "?",
          stock,
          price,
          jumps,
          fees,
          fuel,
          net: jumps >= 0 ? Math.round(gross - fees) : null,
        };
      })
      .sort((a, b) => b.price - a.price);
  }, [venues, universe, resource, fromSystem, portalLinks]);

  const best = rows[0];
  type MarketRow = (typeof rows)[number];
  const gapOf = (row: MarketRow) => row.price / BASE_PRICES[resource] - 1;

  const columns: TableColumn<MarketRow>[] = [
    {
      key: "venue",
      label: t("marketsView.colVenue"),
      render: (_, row) =>
        row.venue.id === best?.venue.id
          ? `★ ${row.venue.name}`
          : row.venue.name,
    },
    { key: "galaxyName", label: t("marketsView.colGalaxy") },
    {
      key: "stock",
      label: t("marketsView.colStock"),
      align: "right",
      render: (_, row) => Math.floor(row.stock),
    },
    {
      key: "price",
      label: t("marketsView.colPrice"),
      align: "right",
      render: (_, row) => row.price.toFixed(2),
      trend: (row) =>
        gapOf(row) > 0.15 ? "up" : gapOf(row) < -0.15 ? "down" : undefined,
    },
    {
      key: "gap",
      label: t("marketsView.colGap"),
      align: "right",
      render: (_, row) =>
        `${gapOf(row) >= 0 ? "+" : ""}${Math.round(gapOf(row) * 100)} %`,
      trend: (row) => (gapOf(row) >= 0 ? "up" : "down"),
    },
    {
      key: "jumps",
      label: t("marketsView.colDistance"),
      render: (_, row) =>
        row.jumps >= 0
          ? t("marketsView.jumps", { jumps: row.jumps })
          : t("marketsView.outOfRange"),
    },
    {
      key: "fees",
      label: t("marketsView.colFees"),
      render: (_, row) =>
        row.jumps >= 0
          ? t("marketsView.feesFuel", { fees: row.fees, fuel: row.fuel })
          : "—",
    },
    {
      key: "net",
      label: t("marketsView.colNet", { lot: REFERENCE_LOT }),
      align: "right",
      render: (_, row) => (row.net === null ? "—" : `${row.net} cr`),
    },
  ];

  return (
    <Panel title={t("marketsView.title")}>
      <div className="research-header">
        <Select
          label={t("marketsView.resource")}
          value={resource}
          onChange={(e) => setResource(e.target.value as MarketResource)}
          options={MARKET_RESOURCES.map((res) => ({
            value: res,
            label: resourceLabel(res),
          }))}
        />
        <Stat
          label={t("marketsView.referencePrice")}
          value={BASE_PRICES[resource]}
        />
        {activeColony && (
          <Stat label={t("marketsView.from")} value={activeColony.name} />
        )}
      </div>

      {rows.length === 0 ? (
        <p className="muted">{t("marketsView.empty")}</p>
      ) : (
        <Table columns={columns} rows={rows} />
      )}

      <p className="small muted">{t("marketsView.hint")}</p>
    </Panel>
  );
}
