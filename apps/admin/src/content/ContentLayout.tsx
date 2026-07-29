import { Tabs } from "@spacesim/ui";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

/** Un onglet par domaine de contenu — grandit avec 23.10+ (châssis, modules...). */
const CONTENT_TABS = [
  { value: "warships", label: "Vaisseaux de guerre" },
  { value: "factions", label: "Factions" },
  { value: "buildings", label: "Bâtiments" },
  { value: "ships", label: "Vaisseaux civils" },
  { value: "constants", label: "Constantes" },
  { value: "techs", label: "Recherche" },
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
