let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { ContextVariableUtils } from '../../src/utilities/ContextVariableUtils';

describe('ContextVariableUtils', () => {
  beforeEach(() => {
    (globalThis as any).sails = {
      config: {
        record: {
          contextVariables: {
            '@user_name': { source: 'request', type: 'user', field: 'name' },
            '@branding': { source: 'request', type: 'session', field: 'branding' },
            '@oid': { source: 'request', type: 'param', field: 'oid' },
            '@referrer_rdmp': {
              source: 'request',
              type: 'header',
              field: 'referer',
              parseUrl: true,
              searchParams: 'rdmp'
            },
            '@record': { source: 'record' }
          }
        }
      },
      log: {
        warn: sinon.stub()
      }
    };
  });

  afterEach(() => {
    sinon.restore();
    delete (globalThis as any).sails;
  });

  it('evaluates request-backed context variables and escapes values', () => {
    const req = {
      user: { name: '<Bob>' },
      session: { branding: 'default' },
      headers: { referer: 'https://example.org/view?rdmp=<unsafe>' },
      get: sinon.stub().callsFake((key: string) => {
        return key.toLowerCase() === 'referer' ? 'https://example.org/view?rdmp=<unsafe>' : undefined;
      }),
      param: sinon.stub().callsFake((key: string) => key === 'oid' ? 'x<y>' : undefined)
    } as unknown as Sails.Req;

    const result = ContextVariableUtils.evaluateContextVariables(req, null);

    expect(result['@user_name']).to.equal('&lt;Bob&gt;');
    expect(result['@branding']).to.equal('default');
    expect(result['@oid']).to.equal('x&lt;y&gt;');
    expect(result['@referrer_rdmp']).to.equal('&lt;unsafe&gt;');
    expect(result['@record']).to.equal('');
    expect((globalThis as any).sails.log.warn.called).to.equal(false);
  });

  it('evaluates record and metadata backed context variables', () => {
    (globalThis as any).sails.config.record.contextVariables = {
      '@title': { source: 'metadata', field: 'title' },
      '@stage': { source: 'record', field: 'workflow.stage' },
      '@metadata': { source: 'metadata' },
      '@record': { source: 'record' }
    };
    const req = {
      headers: {},
      get: sinon.stub(),
      param: sinon.stub()
    } as unknown as Sails.Req;

    const result = ContextVariableUtils.evaluateContextVariables(req, {
      metadata: { title: '<Dataset>' },
      workflow: { stage: 'queued' }
    });

    expect(result['@title']).to.equal('&lt;Dataset&gt;');
    expect(result['@stage']).to.equal('queued');
    expect(result['@metadata']).to.equal('');
    expect(result['@record']).to.equal('');
    expect((globalThis as any).sails.log.warn.called).to.equal(false);
  });

  it('warns when a context variable source is not supported', () => {
    (globalThis as any).sails.config.record.contextVariables = {
      '@bad_source': { source: 'Record', field: 'workflow.stage' } as any
    };
    const req = {
      headers: {},
      get: sinon.stub(),
      param: sinon.stub()
    } as unknown as Sails.Req;

    const result = ContextVariableUtils.evaluateContextVariables(req, {
      workflow: { stage: 'queued' }
    });

    expect(result['@bad_source']).to.equal('');
    expect((globalThis as any).sails.log.warn.calledOnce).to.equal(true);
    expect((globalThis as any).sails.log.warn.firstCall.args[0]).to.equal(
      'Unsupported context variable source for @bad_source: Record'
    );
  });

  it('returns empty value and warns on malformed URL parsing without leaking raw values', () => {
    (globalThis as any).sails.config.record.contextVariables = {
      '@referrer_rdmp': {
        source: 'request',
        type: 'header',
        field: 'referer',
        parseUrl: true,
        searchParams: 'rdmp'
      }
    };
    const req = {
      headers: { referer: 'not-a-url raw-secret' },
      get: sinon.stub().returns('not-a-url raw-secret'),
      param: sinon.stub()
    } as unknown as Sails.Req;

    const result = ContextVariableUtils.evaluateContextVariables(req, null);

    expect(result['@referrer_rdmp']).to.equal('');
    expect((globalThis as any).sails.log.warn.called).to.equal(true);
    const logMessage = String((globalThis as any).sails.log.warn.firstCall.args[0] ?? '');
    expect(logMessage).to.contain('Failed to evaluate context variable: @referrer_rdmp.');
    expect(logMessage).to.not.contain('raw-secret');
  });
});
