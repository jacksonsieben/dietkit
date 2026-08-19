"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { CONTROL_CLASS } from "@/components/Field";
import type { FoodSearchResult } from "@/lib/db/foods";
import { compositionFromResult } from "@/lib/diet/composition";
import {
  ITEM_LIMITS,
  checkGrams,
  type ItemChanges,
  type ItemErrorCode,
} from "@/lib/diet/items";
import type { SolvedItem, SolvedMeal } from "@/lib/diet/solve";
import type { FoodSearchBody } from "@/lib/foods/endpoint";
import {
  MIN_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  parseFoodQuery,
} from "@/lib/foods/query";
import { mergeListings, searchCustomFoods, type FoodListing } from "@/lib/foods/results";
import { getRepository } from "@/lib/storage";
import type { CustomFood, DietItem, FoodComposition, Id } from "@/lib/storage/types";

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

export interface FoodChoice {
  readonly ref: DietItem["food"];
  readonly servingG?: number;
  /** Present for a TACO row: the snapshot the plan has to carry with it. */
  readonly composition?: FoodComposition;
  /** Present for one of the user's foods, so the book can be kept current. */
  readonly custom?: CustomFood;
}

export function MealItems({
  solved,
  canAdd,
  onAdd,
  onChange,
  onRemove,
}: {
  solved: SolvedMeal;
  canAdd: boolean;
  onAdd: (choice: FoodChoice) => void;
  onChange: (itemId: Id, changes: ItemChanges) => void;
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
              onChange={(changes) => onChange(entry.item.id, changes)}
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
  onChange,
  onRemove,
}: {
  entry: SolvedItem;
  onChange: (changes: ItemChanges) => void;
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

      {error ? (
        <p id={errorId} className="text-xs text-red-700 dark:text-red-400">
          {t(`itemErrors.${error}`, { max: ITEM_LIMITS.gramsG.max })}
        </p>
      ) : null}
    </li>
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

/**
 * The same two-source search as `/alimentos`, cut down to what picking a food
 * needs (#16, #17).
 *
 * Its own fetch rather than a shared component: `FoodSearch` renders the full
 * published row — five nutrients, sentinels quoted as TACO prints them — which
 * is the right screen for reading the table and the wrong one for choosing from
 * a list inside a meal. What is genuinely shared is the part with decisions in
 * it: the parser, the debounce and the merge all come from `lib/foods`, so this
 * cannot ask a question `/alimentos` would have refused.
 */
function FoodPicker({
  taken,
  onPick,
  onCancel,
}: {
  taken: ReadonlySet<DietItem["food"]>;
  onPick: (choice: FoodChoice) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Plan");

  const [typed, setTyped] = useState("");
  const [answer, setAnswer] = useState<
    { query: string; listings: FoodListing[] } | undefined
  >(undefined);

  const query = parseFoodQuery(typed);
  const asked = query?.terms.join(" ");

  useEffect(() => {
    if (asked === undefined) return;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      void (async () => {
        const [taco, custom] = await Promise.all([
          fetchTaco(asked, controller.signal),
          readCustom(asked.split(" ")),
        ]);

        if (controller.signal.aborted) return;

        setAnswer({ query: asked, listings: mergeListings(custom, taco) });
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [asked]);

  const takenIds = {
    taco: new Set(
      [...taken].filter((ref) => ref.source === "taco").map((ref) => ref.tacoId),
    ),
    custom: new Set(
      [...taken]
        .filter((ref) => ref.source === "custom")
        .map((ref) => ref.customFoodId),
    ),
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-black/15 px-3 py-3 dark:border-white/20">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="food-picker" className="text-xs opacity-60">
            {t("searchLabel")}
          </label>
          <input
            id="food-picker"
            type="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={t("searchPlaceholder")}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className={`${CONTROL_CLASS} py-1 text-sm`}
          />
        </div>
        <SmallButton label={t("cancel")} onClick={onCancel} />
      </div>

      {asked === undefined ? (
        <p className="text-xs opacity-60">
          {t("searchMin", { min: MIN_QUERY_LENGTH })}
        </p>
      ) : answer?.query !== asked ? (
        <p className="text-xs opacity-60">{t("searching")}</p>
      ) : answer.listings.length === 0 ? (
        <p className="text-xs opacity-60">{t("searchEmpty")}</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {answer.listings.map((listing) => (
            <PickRow
              key={listing.key}
              listing={listing}
              already={
                listing.source === "taco"
                  ? takenIds.taco.has(listing.food.id)
                  : takenIds.custom.has(listing.food.id)
              }
              onPick={onPick}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One choosable food.
 *
 * A TACO row whose macros the publication withheld cannot be chosen at all —
 * `compositionFromResult` returns nothing for it — and the row says why instead
 * of disappearing. Offering it as a food worth zero grams of everything is the
 * one thing that would let a plan add up while being wrong.
 */
function PickRow({
  listing,
  already,
  onPick,
}: {
  listing: FoodListing;
  already: boolean;
  onPick: (choice: FoodChoice) => void;
}) {
  const t = useTranslations("Plan");

  const composition =
    listing.source === "taco" ? compositionFromResult(listing.food) : undefined;

  const name =
    listing.source === "taco" ? listing.food.description : listing.food.name;

  const usable = listing.source === "custom" || composition !== undefined;

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-black/5 dark:hover:bg-white/10">
      <span className="flex flex-wrap items-baseline gap-2 text-sm">
        {name}
        {listing.source === "custom" ? (
          <span className="rounded-full border border-sky-600/40 px-2 py-0.5 text-xs text-sky-800 dark:border-sky-400/40 dark:text-sky-300">
            {t("mine")}
          </span>
        ) : null}
      </span>

      {already ? (
        <span className="text-xs opacity-60">{t("alreadyAdded")}</span>
      ) : usable ? (
        <SmallButton
          label={t("addThis")}
          onClick={() =>
            onPick(
              listing.source === "taco"
                ? { ref: listing.ref, composition }
                : {
                    ref: listing.ref,
                    servingG: listing.food.servingG,
                    custom: listing.food,
                  },
            )
          }
        />
      ) : (
        <span className="text-xs opacity-60">{t("unusableFood")}</span>
      )}
    </li>
  );
}

/** The network half. A non-200 is a failure, not an empty result. */
async function fetchTaco(
  asked: string,
  signal: AbortSignal,
): Promise<readonly FoodSearchResult[]> {
  try {
    const response = await fetch(`/api/foods?q=${encodeURIComponent(asked)}`, {
      signal,
    });
    if (!response.ok) throw new Error(String(response.status));

    return ((await response.json()) as FoodSearchBody).foods;
  } catch {
    return [];
  }
}

/** The device half. Never a request — this reads IndexedDB on this machine. */
async function readCustom(terms: readonly string[]): Promise<CustomFood[]> {
  try {
    return await searchCustomFoods(getRepository(), terms);
  } catch {
    return [];
  }
}

function SmallButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
