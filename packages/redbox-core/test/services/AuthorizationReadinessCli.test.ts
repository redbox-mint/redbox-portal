import { strict as assert } from 'node:assert';
import path from 'node:path';
import { describe, it } from 'mocha';

const SCRIPT = path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'authorization-readiness.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const readinessCli = require(SCRIPT) as {
  formatReadinessFailure(error: unknown): string;
  sharedRedact(value: string): string;
  SHARED_REDACTOR_SPECIFIER: string;
};

describe('authorization-readiness CLI failure redaction', () => {
  it('exposes a redacting failure formatter without lifting sails on require', () => {
    assert.equal(typeof readinessCli.formatReadinessFailure, 'function');
    assert.equal(typeof readinessCli.sharedRedact, 'function');
  });

  it('redacts a lift failure carrying connection-string and bearer credential material', () => {
    // Sentinel for the Sails lift stage: lift errors may echo datastore
    // connection strings or environment-derived secrets.
    const failure = new Error(
      'Sails lift failed: invalid datastore config password="hunter2-secret-value" for mongodb://mongo:27017/redbox with header Bearer abcdef1234567890'
    );
    const formatted = readinessCli.formatReadinessFailure(failure);
    assert.ok(formatted.startsWith('Readiness report failed: '), `unexpected prefix, got:\n${formatted}`);
    assert.ok(formatted.endsWith('\n'), 'failure output must end with a newline');
    assert.ok(!formatted.includes('hunter2-secret-value'), `lift secret leaked:\n${formatted}`);
    assert.ok(!formatted.includes('abcdef1234567890'), `bearer value leaked:\n${formatted}`);
    assert.ok(formatted.includes('[REDACTED]'), `expected a redaction marker, got:\n${formatted}`);
  });

  it('redacts a report failure carrying password, basic-auth, and JWT credential material', () => {
    // Sentinel for the report stage: report errors may echo datastore-backed
    // error detail including operator-supplied values.
    const failure = new Error(
      'Readiness query failed: password=sup3r-secret-token, Basic dXNlcjpwYXNzd29yZA==, eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature-part'
    );
    const formatted = readinessCli.formatReadinessFailure(failure);
    assert.ok(!formatted.includes('sup3r-secret-token'), `password value leaked:\n${formatted}`);
    assert.ok(!formatted.includes('dXNlcjpwYXNzd29yZA=='), `basic credential leaked:\n${formatted}`);
    assert.ok(!formatted.includes('eyJhbGciOiJIUzI1NiJ9'), `JWT value leaked:\n${formatted}`);
    assert.ok(formatted.includes('[REDACTED]'), `expected a redaction marker, got:\n${formatted}`);
  });

  it('redacts non-Error thrown values while preserving ordinary identifiers', () => {
    const formatted = readinessCli.formatReadinessFailure(
      'string failure with api_key=live-secret-value-1234 and request 9f8c8c9c-7b6a-4d5e-8f0a-1b2c3d4e5f6a'
    );
    assert.ok(!formatted.includes('live-secret-value-1234'), `credential value leaked:\n${formatted}`);
    assert.ok(
      formatted.includes('9f8c8c9c-7b6a-4d5e-8f0a-1b2c3d4e5f6a'),
      `ordinary UUID identifiers must survive redaction, got:\n${formatted}`
    );
  });

  it('routes failures through the shared authorization credential redactor', () => {
    assert.equal(
      readinessCli.sharedRedact('call failed for Bearer abcdef1234567890 at route'),
      'call failed for [REDACTED] at route'
    );
    assert.equal(readinessCli.sharedRedact('steady state with no credentials'), 'steady state with no credentials');
  });

  it('uses the officially exported shared redactor module with no copied fallback', () => {
    // The CLI must resolve its redactor through the package export map
    // (direct `dist/` subpath imports are blocked by `exports`), so the
    // shared persistence contract stays authoritative.
    const fs = require('node:fs');
    const source = fs.readFileSync(SCRIPT, 'utf8');
    assert.ok(
      source.includes('@researchdatabox/redbox-core/authorization/persistence-contracts'),
      'CLI must import the officially exported shared redactor subpath'
    );
    assert.ok(
      !source.includes('FALLBACK_CREDENTIAL_PATTERNS') && !source.includes('fallbackRedact'),
      'CLI must not carry a copied regex fallback as the normal path'
    );
    assert.equal(
      readinessCli.SHARED_REDACTOR_SPECIFIER,
      '@researchdatabox/redbox-core/authorization/persistence-contracts'
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shared = require('@researchdatabox/redbox-core/authorization/persistence-contracts') as {
      redactAuthorizationCredentialStrings(value: string): string;
    };
    for (const sentinel of [
      'Sails lift failed: password="hunter2-secret-value" with header Bearer abcdef1234567890',
      'Readiness query failed: password=sup3r-secret-token, Basic dXNlcjpwYXNzd29yZA==, eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.sig',
      'steady state with no credentials',
    ]) {
      assert.equal(readinessCli.sharedRedact(sentinel), shared.redactAuthorizationCredentialStrings(sentinel));
    }
  });
});
