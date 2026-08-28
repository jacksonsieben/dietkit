"use client";

import { useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { CONTROL_BOX, CONTROL_CLASS } from "@/components/Field";
import { MacroPanel } from "@/components/MacroPanel";
import {
  FoodPicker,
  SmallButton,
  type FoodChoice,
} from "@/components/FoodPicker";
import { Legend } from "@/components/nd/kit";
import { foodKey, type FoodBook } from "@/lib/diet/composition";
import { alternativesFor, findGroup, groupsForFood } from "@/lib/diet/groups";
import {
  ITEM_LIMITS,
  checkGrams,
  type ItemChanges,
  type ItemErrorCode,
} from "@/lib/diet/items";
import {
  OPTION_LIMITS,
  canAddOption,
  endsTheChoice,
  optionSetsOf,
  optionSignature,
  selectedOption,
  type OptionErrorCode,
} from "@/lib/diet/options";
import { reconcileMeal } from "@/lib/diet/reconcile";
import type { SolvedItem, SolvedMeal } from "@/lib/diet/solve";
import { portionCount, portionOf } from "@/lib/foods/portions";
import type {
  DietItem,
  DietOption,
  FoodRef,
  Id,
  Meal,
  OptionSet,
  SubstitutionGroup,
} from "@/lib/storage/types";

/**
 * What a meal is made of, and how much of it (#19, #111).
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
 *
 * A meal can also hold more than one list of rows (#111): *pão com queijo* or
 * *aveia com pasta de amendoim*, not "swap this bread for that oat". Each list
 * is a `Container` here, adds its own food and answers to its own row limit,
 * and only the selected version is on the plate and therefore solved.
 *
 * Those versions used to be drawn as what they are in the data — a named set,
 * a radio list, a name box and a row count per line, inside a border, above a
 * second list of rows. Six controls to answer "what am I having". Now the meal
 * shows a row of chips reading *Pão + ovo* / *Aveia + banana*, and the list
 * underneath is the meal's list (#H). The set survives in storage; on screen
 * there is no set, only this meal's versions.
 */

/** The writes a meal's versions accept, all of them the planner's (#111). */
export interface OptionActions {
  /** False once this meal already has versions — one question per meal (#H). */
  canAddSet: boolean;
  /** What is wrong with a version name in this meal, found on save. */
  error?: OptionErrorCode;
  /** Turns what the meal already holds into its first version (#H). */
  onStartOptions: () => void;
  onAddOption: (setId: Id) => void;
  onRemoveOption: (setId: Id, optionId: Id) => void;
  onRenameOption: (setId: Id, optionId: Id, name: string) => void;
  onSelectOption: (setId: Id, optionId: Id) => void;
}

export function MealItems({
  solved,
  groups,
  book,
  canAddTo,
  onAdd,
  onChange,
  onSetGroup,
  onSwap,
  onRemove,
  options,
}: {
  solved: SolvedMeal;
  groups: readonly SubstitutionGroup[];
  book: FoodBook;
  /** Per container, not per meal: an option's rows have their own ceiling. */
  canAddTo: (optionId?: Id) => boolean;
  onAdd: (choice: FoodChoice, optionId?: Id) => void;
  onChange: (itemId: Id, changes: ItemChanges) => void;
  onSetGroup: (itemId: Id, groupId: Id | undefined) => void;
  onSwap: (itemId: Id, food: FoodRef) => void;
  onRemove: (itemId: Id) => void;
  options: OptionActions;
}) {
  const t = useTranslations("Plan");

  const meal = solved.meal;
  const sets = optionSetsOf(meal);

  /**
   * Today's rows, by id.
   *
   * `solved.items` is `effectiveItems` minus whatever the book could not price,
   * so a row that is on the plate and absent from here is a row this device has
   * no numbers for — which is what `Container` prints instead of a portion.
   */
  const solvedById = new Map(
    solved.items.map((entry) => [entry.item.id, entry] as const),
  );

  return (
    <div className="flex flex-col gap-4 border-t border-nd-unlit pt-4">
      <Legend as="h3">{t("itemsHeading")}</Legend>

      {/* Once versions exist this list is empty and stays empty — `startOptions`
          moved it wholesale — so drawing it would put an "adicionar alimento"
          under a heading for food nobody has. It comes back for a meal written
          before #H, or imported, where those rows are real and every-day. */}
      {sets.length === 0 || meal.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {sets.length === 0 ? null : (
            <p className="text-xs text-nd-dim">{t("options.everyDay")}</p>
          )}

          <Container
            meal={meal}
            items={meal.items}
            solvedById={solvedById}
            groups={groups}
            book={book}
            canAdd={canAddTo(undefined)}
            onAdd={(choice) => onAdd(choice, undefined)}
            onChange={onChange}
            onSetGroup={onSetGroup}
            onSwap={onSwap}
            onRemove={onRemove}
          />
        </div>
      ) : null}

      {sets.map((set, index) => (
        <Versions
          key={set.id}
          set={set}
          /* One decision needs no name: the heading above already says what is
             being chosen. Two do — a plan imported from the old app asks for a
             carbohydrate and a protein in the same meal, and two unlabelled
             rows of chips are two questions nobody can tell apart (#122). */
          named={sets.length > 1 ? index + 1 : undefined}
          meal={meal}
          solvedById={solvedById}
          groups={groups}
          book={book}
          canAddTo={canAddTo}
          onAdd={onAdd}
          onChange={onChange}
          onSetGroup={onSetGroup}
          onSwap={onSwap}
          onRemove={onRemove}
          actions={options}
        />
      ))}

      {/* Offered on a meal that already has food, and nowhere else (#H): the
          button copies what is there into the first version, so on an empty
          meal it would be a button that explains an idea instead of doing
          something. Build the breakfast first, then say it has another form. */}
      {options.canAddSet && meal.items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <SmallButton
            label={t("options.start")}
            onClick={options.onStartOptions}
          />
          <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
            {t("options.startHint")}
          </p>
        </div>
      ) : null}

      {options.error ? (
        <p className="text-xs text-nd-red-ink">
          {t(`options.errors.${options.error}`, {
            max: OPTION_LIMITS.nameLength.max,
          })}
        </p>
      ) : null}

      <Outcome solved={solved} />
    </div>
  );
}

