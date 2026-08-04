import type { ClientMessage } from "@spacesim/protocol";
import {
  contractEscrow,
  MARKET_RESOURCES,
  type Colony,
  type Contract,
  type MarketResource,
} from "@spacesim/shared";
import { useState } from "react";
import { Badge, Button, NumberInput, Panel, Select } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { formatDuration } from "./format.js";
import { resourceLabel } from "./labels.js";

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

const STATUS_KEYS: Record<Contract["status"], string> = {
  open: "contractsView.statusOpen",
  fulfilled: "contractsView.statusFulfilled",
  expired: "contractsView.statusExpired",
  cancelled: "contractsView.statusCancelled",
};

export function ContractsView({
  contracts,
  colony,
  playerId,
  now,
  send,
}: Props) {
  const { t } = useTranslation();
  const [resource, setResource] = useState<MarketResource>("metals");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [durationMs, setDurationMs] = useState<number>(3_600_000);
  const [acceptAmounts, setAcceptAmounts] = useState<Record<string, string>>(
    {},
  );

  const mine = contracts.filter((c) => c.issuerId === playerId);
  const available = contracts.filter(
    (c) => c.issuerId !== playerId && c.status === "open",
  );

  const qty = Math.floor(Number(quantity));
  const unitPrice = Number(price);
  const validQty = Number.isFinite(qty) && qty > 0;
  const validPrice = Number.isFinite(unitPrice) && unitPrice > 0;
  const escrow = validQty && validPrice ? contractEscrow(qty, unitPrice) : 0;
  const canPost = colony && validQty && validPrice;

  return (
    <>
      <Panel title={t("contractsView.mine")}>
        {mine.length === 0 ? (
          <p className="muted">{t("contractsView.noneMine")}</p>
        ) : (
          <ul className="route-list">
            {mine.map((c) => (
              <li key={c.id} className="route-item">
                <div className="queue-head">
                  <strong>
                    {t("contractsView.contractLine", {
                      resource: resourceLabel(c.resource),
                      remaining: c.remaining,
                      quantity: c.quantity,
                      price: c.pricePerUnit,
                    })}
                  </strong>
                  <Badge variant={c.status === "open" ? "ok" : "neutral"}>
                    {t(STATUS_KEYS[c.status])}
                  </Badge>
                </div>
                <span className="small muted">
                  {c.colonyName}
                  {c.status === "open" &&
                    t("contractsView.deadlineSuffix", {
                      duration: formatDuration(c.deadline - now),
                    })}
                </span>
                {c.status === "open" && (
                  <div className="route-actions">
                    <Button
                      onClick={() =>
                        send({ type: "cancelContract", contractId: c.id })
                      }
                    >
                      {t("contractsView.cancel")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t("contractsView.available")}>
        {available.length === 0 ? (
          <p className="muted">{t("contractsView.noneAvailable")}</p>
        ) : (
          <ul className="route-list">
            {available.map((c) => {
              const entry = acceptAmounts[c.id] ?? "";
              const wanted = Math.floor(Number(entry));
              const validWanted =
                Number.isFinite(wanted) && wanted > 0 && wanted <= c.remaining;
              return (
                <li key={c.id} className="route-item">
                  <div className="queue-head">
                    <strong style={{ color: c.issuerColor }}>
                      {c.issuerName}
                    </strong>
                    <span className="small muted">
                      {t("contractsView.deadline", {
                        duration: formatDuration(c.deadline - now),
                      })}
                    </span>
                  </div>
                  <span className="small muted">
                    {t("contractsView.demand", {
                      remaining: c.remaining,
                      resource: resourceLabel(c.resource),
                      colony: c.colonyName,
                      price: c.pricePerUnit,
                    })}
                  </span>
                  <div className="form-stack">
                    <NumberInput
                      label={t("contractsView.quantityDelivered")}
                      min={1}
                      max={c.remaining}
                      value={entry}
                      placeholder="0"
                      onChange={(e) =>
                        setAcceptAmounts({
                          ...acceptAmounts,
                          [c.id]: e.target.value,
                        })
                      }
                    />
                    <Button
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
                      {t("contractsView.charterConvoy")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title={t("contractsView.publish")}>
        {!colony ? (
          <p className="muted">{t("contractsView.noColony")}</p>
        ) : (
          <div className="form-stack">
            <Select
              label={t("contractsView.resource")}
              value={resource}
              onChange={(e) => setResource(e.target.value as MarketResource)}
              options={MARKET_RESOURCES.map((res) => ({
                value: res,
                label: resourceLabel(res),
              }))}
            />
            <NumberInput
              label={t("contractsView.quantity")}
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <NumberInput
              label={t("contractsView.price")}
              min={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <Select
              label={t("contractsView.deadlineLabel")}
              value={durationMs}
              onChange={(e) => setDurationMs(Number(e.target.value))}
              options={DURATION_OPTIONS.map((opt) => ({
                value: String(opt.ms),
                label: opt.label,
              }))}
            />
            {escrow > 0 && (
              <span className="small muted">
                {t("contractsView.escrow", {
                  escrow,
                  available: Math.floor(colony.resources.credits),
                })}
              </span>
            )}
            <Button
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
              {t("contractsView.publishContract")}
            </Button>
          </div>
        )}
      </Panel>
    </>
  );
}
