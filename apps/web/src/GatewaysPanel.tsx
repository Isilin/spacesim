import {
  GATEWAY_COST,
  galaxyIndexOfId,
  gatewayProgressRatio,
  gatewayRemaining,
  maxConvoyCapacity,
  type ResourceId,
} from "@spacesim/shared";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, ProgressBar } from "@spacesim/ui";
import { formatDuration } from "./format.js";
import { RESOURCE_LABELS } from "./labels.js";
import { useGameStore } from "./state/game-store.js";
import { selectActiveColony } from "./state/selectors.js";

interface Props {
  now: number;
}

const GATEWAY_RESOURCES = Object.keys(GATEWAY_COST) as ResourceId[];

export function GatewaysPanel({ now }: Props) {
  const [searchParams] = useSearchParams();
  const activeColony = useGameStore(selectActiveColony(searchParams.get("colony")));
  const { gateways, universe, routes, game, send } = useGameStore();
  const [amounts, setAmounts] = useState<Record<string, Partial<Record<ResourceId, string>>>>({});
  const researched = game?.researched ?? [];
  const hasTech = researched.includes("gateway_engineering");
  const convoyCapacity = activeColony ? maxConvoyCapacity(activeColony, routes) : 0;

  if (!universe) return null;

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
                <Badge variant="ok">◈ Portail actif</Badge>
              ) : gateway.activatesAt ? (
                <Badge variant="ok">
                  Chantier final — {formatDuration(gateway.activatesAt - now)}
                </Badge>
              ) : (
                <Badge>{Math.round(ratio * 100)} %</Badge>
              )}
            </div>
            {!gateway.active && !gateway.activatesAt && (
              <>
                <ProgressBar value={ratio * 100} max={100} />
                <span className="small muted">
                  Reste :{" "}
                  {Object.entries(remaining)
                    .map(([res, n]) => `${n} ${RESOURCE_LABELS[res as ResourceId]}`)
                    .join(" · ") || "rien"}
                </span>
                {/* Le coût croît avec l'éloignement : la richesse promise justifie l'effort. */}
                <span className="small muted">
                  Rang {galaxyIndexOfId(gateway.galaxyId)} · gisements ×{galaxy.depositBonus}
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
                    <Button
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
                    </Button>
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
