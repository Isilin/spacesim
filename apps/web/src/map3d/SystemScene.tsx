import {
  bodyPositionAt,
  sitePosition,
  TICK_MS,
  type Planet,
  type StarSystem,
  type SystemSite,
} from "@spacesim/shared";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Group } from "three";
import { MapCanvas } from "./MapCanvas.js";
import { MapList } from "./MapList.js";

interface Props {
  system: StarSystem;
  /** Sites révélés par un scan (chantier 31.11) — absents tant que le système n'est pas scanné. */
  sites: SystemSite[];
  /** Tick serveur courant et date du dernier tick : servent à interpoler les orbites. */
  tick: number;
  lastTickAt: number;
  selectedBodyId: string | null;
  onSelectBody: (planet: Planet) => void;
  onOpenBody: (planet: Planet) => void;
}

const PLANET_COLORS: Record<string, string> = {
  telluric: "#7fb069",
  oceanic: "#4f8fc1",
  volcanic: "#c1574f",
  frozen: "#a8c6dd",
  arid: "#c1a05a",
  gas: "#b08fc9",
};

const SITE_COLORS: Record<string, string> = {
  wreck: "#e0b64f",
  anomaly: "#b48fe0",
  cache: "#56d364",
};

function radiusOf(planet: Planet): number {
  if (planet.kind === "moon") return 3;
  return planet.type === "gas" ? 9 : 6;
}

/**
 * Un corps, repositionné à chaque image. Les orbites bougent en continu alors que le
 * serveur n'avance que toutes les `TICK_MS` : le tick fractionnaire interpole entre deux
 * ticks, sinon les planètes sauteraient toutes les cinq secondes.
 *
 * La position est écrite directement sur le `group` plutôt que par un état React — un
 * `setState` par image et par corps re-rendrait tout l'arbre soixante fois par seconde.
 */
function OrbitingBody({
  system,
  body,
  tickAt,
  selected,
  onSelect,
  onOpen,
}: {
  system: StarSystem;
  body: Planet;
  tickAt: () => number;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const p = bodyPositionAt(system, body, tickAt());
    ref.current.position.set(p.x, p.y, p.z);
  });
  return (
    <group ref={ref}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: objet de scène three.js, ni
          focusable ni clavier — le chemin accessible est la liste DOM parallèle
          (chantier 31.16). */}
      <mesh onClick={onSelect} onDoubleClick={onOpen}>
        <sphereGeometry args={[radiusOf(body), 24, 24]} />
        <meshStandardMaterial
          color={PLANET_COLORS[body.type] ?? "#888"}
          emissive={selected ? "#4fc1ff" : "#000"}
          emissiveIntensity={selected ? 0.6 : 0}
          roughness={0.8}
        />
      </mesh>
    </group>
  );
}

/** Anneau d'orbite, tracé dans le plan du corps puis incliné comme lui. */
function OrbitRing({ body }: { body: Planet }) {
  return (
    <mesh
      rotation={[body.inclination, 0, body.ascendingNode]}
      // L'anneau est plat : on le couche dans le plan de l'orbite.
    >
      <ringGeometry
        args={[body.orbitRadius - 0.4, body.orbitRadius + 0.4, 96]}
      />
      <meshBasicMaterial color="#1e2a38" transparent opacity={0.7} />
    </mesh>
  );
}

/**
 * Niveau système en volume (chantier 31.15). Registre semi-réaliste : l'étoile éclaire
 * réellement les corps, c'est le niveau où le joueur regarde plutôt qu'il ne pilote.
 */
export function SystemScene({
  system,
  sites,
  tick,
  lastTickAt,
  selectedBodyId,
  onSelectBody,
  onOpenBody,
}: Props) {
  const { t } = useTranslation();

  // Tick fractionnaire : le serveur n'avance que par pas de TICK_MS, l'écran par image.
  const tickAt = useMemo(
    () => () => tick + Math.max(0, (Date.now() - lastTickAt) / TICK_MS),
    [tick, lastTickAt],
  );

  const planets = system.planets.filter((p) => p.kind === "planet");
  const extent = Math.max(
    200,
    ...system.planets.map((p) => p.orbitRadius),
    ...system.belts.map((b) => b.orbitRadius),
    ...sites.map((s) => s.orbitRadius),
  );
  const byId = new Map(system.planets.map((p) => [p.id, p]));

  return (
    <div className="map3d">
      <MapCanvas
        ariaLabel={t("systemView.ariaLabel", { name: system.name })}
        distance={extent * 2.6}
        register="lit"
      >
        {/* L'étoile : émissive, elle est aussi la source de lumière du registre `lit`. */}
        <mesh>
          <sphereGeometry args={[16, 32, 32]} />
          <meshBasicMaterial color="#ffd27f" />
        </mesh>

        {planets.map((planet) => (
          <OrbitRing key={`ring-${planet.id}`} body={planet} />
        ))}

        {system.belts.map((belt) => (
          <mesh
            key={belt.id}
            rotation={[belt.inclination, 0, belt.ascendingNode]}
          >
            <ringGeometry
              args={[belt.orbitRadius - 6, belt.orbitRadius + 6, 96]}
            />
            <meshBasicMaterial color="#4a3f30" transparent opacity={0.5} />
          </mesh>
        ))}

        {system.planets.map((body) => (
          <OrbitingBody
            key={body.id}
            system={system}
            body={body}
            tickAt={tickAt}
            selected={body.id === selectedBodyId}
            onSelect={() => onSelectBody(body)}
            onOpen={() => onOpenBody(body)}
          />
        ))}

        {/* Sites du scan : figés, une épave à la dérive n'a pas de période utile. */}
        {sites.map((site) => {
          const p = sitePosition(site);
          return (
            <mesh key={site.id} position={[p.x, p.y, p.z]}>
              <octahedronGeometry args={[5]} />
              <meshBasicMaterial color={SITE_COLORS[site.kind] ?? "#fff"} />
            </mesh>
          );
        })}
      </MapCanvas>
      <MapList
        label={t("systemView.ariaLabel", { name: system.name })}
        entries={[
          ...system.planets.map((body) => ({
            id: body.id,
            label: body.name,
            detail:
              body.kind === "moon"
                ? t("systemView.moon")
                : t("systemView.habitability", { value: body.habitability }),
            selected: body.id === selectedBodyId,
          })),
          ...sites.map((site) => ({
            id: site.id,
            label: t(`systemPanel.siteKind.${site.kind}`),
            detail: t("systemPanel.siteOrbit", {
              radius: Math.round(site.orbitRadius),
            }),
          })),
        ]}
        onSelect={(id) => {
          const body = byId.get(id);
          if (body) onSelectBody(body);
        }}
        onOpen={(id) => {
          const body = byId.get(id);
          if (body) onOpenBody(body);
        }}
      />
    </div>
  );
}
