import type ptBR from "../../messages/pt-BR.json";
import type { AppLocale } from "@/i18n/routing";

/**
 * Makes `t("Home.heading")` a typed lookup: a key that isn't in the pt-BR
 * catalogue fails `tsc`, which is most of what stops hardcoded strings from
 * creeping back in.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof ptBR;
  }
}
