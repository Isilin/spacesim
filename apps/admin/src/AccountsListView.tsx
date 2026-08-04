import { useGetApiAdminAccounts } from "./api/generated/admin.js";
import type { RoleId } from "@spacesim/protocol";
import { Field, Panel, Skeleton, Table, type TableColumn } from "@spacesim/ui";
import { useState } from "react";
import { Link } from "react-router-dom";

interface AccountRow {
  id: string;
  email: string;
  role: RoleId;
  createdAt: number;
  lastLoginAt: number | null;
  empire: { id: string; name: string; color: string } | null;
}

const COLUMNS: TableColumn<AccountRow>[] = [
  {
    key: "email",
    label: "E-mail",
    render: (value, row) => (
      <Link to={`/accounts/${row.id}`}>{value as string}</Link>
    ),
  },
  { key: "role", label: "Rôle" },
  {
    key: "empire",
    label: "Empire",
    render: (_v, row) => row.empire?.name ?? "—",
  },
  {
    key: "createdAt",
    label: "Inscrit le",
    render: (value) => new Date(value as number).toLocaleDateString("fr-FR"),
  },
  {
    key: "lastLoginAt",
    label: "Dernière connexion",
    render: (value) =>
      value ? new Date(value as number).toLocaleString("fr-FR") : "—",
  },
];

/** Recherche/liste de comptes (chantier 23.3). Client orval (chantier 27.15) : plus de
 *  garde `cancelled` manuel — TanStack Query annule déjà les requêtes obsolètes via
 *  AbortSignal (changer `query` rapidement ne peut plus faire flasher des résultats
 *  périmés). */
export function AccountsListView() {
  const [query, setQuery] = useState("");
  const { data, error, isPending } = useGetApiAdminAccounts({
    query: query || undefined,
  });
  const accounts = (data?.accounts ?? []) as AccountRow[];
  const total = data?.total ?? 0;
  const loadError = error
    ? error instanceof Error
      ? error.message
      : "Serveur injoignable"
    : null;

  return (
    <Panel title={`Comptes${total ? ` (${total})` : ""}`}>
      <Field
        label="Rechercher par e-mail"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="pilote@exemple.fr"
      />
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label="Chargement des comptes…" />
      )}
      {!loadError && !isPending && <Table columns={COLUMNS} rows={accounts} />}
    </Panel>
  );
}
