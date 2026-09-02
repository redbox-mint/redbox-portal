#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const defaultsRoot = path.join(repositoryRoot, 'language-defaults');
const errors = [];

function scanJsonObjectKeys(source, filePath) {
  let position = 0;
  const duplicates = [];

  function whitespace() {
    while (/\s/.test(source[position] || '')) position += 1;
  }

  function stringToken() {
    const start = position;
    position += 1;
    while (position < source.length) {
      if (source[position] === '\\') {
        position += 2;
      } else if (source[position] === '"') {
        position += 1;
        return JSON.parse(source.slice(start, position));
      } else {
        position += 1;
      }
    }
    throw new Error(`Unterminated string in ${filePath}`);
  }

  function value() {
    whitespace();
    if (source[position] === '{') return object();
    if (source[position] === '[') return array();
    if (source[position] === '"') {
      stringToken();
      return;
    }
    while (position < source.length && !/[\s,\]}]/.test(source[position])) position += 1;
  }

  function object() {
    position += 1;
    const keys = new Set();
    whitespace();
    if (source[position] === '}') {
      position += 1;
      return;
    }
    while (position < source.length) {
      whitespace();
      const key = stringToken();
      if (keys.has(key)) duplicates.push(`${filePath}: duplicate object key '${key}'`);
      keys.add(key);
      whitespace();
      if (source[position] !== ':') throw new Error(`Expected ':' after '${key}' in ${filePath}`);
      position += 1;
      value();
      whitespace();
      if (source[position] === '}') {
        position += 1;
        return;
      }
      if (source[position] !== ',') throw new Error(`Expected ',' after '${key}' in ${filePath}`);
      position += 1;
    }
    throw new Error(`Unterminated object in ${filePath}`);
  }

  function array() {
    position += 1;
    whitespace();
    if (source[position] === ']') {
      position += 1;
      return;
    }
    while (position < source.length) {
      value();
      whitespace();
      if (source[position] === ']') {
        position += 1;
        return;
      }
      if (source[position] !== ',') throw new Error(`Expected ',' in ${filePath}`);
      position += 1;
    }
    throw new Error(`Unterminated array in ${filePath}`);
  }

  value();
  whitespace();
  if (position !== source.length) throw new Error(`Unexpected JSON content in ${filePath}`);
  return duplicates;
}

function readJson(relativePath) {
  const filePath = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  try {
    errors.push(...scanJsonObjectKeys(source, relativePath));
    return JSON.parse(source);
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return {};
  }
}

function flatten(value, prefix = '', result = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, child] of Object.entries(value)) {
    if (key === '_meta') continue;
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, flatKey, result);
    else result[flatKey] = child;
  }
  return result;
}

function placeholders(value) {
  return new Set((String(value).match(/{{\s*([^}\s]+)[^}]*}}/g) || [])
    .map(token => token.replace(/^{{\s*|[^}]*}}$/g, '').trim()));
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every(item => right.has(item));
}

const metadata = readJson('language-defaults/meta.json');
const english = flatten(readJson('language-defaults/en/translation.json'));
readJson('language-defaults/language-names.json');

function requireEnglishMetadata(keys, sourceDescription) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(english, key)) {
      errors.push(`language-defaults/en/translation.json: '${key}' required by ${sourceDescription} is missing`);
    }
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) {
      errors.push(`language-defaults/meta.json: '${key}' required by ${sourceDescription} is missing`);
    }
  }
}

