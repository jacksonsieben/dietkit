"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { CONTROL_CLASS } from "@/components/Field";
import { FoodPicker, SmallButton, type FoodChoice } from "@/components/FoodPicker";
import type { FoodBook } from "@/lib/diet/composition";
import { alternativesFor, findGroup, groupsForFood } from "@/lib/diet/groups";
import {
  ITEM_LIMITS,
  checkGrams,
  type ItemChanges,
  type ItemErrorCode,
} from "@/lib/diet/items";
import type { SolvedItem, SolvedMeal } from "@/lib/diet/solve";
import type {
  FoodRef,
  Id,
  Meal,
  SubstitutionGroup,
} from "@/lib/storage/types";

/**
 * What a meal is made of, and how much of it (#19).
 *
 * The numbers in here are not typed, they are solved — and that is the whole
 * difference from the predecessor. A free food shows the quantity the solver
 * chose; what the user controls is the *range* it may be chosen from, because
 * three macro equations over a dozen foods have infinitely many answers and the
 * bounds are what makes one of them a meal rather than 400 g of olive oil.
 *
 * A mandatory food is the other way round: the quantity is typed and the solver
 * may not touch it. On screen those are two different controls, which is the
 * honest rendering of "credited against the target before solving" — you can
 * see that the pinned row did not move and the others did.
 *
 * When the target cannot be met the shortfall is printed with the foods that
 * are holding it there. An app that quietly hands back a plan missing 18 g of
 * fat is the failure this issue exists to end.
 */

