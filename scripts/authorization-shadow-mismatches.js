#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const rc = require('rc');
const sails = require('sails');
const { lift, lower } = require('./lib/sails-lift');

// Shared authorization credential redactor. This is the authoritative
// implementation; there is intentionally no copied regex fallback here so a
// drift between this script and the persistence contract cannot silently
// become the normal path. The subpath below is an officially exported,
// runtime-safe module (see `packages/redbox-core/package.json` `exports`:
// it depends only on the pure `authorization/errors` module, never on Sails
// or Waterline).
const SHARED_REDACTOR_SPECIFIER = '@researchdatabox/redbox-core/authorization/persistence-contracts';
// eslint-disable-next-line global-require
const { redactAuthorizationCredentialStrings } = require(SHARED_REDACTOR_SPECIFIER);

function sharedRedact(value) {
  return redactAuthorizationCredentialStrings(value);
}

/**
 * Formats a shadow mismatch workflow failure for stderr without leaking
 * credential material. The stage sentinel distinguishes Sails lift failures
 * (which may echo connection strings or environment-derived secrets) from
 * service failures (which may echo datastore-backed error detail); both
 * funnel through the shared authorization credential redactor.
 */
function formatShadowMismatchFailure(stage, error) {
  const raw = error instanceof Error ? error.message : String(error);
  const sentinel = stage === 'lift' ? 'Sails lift failed' : 'Shadow mismatch service failed';
  return `${sentinel}: ${sharedRedact(raw)}\n`;
}

// Pure shared vocabulary: CLI validation and service persistence use the same
// six categories and explicit compatibility aliases, without lifting Sails.
const {
  AUTHORIZATION_MISMATCH_CATEGORIES: MISMATCH_CATEGORIES,
  AUTHORIZATION_MISMATCH_CLASSIFICATIONS: MISMATCH_CLASSIFICATIONS,
  AUTHORIZATION_MISMATCH_LEGACY_CATEGORY_MAP: MISMATCH_LEGACY_CATEGORY_MAP,
} = require('@researchdatabox/redbox-core/authorization/shadow-classification');

const ACTIONS = ['list', 'acknowledge', 'close-remediated', 'retain'];
const ALLOWLIST = {
  list: new Set(['limit', 'cursor', 'help']),
  acknowledge: new Set(['fingerprint', 'reason', 'operator', 'classification', 'help']),
  'close-remediated': new Set(['evidence-file', 'reason', 'operator', 'help']),
  retain: new Set(['older-than-days', 'limit', 'reason', 'operator', 'help']),
};
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;
// Retention age is a documented bounded safe integer: 1-36500 days (~100
// years). The upper bound keeps the derived cutoff inside the valid Date
// range and rejects unsafe/overflow dates; fractional, scientific-notation,
// Infinity, and non-digit forms are never accepted.
const RETENTION_DAYS_MIN = 1;
const RETENTION_DAYS_MAX = 36_500;
const INTEGER_PATTERN = /^\d+$/u;

function usage() {
  return [
    'Usage:',
    '  npm run authorization:shadow-mismatches -- list [--limit=<1-200>] [--cursor=<64-hex-fingerprint>]',
    '  npm run authorization:shadow-mismatches -- acknowledge --fingerprint=<64-hex> --reason="<operator reason>" --operator=<operator identity> --classification=<classification>',
    '  npm run authorization:shadow-mismatches -- close-remediated --evidence-file=<verified-json-file> --reason="<operator reason>" --operator=<operator identity>',
    '  npm run authorization:shadow-mismatches -- retain --older-than-days=<1-36500> --reason="<operator reason>" --operator=<operator identity> [--limit=<1-10000>]',
    '',
    'Mismatch categories (bounded, required for acknowledge):',
    `  ${MISMATCH_CATEGORIES.join(', ')}`,
    'Legacy compatibility aliases (accepted and preserved on stored rows/audits):',
    ...Object.entries(MISMATCH_LEGACY_CATEGORY_MAP).map(([legacy, category]) => `  ${legacy} -> ${category}`),
    'Only approved-legacy-security-bug and intentional-product-change (and their',
    'legacy aliases) approve differences. Defects stay open until close-remediated',
    'records passed verification bound to the latest observation and deployed build.',
    'A recurring fingerprint automatically clears resolvedAt, resolvedBy,',
    'resolutionReason, resolutionClassification, and remediation closure and reopens the mismatch.',
    '',
    'Non-HTTP operator workflow for shadow mismatch evidence. List output is',
    'bounded operational evidence only (fingerprint, route, outcomes, counts)',
    'and never writes to the append-only authorization audit; acknowledgement',
    'stores the bounded operator identity, reason, and typed classification on',
    'the aggregate row and appends a typed shadow.mismatch-acknowledged audit',
    'event (actorType=operator, authMethod=operator, succeeded outcome);',
    'retention deletes only approved, already-resolved aggregates and appends a typed',
    'shadow.retention.completed audit summary with the operator identity,',
    'reason, and outcome. Unresolved evidence is never deleted and append-only',
    'audit evidence is never deleted. None of these commands changes the',
    'rollout mode.',
  ].join('\n');
}

