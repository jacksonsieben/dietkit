"use client";

import { useState, type ChangeEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { FileField } from "@/components/nd/FileField";
import { Action, ActionButton, Legend, TextLink } from "@/components/nd/kit";
import { todayIsoDate } from "@/lib/date";
import { allItems, optionSetsOf } from "@/lib/diet/options";
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

/**
 * Every list on this screen: the summary, the notes, the conflicts, the
 * refusals. They are all the same thing — a run of short statements about the
 * file — so they are drawn the same, and the marker is left as a disc because
 * a dot is the one mark this world was already made of.
 */
const LIST = "flex list-disc flex-col gap-1 pl-5 text-sm marker:text-nd-dim";

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
          carbSet: t("carbSet"),
          proteinSet: t("proteinSet"),
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
        <Legend as="h2">{t("doneTitle")}</Legend>
        <p className="max-w-prose text-sm leading-relaxed">{t("doneLead")}</p>

        {review === undefined ? null : <Notes notes={review.result.notes} />}

        <div className="flex flex-wrap items-center gap-4">
          <Action href="/dieta">{t("planLink")}</Action>
          <TextLink href="/perfil">{t("profileLink")}</TextLink>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <FileField
        id="import-file"
        accept="application/json,.json"
        label={t("fileLabel")}
        hint={t("fileHint")}
        action={t("fileAction")}
        empty={t("fileEmpty")}
        onChange={(event) => void onFile(event)}
      />

      {stage === "reading" ? (
        <p className="text-sm text-nd-dim">{t("reading")}</p>
      ) : null}

      {stage === "fetching" ? (
        <p className="text-sm text-nd-dim">{t("fetching")}</p>
      ) : null}

      {stage === "readFailed" ? (
        <p className="text-sm text-nd-red-ink">{t("readError")}</p>
      ) : null}

      {/* A file this app refuses is the same kind of event as a macro that
          misses its target, and gets the same left rail: red is never the only
          thing carrying it — the heading and every line below say what is
          wrong in words. */}
      {stage === "invalid" ? (
        <section className="flex flex-col gap-3 border-l-2 border-nd-red pl-4">
          <Legend as="h2">{t("invalidTitle")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-red-ink">
            {t("invalidLead")}
          </p>
          <ul className={LIST}>
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
            <Legend as="h2">{t("reviewTitle")}</Legend>
            <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
              {t("reviewLead")}
            </p>
          </div>

          <Summary result={review.result} />

          {review.conflicts.profile ||
          review.conflicts.goal ||
          review.conflicts.diets > 0 ? (
            <section className="flex flex-col gap-2 border-l-2 border-nd-red pl-4">
              <Legend as="h3">{t("conflictsTitle")}</Legend>
              <ul className={LIST}>
                {review.conflicts.profile ? (
                  <li>{t("conflictProfile")}</li>
                ) : null}
                {review.conflicts.goal ? <li>{t("conflictGoal")}</li> : null}
                {review.conflicts.diets > 0 ? (
                  <li>
                    {t("conflictDiets", { count: review.conflicts.diets })}
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {review.defaulted.length === 0 ? null : (
            <section className="flex flex-col gap-2">
              <Legend as="h3">{t("defaultedTitle")}</Legend>
              <ul className={LIST}>
                {review.defaulted.map((key) => (
                  <li key={key}>{t("defaulted", { key })}</li>
                ))}
              </ul>
            </section>
          )}

          <Notes notes={review.result.notes} />

          <div className="flex flex-wrap items-center gap-4">
            <ActionButton
              type="button"
              onClick={() => void confirm()}
              disabled={stage === "saving"}
            >
              {stage === "saving" ? t("saving") : t("confirm")}
            </ActionButton>
          </div>

          {stage === "saveFailed" ? (
            <p className="text-sm text-nd-red-ink">{t("saveError")}</p>
          ) : null}
        </section>
      )}
    </div>
  );
}

function Summary({ result }: { result: ImportResult }) {
  const t = useTranslations("Import");
  const format = useFormatter();
  // Every row, not just today's: what is being imported is the plan, and the
  // versions nobody has selected are as much of it as the ones they have.
  const items = result.diet.meals.reduce(
    (total, meal) => total + allItems(meal).length,
    0,
  );
  const sets = result.diet.meals.flatMap(optionSetsOf);
  const options = sets.reduce((total, set) => total + set.options.length, 0);

  return (
    <ul className={LIST}>
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
      <li>{t("summaryOptions", { sets: sets.length, options })}</li>
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
      <Legend as="h3">{t("notesTitle")}</Legend>

      {notes.length === 0 ? (
        <p className="text-sm text-nd-dim">{t("notesEmpty")}</p>
      ) : (
        <>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("notesLead")}
          </p>
          <ul className={LIST}>
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
