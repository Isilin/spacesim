import type { FactionDef } from "../content/factions.js";
import type { Rng } from "../rng.js";
import type { ResourceId } from "../types.js";

/** Ressources échangeables en station (la science et les crédits restent hors marché). */
export const MARKET_RESOURCES = ["ore", "energy", "food", "metals", "goods", "components"] as const;

export type MarketResource = (typeof MARKET_RESOURCES)[number];

/** Prix de base (crédits/unité) au stock cible. */
export const BASE_PRICES: Record<MarketResource, number> = {
  ore: 1,
  energy: 1,
  food: 1.5,
  metals: 4,
  goods: 5,
  components: 12,
};

/** Stock cible d'une station par ressource : au-dessus le prix baisse, en-dessous il monte. */
export const TARGET_STOCK = 800;

/** Bornes du multiplicateur de prix. */
export const PRICE_MULT_MIN = 0.4;
export const PRICE_MULT_MAX = 2.5;

/** Plafond de stock PNJ (évite l'accumulation infinie par dumping). */
export const MAX_STOCK = TARGET_STOCK * 3;

/** Un tick économique toutes les N ticks de simulation (~1 min à 5 s/tick). */
export const ECONOMY_TICK_TICKS = 12;

/** Retour lent des stocks vers la cible à chaque tick économique (arrière-pays PNJ). */
const DRIFT_RATE = 0.015;

export type Stocks = Record<ResourceId, number>;

/** Prix spot : base × (cible/stock)^0.7, borné. Stock bas → cher, plein → bradé. */
export function stationPrice(resource: MarketResource, stock: number): number {
  const ratio = TARGET_STOCK / Math.max(stock, 1);
  const mult = Math.min(PRICE_MULT_MAX, Math.max(PRICE_MULT_MIN, ratio ** 0.7));
  return Math.round(BASE_PRICES[resource] * mult * 100) / 100;
}

/** Stocks initiaux d'une station : autour de la cible, dispersion seedée. */
export function initialStocks(rng: Rng): Stocks {
  const stocks = { credits: 0, science: 0 } as Stocks;
  for (const res of MARKET_RESOURCES) {
    stocks[res] = Math.round(TARGET_STOCK * (0.6 + rng() * 0.8));
  }
  return stocks;
}

/**
 * Un tick économique : production/consommation du profil de faction,
 * retour lent vers la cible et bruit léger. Déterministe pour un rng donné.
 */
export function marketTick(stocks: Stocks, faction: FactionDef, rng: Rng): Stocks {
  const next = { ...stocks };
  for (const res of MARKET_RESOURCES) {
    let stock = next[res];
    stock += faction.produces[res] ?? 0;
    stock -= faction.consumes[res] ?? 0;
    stock += (TARGET_STOCK - stock) * DRIFT_RATE;
    stock *= 1 + (rng() - 0.5) * 0.04;
    next[res] = Math.min(MAX_STOCK, Math.max(0, Math.round(stock)));
  }
  return next;
}

/** Vente au spot : chaque unité vendue au prix courant (le prix baisse à mesure que le stock monte). */
export function resolveSale(
  stocks: Stocks,
  cargo: Partial<Record<ResourceId, number>>,
): { stocks: Stocks; revenue: number } {
  const next = { ...stocks };
  let revenue = 0;
  for (const [res, amount] of Object.entries(cargo) as [ResourceId, number][]) {
    if (!(MARKET_RESOURCES as readonly string[]).includes(res) || amount <= 0) continue;
    const resource = res as MarketResource;
    // Prix moyen entre l'état avant et après livraison : borne le farm sur les gros lots.
    const before = stationPrice(resource, next[resource]);
    const after = stationPrice(resource, Math.min(MAX_STOCK, next[resource] + amount));
    revenue += amount * ((before + after) / 2);
    next[resource] = Math.min(MAX_STOCK, next[resource] + amount);
  }
  return { stocks: next, revenue: Math.floor(revenue) };
}

/** Coût d'un lot au prix moyen avant/après retrait (symétrique de la vente). */
function purchaseCost(stocks: Stocks, resource: MarketResource, qty: number): number {
  const before = stationPrice(resource, stocks[resource]);
  const after = stationPrice(resource, Math.max(1, stocks[resource] - qty));
  return qty * ((before + after) / 2);
}

/** Achat au spot : la plus grande quantité tenant dans le budget, le stock et la soute. */
export function resolvePurchase(
  stocks: Stocks,
  resource: MarketResource,
  budget: number,
  maxQty = Infinity,
): { stocks: Stocks; bought: number; spent: number } {
  const available = Math.min(Math.floor(stocks[resource]), Math.floor(maxQty));
  if (available <= 0 || budget <= 0) return { stocks, bought: 0, spent: 0 };

  // Recherche binaire de la plus grande quantité dont le coût tient dans le budget
  // (le coût est croissant en quantité).
  let low = 0;
  let high = available;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (purchaseCost(stocks, resource, mid) <= budget) low = mid;
    else high = mid - 1;
  }
  if (low <= 0) return { stocks, bought: 0, spent: 0 };

  const spent = Math.ceil(purchaseCost(stocks, resource, low));
  const next = { ...stocks, [resource]: stocks[resource] - low };
  return { stocks: next, bought: low, spent };
}
