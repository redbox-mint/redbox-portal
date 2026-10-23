import { LegacyTranslation } from '../compat/sails/translation';
export namespace Services {
  export class Translation extends LegacyTranslation {}
}
declare global {
  let TranslationService: Services.Translation;
}
