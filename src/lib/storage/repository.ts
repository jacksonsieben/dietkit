import type {
  CustomFood,
  Diet,
  Id,
  IsoDate,
  Profile,
  Settings,
  Snapshot,
  SubstitutionGroup,
  TrainingRotation,
  WeightEntry,
} from "./types";

/**
 * The seam between the app and wherever its data happens to live.
 *
 * Everything is async even where the current adapter could answer
 * synchronously. That is the point: today both implementations are local, and a
 * later opt-in sync backend is not, and a signature that assumed synchronous
 * reads would force a rewrite of every caller at exactly that moment
 * (docs/SCOPE.md § P0 — "keeps opt-in sync reachable later without a rewrite").
 *
 * No component imports Dexie. `eslint.config.mjs` restricts `dexie` to
 * `src/lib/storage/dexie/**`, so the rule is enforced by the linter rather than
 * by remembering it in review.
 */
export interface ProfileRepository {
  get(): Promise<Profile | undefined>;
  save(profile: Profile): Promise<void>;
  clear(): Promise<void>;
}

export interface WeightRepository {
  /** Ascending by date — the order the chart (#24) wants. */
  list(): Promise<WeightEntry[]>;
  getByDate(date: IsoDate): Promise<WeightEntry | undefined>;
  /** Most recent entry by date. Seeds "use my latest weight" (#25). */
  latest(): Promise<WeightEntry | undefined>;
  /** Upsert keyed on `date`, not `id`: one weight per day (#23). */
  put(entry: WeightEntry): Promise<void>;
  remove(id: Id): Promise<void>;
}

export interface DietRepository {
  /** Most recently updated first. */
  list(): Promise<Diet[]>;
  get(id: Id): Promise<Diet | undefined>;
  put(diet: Diet): Promise<void>;
  remove(id: Id): Promise<void>;
}

export interface CustomFoodRepository {
  list(): Promise<CustomFood[]>;
  get(id: Id): Promise<CustomFood | undefined>;
  /** Case- and accent-insensitive substring match: "acai" finds "Açaí". */
  search(term: string): Promise<CustomFood[]>;
  put(food: CustomFood): Promise<void>;
  remove(id: Id): Promise<void>;
}

export interface SubstitutionGroupRepository {
  /** Alphabetical: these are browsed by name, not by when they were written. */
  list(): Promise<SubstitutionGroup[]>;
  get(id: Id): Promise<SubstitutionGroup | undefined>;
  put(group: SubstitutionGroup): Promise<void>;
  remove(id: Id): Promise<void>;
}

/**
 * One record, or none: a person runs one split at a time (#78).
 *
 * Shaped like `ProfileRepository` rather than like a list, because "which
 * split am I on" has exactly one answer and a store that could hold two would
 * need a rule for which one the screen means.
 */
export interface TrainingRepository {
  get(): Promise<TrainingRotation | undefined>;
  save(rotation: TrainingRotation): Promise<void>;
  /** Choosing a different split, or stopping. */
  clear(): Promise<void>;
}

export interface SettingsRepository {
  /** Never undefined — an unset store reads back as defaults. */
  get(): Promise<Settings>;
  patch(changes: Partial<Settings>): Promise<Settings>;
}

export interface Repository {
  readonly profile: ProfileRepository;
  readonly weight: WeightRepository;
  readonly diets: DietRepository;
  readonly customFoods: CustomFoodRepository;
  readonly substitutionGroups: SubstitutionGroupRepository;
  readonly training: TrainingRepository;
  readonly settings: SettingsRepository;

  /**
   * The user's whole dataset in one object. On the interface rather than in a
   * P3 backup module because the export *is* the only backup this architecture
   * offers, so every adapter has to be able to produce one.
   */
  exportAll(): Promise<Snapshot>;
  /** Replaces everything. Restore is not a merge — see the contract tests. */
  importAll(snapshot: Snapshot): Promise<void>;
  clearAll(): Promise<void>;
}
