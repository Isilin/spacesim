import type { UpsertConstantInput } from "@spacesim/protocol";
import { Button, Field, Modal, NumberInput, Panel, Table, type TableColumn } from "@spacesim/ui";
import { useEffect, useState } from "react";

interface Constant {
  key: string;
  value: number;
  descriptionFr: string;
}

interface Props {
  token: string;
}

function formFromConstant(c: Constant): UpsertConstantInput {
  return { value: c.value, descriptionFr: c.descriptionFr };
}

/**
 * CMS de contenu (chantier 23.8) — scalaires d'équilibrage global. Comme les bâtiments,
 * pas de bouton "Nouveau" : la clé reste un des champs de `BalanceConstants`
 * (`packages/shared/src/balance.ts`), vérifiée côté serveur, pas un id libre.
 */
export function ConstantsView({ token }: Props) {
  const [constants, setConstants] = useState<Constant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertConstantInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = () => {
    fetch("/api/admin/content/constants", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((body: { constants?: Constant[]; error?: string }) => {
        if (body.error) {
          setError(body.error);
          return;
        }
        setConstants(body.constants ?? []);
      })
      .catch(() => setError("Serveur injoignable"));
  };

  useEffect(load, [token]);

  const openEdit = (c: Constant) => {
    setEditingKey(c.key);
    setForm(formFromConstant(c));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editingKey || !form) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/admin/content/constants/${encodeURIComponent(editingKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? "Erreur serveur");
        return;
      }
      setConstants(body.constants);
      setEditingKey(null);
      setForm(null);
    } catch {
      setSubmitError("Serveur injoignable");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: TableColumn<Constant>[] = [
    { key: "key", label: "Clé" },
    { key: "descriptionFr", label: "Description" },
    { key: "value", label: "Valeur", align: "right" },
    {
      key: "actions",
      label: "",
      render: (_v, row) => (
        <Button variant="link" onClick={() => openEdit(row)}>
          Modifier
        </Button>
      ),
    },
  ];

  return (
    <Panel title="Constantes d'équilibrage">
      {error && <p className="auth-error">{error}</p>}
      {!error && constants === null && <p className="muted">Chargement…</p>}
      {!error && constants && <Table columns={columns} rows={constants} />}

      {editingKey && form && (
        <Modal
          title={`Modifier « ${editingKey} »`}
          onClose={() => setEditingKey(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setEditingKey(null)}>
                Annuler
              </Button>
              <Button disabled={submitting} onClick={() => void submit()}>
                {submitting ? "…" : "Enregistrer"}
              </Button>
            </>
          }
        >
          <NumberInput
            label="Valeur"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
          />
          <Field
            label="Description"
            value={form.descriptionFr}
            onChange={(e) => setForm({ ...form, descriptionFr: e.target.value })}
          />
          {submitError && <p className="auth-error">{submitError}</p>}
        </Modal>
      )}
    </Panel>
  );
}
