import { Tabs } from "@spacesim/ui";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

/** Un onglet par domaine de contenu — dernière vague ajoutée en 24.7 (zones/installations). */
const CONTENT_TABS = [
  { value: "warships", label: "Vaisseaux de guerre" },
  { value: "factions", label: "Factions" },
  { value: "buildings", label: "Bâtiments" },
  { value: "ships", label: "Vaisseaux civils" },
  { value: "constants", label: "Constantes" },
  { value: "techs", label: "Recherche" },
  { value: "chassis", label: "Châssis" },
  { value: "modules", label: "Modules" },
  { value: "presets", label: "Plans pré-conçus" },
  { value: "milestones", label: "Jalons" },
  { value: "zone-types", label: "Types de zone" },
  { value: "installations", label: "Installations" },
];

/** Sous-navigation du CMS de contenu (chantier 23.6) — même patron que les onglets
 *  internes d'apps/web (`LogisticsView`), pilotée par l'URL plutôt qu'un état local. */
export function ContentLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname.split("/")[2] ?? "warships";

  return (
    <div className="detail-stack">
      <Tabs
        items={CONTENT_TABS}
        active={active}
        onChange={(value) => navigate(`/content/${value}`)}
      />
      <Outlet />
    </div>
  );
}
