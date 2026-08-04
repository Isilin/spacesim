import { useGetApiAdminAccounts } from "./api/generated/admin.js";
import type { RoleId } from "@spacesim/protocol";
import { Field, Panel, Skeleton, Table, type TableColumn } from "@spacesim/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

interface AccountRow {
  id: string;
  email: string;
  role: RoleId;
  createdAt: number;
  lastLoginAt: number | null;
  empire: { id: string; name: string; color: string } | null;
}

/** Recherche/liste de comptes (chantier 23.3). Client orval (chantier 27.15) : plus de
 *  garde `cancelled` manuel — TanStack Query annule déjà les requêtes obsolètes via
 *  AbortSignal (changer `query` rapidement ne peut plus faire flasher des résultats
 *  périmés). */
export function AccountsListView() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const { data, error, isPending } = useGetApiAdminAccounts({
    query: query || undefined,
  });
  const accounts = (data?.accounts ?? []) as AccountRow[];
  const total = data?.total ?? 0;
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const columns: TableColumn<AccountRow>[] = [
    {
      key: "email",
      label: t("accountsListView.colEmail"),
      render: (value, row) => (
        <Link to={`/accounts/${row.id}`}>{value as string}</Link>
      ),
    },
    { key: "role", label: t("accountsListView.colRole") },
    {
      key: "empire",
      label: t("accountsListView.colEmpire"),
      render: (_v, row) => row.empire?.name ?? t("contentCommon.none"),
    },
    {
      key: "createdAt",
      label: t("accountsListView.colRegisteredAt"),
      render: (value) =>
        new Date(value as number).toLocaleDateString(i18n.language),
    },
    {
      key: "lastLoginAt",
      label: t("accountsListView.colLastLogin"),
      render: (value) =>
        value
          ? new Date(value as number).toLocaleString(i18n.language)
          : t("contentCommon.none"),
    },
  ];

  return (
    <Panel
      title={
        total
          ? t("accountsListView.titleWithCount", { count: total })
          : t("accountsListView.title")
      }
    >
      <Field
        label={t("accountsListView.searchByEmail")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="pilote@exemple.fr"
      />
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("accountsListView.loading")} />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={accounts} />}
    </Panel>
  );
}
