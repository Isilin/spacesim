import { Button, TopBar } from "@spacesim/ui";
import { useTranslation } from "react-i18next";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { AccountDetailView } from "./AccountDetailView.js";
import { AccountsListView } from "./AccountsListView.js";
import { AuditLogView } from "./AuditLogView.js";
import { BuildingsView } from "./content/BuildingsView.js";
import { ContentLayout } from "./content/ContentLayout.js";
import { ChassisView } from "./content/ChassisView.js";
import { ConstantsView } from "./content/ConstantsView.js";
import { FactionsView } from "./content/FactionsView.js";
import { InstallationsView } from "./content/InstallationsView.js";
import { MilestonesView } from "./content/MilestonesView.js";
import { ModulesView } from "./content/ModulesView.js";
import { PresetsView } from "./content/PresetsView.js";
import { ShipsView } from "./content/ShipsView.js";
import { TechsView } from "./content/TechsView.js";
import { WarshipsView } from "./content/WarshipsView.js";
import { ZoneTypesView } from "./content/ZoneTypesView.js";
import { OpsView } from "./OpsView.js";
import type { AdminAuth } from "./useAdminAuth.js";

interface Props {
  auth: AdminAuth;
}

/** Quatre onglets — "content" a sa propre sous-navigation (23.6+). "ops" (23.12) reste
 *  visible pour tous les rôles, comme "audit" : c'est la route qui refuse (403), pas le nav. */
const NAV_KEYS = [
  { value: "accounts", key: "app.navAccounts" },
  { value: "content", key: "app.navContent" },
  { value: "ops", key: "app.navOps" },
  { value: "audit", key: "app.navAudit" },
];

export function App({ auth }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // Premier segment du chemin : `/accounts/:id` reste sur l'onglet "accounts".
  const activeTab = location.pathname.split("/")[1] || "accounts";

  return (
    <div className="layout">
      <TopBar
        brand="SPACESIM ADMIN"
        items={NAV_KEYS.map((item) => ({
          value: item.value,
          label: t(item.key),
          href: `/${item.value}`,
        }))}
        active={activeTab}
        onNavChange={(value) => navigate(`/${value}`)}
        status={{ label: auth.email ?? "", tone: "ok" }}
      >
        <Button variant="link" onClick={() => void auth.logout()}>
          {t("app.logout")}
        </Button>
      </TopBar>
      <div className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/accounts" replace />} />
          <Route path="/accounts" element={<AccountsListView />} />
          <Route path="/accounts/:id" element={<AccountDetailView />} />
          <Route path="/content" element={<ContentLayout />}>
            <Route index element={<Navigate to="warships" replace />} />
            <Route path="warships" element={<WarshipsView />} />
            <Route path="factions" element={<FactionsView />} />
            <Route path="buildings" element={<BuildingsView />} />
            <Route path="ships" element={<ShipsView />} />
            <Route path="constants" element={<ConstantsView />} />
            <Route path="techs" element={<TechsView />} />
            <Route path="chassis" element={<ChassisView />} />
            <Route path="modules" element={<ModulesView />} />
            <Route path="presets" element={<PresetsView />} />
            <Route path="milestones" element={<MilestonesView />} />
            <Route path="zone-types" element={<ZoneTypesView />} />
            <Route path="installations" element={<InstallationsView />} />
          </Route>
          <Route path="/ops" element={<OpsView />} />
          <Route path="/audit" element={<AuditLogView />} />
        </Routes>
      </div>
    </div>
  );
}
