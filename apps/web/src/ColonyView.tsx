import {
  BUILDING_IDS,
  BUILDINGS,
  buildingBuildMs,
  buildingCost,
  canAfford,
  colonyRates,
  colonyShortages,
  orbitalCap,
  orbitalUsed,
  housing,
  MAX_QUEUE_LENGTH,
  popCap,
  storageCap,
  totalJobs,
  usedSlots,
  workforceEfficiency,
  TECHS,
  type ClientMessage,
  type Colony,
  type EmpireEffects,
  type Planet,
  type ResourceId,
  type Route,
  type TechId,
  type Transfer,
  type Universe,
} from "@spacesim/shared";
import { useEffect, useState } from "react";
import { formatDuration } from "./format.js";
import { BUILDING_LABELS, PLANET_TYPE_LABELS, RESOURCE_LABELS, TECH_LABELS } from "./labels.js";

import { ShipyardPanel } from "./ShipyardPanel.js";


interface Props {
  colony: Colony;
  planet: Planet;
  colonies: Colony[];
  transfers: Transfer[];
  universe: Universe;
  effects: EmpireEffects;
  routes: Route[];
  researched: readonly string[];
  portalLinks: [string, string][];
  send: (msg: ClientMessage) => void;
}

/** Tech qui débloque un bâtiment (pour l'affichage des verrous). */
function unlockingTech(buildingId: string): TechId | null {
  for (const tech of Object.values(TECHS)) {
    if (tech.effects.unlockBuildings?.includes(buildingId as never)) return tech.id;
  }
  return null;
}

const SHOWN_RESOURCES: ResourceId[] = [
  "ore",
  "energy",
  "food",
  "metals",
  "components",
  "goods",
  "credits",
  "science",
];


function formatCost(cost: Partial<Record<ResourceId, number>>): string {
  return Object.entries(cost)
    .map(([res, amount]) => `${amount} ${RESOURCE_LABELS[res as ResourceId]}`)
    .join(" · ");
}

