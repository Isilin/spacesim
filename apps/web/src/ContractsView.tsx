import {
  contractEscrow,
  MARKET_RESOURCES,
  type ClientMessage,
  type Colony,
  type Contract,
  type MarketResource,
} from "@spacesim/shared";
import { useState } from "react";
import { formatDuration } from "./format.js";
import { RESOURCE_LABELS } from "./labels.js";

interface Props {
  contracts: Contract[];
  colony: Colony | null;
  playerId: string | null;
  now: number;
  send: (msg: ClientMessage) => void;
}

const DURATION_OPTIONS = [
  { label: "15 min", ms: 900_000 },
  { label: "30 min", ms: 1_800_000 },
  { label: "1 h", ms: 3_600_000 },
  { label: "3 h", ms: 10_800_000 },
  { label: "6 h", ms: 21_600_000 },
] as const;

const STATUS_LABELS: Record<Contract["status"], string> = {
  open: "ouvert",
  fulfilled: "honoré",
  expired: "expiré",
  cancelled: "annulé",
};

export function ContractsView({ contracts, colony, playerId, now, send }: Props) {
  const [resource, setResource] = useState<MarketResource>("metals");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [durationMs, setDurationMs] = useState<number>(3_600_000);
  const [acceptAmounts, setAcceptAmounts] = useState<Record<string, string>>({});

  const mine = contracts.filter((c) => c.issuerId === playerId);
  const available = contracts.filter((c) => c.issuerId !== playerId && c.status === "open");

  const qty = Math.floor(Number(quantity));
  const unitPrice = Number(price);
  const validQty = Number.isFinite(qty) && qty > 0;
  const validPrice = Number.isFinite(unitPrice) && unitPrice > 0;
  const escrow = validQty && validPrice ? contractEscrow(qty, unitPrice) : 0;
  const canPost = colony && validQty && validPrice;

  return (
    <div className="contracts-view">
      <h3>Mes contrats</h3>
      {mine.length === 0 ? (
        <p className="muted">Aucun contrat publié.</p>
      ) : (
        <ul className="route-list">
          {mine.map((c) => (
            <li key={c.id} className="route-item">
              <div className="queue-head">
                <strong>
                  {RESOURCE_LABELS[c.resource]} — {c.remaining} / {c.quantity} à {c.pricePerUnit}{" "}
                  cr/u
                </strong>
                <span className={c.status === "open" ? "ok" : "muted"}>
                  {STATUS_LABELS[c.status]}
                </span>
              </div>
              <span className="small muted">
                {c.colonyName}
                {c.status === "open" && ` · échéance ${formatDuration(c.deadline - now)}`}
              </span>
              {c.status === "open" && (
                <div className="route-actions">
                  <button
                    className="action-button"
                    onClick={() => send({ type: "cancelContract", contractId: c.id })}
                  >
                    Annuler
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="routes-create-title">Contrats disponibles</h3>
      {available.length === 0 ? (
        <p className="muted">Aucune offre en attente d'un fournisseur.</p>
      ) : (
        <ul className="route-list">
          {available.map((c) => {
            const entry = acceptAmounts[c.id] ?? "";
            const wanted = Math.floor(Number(entry));
            const validWanted = Number.isFinite(wanted) && wanted > 0 && wanted <= c.remaining;
            return (
              <li key={c.id} className="route-item">
                <div className="queue-head">
                  <strong style={{ color: c.issuerColor }}>{c.issuerName}</strong>
                  <span className="small muted">échéance {formatDuration(c.deadline - now)}</span>
                </div>
                <span className="small muted">
                  Demande {c.remaining} {RESOURCE_LABELS[c.resource]} à {c.colonyName}, payé{" "}
                  {c.pricePerUnit} cr/u
                </span>
                <div className="transfer-form">
                  <label className="small muted transfer-amount">
                    Quantité livrée
                    <input
                      type="number"
                      min={1}
                      max={c.remaining}
                      value={entry}
                      placeholder="0"
                      onChange={(e) => setAcceptAmounts({ ...acceptAmounts, [c.id]: e.target.value })}
                    />
                  </label>
                  <button
                    disabled={!colony || !validWanted}
                    onClick={() => {
                      send({
                        type: "acceptContract",
                        colonyId: colony!.id,
                        contractId: c.id,
                        quantity: wanted,
                      });
                      setAcceptAmounts({ ...acceptAmounts, [c.id]: "" });
                    }}
                  >
                    Affréter le convoi
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="routes-create-title">Publier un contrat</h3>
      {!colony ? (
        <p className="muted">Aucune colonie.</p>
      ) : (
        <div className="transfer-form">
          <label className="small muted">
            Ressource{" "}
            <select value={resource} onChange={(e) => setResource(e.target.value as MarketResource)}>
              {MARKET_RESOURCES.map((res) => (
                <option key={res} value={res}>
                  {RESOURCE_LABELS[res]}
                </option>
              ))}
            </select>
          </label>
          <label className="small muted transfer-amount">
            Quantité
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="small muted transfer-amount">
            Prix (cr/unité)
            <input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="small muted">
            Échéance{" "}
            <select value={durationMs} onChange={(e) => setDurationMs(Number(e.target.value))}>
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.ms} value={opt.ms}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {escrow > 0 && (
            <span className="small muted">
              Séquestre : {escrow} crédits (soldée dispo : {Math.floor(colony.resources.credits)})
            </span>
          )}
          <button
            disabled={!canPost}
            onClick={() => {
              if (!colony) return;
              send({
                type: "postContract",
                colonyId: colony.id,
                resource,
                quantity: qty,
                pricePerUnit: unitPrice,
                durationMs,
              });
              setQuantity("");
              setPrice("");
            }}
          >
            Publier le contrat
          </button>
        </div>
      )}
    </div>
  );
}
