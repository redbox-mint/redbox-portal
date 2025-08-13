#!/usr/bin/env node
/**
 * Generate or expand _meta in language-defaults/<lng>/<ns>.json
 * - Groups keys into categories based on prefixes
 * - Adds a human readable description template
 * - Preserves existing _meta entries
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../language-defaults');

/**
 * Heuristics to infer category from key prefixes.
 * Order matters; first match wins.
 */
const CATEGORY_RULES = [
  { re: /^menu[-@]/, category: 'menu' },
  { re: /^menu-/, category: 'menu' },
  { re: /^record-search-/, category: 'search' },
  { re: /^search-/, category: 'search' },
  { re: /^report-/, category: 'reports' },
  { re: /^reports?-/, category: 'reports' },
  { re: /^manage-users?-/, category: 'users' },
  { re: /^manage-roles?-/, category: 'users' },
  { re: /^dataRecord-/, category: 'dataRecord' },
  { re: /^dataPublication-/, category: 'dataPublication' },
  { re: /^rdmp-/, category: 'rdmp' },
  { re: /^@dmpt-/, category: 'rdmp' },
  { re: /^@dataRecord-/, category: 'dataRecord' },
  { re: /^@dataPublication-/, category: 'dataPublication' },
  { re: /^workspace/, category: 'workspace' },
  { re: /^system-/, category: 'system' },
  { re: /^error-/, category: 'errors' },
  { re: /^auth-/, category: 'auth' },
  { re: /^local-/, category: 'auth' },
  { re: /^oidc-/, category: 'auth' },
  { re: /^export-/, category: 'export' },
];

function walkKeys(obj, prefix = '', acc = []) {
  Object.keys(obj).forEach((k) => {
    if (k === '_meta') return; // ignore meta section
    const v = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      walkKeys(v, key, acc);
    } else {
      acc.push(key);
    }
  });
  return acc;
}

function inferCategory(key) {
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(key)) return rule.category;
  }
  // fallback: first token before dash or at, else general
  if (key.startsWith('@')) {
    const t = key.slice(1).split(/[-:.]/)[0];
    return t || 'general';
  }
  const t = key.split(/[-:.]/)[0];
  return t || 'general';
}

function defaultDescription(key) {
  return `Translation for ${key.replace(/^@/, '')}`;
}

function processFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error(`Skipping invalid JSON: ${filePath}`);
    return false;
  }
  const meta = json._meta || {};
  const keys = walkKeys(json);
  let added = 0;
  keys.forEach((k) => {
    if (meta[k]) return; // preserve
    meta[k] = { category: inferCategory(k), description: defaultDescription(k) };
    added++;
  });
  if (!json._meta) json._meta = {};
  // Merge while preserving existing entries
  json._meta = { ...json._meta, ...meta };

  if (added > 0) {
    fs.writeFileSync(filePath, JSON.stringify(json, null, '\t') + '\n');
  }
  return { added, total: keys.length };
}

function main() {
  const langs = fs.readdirSync(ROOT).filter((f) => fs.statSync(path.join(ROOT, f)).isDirectory());
  let summary = [];
  langs.forEach((lng) => {
    const dir = path.join(ROOT, lng);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    files.forEach((file) => {
      const fp = path.join(dir, file);
      const res = processFile(fp);
      if (res) summary.push({ file: `${lng}/${file}`, ...res });
    });
  });
  console.log('Meta generation summary:');
  summary.forEach((s) => console.log(`${s.file}: added ${s.added}/${s.total}`));
}

if (require.main === module) {
  main();
}
