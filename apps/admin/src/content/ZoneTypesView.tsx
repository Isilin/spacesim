import {
  getGetApiAdminContentZoneTypesQueryKey,
  useGetApiAdminContentZoneTypes,
  usePutApiAdminContentZoneTypesId,
} from "../api/generated/admin.js";
import type { UpsertZoneTypeInput } from "@spacesim/protocol";
import { RESOURCES, type ResourceId } from "@spacesim/shared";
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

interface ZoneType {
  id: string;
  nameFr: string;
  descriptionFr: string;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string | null;
}

interface ZoneTypeForm {
  nameFr: string;
  descriptionFr: string;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string;
}

function emptyForm(): ZoneTypeForm {
  return {
    nameFr: "",
    descriptionFr: "",
    cost: {},
    buildMs: 60_000,
    requiresTech: "",
  };
}

function formFromZoneType(z: ZoneType): ZoneTypeForm {
  return {
    nameFr: z.nameFr,
    descriptionFr: z.descriptionFr,
    cost: z.cost,
    buildMs: z.buildMs,
    requiresTech: z.requiresTech ?? "",
  };
}

/**
 * CMS de contenu (chantier 24.7) — types de zone de station orbitale. Même recette
 * qu'un châssis/module (id libre, id-minting) mais sans emplacements ni effets : une
 * zone construite ajoute une instance positionnée sur la grille hexagonale de la
 * station (voir `Station.zones`, `sim/industry/station-layout`, chantier 26).
 * Client orval (chantier 27.15).
 */
export function ZoneTypesView() {
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentZoneTypes();
  const zoneTypes = (data?.zoneTypes ?? []) as ZoneType[];
  const mutation = usePutApiAdminContentZoneTypesId();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : "Serveur injoignable"
    : null;

  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<ZoneTypeForm>(emptyForm());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing({ id: "", isNew: true });
    setNewId("");
    setForm(emptyForm());
    setSubmitError(null);
  };

  const openEdit = (z: ZoneType) => {
    setEditing({ id: z.id, isNew: false });
    setForm(formFromZoneType(z));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError("Id requis");
      return;
    }
    const payload: UpsertZoneTypeInput = {
      nameFr: form.nameFr,
      descriptionFr: form.descriptionFr,
      cost: form.cost,
      buildMs: form.buildMs,
      requiresTech: form.requiresTech.trim() || null,
    };
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({ id, data: payload });
      queryClient.setQueryData(
        getGetApiAdminContentZoneTypesQueryKey(),
        result,
      );
      setEditing(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur serveur");
    }
  };

  const setCost = (resource: ResourceId, value: number) => {
    setForm((f) => ({ ...f, cost: { ...f.cost, [resource]: value } }));
  };

  const columns: TableColumn<ZoneType>[] = [
    { key: "id", label: "Id" },
    { key: "nameFr", label: "Nom" },
    {
      key: "buildMs",
      label: "Construction",
      align: "right",
      render: (v) => `${Math.round((v as number) / 1000)} s`,
    },
    {
      key: "requiresTech",
      label: "Tech requise",
      render: (v) => (v as string | null) ?? "—",
    },
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
    <Panel
      title="Types de zone"
      actions={<Button onClick={openCreate}>Nouveau</Button>}
    >
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label="Chargement des types de zone…" />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={zoneTypes} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            title={
              editing.isNew
                ? "Nouveau type de zone"
                : `Modifier « ${editing.id} »`
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label="Id (identifiant technique, ex. logistics_zone)"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            )}
            <Field
              label="Nom"
              value={form.nameFr}
              onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
            />
            <Field
              label="Description"
              value={form.descriptionFr}
              onChange={(e) =>
                setForm({ ...form, descriptionFr: e.target.value })
              }
            />
            <NumberInput
              label="Temps de construction (s)"
              value={form.buildMs / 1000}
              onChange={(e) =>
                setForm({ ...form, buildMs: Number(e.target.value) * 1000 })
              }
            />
            <Field
              label="Tech requise (id, vide = aucune)"
              value={form.requiresTech}
              onChange={(e) =>
                setForm({ ...form, requiresTech: e.target.value })
              }
            />
            <p className="muted small">Coût de construction</p>
            <div className="stat-row">
              {RESOURCES.map((res) => (
                <NumberInput
                  key={res}
                  label={res}
                  value={form.cost[res] ?? 0}
                  onChange={(e) => setCost(res, Number(e.target.value))}
                />
              ))}
            </div>
            {submitError && <p className="auth-error">{submitError}</p>}
          </Modal.Body>
          <Modal.Actions>
            <Button variant="ghost" onClick={() => setEditing(null)}>
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
