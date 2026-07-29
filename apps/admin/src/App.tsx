import { Button, TopBar } from "@spacesim/ui";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AccountDetailView } from "./AccountDetailView.js";
import { AccountsListView } from "./AccountsListView.js";
import { AuditLogView } from "./AuditLogView.js";
import { BuildingsView } from "./content/BuildingsView.js";
import { ContentLayout } from "./content/ContentLayout.js";
import { ChassisView } from "./content/ChassisView.js";
import { ConstantsView } from "./content/ConstantsView.js";
import { FactionsView } from "./content/FactionsView.js";
import { MilestonesView } from "./content/MilestonesView.js";
import { ModulesView } from "./content/ModulesView.js";
import { PresetsView } from "./content/PresetsView.js";
import { ShipsView } from "./content/ShipsView.js";
import { TechsView } from "./content/TechsView.js";
import { WarshipsView } from "./content/WarshipsView.js";
import type { AdminAuth } from "./useAdminAuth.js";

interface Props {
  auth: AdminAuth;
}

/** Trois onglets (chantier 23.5) — "content" a sa propre sous-navigation (23.6+). */
const NAV_ITEMS = [
  { value: "accounts", label: "Joueurs" },
  { value: "content", label: "Contenu" },
  { value: "audit", label: "Journal d'audit" },
];

export function App({ auth }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  // Premier segment du chemin : `/accounts/:id` reste sur l'onglet "accounts".
  const activeTab = location.pathname.split("/")[1] || "accounts";

  return (
    <div className="layout">
      <TopBar
        brand="SPACESIM ADMIN"
        items={NAV_ITEMS.map((item) => ({ ...item, href: `/${item.value}` }))}
        active={activeTab}
        onNavChange={(value) => navigate(`/${value}`)}
        status={{ label: auth.email ?? "", tone: "ok" }}
      >
        <Button variant="link" onClick={() => void auth.logout()}>
          Déconnexion
        </Button>
      </TopBar>
      <div className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/accounts" replace />} />
          <Route path="/accounts" element={<AccountsListView token={auth.token!} />} />
          <Route path="/accounts/:id" element={<AccountDetailView token={auth.token!} />} />
          <Route path="/content" element={<ContentLayout />}>
            <Route index element={<Navigate to="warships" replace />} />
            <Route path="warships" element={<WarshipsView token={auth.token!} />} />
            <Route path="factions" element={<FactionsView token={auth.token!} />} />
            <Route path="buildings" element={<BuildingsView token={auth.token!} />} />
            <Route path="ships" element={<ShipsView token={auth.token!} />} />
            <Route path="constants" element={<ConstantsView token={auth.token!} />} />
            <Route path="techs" element={<TechsView token={auth.token!} />} />
            <Route path="chassis" element={<ChassisView token={auth.token!} />} />
            <Route path="modules" element={<ModulesView token={auth.token!} />} />
            <Route path="presets" element={<PresetsView token={auth.token!} />} />
            <Route path="milestones" element={<MilestonesView token={auth.token!} />} />
          </Route>
          <Route path="/audit" element={<AuditLogView token={auth.token!} />} />
        </Routes>
      </div>
    </div>
  );
}
