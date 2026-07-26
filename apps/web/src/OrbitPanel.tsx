import type { ClientMessage } from "@spacesim/protocol";
import {
  liftThroughput,
  MARKET_RESOURCES,
  orbitalCap,
  orbitalUsed,
  type Colony,
  type EmpireEffects,
  type LiftRule,
  type ResourceId,
} from "@spacesim/shared";
import { RESOURCE_LABELS } from "./labels.js";

interface Props {
  colony: Colony;
  effects: EmpireEffects;
  send: (msg: ClientMessage) => void;
}

/** Ressources transportables — les crédits et la science ne montent pas en orbite. */
const LIFTABLE: ResourceId[] = [...MARKET_RESOURCES];

/**
 * Sol ↔ orbite d'une colonie (chantier 12) : ce qui est en orbite, ce qui monte,
 * et à quel débit. Sans dock, rien n'est exportable — le panneau le dit d'emblée.
 */
export function OrbitPanel({ colony, effects, send }: Props) {
  const cap = orbitalCap(colony, effects);
  const used = orbitalUsed(colony);
  const throughput = liftThroughput(colony, effects);
  const docks = colony.buildings.orbital_dock ?? 0;

  const setRule = (resource: ResourceId, rule: LiftRule | null) =>
    send({ type: "setLiftRule", colonyId: colony.id, resource, rule });

  return (
    <section className="orbit-panel">
      <div className="queue-head">
        <h3>Orbite</h3>
        <span className={`small ${docks > 0 ? "muted" : "ko"}`}>
          {docks > 0
            ? `${docks} dock${docks > 1 ? "s" : ""} · soute ${Math.floor(used)}/${cap} · ascenseur ${throughput}/tick`
            : "Aucun dock orbital — cette colonie ne peut rien expédier."}
        </span>
      </div>

      {docks > 0 && (
        <div className="progress" title={`${Math.floor(used)} / ${cap}`}>
          <div
            className="progress-fill"
            style={{ width: `${cap > 0 ? (used / cap) * 100 : 0}%` }}
          />
        </div>
      )}

      <table className="orbit-table">
        <thead>
          <tr>
            <th>Ressource</th>
            <th>Sol</th>
            <th>Orbite</th>
            <th>Consigne</th>
            <th>Seuil au sol</th>
          </tr>
        </thead>
        <tbody>
          {LIFTABLE.map((res) => {
            const rule = colony.liftRules[res];
            return (
              <tr key={res}>
                <td>{RESOURCE_LABELS[res]}</td>
                <td>{Math.floor(colony.resources[res])}</td>
                <td className={colony.orbitalResources[res] > 0 ? "ok" : "muted"}>
                  {Math.floor(colony.orbitalResources[res] ?? 0)}
                </td>
                <td>
                  <select
                    value={rule?.direction ?? "none"}
                    disabled={docks === 0}
                    onChange={(e) =>
                      setRule(
                        res,
                        e.target.value === "none"
                          ? null
                          : {
                              keepGround: rule?.keepGround ?? 0,
                              direction: e.target.value as LiftRule["direction"],
                            },
                      )
                    }
                  >
                    <option value="none">—</option>
                    <option value="up">Monter le surplus</option>
                    <option value="down">Redescendre</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className="orbit-threshold"
                    value={rule?.keepGround ?? ""}
                    placeholder="0"
                    disabled={!rule || docks === 0}
                    onChange={(e) =>
                      rule &&
                      setRule(res, {
                        ...rule,
                        keepGround: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      })
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small muted">
        « Monter le surplus » hisse tout ce qui dépasse le seuil gardé au sol ; « redescendre »
        ramène de l'orbite jusqu'à atteindre ce seuil. L'ascenseur est partagé entre les ressources
        et consomme de l'énergie au sol.
      </p>
    </section>
  );
}
