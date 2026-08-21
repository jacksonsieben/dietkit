"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Field } from "@/components/Field";
import { TextLink } from "@/components/nd/kit";
import type { NutrientSentinel } from "@/lib/db/nutrients";
import type { FoodSearchBody } from "@/lib/foods/endpoint";
import type { FoodSearchResult } from "@/lib/db/foods";
import { mergeListings, searchCustomFoods, type FoodListing } from "@/lib/foods/results";
import {
  DEFAULT_LIMIT,
  MIN_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  parseFoodQuery,
} from "@/lib/foods/query";
import { getRepository } from "@/lib/storage";
import type { CustomFood } from "@/lib/storage/types";

/**
 * One box, two sources (#16, #17).
 *
 * The published table can only be asked over the network, and the user's own
 * foods only exist on the device — so a search asks both and shows one list.
 * What leaves the device is still exactly what it was: the typed word, to
 * `/api/foods`, and nothing else. The device half never becomes a request.
 *
 * The types above are `import type` on purpose: `@/lib/db/foods` is server code
 * that imports drizzle, and the annotations are erased at compile time, so what
 * crosses into the bundle is the shape of the response and not the query that
 * produced it.
 */

/**
 * One half of an answer, or the absence of one.
 *
 * Both halves fail independently and for unrelated reasons — the network is
 * down, or IndexedDB is unavailable in a private window — and either one alone
 * is still worth showing. A single "it failed" for the pair would hide the
 * user's own foods every time the app went offline, which is the moment a PWA
 * is supposed to be at its most useful.
 */
type Half<T> = { ok: true; value: T } | { ok: false };

/**
 * An answer, and the question it answers.
 *
 * The query is carried alongside because it is what makes "these results are
 * for what is in the box" checkable rather than assumed. React state arrives a
 * render late and a network response arrives whenever it arrives; comparing the
 * echoed query with the parsed one is how the screen tells a finished search
 * from one still in flight, without a second state variable that has to be kept
 * in step with this one — and without setting state from the effect body, which
 * is the cascading render this component would otherwise do on every keystroke.
 */
interface Answer {
  query: string;
  taco: Half<FoodSearchBody>;
  custom: Half<readonly CustomFood[]>;
}

