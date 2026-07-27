import {
  clampContractDuration,
  contractAcceptable,
  contractEscrow,
  convoyDurationMs,
  convoyFees,
  convoyFuel,
  isContractExpired,
  jumpDistanceInUniverse,
  gatewayLinks,
  MARKET_RESOURCES,
  MAX_OPEN_CONTRACTS_PER_EMPIRE,
  takeFromOrbit,
  transferDurationMs,
  type Colony,
  type Contract,
  type Mission,
  type ResourceId,
  type ShipId,
} from "@spacesim/shared";
import { randomUUID } from "node:crypto";
import type { Empire } from "../../empire.js";
import type { GameRuntime } from "../game-runtime.js";
import type { Logger } from "../logger.js";
import { ContractRepository } from "../repositories/contract-repository.js";

/**
 * Contrats de fourniture (chantier 14/15) : publication, acceptation (affrètement
 * du convoi), annulation, expiration. `reserveShip`/`insertMission` restent la
 * propriété de Logistics — injectés ici comme callbacks, à l'identique du patron
 * déjà en place. Publié aussi par les PNJ (`MarketService`) et les factions en
 * pénurie (`FactionService`, futur découpage) via `postContract` en méthode publique.
 */
export class ContractService {
  private readonly repo: ContractRepository;

  constructor(
    private readonly runtime: GameRuntime,
    private readonly notify: () => void,
    private readonly logger: Logger,
    private readonly persistColony: (colony: Colony) => void,
    private readonly reserveShip: (
      empire: Empire,
      colony: Colony,
      busyUntil: number,
    ) => { colony: Colony; shipId: ShipId; capacity: number } | null,
    private readonly insertMission: (
      empire: Empire,
      kind: Mission["kind"],
      fromColonyId: string,
      targetId: string,
      durationMs: number,
      extras?: Pick<Mission, "cargo" | "budget" | "buyResource" | "capacity" | "contractId">,
      departedAt?: number,
    ) => void,
  ) {
    this.repo = new ContractRepository(runtime.clock.id);
  }

  private get portalLinks(): [string, string][] {
    return gatewayLinks(this.runtime.universe, [...this.runtime.gatewayMap.values()]);
  }

  /**
   * Nombre de portails empruntés entre deux systèmes (chantier 12). Tous les portails
   * partent de l'ancrage de la galaxie d'origine : rejoindre une galaxie lointaine en
   * traverse un, passer d'une lointaine à une autre en traverse deux.
   */
  private portalsCrossed(fromSystemId: string, toSystemId: string): number {
    const from = this.runtime.galaxyIndexOfSystem.get(fromSystemId);
    const to = this.runtime.galaxyIndexOfSystem.get(toSystemId);
    if (from === undefined || to === undefined || from === to) return 0;
    return from === 0 || to === 0 ? 1 : 2;
  }

  /**
   * Publie un contrat — crédits mis sous séquestre jusqu'à expiration/annulation.
   * Public : appelé par un joueur, mais aussi par l'IA PNJ et les factions en pénurie
   * (elles construisent l'objet `Contract` elles-mêmes et l'insèrent directement via
   * `insertContract`/`this.runtime.contractMap` — seul ce chemin joueur passe ici).
   */
  postContract(
    empire: Empire,
    colonyId: string,
    resource: ResourceId,
    quantity: number,
    pricePerUnit: number,
    durationMs: number,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    if (!(MARKET_RESOURCES as readonly string[]).includes(resource)) {
      return `Ressource non contractualisable : ${resource}`;
    }
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) return "Quantité invalide";
    const price = Number(pricePerUnit);
    if (!Number.isFinite(price) || price <= 0) return "Prix invalide";

    const openCount = [...this.runtime.contractMap.values()].filter(
      (c) => c.issuerId === empire.id && c.status === "open",
    ).length;
    if (openCount >= MAX_OPEN_CONTRACTS_PER_EMPIRE) return "Trop de contrats ouverts (dix au plus)";

    const escrow = contractEscrow(qty, price);
    if (colony.resources.credits < escrow) return `Crédits insuffisants (séquestre : ${escrow})`;

    const planet = this.runtime.planetsById.get(colony.planetId);
    if (!planet) return "Planète inconnue";

    const now = Date.now();
    const contract: Contract = {
      id: randomUUID(),
      issuerId: empire.id,
      issuerName: empire.name,
      issuerColor: empire.color,
      colonyId: colony.id,
      colonyName: colony.name,
      systemId: planet.systemId,
      resource,
      quantity: qty,
      remaining: qty,
      pricePerUnit: price,
      createdAt: now,
      deadline: now + clampContractDuration(Number(durationMs)),
      status: "open",
    };
    const resources = { ...colony.resources, credits: colony.resources.credits - escrow };
    empire.colonyMap.set(colony.id, { ...colony, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);
    this.runtime.contractMap.set(contract.id, contract);
    this.insertContract(contract);
    this.notify();
    return null;
  }

