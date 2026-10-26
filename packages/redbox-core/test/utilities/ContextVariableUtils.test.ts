import { createSinonStubLogger } from '../logger.test';

let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import {
  ContextVariables,
  type ContextVariablesConfigMap,
  type ContextVariableRequest,
} from '../../src/forms/ContextVariables';

describe('ContextVariableUtils', () => {
  let config: ContextVariablesConfigMap;
  let log: ReturnType<typeof createSinonStubLogger>;
  beforeEach(() => {
    config = {
      '@user_name': { source: 'request', type: 'user', field: 'name' },
      '@branding': { source: 'request', type: 'session', field: 'branding' },
      '@oid': { source: 'request', type: 'param', field: 'oid' },
      '@referrer_rdmp': { source: 'request', type: 'header', field: 'referer', parseUrl: true, searchParams: 'rdmp' },
      '@record': { source: 'record' },
    };
    log = createSinonStubLogger(sinon);
  });
  afterEach(() => sinon.restore());
  it('evaluates request-backed context variables and escapes values', () => {
    const req = {
      user: { name: '<Bob>' },
      session: { branding: 'default' },
      headers: { referer: 'https://example.org/view?rdmp=<unsafe>' },
      get: sinon.stub().callsFake((key: string) => {
        return key.toLowerCase() === 'referer' ? 'https://example.org/view?rdmp=<unsafe>' : undefined;
      }),
      param: sinon.stub().callsFake((key: string) => (key === 'oid' ? 'x<y>' : undefined)),
    } as unknown as ContextVariableRequest;

    const result = new ContextVariables(config, log).evaluateContextVariables(req, null);

    expect(result['@user_name']).to.equal('&lt;Bob&gt;');
    expect(result['@branding']).to.equal('default');
    expect(result['@oid']).to.equal('x&lt;y&gt;');
    expect(result['@referrer_rdmp']).to.equal('&lt;unsafe&gt;');
    expect(result['@record']).to.equal('');
    expect(log.warn.called).to.equal(false);
  });

  it('evaluates record and metadata backed context variables', () => {
    config = {
      '@title': { source: 'metadata', field: 'title' },
      '@stage': { source: 'record', field: 'workflow.stage' },
      '@metadata': { source: 'metadata' },
      '@record': { source: 'record' },
    };
    const req = {
      headers: {},
      get: sinon.stub(),
      param: sinon.stub(),
    } as unknown as ContextVariableRequest;

    const result = new ContextVariables(config, log).evaluateContextVariables(req, {
      metadata: { title: '<Dataset>' },
      workflow: { stage: 'queued' },
    });

    expect(result['@title']).to.equal('&lt;Dataset&gt;');
    expect(result['@stage']).to.equal('queued');
    expect(result['@metadata']).to.equal('');
    expect(result['@record']).to.equal('');
    expect(log.warn.called).to.equal(false);
  });

  it('warns when a context variable source is not supported', () => {
    config = {
      '@bad_source': { source: 'Record', field: 'workflow.stage' } as any,
    };
    const req = {
      headers: {},
      get: sinon.stub(),
      param: sinon.stub(),
    } as unknown as ContextVariableRequest;

    const result = new ContextVariables(config, log).evaluateContextVariables(req, {
      workflow: { stage: 'queued' },
    });

    expect(result['@bad_source']).to.equal('');
    expect(log.warn.calledOnce).to.equal(true);
    expect(log.warn.firstCall.args[0]).to.equal('Unsupported context variable source for @bad_source: Record');
  });

  it('returns empty value and warns on malformed URL parsing without leaking raw values', () => {
    config = {
      '@referrer_rdmp': {
        source: 'request',
        type: 'header',
        field: 'referer',
        parseUrl: true,
        searchParams: 'rdmp',
      },
    };
    const req = {
      headers: { referer: 'not-a-url raw-secret' },
      get: sinon.stub().returns('not-a-url raw-secret'),
      param: sinon.stub(),
    } as unknown as ContextVariableRequest;

    const result = new ContextVariables(config, log).evaluateContextVariables(req, null);

    expect(result['@referrer_rdmp']).to.equal('');
    expect(log.warn.called).to.equal(true);
    const logMessage = String(log.warn.firstCall.args[0] ?? '');
    expect(logMessage).to.contain('Failed to evaluate context variable: @referrer_rdmp.');
    expect(logMessage).to.not.contain('raw-secret');
  });
});
