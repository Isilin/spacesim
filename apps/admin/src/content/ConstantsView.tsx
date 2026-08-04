import {
  getGetApiAdminContentConstantsQueryKey,
  useGetApiAdminContentConstants,
  usePutApiAdminContentConstantsKey,
} from "../api/generated/admin.js";
import type { UpsertConstantInput } from "@spacesim/protocol";
import {
  Button,
  Field,
  Modal,
  NumberInput,
  Panel,
  Skeleton,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface Constant {
  key: string;
  value: number;
  descriptionFr: string;
}

function formFromConstant(c: Constant): UpsertConstantInput {
  return { value: c.value, descriptionFr: c.descriptionFr };
}

/**
 * CMS de contenu (chantier 23.8) — scalaires d'équilibrage global. Comme les bâtiments,
 * pas de bouton "Nouveau" : la clé reste un des champs de `BalanceConstants`
 * (`packages/shared/src/balance.ts`), vérifiée côté serveur, pas un id libre.
 * Client orval (chantier 27.15).
 */
export function ConstantsView() {
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentConstants();
  const constants = (data?.constants ?? []) as Constant[];
  const mutation = usePutApiAdminContentConstantsKey();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : "Serveur injoignable"
    : null;

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertConstantInput | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openEdit = (c: Constant) => {
    setEditingKey(c.key);
    setForm(formFromConstant(c));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editingKey || !form) return;
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({
        key: editingKey,
        data: form,
      });
      queryClient.setQueryData(
        getGetApiAdminContentConstantsQueryKey(),
        result,
      );
      setEditingKey(null);
      setForm(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur serveur");
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
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label="Chargement des constantes…" />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={constants} />}

      {editingKey && form && (
        <Modal open={editingKey !== null} onClose={() => setEditingKey(null)}>
          <Modal.Header title={`Modifier « ${editingKey} »`} />
          <Modal.Body>
            <NumberInput
              label="Valeur"
              value={form.value}
              onChange={(e) =>
                setForm({ ...form, value: Number(e.target.value) })
              }
            />
            <Field
              label="Description"
              value={form.descriptionFr}
              onChange={(e) =>
                setForm({ ...form, descriptionFr: e.target.value })
              }
            />
            {submitError && <p className="auth-error">{submitError}</p>}
          </Modal.Body>
          <Modal.Actions>
            <Button variant="ghost" onClick={() => setEditingKey(null)}>
              Annuler
            </Button>
            <Button disabled={mutation.isPending} onClick={() => void submit()}>
              {mutation.isPending ? "…" : "Enregistrer"}
            </Button>
          </Modal.Actions>
        </Modal>
      )}
    </Panel>
  );
}
