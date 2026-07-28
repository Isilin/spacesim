import type { EmpireEffects } from "@spacesim/shared";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs } from "@spacesim/ui";
import { ContractsView } from "./ContractsView.js";
import { MarketsView } from "./MarketsView.js";
import { OrbitPanel } from "./OrbitPanel.js";
import { RoutesView } from "./RoutesView.js";
import { TransferPanel } from "./TransferPanel.js";
import { useGameStore } from "./state/game-store.js";
import { selectActiveColony } from "./state/selectors.js";

interface Props {
  effects: EmpireEffects;
  portalLinks: [string, string][];
  now: number;
}

type Tab = "routes" | "convoys" | "orbit" | "markets" | "contracts";

const TAB_LABELS: Record<Tab, string> = {
  routes: "Routes",
  convoys: "Convois",
  orbit: "Orbite",
  markets: "Marchés",
  contracts: "Contrats",
};

/**
 * Tout ce qui touche à l'acheminement au même endroit (chantier 12) : routes
 * automatiques, convois ponctuels, ascenseur orbital et comparateur de marchés.
 */
export function LogisticsView({ effects, portalLinks, now }: Props) {
  const [searchParams] = useSearchParams();
  const colony = useGameStore(selectActiveColony(searchParams.get("colony")));
  const {
    routes,
    colonies,
    transfers,
    universe,
    exploredSystemIds,
    outposts,
    markets,
    contracts,
    playerId,
    send,
  } = useGameStore();
  const [tab, setTab] = useState<Tab>("routes");

  if (!universe) return null;

  return (
    <div className="logistics-view">
      <Tabs
        items={(Object.keys(TAB_LABELS) as Tab[]).map((id) => ({
          value: id,
          label: TAB_LABELS[id],
        }))}
        active={tab}
        onChange={(value) => setTab(value as Tab)}
      />

      {tab === "routes" ? (
        <RoutesView
          routes={routes}
          colonies={colonies}
          universe={universe}
          exploredSystemIds={exploredSystemIds}
          outposts={outposts}
          now={now}
          send={send}
        />
      ) : tab === "convoys" ? (
        colony ? (
          <TransferPanel
            colony={colony}
            colonies={colonies}
            transfers={transfers}
            universe={universe}
            transferSpeedMult={effects.transferSpeedMult}
            routes={routes}
            portalLinks={portalLinks}
            now={now}
            send={send}
          />
        ) : (
          <p className="muted">Aucune colonie.</p>
        )
      ) : tab === "orbit" ? (
        colony ? (
          <OrbitPanel colony={colony} effects={effects} send={send} />
        ) : (
          <p className="muted">Aucune colonie.</p>
        )
      ) : tab === "markets" ? (
        <MarketsView
          universe={universe}
          markets={markets}
          colonies={colonies}
          activeColony={colony}
          exploredSystemIds={exploredSystemIds}
          portalLinks={portalLinks}
        />
      ) : (
        <ContractsView
          contracts={contracts}
          colony={colony}
          playerId={playerId}
          now={now}
          send={send}
        />
      )}
    </div>
  );
}
