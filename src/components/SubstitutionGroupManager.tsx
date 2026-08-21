"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Field } from "@/components/Field";
import { FoodPicker, SmallButton, type FoodChoice } from "@/components/FoodPicker";
import { ActionButton, Legend, Rule, TextLink } from "@/components/nd/kit";
import { buildFoodBook, foodKey } from "@/lib/diet/composition";
import {
  GROUP_LIMITS,
  addGroupFood,
  canAddGroup,
  canAddGroupFood,
  groupCompositions,
  removeGroupFood,
  validateGroup,
  type GroupErrorCode,
  type GroupErrors,
} from "@/lib/diet/groups";
import { deleteGroup, saveGroup } from "@/lib/diet/groupStore";
import { getRepository } from "@/lib/storage";
import type {
  CustomFood,
  FoodComposition,
  FoodRef,
  Id,
  SubstitutionGroup,
} from "@/lib/storage/types";

/**
 * Where the interchangeable foods get decided (#20).
 *
 * The predecessor shipped one hardcoded group — a fruit list somebody chose in
 * advance — and every plan that wanted to alternate two cuts of meat, or rice
 * and potato, had no way to say so. Nothing here is built in: a group is a name
 * and a list of foods, both typed by the person who will eat them.
 *
 * A client component for `CustomFoodManager`'s reason: the groups are in
 * IndexedDB on this device and the server never learns they exist. Same shape
 * as that screen too — an editor above a list, editing a row fills the
 * editor — except the editor is hidden until asked for, because a group is
 * something a user makes a few of and then leaves alone.
 */

/** Bounds interpolated into the messages for the codes that quote them. */
const ERROR_PARAMS: Partial<Record<GroupErrorCode, Record<string, number>>> = {
  nameLength: GROUP_LIMITS.nameLength,
  tooFewFoods: GROUP_LIMITS.foods,
  tooManyFoods: GROUP_LIMITS.foods,
};

interface Draft {
  /** The group being edited, or `undefined` while making a new one. */
  readonly editing?: Id;
  readonly name: string;
  readonly foods: readonly FoodRef[];
  /**
   * Snapshots for the TACO members, carried in the draft because they are only
   * available at the moment the food is picked — `keptCompositions` drops the
   * ones the saved group no longer needs.
   */
  readonly tacoFoods: readonly FoodComposition[];
}

type Status =
  | "loading"
  | "ready"
  | "saving"
  | "saved"
  | "loadFailed"
  | "saveFailed"
  | "removeFailed";

