import { Button, TopBar } from "@spacesim/ui";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AccountDetailView } from "./AccountDetailView.js";
import { AccountsListView } from "./AccountsListView.js";
import { AuditLogView } from "./AuditLogView.js";
import { WarshipsView } from "./content/WarshipsView.js";
import type { AdminAuth } from "./useAdminAuth.js";

interface Props {
  auth: AdminAuth;
}

/** Trois onglets (chantier 23.5) — "content" grandit avec 23.6+ (un domaine à la fois). */
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
          <Route path="/content" element={<Navigate to="/content/warships" replace />} />
          <Route path="/content/warships" element={<WarshipsView token={auth.token!} />} />
          <Route path="/audit" element={<AuditLogView token={auth.token!} />} />
        </Routes>
      </div>
    </div>
  );
}
