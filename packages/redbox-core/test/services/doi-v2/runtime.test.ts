import * as sinon from 'sinon';
import { Layer } from 'effect';
import { runCreateDoiProgram } from '../../../src/services/doi-v2/runtime';
import { DoiClientTag, DoiHttpError } from '../../../src/services/doi-v2/http';
import * as httpModule from '../../../src/services/doi-v2/http';

let expect: Chai.ExpectStatic;

describe('doi-v2 runtime', function () {
  before(async function () {
    ({ expect } = await import('chai'));
  });

  afterEach(function () {
    delete (global as any).IntegrationAuditService;
    sinon.restore();
  });

  it('creates a nested audit span for the DataCite create request', async function () {
    const startAudit = sinon.stub();
    const completeAudit = sinon.stub();
    const failAudit = sinon.stub();
    (global as any).IntegrationAuditService = { startAudit, completeAudit, failAudit };
    startAudit.returns({ traceId: 'trace-child', spanId: 'span-child', redboxOid: 'oid-1' });

    sinon.stub(httpModule, 'makeClientLayer').returns(
      Layer.succeed(DoiClientTag, {
        createDoi: sinon.stub().resolves({
          statusCode: 201,
          data: { data: { id: '10.1234/5678' } }
        })
      } as any)
    );

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
      brandId: 'default',
      correlationId: 'corr-1',
      triggerSource: 'publishDoi'
    } as any;

    const parentAuditContext = { traceId: 'trace-parent', spanId: 'span-parent', redboxOid: 'oid-1' } as any;
    const result = await runCreateDoiProgram(config, runContext, {
      data: { type: 'dois', attributes: { titles: [{ title: 'Example' }] } }
    }, {
      auditContext: parentAuditContext,
      requestSummary: { requestBody: { data: { type: 'dois' } } }
    });

    expect(result.doi).to.equal('10.1234/5678');
    expect(startAudit.calledOnce).to.be.true;
    expect(startAudit.firstCall.args[1]).to.equal('createDoiRequest');
    expect(startAudit.firstCall.args[2].traceId).to.equal('trace-parent');
    expect(startAudit.firstCall.args[2].parentSpanId).to.equal('span-parent');
    expect(completeAudit.calledOnce).to.be.true;
    expect(completeAudit.firstCall.args[1].message).to.equal('DataCite create DOI request completed.');
    expect(completeAudit.firstCall.args[1].responseSummary).to.deep.equal({ data: { id: '10.1234/5678' } });
    expect(failAudit.called).to.be.false;
  });

  it('rethrows transport failures with the original cause details instead of a FiberFailure wrapper', async function () {
    const startAudit = sinon.stub();
    const completeAudit = sinon.stub();
    const failAudit = sinon.stub();
    (global as any).IntegrationAuditService = { startAudit, completeAudit, failAudit };
    startAudit.returns({ traceId: 'trace-child', spanId: 'span-child', redboxOid: 'oid-1' });

    const transportCause = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    sinon.stub(httpModule, 'makeClientLayer').returns(
      Layer.succeed(DoiClientTag, {
        createDoi: sinon.stub().rejects(
          new DoiHttpError('DOI HTTP request failed for post /dois', {
            cause: transportCause,
          })
        )
      } as any)
    );

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
      brandId: 'default',
      correlationId: 'corr-1',
      triggerSource: 'test'
    } as any;

    let thrown: unknown;
    try {
      await runCreateDoiProgram(config, runContext, {
        data: { type: 'dois', attributes: { titles: [{ title: 'Example' }] } }
      }, {
        auditContext: { traceId: 'trace-parent', spanId: 'span-parent', redboxOid: 'oid-1' } as any,
        requestSummary: { requestBody: { data: { type: 'dois' } } }
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
    expect(startAudit.calledOnce).to.be.true;
    expect(failAudit.calledOnce).to.be.true;
    expect(completeAudit.called).to.be.false;
    expect(failAudit.firstCall.args[2].message).to.equal('DataCite create DOI request failed.');
  });
});
