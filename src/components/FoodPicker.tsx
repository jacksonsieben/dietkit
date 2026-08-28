"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { CONTROL_CLASS } from "@/components/Field";
import { Ghost } from "@/components/nd/kit";
import type { FoodSearchResult } from "@/lib/db/foods";
import { compositionFromResult } from "@/lib/diet/composition";
import type { FoodSearchBody } from "@/lib/foods/endpoint";
import {
  MIN_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  parseFoodQuery,
} from "@/lib/foods/query";
import { cookedFirst } from "@/lib/foods/preparation";
import { mergeListings, searchCustomFoods, type FoodListing } from "@/lib/foods/results";
import { getRepository } from "@/lib/storage";
import type { CustomFood, FoodComposition, FoodRef } from "@/lib/storage/types";

/**
 * Choosing one food, from both sources at once (#16, #17, #19, #20).
 *
 * Its own fetch rather than a shared component with `/alimentos`: `FoodSearch`
 * renders the full published row — five nutrients, sentinels quoted as TACO
 * prints them — which is the right screen for reading the table and the wrong
 * one for choosing from a list. What is genuinely shared is the part with
 * decisions in it: the parser, the debounce and the merge all come from
 * `lib/foods`, so this cannot ask a question `/alimentos` would have refused.
 *
 * Shared between the meal builder and the substitution groups, which is why it
 * is here and not inside `MealItems`: a group is a list of foods picked exactly
 * the way a meal's foods are picked, and two pickers that drifted apart would
 * mean a food choosable in one place and not the other.
 */

export interface FoodChoice {
  readonly ref: FoodRef;
  readonly servingG?: number;
  /** Present for a TACO row: the snapshot the plan has to carry with it. */
  readonly composition?: FoodComposition;
  /** Present for one of the user's foods, so the book can be kept current. */
  readonly custom?: CustomFood;
  /**
   * Present for a TACO row: which of the table's groups it was published in,
   * carried only so the new item can start under a sensible ceiling rather than
   * able to reach 500 g of anything (see `ceilingFor`). Nothing stores it.
   */
  readonly groupSlug?: string;
}

export function FoodPicker({
  inputId,
  taken,
  onPick,
  onCancel,
}: {
  /** Unique per picker: more than one of these can be open at a time. */
  inputId: string;
  taken: ReadonlySet<FoodRef>;
  onPick: (choice: FoodChoice) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Picker");

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

        /*
         * Cooked above raw, before the list is ever drawn.
         *
         * TACO publishes most staples twice — "Arroz, tipo 1, cru" at 358 kcal
         * and "Arroz, tipo 1, cozido" at 128 — and the endpoint, which ranks by
         * name, hands the two back interleaved. Whoever is filling in a meal
         * means the one they eat. See `cookedFirst`.
         */
        setAnswer({
          query: asked,
          listings: cookedFirst(mergeListings(custom, taco)),
        });
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
    <div className="flex flex-col gap-3 border border-nd-ink px-3 py-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor={inputId} className="text-xs text-nd-dim">
            {t("searchLabel")}
          </label>
          <input
            id={inputId}
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
        <p className="text-xs text-nd-dim">
          {t("searchMin", { min: MIN_QUERY_LENGTH })}
        </p>
      ) : answer?.query !== asked ? (
        <p className="text-xs text-nd-dim">{t("searching")}</p>
      ) : answer.listings.length === 0 ? (
        <p className="text-xs text-nd-dim">{t("searchEmpty")}</p>
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
 * One choosable food, with the numbers that tell it from the row above it.
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
  const t = useTranslations("Picker");

  const composition =
    listing.source === "taco" ? compositionFromResult(listing.food) : undefined;

  const name =
    listing.source === "taco" ? listing.food.description : listing.food.name;

  /*
   * What the row is actually chosen by.
   *
   * The list used to be names alone, which is the one thing that cannot
   * separate two rows of the same food: "cru" and "cozido" differ by a word at
   * the end of a long name and by a factor of nearly three in energy. The
   * energy leads for that reason, and the macros follow because the next
   * question after "which rice" is "does this fit the meal I am filling".
   *
   * Per 100 g, which is the only unit that exists here — the grams are the
   * solver's answer later, and nothing on this screen knows them yet.
   */
  const per100g =
    listing.source === "custom" ? listing.food.per100g : composition?.per100g;

  const usable = listing.source === "custom" || composition !== undefined;

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-1 hover:bg-nd-unlit">
      <div className="flex min-w-40 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-2 text-sm">
          {name}
          {/* A source, not a status: which shelf this food came off. It was
              blue, which was a second hue in a world that has one. */}
          {listing.source === "custom" ? (
            <span className="border border-nd-ink px-1.5 py-0.5 text-[0.625rem] font-medium tracking-[0.12em] uppercase">
              {t("mine")}
            </span>
          ) : null}
        </span>

        {per100g ? (
          <span className="text-xs text-nd-dim">
            {t("per100g", {
              kcal: per100g.kcal,
              protein: per100g.proteinG,
              carb: per100g.carbG,
              fat: per100g.fatG,
            })}
          </span>
        ) : null}
      </div>

      {already ? (
        <span className="text-xs text-nd-dim">{t("alreadyAdded")}</span>
      ) : usable ? (
        <SmallButton
          label={t("addThis")}
          onClick={() =>
            onPick(
              listing.source === "taco"
                ? {
                    ref: listing.ref,
                    composition,
                    groupSlug: listing.food.groupSlug,
                  }
                : {
                    ref: listing.ref,
                    servingG: listing.food.servingG,
                    custom: listing.food,
                  },
            )
          }
        />
      ) : (
        <span className="text-xs text-nd-dim">{t("unusableFood")}</span>
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

/**
 * The outline button at list scale — a `Ghost` with the padding pulled in, kept
 * as its own name because three screens call it and they all mean "the small
 * one beside a row".
 */
export function SmallButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Ghost
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-1"
    >
      {label}
    </Ghost>
  );
}
