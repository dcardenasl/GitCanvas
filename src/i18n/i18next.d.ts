import type { BaseCatalogs } from "./languages";

/*
 * Types every `t()` call against the English catalogs: a mistyped key, or one
 * missing from the base language, fails the type check instead of rendering the
 * key at runtime.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: BaseCatalogs;
    returnNull: false;
  }
}
