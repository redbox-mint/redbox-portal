import assert from 'node:assert/strict';
import { registerCoreApiRoutes } from '../../../src/api-routes';
import { buildContractApiPolicies } from '../../../src/config/policies.config';
import { recordGraphql } from '../../../src/config/recordGraphql.config';
import { WebserviceControllerNames } from '../../../src/controllers';
import { ServiceExports } from '../../../src/services';

describe('GraphQL registration', () => {
  it('registers one authenticated POST action with explicit route authorization', () => {
    const routes = registerCoreApiRoutes().filter(route => route.controller === 'webservice/RecordGraphqlController');
    assert.equal(routes.length, 1);
    assert.equal(routes[0].method, 'post');
    assert.equal(routes[0].path, '/:branding/:portal/api/graphql');
    assert.deepEqual(routes[0].security, [{ bearerAuth: [] }]);
    const policies = buildContractApiPolicies(routes)['webservice/RecordGraphqlController'];
    assert.ok(typeof policies === 'object' && !Array.isArray(policies));
    assert.deepEqual(policies.execute, [
      'noCache',
      'brandingAndPortal',
      'checkBrandingValid',
      'setLang',
      'prepWs',
      'i18nLanguages',
      'menuResolver',
      'isWebServiceAuthenticated',
      'checkRecordGraphqlAuth',
      'contentSecurityPolicy',
      'validateApiContractRequest',
    ]);
    assert.ok(WebserviceControllerNames.includes('RecordGraphqlController'));
    assert.equal(typeof Reflect.get(ServiceExports.RecordGraphqlService as object, 'execute'), 'function');
    assert.equal(recordGraphql.enabled, false);
  });
});
