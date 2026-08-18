import { db } from "@/lib/db/client";
import { searchFoods } from "@/lib/db/foods";
import { foodSearchResponse } from "@/lib/foods/endpoint";

/**
 * Food search over the TACO table (#16).
 *
 * Reference data only, in both directions: the request carries a word out of a
 * search box and nothing else, and the response carries what NEPA published.
 * Nothing on this path can reach the profile, the weight log or a diet —
 * those live in IndexedDB on the device and have no route to a server at all
 * (docs/DECISIONS.md § D1).
 *
 * The term is deliberately not logged. It does appear in the request URL, which
 * the hosting platform records like any other address; the privacy notice says
 * so rather than claiming a silence we do not control.
 *
 * Not cached by Next — route handlers no longer are by default — but cacheable
 * downstream, which is what the `cache-control` in `foodSearchResponse` is for.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  return foodSearchResponse(
    (query, limit) => searchFoods(db(), query, limit),
    searchParams,
  );
}
