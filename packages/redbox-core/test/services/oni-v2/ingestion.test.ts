import { expect } from 'chai';
import * as sinon from 'sinon';
import type { OniIngestionConfig } from '../../../src/configmodels/OniPublishing';
import { ingestOniRepository, type OniIngestionHttpClient } from '../../../src/services/oni-v2/ingestion';

const baseConfig: OniIngestionConfig = {
  enabled: true,
  apiUrl: 'https://oni.example.test///',
  adminToken: 'admin-token',
  forceReindex: false,
  pollIntervalMs: 1,
  timeoutMs: 20,
};

function axiosNotFound(): Error {
  const error = new Error('The requested index does not exist.') as Error & {
    isAxiosError: boolean;
    response: { status: number };
  };
  error.isAxiosError = true;
  error.response = { status: 404 };
  return error;
}

async function expectRejected(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
    expect.fail(`Expected rejection: ${message}`);
  } catch (error) {
    expect(error).to.be.an('error').with.property('message', message);
  }
}

describe('Oni ingestion', () => {
  afterEach(() => sinon.restore());

  it('validates the ingestion configuration before making requests', async () => {
    await expectRejected(
      () => ingestOniRepository({ ...baseConfig, apiUrl: '  ' }, { httpClient: {} as OniIngestionHttpClient }),
      'Oni ingestion apiUrl is required'
    );
    await expectRejected(
      () => ingestOniRepository({ ...baseConfig, adminToken: '' }, { httpClient: {} as OniIngestionHttpClient }),
      'Oni ingestion adminToken is required'
    );
    await expectRejected(
      () => ingestOniRepository({ ...baseConfig, pollIntervalMs: 0 }, { httpClient: {} as OniIngestionHttpClient }),
      'Oni ingestion pollIntervalMs must be greater than zero'
    );
    await expectRejected(
      () => ingestOniRepository({ ...baseConfig, timeoutMs: 0 }, { httpClient: {} as OniIngestionHttpClient }),
      'Oni ingestion timeoutMs must be at least pollIntervalMs'
    );
  });

  it('rebuilds both indexes, tolerates a missing status during polling, and returns counts', async () => {
    let now = 0;
    const client = {
      post: sinon.stub().resolves({ data: {}, status: 202 }),
      get: sinon.stub(),
    };
    client.get.onCall(0).resolves({ data: undefined, status: 200 });
    client.get.onCall(1).resolves({ data: { isIndexed: true, count: 3 }, status: 200 });
    client.get.onCall(2).rejects(axiosNotFound());
    client.get.onCall(3).resolves({ data: { isIndexed: true, count: 4 }, status: 200 });

    const result = await ingestOniRepository(baseConfig, {
      httpClient: client,
      delay: async milliseconds => {
        now += milliseconds;
      },
      now: () => now,
    });

    expect(result).to.deep.equal({ structuralObjects: 3, searchItems: 4 });
    expect(client.post.firstCall.args[0]).to.equal('https://oni.example.test/admin/index/structural');
    expect(client.post.secondCall.args[0]).to.equal('https://oni.example.test/admin/index/search');
    expect(client.post.firstCall.args[2]).to.deep.equal({
      headers: {
        Authorization: 'Bearer admin-token',
        Accept: 'application/json',
      },
      timeout: 20,
    });
    expect(client.get.firstCall.args[0]).to.equal('https://oni.example.test/admin/index/structural');
  });

  it('adds the force query and rethrows non-404 polling failures', async () => {
    const client = {
      post: sinon.stub().resolves({ data: {}, status: 202 }),
      get: sinon.stub().rejects(new Error('Oni unavailable')),
    };

    await expectRejected(
      () =>
        ingestOniRepository(
          { ...baseConfig, forceReindex: true },
          { httpClient: client, delay: async () => {}, now: () => 0 }
        ),
      'Oni unavailable'
    );
    expect(client.post.firstCall.args[0]).to.equal('https://oni.example.test/admin/index/structural?force=true');
  });

  it('uses the default delay and clock when callers do not provide runtime dependencies', async () => {
    const client = {
      post: sinon.stub().resolves({ data: {}, status: 202 }),
      get: sinon.stub().resolves({ data: { isIndexed: true, count: 1 }, status: 200 }),
    };

    expect(await ingestOniRepository({ ...baseConfig, timeoutMs: 100 }, { httpClient: client })).to.deep.equal({
      structuralObjects: 1,
      searchItems: 1,
    });
  });

  it('fails when an index never becomes indexed before the timeout', async () => {
    let now = 0;
    const client = {
      post: sinon.stub().resolves({ data: {}, status: 202 }),
      get: sinon.stub().resolves({ data: { isIndexed: false, count: 0 }, status: 200 }),
    };

    await expectRejected(
      () =>
        ingestOniRepository(
          { ...baseConfig, timeoutMs: 2 },
          {
            httpClient: client,
            delay: async milliseconds => {
              now += milliseconds;
            },
            now: () => now,
          }
        ),
      'Timed out waiting for Oni structural index to complete after 2ms'
    );
  });
});
