import { notFound } from "next/navigation";

/**
 * Next only routes genuinely unmatched URLs to the *root* `not-found`, so
 * without this the proxy rewrites `/nao-existe` into the locale segment and the
 * user still gets Next's untranslated default page. Catching the rest here
 * turns it into a `notFound()` thrown inside `[locale]`, which the segment's
 * own not-found boundary renders in pt-BR.
 */
export default function CatchAllPage(): never {
  notFound();
}
