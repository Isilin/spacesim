import {
  bestPrices,
  MARKET_RESOURCES,
  type MarketResource,
  type OrderSide,
} from "@spacesim/shared";
import { Button, NumberInput, Panel, Select, Table } from "@spacesim/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n.js";
import { resourceLabel } from "./labels.js";
import { useGameStore } from "./state/game-store.js";

/**
 * Carnet d'ordres d'une station (chantier 32.26).
 *
 * N'affiche que ce que le serveur a bien voulu envoyer : un carnet fermé n'arrive pas,
 * et le composant n'a donc rien à masquer lui-même
 * ([ADR 0012](../../../docs/adr/0012-carnet-d-ordres-et-avoirs-de-station.md)).
 */
export function OrderBookPanel({ stationId }: { stationId: string }) {
  const { t } = useTranslation();
  const { orders, holdings, playerId, colonies, send } = useGameStore();
  const [resource, setResource] = useState<MarketResource>(
    MARKET_RESOURCES[0]!,
  );
  const [side, setSide] = useState<OrderSide>("buy");
  const [quantity, setQuantity] = useState("10");
  const [price, setPrice] = useState("5");

  const book = orders.filter((o) => o.stationId === stationId);
  const forResource = book.filter((o) => o.resource === resource);
  const { bid, ask } = bestPrices(book, resource);
  const holding = holdings.find((h) => h.stationId === stationId);
  const qty = Math.floor(Number(quantity) || 0);
  const unit = Number(price) || 0;
  const valid = qty > 0 && unit > 0;

  return (
    <>
      <Panel title={t("orderBook.title")}>
        <Select
          value={resource}
          onChange={(e) => setResource(e.target.value as MarketResource)}
          options={MARKET_RESOURCES.map((r) => ({
            value: r,
            label: resourceLabel(r),
          }))}
        />
        {/* Un côté vide vaut « — », pas zéro : un carnet à moitié vide est un état
            normal, l'afficher à 0 mentirait sur le prix. */}
        <p className="muted small">
          {t("orderBook.spread", {
            bid: bid === null ? "—" : bid,
            ask: ask === null ? "—" : ask,
          })}
        </p>
        <Table
          columns={[
            { key: "side", label: t("orderBook.colSide") },
            { key: "price", label: t("orderBook.colPrice"), align: "right" },
            { key: "qty", label: t("orderBook.colQuantity"), align: "right" },
            { key: "action", label: "" },
          ]}
          rows={forResource
            .slice()
            .sort((a, b) => b.pricePerUnit - a.pricePerUnit)
            .map((order) => ({
              key: order.id,
              side: t(
                order.side === "buy" ? "orderBook.buy" : "orderBook.sell",
              ),
              price: order.pricePerUnit,
              qty: order.remaining,
              action:
                order.ownerId === playerId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      send({ type: "cancelOrder", orderId: order.id })
                    }
                  >
                    {t("orderBook.cancel")}
                  </Button>
                ) : null,
            }))}
        />
      </Panel>

      <Panel title={t("orderBook.placeTitle")}>
        <Select
          value={side}
          onChange={(e) => setSide(e.target.value as OrderSide)}
          options={[
            { value: "buy", label: t("orderBook.buy") },
            { value: "sell", label: t("orderBook.sell") },
          ]}
        />
        <NumberInput
          label={t("orderBook.quantity")}
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <NumberInput
          label={t("orderBook.price")}
          min={0.1}
          step={0.1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Button
          disabled={!valid}
          onClick={() =>
            send({
              type: "placeOrder",
              stationId,
              side,
              resource,
              quantity: qty,
              pricePerUnit: unit,
            })
          }
        >
          {t("orderBook.place")}
        </Button>
        <p className="muted small">{t("orderBook.escrowHint")}</p>
      </Panel>

      <Panel title={t("orderBook.holdingTitle")}>
        {!holding ? (
          <p className="muted small">{t("orderBook.noHolding")}</p>
        ) : (
          <>
            <ul className="queue-list">
              {(Object.entries(holding.resources) as [MarketResource, number][])
                .filter(([, n]) => n > 0)
                .map(([res, n]) => (
                  <li key={res} className="small">
                    {resourceLabel(res)} : {Math.floor(n)}
                  </li>
                ))}
            </ul>
            <p className="stat-value">
              {t("orderBook.credits", { value: Math.floor(holding.credits) })}
            </p>
            {/* Les crédits n'ont pas de lieu : ils rentrent sans convoi. La marchandise,
                elle, demande un voyage — c'est tout l'intérêt (ADR 0004). */}
            <Button
              disabled={holding.credits < 1 || colonies.length === 0}
              onClick={() =>
                send({
                  type: "claimHoldingCredits",
                  stationId,
                  colonyId: colonies[0]!.id,
                })
              }
            >
              {t("orderBook.claimCredits")}
            </Button>
          </>
        )}
      </Panel>
    </>
  );
}
