import type {
  ClientMessage,
  Colony,
  EmpireEffects,
  MiningOutpost,
  Route,
  StationMarket,
  Transfer,
  Universe,
} from "@spacesim/shared";
import { useState } from "react";
import { MarketsView } from "./MarketsView.js";
import { OrbitPanel } from "./OrbitPanel.js";
import { RoutesView } from "./RoutesView.js";
import { TransferPanel } from "./TransferPanel.js";

interface Props {
  routes: Route[];
  colonies: Colony[];
  /** Colonie active : origine des convois, cible du panneau orbite. */
  colony: Colony | null;
  transfers: Transfer[];
  universe: Universe;
  exploredSystemIds: string[];
  outposts: MiningOutpost[];
  markets: StationMarket[];
  effects: EmpireEffects;
  portalLinks: [string, string][];
  now: number;
  send: (msg: ClientMessage) => void;
}

type Tab = "routes" | "convoys" | "orbit" | "markets";

const TAB_LABELS: Record<Tab, string> = {
  routes: "Routes",
  convoys: "Convois",
  orbit: "Orbite",
  markets: "Marchés",
};

/**
 * Tout ce qui touche à l'acheminement au même endroit (chantier 12) : routes
 * automatiques, convois ponctuels, ascenseur orbital et comparateur de marchés.
 */
export function LogisticsView({
  routes,
  colonies,
  colony,
  transfers,
  universe,
  exploredSystemIds,
  outposts,
  markets,
  effects,
  portalLinks,
  now,
  send,
}: Props) {
  const [tab, setTab] = useState<Tab>("routes");

  return (
    <div className="logistics-view">
      <nav className="tabs logistics-tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map((id) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {TAB_LABELS[id]}
          </button>
        ))}
      </nav>

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
      ) : (
        <MarketsView
          universe={universe}
          markets={markets}
          colonies={colonies}
          activeColony={colony}
          exploredSystemIds={exploredSystemIds}
          portalLinks={portalLinks}
        />
      )}
    </div>
  );
}