function fail(message) {
  process.stderr.write(`${usage()}\n`);
  throw new Error(message);
}

function parseListLimit(raw) {
  if (typeof raw !== 'string' || !INTEGER_PATTERN.test(raw)) {
    fail('List requires --limit=<1-200> as an integer.');
  }
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    fail('List requires --limit=<1-200> as an integer.');
  }
  return limit;
}

function parseRetentionLimit(raw) {
  if (typeof raw !== 'string' || !INTEGER_PATTERN.test(raw)) {
    fail('Retention requires --limit=<1-10000> as an integer.');
  }
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
    fail('Retention requires --limit=<1-10000> as an integer.');
  }
  return limit;
}

function parseRetentionDays(raw) {
  if (typeof raw !== 'string' || !INTEGER_PATTERN.test(raw)) {
    fail(
      `Retention requires --older-than-days=<${RETENTION_DAYS_MIN}-${RETENTION_DAYS_MAX}> as a bounded safe integer.`
    );
  }
  const days = Number(raw);
  if (!Number.isSafeInteger(days) || days < RETENTION_DAYS_MIN || days > RETENTION_DAYS_MAX) {
    fail(
      `Retention requires --older-than-days=<${RETENTION_DAYS_MIN}-${RETENTION_DAYS_MAX}> as a bounded safe integer.`
    );
  }
  return days;
}

// Validates the format of provided flags without requiring presence. Used on
// the --help path so `action --help` with valid flags still prints help while
// invalid, unknown, or out-of-bounds flags are rejected before help is honored.
function validateHelpOptionValues(action, options) {
  if (action === 'close-remediated') {
    for (const name of ['evidence-file', 'reason', 'operator']) {
      if (options[name] !== undefined && options[name].trim().length === 0) fail(`Remediation requires --${name}.`);
    }
    return;
  }
  if (action === 'list') {
    if (options.limit !== undefined) parseListLimit(options.limit);
    if (options.cursor !== undefined && !FINGERPRINT_PATTERN.test(options.cursor)) {
      fail('Listing cursor must be an exact 64-character mismatch fingerprint.');
    }
    return;
  }
  if (action === 'acknowledge') {
    if (options.fingerprint !== undefined && !FINGERPRINT_PATTERN.test(options.fingerprint)) {
      fail('Acknowledgement requires the exact 64-character mismatch fingerprint.');
    }
    if (options.reason !== undefined && options.reason.trim().length === 0) {
      fail('Acknowledge requires --fingerprint, --reason, --operator, and --classification.');
    }
    if (options.operator !== undefined && options.operator.trim().length === 0) {
      fail('Acknowledge requires --fingerprint, --reason, --operator, and --classification.');
    }
    if (options.classification !== undefined && !MISMATCH_CLASSIFICATIONS.includes(options.classification)) {
      fail(`Acknowledge requires --classification as one of: ${MISMATCH_CLASSIFICATIONS.join(', ')}.`);
    }
    return;
  }
  if (options['older-than-days'] !== undefined) parseRetentionDays(options['older-than-days']);
  if (options.limit !== undefined) parseRetentionLimit(options.limit);
  if (options.reason !== undefined && options.reason.trim().length === 0) {
    fail('Retain requires --older-than-days=<days>, --reason, and --operator.');
  }
  if (options.operator !== undefined && options.operator.trim().length === 0) {
    fail('Retain requires --older-than-days=<days>, --reason, and --operator.');
  }
}

