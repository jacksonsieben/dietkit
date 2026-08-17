import type { AppLocale } from "./routing";

/**
 * The single place a locale is mapped to its catalogue.
 *
 * Static imports rather than a dynamic `import(\`../../messages/${locale}.json\`)`
 * so that a locale added to `routing.locales` without a catalogue is a type
 * error at build time instead of a 500 in production.
 */
import ptBR from "../../messages/pt-BR.json";

export const messages: Record<AppLocale, typeof ptBR> = {
  "pt-BR": ptBR,
};
