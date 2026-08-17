import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`; the contract is unchanged.
 * next-intl uses it to resolve the active locale for the `[locale]` segment.
 */
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals and anything with a file extension. The
  // health check must never be rewritten into the locale segment.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