// Strict argv parsing that runs fully BEFORE any Sails lift. Rejects unknown,
// malformed, duplicate, and extra positional arguments plus out-of-bounds
// numerics so invalid invocations never touch the datastore.
function parseArgv(argv) {
  const positionals = [];
  const seen = new Map();
  let helpRequested = false;

  for (const token of argv) {
    if (token === '--help') {
      if (seen.has('help')) {
        fail('Duplicate argument: --help must appear at most once.');
      }
      seen.set('help', true);
      helpRequested = true;
      continue;
    }
    if (token.startsWith('--')) {
      const separator = token.indexOf('=');
      if (separator <= 2) {
        fail(`Malformed argument ${JSON.stringify(token)}: flags must use the exact --name=<value> form.`);
      }
      const name = token.slice(2, separator);
      const value = token.slice(separator + 1);
      if (name === 'help') {
        fail('--help must be boolean-only: use --help without a value.');
      }
      if (name.length === 0 || !/^[A-Za-z0-9-]+$/u.test(name)) {
        fail(`Malformed argument ${JSON.stringify(token)}: flag names must use letters, digits, and hyphens.`);
      }
      if (seen.has(name)) {
        fail(`Duplicate argument: --${name} must appear at most once.`);
      }
      seen.set(name, value);
      continue;
    }
    if (token.startsWith('-') && token.length > 0) {
      fail(`Unknown argument ${JSON.stringify(token)}: flags must use the exact --name=<value> form.`);
    }
    positionals.push(token);
  }

  if (helpRequested) {
    const [helpAction, ...helpExtra] = positionals;
    if (helpExtra.length > 0) {
      fail(`Unexpected extra argument ${JSON.stringify(helpExtra[0])}: expected only one action.`);
    }
    if (helpAction !== undefined && !ACTIONS.includes(helpAction)) {
      fail(`Shadow mismatch workflow requires one of: ${ACTIONS.join(', ')}.`);
    }
    if (helpAction === undefined) {
      for (const name of seen.keys()) {
        if (name === 'help') continue;
        fail(`Unknown argument --${name} without an action: expected only --help.`);
      }
      return { help: true, action: undefined };
    }
    const helpAllowed = ALLOWLIST[helpAction];
    for (const name of seen.keys()) {
      if (name === 'help') continue;
      if (!helpAllowed.has(name)) {
        fail(`Unknown argument --${name} for action ${JSON.stringify(helpAction)}.`);
      }
    }
    const helpOptions = {};
    for (const [name, value] of seen.entries()) {
      if (name === 'help') continue;
      helpOptions[name] = value;
    }
    validateHelpOptionValues(helpAction, helpOptions);
    return { help: true, action: helpAction };
  }

  const [action, ...extra] = positionals;
  if (action === undefined || !ACTIONS.includes(action)) {
    fail(`Shadow mismatch workflow requires one of: ${ACTIONS.join(', ')}.`);
  }
  if (extra.length > 0) {
    fail(`Unexpected extra argument ${JSON.stringify(extra[0])}: expected only one action.`);
  }

  const allowed = ALLOWLIST[action];
  for (const name of seen.keys()) {
    if (!allowed.has(name)) {
      fail(`Unknown argument --${name} for action ${JSON.stringify(action)}.`);
    }
  }

  const options = {};
  for (const [name, value] of seen.entries()) {
    if (name === 'help') continue;
    options[name] = value;
  }

  if (action === 'list') {
    if (options.limit !== undefined) {
      options.limit = parseListLimit(options.limit);
    }
    if (options.cursor !== undefined) {
      if (!FINGERPRINT_PATTERN.test(options.cursor)) {
        fail('Listing cursor must be an exact 64-character mismatch fingerprint.');
      }
    }
    return { help: false, action, options };
  }

  if (action === 'acknowledge') {
    const { fingerprint, reason, operator, classification } = options;
    if (fingerprint === undefined || reason === undefined || operator === undefined || classification === undefined) {
      fail('Acknowledge requires --fingerprint, --reason, --operator, and --classification.');
    }
    if (!FINGERPRINT_PATTERN.test(fingerprint)) {
      fail('Acknowledgement requires the exact 64-character mismatch fingerprint.');
    }
    if (reason.trim().length === 0 || operator.trim().length === 0) {
      fail('Acknowledge requires --fingerprint, --reason, --operator, and --classification.');
    }
    if (!MISMATCH_CLASSIFICATIONS.includes(classification)) {
      fail(`Acknowledge requires --classification as one of: ${MISMATCH_CLASSIFICATIONS.join(', ')}.`);
    }
    return { help: false, action, options };
  }

  if (action === 'close-remediated') {
    for (const name of ['evidence-file', 'reason', 'operator']) {
      if (typeof options[name] !== 'string' || options[name].trim().length === 0)
        fail(`Remediation requires --${name}.`);
    }
    return { help: false, action, options };
  }

  const { 'older-than-days': olderThanDays, limit, reason, operator } = options;
  if (olderThanDays === undefined || reason === undefined || operator === undefined) {
    fail('Retain requires --older-than-days=<days>, --reason, and --operator.');
  }
  const days = parseRetentionDays(olderThanDays);
  let parsedLimit;
  if (limit !== undefined) {
    parsedLimit = parseRetentionLimit(limit);
  }
  if (reason.trim().length === 0 || operator.trim().length === 0) {
    fail('Retain requires --older-than-days=<days>, --reason, and --operator.');
  }
  return {
    help: false,
    action,
    options: { olderThanDays: days, ...(parsedLimit === undefined ? {} : { limit: parsedLimit }), reason, operator },
  };
}

