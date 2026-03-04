let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { CustomFieldUtils } from '../../src/utilities/CustomFieldUtils';

describe('CustomFieldUtils', () => {
  beforeEach(() => {
    (globalThis as any).sails = {
      config: {
        record: {
          customFields: {
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

  it('evaluates request-backed custom fields and escapes values', () => {
    const req = {
      user: { name: '<Bob>' },
      session: { branding: 'default' },
      headers: { referer: 'https://example.org/view?rdmp=<unsafe>' },
      get: sinon.stub().callsFake((key: string) => {
        return key.toLowerCase() === 'referer' ? 'https://example.org/view?rdmp=<unsafe>' : undefined;
      }),
      param: sinon.stub().callsFake((key: string) => key === 'oid' ? 'x<y>' : undefined)
    } as unknown as Sails.Req;

    const result = CustomFieldUtils.evaluateCustomFields(req, null);

    expect(result['@user_name']).to.equal('&lt;Bob&gt;');
    expect(result['@branding']).to.equal('default');
    expect(result['@oid']).to.equal('x&lt;y&gt;');
    expect(result['@referrer_rdmp']).to.equal('&lt;unsafe&gt;');
    expect(result).to.not.have.property('@record');
  });

  it('returns empty value and warns on malformed URL parsing without leaking raw values', () => {
    (globalThis as any).sails.config.record.customFields = {
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

    const result = CustomFieldUtils.evaluateCustomFields(req, null);

    expect(result['@referrer_rdmp']).to.equal('');
    expect((globalThis as any).sails.log.warn.called).to.equal(true);
    const logMessage = String((globalThis as any).sails.log.warn.firstCall.args[0] ?? '');
    expect(logMessage).to.contain('Failed to evaluate custom field: @referrer_rdmp.');
    expect(logMessage).to.not.contain('raw-secret');
  });
});
