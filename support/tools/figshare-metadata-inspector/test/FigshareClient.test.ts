import assert from 'node:assert/strict';
import { AxiosAdapter, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { FigshareApiError, FigshareClient, FigshareResponseValidationError } from '../src/figshare/FigshareClient';
import { FigshareV2Client } from '../src/figshare/FigshareV2Client';
import { fixture } from './support/fixtures';

describe('FigshareClient', () => {
  let retryCalls = 0;
  const seenAuthorization: string[] = [];
  const baseUrl = 'https://figshare.test';

  function response(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
    return { config, status, statusText: String(status), headers: {}, data };
  }

  const adapter: AxiosAdapter = async config => {
    seenAuthorization.push(String(config.headers?.get('Authorization')));
    if (config.url === '/retry') {
      retryCalls += 1;
      if (retryCalls === 1) {
        const failed = response(config, 503, { message: 'try again' });
        throw new AxiosError('temporary failure', 'ERR_BAD_RESPONSE', config, undefined, failed);
      }
      return response(config, 200, { ok: true });
    }
    if (config.url === '/unauthorized') {
      const failed = response(config, 401, {
        token: 'secret-token',
        echoed: String(config.headers?.get('Authorization')),
      });
      throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, failed);
    }
    if (config.url === '/pages') {
      const page = Number((config.params as Record<string, unknown>).page);
      return response(config, 200, page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }]);
    }
    if (config.url === '/malformed') return response(config, 200, { unexpected: true });
    return response(config, 404, { message: 'missing' });
  };

  it('authenticates and retries transient GET failures', async () => {
    const client = new FigshareClient({
      token: 'secret-token',
      baseUrl,
      maxAttempts: 2,
      retryBaseDelayMs: 0,
      sleep: async () => undefined,
      adapter,
    });
    assert.deepEqual(await client.get('/retry'), { ok: true });
    assert.equal(retryCalls, 2);
    assert.ok(seenAuthorization.every(value => value === 'token secret-token'));
  });

  it('redacts credentials from errors and reports authentication failures', async () => {
    const client = new FigshareClient({ token: 'secret-token', baseUrl, maxAttempts: 1, adapter });
    await assert.rejects(client.get('/unauthorized'), (error: unknown) => {
      assert.ok(error instanceof FigshareApiError);
      assert.equal(error.statusCode, 401);
      assert.doesNotMatch(error.message, /secret-token/);
      assert.doesNotMatch(JSON.stringify(error.responseBody), /secret-token/);
      assert.doesNotMatch(JSON.stringify(error.cause), /secret-token/);
      assert.match(JSON.stringify(error.responseBody), /REDACTED/);
      return true;
    });
  });

  it('paginates array endpoints until the final short page', async () => {
    const client = new FigshareClient({ token: 'secret-token', baseUrl, adapter });
    const values = await client.getPaginated<{ id: number }>('/pages', {}, { pageSize: 2 });
    assert.deepEqual(
      values.map(value => value.id),
      [1, 2, 3]
    );
  });

  it('rejects malformed list responses', async () => {
    const client = new FigshareClient({ token: 'secret-token', baseUrl, adapter });
    await assert.rejects(client.getPaginated('/malformed'), FigshareResponseValidationError);
  });
});

describe('versioned Figshare clients', () => {
  it('parses v2 group metadata, institution fields, licences, and categories while retaining unknown properties', async () => {
    const responses: Record<string, unknown> = {
      '/v2/account/institution/custom_fields': fixture('institution-custom-fields.json'),
      '/v2/account/groups/32014/metadata/item': fixture('group-item-metadata.json'),
      '/v2/account/licenses': fixture('licenses.json'),
      '/v2/account/categories': fixture('categories.json'),
    };
    const fakeClient = {
      get: async (endpoint: string) => responses[endpoint],
    } as unknown as FigshareClient;
    const v2 = new FigshareV2Client(fakeClient);
    const [institutionFields, groupFields, licenses, categories] = await Promise.all([
      v2.getInstitutionCustomFields(),
      v2.getGroupItemMetadata(32014),
      v2.getLicenses(),
      v2.getCategories(),
    ]);
    assert.deepEqual(institutionFields[0].raw.future_property, { retained: true });
    assert.equal(groupFields[2].name, 'Terms of agreement');
    assert.equal(licenses[0].id, 1);
    assert.equal(categories[2].parent_id, 11);
  });

  it('rejects malformed typed API entries', async () => {
    const fakeClient = { get: async () => [{ name: 'No identifier' }] } as unknown as FigshareClient;
    await assert.rejects(
      new FigshareV2Client(fakeClient).getInstitutionCustomFields(),
      FigshareResponseValidationError
    );
  });

  it('rejects invalid group identifiers before issuing a request', async () => {
    const fakeClient = { get: async () => [] } as unknown as FigshareClient;
    await assert.rejects(new FigshareV2Client(fakeClient).getGroupItemMetadata(0), /Invalid Figshare group id/);
  });
});
