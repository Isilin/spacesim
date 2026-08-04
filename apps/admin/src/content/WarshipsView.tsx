import {
  getGetApiAdminContentWarshipsQueryKey,
  useGetApiAdminContentWarships,
  usePutApiAdminContentWarshipsId,
} from "../api/generated/admin.js";
import {
  WARSHIP_CATEGORIES,
  type UpsertWarshipInput,
} from "@spacesim/protocol";
import { RESOURCES, type ResourceId } from "@spacesim/shared";
import {
  Button,
  Field,
  Modal,
  NumberInput,
  Panel,
  Select,
  Skeleton,
  Table,
  type TableColumn,
} from "@spacesim/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Warship {
  id: string;
  nameFr: string;
  descriptionFr: string;
  hull: number;
  shield: number;
  weapons: { long: number; medium: number; short: number };
  initiative: number;
  category: string;
  cost: Record<string, number>;
  buildMs: number;
  requiresTech: string | null;
  fleetDamageBonus: number | null;
}

const CATEGORY_KEYS: Record<string, string> = {
  skirmisher: "warshipsView.categorySkirmisher",
  line: "warshipsView.categoryLine",
  capital: "warshipsView.categoryCapital",
  support: "warshipsView.categorySupport",
};

function emptyForm(): UpsertWarshipInput {
  return {
    nameFr: "",
    descriptionFr: "",
    hull: 100,
    shield: 20,
    weapons: { long: 10, medium: 10, short: 10 },
    initiative: 15,
    category: "skirmisher",
    cost: {},
    buildMs: 60_000,
    requiresTech: null,
    fleetDamageBonus: null,
  };
}

function formFromWarship(w: Warship): UpsertWarshipInput {
  return {
    nameFr: w.nameFr,
    descriptionFr: w.descriptionFr,
    hull: w.hull,
    shield: w.shield,
    weapons: w.weapons,
    initiative: w.initiative,
    category: w.category as UpsertWarshipInput["category"],
    cost: w.cost,
    buildMs: w.buildMs,
    requiresTech: w.requiresTech,
    fleetDamageBonus: w.fleetDamageBonus,
  };
}

/**
 * CMS de contenu (chantier 23.5) — vaisseaux de guerre, domaine pilote. `PUT
 * /api/admin/content/warships/:id` fait office de create-ou-update : le formulaire de
 * création demande juste un id libre (id-minting, pas de mécanique dédiée). Client orval
 * (chantier 27.15) : plus de fetch()/token manuels, TanStack Query gère le cache, les
 * requêtes obsolètes (AbortSignal) et l'état de chargement/erreur.
 */
export function WarshipsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, error, isPending } = useGetApiAdminContentWarships();
  const warships = (data?.warships ?? []) as Warship[];
  const loadError = error
    ? error instanceof Error
      ? error.message
      : t("contentCommon.serverUnreachable")
    : null;
  const mutation = usePutApiAdminContentWarshipsId();

  const [editing, setEditing] = useState<{ id: string; isNew: boolean } | null>(
    null,
  );
  const [newId, setNewId] = useState("");
  const [form, setForm] = useState<UpsertWarshipInput>(emptyForm());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing({ id: "", isNew: true });
    setNewId("");
    setForm(emptyForm());
    setSubmitError(null);
  };

  const openEdit = (w: Warship) => {
    setEditing({ id: w.id, isNew: false });
    setForm(formFromWarship(w));
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
      queryClient.setQueryData(getGetApiAdminContentWarshipsQueryKey(), result);
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

  const columns: TableColumn<Warship>[] = [
    { key: "id", label: t("contentCommon.id") },
    { key: "nameFr", label: t("contentCommon.name") },
    {
      key: "category",
      label: t("warshipsView.category"),
      render: (v) => {
        const key = CATEGORY_KEYS[v as string];
        return key ? t(key) : (v as string);
      },
    },
    { key: "hull", label: t("warshipsView.hull"), align: "right" },
    { key: "shield", label: t("warshipsView.shields"), align: "right" },
    { key: "initiative", label: t("warshipsView.initiative"), align: "right" },
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
      title={t("warshipsView.title")}
      actions={<Button onClick={openCreate}>{t("warshipsView.new")}</Button>}
    >
      {loadError && <p className="auth-error">{loadError}</p>}
      {!loadError && isPending && (
        <Skeleton variant="block" label={t("warshipsView.loading")} />
      )}
      {!loadError && !isPending && <Table columns={columns} rows={warships} />}

      {editing && (
        <Modal open={editing !== null} onClose={() => setEditing(null)}>
          <Modal.Header
            closeLabel={t("contentCommon.close")}
            title={
              editing.isNew
                ? t("warshipsView.newTitle")
                : t("contentCommon.editTitle", { id: editing.id })
            }
          />
          <Modal.Body>
            {editing.isNew && (
              <Field
                label={t("warshipsView.idHint")}
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
            <Select
              label={t("warshipsView.category")}
              value={form.category}
              onChange={(e) =>
                setForm({
                  ...form,
                  category: e.target.value as UpsertWarshipInput["category"],
                })
              }
              options={WARSHIP_CATEGORIES.map((c) => ({
                value: c,
                label: CATEGORY_KEYS[c] ? t(CATEGORY_KEYS[c]) : c,
              }))}
            />
            <div className="stat-row">
              <NumberInput
                label={t("warshipsView.hull")}
                value={form.hull}
                onChange={(e) =>
                  setForm({ ...form, hull: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("warshipsView.shields")}
                value={form.shield}
                onChange={(e) =>
                  setForm({ ...form, shield: Number(e.target.value) })
                }
              />
              <NumberInput
                label={t("warshipsView.initiative")}
                value={form.initiative}
                onChange={(e) =>
                  setForm({ ...form, initiative: Number(e.target.value) })
                }
              />
            </div>
            <div className="stat-row">
              <NumberInput
                label={t("warshipsView.weaponsLong")}
                value={form.weapons.long}
                onChange={(e) =>
                  setForm({
                    ...form,
                    weapons: { ...form.weapons, long: Number(e.target.value) },
                  })
                }
              />
              <NumberInput
                label={t("warshipsView.weaponsMedium")}
                value={form.weapons.medium}
                onChange={(e) =>
                  setForm({
                    ...form,
                    weapons: {
                      ...form.weapons,
                      medium: Number(e.target.value),
                    },
                  })
                }
              />
              <NumberInput
                label={t("warshipsView.weaponsShort")}
                value={form.weapons.short}
                onChange={(e) =>
                  setForm({
                    ...form,
                    weapons: { ...form.weapons, short: Number(e.target.value) },
                  })
                }
              />
            </div>
            <div className="stat-row">
              <NumberInput
                label={t("contentCommon.buildTime")}
                value={form.buildMs / 1000}
                onChange={(e) =>
                  setForm({ ...form, buildMs: Number(e.target.value) * 1000 })
                }
              />
              <NumberInput
                label={t("warshipsView.fleetDamageBonus")}
                value={form.fleetDamageBonus ?? 0}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fleetDamageBonus: Number(e.target.value) || null,
                  })
                }
              />
            </div>
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
