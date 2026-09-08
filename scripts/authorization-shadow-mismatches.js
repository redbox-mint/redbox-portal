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

  const [action, ...extra] = positionals;
  // Help historically reports extra positionals before an invalid action;
  // normal invocations report the invalid action first.
  if (extra.length > 0 && (helpRequested || ACTIONS.includes(action))) {
    fail(`Unexpected extra argument ${JSON.stringify(extra[0])}: expected only one action.`);
  }
  if (!ACTIONS.includes(action) && !(helpRequested && action === undefined)) {
    fail(`Shadow mismatch workflow requires one of: ${ACTIONS.join(', ')}.`);
  }

  const options = {};
  for (const [name, value] of seen.entries()) {
    if (name === 'help') continue;
    if (action === undefined) {
      fail(`Unknown argument --${name} without an action: expected only --help.`);
    }
    if (!ALLOWLIST[action].has(name)) {
      fail(`Unknown argument --${name} for action ${JSON.stringify(action)}.`);
    }
    options[name] = value;
  }

  const parsedOptions = action === undefined ? options : validateOptions(action, options, helpRequested);
  return helpRequested ? { help: true, action } : { help: false, action, options: parsedOptions };
}

// Help skips required fields while validating every provided option through
// the same path as normal invocations, before any Sails lift.
function validateOptions(action, options, helpRequested) {
  if (action === 'list') {
    if (options.limit !== undefined) {
      options.limit = parseListLimit(options.limit);
    }
    if (options.cursor !== undefined) {
      if (!FINGERPRINT_PATTERN.test(options.cursor)) {
        fail('Listing cursor must be an exact 64-character mismatch fingerprint.');
      }
    }
    return options;
  }

  if (action === 'acknowledge') {
    const { fingerprint, reason, operator, classification } = options;
    if (
      !helpRequested &&
      (fingerprint === undefined || reason === undefined || operator === undefined || classification === undefined)
    ) {
      fail('Acknowledge requires --fingerprint, --reason, --operator, and --classification.');
    }
    if (fingerprint !== undefined && !FINGERPRINT_PATTERN.test(fingerprint)) {
      fail('Acknowledgement requires the exact 64-character mismatch fingerprint.');
    }
    if (reason?.trim().length === 0 || operator?.trim().length === 0) {
      fail('Acknowledge requires --fingerprint, --reason, --operator, and --classification.');
    }
    if (classification !== undefined && !MISMATCH_CLASSIFICATIONS.includes(classification)) {
      fail(`Acknowledge requires --classification as one of: ${MISMATCH_CLASSIFICATIONS.join(', ')}.`);
    }
    return options;
  }

  if (action === 'close-remediated') {
    for (const name of ['evidence-file', 'reason', 'operator']) {
      if ((!helpRequested && options[name] === undefined) || options[name]?.trim().length === 0)
        fail(`Remediation requires --${name}.`);
    }
    return options;
  }

  const { 'older-than-days': olderThanDays, limit, reason, operator } = options;
  if (!helpRequested && (olderThanDays === undefined || reason === undefined || operator === undefined)) {
    fail('Retain requires --older-than-days=<days>, --reason, and --operator.');
  }
  const days = olderThanDays === undefined ? undefined : parseRetentionDays(olderThanDays);
  let parsedLimit;
  if (limit !== undefined) {
    parsedLimit = parseRetentionLimit(limit);
  }
  if (reason?.trim().length === 0 || operator?.trim().length === 0) {
    fail('Retain requires --older-than-days=<days>, --reason, and --operator.');
  }
  return { olderThanDays: days, ...(parsedLimit === undefined ? {} : { limit: parsedLimit }), reason, operator };
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
