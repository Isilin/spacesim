/**
 * Couleur d'un type de zone de station, **par hachage de son identifiant** et non par une
 * table codée en dur.
 *
 * Extrait de `StationDiagram.tsx` au chantier 33.2 pour que le diagramme 2D et le modèle 3D
 * du même objet ne puissent plus diverger. La raison du hachage est celle d'origine : ces
 * ids sont libres côté base, un administrateur peut en créer de nouveaux (chantier 23) —
 * une table par id rendrait toute zone inventée grise en 3D alors qu'elle est colorée en 2D.
 */
const ZONE_PALETTE = ["--amber", "--cyan", "--violet", "--ok", "--ko"] as const;

/** Nom du jeton de couleur d'un type de zone. Le 2D l'enveloppe dans `var()`, la 3D le
 *  résout en hexadécimal — une seule source pour les deux. */
export function zoneColorToken(zoneTypeId: string): string {
  let hash = 0;
  for (let i = 0; i < zoneTypeId.length; i++) {
    hash = (hash * 31 + zoneTypeId.charCodeAt(i)) | 0;
  }
  return ZONE_PALETTE[Math.abs(hash) % ZONE_PALETTE.length]!;
}