export function SubstitutionGroupManager() {
  const t = useTranslations("Groups");

  const [groups, setGroups] = useState<readonly SubstitutionGroup[]>([]);
  const [customFoods, setCustomFoods] = useState<readonly CustomFood[]>([]);
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const [errors, setErrors] = useState<GroupErrors>({});
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState<Id | undefined>(undefined);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const repository = getRepository();
        const [stored, foods] = await Promise.all([
          repository.substitutionGroups.list(),
          repository.customFoods.list(),
        ]);
        if (cancelled) return;

        setGroups(stored);
        setCustomFoods(foods);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("loadFailed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return <p className="text-sm text-nd-dim">{t("loading")}</p>;
  }

  if (status === "loadFailed") {
    return (
      <p className="text-sm text-nd-red-ink">{t("loadError")}</p>
    );
  }

  // Every name the screen has to print, from both stores at once: the saved
  // groups' own snapshots, whatever the draft has picked up since, and the
  // user's foods. A member with no entry here is one whose snapshot did not
  // survive, and the row says so rather than rendering a blank.
  const book = buildFoodBook(
    [...groupCompositions(groups), ...(draft?.tacoFoods ?? [])],
    customFoods,
  );

  const nameOf = (ref: FoodRef) => book.get(foodKey(ref))?.name;

  const open = (group?: SubstitutionGroup) => {
    setDraft(
      group === undefined
        ? { name: "", foods: [], tacoFoods: [] }
        : {
            editing: group.id,
            name: group.name,
            foods: group.foods,
            tacoFoods: group.tacoFoods ?? [],
          },
    );
    setErrors({});
    setPicking(false);
    setStatus("ready");
  };

  const close = () => {
    setDraft(undefined);
    setErrors({});
    setPicking(false);
    setStatus("ready");
  };

  const pick = (choice: FoodChoice) => {
    setPicking(false);
    setDraft((current) =>
      current === undefined
        ? current
        : {
            ...current,
            foods: addGroupFood(current.foods, choice.ref),
            tacoFoods:
              choice.composition === undefined
                ? current.tacoFoods
                : [...current.tacoFoods, choice.composition],
          },
    );
    // A food added is an answer to "too few foods", so the complaint goes now
    // rather than at the next submit.
    setErrors((current) => {
      if (current.foods === undefined) return current;
      const { foods: _cleared, ...rest } = current;
      return rest;
    });
    setStatus((current) => (current === "saved" ? "ready" : current));

    // The user's own foods can be created between this screen's mount and this
    // pick — the picker reads them live, so the book has to catch up.
    if (choice.custom !== undefined) {
      const added = choice.custom;
      setCustomFoods((current) =>
        current.some((food) => food.id === added.id) ? current : [...current, added],
      );
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft === undefined) return;

    const others = groups.filter((group) => group.id !== draft.editing);
    const result = validateGroup(
      { name: draft.name, foods: [...draft.foods], tacoFoods: [...draft.tacoFoods] },
      others,
      draft.editing,
    );

    if (!result.ok) {
      setErrors(result.errors);
      setStatus("ready");
      return;
    }

    setErrors({});
    setStatus("saving");

    try {
      const repository = getRepository();
      await saveGroup(repository, result.value, draft.editing, new Date().toISOString());

      // Re-read rather than splice, for `CustomFoodManager`'s reason: the store
      // decides the order, and a renamed group would slip out of it here.
      setGroups(await repository.substitutionGroups.list());
      setDraft(undefined);
      setPicking(false);
      setStatus("saved");
    } catch {
      setStatus("saveFailed");
    }
  };

  const remove = async (id: Id) => {
    setConfirming(undefined);

    try {
      const repository = getRepository();
      await deleteGroup(repository, id);
      setGroups(await repository.substitutionGroups.list());

      if (draft?.editing === id) close();
      else setStatus("ready");
    } catch {
      setStatus("removeFailed");
    }
  };

  const messageFor = (code: GroupErrorCode) => t(`errors.${code}`, ERROR_PARAMS[code]);

  return (
    <div className="flex flex-col gap-10">
      {draft === undefined ? (
        <div className="flex flex-col gap-2">
          <div>
            <ActionButton
              type="button"
              onClick={() => open()}
              disabled={!canAddGroup(groups)}
            >
              {t("add")}
            </ActionButton>
          </div>
          {canAddGroup(groups) ? null : (
            <p className="text-xs text-nd-dim">
              {t("addLimit", { max: GROUP_LIMITS.count.max })}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <Legend as="h2">
            {draft.editing === undefined
              ? t("add")
              : t("editTitle", { name: draft.name.trim() })}
          </Legend>

          <Field
            label={t("nameLabel")}
            hint={t("nameHint")}
            error={errors.name && messageFor(errors.name)}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="off"
                placeholder={t("namePlaceholder")}
                value={draft.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setDraft((current) =>
                    current === undefined ? current : { ...current, name },
                  );
                  setErrors((current) => {
                    if (current.name === undefined) return current;
                    const { name: _cleared, ...rest } = current;
                    return rest;
                  });
                  setStatus((current) => (current === "saved" ? "ready" : current));
                }}
              />
            )}
          </Field>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{t("foodsLabel")}</p>
              <p className="text-xs text-nd-dim">
                {t("foodsHint", {
                  min: GROUP_LIMITS.foods.min,
                  max: GROUP_LIMITS.foods.max,
                })}
              </p>
            </div>

            {draft.foods.length === 0 ? (
              <p className="text-sm text-nd-dim">{t("foodsEmpty")}</p>
            ) : (
              <ul className="flex flex-col">
                {draft.foods.map((food) => (
                  <li
                    key={foodKey(food)}
                    className="flex items-center justify-between gap-x-6 border-t border-nd-unlit py-2 first:border-t-0 first:pt-0"
                  >
                    <span className="min-w-0 text-sm">
                      {nameOf(food) ?? t("unknownFood")}
                    </span>
                    <SmallButton
                      label={t("removeFood")}
                      onClick={() =>
                        setDraft((current) =>
                          current === undefined
                            ? current
                            : { ...current, foods: removeGroupFood(current.foods, food) },
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}

            {errors.foods === undefined ? null : (
              <p className="border-l-2 border-nd-red pl-4 text-sm text-nd-red-ink">
                {messageFor(errors.foods)}
              </p>
            )}

            {picking ? (
              <FoodPicker
                inputId="group-food-picker"
                taken={new Set(draft.foods)}
                onPick={pick}
                onCancel={() => setPicking(false)}
              />
            ) : (
              <div>
                <SmallButton
                  label={t("addFood")}
                  disabled={!canAddGroupFood(draft.foods)}
                  onClick={() => setPicking(true)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <ActionButton type="submit" disabled={status === "saving"}>
              {status === "saving" ? t("saving") : t("save")}
            </ActionButton>

            <button
              type="button"
              onClick={close}
              className="text-sm underline underline-offset-4"
            >
              {t("cancel")}
            </button>

            <p aria-live="polite" className="text-sm">
              {status === "saveFailed" ? (
                <span className="text-nd-red-ink">{t("saveError")}</span>
              ) : null}
            </p>
          </div>
        </form>
      )}

      <section className="flex flex-col gap-4">
        <Rule />

        <Legend as="h2">{t("listHeading")}</Legend>

        <p aria-live="polite" className="text-sm">
          {status === "saved" ? (
            <span className="text-nd-dim">{t("saved")}</span>
          ) : null}
          {status === "removeFailed" ? (
            <span className="text-nd-red-ink">{t("removeError")}</span>
          ) : null}
        </p>

        {groups.length === 0 ? (
          <p className="text-sm text-nd-dim">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {groups.map((group) => (
              <li
                key={group.id}
                className="flex flex-col gap-2 border-t border-nd-unlit py-3 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-x-6">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-nd-dim">
                      {[
                        t("foodCount", { count: group.foods.length }),
                        ...group.foods.map(
                          (food) => nameOf(food) ?? t("unknownFood"),
                        ),
                      ].join(" · ")}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                    <SmallButton
                      label={t("edit")}
                      onClick={() => open(group)}
                    />
                    <SmallButton
                      label={t("remove")}
                      onClick={() => setConfirming(group.id)}
                    />
                  </div>
                </div>

                {confirming === group.id ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-nd-dim">
                      {t("removeConfirm", { name: group.name })}
                    </span>
                    <SmallButton
                      label={t("remove")}
                      onClick={() => void remove(group.id)}
                    />
                    <SmallButton
                      label={t("cancel")}
                      onClick={() => setConfirming(undefined)}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-nd-dim">
          <TextLink href="/dieta" className="text-xs">
            {t("planLink")}
          </TextLink>
        </p>
      </section>
    </div>
  );
}
