import assert from 'node:assert/strict';
import type { BuildResponseType } from '../../../src/model';
import { Controllers } from '../../../src/controllers/webservice/PublicationVocabularyController';
import { publicationVocabularyApiRoutes } from '../../../src/api-routes/groups/publication-vocabulary';
import { routes } from '../../../src/config/routes.config';
import { resolveApiRouteForRequest } from '../../../src/api-routes/route-resolution';

class Controller extends Controllers.PublicationVocabulary {
  response?: BuildResponseType;
  protected override sendResp(_req: Sails.Req, res: Sails.Res, response?: BuildResponseType) {
    this.response = response;
    return res;
  }
}
describe('Publication vocabulary transport authority', () => {
  const originals = new Map<string, unknown>();
  let actors: unknown[];
  let authentications: number;
  let tokenUser: false | { username: string };
  beforeEach(() => {
    actors = [];
    authentications = 0;
    tokenUser = false;
    const values = {
      sails: {
        config: {
          passport: {
            authenticate:
              (_strategy: string, _options: unknown, callback: (error: null, user: typeof tokenUser) => void) => () => {
                authentications++;
                callback(null, tokenUser);
              },
          },
        },
      },
      BrandingService: { getBrandNameFromReq: () => 'default', getBrand: () => ({ id: 'brand' }) },
      PublicationVocabularyService: {
        createCrosswalk: async (_input: unknown, actor: unknown) => {
          actors.push(actor);
          return {};
        },
      },
    };
    for (const [key, value] of Object.entries(values)) {
      originals.set(key, Reflect.get(globalThis, key));
      Reflect.set(globalThis, key, value);
    }
  });
  afterEach(() => {
    for (const [key, value] of originals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, key);
      else Reflect.set(globalThis, key, value);
    }
    originals.clear();
  });
  function request(authorization?: string): Sails.Req {
    const req: Partial<Sails.Req> = {
      method: 'POST',
      path: '/default/rdmp/api/publication-vocabularies/crosswalks',
      headers: authorization ? { authorization } : {},
      user: { username: 'cookie-admin' },
      apiRequest: {
        params: {},
        query: {},
        files: {},
        body: { name: 'Draft', sourceId: 'source', localVocabularyId: 'local' },
      },
    };
    return req as Sails.Req;
  }
  it('rejects cookie-only API mutations even when the API version is supplied', async () => {
    const req = request();
    req.headers['x-redbox-api-version'] = '2.0';
    const controller = new Controller();
    await controller.createCrosswalk(req, {} as Sails.Res);
    assert.equal(controller.response?.status, 403);
    assert.equal(actors.length, 0);
  });
  it('verifies bearer credentials despite an authenticated cookie, using only the verified actor', async () => {
    const controller = new Controller();
    await controller.createCrosswalk(request('Bearer invalid'), {} as Sails.Res);
    assert.equal(controller.response?.status, 403);
    assert.equal(actors.length, 0);
    tokenUser = { username: 'token-admin' };
    await controller.createCrosswalk(request('Bearer valid'), {} as Sails.Res);
    assert.equal(controller.response?.status, undefined);
    assert.deepEqual(actors, [{ brandId: 'brand', userId: 'token-admin' }]);
    assert.equal(authentications, 2);
  });
  it('registers CSRF-secured session aliases using the same request contracts', () => {
    for (const route of publicationVocabularyApiRoutes) {
      const sessionPath = route.path.replace('/api/publication-vocabularies', '/publication-vocabularies');
      assert.deepEqual(routes[`${route.method} ${sessionPath}`], {
        controller: route.controller,
        action: route.action,
        csrf: true,
      });
      const request: Partial<Sails.Req> = { method: route.method, route: { path: sessionPath } };
      assert.equal(resolveApiRouteForRequest(request as Sails.Req)?.action, route.action);
    }
  });
});
