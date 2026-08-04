import { Tabs } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

/** Un onglet par domaine de contenu — dernière vague ajoutée en 24.7 (zones/installations). */
const CONTENT_TAB_KEYS = [
  { value: "warships", key: "contentLayout.warships" },
  { value: "factions", key: "contentLayout.factions" },
  { value: "buildings", key: "contentLayout.buildings" },
  { value: "ships", key: "contentLayout.ships" },
  { value: "constants", key: "contentLayout.constants" },
  { value: "techs", key: "contentLayout.techs" },
  { value: "chassis", key: "contentLayout.chassis" },
  { value: "modules", key: "contentLayout.modules" },
  { value: "presets", key: "contentLayout.presets" },
  { value: "milestones", key: "contentLayout.milestones" },
  { value: "zone-types", key: "contentLayout.zoneTypes" },
  { value: "installations", key: "contentLayout.installations" },
];

/** Sous-navigation du CMS de contenu (chantier 23.6) — même patron que les onglets
 *  internes d'apps/web (`LogisticsView`), pilotée par l'URL plutôt qu'un état local. */
export function ContentLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname.split("/")[2] ?? "warships";

  return (
    <div className="detail-stack">
      <Tabs
        items={CONTENT_TAB_KEYS.map((tab) => ({
          value: tab.value,
          label: t(tab.key),
        }))}
        active={active}
        onChange={(value) => navigate(`/content/${value}`)}
      />
      <Outlet />
    </div>
  );
}
