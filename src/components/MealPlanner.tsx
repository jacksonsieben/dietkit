"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";

import { displayFontSize, DotText } from "@/components/dot/DotText";
import { Field } from "@/components/Field";
import { MacroPanel } from "@/components/MacroPanel";
import { type FoodChoice } from "@/components/FoodPicker";
import { MealItems } from "@/components/MealItems";
import {
  Action,
  ActionButton,
  Ghost,
  Legend,
  Rule,
  TextLink,
} from "@/components/nd/kit";
import { todayIsoDate } from "@/lib/date";
import { looseCeilings, tightenCeilings } from "@/lib/diet/ceilings";
import { buildFoodBook, usedTacoFoods } from "@/lib/diet/composition";
import { distributeTargets, sharePercents } from "@/lib/diet/distribute";
import { groupCompositions } from "@/lib/diet/groups";
import {
  DEFAULT_ITEM,
  addItem,
  canAddItem,
  newItem,
  removeItem,
  setItemGroup,
  swapFood,
  updateItem,
  type ItemChanges,
} from "@/lib/diet/items";
import {
  MEAL_LIMITS,
  addMeal,
  canAddMeal,
  canRemoveMeal,
  checkMealName,
  checkSharePercent,
  evenShares,
  mealsFromNames,
  moveMeal,
  removeMeal,
  renameMeal,
  setShare,
  type MealErrorCode,
} from "@/lib/diet/meals";
import {
  addOption,
  canAddSet,
  checkMealOptions,
  effectiveItems,
  isBlankPlan,
  removeOption,
  renameOption,
  selectOption,
  startOptions,
  trimOptionNames,
  type OptionErrorCode,
} from "@/lib/diet/options";
import { loadPlan, newPlan, savePlan } from "@/lib/diet/plan";
import { planKnowsItsWeight, rebasePlan, weightDrift } from "@/lib/diet/rebase";
import {
  reconcileDay,
  reconcileMeal,
  type MacroLine,
} from "@/lib/diet/reconcile";
import { applySolution, solvePlan, type SolvedMeal } from "@/lib/diet/solve";
import { loadGoal } from "@/lib/energy/goal";
import { planMacros } from "@/lib/energy/macros";
import { loadEnergySummary } from "@/lib/energy/summary";
import { ceilingFor } from "@/lib/foods/portions";
import { getRepository } from "@/lib/storage";
import type {
  CustomFood,
  Diet,
  FoodRef,
  Id,
  MacroSet,
  Meal,
  SubstitutionGroup,
} from "@/lib/storage/types";

/**
 * The day as a list the user writes (#18), and one meal at a time.
 *
 * ## Two screens, one component
 *
 * The day list and a single meal are separate screens. They used to be one: the
 * list rendered every meal's foods, option sets, bounds and four-line
 * reconciliation inline, which on a four-meal plan came to some thirteen
 * phone screens and ninety-odd controls before anyone had chosen a food. A day
 * is a thing you scan; a meal is a thing you edit. Those are different jobs and
 * they now get different screens.
 *
 * Both are this one component, on the same route, with `?refeicao=<id>`
 * deciding which. Not two routes, because the plan being edited lives in this
 * component's state and is written to the store only on *Salvar* — navigating
 * would unmount it and take the draft with it. The switch is a native
 * `history.pushState`, which Next's router reads, so the URL, the back button
 * and `useSearchParams` all agree without a navigation happening.
 *
 * The predecessor had four meals compiled into it and split the targets evenly
 * between them. This screen is the argument against both halves of that: the
 * list starts at three because a day has to start somewhere, and every row can
 * be renamed, reordered, deleted or resized. The percentage box is the part
 * that matters most — a plan where lunch is a third of the day and the
 * mid-afternoon snack is a twentieth is the ordinary case, not an advanced one.
 *
 * Whatever is typed, the day still closes: changing one share redistributes the
 * others (see `setShare`) and the grams are apportioned rather than rounded
 * (see `distributeTargets`), so the table under the target always adds back up
 * to it. That is the whole reason those two live in `lib` with tests instead of
 * here.
 *
 * A client component for the reason every personal-data screen here is one: the
 * profile, the goal and the plan are all in IndexedDB on the device, and there
 * is nothing a server could have rendered.
 */

type Status =
  "loading" | "ready" | "saving" | "saved" | "loadFailed" | "saveFailed";

