import type { SailsConfig } from "redbox-core-types";

/**
 * Internationalization / Localization Settings
 * (sails.config.i18n)
 *
 * If your app will touch people from all over the world, i18n (or internationalization)
 * may be an important part of your international strategy.
 *
 *
 * For more informationom i18n in Sails, check out:
 * http://sailsjs.org/#!/documentation/concepts/Internationalization
 *
 * For a complete list of i18n options, see:
 * https://github.com/mashpie/i18n-node#list-of-configuration-options
 *
 *
 */

const i18nConfig: SailsConfig["i18n"] = {

  /***************************************************************************
  *                                                                          *
  * Which locales are supported?                                             *
  *                                                                          *
  ***************************************************************************/

  // locales: ['en', 'es', 'fr', 'de'],

  /****************************************************************************
  *                                                                           *
  * What is the default locale for the site? Note that this setting will be   *
  * overridden for any request that sends an "Accept-Language" header (i.e.   *
  * most browsers), but it's still useful if you need to localize the         *
  * response for requests made by non-browser clients (e.g. cURL).            *
  *                                                                           *
  ****************************************************************************/

  // defaultLocale: 'en',

  /****************************************************************************
  *                                                                           *
  * Automatically add new keys to locale (translation) files when they are    *
  * encountered during a request?                                             *
  *                                                                           *
  ****************************************************************************/

  // updateFiles: false,

  /****************************************************************************
  *                                                                           *
  * Path (relative to app root) of directory to store locale (translation)    *
  * files in.                                                                 *
  *                                                                           *
  ****************************************************************************/

  // localesDirectory: '/config/locales'

  // i18next specific config, 'backend.loadPath' is intentionally not included as this configuration is shared with angular-i18next
  next: {
    init: {
      supportedLngs: ['en'],
      // preload is required in the server-side
      preload: ['en'],
      debug: true,
      fallbackLng: 'en',
      lowerCaseLng: true,
      initImmediate: false,
      skipOnVariables: false,
      returnEmptyString: false,
      ns: [
        'translation'
      ],
      detection: {
        // order and from where user language should be detected
        order: ['cookie'],
        // keys or params to lookup language from
        lookupCookie: 'lng',
        // cache user language on
        caches: ['cookie'],
        // optional expire and domain for set cookie
        cookieMinutes: 10080, // 7 days
        // cookieDomain: I18NEXT_LANG_COOKIE_DOMAIN
        lookupSession: 'lang',
        // lookupQuerystring: 'lng'
      }
    }
  }
};

module.exports.i18n = i18nConfig;
