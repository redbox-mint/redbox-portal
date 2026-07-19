import { expect } from 'chai';
import { redactObject, redactSecret } from '../../src/utilities/RedactionUtils';

describe('RedactionUtils', function () {
  it('redacts sensitive keys recursively without modifying the source object', function () {
    const source = {
      client_id: 'diagnostic-client-id',
      client_secret: 'secret-value',
      nested: {
        access_token: 'access-token-value',
        authorization: 'Bearer credential'
      }
    };

    expect(redactObject(source)).to.deep.equal({
      client_id: 'diagnostic-client-id',
      client_secret: 'REDACTED',
      nested: {
        access_token: 'REDACTED',
        authorization: 'REDACTED'
      }
    });
    expect(source.client_secret).to.equal('secret-value');
    expect(source.nested.access_token).to.equal('access-token-value');
  });

  it('redacts credential-shaped string values', function () {
    expect(redactSecret('Bearer abc123')).to.equal('REDACTED');
    expect(redactSecret('header.payload.signature')).to.equal('REDACTED');
    expect(redactSecret('https://user:password@example.com/path')).to.equal('REDACTED');
    expect(redactSecret('ordinary diagnostic text')).to.equal('ordinary diagnostic text');
  });

  it('handles arrays and circular references', function () {
    const source: Record<string, unknown> = { values: [{ refresh_token: 'token-value' }] };
    source.self = source;

    expect(redactObject(source)).to.deep.equal({
      values: [{ refresh_token: 'REDACTED' }],
      self: '[Circular]'
    });
  });
});
