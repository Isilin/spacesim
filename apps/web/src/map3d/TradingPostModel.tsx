import { seedOf } from "./appearance.js";

/**
 * Comptoir et stations, en géométrie paramétrique (chantier 35.8).
 *
 * Le comptoir NPC n'était **pas rendu du tout** : un système qui en portait un était
 * visuellement identique à un système vide, alors que c'est le seul endroit où l'on peut
 * commercer sans rien avoir bâti. Même vocabulaire de formes que le reste du manufacturé
 * (ADR 0007) — moyeu torique, bras radiaux, mât — orienté par l'identifiant, teinté par le
 * propriétaire.
 */
export function TradingPostModel({
  id,
  color,
  size,
}: {
  id: string;
  color: string;
  size: number;
}) {
  const seed = seedOf(id);
  const arms = 3 + Math.floor(seedOf(`${id}:arms`) * 3);
  const hub = size * 0.45;

  return (
    <group rotation={[Math.PI / 2, seed * Math.PI * 2, 0]}>
      {/* Moyeu : l'anneau d'habitation, ce qui se lit de plus loin. */}
      <mesh>
        <torusGeometry args={[hub, hub * 0.22, 8, 18]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Bras radiaux : leur nombre vient de l'identifiant, deux comptoirs diffèrent. */}
      {Array.from({ length: arms }, (_, i) => {
        const angle = (i / arms) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * hub * 0.6,
              Math.sin(angle) * hub * 0.6,
              0,
            ]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[hub * 1.2, hub * 0.18, hub * 0.18]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        );
      })}
      {/* Mât central : donne une haut et un bas à une silhouette qui serait plate. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[hub * 0.12, hub * 0.12, size * 1.1, 8]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  );
}