  /** Action joueur : accepter (tout ou partie d')un contrat étranger et affréter le convoi. */
  acceptContract(
    empire: Empire,
    colonyId: string,
    contractId: string,
    quantity: number,
  ): string | null {
    const colony = empire.colonyMap.get(colonyId);
    if (!colony) return "Colonie inconnue";
    const contract = this.runtime.contractMap.get(contractId);
    if (!contract) return "Contrat inconnu";
    if (contract.issuerId === empire.id) return "Impossible d'accepter son propre contrat";

    const now = Date.now();
    const qty = Math.floor(Number(quantity));
    if (!contractAcceptable(contract, qty, now)) return "Contrat indisponible pour cette quantité";

    const fromPlanet = this.runtime.planetsById.get(colony.planetId);
    if (!fromPlanet) return "Planète inconnue";
    const jumps = jumpDistanceInUniverse(
      this.runtime.universe,
      fromPlanet.systemId,
      contract.systemId,
      this.portalLinks,
    );
    if (jumps < 0) return "Colonie destinataire inaccessible";
    const portals = this.portalsCrossed(fromPlanet.systemId, contract.systemId);

    const cargo: Partial<Record<ResourceId, number>> = { [contract.resource]: qty };
    const loaded = takeFromOrbit(colony, cargo);
    if (!loaded) return `Stock orbital insuffisant : ${contract.resource}`;

    const speed = empire.effects.transferSpeedMult;
    const one = this.reserveShip(empire, loaded, now + 2 * transferDurationMs(jumps) * speed);
    if (!one) return "Convoi indisponible : vaisseaux manquants";
    const reserved = { colony: one.colony, ships: { [one.shipId]: 1 }, capacity: one.capacity };
    if (qty > reserved.capacity)
      return `Cargaison trop lourde pour ce convoi (soute : ${reserved.capacity})`;

    const duration = convoyDurationMs(jumps, reserved.ships) * speed;
    const fee = convoyFees(jumps, portals);
    const fuel = Math.ceil(convoyFuel(jumps, reserved.ships, qty) * empire.effects.fuelMult);
    const resources = { ...reserved.colony.resources };
    if (resources.credits < fee) return `Crédits insuffisants (frais : ${fee})`;
    const fueled = takeFromOrbit(reserved.colony, { energy: fuel });
    if (!fueled) return `Carburant insuffisant en orbite (${fuel} énergie)`;
    resources.credits -= fee;

    empire.colonyMap.set(colony.id, { ...fueled, resources });
    this.persistColony(empire.colonyMap.get(colony.id)!);

    // Décompté à l'acceptation (pas à la livraison) : bloque toute survente pendant le trajet.
    const remaining = contract.remaining - qty;
    const nextContract: Contract = {
      ...contract,
      remaining,
      status: remaining <= 0 ? "fulfilled" : "open",
    };
    this.runtime.contractMap.set(contract.id, nextContract);
    this.persistContract(nextContract);

    this.insertMission(
      empire,
      "deliver_contract",
      colonyId,
      contract.colonyId,
      duration,
      { cargo, contractId: contract.id },
      now,
    );
    this.notify();
    return null;
  }

  /** Action joueur : annuler son propre contrat — rembourse le séquestre du reliquat non honoré. */
  cancelContract(empire: Empire, contractId: string): string | null {
    const contract = this.runtime.contractMap.get(contractId);
    if (!contract) return "Contrat inconnu";
    if (contract.issuerId !== empire.id) return "Seul l'émetteur peut annuler ce contrat";
    if (contract.status !== "open") return "Contrat déjà clos";

    const colony = empire.colonyMap.get(contract.colonyId);
    if (colony) {
      const refund = contractEscrow(contract.remaining, contract.pricePerUnit);
      const resources = { ...colony.resources, credits: colony.resources.credits + refund };
      empire.colonyMap.set(colony.id, { ...colony, resources });
      this.persistColony(empire.colonyMap.get(colony.id)!);
    }
    const next: Contract = { ...contract, status: "cancelled" };
    this.runtime.contractMap.set(contract.id, next);
    this.persistContract(next);
    this.notify();
    return null;
  }

  async loadContracts(): Promise<void> {
    for (const contract of await this.repo.loadAll()) {
      this.runtime.contractMap.set(contract.id, contract);
    }
  }

  /** Public : les émetteurs PNJ/faction (MarketService) construisent leur propre Contract. */
  insertContract(contract: Contract): void {
    this.repo.insert(contract);
  }

  /** Ne met à jour que ce qui bouge après publication : reliquat, statut, échéance. */
  persistContract(contract: Contract): void {
    this.repo.save(contract);
  }

  /** Expire les contrats dépassés et rembourse le séquestre du reliquat non honoré. */
  resolveContracts(t: number): void {
    for (const [id, contract] of this.runtime.contractMap) {
      if (contract.status !== "open" || !isContractExpired(contract, t)) continue;
      const issuer = this.runtime.empires.get(contract.issuerId);
      const colony = issuer?.colonyMap.get(contract.colonyId);
      if (issuer && colony) {
        const refund = contractEscrow(contract.remaining, contract.pricePerUnit);
        const resources = { ...colony.resources, credits: colony.resources.credits + refund };
        issuer.colonyMap.set(colony.id, { ...colony, resources });
        this.persistColony(issuer.colonyMap.get(colony.id)!);
      }
      const next: Contract = { ...contract, status: "expired" };
      this.runtime.contractMap.set(id, next);
      this.persistContract(next);
    }
  }
}
