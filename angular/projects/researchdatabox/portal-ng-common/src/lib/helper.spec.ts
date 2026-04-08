/*
* Series of helper functions to simplify testing.
*/
import { merge as _merge, isEmpty as _isEmpty } from "lodash-es";
import { InitOptions, TOptions } from 'i18next';
/**
 * Returns stub for `ConfigService`.
 *
 * Can be seeded with optional config block, however, additional methods can be added or set later on, depending on the test.
 *
 * @param optional configBlock
 * @returns
 */
export function getStubConfigService(configBlock: any = null) {
  if (_isEmpty(configBlock)) {
    configBlock = {
      csrfToken: 'testCsrfValue',
      rootContext: 'base',
      // added defaults so services depending on branding/portal resolve proper URLs without 'undefined'
      branding: 'default',
      portal: 'rdmp',
      baseUrl: '',
      i18NextOpts: {
        load: 'languageOnly',
        lng: 'en',
        supportedLngs: ['en'],
        fallbackLng: 'en',
        debug: true,
        returnEmptyString: false,
        ns: [
          'translation'
        ],
        // provide inline resources to avoid relying on XHR backend in unit tests
        resources: {
          en: {
            translation: {
              key1: 'value1'
            }
          }
        },
        // lang detection plugin options
        detection: {
          // order and from where user language should be detected
          order: ['cookie'],
          // keys or params to lookup language from
          lookupCookie: 'lang',
          // cache user language on
          caches: ['cookie'],
          // optional expire and domain for set cookie
          cookieMinutes: 10080, // 7 days
          // cookieDomain: I18NEXT_LANG_COOKIE_DOMAIN
        }
      }
    };
  }

  return {
    waitForInit: function () {
      return configBlock;
    },

    getConfig: function () {
      return configBlock;
    },

    configUrl: `${configBlock.rootContext}/dynamic/apiClientConfig?v=${new Date().getTime()}`

  };
}
/**
 * Returns stub for TranslationService
 *
 * Can be seeded with a translation map, which can be modified/replaced as needed.
 *
 * @param translationMap
 * @returns
 */
export function getStubTranslationService(translationMap: any = null) {
  if (_isEmpty(translationMap)) {
    translationMap = {
      "key1": "value1"
    }
  }

  function applyInterpolation(
    template: string,
    defaultValueOrOptions?: string | TOptions,
    options?: TOptions
  ) {
    const interpolationOptions = typeof defaultValueOrOptions === 'string' ? options : defaultValueOrOptions;
    if (_isEmpty(interpolationOptions)) {
      return template;
    }

    let value = template;
    for (const [optionKey, optionValue] of Object.entries(interpolationOptions)) {
      value = value.replaceAll(`{{${optionKey}}}`, String(optionValue));
    }

    return value;
  }

  return {
    translationMap: translationMap,
    translationChanges$: { pipe: () => ({ subscribe: () => ({ unsubscribe() {/* noop */ } }) }) },
    waitForInit: function () {
      return true;
    },
    isInitializing: function () {
      return false;
    },
    t: function (key: string, defaultValueOrOptions?: string | TOptions, options?: TOptions) {
      const translation = this.translationMap[key];

      if (translation !== undefined) {
        return applyInterpolation(String(translation), defaultValueOrOptions, options);
      }

      if (typeof defaultValueOrOptions === 'string') {
        return applyInterpolation(defaultValueOrOptions, defaultValueOrOptions, options);
      }

      return options?.defaultValue ?? defaultValueOrOptions?.defaultValue ?? key;
    }
  };
}
/**
 * Returns a UserService stub.
 *
 * @param username
 * @param password
 * @param loginResult
 * @returns
 */
export function getStubUserService(username: string = '', password: string = '', loginResult: any = { url: '#greatsuccess', user: null }, userData: any = {}, rolesData: any = {}) {

  return {
    waitForInit: function () {
      return true;
    },
    isInitializing: function () {
      return false;
    },
    username: username,
    password: password,
    loginResult: loginResult,
    loginLocal(username: string, password: string) {
      if (username == this.username && this.password == password) {
        this.loginResult.user = { username: username, password: password };
      } else {
        this.loginResult.user = null;
        this.loginResult.message = 'Invalid username/password';
      }
      return this.loginResult;
    }, getBrandRoles() {
      return rolesData;
    }, getUsers() {
      return userData;
    }, updateUserDetails() {
      return { status: 'OK' };
    }, addLocalUser() {
      return { status: 'OK' };
    }, updateUserRoles() {
      return { status: 'OK' };
    }, genKey() {
      return { status: true, message: 'generated-token' };
    }, revokeKey() {
      return { status: true, message: 'revoked' };
    }, searchLinkCandidates() {
      return [];
    }, getUserLinks() {
      return { primary: userData[0] || null, linkedAccounts: [] };
    }, getUserAudit() {
      return { user: userData[0] || null, records: [], summary: { returnedCount: 0, truncated: false } };
    }, linkAccounts() {
      return { primary: userData[0] || null, linkedAccounts: [], impact: { recordsRewritten: 0, rolesMerged: 0 } };
    }, disableUser() {
      return { status: true, message: 'disabled' };
    }, enableUser() {
      return { status: true, message: 'enabled' };
    }
  };
}

export function getStubRecordService(recordData: any = {}) {

  return {
    baseUrl: 'base',
    brandingAndPortalUrl: 'base/default/rdmp',
    waitForInit: function () {
      return this;
    },
    isInitializing: function () {
      return false;
    },
    getAllTypes: function () {
      return recordData['types'];
    }, getDashboardType: function () {
      return recordData['dashboardType'];
    }, getWorkflowSteps: function () {
      return recordData['step'];
    }, getRecords: function () {
      return recordData['records'];
    }, getRelatedRecords: function () {
      return recordData['relatedRecords'];
    }, getDeletedRecords: function () {
      return recordData['deletedRecords'];
    }
  }
}

export const localeId = 'cimode';

export function appInit(translationService: { waitForInit: () => Promise<any> | any }, _options?: InitOptions) {
  return () => {
    return translationService.waitForInit();
  };
}

export function getStubReportService(reportData: any = {}) {

  return {
    baseUrl: 'base',
    brandingAndPortalUrl: 'base/default/rdmp',
    waitForInit: function () {
      return this;
    },
    isInitializing: function () {
      return false;
    },
    getReportResult: function (name: string, pageNum: number, params: any, rows: number = 10) {
      return reportData.reportResult;
    },
    getReportConfig: function (name: string) {
      return reportData.reportConfig;
    }
  };
}