/** Horloge locale pour les comptes à rebours (les timers font foi côté serveur). */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function ColonyView({
  colony,
  planet,
  colonies,
  transfers,
  universe,
  effects,
  routes,
  researched,
  portalLinks,
  send,
}: Props) {
  const now = useNow();
  const rates = colonyRates(colony, planet, effects);
  const slots = usedSlots(colony);
  const shortages = colonyShortages(colony);
  const pop = Math.floor(colony.population);
  const cap = popCap(colony, planet, effects);
  const jobs = totalJobs(colony);
  const employed = Math.min(pop, jobs);
  const efficiency = workforceEfficiency(colony);

  return (
    <div className="colony-view">
      <div className="colony-header">
        <h2>{colony.name}</h2>
        <span className="muted">
          {planet.name} — {PLANET_TYPE_LABELS[planet.type]} · Habitabilité {planet.habitability} ·{" "}
          Emplacements {slots}/{planet.slots}
        </span>
      </div>

      <div className="resource-bar">
        <div className="resource-cell">
          <span className="resource-name">Population</span>
          <span className="resource-stock">
            {pop}
            <span className="muted"> / {cap}</span>
          </span>
          <span className={`resource-rate ${colony.satisfaction >= 50 ? "ok" : "ko"}`}>
            Satisfaction {Math.round(colony.satisfaction)}
          </span>
        </div>
        <div className="resource-cell">
          <span className="resource-name">Emplois</span>
          <span className="resource-stock">
            {employed}
            <span className="muted"> / {jobs}</span>
          </span>
          <span className={`resource-rate ${efficiency >= 1 ? "ok" : "ko"}`}>
            Rendement {Math.round(efficiency * 100)} %
          </span>
        </div>
        <div className="resource-cell">
          <span className="resource-name">Logements</span>
          <span className="resource-stock">{housing(colony, effects)}</span>
          <span className={`resource-rate ${housing(colony, effects) >= pop ? "ok" : "ko"}`}>
            {housing(colony, effects) >= pop ? "suffisants" : "surpeuplés"}
          </span>
        </div>
        {SHOWN_RESOURCES.map((res) => {
          const cap = storageCap(colony, res, effects);
          const rate = rates[res];
          return (
            <div key={res} className="resource-cell">
              <span className="resource-name">{RESOURCE_LABELS[res]}</span>
              <span className="resource-stock">
                {Math.floor(colony.resources[res])}
                {Number.isFinite(cap) && <span className="muted"> / {cap}</span>}
              </span>
              <span className={`resource-rate ${rate > 0 ? "ok" : rate < 0 ? "ko" : "muted"}`}>
                {rate >= 0 ? "+" : ""}
                {Math.round(rate * 100) / 100}/tick
              </span>
            </div>
          );
        })}
      </div>

      <div className="colony-columns">
        <section className="buildings-panel">
          <h3>Bâtiments</h3>
          <ul className="building-list">
            {BUILDING_IDS.map((id) => {
              const def = BUILDINGS[id];
              const locked = !effects.unlockedBuildings.has(id);
              if (locked) {
                const tech = unlockingTech(id);
                return (
                  <li key={id} className="building locked">
                    <div className="building-info">
                      <div className="building-head">
                        <strong className="muted">{BUILDING_LABELS[id].name}</strong>
                        <span className="muted small">🔒 verrouillé</span>
                      </div>
                      <span className="muted small">
                        Requiert : {tech ? TECH_LABELS[tech].name : "technologie inconnue"}
                      </span>
                    </div>
                  </li>
                );
              }
              const count = colony.buildings[id] ?? 0;
              const queued = colony.queue.filter((q) => q.buildingId === id).length;
              const cost = buildingCost(def);
              const affordable = canAfford(colony, cost);
              const queueFull = colony.queue.length >= MAX_QUEUE_LENGTH + effects.queueBonus;
              const slotsFull = slots >= planet.slots;
              const disabled = !affordable || queueFull || slotsFull;
              return (
                <li key={id} className="building">
                  <div className="building-info">
                    <div className="building-head">
                      <strong>{BUILDING_LABELS[id].name}</strong>
                      <span className="level">×{count}{queued > 0 ? ` (+${queued})` : ""}</span>
                      {shortages.some((s) => s.buildingId === id) && (
                        <span className="shortage" title="Intrants manquants : bâtiment à l'arrêt">
                          ⚠ pénurie
                        </span>
                      )}
                    </div>
                    <span className="muted small">{BUILDING_LABELS[id].description}</span>
                    <span className="small">
                      {formatCost(cost)} — {formatDuration(buildingBuildMs(def))} l'instance
                    </span>
                  </div>
                  <button
                    disabled={disabled}
                    title={
                      queueFull
                        ? "File pleine"
                        : slotsFull
                          ? "Plus d'emplacements"
                          : !affordable
                            ? "Ressources insuffisantes"
                            : ""
                    }
                    onClick={() => send({ type: "build", colonyId: colony.id, buildingId: id })}
                  >
                    Construire
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="queue-panel">
          <h3>
            File de construction{" "}
            <span className="muted small">
              {colony.queue.length}/{MAX_QUEUE_LENGTH + effects.queueBonus}
            </span>
          </h3>
          {colony.queue.length === 0 ? (
            <p className="muted">Aucune construction en cours.</p>
          ) : (
            <ul className="queue-list">
              {colony.queue.map((item, i) => {
                const total = item.finishesAt - item.startedAt;
                const progress =
                  now < item.startedAt ? 0 : Math.min(1, (now - item.startedAt) / total);
                return (
                  <li key={`${item.buildingId}-${item.startedAt}`} className="queue-item">
                    <div className="queue-head">
                      <span>{BUILDING_LABELS[item.buildingId].name}</span>
                      <span className="muted">
                        {now < item.startedAt && i > 0
                          ? "en attente"
                          : formatDuration(item.finishesAt - now)}
                      </span>
                    </div>
                    <div className="progress">
                      <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <ShipyardPanel
            colony={colony}
            routes={routes}
            researched={researched}
            now={now}
            send={send}
          />

          {/* Convois, ascenseur orbital et marchés vivent dans l'onglet Logistique
              (chantier 12D) : cette vue reste centrée sur la production au sol. */}
          <p className="small muted colony-logistics-hint">
            Soute orbitale : {Math.floor(orbitalUsed(colony))}/{orbitalCap(colony, effects)} —
            réglages et convois dans l'onglet Logistique.
          </p>
        </section>
      </div>
    </div>
  );
}
