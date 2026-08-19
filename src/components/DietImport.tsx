"use client";

import { useState, type ChangeEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { todayIsoDate } from "@/lib/date";
import { PREDECESSOR_CATALOGUE } from "@/lib/import/catalogue.data";
import {
  importPlan,
  neededTacoIds,
  type ImportNote,
  type ImportResult,
} from "@/lib/import/import";
import { parseProfileFile, type ProfileIssue } from "@/lib/import/profile";
import {
  applyImport,
  fetchCompositions,
  importConflicts,
  type ImportConflicts,
} from "@/lib/import/store";
import { getRepository } from "@/lib/storage";

/**
 * The screen that reads a file from the predecessor and writes what it can to
 * this device (#22).
 *
 * A client component because both ends of it are: the file is read in the
 * browser and never uploaded, and everything it produces goes to IndexedDB.
 * The one request it makes is for TACO rows by id — reference data, nothing
 * from the file — and it works without that, badly but honestly.
 *
 * Two steps rather than one. An import replaces the profile and the goal, and
 * the two apps do not compute the same numbers from the same file: the review
 * is where that is said, in a list the user reads before anything is written,
 * rather than in a toast after.
 */

type Stage =
  | "choosing"
  | "reading"
  | "fetching"
  | "invalid"
  | "reviewing"
  | "saving"
  | "done"
  | "readFailed"
  | "saveFailed";

interface Review {
  readonly result: ImportResult;
  readonly conflicts: ImportConflicts;
  /** Keys the file predates, which took the old app's factory value. */
  readonly defaulted: readonly string[];
}

export function DietImport() {
  const t = useTranslations("Import");

  const [stage, setStage] = useState<Stage>("choosing");
  const [issues, setIssues] = useState<readonly ProfileIssue[]>([]);
  const [review, setReview] = useState<Review | undefined>(undefined);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;

    setStage("reading");
    setReview(undefined);

    let text: string;
    try {
      text = await file.text();
    } catch {
      setStage("readFailed");
      return;
    }

    const parsed = parseProfileFile(text);
    if (!parsed.ok) {
      setIssues(parsed.issues);
      setStage("invalid");
      return;
    }

    setStage("fetching");

    try {
      const compositions = await fetchCompositions(
        neededTacoIds(PREDECESSOR_CATALOGUE),
      );

      const result = importPlan({
        profile: parsed.value,
        catalogue: PREDECESSOR_CATALOGUE,
        compositions,
        names: {
          diet: t("dietName"),
          fruits: t("fruitsGroup"),
          nuts: t("nutsGroup"),
        },
        today: todayIsoDate(),
        now: new Date().toISOString(),
        newId: () => crypto.randomUUID(),
      });

      setReview({
        result,
        conflicts: await importConflicts(getRepository()),
        defaulted: parsed.defaulted,
      });
      setStage("reviewing");
    } catch {
      setStage("readFailed");
    }
  };

  const confirm = async () => {
    if (review === undefined) return;
    setStage("saving");

    try {
      await applyImport(getRepository(), review.result);
      setStage("done");
    } catch {
      setStage("saveFailed");
    }
  };

  if (stage === "done") {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold tracking-tight">
          {t("doneTitle")}
        </h2>
        <p className="text-sm leading-relaxed opacity-80">{t("doneLead")}</p>

        {review === undefined ? null : <Notes notes={review.result.notes} />}

        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/dieta"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            {t("planLink")}
          </Link>
          <Link href="/perfil" className="text-sm underline underline-offset-4">
            {t("profileLink")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="import-file" className="text-sm font-medium">
          {t("fileLabel")}
        </label>
        <input
          id="import-file"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void onFile(event)}
          className="w-full rounded-md border border-black/15 bg-background px-3 py-2 text-sm text-foreground dark:border-white/20"
        />
        <p className="text-xs opacity-60">{t("fileHint")}</p>
      </div>

      {stage === "reading" ? (
        <p className="text-sm opacity-60">{t("reading")}</p>
      ) : null}

      {stage === "fetching" ? (
        <p className="text-sm opacity-60">{t("fetching")}</p>
      ) : null}

      {stage === "readFailed" ? (
        <p className="text-sm text-red-700 dark:text-red-400">
          {t("readError")}
        </p>
      ) : null}

      {stage === "invalid" ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-tight">
            {t("invalidTitle")}
          </h2>
          <p className="text-sm leading-relaxed opacity-80">
            {t("invalidLead")}
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm opacity-80">
            {issues.map((issue) => (
              <li key={`${issue.code}-${issue.key}`}>
                {t(`issues.${issue.code}`, { key: issue.key })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {review === undefined ? null : (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              {t("reviewTitle")}
            </h2>
            <p className="text-sm opacity-70">{t("reviewLead")}</p>
          </div>

          <Summary result={review.result} />

          {review.conflicts.profile ||
          review.conflicts.goal ||
          review.conflicts.diets > 0 ? (
            <section className="flex flex-col gap-2 rounded-md border border-amber-600/40 px-4 py-3">
              <h3 className="text-sm font-semibold tracking-tight">
                {t("conflictsTitle")}
              </h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm opacity-80">
                {review.conflicts.profile ? <li>{t("conflictProfile")}</li> : null}
                {review.conflicts.goal ? <li>{t("conflictGoal")}</li> : null}
                {review.conflicts.diets > 0 ? (
                  <li>{t("conflictDiets", { count: review.conflicts.diets })}</li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {review.defaulted.length === 0 ? null : (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-tight">
                {t("defaultedTitle")}
              </h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm opacity-80">
                {review.defaulted.map((key) => (
                  <li key={key}>{t("defaulted", { key })}</li>
                ))}
              </ul>
            </section>
          )}

          <Notes notes={review.result.notes} />

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={stage === "saving"}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
            >
              {stage === "saving" ? t("saving") : t("confirm")}
            </button>
          </div>

          {stage === "saveFailed" ? (
            <p className="text-sm text-red-700 dark:text-red-400">
              {t("saveError")}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}

function Summary({ result }: { result: ImportResult }) {
  const t = useTranslations("Import");
  const format = useFormatter();
  const items = result.diet.meals.reduce(
    (total, meal) => total + meal.items.length,
    0,
  );

  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm opacity-80">
      <li>
        {t("summaryDiet", {
          name: result.diet.name,
          meals: result.diet.meals.length,
          items,
        })}
      </li>
      <li>
        {t("summaryTargets", {
          kcal: Math.round(result.diet.targets.kcal),
          protein: Math.round(result.diet.targets.proteinG),
          carb: Math.round(result.diet.targets.carbG),
          fat: Math.round(result.diet.targets.fatG),
        })}
      </li>
      <li>{t("summaryCustomFoods", { count: result.customFoods.length })}</li>
      <li>{t("summaryGroups", { count: result.groups.length })}</li>
      <li>
        {t("summaryWeight", {
          weight: result.weight.weightKg,
          date: format.dateTime(localDate(result.weight.date), {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        })}
      </li>
    </ul>
  );
}

/**
 * An `IsoDate` as a `Date` in this device's zone.
 *
 * `new Date("2026-08-19")` is UTC midnight, which in Brazil is the evening of
 * the 18th — the date the entry was logged on would print as the day before.
 */
function localDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

/**
 * Every note, in the order the import made them, and never folded into a
 * count.
 *
 * "12 alimentos adaptados" would be the tidy version and is exactly what #22
 * forbids: an item the import could not place is only reported once, here, and
 * a user who cannot see which one it was has been told nothing.
 */
function Notes({ notes }: { notes: readonly ImportNote[] }) {
  const t = useTranslations("Import");

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-tight">{t("notesTitle")}</h3>

      {notes.length === 0 ? (
        <p className="text-sm opacity-70">{t("notesEmpty")}</p>
      ) : (
        <>
          <p className="text-sm opacity-70">{t("notesLead")}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm opacity-80">
            {notes.map((note, index) => (
              <li key={`${note.code}-${note.subject ?? ""}-${index}`}>
                {t(`notes.${note.code}`, {
                  subject: note.subject ?? "",
                  value: note.value ?? 0,
                })}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
