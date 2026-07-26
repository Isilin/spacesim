import type { Contract } from "../../model/social.js";

/** Bornes de durée d'un contrat : ni instantané, ni éternel. */
export const CONTRACT_MIN_DURATION_MS = 5 * 60_000;
export const CONTRACT_MAX_DURATION_MS = 6 * 3_600_000;

/** Contrats ouverts qu'un même empire peut maintenir simultanément (évite le spam d'offres). */
export const MAX_OPEN_CONTRACTS_PER_EMPIRE = 10;

/** Ramène une durée demandée dans les bornes acceptées. */
export function clampContractDuration(durationMs: number): number {
  return Math.min(CONTRACT_MAX_DURATION_MS, Math.max(CONTRACT_MIN_DURATION_MS, durationMs));
}

/** Crédits mis sous séquestre à la publication — libérés au fil des livraisons ou au remboursement. */
export function contractEscrow(quantity: number, pricePerUnit: number): number {
  return Math.ceil(quantity * pricePerUnit);
}

/** Le contrat a-t-il dépassé son échéance ? */
export function isContractExpired(contract: Contract, now: number): boolean {
  return now >= contract.deadline;
}

/**
 * Le contrat peut-il encore être accepté pour cette quantité ? `remaining` est décrémenté
 * dès l'acceptation (pas à la livraison) pour empêcher plusieurs convois de survendre le
 * même reliquat pendant leur trajet.
 */
export function contractAcceptable(contract: Contract, quantity: number, now: number): boolean {
  return (
    contract.status === "open" &&
    !isContractExpired(contract, now) &&
    quantity > 0 &&
    quantity <= contract.remaining
  );
}

/** Paiement dû pour une livraison (partielle ou complète), au prix fixé à la publication. */
export function contractPayout(contract: Contract, quantity: number): number {
  return Math.floor(quantity * contract.pricePerUnit);
}
