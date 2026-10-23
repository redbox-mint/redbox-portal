import { registerPersistenceResource } from '../../persistence/runtime';
import _ from 'lodash';
import { Services as Domain } from '../../translations/Translation';
import { getConfigurationRepositories } from '../../persistence/runtime';
export class LegacyTranslation extends Domain.Translation {
  public constructor() {
    super({
      get repository() {
        return getConfigurationRepositories();
      },
      get log() {
        return sails.log;
      },
      get config() {
        return sails.config;
      },
      getBrand: name => BrandingService.getBrand(name),
      availableBrands: () => BrandingService.getAvailable(),
    });
  }
  public async handle(req: Sails.Req, res: Sails.Res, next: () => void) {
    let langCode: string | undefined = req.param('lng');
    const sessLangCode = req.session?.lang;
    const defaultLang = _.isArray(sails.config.i18n.next.init.fallbackLng)
      ? sails.config.i18n.next.init.fallbackLng[0]
      : sails.config.i18n.next.init.fallbackLng;
    if (_.isEmpty(langCode) && _.isEmpty(sessLangCode)) {
      // use the default
      langCode = defaultLang;
    } else if (!_.isEmpty(sessLangCode) && _.isEmpty(langCode)) {
      // use the session code if not found as request param
      langCode = sessLangCode;
    }

    // Get branding and ensure i18next instance exists
    const brandingName = BrandingService.getBrandNameFromReq(req);
    const branding = BrandingService.getBrand(brandingName);

    // Ensure i18next instance exists for this branding
    const i18nextInstance = await this.getI18nextForBranding(branding);

    // validating language - get available languages from DB for current branding
    const availableLanguages = await this.getAvailableLanguagesForBranding(branding);
    if (
      _.findIndex(availableLanguages, (l: string) => {
        return langCode == l;
      }) == -1
    ) {
      // unsupported language, set to default
      this.input.log.warn(`Unsupported language code: ${langCode}, setting to default.`);
      langCode = defaultLang;
    }
    const resolvedLang = (langCode || defaultLang || 'en') as string;

    // save the lang in the session
    if (_.isEmpty(req.session)) {
      req.session = {} as typeof req.session;
    }
    req.session.lang = resolvedLang;
    req.options = req.options ?? {};
    req.options.locals = req.options.locals ?? {};
    // set the locals lang code
    req.options.locals.lang = resolvedLang;
    // set the cookie
    res.cookie('lng', resolvedLang);

    // Inject branding-specific i18next instance into locals
    req.options.locals.TranslationService = _.merge(this, {
      t: function (key: string, context?: Record<string, unknown>) {
        if (context === undefined) {
          return i18nextInstance.getFixedT(resolvedLang)(key);
        }
        return i18nextInstance.getFixedT(resolvedLang)(key, context);
      },
      tInter: function (key: string, context?: Record<string, unknown>) {
        if (context === undefined) {
          return i18nextInstance.getFixedT(resolvedLang)(key);
        }
        return i18nextInstance.getFixedT(resolvedLang)(key, context);
      },
    });

    next();
  }
  public exports(): Record<string, unknown> {
    return Object.fromEntries(methods.map(name => [name, this[name].bind(this)]));
  }
}
const methods = [
  'clearInstances',
  'bootstrap',
  't',
  'tInter',
  'reloadResources',
  'getAvailableLanguagesForBranding',
  'handle',
] as const;
const key = Symbol.for('@researchdatabox/redbox-core/comparison/Translation');
export function sailsTranslationExports(): Record<string, unknown> {
  return Object.fromEntries(
    methods.map(name => [
      name,
      (...args: unknown[]) => {
        let instance = Reflect.get(sails, key) as LegacyTranslation | undefined;
        if (!instance) {
          instance = new LegacyTranslation();
          Object.defineProperty(sails, key, { value: instance });
          registerPersistenceResource(sails, 'Translation', { close: () => instance!.close() });
        }
        const method: unknown = Reflect.get(instance, name);
        if (typeof method !== 'function') throw new Error('Missing translation operation: ' + name);
        return Reflect.apply(method, instance, args);
      },
    ])
  );
}
