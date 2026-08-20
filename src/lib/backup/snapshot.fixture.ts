import type { Snapshot } from "@/lib/storage/types";

/**
 * A backup with one of everything in it.
 *
 * Written as a plain object rather than produced by exporting a seeded
 * repository, because what these tests check is what happens to a *file* — and
 * a file made by the app is the one input that is guaranteed to be well formed.
 * Every case worth testing is some mutation of this, so it has to be something
 * a test can bend.
 */
export function fullSnapshot(): Snapshot {
  return {
    schemaVersion: 1,
    exportedAt: "2026-08-20T12:00:00.000Z",
    profile: {
      heightCm: 178,
      birthDate: "1994-03-05",
      sex: "male",
      activityFactor: 1.55,
      updatedAt: "2026-08-01T08:00:00.000Z",
    },
    weight: [
      {
        id: "w-1",
        date: "2026-08-18",
        weightKg: 81.7,
        recordedAt: "2026-08-18T07:12:00.000Z",
      },
      {
        id: "w-2",
        date: "2026-08-19",
        weightKg: 81.2,
        note: "depois do treino",
        recordedAt: "2026-08-19T07:05:00.000Z",
      },
    ],
    diets: [
      {
        id: "d-1",
        name: "Cutting agosto",
        targets: { kcal: 2100, proteinG: 164, carbG: 200, fatG: 58 },
        meals: [
          {
            id: "m-1",
            name: "Almoço",
            share: 0.4,
            items: [
              {
                id: "i-1",
                food: { source: "taco", tacoId: 4 },
                quantityG: 150,
                mandatory: true,
                minG: 100,
                maxG: 250,
              },
              {
                id: "i-2",
                food: { source: "custom", customFoodId: "c-1" },
                quantityG: 30,
                mandatory: false,
                minG: 0,
                maxG: 60,
                substitutionGroupId: "g-1",
              },
            ],
          },
        ],
        tacoFoods: [
          {
            tacoId: 4,
            name: "Arroz, integral, cozido",
            per100g: { kcal: 124, proteinG: 2.6, carbG: 25.8, fatG: 1 },
          },
        ],
        basedOnWeightKg: 82,
        createdAt: "2026-08-02T10:00:00.000Z",
        updatedAt: "2026-08-15T10:00:00.000Z",
      },
    ],
    customFoods: [
      {
        id: "c-1",
        name: "Whey baunilha",
        brand: "Marca X",
        per100g: { kcal: 380, proteinG: 78, carbG: 8, fatG: 4 },
        servingG: 30,
        createdAt: "2026-07-20T11:00:00.000Z",
        updatedAt: "2026-07-20T11:00:00.000Z",
      },
    ],
    substitutionGroups: [
      {
        id: "g-1",
        name: "Proteínas em pó",
        foods: [{ source: "custom", customFoodId: "c-1" }],
        createdAt: "2026-07-21T11:00:00.000Z",
        updatedAt: "2026-07-21T11:00:00.000Z",
      },
    ],
    settings: {
      locale: "pt-BR",
      lastBackupAt: "2026-08-10T09:00:00.000Z",
      goal: {
        kind: "lose",
        adjustment: { unit: "kcal", value: 500 },
        proteinGPerKg: 2,
        fat: { unit: "percent", value: 25 },
      },
    },
  };
}

/** The same backup as text, which is the form the restore screen gets it in. */
export function fullSnapshotFile(): string {
  return JSON.stringify(fullSnapshot());
}
