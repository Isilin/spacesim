import {
  GATEWAY_COST,
  gatewayProgressRatio,
  gatewayRemaining,
  maxConvoyCapacity,
  type ClientMessage,
  type Colony,
  type Gateway,
  type ResourceId,
  type Route,
  type Universe,
} from "@spacesim/shared";
import { useState } from "react";
import { RESOURCE_LABELS } from "./labels.js";

interface Props {
  gateways: Gateway[];
  universe: Universe;
  activeColony: Colony | null;
  routes: Route[];
  researched: readonly string[];
  now: number;
  send: (msg: ClientMessage) => void;
}

const GATEWAY_RESOURCES = Object.keys(GATEWAY_COST) as ResourceId[];

function formatEta(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function GatewaysPanel({
  gateways,
  universe,
  activeColony,
  routes,
  researched,
  now,
  send,
}: Props) {
  const [amounts, setAmounts] = useState<Record<string, Partial<Record<ResourceId, string>>>>({});
  const hasTech = researched.includes("gateway_engineering");
  const convoyCapacity = activeColony ? maxConvoyCapacity(activeColony, routes) : 0;

  return (
    <div className="gateways-panel">
      <h2>Portails inter-galactiques</h2>
      {!hasTech && (
        <p className="muted small">
          Recherchez « Ingénierie des portails » pour contribuer aux chantiers.
        </p>
      )}
      {gateways.map((gateway) => {
        const galaxy = universe.galaxies.find((g) => g.id === gateway.galaxyId);
        if (!galaxy) return null;
        const remaining = gatewayRemaining(gateway);
        const ratio = gatewayProgressRatio(gateway);
        const entry = amounts[gateway.galaxyId] ?? {};
        const cargo: Partial<Record<ResourceId, number>> = {};
        for (const res of GATEWAY_RESOURCES) {
          const n = Math.floor(Number(entry[res] ?? ""));
          if (Number.isFinite(n) && n > 0) cargo[res] = n;
        }
        const physical = Object.entries(cargo)
          .filter(([res]) => res !== "credits")
          .reduce((s, [, n]) => s + (n ?? 0), 0);
        const overCapacity = physical > convoyCapacity;

        return (
          <div key={gateway.galaxyId} className="gateway-item">
            <div className="queue-head">
              <strong>{galaxy.name}</strong>
              {gateway.active ? (
                <span className="ok">◈ Portail actif</span>
              ) : gateway.activatesAt ? (
                <span className="ok">
                  Chantier final — {formatEta(gateway.activatesAt - now)}
                </span>
              ) : (
                <span className="muted">{Math.round(ratio * 100)} %</span>
              )}
            </div>
            {!gateway.active && !gateway.activatesAt && (
              <>
                <div className="progress">
                  <div className="progress-fill" style={{ width: `${ratio * 100}%` }} />
                </div>
                <span className="small muted">
                  Reste :{" "}
                  {Object.entries(remaining)
                    .map(([res, n]) => `${n} ${RESOURCE_LABELS[res as ResourceId]}`)
                    .join(" · ") || "rien"}
                </span>
                {hasTech && activeColony && (
                  <div className="transfer-form">
                    {GATEWAY_RESOURCES.filter((res) => (remaining[res] ?? 0) > 0).map((res) => (
                      <label key={res} className="small muted transfer-amount">
                        {RESOURCE_LABELS[res]} (reste {remaining[res]})
                        <input
                          type="number"
                          min={0}
                          value={entry[res] ?? ""}
                          placeholder="0"
                          onChange={(e) =>
                            setAmounts({
                              ...amounts,
                              [gateway.galaxyId]: { ...entry, [res]: e.target.value },
                            })
                          }
                        />
                      </label>
                    ))}
                    <span className={`small ${overCapacity ? "ko" : "muted"}`}>
                      Soute disponible : {convoyCapacity}
                      {overCapacity ? ` — trop lourd (${physical})` : ""}
                    </span>
                    <button
                      disabled={Object.keys(cargo).length === 0 || overCapacity}
                      onClick={() => {
                        send({
                          type: "contributeGateway",
                          colonyId: activeColony.id,
                          galaxyId: gateway.galaxyId,
                          resources: cargo,
                        });
                        setAmounts({ ...amounts, [gateway.galaxyId]: {} });
                      }}
                    >
                      Envoyer le convoi de chantier
                    </button>
                  </div>
                )}
              </>
            )}
            {gateway.active && (
              <span className="small muted">
                Gisements ×{galaxy.depositBonus} — sondez et colonisez via l'ancrage.
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