export function FoodSearch() {
  const t = useTranslations("Foods");

  const [typed, setTyped] = useState("");
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);

  // The same parser the route runs, so a string the server would refuse never
  // becomes a request. It is also what decides when the hint below appears —
  // one rule, in one place, instead of a client-side guess at the server's.
  const query = parseFoodQuery(typed);
  const asked = query?.terms.join(" ");

  useEffect(() => {
    if (asked === undefined) return;

    const controller = new AbortController();

    /**
     * Nothing is asked until the typing pauses, and an answer nobody is waiting
     * for any more is abandoned rather than rendered. Both matter more here
     * than they usually would: this is the request that leaves the device, so
     * one per pause instead of one per keystroke is a privacy property as much
     * as a performance one.
     */
    const timer = setTimeout(() => {
      void (async () => {
        // `asked` is already folded words joined by a space — that is what
        // `parseFoodQuery` produced — so splitting it back is the same list the
        // server is being sent, not a second parse of the raw input.
        const terms = asked.split(" ");

        const [taco, custom] = await Promise.all([
          fetchTaco(asked, controller.signal),
          readCustom(terms),
        ]);

        // An abort lands here as a failed half on both sides, and must not
        // paint anything over a search the user has already moved on from.
        if (controller.signal.aborted) return;

        setAnswer({ query: asked, taco, custom });
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [asked]);

  return (
    <div className="flex flex-col gap-6">
      <Field label={t("searchLabel")} hint={t("searchHint")}>
        {(control) => (
          <input
            {...control}
            type="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={t("searchPlaceholder")}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        )}
      </Field>

      <Status
        // Only an answer to the question currently in the box is an answer.
        answer={answer?.query === asked ? answer : undefined}
        searchable={asked !== undefined}
      />

      {/* Offered before anyone has searched and after, because the moment
          someone needs it is the moment the box came back with nothing — and
          telling them then, only then, would mean they had already given up. */}
      <p className="text-xs leading-relaxed text-nd-dim">
        {t("missingNote")}{" "}
        <TextLink href="/alimentos/meus" className="text-xs">
          {t("manageLink")}
        </TextLink>
      </p>

      <p className="text-xs leading-relaxed text-nd-dim">
        {t("serverNote")}{" "}
        <TextLink href="/privacidade" className="text-xs">
          {t("privacyLink")}
        </TextLink>
      </p>
    </div>
  );
}

/** The network half. A non-200 is a failure, not an empty result. */
async function fetchTaco(
  asked: string,
  signal: AbortSignal,
): Promise<Half<FoodSearchBody>> {
  try {
    const response = await fetch(`/api/foods?q=${encodeURIComponent(asked)}`, {
      signal,
    });
    if (!response.ok) throw new Error(String(response.status));

    return { ok: true, value: (await response.json()) as FoodSearchBody };
  } catch {
    return { ok: false };
  }
}

/**
 * The device half. Never a request — `getRepository()` reads IndexedDB on this
 * machine, and the words it is given are the ones already in the box.
 */
async function readCustom(
  terms: readonly string[],
): Promise<Half<readonly CustomFood[]>> {
  try {
    return { ok: true, value: await searchCustomFoods(getRepository(), terms) };
  } catch {
    return { ok: false };
  }
}

function Status({
  answer,
  searchable,
}: {
  answer: Answer | undefined;
  searchable: boolean;
}) {
  const t = useTranslations("Foods");

  if (!searchable) {
    return (
      <p className="text-sm text-nd-dim">
        {t("minLength", { min: MIN_QUERY_LENGTH })}
      </p>
    );
  }

  if (!answer) {
    return <p className="text-sm text-nd-dim">{t("searching")}</p>;
  }

  // Only when neither half arrived is there nothing to show. One half is still
  // an answer, with a line above it saying which half is missing.
  if (!answer.taco.ok && !answer.custom.ok) {
    return (
      <p className="border-l-2 border-nd-red pl-4 text-sm text-nd-red-ink">
        {t("failed")}
      </p>
    );
  }

  const body = answer.taco.ok ? answer.taco.value : undefined;
  const custom = answer.custom.ok ? answer.custom.value : [];
  const listings = mergeListings(custom, body?.foods ?? []);

  return (
    <div className="flex flex-col gap-3">
      {/*
        A rail in ink rather than red. Half an answer is a degraded result, not
        a wrong one: the numbers on screen are still correct, there are simply
        fewer of them than the user asked for. Red is reserved in this palette
        for something being off, and spending it on "the network is down" is how
        it stops meaning anything by the time a target is actually blown. Both
        halves gone is the case below, and that one does take the red.
      */}
      {!answer.taco.ok ? (
        <p className="border-l-2 border-nd-ink pl-4 text-sm">
          {t("tacoUnavailable")}
        </p>
      ) : null}
      {!answer.custom.ok ? (
        <p className="border-l-2 border-nd-ink pl-4 text-sm">
          {t("deviceUnavailable")}
        </p>
      ) : null}

      {listings.length === 0 ? (
        <p className="text-sm text-nd-dim">{t("empty")}</p>
      ) : (
        <Results
          listings={listings}
          // Written as a ternary on purpose. The sentinel rule for this
          // screen — nothing missing is ever rendered as a zero — is enforced
          // by reading the source for a nullish-coalesced zero, and a missing
          // TACO half is a missing half rather than a page of no results.
          tacoCount={body ? body.count : 0}
        />
      )}
    </div>
  );
}

function Results({
  listings,
  tacoCount,
}: {
  listings: readonly FoodListing[];
  tacoCount: number;
}) {
  const t = useTranslations("Foods");

  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="text-sm text-nd-dim">
        {t("resultCount", { count: listings.length })}
      </p>

      <ul className="flex flex-col">
        {listings.map((listing) =>
          listing.source === "custom" ? (
            <CustomCard key={listing.key} food={listing.food} />
          ) : (
            <FoodCard key={listing.key} food={listing.food} />
          ),
        )}
      </ul>

      {/*
        A full page is the one result count that might not be the whole answer:
        the route stops at `DEFAULT_LIMIT`, so exactly that many means there may
        be more behind them, and saying so beats a count the user reads as final.
        Measured on the TACO half alone — the device's foods are never truncated.
      */}
      {tacoCount === DEFAULT_LIMIT ? (
        <p className="text-xs text-nd-dim">
          {t("resultLimit", { limit: DEFAULT_LIMIT })}
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-nd-dim">{t("legend")}</p>
    </div>
  );
}

/**
 * One published row, with the five figures a plan is built from.
 *
 * Every number here is a quotation, printed as TACO prints it — including the
 * cells that print no number at all (docs/TACO-LICENSING.md). A trace is not a
 * zero and *não aplicável* is not a measurement of nothing, so neither is
 * rendered as `0`, which is the one rounding this screen could do that would
 * change what the publication says.
 */
function FoodCard({ food }: { food: FoodSearchResult }) {
  const t = useTranslations("Foods");

  const grams = (value: number | null, sentinel: NutrientSentinel | undefined) =>
    value === null ? sentinelText(sentinel) : t("gramsValue", { value });

  function sentinelText(sentinel: NutrientSentinel | undefined): string {
    if (sentinel === "Tr") return t("trace");
    if (sentinel === "NA") return t("notApplicable");
    return t("unavailable");
  }

  return (
    <li className="border-t border-nd-unlit py-4 first:border-t-0 first:pt-0">
      <p className="font-medium">{food.description}</p>
      <p className="text-xs text-nd-dim">
        {food.groupName} · {t("per100g")}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
        <Cell
          label={t("energy")}
          value={
            food.energyKcal === null
              ? sentinelText(food.sentinels.energyKcal)
              : t("kcalValue", { value: food.energyKcal })
          }
        />
        <Cell
          label={t("protein")}
          value={grams(food.proteinG, food.sentinels.proteinG)}
        />
        <Cell
          label={t("carb")}
          value={grams(food.carbG, food.sentinels.carbG)}
        />
        <Cell label={t("fat")} value={grams(food.fatG, food.sentinels.fatG)} />
        <Cell
          label={t("fiber")}
          value={grams(food.fiberG, food.sentinels.fiberG)}
        />
      </dl>
    </li>
  );
}

/**
 * One of the user's own foods, marked as theirs.
 *
 * Visually distinguished on purpose (#17): these numbers were typed off a
 * package by a person, and the ones above were measured by a laboratory and
 * published. Presenting them identically would let a mistyped label pass for a
 * citation. The badge says which is which; the fibre column is missing rather
 * than zero, because the form does not ask for it.
 */
function CustomCard({ food }: { food: CustomFood }) {
  const t = useTranslations("Foods");

  const grams = (value: number) => t("gramsValue", { value });

  return (
    <li className="border-t border-nd-unlit py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{food.name}</p>
        {/* The badge carries the whole distinction now that the tinted card is
            gone. It can: in a list of ruled rows it is the only filled block on
            the screen, which is a louder mark than the pale blue border ever
            was, and it survives being printed, photographed or read by someone
            who does not see the hue it used to rely on. */}
        <span className="nd-invert bg-nd-ink px-2 py-0.5 text-xs font-medium tracking-[0.08em] text-nd-ground uppercase">
          {t("mine")}
        </span>
      </div>

      <p className="text-xs text-nd-dim">
        {[
          food.brand,
          t("per100g"),
          food.servingG === undefined
            ? undefined
            : t("servingValue", { value: food.servingG }),
        ]
          .filter((part) => part !== undefined)
          .join(" · ")}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <Cell
          label={t("energy")}
          value={t("kcalValue", { value: food.per100g.kcal })}
        />
        <Cell label={t("protein")} value={grams(food.per100g.proteinG)} />
        <Cell label={t("carb")} value={grams(food.per100g.carbG)} />
        <Cell label={t("fat")} value={grams(food.per100g.fatG)} />
      </dl>
    </li>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
      <dt className="text-xs text-nd-dim">{label}</dt>
      <dd className="font-mono" data-numeric="">
        {value}
      </dd>
    </div>
  );
}
