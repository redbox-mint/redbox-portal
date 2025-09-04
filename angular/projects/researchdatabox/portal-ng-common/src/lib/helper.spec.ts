/*
* Series of helper functions to simplify testing.
*/
import { merge as _merge, isEmpty as _isEmpty } from "lodash-es";
import {
  I18NextLoadResult, I18NextModule, ITranslationService
} from 'angular-i18next';
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
    waitForInit: function() {
      return configBlock;
    },

    getConfig: function() {
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
  if (_isEmpty()) {
    translationMap = {
      "key1": "value1"
    }
  }
  return {
    translationMap: translationMap,
    waitForInit: function() {
      return true;
    },
    isInitializing: function() {
      return false;
    },
    t: function(key: string) {
      return this.translationMap[key];
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
export function getStubUserService(username: string = '', password: string = '', loginResult: any = {url: '#greatsuccess', user: null}, userData: any = {}, rolesData: any = {}) {

  return {
    waitForInit: function() {
      return true;
    },
    isInitializing: function() {
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
    }
  };
}

export function getStubRecordService(recordData: any = {}) {

  return {
    baseUrl: 'base',
    brandingAndPortalUrl: 'base/default/rdmp',
    waitForInit: function() {
      return this;
    },
    isInitializing: function() {
      return false;
    },
    getAllTypes: function() {
      return recordData['types'];
    },getDashboardType: function() {
      return recordData['dashboardType'];
    },getWorkflowSteps: function() {
      return recordData['step'];
    },getRecords: function() {
      return recordData['records'];
    },getRelatedRecords: function() {
      return recordData['relatedRecords'];
    },getDeletedRecords: function() {
      return recordData['deletedRecords'];
    }
  }
}

export const localeId = 'cimode';

export function appInit(i18next: ITranslationService) {
  return () => {
    let promise: Promise<I18NextLoadResult> = i18next.init({
      lng: 'cimode',
      // debug: true,
      // appendNamespaceToCIMode: true,
      // appendNamespaceToMissingKey: true,
      interpolation: {
        format: I18NextModule.interpolationFormat()
      }
    });
    return promise;
  };
}

export function getStubReportService(reportData: any = {}) {

  return {
    baseUrl: 'base',
    brandingAndPortalUrl: 'base/default/rdmp',
    waitForInit: function() {
      return this;
    },
    isInitializing: function() {
      return false;
    },
    getReportResult: function(name: string, pageNum:number, params:any, rows:number = 10) {
      return reportData.reportResult;
    },
    getReportConfig: function(name: string) {
      return reportData.reportConfig;
    }
  };
}