function readRemediationEvidence(file) {
  const fd = fs.openSync(file, 'r');
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('Remediation evidence must be a regular JSON file.');
    const buffer = Buffer.alloc(8193);
    let bytes = 0;
    while (bytes < buffer.length) {
      const count = fs.readSync(fd, buffer, bytes, buffer.length - bytes, null);
      if (count === 0) break;
      bytes += count;
    }
    if (bytes > 8192) throw new Error('Remediation evidence exceeds 8192 bytes.');
    try {
      return JSON.parse(buffer.subarray(0, bytes).toString('utf8'));
    } catch {
      throw new Error('Remediation evidence must be valid JSON.');
    }
  } finally {
    fs.closeSync(fd);
  }
}

async function main() {
  const parsed = parseArgv(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const evidence =
    parsed.action === 'close-remediated' ? readRemediationEvidence(parsed.options['evidence-file']) : undefined;
  const serviceName = 'authorizationrolloutservice';
  try {
    await lift({ ...rc('sails'), hooks: { grunt: false } });
  } catch (error) {
    // Lift failures may echo datastore connection strings or
    // environment-derived secrets; redact before reporting the stage.
    process.stderr.write(formatShadowMismatchFailure('lift', error));
    process.exitCode = 1;
    return;
  }
  try {
    const service = sails.services[serviceName];
    if (!service) throw new Error('AuthorizationRolloutService is unavailable.');
    if (parsed.action === 'list') {
      const result = await service.listUnresolvedShadowMismatches({
        ...(parsed.options.limit === undefined ? {} : { limit: parsed.options.limit }),
        ...(parsed.options.cursor === undefined ? {} : { cursor: parsed.options.cursor }),
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    if (parsed.action === 'acknowledge') {
      const result = await service.acknowledgeShadowMismatch({
        fingerprint: parsed.options.fingerprint,
        acknowledgedBy: parsed.options.operator,
        reason: parsed.options.reason,
        classification: parsed.options.classification,
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    if (parsed.action === 'close-remediated') {
      const result = await service.closeRemediatedShadowMismatch({
        evidence,
        remediatedBy: parsed.options.operator,
        reason: parsed.options.reason,
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    const result = await service.retainResolvedShadowMismatches({
      olderThanDays: parsed.options.olderThanDays,
      ...(parsed.options.limit === undefined ? {} : { limit: parsed.options.limit }),
      retainedBy: parsed.options.operator,
      reason: parsed.options.reason,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    // Service failures may echo datastore-backed error detail including
    // operator-supplied values; redact before reporting the stage.
    process.stderr.write(formatShadowMismatchFailure('service', error));
    process.exitCode = 1;
    return;
  } finally {
    await lower();
  }
}

module.exports = {
  formatShadowMismatchFailure,
  readRemediationEvidence,
  sharedRedact,
  SHARED_REDACTOR_SPECIFIER,
  MISMATCH_CLASSIFICATIONS,
  parseArgv,
  usage,
};

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(formatShadowMismatchFailure('service', error));
    process.exitCode = 1;
  });
}