const requiredValidationTranslationKeys = [
  '@record-save-record-validation-failed',
  '@record-save-record-validation-form-resolution-failed',
  '@record-save-record-validation-configuration-failed',
  '@record-save-record-validation-timeout',
  '@record-save-record-validation-operation-invalid',
  '@record-save-record-validation-operation-unauthorized',
  '@record-save-record-validation-transition-unauthorized',
  '@record-save-record-validation-edit-unauthorized',
  '@record-save-record-validation-snapshot-unavailable',
  '@record-save-record-validation-authority-context-divergence',
  '@record-save-record-validation-post-sync-failed',
  '@record-save-record-validation-bypass-invalid',
  '@record-save-record-validation-bypass-forbidden',
  '@record-save-record-validation-bypass-audit-failed',
  '@record-save-record-validation-batch-bypass-audit-failed',
  '@validator-error-any-of',
  '@validator-error-different-values',
  '@validator-error-doi',
  '@validator-error-email',
  '@validator-error-html-unsafe',
  '@validator-error-jsonata-expression',
  '@validator-error-map-enabled-modes',
  '@validator-error-max',
  '@validator-error-max-length',
  '@validator-error-min',
  '@validator-error-min-length',
  '@validator-error-orcid',
  '@validator-error-pattern',
  '@validator-error-record-validation',
  '@validator-error-required',
  '@validator-error-required-true',
  '@validator-error-typeahead-multi-select-unsupported',
  '@validator-error-typeahead-provider',
  '@validator-error-typeahead-query-id',
  '@validator-error-typeahead-service-id',
  '@validator-error-typeahead-source-type',
  '@validator-error-typeahead-static-options',
  '@validator-error-typeahead-vocab-ref',
  '@validator-error-url',
  '@validator-warning-html-sanitized',
];
requireEnglishMetadata(requiredValidationTranslationKeys, 'authoritative record validation');

for (const relativePath of fs.readdirSync(defaultsRoot, { withFileTypes: true })) {
  if (!relativePath.isDirectory()) continue;
  const localeRoot = path.join(defaultsRoot, relativePath.name);
  for (const file of fs.readdirSync(localeRoot, { recursive: true })) {
    if (file.endsWith('.json')) readJson(path.relative(repositoryRoot, path.join(localeRoot, file)));
  }
}

for (const [key, entry] of Object.entries(metadata)) {
  if (!Object.prototype.hasOwnProperty.call(english, key)) {
    errors.push(`language-defaults/meta.json: '${key}' is missing from English translation.json`);
  }
  if (!entry || typeof entry !== 'object') {
    errors.push(`language-defaults/meta.json: '${key}' metadata must be an object`);
    continue;
  }
  if (!String(entry.category || '').trim()) errors.push(`language-defaults/meta.json: '${key}' has no category`);
  if (!String(entry.description || '').trim()) errors.push(`language-defaults/meta.json: '${key}' has no description`);
  if (entry.contentFormat !== undefined && !['plain', 'html'].includes(entry.contentFormat)) {
    errors.push(`language-defaults/meta.json: '${key}' has invalid contentFormat '${entry.contentFormat}'`);
  }
}

for (const [key, value] of Object.entries(english)) {
  if (typeof value === 'string' && /\(s\)/.test(value)) {
    errors.push(`language-defaults/en/translation.json: '${key}' uses '(s)'; use a properly pluralised label or i18next plural variants`);
  }
  if (key.endsWith('_one')) {
    const otherKey = `${key.slice(0, -4)}_other`;
    if (!Object.prototype.hasOwnProperty.call(english, otherKey)) {
      errors.push(`language-defaults/en/translation.json: plural key '${key}' has no '${otherKey}' variant`);
    } else if (!sameSet(placeholders(value), placeholders(english[otherKey]))) {
      errors.push(`language-defaults/en/translation.json: plural variants '${key}' and '${otherKey}' use different placeholders`);
    }
  }
}

const productionLocaleDirs = fs.readdirSync(defaultsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name !== 'demo')
  .map(entry => entry.name);
for (const locale of productionLocaleDirs) {
  if (!fs.existsSync(path.join(defaultsRoot, locale, 'translation.json'))) {
    errors.push(`language-defaults/${locale}: production locale has no translation.json`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Translation verification passed: ${Object.keys(metadata).length} metadata keys, ${Object.keys(english).length} English keys, ${productionLocaleDirs.length} production locale.`);
