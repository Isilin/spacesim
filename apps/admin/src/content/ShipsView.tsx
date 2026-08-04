import {
  getGetApiAdminContentShipsQueryKey,
  useGetApiAdminContentShips,
  usePutApiAdminContentShipsId,
} from "../api/generated/admin.js";
import type { UpsertShipInput } from "@spacesim/protocol";
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
import { useTranslation } from "react-i18next";

interface Ship {
  id: string;
  nameFr: string;
  descriptionFr: string;
  capacity: number;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string | null;
  speedMult: number;
  fuelPerJump: number;
}

function emptyForm(): UpsertShipInput {
  return {
    nameFr: "",
    descriptionFr: "",
    capacity: 200,
    cost: {},
    buildMs: 45_000,
    requiresTech: null,
    speedMult: 1,
    fuelPerJump: 8,
  };
}

function formFromShip(s: Ship): UpsertShipInput {
  return {
    nameFr: s.nameFr,
    descriptionFr: s.descriptionFr,
    capacity: s.capacity,
    cost: s.cost,
    buildMs: s.buildMs,
    requiresTech: s.requiresTech,
    speedMult: s.speedMult,
    fuelPerJump: s.fuelPerJump,
  };
}

/**
 * CMS de contenu (chantier 23.8) — vaisseaux civils historiques, même recette que les
 * vaisseaux de guerre (23.5) : `PUT .../ships/:id` upsert, id choisi par l'admin.
 * Client orval (chantier 27.15).
 */
export function ShipsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentShips();
  const ships = (data?.ships ?? []) as Ship[];
  const mutation = usePutApiAdminContentShipsId();
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;

  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<UpsertShipInput>(emptyForm());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing({ id: "", isNew: true });
    setNewId("");
    setForm(emptyForm());
    setSubmitError(null);
  };

  const openEdit = (s: Ship) => {
    setEditing({ id: s.id, isNew: false });
    setForm(formFromShip(s));
    setSubmitError(null);
  };

  const submit = async () => {
    if (!editing) return;
    const id = editing.isNew ? newId.trim() : editing.id;
    if (!id) {
      setSubmitError(t("contentCommon.idRequired"));
      return;
    }
    setSubmitError(null);
    try {
      const result = await mutation.mutateAsync({ id, data: form });
      queryClient.setQueryData(getGetApiAdminContentShipsQueryKey(), result);
      setEditing(null);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("contentCommon.serverError"),
      );
    }
  };

  const setCost = (resource: ResourceId, value: number) => {
    setForm((f) => ({ ...f, cost: { ...f.cost, [resource]: value } }));
  };

  const columns: TableColumn<Ship>[] = [
    { key: "id", label: t("contentCommon.id") },
    { key: "nameFr", label: t("contentCommon.name") },
    { key: "capacity", label: t("shipsView.colHold"), align: "right" },
    { key: "speedMult", label: t("shipsView.colSpeed"), align: "right" },
    { key: "fuelPerJump", label: t("shipsView.colFuel"), align: "right" },
    {
      key: "buildMs",
      label: t("contentCommon.buildDuration"),
      align: "right",
      render: (v) => `${Math.round((v as number) / 1000)} s`,
    },
    {
      key: "requiresTech",
      label: t("contentCommon.requiredTech"),
      render: (v) => (v as string | null) ?? t("contentCommon.none"),
    },
    {
      key: "actions",
      label: "",
      render: (_v, row) => (
        <Button variant="link" onClick={() => openEdit(row)}>
          {t("contentCommon.edit")}
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title={t("shipsView.title")}
      actions={<Button onClick={openCreate}>{t("shipsView.new")}</Button>}
    >
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("shipsView.loading")} />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={ships} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            closeLabel={t("contentCommon.close")}
            title={
              editing.isNew
                ? t("shipsView.newTitle")
                : t("contentCommon.editTitle", { id: editing.id })
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label={t("shipsView.idHint")}
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            )}
            <Field
              label={t("contentCommon.name")}
              value={form.nameFr}
              onChange={(e) => setForm({ ...form, nameFr: e.target.value })}
            />
            <Field
              label={t("contentCommon.description")}
              value={form.descriptionFr}
              onChange={(e) =>
                setForm({ ...form, descriptionFr: e.target.value })
              }
            />
            <div className="stat-row">
              <NumberInput
                label={t("shipsView.hold")}
                value={form.capacity}
                onChange={(e) =>
                  setForm({ ...form, capacity: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("shipsView.speed")}
                value={form.speedMult}
                onChange={(e) =>
                  setForm({ ...form, speedMult: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("shipsView.fuelPerJump")}
                value={form.fuelPerJump}
                onChange={(e) =>
                  setForm({ ...form, fuelPerJump: Number(e.target.value) })
                }
              />
            </div>
            <NumberInput
              label={t("contentCommon.buildTime")}
              value={form.buildMs / 1000}
              onChange={(e) =>
                setForm({ ...form, buildMs: Number(e.target.value) * 1000 })
              }
            />
            <Field
              label={t("contentCommon.requiredTechField")}
              value={form.requiresTech ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  requiresTech: e.target.value.trim() || null,
                })
              }
            />
            <p className="muted small">{t("contentCommon.buildCost")}</p>
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
              {t("contentCommon.cancel")}
            </Button>
            <Button disabled={mutation.isPending} onClick={() => void submit()}>
              {mutation.isPending
                ? t("contentCommon.saving")
                : t("contentCommon.save")}
            </Button>
          </Modal.Actions>
        </Modal>
      )}
    </Panel>
  );
}
