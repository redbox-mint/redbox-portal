import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'mocha';
import {
  AUTHORIZATION_MISMATCH_CLASSIFICATIONS,
  AUTHORIZATION_MISMATCH_LEGACY_CATEGORY_MAP,
} from '../../src/authorization/shadow-classification';
import { ALL_SHADOW_CLASSIFICATION_FIXTURES } from '../fixtures/authorization-shadow-classification.fixtures';

const SCRIPT = path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'authorization-shadow-mismatches.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const shadowCli = require(SCRIPT) as {
  formatShadowMismatchFailure(stage: string, error: unknown): string;
  sharedRedact(value: string): string;
  SHARED_REDACTOR_SPECIFIER: string;
  MISMATCH_CLASSIFICATIONS: readonly string[];
  parseArgv(argv: readonly string[]): { help: boolean; options?: { classification?: string } };
  usage(): string;
  readRemediationEvidence(file: string): unknown;
};

function runScript(args: readonly string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [SCRIPT, ...args], { timeout: 15_000 }, (error, stdout, stderr) => {
      if (error !== null && typeof error === 'object' && 'killed' in error && error.killed === true) {
        reject(error);
        return;
      }
      const exitCode =
        error !== null && typeof (error as { code?: unknown }).code === 'number'
          ? ((error as { code: number }).code as number)
          : 0;
      resolve({ exitCode, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

describe('authorization-shadow-mismatches CLI help', function () {
  it('keeps CLI, service, and operator documentation vocabulary in parity', () => {
    assert.deepEqual(shadowCli.MISMATCH_CLASSIFICATIONS, AUTHORIZATION_MISMATCH_CLASSIFICATIONS);
    const docs = readFileSync(
      path.resolve(path.dirname(SCRIPT), '../support/wiki/Authorization-Operations.md'),
      'utf8'
    );
    for (const { classification } of ALL_SHADOW_CLASSIFICATION_FIXTURES) {
      assert.ok(shadowCli.usage().includes(classification));
      assert.ok(docs.includes(`\`${classification}\``), `docs must name ${classification}`);
      for (const help of [[], ['--help']]) {
        const result = shadowCli.parseArgv([
          'acknowledge',
          '--fingerprint=' + 'a'.repeat(64),
          '--reason=recorded approval or remediation',
          '--operator=operator-1',
          `--classification=${classification}`,
          ...help,
        ]);
        assert.equal(result.help, help.length > 0);
        if (!result.help) assert.equal(result.options?.classification, classification);
      }
    }
    for (const [legacy, category] of Object.entries(AUTHORIZATION_MISMATCH_LEGACY_CATEGORY_MAP)) {
      assert.ok(shadowCli.usage().includes(`${legacy} -> ${category}`));
      assert.ok(docs.replace(/[ \t]+/gu, ' ').includes(`| \`${legacy}\` | \`${category}\` |`));
    }
  });

  it('prints well-formed retain usage without a sails lift when no action is given', async function () {
    const result = await runScript([]);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('Usage:'), 'help must include a Usage section');
    assert.ok(
      result.stderr.includes('retain --older-than-days=<1-36500> --reason='),
      `retain help must show the bounded days argument correctly, got:\n${result.stderr}`
    );
    assert.equal(
      result.stderr.includes('=<days>=1+'),
      false,
      'retain help must not contain the malformed =<days>=1+ fragment'
    );
    assert.ok(result.stderr.includes('acknowledge --fingerprint=<64-hex>'), 'help must document acknowledge');
    assert.ok(result.stderr.includes('list [--limit=<1-200>]'), 'help must document list');
  });

  it('rejects an unknown action before lifting sails', async function () {
    const result = await runScript(['bogus-action']);
    assert.equal(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('requires one of: list, acknowledge, close-remediated, retain'),
      `unknown actions must be rejected with the valid set, got:\n${result.stderr}`
    );
  });

  it('supports --help with exit code 0 without lifting sails', async function () {
    for (const args of [
      ['--help'],
      ['list', '--help'],
      ['acknowledge', '--help'],
      ['close-remediated', '--help'],
      ['retain', '--help'],
    ] as const) {
      const result = await runScript([...args]);
      assert.equal(result.exitCode, 0, `--help must exit 0 for ${JSON.stringify(args)}, got:\n${result.stderr}`);
      assert.ok(result.stdout.includes('Usage:'), `help must print Usage to stdout, got:\n${result.stdout}`);
      assert.ok(
        result.stdout.includes('retain --older-than-days=<1-36500>'),
        `help must document retain correctly, got:\n${result.stdout}`
      );
    }
  });

  it('rejects a misspelled retain limit without lifting sails', async function () {
    const result = await runScript([
      'retain',
      '--older-than-days=30',
      '--reason=routine review',
      '--operator=operator-1',
      '--limti=10',
    ]);
    assert.equal(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('Unknown argument --limti'),
      `misspelled retain limit must be rejected as unknown, got:\n${result.stderr}`
    );
  });

  it('rejects duplicate flags without lifting sails', async function () {
    const result = await runScript(['list', '--limit=10', '--limit=20']);
    assert.equal(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('Duplicate argument: --limit'),
      `duplicate flags must be rejected, got:\n${result.stderr}`
    );
  });

  it('rejects extra positional arguments without lifting sails', async function () {
    const result = await runScript(['list', 'extra']);
    assert.equal(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('Unexpected extra argument'),
      `extra positionals must be rejected, got:\n${result.stderr}`
    );
  });

  it('rejects unknown flags without lifting sails', async function () {
    const listResult = await runScript(['list', '--bogus=1']);
    assert.equal(listResult.exitCode, 1);
    assert.ok(
      listResult.stderr.includes('Unknown argument --bogus'),
      `unknown list flags must be rejected, got:\n${listResult.stderr}`
    );
    const camelResult = await runScript([
      'retain',
      '--olderThanDays=30',
      '--reason=routine review',
      '--operator=operator-1',
    ]);
    assert.equal(camelResult.exitCode, 1);
    assert.ok(
      camelResult.stderr.includes('Unknown argument --olderThanDays'),
      `camelCase retain flag must be rejected, got:\n${camelResult.stderr}`
    );
  });

  it('rejects malformed flags without lifting sails', async function () {
    const result = await runScript(['list', '--limit']);
    assert.equal(result.exitCode, 1);
    assert.ok(
      result.stderr.includes('Malformed argument'),
      `bare --limit without = must be rejected as malformed, got:\n${result.stderr}`
    );
  });

  it('rejects out-of-bounds numerics without lifting sails', async function () {
    for (const args of [
      ['list', '--limit=0'],
      ['list', '--limit=201'],
      ['list', '--limit=abc'],
      ['list', '--cursor=not-a-fingerprint'],
      ['acknowledge', '--fingerprint=short', '--reason=r', '--operator=o', '--classification=needs-investigation'],
      ['retain', '--older-than-days=0', '--reason=r', '--operator=o'],
      ['retain', '--older-than-days=30', '--reason=r', '--operator=o', '--limit=10001'],
      ['retain', '--older-than-days=30', '--reason=r', '--operator=o', '--limit=abc'],
    ] as const) {
      const result = await runScript([...args]);
      assert.equal(result.exitCode, 1, `out-of-bounds argv must fail: ${JSON.stringify(args)}, got:\n${result.stderr}`);
    }
  });

  it('preserves action --help with valid flags', async function () {
    const cases: Array<readonly string[]> = [
      ['list', '--help', '--limit=10'],
      ['list', '--help', '--cursor=' + 'b'.repeat(64)],
      [
        'acknowledge',
        '--help',
        '--fingerprint=' + 'c'.repeat(64),
        '--reason=review',
        '--operator=operator-1',
        '--classification=needs-investigation',
      ],
      ['retain', '--help', '--older-than-days=30', '--reason=routine review', '--operator=operator-1', '--limit=10'],
    ];
    for (const args of cases) {
      const result = await runScript([...args]);
      assert.equal(
        result.exitCode,
        0,
        `--help with valid flags must exit 0 for ${JSON.stringify(args)}, got:\n${result.stderr}`
      );
      assert.ok(result.stdout.includes('Usage:'), `help must print Usage to stdout, got:\n${result.stdout}`);
    }
  });

  it('validates allowlist and numeric values before honoring --help', async function () {
    const cases: Array<{ args: readonly string[]; match: string }> = [
      { args: ['list', '--help', '--limit=abc'], match: 'List requires --limit=<1-200>' },
      { args: ['acknowledge', '--help', '--limit=5'], match: 'Unknown argument --limit' },
      { args: ['retain', '--help', '--cursor='], match: 'Unknown argument --cursor' },
      { args: ['list', '--help', '--bogus=1'], match: 'Unknown argument --bogus' },
      { args: ['list', '--help', '--limit=10', '--limit=20'], match: 'Duplicate argument: --limit' },
      { args: ['list', 'extra', '--help'], match: 'Unexpected extra argument' },
      { args: ['--help', '--limit=5'], match: 'Unknown argument --limit' },
    ];
    for (const { args, match } of cases) {
      const result = await runScript([...args]);
      assert.equal(
        result.exitCode,
        1,
        `--help must not bypass validation for ${JSON.stringify(args)}, got:\n${result.stdout}`
      );
      assert.ok(
        result.stderr.includes(match),
        `expected ${JSON.stringify(match)} for ${JSON.stringify(args)}, got:\n${result.stderr}`
      );
    }
  });

  it('rejects non-integer retention ages with and without --help', async function () {
    this.timeout(30000);
    const ages = ['1.5', '30.0', '1e2', '3e1', 'Infinity', 'NaN', '', '0', '36501', '9007199254740993'];
    for (const age of ages) {
      for (const args of [
        ['retain', `--older-than-days=${age}`, '--reason=r', '--operator=o'],
        ['retain', '--help', `--older-than-days=${age}`, '--reason=r', '--operator=o'],
      ] as const) {
        const result = await runScript([...args]);
        assert.equal(
          result.exitCode,
          1,
          `retention age ${JSON.stringify(age)} must fail for ${JSON.stringify(args)}, got:\n${result.stderr}`
        );
        assert.ok(
          result.stderr.includes('bounded safe integer'),
          `retention age ${JSON.stringify(age)} must report the bounded safe integer contract, got:\n${result.stderr}`
        );
      }
    }
  });

  it('rejects missing required flags without lifting sails', async function () {
    const acknowledgeResult = await runScript(['acknowledge', '--fingerprint=' + 'a'.repeat(64)]);
    assert.equal(acknowledgeResult.exitCode, 1);
    assert.ok(
      acknowledgeResult.stderr.includes(
        'Acknowledge requires --fingerprint, --reason, --operator, and --classification.'
      ),
      `missing acknowledge flags must be rejected, got:\n${acknowledgeResult.stderr}`
    );
    const retainResult = await runScript(['retain', '--reason=r', '--operator=o']);
    assert.equal(retainResult.exitCode, 1);
    assert.ok(
      retainResult.stderr.includes('Retain requires --older-than-days=<days>, --reason, and --operator.'),
      `missing retain flags must be rejected, got:\n${retainResult.stderr}`
    );
  });

  it('rejects valued --help forms as boolean-only without lifting sails', async function () {
    this.timeout(30000);
    const cases: Array<readonly string[]> = [
      ['--help=true'],
      ['--help=false'],
      ['--help=1'],
      ['--help='],
      ['list', '--help=true'],
      ['list', '--help=', '--limit=10'],
      ['acknowledge', '--help=true'],
      ['retain', '--help=true'],
      ['retain', '--help', '--help=true', '--older-than-days=30', '--reason=r', '--operator=o'],
    ];
    for (const args of cases) {
      const result = await runScript([...args]);
      assert.equal(result.exitCode, 1, `valued --help must fail for ${JSON.stringify(args)}, got:\n${result.stderr}`);
      assert.ok(
        result.stderr.includes('--help must be boolean-only'),
        `valued --help must report boolean-only for ${JSON.stringify(args)}, got:\n${result.stderr}`
      );
    }
  });

  it('rejects whitespace-only reason and operator values without lifting sails', async function () {
    const fingerprint = 'a'.repeat(64);
    const normalCases: Array<{ args: readonly string[]; match: string }> = [
      {
        args: [
          'acknowledge',
          `--fingerprint=${fingerprint}`,
          '--reason=   ',
          '--operator=operator-1',
          '--classification=needs-investigation',
        ],
        match: 'Acknowledge requires --fingerprint, --reason, --operator, and --classification.',
      },
      {
        args: [
          'acknowledge',
          `--fingerprint=${fingerprint}`,
          '--reason=review',
          '--operator=   ',
          '--classification=needs-investigation',
        ],
        match: 'Acknowledge requires --fingerprint, --reason, --operator, and --classification.',
      },
      {
        args: [
          'acknowledge',
          `--fingerprint=${fingerprint}`,
          '--reason=\t',
          '--operator=\n',
          '--classification=needs-investigation',
        ],
        match: 'Acknowledge requires --fingerprint, --reason, --operator, and --classification.',
      },
      {
        args: ['retain', '--older-than-days=30', '--reason=   ', '--operator=operator-1'],
        match: 'Retain requires --older-than-days=<days>, --reason, and --operator.',
      },
      {
        args: ['retain', '--older-than-days=30', '--reason=routine review', '--operator=   '],
        match: 'Retain requires --older-than-days=<days>, --reason, and --operator.',
      },
    ];
    for (const { args, match } of normalCases) {
      const result = await runScript([...args]);
      assert.equal(
        result.exitCode,
        1,
        `whitespace-only values must fail for ${JSON.stringify(args)}, got:\n${result.stderr}`
      );
      assert.ok(
        result.stderr.includes(match),
        `expected ${JSON.stringify(match)} for ${JSON.stringify(args)}, got:\n${result.stderr}`
      );
    }
  });

  it('requires a bounded classification for acknowledgement without lifting sails', async function () {
    this.timeout(15000);
    const fingerprint = 'a'.repeat(64);
    const missing = await runScript([
      'acknowledge',
      `--fingerprint=${fingerprint}`,
      '--reason=review',
      '--operator=operator-1',
    ]);
    assert.equal(missing.exitCode, 1);
    assert.ok(
      missing.stderr.includes('Acknowledge requires --fingerprint, --reason, --operator, and --classification.'),
      `missing classification must be rejected, got:\n${missing.stderr}`
    );
    for (const classification of ['free-text-triage', 'Needs-Investigation', '']) {
      const result = await runScript([
        'acknowledge',
        `--fingerprint=${fingerprint}`,
        '--reason=review',
        '--operator=operator-1',
        `--classification=${classification}`,
      ]);
      assert.equal(
        result.exitCode,
        1,
        `classification ${JSON.stringify(classification)} must fail, got:\n${result.stderr}`
      );
      assert.ok(
        result.stderr.includes('Acknowledge requires --classification as one of:'),
        `expected classification vocabulary error, got:\n${result.stderr}`
      );
    }
    const helpMissing = await runScript([
      'acknowledge',
      '--help',
      `--fingerprint=${fingerprint}`,
      '--reason=review',
      '--operator=operator-1',
      '--classification=bogus',
    ]);
    assert.equal(helpMissing.exitCode, 1);
    assert.ok(
      helpMissing.stderr.includes('Acknowledge requires --classification as one of:'),
      `invalid help classification must be rejected, got:\n${helpMissing.stderr}`
    );
  });

  it('documents the bounded classification vocabulary in help output', async function () {
    const result = await runScript(['acknowledge', '--help']);
    assert.equal(result.exitCode, 0);
    for (const classification of [
      'approved-security-difference',
      'expected-legacy-gap',
      'scope-declaration-fix-required',
      'needs-investigation',
    ]) {
      assert.ok(
        result.stdout.includes(classification),
        `help must document classification ${classification}, got:\n${result.stdout}`
      );
    }
  });

  it('rejects whitespace-only reason and operator values on help paths', async function () {
    const fingerprint = 'c'.repeat(64);
    const helpCases: Array<{ args: readonly string[]; match: string }> = [
      {
        args: [
          'acknowledge',
          '--help',
          `--fingerprint=${fingerprint}`,
          '--reason=   ',
          '--operator=operator-1',
          '--classification=needs-investigation',
        ],
        match: 'Acknowledge requires --fingerprint, --reason, --operator, and --classification.',
      },
      {
        args: [
          'acknowledge',
          '--help',
          `--fingerprint=${fingerprint}`,
          '--reason=review',
          '--operator=  ',
          '--classification=needs-investigation',
        ],
        match: 'Acknowledge requires --fingerprint, --reason, --operator, and --classification.',
      },
      {
        args: ['retain', '--help', '--older-than-days=30', '--reason=   ', '--operator=operator-1'],
        match: 'Retain requires --older-than-days=<days>, --reason, and --operator.',
      },
      {
        args: ['retain', '--help', '--older-than-days=30', '--reason=routine review', '--operator=\t'],
        match: 'Retain requires --older-than-days=<days>, --reason, and --operator.',
      },
    ];
    for (const { args, match } of helpCases) {
      const result = await runScript([...args]);
      assert.equal(
        result.exitCode,
        1,
        `whitespace-only help values must fail for ${JSON.stringify(args)}, got:\n${result.stderr}`
      );
      assert.ok(
        result.stderr.includes(match),
        `expected ${JSON.stringify(match)} for ${JSON.stringify(args)}, got:\n${result.stderr}`
      );
    }
  });
});

describe('authorization-shadow-mismatches CLI failure redaction', () => {
  it('exposes a redacting failure formatter without lifting sails on require', () => {
    assert.equal(typeof shadowCli.formatShadowMismatchFailure, 'function');
    assert.equal(typeof shadowCli.sharedRedact, 'function');
    assert.deepEqual([...shadowCli.MISMATCH_CLASSIFICATIONS], AUTHORIZATION_MISMATCH_CLASSIFICATIONS);
  });

  it('redacts a lift failure carrying connection-string and bearer credential material', () => {
    const failure = new Error(
      'Sails lift failed: invalid datastore config password="hunter2-secret-value" for mongodb://mongo:27017/redbox with header Bearer abcdef1234567890'
    );
    const formatted = shadowCli.formatShadowMismatchFailure('lift', failure);
    assert.ok(formatted.startsWith('Sails lift failed: '), `unexpected prefix, got:\n${formatted}`);
    assert.ok(formatted.endsWith('\n'), 'failure output must end with a newline');
    assert.ok(!formatted.includes('hunter2-secret-value'), `lift secret leaked:\n${formatted}`);
    assert.ok(!formatted.includes('abcdef1234567890'), `bearer value leaked:\n${formatted}`);
    assert.ok(formatted.includes('[REDACTED]'), `expected a redaction marker, got:\n${formatted}`);
  });

  it('redacts a service failure carrying password, basic-auth, and JWT credential material', () => {
    const failure = new Error(
      'Shadow mismatch query failed: password=sup3r-secret-token, Basic dXNlcjpwYXNzd29yZA==, eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature-part'
    );
    const formatted = shadowCli.formatShadowMismatchFailure('service', failure);
    assert.ok(formatted.startsWith('Shadow mismatch service failed: '), `unexpected prefix, got:\n${formatted}`);
    assert.ok(!formatted.includes('sup3r-secret-token'), `password value leaked:\n${formatted}`);
    assert.ok(!formatted.includes('dXNlcjpwYXNzd29yZA=='), `basic credential leaked:\n${formatted}`);
    assert.ok(!formatted.includes('eyJhbGciOiJIUzI1NiJ9'), `JWT value leaked:\n${formatted}`);
    assert.ok(formatted.includes('[REDACTED]'), `expected a redaction marker, got:\n${formatted}`);
  });

  it('redacts non-Error thrown values while preserving ordinary identifiers', () => {
    const formatted = shadowCli.formatShadowMismatchFailure(
      'service',
      'string failure with api_key=live-secret-value-1234 and request 9f8c8c9c-7b6a-4d5e-8f0a-1b2c3d4e5f6a'
    );
    assert.ok(!formatted.includes('live-secret-value-1234'), `credential value leaked:\n${formatted}`);
    assert.ok(
      formatted.includes('9f8c8c9c-7b6a-4d5e-8f0a-1b2c3d4e5f6a'),
      `ordinary UUID identifiers must survive redaction, got:\n${formatted}`
    );
  });

  it('routes failures through the shared authorization credential redactor with no copied fallback', () => {
    assert.equal(
      shadowCli.sharedRedact('call failed for Bearer abcdef1234567890 at route'),
      'call failed for [REDACTED] at route'
    );
    assert.equal(shadowCli.sharedRedact('steady state with no credentials'), 'steady state with no credentials');
    assert.equal(
      shadowCli.SHARED_REDACTOR_SPECIFIER,
      '@researchdatabox/redbox-core/authorization/persistence-contracts'
    );
    const fs = require('node:fs');
    const source = fs.readFileSync(SCRIPT, 'utf8') as string;
    assert.ok(
      source.includes('@researchdatabox/redbox-core/authorization/persistence-contracts'),
      'CLI must import the officially exported shared redactor subpath'
    );
    assert.ok(
      !source.includes('FALLBACK_CREDENTIAL_PATTERNS') && !source.includes('fallbackRedact'),
      'CLI must not carry a copied regex fallback as the normal path'
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shared = require('@researchdatabox/redbox-core/authorization/persistence-contracts') as {
      redactAuthorizationCredentialStrings(value: string): string;
    };
    for (const sentinel of [
      'Sails lift failed: password="hunter2-secret-value" with header Bearer abcdef1234567890',
      'Shadow mismatch query failed: password=sup3r-secret-token, Basic dXNlcjpwYXNzd29yZA==, eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.sig',
      'steady state with no credentials',
    ]) {
      assert.equal(shadowCli.sharedRedact(sentinel), shared.redactAuthorizationCredentialStrings(sentinel));
    }
  });
});

describe('remediation closure CLI', () => {
  it('requires the separate evidence-file workflow and rejects approval flags', () => {
    assert.equal(
      shadowCli.parseArgv([
        'close-remediated',
        '--evidence-file=/secure/report.json',
        '--operator=op',
        '--reason=verified',
      ]).help,
      false
    );
    assert.throws(
      () => shadowCli.parseArgv(['close-remediated', '--operator=op', '--reason=verified']),
      /evidence-file/
    );
    assert.throws(
      () =>
        shadowCli.parseArgv([
          'close-remediated',
          '--evidence-file=a',
          '--operator=op',
          '--reason=verified',
          '--classification=mapping-defect',
        ]),
      /Unknown argument/
    );
    assert.equal(shadowCli.parseArgv(['close-remediated', '--help']).help, true);
    assert.throws(() => shadowCli.parseArgv(['close-remediated', '--help', '--evidence-file=']), /evidence-file/);
  });
  it('bounds evidence-file reads before lift and never echoes invalid JSON contents', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'remediation-cli-'));
    const file = path.join(dir, 'evidence.json');
    try {
      writeFileSync(file, JSON.stringify({ result: 'passed' }));
      assert.deepEqual(shadowCli.readRemediationEvidence(file), { result: 'passed' });
      writeFileSync(file, 'x'.repeat(8193));
      assert.throws(() => shadowCli.readRemediationEvidence(file), /exceeds 8192/);
      writeFileSync(file, 'Bearer secret-value invalid-json');
      assert.throws(
        () => shadowCli.readRemediationEvidence(file),
        error => error instanceof Error && error.message === 'Remediation evidence must be valid JSON.'
      );
      assert.throws(() => shadowCli.readRemediationEvidence(dir), /regular JSON file/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
