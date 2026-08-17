import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { messages } from "./messages";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: messages[locale],
    // Metric everywhere, no exceptions — docs/DECISIONS.md § D7.
    formats: {
      number: {
        grams: { style: "unit", unit: "gram", maximumFractionDigits: 0 },
        kcal: { maximumFractionDigits: 0 },
        kg: { style: "unit", unit: "kilogram", maximumFractionDigits: 1 },
      },
    },
  };
});
