import { expect } from 'chai';
import { runCreateDoiProgram } from '../../../src/services/doi-v2/runtime';
import { DoiHttpError } from '../../../src/services/doi-v2/http';

describe('doi-v2 runtime', function () {
  it('rethrows transport failures with the original cause details instead of a FiberFailure wrapper', async function () {
    const config = {
      connection: {
        baseUrl: 'https://example.test',
        username: 'user',
        password: 'pwd',
        timeoutMs: 1000,
        retry: {
          maxAttempts: 1,
          baseDelayMs: 1,
          maxDelayMs: 1,
          retryOnStatusCodes: [],
          retryOnMethods: ['post']
        }
      }
    } as any;

    const runContext = {
      recordOid: 'oid-1',
      brandName: 'default',
      correlationId: 'corr-1',
      triggerSource: 'test'
    } as any;

    let thrown: unknown;
    try {
      await runCreateDoiProgram(config, runContext, {
        data: { type: 'dois', attributes: { titles: [{ title: 'Example' }] } }
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.be.instanceOf(DoiHttpError);
    expect((thrown as DoiHttpError).name).to.equal('DoiHttpError');
    expect((thrown as DoiHttpError).message).to.equal('DOI HTTP request failed for post /dois');
    expect((thrown as DoiHttpError).statusCode).to.equal(undefined);
    expect((thrown as DoiHttpError).responseBody).to.equal(undefined);
    const cause = (thrown as DoiHttpError).cause as Error & { code?: string };
    expect(cause.code).to.equal('ENOTFOUND');
    expect(cause.message).to.contain('getaddrinfo ENOTFOUND');
  });
});
