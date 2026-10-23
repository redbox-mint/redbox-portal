import { LegacyTranslationEntries } from '../compat/sails/translationEntries';
import { isBundle as domainIsBundle, type Bundle as DomainBundle } from '../translations/I18nEntries';
export namespace Services {
  export type Bundle = DomainBundle;
  export const isBundle = domainIsBundle;
  export class I18nEntries extends LegacyTranslationEntries {}
}
declare global {
  let I18nEntriesService: Services.I18nEntries;
}