export function MealItems({
  solved,
  groups,
  book,
  canAdd,
  onAdd,
  onChange,
  onSetGroup,
  onSwap,
  onRemove,
}: {
  solved: SolvedMeal;
  groups: readonly SubstitutionGroup[];
  book: FoodBook;
  canAdd: boolean;
  onAdd: (choice: FoodChoice) => void;
  onChange: (itemId: Id, changes: ItemChanges) => void;
  onSetGroup: (itemId: Id, groupId: Id | undefined) => void;
  onSwap: (itemId: Id, food: FoodRef) => void;
  onRemove: (itemId: Id) => void;
}) {
  const t = useTranslations("Plan");
  const [picking, setPicking] = useState(false);

  const taken = new Set([
    ...solved.items.map((entry) => entry.item.food),
    ...solved.missing.map((item) => item.food),
  ]);

  return (
    <div className="flex flex-col gap-3 border-t border-black/10 pt-3 dark:border-white/15">
      <h3 className="text-xs font-medium opacity-70">{t("itemsHeading")}</h3>

      {solved.items.length === 0 && solved.missing.length === 0 ? (
        <p className="text-xs opacity-60">{t("itemsEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {solved.items.map((entry) => (
            <ItemRow
              key={entry.item.id}
              entry={entry}
              meal={solved.meal}
              groups={groups}
              book={book}
              onChange={(changes) => onChange(entry.item.id, changes)}
              onSetGroup={(groupId) => onSetGroup(entry.item.id, groupId)}
              onSwap={(food) => onSwap(entry.item.id, food)}
              onRemove={() => onRemove(entry.item.id)}
            />
          ))}

          {solved.missing.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-600/40 bg-amber-500/5 px-3 py-2 dark:border-amber-400/40"
            >
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {t("itemUnknown")}
              </p>
              <SmallButton label={t("remove")} onClick={() => onRemove(item.id)} />
            </li>
          ))}
        </ul>
      )}

      <Outcome solved={solved} />

      {picking ? (
        <FoodPicker
          inputId={`${solved.meal.id}-food-picker`}
          taken={taken}
          onPick={(choice) => {
            onAdd(choice);
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <SmallButton
            label={t("addFood")}
            disabled={!canAdd}
            onClick={() => setPicking(true)}
          />
          {canAdd ? null : (
            <p className="text-xs opacity-60">
              {t("itemLimit", { max: ITEM_LIMITS.count.max })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Whether this meal's numbers were met, and if not, by how much and because of
 * what.
 *
 * Printed for every meal rather than only for the broken ones: "bate com a
 * meta" is a claim the user can check against the row above it, and a screen
 * that only speaks up when something is wrong is a screen whose silence means
 * nothing.
 */
function Outcome({ solved }: { solved: SolvedMeal }) {
  const t = useTranslations("Plan");
  const format = useFormatter();

  if (solved.items.length === 0) return null;

  const grams = (value: number) => format.number(Math.round(value));

  const off = (["proteinG", "carbG", "fatG"] as const)
    .map((macro) => {
      const value = solved.residual[macro];
      if (Math.abs(value) < 1) return undefined;

      return t(value < 0 ? "under" : "over", {
        value: Math.abs(Math.round(value)),
        macro: t(`macroName.${macro}`),
      });
    })
    .filter((part) => part !== undefined);

  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-xs opacity-70">
        {t("achievedLabel")}
        {": "}
        {t("macros", {
          protein: grams(solved.achieved.proteinG),
          carb: grams(solved.achieved.carbG),
          fat: grams(solved.achieved.fatG),
        })}
        {" · "}
        {t("kcal", { kcal: Math.round(solved.achieved.kcal) })}
      </p>

      {off.length === 0 ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {t("onTarget")}
        </p>
      ) : (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          {t("offTarget", { detail: off.join(", ") })}
        </p>
      )}

      {/* Why it did not close, in the only terms that let someone fix it. */}
      {solved.items.some((entry) => entry.limiting) ? (
        <p className="text-xs opacity-70">
          {t("limitingNote", {
            foods: solved.items
              .filter((entry) => entry.limiting)
              .map((entry) => entry.food.name)
              .join(", "),
          })}
        </p>
      ) : null}
    </div>
  );
}

function ItemRow({
  entry,
  meal,
  groups,
  book,
  onChange,
  onSetGroup,
  onSwap,
  onRemove,
}: {
  entry: SolvedItem;
  meal: Meal;
  groups: readonly SubstitutionGroup[];
  book: FoodBook;
  onChange: (changes: ItemChanges) => void;
  onSetGroup: (groupId: Id | undefined) => void;
  onSwap: (food: FoodRef) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Plan");
  const format = useFormatter();

  const [error, setError] = useState<ItemErrorCode | undefined>(undefined);

  const grams = (value: number) => format.number(Math.round(value));
  const errorId = `${entry.item.id}-item-error`;

  /**
   * A grams box that only reaches the plan once it holds a number.
   *
   * Typed rather than parsed on blur, so the solve follows along as the range
   * is widened — that responsiveness is the argument for bounds being the
   * control at all. An empty or nonsense box leaves the plan alone and says so.
   */
  const onGrams = (field: "quantityG" | "minG" | "maxG", raw: string) => {
    const checked = checkGrams(raw);
    if ("error" in checked) {
      setError(checked.error);
      return;
    }

    setError(undefined);
    onChange({ [field]: checked.value });
  };

  return (
    <li className="flex flex-col gap-2 rounded-md border border-black/10 px-3 py-2 dark:border-white/15">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">{entry.food.name}</p>
        <SmallButton label={t("remove")} onClick={onRemove} />
      </div>

      <p className="font-mono text-xs opacity-70">
        {entry.pinned ? null : (
          <span className="font-semibold opacity-100">
            {t("itemGrams", { grams: grams(entry.quantityG) })}
            {" · "}
          </span>
        )}
        {t("macros", {
          protein: grams(entry.macros.proteinG),
          carb: grams(entry.macros.carbG),
          fat: grams(entry.macros.fatG),
        })}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={entry.item.mandatory}
            // Pinning at what it is already worth, so nothing jumps at the
            // moment the user says "this much and no less".
            onChange={(event) =>
              onChange({
                mandatory: event.target.checked,
                quantityG: entry.quantityG,
              })
            }
          />
          {t("pin")}
        </label>

        {entry.pinned ? (
          <GramsBox
            label={t("quantityLabel")}
            id={`${entry.item.id}-quantity`}
            value={entry.item.quantityG}
            invalid={error !== undefined}
            describedBy={error ? errorId : undefined}
            onChange={(raw) => onGrams("quantityG", raw)}
          />
        ) : (
          <>
            <GramsBox
              label={t("minLabel")}
              id={`${entry.item.id}-min`}
              value={entry.item.minG}
              invalid={error !== undefined}
              describedBy={error ? errorId : undefined}
              onChange={(raw) => onGrams("minG", raw)}
            />
            <GramsBox
              label={t("maxLabel")}
              id={`${entry.item.id}-max`}
              value={entry.item.maxG}
              invalid={error !== undefined}
              describedBy={error ? errorId : undefined}
              onChange={(raw) => onGrams("maxG", raw)}
            />
          </>
        )}
      </div>

      <SlotGroup
        entry={entry}
        meal={meal}
        groups={groups}
        book={book}
        onSetGroup={onSetGroup}
        onSwap={onSwap}
      />

      {error ? (
        <p id={errorId} className="text-xs text-red-700 dark:text-red-400">
          {t(`itemErrors.${error}`, { max: ITEM_LIMITS.gramsG.max })}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Which class this slot draws from, and what else could fill it (#20).
 *
 * Two controls rather than one: the group says what would be acceptable here,
 * the swap says what is on the plate today. Only groups that already contain
 * this food are offered — attaching any other would mean either silently
 * replacing the food or offering a list of alternatives without it.
 *
 * Nothing here does arithmetic. A swap replaces `item.food` and leaves `minG`,
 * `maxG` and `mandatory` where they are, because those describe the room this
 * position in the meal has rather than the food currently in it; the plan is
 * re-solved on the next render and the new food comes back sized to the same
 * targets. That is the whole of "swapping re-solves quantities".
 */
function SlotGroup({
  entry,
  meal,
  groups,
  book,
  onSetGroup,
  onSwap,
}: {
  entry: SolvedItem;
  meal: Meal;
  groups: readonly SubstitutionGroup[];
  book: FoodBook;
  onSetGroup: (groupId: Id | undefined) => void;
  onSwap: (food: FoodRef) => void;
}) {
  const t = useTranslations("Plan");

  const attached = findGroup(groups, entry.item.substitutionGroupId);
  const eligible = groupsForFood(groups, entry.item.food);

  // A group edited to drop this food is still the group this slot points at,
  // and hiding it would leave a select whose value is nowhere in its options.
  const choices =
    attached && !eligible.some((group) => group.id === attached.id)
      ? [attached, ...eligible]
      : eligible;

  if (choices.length === 0) return null;

  const options = attached
    ? alternativesFor(attached, meal, entry.item.id, book)
    : [];
  const current = options.find((option) => option.current);

  const groupFieldId = `${entry.item.id}-group`;
  const swapFieldId = `${entry.item.id}-swap`;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={groupFieldId} className="text-xs opacity-60">
          {t("groupLabel")}
        </label>
        <select
          id={groupFieldId}
          value={attached?.id ?? ""}
          onChange={(event) =>
            onSetGroup(event.target.value === "" ? undefined : event.target.value)
          }
          className={`${CONTROL_CLASS} py-1 text-xs`}
        >
          <option value="">{t("groupNone")}</option>
          {choices.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      {attached ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={swapFieldId} className="text-xs opacity-60">
            {t("swapLabel")}
          </label>
          <select
            id={swapFieldId}
            value={current?.key ?? ""}
            onChange={(event) => {
              const picked = options.find(
                (option) => option.key === event.target.value,
              );
              if (picked) onSwap(picked.ref);
            }}
            className={`${CONTROL_CLASS} py-1 text-xs`}
          >
            {/* Only when the slot's food left the group: otherwise every
                option below is a real food and an empty one would be a way to
                empty the plate by accident. */}
            {current === undefined ? <option value="" /> : null}
            {options.map((option) => (
              <option key={option.key} value={option.key} disabled={option.taken}>
                {option.name === undefined
                  ? t("swapUnknown")
                  : option.taken
                    ? t("swapTaken", { name: option.name })
                    : option.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Uncontrolled on purpose: `defaultValue` plus a key, so the box holds what is
 * being typed while the plan holds the last number that parsed. A controlled
 * value would fight the user over "12" on the way to "120" — and, because every
 * keystroke re-solves, would also rewrite the box from a solution it caused.
 */
function GramsBox({
  label,
  id,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  label: string;
  id: string;
  value: number;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs opacity-60">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={String(value)}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`${CONTROL_CLASS} w-20 py-1 text-right font-mono text-xs`}
      />
    </div>
  );
}