interface Loaded {
  /**
   * The plan as it stands, targets included.
   *
   * The targets are read off the plan rather than off `current` because they
   * are what its meals were apportioned from: a plan whose numbers followed the
   * scale on their own would be a day that no longer adds up, changed on a visit
   * the user did not ask for anything on (#25, and `savePlan`'s note).
   */
  plan: Diet;
  /**
   * What the profile and the latest logged weight say *today*.
   *
   * Kept beside the plan rather than merged into it: the whole of #25 is the
   * difference between the two being visible, and one action away from being
   * closed. For a plan built on this visit the two agree, and nothing shows.
   */
  current: { targets: MacroSet; weightKg: number };
  /**
   * The user's own foods, read live rather than snapshotted into the plan.
   *
   * The asymmetry with `plan.tacoFoods` is deliberate and `FoodComposition`
   * explains it: a published row must not change under a plan someone wrote,
   * and a food the user typed themselves must.
   */
  customFoods: CustomFood[];
  /**
   * The substitution groups on this device (#20).
   *
   * Read here rather than inside the item row so that every row is offered the
   * same list, and so the compositions the groups carry can go into the food
   * book below: a group's alternatives are by definition foods the plan is not
   * using, so nothing else on the device knows what they are worth.
   */
  groups: SubstitutionGroup[];
  /**
   * Whether this plan is one nobody has written yet.
   *
   * The three ways to start a diet are peers (#114): an empty list, a published
   * model, or a file from the predecessor. Only the first one is a screen, so
   * the other two have to be offered on it -- and only while it is still empty,
   * because a link marked "start over" beside a plan somebody spent an evening
   * on is not an offer, it is a hazard.
   */
  fresh: boolean;
}

type MealErrors = Record<
  Id,
  { name?: MealErrorCode; share?: MealErrorCode; options?: OptionErrorCode }
>;

