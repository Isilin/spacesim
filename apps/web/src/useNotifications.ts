import {
  allSystems,
  FACTIONS,
  type Colony,
  type FactionId,
  type GameState,
  type Mission,
  type TechId,
  type Transfer,
  type Universe,
} from "@spacesim/shared";
import { useEffect, useRef, useState } from "react";
import { BUILDING_LABELS, repTierName, TECH_LABELS } from "./labels.js";

export interface Notification {
  id: number;
  text: string;
}

const DISPLAY_MS = 6000;

interface Snapshot {
  game: GameState | null;
  colonies: Colony[];
  transfers: Transfer[];
  missions: Mission[];
  exploredSystemIds: string[];
  universe: Universe | null;
  battleCount: number;
}

/** Détecte les événements entre deux états serveur et les transforme en toasts. */
export function useNotifications(snapshot: Snapshot): Notification[] {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const previous = useRef<Snapshot | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    const prev = previous.current;
    previous.current = snapshot;
    if (!prev || !prev.game || !snapshot.game) return;

    const texts: string[] = [];

    for (const techId of snapshot.game.researched) {
      if (!prev.game.researched.includes(techId)) {
        texts.push(`Recherche terminée : ${TECH_LABELS[techId as TechId]?.name ?? techId}`);
      }
    }

    for (const colony of snapshot.colonies) {
      if (!prev.colonies.some((c) => c.id === colony.id)) {
        texts.push(`Colonie fondée : ${colony.name}`);
      }
    }

    for (const systemId of snapshot.exploredSystemIds) {
      if (!prev.exploredSystemIds.includes(systemId)) {
        const name = snapshot.universe
          ? allSystems(snapshot.universe).find((s) => s.id === systemId)?.name ?? systemId
          : systemId;
        // Le premier système (colonie mère) ne mérite pas de toast.
        if (prev.exploredSystemIds.length > 0) texts.push(`Système exploré : ${name}`);
      }
    }

    for (const prevColony of prev.colonies) {
      const current = snapshot.colonies.find((c) => c.id === prevColony.id);
      if (!current) continue;
      for (const item of prevColony.queue) {
        const stillQueued = current.queue.some(
          (q) => q.buildingId === item.buildingId && q.startedAt === item.startedAt,
        );
        const built = (current.buildings[item.buildingId] ?? 0) > (prevColony.buildings[item.buildingId] ?? 0);
        if (!stillQueued && built) {
          texts.push(
            `Construction terminée : ${BUILDING_LABELS[item.buildingId].name} (${current.name})`,
          );
        }
      }
    }

    for (const transfer of prev.transfers) {
      if (!snapshot.transfers.some((t) => t.id === transfer.id)) {
        const to = snapshot.colonies.find((c) => c.id === transfer.toColonyId);
        texts.push(`Convoi livré : ${to?.name ?? "destination inconnue"}`);
      }
    }

    for (const mission of prev.missions) {
      if (snapshot.missions.some((m) => m.id === mission.id)) continue;
      if (mission.kind === "sell") {
        texts.push("Cargaison vendue — crédits encaissés");
      } else if (mission.kind === "buy_return") {
        const colony = snapshot.colonies.find((c) => c.id === mission.fromColonyId);
        texts.push(`Cargaison achetée livrée${colony ? ` : ${colony.name}` : ""}`);
      } else if (mission.kind === "build_outpost") {
        texts.push("Avant-poste minier opérationnel");
      } else if (mission.kind === "contribute_gateway") {
        texts.push("Contribution livrée au chantier de portail");
      }
    }

    // Revendication perdue (entretien impayé) ou palier de réputation franchi.
    for (const systemId of prev.game.claimedSystemIds) {
      if (!snapshot.game.claimedSystemIds.includes(systemId)) {
        const name = snapshot.universe
          ? allSystems(snapshot.universe).find((s) => s.id === systemId)?.name ?? systemId
          : systemId;
        texts.push(`Revendication perdue : ${name}`);
      }
    }
    for (const [factionId, rep] of Object.entries(snapshot.game.factionRep)) {
      const prevRep = prev.game.factionRep[factionId] ?? 0;
      if (repTierName(rep) !== repTierName(prevRep) && rep > prevRep) {
        texts.push(
          `Réputation : ${FACTIONS[factionId as FactionId]?.name ?? factionId} — ${repTierName(rep)}`,
        );
      }
    }

    if (snapshot.battleCount > prev.battleCount) {
      texts.push("Bataille résolue — voir l'onglet Flottes");
    }

    if (texts.length === 0) return;
    const created = texts.map((text) => ({ id: nextId.current++, text }));
    setNotifications((list) => [...list, ...created]);
    // Pas de cleanup : l'effet se rejoue à chaque tick, un cleanup annulerait l'expiration.
    window.setTimeout(() => {
      setNotifications((list) => list.filter((n) => !created.some((c) => c.id === n.id)));
    }, DISPLAY_MS);
  }, [
    snapshot.game,
    snapshot.colonies,
    snapshot.transfers,
    snapshot.missions,
    snapshot.exploredSystemIds,
    snapshot.battleCount,
  ]);

  return notifications;
}
