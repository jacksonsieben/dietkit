"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Field } from "@/components/Field";
import { Link } from "@/i18n/navigation";
import type { NutrientSentinel } from "@/lib/db/nutrients";
import type { FoodSearchBody } from "@/lib/foods/endpoint";
import type { FoodSearchResult } from "@/lib/db/foods";
import {
  DEFAULT_LIMIT,
  MIN_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  parseFoodQuery,
} from "@/lib/foods/query";

/**
 * The one screen in DietKit that talks to a server (#16).
 *
 * Everything else here reads the device and computes on it. This asks a
 * question — "which foods match this word" — that only the TACO table can
 * answer, so the word travels; nothing else does, and the notice under the box
 * says so in the same words the privacy page does.
 *
 * The types above are `import type` on purpose: `@/lib/db/foods` is server code
 * that imports drizzle, and the annotations are erased at compile time, so what
 * crosses into the bundle is the shape of the response and not the query that
 * produced it.
 */

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
type Answer =
  | { query: string; status: "ready"; body: FoodSearchBody }
  | { query: string; status: "failed" };

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
        try {
          const response = await fetch(
            `/api/foods?q=${encodeURIComponent(asked)}`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error(String(response.status));

          const body = (await response.json()) as FoodSearchBody;
          setAnswer({ query: asked, status: "ready", body });
        } catch {
          // An abort lands here too, and must not paint an error over a search
          // the user simply moved on from.
          if (!controller.signal.aborted) {
            setAnswer({ query: asked, status: "failed" });
          }
        }
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

      <p className="text-xs leading-relaxed opacity-60">
        {t("serverNote")}{" "}
        <Link href="/privacidade" className="underline underline-offset-4">
          {t("privacyLink")}
        </Link>
      </p>
    </div>
  );
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
      <p className="text-sm opacity-60">
        {t("minLength", { min: MIN_QUERY_LENGTH })}
      </p>
    );
  }

  if (!answer) {
    return <p className="text-sm opacity-60">{t("searching")}</p>;
  }

  if (answer.status === "failed") {
    return (
      <p className="text-sm text-red-700 dark:text-red-400">{t("failed")}</p>
    );
  }

  if (answer.body.count === 0) {
    return <p className="text-sm opacity-80">{t("empty")}</p>;
  }

  return <Results body={answer.body} />;
}

function Results({ body }: { body: FoodSearchBody }) {
  const t = useTranslations("Foods");

  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="text-sm opacity-60">
        {t("resultCount", { count: body.count })}
      </p>

      <ul className="flex flex-col gap-3">
        {body.foods.map((food) => (
          <FoodCard key={food.id} food={food} />
        ))}
      </ul>

      {/*
        A full page is the one result count that might not be the whole answer:
        the route stops at `DEFAULT_LIMIT`, so exactly that many means there may
        be more behind them, and saying so beats a count the user reads as final.
      */}
      {body.count === DEFAULT_LIMIT ? (
        <p className="text-xs opacity-60">
          {t("resultLimit", { limit: DEFAULT_LIMIT })}
        </p>
      ) : null}

      <p className="text-xs leading-relaxed opacity-60">{t("legend")}</p>
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
    <li className="rounded-md border border-black/10 px-4 py-3 dark:border-white/15">
      <p className="font-medium">{food.description}</p>
      <p className="text-xs opacity-60">
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

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
      <dt className="text-xs opacity-60">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
