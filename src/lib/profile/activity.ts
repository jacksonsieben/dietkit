import { toField } from "./persistence";

/**
 * The activity ladder: the named rungs a person picks between, and the
 * multiplier each one stands for.
 *
 * BMR is what a body costs at rest, so it has to be scaled by how much the
 * person actually moves before it means anything. Nobody knows their own
 * multiplier — "1,55" is not a fact anyone has about themselves — so the field
 * asks the question in the terms someone can answer and stores the number.
 *
 * The values are the conventional Harris-Benedict/Mifflin ladder, and they are
 * conventional rather than derived: no study hands you 1.375. That, and the
 * fact that two calculators will disagree about which rung a given week of
 * training lands on, is what #14 has to say out loud. This module exists now so
 * that when #14 adds the custom override there is one place holding the rungs
 * rather than a list inlined in a component.
 */
/**
 * `as const` so each `id` keeps its literal type. That is what lets the form
 * write ``t(`activityLevel.${level.id}`)`` and have TypeScript check the key
 * against the catalogue — with a widened `string` the lookup would compile
 * whatever the messages actually contain, and a missing rung would ship as its
 * own key path shown in a dropdown.
 */
export const ACTIVITY_LEVELS = [
  { id: "sedentary", factor: 1.2 },
  { id: "light", factor: 1.375 },
  { id: "moderate", factor: 1.55 },
  { id: "high", factor: 1.725 },
  { id: "athlete", factor: 1.9 },
] as const;

export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/** The message id for a rung, and what a stored preference would name it by. */
export type ActivityLevelId = ActivityLevel["id"];

/**
 * The value the select can offer as a rung, or `undefined` for one it cannot.
 *
 * #14 lets a factor be typed by hand, so the field has two modes and something
 * has to decide which one a stored value opens in. Anything that is not one of
 * the rungs is the custom mode's business: a hand-typed 1,6, a value carried in
 * by an import (#26), or a rung this app removes in some later version.
 *
 * The rule lives here rather than in the component because of what it prevents.
 * A `<select>` handed a value none of its options match renders as though
 * nothing were selected, and the next thing the user touches writes a rung over
 * it. Nobody sees that happen — the field simply reads "Moderadamente ativo"
 * one day, and the target has moved.
 *
 * Takes the field string rather than a number because that is what the options
 * are matched on and what the form actually holds.
 */
export function isCustomActivity(field: string): boolean {
  if (field === "") return false;

  return !ACTIVITY_LEVELS.some((level) => toField(level.factor) === field);
}

/**
 * The rung a stored factor sits on, or `undefined` if it sits between two.
 *
 * Between two is a real state, not a corruption: an import (#26) can carry any
 * number in range, and #14 will let people type one deliberately. The caller's
 * job is to keep such a value rather than round it to the nearest rung — a
 * silent adjustment to a number the user chose is the kind of edit nobody
 * notices until their target has drifted.
 */
export function activityLevelFor(factor: number): ActivityLevel | undefined {
  return ACTIVITY_LEVELS.find((level) => level.factor === factor);
}
