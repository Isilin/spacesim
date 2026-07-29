import { Button, TopBar } from "@spacesim/ui";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuditLogView } from "./AuditLogView.js";
import type { AdminAuth } from "./useAdminAuth.js";

interface Props {
  auth: AdminAuth;
}

/** Un seul onglet pour l'instant (chantier 23.2) — grandit avec 23.3+ (joueurs, contenu). */
const NAV_ITEMS = [{ value: "audit", label: "Journal d'audit" }];

export function App({ auth }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = location.pathname.slice(1) || "audit";

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
          <Route path="/" element={<Navigate to="/audit" replace />} />
          <Route path="/audit" element={<AuditLogView token={auth.token!} />} />
        </Routes>
      </div>
    </div>
  );
}