/**
 * One list of rows — the meal's own, or one option's — with the picker that
 * adds to it.
 *
 * The rows are looked up rather than iterated from the solve, because the order
 * on screen has to be the order in the plan and only this list knows it. A row
 * the solve did not return is the unknown-food case: red, and said in a
 * sentence beside it for anyone who cannot see red.
 */
function Container({
  meal,
  items,
  optionId,
  solvedById,
  groups,
  book,
  canAdd,
  onAdd,
  onChange,
  onSetGroup,
  onSwap,
  onRemove,
}: {
  meal: Meal;
  items: readonly DietItem[];
  optionId?: Id;
  solvedById: ReadonlyMap<Id, SolvedItem>;
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

  // This list's own foods: the same food may sit in two options of one set,
  // because those are alternatives that are never on the same plate.
  const taken = new Set(items.map((item) => item.food));

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="text-xs text-nd-dim">
          {t(optionId === undefined ? "itemsEmpty" : "options.optionEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const entry = solvedById.get(item.id);

            return entry === undefined ? (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-nd-unlit py-3 first:border-t-0"
              >
                <p className="border-l-2 border-nd-red pl-3 text-xs text-nd-red-ink">
                  {t("itemUnknown")}
                </p>
                <SmallButton
                  label={t("remove")}
                  onClick={() => onRemove(item.id)}
                />
              </li>
            ) : (
              <ItemRow
                key={item.id}
                entry={entry}
                meal={meal}
                groups={groups}
                book={book}
                onChange={(changes) => onChange(item.id, changes)}
                onSetGroup={(groupId) => onSetGroup(item.id, groupId)}
                onSwap={(food) => onSwap(item.id, food)}
                onRemove={() => onRemove(item.id)}
              />
            );
          })}
        </ul>
      )}

      {picking ? (
        <FoodPicker
          inputId={`${optionId ?? meal.id}-food-picker`}
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
            <p className="text-xs text-nd-dim">
              {t("itemLimit", { max: ITEM_LIMITS.count.max })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The versions of one meal, as a row of chips (#111, #H).
 *
 * It is a radio group, because that is what it is: the versions are mutually
 * exclusive, exactly one is on the plate, and the selection is stored on the
 * plan rather than held here, so reopening the app shows the breakfast that was
 * chosen and not the first one in the list. What changed is that it no longer
 * *looks* like a form: the input is `sr-only` and the label is the chip, lit
 * for the selected one the way every other chosen thing in this app is lit.
 *
 * Only the selected version's rows are drawn, and they are drawn as the meal's
 * rows — no border, no box inside a box, nothing announcing that this list is a
 * special kind of list. An unselected version is not solved (it is not part of
 * today's meal at all), so there are no grams to print for it, and inventing
 * some would be the "four breakfasts, one target" arithmetic `solve.ts`
 * refuses to do. Editing one means selecting it, which is one tap and is also
 * how a person sees what it comes to.
 *
 * Renaming and deleting sit behind a disclosure, because they are things you do
 * to a version and not things you do with one. Naming is optional now — the
 * chip reads the food.
 */
function Versions({
  set,
  named,
  meal,
  solvedById,
  groups,
  book,
  canAddTo,
  onAdd,
  onChange,
  onSetGroup,
  onSwap,
  onRemove,
  actions,
}: {
  set: OptionSet;
  /** Its position, when the meal holds more than one set. Undefined names nothing. */
  named?: number;
  meal: Meal;
  solvedById: ReadonlyMap<Id, SolvedItem>;
  groups: readonly SubstitutionGroup[];
  book: FoodBook;
  canAddTo: (optionId?: Id) => boolean;
  onAdd: (choice: FoodChoice, optionId?: Id) => void;
  onChange: (itemId: Id, changes: ItemChanges) => void;
  onSetGroup: (itemId: Id, groupId: Id | undefined) => void;
  onSwap: (itemId: Id, food: FoodRef) => void;
  onRemove: (itemId: Id) => void;
  actions: OptionActions;
}) {
  const t = useTranslations("Plan");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const selected = selectedOption(set);
  const label = (option: DietOption, index: number) =>
    versionLabel(option, index + 1, book, (position) =>
      t("options.versionFallback", { position }),
    );

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        {named === undefined ? (
          <legend className="sr-only">{t("options.versionsLegend")}</legend>
        ) : (
          <legend className="text-xs text-nd-dim">
            {set.name === ""
              ? t("options.setFallback", { position: named })
              : set.name}
          </legend>
        )}

        <div className="flex flex-wrap gap-2">
          {set.options.map((option, index) => {
            const on = option.id === selected?.id;

            return (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center border px-3 py-2 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-nd-ink ${
                  on
                    ? "nd-invert border-nd-ink bg-nd-ink text-nd-ground"
                    : "border-nd-unlit text-nd-dim"
                }`}
              >
                <input
                  type="radio"
                  name={`${set.id}-selected`}
                  className="sr-only"
                  checked={on}
                  onChange={() => {
                    setConfirming(false);
                    actions.onSelectOption(set.id, option.id);
                  }}
                />
                {label(option, index)}
              </label>
            );
          })}

          {canAddOption(set) ? (
            <SmallButton
              label={t("options.add")}
              onClick={() => actions.onAddOption(set.id)}
            />
          ) : (
            <p className="self-center text-xs text-nd-dim">
              {t("options.limit", { max: OPTION_LIMITS.options.max })}
            </p>
          )}
        </div>
      </fieldset>

      {selected === undefined ? null : (
        <>
          <Container
            meal={meal}
            items={selected.items}
            optionId={selected.id}
            solvedById={solvedById}
            groups={groups}
            book={book}
            canAdd={canAddTo(selected.id)}
            onAdd={(choice) => onAdd(choice, selected.id)}
            onChange={onChange}
            onSetGroup={onSetGroup}
            onSwap={onSwap}
            onRemove={onRemove}
          />

          <Disclosure
            summary={t("options.settings")}
            open={editing}
            onToggle={() => {
              setEditing(!editing);
              setConfirming(false);
            }}
          >
            <label className="flex min-w-40 flex-1 flex-col gap-1">
              <span className="text-xs text-nd-dim">
                {t("options.nameLabel")}
              </span>
              <input
                type="text"
                autoComplete="off"
                placeholder={label(selected, set.options.indexOf(selected))}
                value={selected.name}
                onChange={(event) =>
                  actions.onRenameOption(
                    set.id,
                    selected.id,
                    event.target.value,
                  )
                }
                className={`${CONTROL_CLASS} py-1 text-sm`}
              />
            </label>

            <SmallButton
              label={t("options.remove")}
              onClick={() => setConfirming(true)}
            />
          </Disclosure>

          {/* Asked rather than done: a version is the only place its rows live.
              Deleting the second-to-last one is not refused any more — the
              other version becomes the meal — but that is a different sentence
              from "this deletes three foods", so it is a different warning. */}
          {confirming ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="max-w-prose text-xs leading-relaxed text-nd-red-ink">
                {endsTheChoice(set)
                  ? t("options.removeLast", {
                      name: survivorLabel(set, selected, book, (position) =>
                        t("options.versionFallback", { position }),
                      ),
                    })
                  : t("options.removeWarning", {
                      count: selected.items.length,
                    })}
              </p>
              <SmallButton
                label={t("options.removeConfirm")}
                onClick={() => {
                  setConfirming(false);
                  setEditing(false);
                  actions.onRemoveOption(set.id, selected.id);
                }}
              />
              <SmallButton
                label={t("options.cancel")}
                onClick={() => setConfirming(false)}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * What a version is called on its chip (#H).
 *
 * The typed name if there is one, and otherwise the first two foods in it —
 * *Pão + ovo*. TACO describes a food down to how it was cooked ("Arroz,
 * integral, cozido"), which is right in a row and far too long on a chip, so
 * only the part before the first comma survives. An empty version has nothing
 * to be named after and falls back to its position, which is the one case where
 * the old "Opção 2" was the honest answer.
 */
function versionLabel(
  option: DietOption,
  position: number,
  book: FoodBook,
  fallback: (position: number) => string,
): string {
  const typed = option.name.trim();
  if (typed !== "") return typed;

  const foods = optionSignature(option)
    .map((ref) => book.get(foodKey(ref))?.name.split(",")[0]?.trim())
    .filter((name) => name !== undefined && name !== "");

  return foods.length === 0 ? fallback(position) : foods.join(" + ");
}

/** The version that becomes the meal, named, for the warning that says so. */
function survivorLabel(
  set: OptionSet,
  going: DietOption,
  book: FoodBook,
  fallback: (position: number) => string,
): string {
  const index = set.options.findIndex((option) => option.id !== going.id);
  const survivor = set.options[index];

  return survivor === undefined
    ? fallback(1)
    : versionLabel(survivor, index + 1, book, fallback);
}

/**
 * Whether this meal's numbers were met, and if not, by how much and because of
 * what.
 *
 * Printed for every meal, including the empty one someone has just added: the
 * panel is what the screen is *for*, so hiding it until a meal has food would
 * mean the first thing a new meal does is not say what it owes the day (#21).
 *
 * The residual is not recomputed here — `reconcileMeal` subtracts the two
 * numbers the panel prints, which are the same solved values the rows above it
 * were rendered from.
 */
function Outcome({ solved }: { solved: SolvedMeal }) {
  const t = useTranslations("Plan");

  return (
    <div className="flex flex-col gap-2">
      <MacroPanel
        heading={t("reconcile.mealHeading")}
        reconciliation={reconcileMeal(solved)}
        density="meal"
      />

      {/* Why it did not close, in the only terms that let someone fix it. */}
      {solved.items.some((entry) => entry.limiting) ? (
        <p className="text-xs text-nd-dim">
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

/**
 * One food, and one control (#E).
 *
 * The row used to carry six: remove, a pin checkbox, a minimum, a maximum, a
 * group and a swap. Six is what a row *can* say; it is not what a row is
 * usually asked. The common answer is "I do not care, work it out" — so that
 * is the default, it is a single two-way choice, and everything else moved
 * behind a summary that still reads its own value while closed.
 *
 * The choice is `mandatory` under another name. "O app decide" is a range for
 * the solver to search; "Eu escolho" is a number it may not touch. Naming them
 * after who decides rather than after the flag is the whole readability win:
 * "Quantidade fixa" describes the data, and these describe the question.
 *
 * `item.mandatory` rather than `entry.pinned` drives all of it. The solver
 * calls a row pinned whenever its bounds meet, which a free row with a minimum
 * equal to its maximum also does — and keying the controls off that put a
 * typed-quantity box under a row whose own switch said the app was deciding.
 */
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
  const tPortion = useTranslations("Portions");
  const format = useFormatter();

  const [error, setError] = useState<ItemErrorCode | undefined>(undefined);
  const [range, setRange] = useState(false);

  const grams = (value: number) => format.number(Math.round(value));
  const errorId = `${entry.item.id}-item-error`;
  const mine = entry.item.mandatory;

  /*
   * What the grams look like on a plate (#D).
   *
   * `307 g` of egg is arithmetic nobody can picture, and picturing it is the
   * whole job of this line. Only some foods have a unit worth counting and only
   * some amounts are worth counting in it, so this is usually nothing — which
   * is the point: an occasional gloss, not another column.
   *
   * Read from the grams every time it is drawn rather than stored beside them.
   * The portion weights are the app's own estimates, not TACO's, and keeping
   * them out of the plan is what lets a better estimate replace them later.
   */
  const portion = portionOf(entry.item.food);
  const portionUnits =
    portion === undefined ? undefined : portionCount(entry.quantityG, portion);

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
    <li className="flex flex-col gap-3 border-t border-nd-unlit py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">{entry.food.name}</p>
        <SmallButton label={t("remove")} onClick={onRemove} />
      </div>

      <p className="font-mono text-xs text-nd-dim" data-numeric="">
        {mine ? null : (
          <span className="font-bold text-nd-ink">
            {t("itemGrams", { grams: grams(entry.quantityG) })}
            {" · "}
          </span>
        )}
        {/* The grams are suppressed above because the box below repeats them;
            the portion is not, because the box counts grams and never
            colheres — which is the half of the line worth reading. */}
        {portion === undefined || portionUnits === undefined ? null : (
          <>
            {tPortion(portion.unit, { count: portionUnits })}
            {" · "}
          </>
        )}
        {t("macros", {
          protein: grams(entry.macros.proteinG),
          carb: grams(entry.macros.carbG),
          fat: grams(entry.macros.fatG),
        })}
      </p>

      {/* The one control. A radio group and not a checkbox, because the two
          answers are both real answers and a checkbox only ever names one. */}
      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <legend className="sr-only">
          {t("decideLegend", { food: entry.food.name })}
        </legend>

        {([false, true] as const).map((typed) => (
          <label
            key={String(typed)}
            className="flex items-center gap-2 text-xs"
          >
            <input
              type="radio"
              name={`${entry.item.id}-decide`}
              className="accent-nd-ink"
              checked={mine === typed}
              // Pinning at what it is already worth, so nothing jumps at the
              // moment the user says "this much and no less".
              onChange={() =>
                onChange({ mandatory: typed, quantityG: entry.quantityG })
              }
            />
            {t(typed ? "decideMe" : "decideApp")}
          </label>
        ))}
      </fieldset>

      {mine ? (
        <div className="flex flex-wrap items-end gap-3">
          <GramsBox
            label={t("quantityLabel")}
            id={`${entry.item.id}-quantity`}
            value={entry.item.quantityG}
            invalid={error !== undefined}
            describedBy={error ? errorId : undefined}
            onChange={(raw) => onGrams("quantityG", raw)}
          />
        </div>
      ) : (
        <Disclosure
          summary={t("rangeSummary", {
            min: entry.item.minG,
            max: entry.item.maxG,
          })}
          open={range}
          onToggle={() => setRange(!range)}
        >
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
        </Disclosure>
      )}

      <SlotGroup
        entry={entry}
        meal={meal}
        groups={groups}
        book={book}
        onSetGroup={onSetGroup}
        onSwap={onSwap}
      />

      {error ? (
        <p id={errorId} className="text-xs text-nd-red-ink">
          {t(`itemErrors.${error}`, { max: ITEM_LIMITS.gramsG.max })}
        </p>
      ) : null}
    </li>
  );
}

/**
 * A setting that reads itself while closed.
 *
 * The summary is the whole design: "Entre 0 e 500 g" and "Grupo: Frutas" say
 * what the setting *is*, so folding them away hides the means of changing a
 * number and never the number. A disclosure labelled "Limites" would make
 * someone open it to find out whether they cared, which is the same six
 * controls with an extra tap in front.
 *
 * Drawn as an unlit cell rather than a `SmallButton`: it is a setting at rest,
 * not an action, and a row of uppercase ghost buttons is what this pass exists
 * to remove. No `aria-controls` — the panel is the button's next sibling, which
 * is the disclosure pattern's own answer to where it went.
 */
function Disclosure({
  summary,
  open,
  onToggle,
  children,
}: {
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-fit items-center gap-2 border border-nd-unlit px-2 py-1 text-xs text-nd-dim"
      >
        {summary}
        <span aria-hidden="true" className="font-mono font-bold">
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? (
        <div className="flex flex-wrap items-end gap-3">{children}</div>
      ) : null}
    </div>
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
 *
 * Folded away (#E). Two `<select>`s on every row is the shape a screen takes
 * when a feature nobody has set up yet is drawn at the same weight as the
 * quantity — and until someone builds a group there is nothing here at all, so
 * the row that is already open is the wrong place to advertise it. Closed, the
 * summary names the attached group, which is the only part a reader scanning
 * the meal needs.
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
  const [open, setOpen] = useState(false);

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
    <Disclosure
      summary={
        attached
          ? t("slotSummaryGroup", { group: attached.name })
          : t("slotSummary")
      }
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={groupFieldId} className="text-xs text-nd-dim">
          {t("groupLabel")}
        </label>
        <select
          id={groupFieldId}
          value={attached?.id ?? ""}
          onChange={(event) =>
            onSetGroup(
              event.target.value === "" ? undefined : event.target.value,
            )
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
          <label htmlFor={swapFieldId} className="text-xs text-nd-dim">
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
              <option
                key={option.key}
                value={option.key}
                disabled={option.taken}
              >
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
    </Disclosure>
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
      <label htmlFor={id} className="text-xs text-nd-dim">
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
        className={`${CONTROL_BOX} w-20 py-1 text-right font-mono text-xs`}
      />
    </div>
  );
}
