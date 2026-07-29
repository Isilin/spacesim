import type { RoleId } from "@spacesim/protocol";
import { Field, Panel, Table, type TableColumn } from "@spacesim/ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface AccountRow {
  id: string;
  email: string;
  role: RoleId;
  createdAt: number;
  lastLoginAt: number | null;
  empire: { id: string; name: string; color: string } | null;
}

interface Props {
  token: string;
}

const COLUMNS: TableColumn<AccountRow>[] = [
  {
    key: "email",
    label: "E-mail",
    render: (value, row) => <Link to={`/accounts/${row.id}`}>{value as string}</Link>,
  },
  { key: "role", label: "Rôle" },
  { key: "empire", label: "Empire", render: (_v, row) => row.empire?.name ?? "—" },
  {
    key: "createdAt",
    label: "Inscrit le",
    render: (value) => new Date(value as number).toLocaleDateString("fr-FR"),
  },
  {
    key: "lastLoginAt",
    label: "Dernière connexion",
    render: (value) => (value ? new Date(value as number).toLocaleString("fr-FR") : "—"),
  },
];

/** Recherche/liste de comptes (chantier 23.3). */
export function AccountsListView({ token }: Props) {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    fetch(`/api/admin/accounts?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((body: { accounts?: AccountRow[]; total?: number; error?: string }) => {
        if (cancelled) return;
        if (body.error) {
          setError(body.error);
          return;
        }
        setAccounts(body.accounts ?? []);
        setTotal(body.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) setError("Serveur injoignable");
      });
    return () => {
      cancelled = true;
    };
  }, [token, query]);

  return (
    <Panel title={`Comptes${total ? ` (${total})` : ""}`}>
      <Field
        label="Rechercher par e-mail"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="pilote@exemple.fr"
      />
      {error && <p className="auth-error">{error}</p>}
      {!error && accounts === null && <p className="muted">Chargement…</p>}
      {!error && accounts && <Table columns={COLUMNS} rows={accounts} />}
    </Panel>
  );
}