export function MealPlanner({
  /**
   * The day's title and explainer, drawn by the server page.
   *
   * It arrives as a slot rather than being rendered above this component
   * because only this component knows which of the two screens is showing,
   * and the meal screen must not carry the day's header. See `dieta/page.tsx`.
   */
  header,
}: {
  header?: ReactNode;
}) {
  const t = useTranslations("Plan");
  const format = useFormatter();

  /**
   * Which of the two screens this is, read from `?refeicao=<id>`.
   *
   * A query parameter rather than a second route, and pushed with the native
   * History API rather than the router, because the draft plan lives in this
   * component's state until *Salvar* — see `show` below. The parameter is what
   * makes a meal deep-linkable and the back button work anyway.
   */
  const params = useSearchParams();

  /**
   * The header, plus whichever single line this screen has been reduced to.
   *
   * Loading, load failure and "no profile yet" are all states of the day, so
   * they keep the day's heading above them; the parameter is read directly
   * rather than through `open`, which needs meals this component has not read
   * from the store yet. The gap matches `Shell`'s, because that is where this
   * block would have sat if the header had not moved in here.
   */
  const dayState = (line: ReactNode) =>
    params.get("refeicao") === null ? (
      <div className="flex flex-col gap-10">
        {header}
        {line}
      </div>
    ) : (
      line
    );

  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [missing, setMissing] = useState<"profile" | "weight" | undefined>(
    undefined,
  );
  const [errors, setErrors] = useState<MealErrors>({});
  const [status, setStatus] = useState<Status>("loading");
  const [dirty, setDirty] = useState(false);

  /** Whether the day list is showing its move and remove buttons. */
  const [reordering, setReordering] = useState(false);

  /**
   * The share box being typed in, and the characters in it.
   *
   * Held apart from the plan because the two disagree on purpose while someone
   * types: "3" on the way to "30" is a valid 3%, and applying it would rewrite
   * every other row's percentage between two keystrokes. So the edited box
   * shows what was typed and the rest of the table shows the plan, and on blur
   * the box goes back to reading from the plan like the others.
   */
  const [typing, setTyping] = useState<{ id: Id; text: string } | undefined>(
    undefined,
  );

  // A ref rather than an effect dependency: these are read once, to name the
  // meals of a plan that does not exist yet, and re-running the load because a
  // translation function was re-created would throw away the user's edits.
  const defaultNames = useRef([
    t("defaultMeal.breakfast"),
    t("defaultMeal.lunch"),
    t("defaultMeal.dinner"),
  ]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const repository = getRepository();
        const [energy, goal, stored, customFoods, groups] = await Promise.all([
          loadEnergySummary(repository, todayIsoDate()),
          loadGoal(repository),
          loadPlan(repository),
          repository.customFoods.list(),
          repository.substitutionGroups.list(),
        ]);
        if (cancelled) return;

        if (energy.status === "missing") {
          setMissing(energy.needs);
          setStatus("ready");
          return;
        }

        const macros = planMacros({
          totalDailyEnergyExpenditure:
            energy.summary.totalDailyEnergyExpenditure,
          weightKg: energy.summary.weightKg,
          goal,
        });

        setLoaded({
          fresh: stored === undefined,
          current: {
            targets: macros.targets,
            weightKg: energy.summary.weightKg,
          },
          customFoods,
          groups,
          // `newPlan` builds without writing: someone who opens this screen and
          // leaves should not find a diet in their store tomorrow.
          plan:
            stored ??
            newPlan(
              { id: crypto.randomUUID(), name: t("planName") },
              mealsFromNames(
                defaultNames.current.map((name) => ({
                  id: crypto.randomUUID(),
                  name,
                })),
              ),
              macros.targets,
              energy.summary.weightKg,
              new Date().toISOString(),
            ),
        });
        setStatus("ready");
      } catch {
        // Includes the deliberate throws from `planMacros` on a body the store
        // should never have held — better this than grams built from nonsense.
        if (!cancelled) setStatus("loadFailed");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see `defaultNames`
  }, []);

  if (status === "loading") {
    return dayState(<p className="text-sm text-nd-dim">{t("loading")}</p>);
  }

  if (status === "loadFailed") {
    return dayState(
      <p className="text-sm text-nd-red-ink">{t("loadError")}</p>,
    );
  }

  if (missing) {
    return dayState(
      <section className="flex flex-col items-start gap-4">
        <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
          {missing === "profile" ? t("missingProfile") : t("missingWeight")}
        </p>
        <Action href="/perfil">{t("missingLink")}</Action>
      </section>,
    );
  }

  if (!loaded) {
    return dayState(
      <p className="text-sm text-nd-red-ink">{t("loadError")}</p>,
    );
  }

  const meals = loaded.plan.meals;
  const targets = loaded.plan.targets;
  const rows = distributeTargets(targets, meals);
  const percents = sharePercents(meals);

  /**
   * How far the body has moved since this plan was written (#25).
   *
   * Derived rather than held in state, like `solved` below and for the same
   * reason: it is a function of the plan and the latest weight, both of which
   * are already here, and a copy could only ever disagree with them. Pressing
   * *Recalcular* changes the plan, which is what makes this go away — nothing
   * has to remember that it was dismissed.
   */
  const drift = weightDrift(loaded.plan, loaded.current.weightKg);

  /**
   * How many rows predate the per-type ceilings (#D).
   *
   * Derived for `drift`'s reason, and it goes away the same way: tightening
   * changes the rows, the count recomputes to zero, and nothing has to remember
   * that the offer was taken.
   */
  const loose = looseCeilings(meals);

  /**
   * Solved during render, not in state.
   *
   * It is a pure function of the plan and the compositions, and a solve of a
   * day's worth of meals costs well under a millisecond (see the benchmarks on
   * `boundedLeastSquares`). Keeping it in state would mean a second copy of the
   * answer that can disagree with the plan it came from — which, on a screen
   * whose whole job is that the numbers add up, is the bug not worth the
   * memoisation.
   */
  const book = buildFoodBook(
    [...(loaded.plan.tacoFoods ?? []), ...groupCompositions(loaded.groups)],
    loaded.customFoods,
  );
  const solved = solvePlan(targets, meals, book);

  /** Drops the "salvo" note, so a reassurance never stands over changed numbers. */
  const apply = (next: Meal[]) => {
    setLoaded(
      (current) =>
        current && { ...current, plan: { ...current.plan, meals: next } },
    );
    setDirty(true);
    setStatus((current) => (current === "saved" ? "ready" : current));
  };

  const clearError = (id: Id, field: "name" | "share") => {
    setErrors((current) => {
      if (!current[id]?.[field]) return current;
      const { [field]: _cleared, ...rest } = current[id];
      return { ...current, [id]: rest };
    });
  };

  const onRename = (id: Id, name: string) => {
    apply(renameMeal(meals, id, name));
    clearError(id, "name");
  };

  const onShare = (id: Id, text: string) => {
    setTyping({ id, text });

    const checked = checkSharePercent(text);
    if ("error" in checked) {
      setErrors((current) => ({
        ...current,
        [id]: { ...current[id], share: checked.error },
      }));
      return;
    }

    clearError(id, "share");
    apply(setShare(meals, id, checked.value));
  };

  const onAdd = () => {
    apply(
      addMeal(meals, {
        id: crypto.randomUUID(),
        name: t("newMealName", { position: meals.length + 1 }),
        share: 0,
        items: [],
      }),
    );
  };

  const onRemove = (id: Id) => {
    setTyping(undefined);
    apply(removeMeal(meals, id));
    setErrors((current) => {
      const { [id]: _gone, ...rest } = current;
      return rest;
    });
  };

  /**
   * A food chosen, and the composition that came with it.
   *
   * The TACO snapshot is written into the plan in the same update that adds the
   * item, because an item pointing at a row the plan cannot price is exactly the
   * "unknown food" state — and there is no reason to pass through it when the
   * numbers are already in hand.
   */
  const onAddFood = (mealId: Id, choice: FoodChoice, optionId?: Id) => {
    /*
     * The ceiling comes from the picker, not from the plan.
     *
     * A row used to arrive able to grow to 500 g whatever it held, which is how
     * a solver closing a protein gap arrives at six eggs and how 500 g of olive
     * oil stays a legal answer to a 2.000 kcal day. The TACO group is the
     * coarsest thing that has an opinion about it, and the picker is the only
     * place that knows it — nothing about the food's group is stored, so this
     * is decided once, here, and lives on afterwards as the `maxG` the user can
     * raise on the row itself.
     */
    const item = newItem(
      choice.ref,
      crypto.randomUUID(),
      choice.servingG,
      ceilingFor(choice.groupSlug),
    );

    setLoaded((current) => {
      if (!current) return current;

      const tacoFoods =
        choice.composition === undefined
          ? current.plan.tacoFoods
          : [
              ...(current.plan.tacoFoods ?? []).filter(
                (food) => food.tacoId !== choice.composition?.tacoId,
              ),
              choice.composition,
            ];

      return {
        ...current,
        // Keeping the picked food current here too: it was read from the device
        // by the picker, and it may be newer than the list loaded at mount.
        customFoods:
          choice.custom === undefined
            ? current.customFoods
            : [
                ...current.customFoods.filter(
                  (food) => food.id !== choice.custom?.id,
                ),
                choice.custom,
              ],
        plan: {
          ...current.plan,
          tacoFoods,
          meals: addItem(current.plan.meals, mealId, item, optionId),
        },
      };
    });

    setDirty(true);
    setStatus((current) => (current === "saved" ? "ready" : current));
  };

  const onChangeItem = (mealId: Id, itemId: Id, changes: ItemChanges) => {
    apply(updateItem(meals, mealId, itemId, changes));
  };

  /**
   * One member of a group swapped in for another (#20).
   *
   * The plan takes the new food's snapshot with it, for `onAddFood`'s reason:
   * `usedTacoFoods` keeps only what the items point at, so a food that arrived
   * from a group and left no copy behind would come back as an unknown row the
   * next time the plan is opened. The group's own copy is not enough — deleting
   * the group later would take the plan's numbers with it.
   *
   * No arithmetic here, deliberately. The bounds stay where they were and the
   * next render re-solves the meal, which is what makes a swap keep the macro
   * targets rather than merely keeping the grams.
   */
  const onSwapFood = (mealId: Id, itemId: Id, food: FoodRef) => {
    setLoaded((current) => {
      if (!current) return current;

      const known = current.plan.tacoFoods ?? [];
      const snapshot =
        food.source === "taco" && !known.some((f) => f.tacoId === food.tacoId)
          ? groupCompositions(current.groups).find(
              (f) => f.tacoId === food.tacoId,
            )
          : undefined;

      return {
        ...current,
        plan: {
          ...current.plan,
          tacoFoods:
            snapshot === undefined
              ? current.plan.tacoFoods
              : [...known, snapshot],
          meals: swapFood(current.plan.meals, mealId, itemId, food),
        },
      };
    });

    setDirty(true);
    setStatus((current) => (current === "saved" ? "ready" : current));
  };

  /**
   * Rebuild the day's targets from the weight that is on the scale now.
   *
   * One click, deliberately: #25's complaint is that the alternative — going
   * back through the profile and re-entering everything to move one number —
   * is enough friction that people stop closing the loop and keep eating a plan
   * written for a body they no longer have. Nothing is asked because nothing is
   * lost: the meals, shares and foods are untouched (see `rebasePlan`), the new
   * portions are visible before anything is written, and the plan in the store
   * is unchanged until *Salvar*.
   */
  const rebase = () => {
    setLoaded(
      (state) =>
        state && {
          ...state,
          plan: rebasePlan(
            state.plan,
            state.current.targets,
            state.current.weightKg,
          ),
        },
    );
    setDirty(true);
    setStatus("ready");
  };

  /**
   * Bring the rows that predate the ceilings down to them (#D).
   *
   * One click for the same reason `rebase` is one: the alternative is opening
   * every row and typing a number this app already knows, which is friction
   * enough that nobody does it — and, like the rebuild, nothing is lost. Only
   * the maximums move, the new portions are on screen before anything is
   * written, and the stored plan is unchanged until *Salvar*.
   */
  const tighten = () => apply(tightenCeilings(meals));

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // The whole form in one pass, as everywhere else here: making someone
    // discover the next bad row only after fixing the last one is a worse form.
    const found: MealErrors = {};
    for (const meal of meals) {
      const checked = checkMealName(meal.name);
      if ("error" in checked)
        found[meal.id] = { ...found[meal.id], name: checked.error };
      if (errors[meal.id]?.share) {
        found[meal.id] = { ...found[meal.id], share: errors[meal.id].share };
      }
      const options = checkMealOptions(meal);
      if (options) found[meal.id] = { ...found[meal.id], options };
    }

    if (Object.keys(found).length > 0) {
      setErrors(found);
      setStatus("ready");

      /*
       * The bad row may be on the other screen. Saving from the day list with
       * an empty name three meals down used to mark the error where nobody was
       * looking, so the button did nothing as far as the user could tell; the
       * split makes that failure mode possible, so the split has to answer it.
       */
      const first = meals.find((meal) => found[meal.id]);
      if (first && first.id !== params.get("refeicao")) show(first.id);
      return;
    }

    setErrors({});
    setStatus("saving");

    // What gets stored is what is on screen: the solved quantities, not the
    // ones the items were carrying before the solve. Anything else and reopening
    // the plan would show different portions from the ones just saved.
    const settled = applySolution(meals, solved).map((meal) => ({
      ...trimOptionNames(meal),
      name: meal.name.trim(),
    }));

    try {
      const saved = await savePlan(
        getRepository(),
        {
          ...loaded.plan,
          meals: settled,
          tacoFoods: usedTacoFoods(settled, loaded.plan.tacoFoods ?? []),
        },
        new Date().toISOString(),
      );

      setLoaded((current) => current && { ...current, plan: saved });
      setDirty(false);
      setStatus("saved");
    } catch {
      setStatus("saveFailed");
    }
  };

  const dayKcal = String(Math.round(targets.kcal));

  /**
   * Which meal is open, or none.
   *
   * The day and one meal are two screens (see this file's header note), and the
   * one thing that decides which of them you are looking at is a query
   * parameter. By id and not by index, because the list reorders and a plan
   * bookmarked at "the third meal" would follow the position rather than the
   * meal; and an id that is no longer in the plan simply falls back to the day,
   * which is what should happen after the open meal is deleted.
   */
  const openIndex = meals.findIndex(
    (meal) => meal.id === params.get("refeicao"),
  );
  const open = openIndex === -1 ? undefined : openIndex;

  /**
   * Move between the two screens without leaving the component.
   *
   * `window.history.pushState` rather than a router push, and the same route
   * either way: this component holds the whole unsaved draft in state and a
   * real navigation would unmount it, so opening a meal would silently throw
   * away everything typed since the last *Salvar*. Next's router reads pushes
   * made this way and re-runs `useSearchParams`, so the URL, the back button
   * and the render stay in agreement — which matters more here than usual,
   * because installed as a PWA there is no browser chrome to fall back on.
   */
  const show = (mealId: Id | undefined) => {
    setReordering(false);
    setTyping(undefined);
    window.history.pushState(
      null,
      "",
      mealId === undefined
        ? window.location.pathname
        : `?refeicao=${encodeURIComponent(mealId)}`,
    );
    window.scrollTo({ top: 0 });
  };

  const mealMessage = (code: MealErrorCode) =>
    t(`errors.${code}`, {
      max: MEAL_LIMITS.nameLength.max,
      min: MEAL_LIMITS.sharePercent.min,
    });

  /**
   * A meal's foods and options, wired to the planner's writes.
   *
   * Lifted out of the render because the wiring is twenty lines of callbacks
   * and the meal screen it belongs to is short enough that they would be the
   * only thing anyone saw in it.
   */
  const itemsFor = (index: number) => {
    const meal = meals[index];

    return (
      <MealItems
        solved={solved[index]}
        groups={loaded.groups}
        book={book}
        canAddTo={(optionId) => canAddItem(meal, optionId)}
        onAdd={(choice, optionId) => onAddFood(meal.id, choice, optionId)}
        onChange={(itemId, changes) => onChangeItem(meal.id, itemId, changes)}
        onSetGroup={(itemId, groupId) =>
          apply(setItemGroup(meals, meal.id, itemId, groupId))
        }
        onSwap={(itemId, food) => onSwapFood(meal.id, itemId, food)}
        onRemove={(itemId) => apply(removeItem(meals, meal.id, itemId))}
        options={{
          canAddSet: canAddSet(meal),
          error: errors[meal.id]?.options,
          onStartOptions: () =>
            apply(
              startOptions(meals, meal.id, {
                set: crypto.randomUUID(),
                first: crypto.randomUUID(),
                second: crypto.randomUUID(),
              }),
            ),
          // Unnamed, like the two `startOptions` makes: the chip reads the
          // food that goes in, and "Opção 3" is not a name anybody chose.
          onAddOption: (setId) =>
            apply(
              addOption(meals, meal.id, setId, {
                id: crypto.randomUUID(),
                name: "",
                items: [],
              }),
            ),
          onRemoveOption: (setId, optionId) =>
            apply(removeOption(meals, meal.id, setId, optionId)),
          onRenameOption: (setId, optionId, name) =>
            apply(renameOption(meals, meal.id, setId, optionId, name)),
          onSelectOption: (setId, optionId) =>
            apply(selectOption(meals, meal.id, setId, optionId)),
        }}
      />
    );
  };

  /**
   * Save, and what happened to the last one.
   *
   * The same block on both screens, because the draft is one draft: a plan
   * edited meal by meal and only saveable from the day list would be a plan
   * people lose. There is exactly one filled button on either screen and this
   * is it.
   */
  const saveBlock = (
    <>
      <Rule />

      <div className="flex flex-wrap items-center gap-4">
        <ActionButton type="submit" disabled={status === "saving"}>
          {status === "saving" ? t("saving") : t("save")}
        </ActionButton>

        <p aria-live="polite" className="text-sm">
          {status === "saved" ? (
            <span className="text-nd-dim">{t("saved")}</span>
          ) : null}
          {status === "saveFailed" ? (
            <span className="text-nd-red-ink">{t("saveError")}</span>
          ) : null}
          {dirty && status !== "saveFailed" ? (
            <span className="text-nd-dim">{t("unsaved")}</span>
          ) : null}
        </p>
      </div>
    </>
  );

  /* ---- One meal ------------------------------------------------------- */

  if (open !== undefined) {
    const meal = meals[open];
    const mealErrors = errors[meal.id] ?? {};
    const mealTargets = rows[open].targets;

    return (
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
        {/* Installed as a PWA this app has no browser back button, so the way
            out of a meal has to be drawn. Text, not a filled button: leaving is
            not the thing this screen is for. */}
        <button
          type="button"
          onClick={() => show(undefined)}
          className="inline-flex w-fit items-center gap-2 text-sm text-nd-dim underline-offset-4 hover:underline"
        >
          <span aria-hidden="true">←</span>
          {t("backToDay")}
        </button>

        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            {/* The page's heading while a meal is open: the day's own has been
                dropped, and an outline with a hole in it exactly where the
                screen is would be worse than a heading that changes. */}
            <Legend as="h1">
              {t("mealPosition", {
                position: open + 1,
                total: meals.length,
              })}
            </Legend>
            <p className="font-mono text-xs text-nd-dim" data-numeric="">
              {t("macros", {
                protein: format.number(mealTargets.proteinG),
                carb: format.number(mealTargets.carbG),
                fat: format.number(mealTargets.fatG),
              })}
              {" · "}
              {t("kcal", { kcal: mealTargets.kcal })}
            </p>
          </div>

          {/* Labelled and hinted rather than placeholder-only, which is what
              the two boxes were when they sat in a list of eight rows and
              there was no room to say what they were. There is room here. */}
          <Field
            label={t("nameField")}
            hint={t("nameHint")}
            error={mealErrors.name ? mealMessage(mealErrors.name) : undefined}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="off"
                placeholder={t("namePlaceholder")}
                value={meal.name}
                onChange={(event) => onRename(meal.id, event.target.value)}
              />
            )}
          </Field>

          <Field
            label={t("shareField")}
            hint={t("shareNote")}
            error={mealErrors.share ? mealMessage(mealErrors.share) : undefined}
          >
            {(props) => (
              /* `inputMode="decimal"` and a text type, as on every number in
                 this app: a `number` input hides what was typed behind the
                 browser's own parsing, and this one has to accept a comma. */
              <input
                {...props}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={
                  typing?.id === meal.id ? typing.text : String(percents[open])
                }
                onChange={(event) => onShare(meal.id, event.target.value)}
                onBlur={() => setTyping(undefined)}
                className={`${props.className} max-w-28 text-right font-mono`}
              />
            )}
          </Field>
        </section>

        {itemsFor(open)}

        {saveBlock}

        <div className="flex flex-col items-start gap-2">
          <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
            {t("itemsNote")}
          </p>
          <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
            {t("groupsNote")}
          </p>
          <TextLink href="/alimentos/grupos" className="text-xs">
            {t("groupsLink")}
          </TextLink>
        </div>
      </form>
    );
  }

  /* ---- The day -------------------------------------------------------- */

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-10">
      {header}

      {/* The same number, drawn the same way, as the one the home screen opens
          with. It was set in mono type here and in dots there, which is the
          charter's "no rendering the same number in two different voices" —
          and worse than a style inconsistency, it read as two instruments
          reporting on the same day. */}
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("targetLabel")}</Legend>
        <DotText
          className="block"
          style={{ fontSize: displayFontSize(dayKcal) }}
        >
          {dayKcal}
        </DotText>
        <p className="text-sm tracking-[0.08em] uppercase">{t("energyUnit")}</p>
        <p className="font-mono text-sm text-nd-dim" data-numeric="">
          {t("targetMacros", {
            protein: targets.proteinG,
            carb: targets.carbG,
            fat: targets.fatG,
          })}
        </p>
        {/* Absent on a plan written before the weight was recorded, or one
            imported from the predecessor — see `weightDrift`. */}
        {planKnowsItsWeight(loaded.plan) ? (
          <p className="text-xs text-nd-dim">
            {t("basedOn", { weight: loaded.plan.basedOnWeightKg })}
          </p>
        ) : null}

        <TextLink href="/energia">{t("energyLink")}</TextLink>

        {/*
         * The loop closing: the plan says what body it was written for, and
         * when that stops being the body on the scale it offers to catch up
         * (#25). Not applied on its own — see `rebasePlan` and `savePlan` for
         * why a plan that silently followed the weight would be worse than one
         * that goes stale visibly.
         */}
        {/* The one panel on this screen that is a surface rather than a rule,
            because it is the one thing here that arrived on its own and has to
            be found. Its tone is a field of dots at 4px pitch — the charter's
            only intermediate value, and the same material the readout above it
            is made of — never a tinted fill. */}
        {drift === undefined ? null : (
          <div className="nd-screen mt-2 flex flex-col items-start gap-3 border border-nd-ink p-4">
            <p className="max-w-prose text-sm leading-relaxed">
              {t(drift.deltaKg < 0 ? "driftDown" : "driftUp", {
                from: drift.fromKg,
                to: drift.toKg,
                delta: Math.abs(drift.deltaKg),
              })}
            </p>
            <ActionButton type="button" onClick={rebase}>
              {t("rebase", { weight: drift.toKg })}
            </ActionButton>
          </div>
        )}

        {/*
         * The same offer for the other thing a plan goes stale against: not the
         * body, the app. Rows added before #D may still grow to 500 g of
         * anything, and the same surface says so — a field of dots, one
         * sentence, one action — rather than a second kind of banner.
         */}
        {loose === 0 ? null : (
          <div className="nd-screen mt-2 flex flex-col items-start gap-3 border border-nd-ink p-4">
            <p className="max-w-prose text-sm leading-relaxed">
              {t("looseCeilings", { count: loose, max: DEFAULT_ITEM.maxG })}
            </p>
            <ActionButton type="button" onClick={tighten}>
              {t("tighten")}
            </ActionButton>
          </div>
        )}
      </section>

      <Rule />

      {/*
       * The offer to start from something, while there is still nothing.
       *
       * `fresh` alone is not the question: it says the store has never held
       * this plan, which stays true for the whole session — so a plan being
       * filled in food by food kept a "this plan is still blank" heading
       * above it until the first save. The list itself is the better witness,
       * and it is `isBlankPlan` that reads it: counting rows needs the
       * unselected options too, and this screen is not allowed to hold them.
       */}
      {loaded.fresh && isBlankPlan(meals) ? (
        <section className="flex flex-col gap-3">
          <Legend as="h2">{t("startTitle")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("startLead")}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <TextLink href="/dieta/modelos">{t("startPreset")}</TextLink>
            <TextLink href="/importar">{t("startImport")}</TextLink>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Legend as="h2">{t("mealsHeading")}</Legend>
          <p className="font-mono text-xs text-nd-dim" data-numeric="">
            {t("mealCount", { count: meals.length })}
          </p>
        </div>

        {/* No gap: the meals are separated by a hairline each, not by air.
            Cards would make eight equally-weighted boxes out of a list whose
            whole point is that it is one day read top to bottom. */}
        <ul className="flex flex-col">
          {meals.map((meal, index) => (
            <DayMealRow
              key={meal.id}
              meal={meal}
              position={index + 1}
              percent={percents[index]}
              targets={rows[index].targets}
              solved={solved[index]}
              invalid={errors[meal.id] !== undefined}
              reordering={reordering}
              first={index === 0}
              last={index === meals.length - 1}
              removable={canRemoveMeal(meals)}
              onOpen={() => show(meal.id)}
              onMove={(offset) => apply(moveMeal(meals, meal.id, offset))}
              onRemove={() => onRemove(meal.id)}
            />
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <Ghost type="button" onClick={onAdd} disabled={!canAddMeal(meals)}>
            {t("add")}
          </Ghost>

          <Ghost type="button" onClick={() => apply(evenShares(meals))}>
            {t("even")}
          </Ghost>

          {/* Reordering is a mode rather than two buttons on every row. Those
              buttons were on screen at all times, in the same outline as the
              one that opens the meal, on a list whose order most people set
              once — three controls competing with the row's actual job. */}
          <Ghost
            type="button"
            onClick={() => setReordering((current) => !current)}
            aria-pressed={reordering}
          >
            {reordering ? t("reorderDone") : t("reorder")}
          </Ghost>

          {canAddMeal(meals) ? null : (
            <p className="text-xs text-nd-dim">
              {t("addLimit", { max: MEAL_LIMITS.count.max })}
            </p>
          )}
        </div>
      </section>

      {/* The check, printed. Every rule in `lib/diet` exists so that this
          panel's two columns agree, and putting the subtraction on screen is
          what makes that claim falsifiable by the person using the app (#21).
          It is a section rather than a modal or a tab because a reconciliation
          you have to go and look for is one nobody looks for. */}
      <Rule />

      <div className="flex flex-col gap-6">
        <MacroPanel
          heading={t("totalLabel")}
          reconciliation={reconcileDay(solved)}
        />
        <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
          {t("roundingNote")}
        </p>
      </div>

      {saveBlock}
    </form>
  );
}

/**
 * One meal, as the day sees it.
 *
 * The whole row is the control that opens it, because the row *is* the thing
 * being opened and a chevron-sized target on a phone in a kitchen is not. What
 * it has to carry is what someone scanning a day actually asks of it: what the
 * meal is called, how big it is, what is in it, and whether it closes. The
 * foods are named rather than counted — "arroz, ovo, banana" tells you which
 * meal this is and "3 alimentos" does not.
 *
 * Editing lives one level down. A list where every row holds a name box, a
 * percentage box, two move buttons and a delete is not a list, it is eight
 * forms stacked, and it was the reason a four-meal plan ran to thirteen
 * screens.
 */
function DayMealRow({
  meal,
  position,
  percent,
  targets,
  solved,
  invalid,
  reordering,
  first,
  last,
  removable,
  onOpen,
  onMove,
  onRemove,
}: {
  meal: Meal;
  position: number;
  percent: number;
  targets: MacroSet;
  solved: SolvedMeal;
  /** The meal has an error waiting on it, found on the last save attempt. */
  invalid: boolean;
  reordering: boolean;
  first: boolean;
  last: boolean;
  removable: boolean;
  onOpen: () => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Plan");

  const foods = solved.items.map((entry) => entry.food.name);
  const summary =
    foods.length === 0
      ? t("noFoods")
      : foods.length <= 3
        ? foods.join(", ")
        : t("foodsMore", {
            names: foods.slice(0, 3).join(", "),
            count: foods.length - 3,
          });

  const body = (
    <>
      {/* The meal's place in the day, as a two-digit index. Not decoration:
          this list is ordered and reorderable, and a row that can be moved
          should say where it currently is. Hidden from assistive technology
          because the reorder buttons carry the position in words. */}
      <span
        aria-hidden="true"
        className="mt-1 font-mono text-xs text-nd-dim"
        data-numeric=""
      >
        {String(position).padStart(2, "0")}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-base">{meal.name}</span>
          <span className="font-mono text-xs text-nd-dim" data-numeric="">
            {t("sharePercent", { percent })}
            {" · "}
            {t("kcal", { kcal: targets.kcal })}
          </span>
        </span>
        <span className="truncate text-xs text-nd-dim">{summary}</span>
      </span>

      <MealChip solved={solved} invalid={invalid} />
    </>
  );

  return (
    <li className="border-t border-nd-unlit first:border-t-0">
      {reordering ? (
        <div className="flex flex-col gap-3 py-4">
          <div className="flex items-start gap-3">{body}</div>

          <div className="flex items-center gap-2">
            <RowButton
              label={t("moveUp")}
              name={t("moveUpLabel", { position })}
              disabled={first}
              onClick={() => onMove(-1)}
            />
            <RowButton
              label={t("moveDown")}
              name={t("moveDownLabel", { position })}
              disabled={last}
              onClick={() => onMove(1)}
            />
            {/* Outlined like its neighbours, not red: red in this system means
                a number is off target, and a deletion someone asked for is not
                a fault. What says it does not come back is the sentence under
                the list. */}
            <Ghost
              type="button"
              onClick={onRemove}
              disabled={!removable}
              title={removable ? undefined : t("removeLimit")}
            >
              {t("remove")}
            </Ghost>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-start gap-3 py-4 text-left hover:bg-nd-unlit/40"
        >
          {body}
          <span aria-hidden="true" className="mt-0.5 text-nd-dim">
            →
          </span>
        </button>
      )}
    </li>
  );
}

/**
 * Whether a meal closes, in three words at most.
 *
 * This is the whole of what the day list needs to say about a meal's numbers.
 * The four-line reconciliation table is still printed, once, on the meal's own
 * screen; printing it under every row is how an empty plan came to open with
 * sixteen red deficits on it, which is a quantity of alarm nobody reads.
 *
 * An empty meal reports that it is empty and nothing else. It is short of
 * everything by definition, and saying so is arithmetic rather than
 * information.
 *
 * The two hues are spent at the two ends only — see `MacroPanel`. A meal still
 * filling up is grey, and the word says which way.
 */
/**
 * The macros a chip may name — the three real ones, in reconciliation order.
 * Energy is left out on purpose: it is a consequence of the other three (see
 * `RECONCILE_MACROS`), so headlining it would name the one number the user
 * cannot go and change.
 */
const CHIP_MACROS = ["proteinG", "carbG", "fatG"] as const;
type ChipMacro = (typeof CHIP_MACROS)[number];

function MealChip({
  solved,
  invalid,
}: {
  solved: SolvedMeal;
  invalid: boolean;
}) {
  const t = useTranslations("Plan");

  const box =
    "shrink-0 border px-2 py-1 text-[0.6875rem] font-medium tracking-[0.08em] uppercase";
  const quiet = `${box} border-nd-unlit text-nd-dim`;

  if (invalid) {
    return (
      <span className={`${box} border-nd-red text-nd-red-ink`}>
        {t("chip.invalid")}
      </span>
    );
  }

  if (effectiveItems(solved.meal).length === 0) {
    return <span className={quiet}>{t("chip.empty")}</span>;
  }

  const reconciliation = reconcileMeal(solved);
  if (reconciliation.onTarget) {
    return (
      <span className={`${box} border-nd-good text-nd-good`}>
        {t("chip.met")}
      </span>
    );
  }

  /* The macro that is furthest out, in grams. See `CHIP_MACROS`. */
  const worst = reconciliation.lines
    .filter((line): line is MacroLine & { macro: ChipMacro } =>
      (CHIP_MACROS as readonly string[]).includes(line.macro),
    )
    .reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));

  const value = Math.abs(worst.delta);
  const macro = t(`chip.letter.${worst.macro}`);

  return worst.state === "over" ? (
    <span className={`${box} border-nd-red text-nd-red-ink`}>
      {t("chip.over", { value, macro })}
    </span>
  ) : (
    <span className={quiet}>{t("chip.short", { value, macro })}</span>
  );
}

/**
 * Reorder and remove are the same kind of thing — available, not intended — so
 * they are all one outlined block. This wrapper survives only because the two
 * move buttons take a plain `onClick(offset)` and reading `<RowButton>` at the
 * call site says what the row does; it adds nothing else to `Ghost`.
 */
function RowButton({
  label,
  name,
  disabled,
  onClick,
}: {
  label: string;
  /**
   * What the button is called when it is read rather than seen.
   *
   * The visible word is one syllable because three of these sit on one line of
   * a phone and "Mover para baixo" wrapped every one of them onto two; the
   * accessible name says which meal is moving, because a screen reader lands on
   * the button without the row around it.
   */
  name: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Ghost
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={name}
    >
      {label}
    </Ghost>
  );
}
