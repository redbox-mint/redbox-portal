'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const auditor = path.resolve(__dirname, '../../support/tooling/sails-retirement/retirement-closure.cjs');

for (const [label, source, count] of [
  ['complete comment', '<!-- sails.lift(); -->', 0],
  ['overlapping delimiters', '<!<!-- ignored -->-- sails.lift(); -->', 0],
  ['unterminated trailing comment', '<!-- sails.lift();', 0],
  ['overlap creating an unterminated comment', '<!<!-- ignored -->-- sails.lift();', 0],
  ['live code after overlapping comments', '<!<!-- ignored -->-- sails.lift(); -->\nsails.lower();', 1],
  ['live code before an unterminated comment', 'sails.lift(); <!-- unfinished', 1],
  ['first close ends a nested HTML comment', '<!-- outer <!-- nested --> sails.lift(); -->', 1],
]) {
  test(`retirement audit strips HTML ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-html-'));
    try {
      fs.writeFileSync(path.join(directory, 'fixture.ejs'), source);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      assert.equal(result.error, undefined);
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [label, source, count] of [
  ['exact rejected EJS fixture', "fs.writeFileSync(file, '<%= sails.config.appUrl %>');", 0],
  ['evaluated legacy path', "eval('sails.config.appUrl');", 1],
  ['live access beside the fixture', "fs.writeFileSync(file, '<%= sails.config.appUrl %>'); sails.lift();", 1],
]) {
  test(`retirement audit checks CLI ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-view-audit-'));
    try {
      const fixture = path.join(directory, 'packages/redbox-dev-tools/test');
      fs.mkdirSync(fixture, { recursive: true });
      fs.writeFileSync(path.join(fixture, 'cli.test.ts'), source);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      assert.equal(result.error, undefined);
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [label, source, count] of [
  ['forbidden package table', "const rejected = ['sails','sails.io.js','skipper','waterline'].includes(leaf);", 0],
  ['actual forbidden package import', "require('sails.io.js');", 1],
  [
    'unrelated runtime path',
    "const rejected = ['sails','sails.config.synthetic','skipper','waterline'].includes(leaf);",
    1,
  ],
]) {
  test(`retirement audit distinguishes ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-graph-audit-'));
    try {
      const fixture = path.join(directory, 'packages/redbox-core/test/qualification');
      fs.mkdirSync(fixture, { recursive: true });
      fs.writeFileSync(path.join(fixture, 'installed-dependency-graph.cjs'), source);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [label, source, count] of [
  [
    'known finite conversion',
    "const names = {'sails.services.planattachmentservice.preserveIds':'wsu.plan.preserveIds'};",
    0,
  ],
  [
    'wrong target for a known conversion',
    "const names = {'sails.services.planattachmentservice.preserveIds':'wsu.unknown'};",
    1,
  ],
  ['evaluated conversion string', "resolve('sails.services.planattachmentservice.preserveIds');", 1],
  ['unknown conversion', "const names = {'sails.services.unknown.run':'wsu.unknown'};", 1],
  ['live access', 'sails.services.planattachmentservice.preserveIds();', 1],
]) {
  test(`retirement audit checks WSU ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-wsu-audit-'));
    try {
      const fixture = path.join(directory, 'node_modules/redbox-hook-wsu/dist');
      fs.mkdirSync(fixture, { recursive: true });
      fs.writeFileSync(
        path.join(directory, 'node_modules/redbox-hook-wsu/package.json'),
        JSON.stringify({ name: 'redbox-hook-wsu' })
      );
      fs.writeFileSync(path.join(fixture, 'migration-data.js'), source);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [label, source, count] of [
  [
    'offline manifest rejection',
    "if (pkg.sails != null) findings.push('sails: remove legacy hook discovery metadata');",
    0,
  ],
  ['loading the legacy manifest value', 'load(pkg.sails);', 1],
  [
    'live runtime access beside the rejection check',
    "if (pkg.sails != null) findings.push('sails: remove legacy hook discovery metadata'); sails.lift();",
    1,
  ],
]) {
  test(`retirement audit checks CLI ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-cli-audit-'));
    try {
      const fixture = path.join(directory, 'packages/redbox-dev-tools/src');
      fs.mkdirSync(fixture, { recursive: true });
      fs.writeFileSync(path.join(fixture, 'cli.ts'), source);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [name, declaration, violations] of [
  ['exported module API', 'export declare const liveOniTemplatingService: unknown;', 0],
  ['ambient global', 'declare const SyntheticService: unknown;', 1],
  ['implicit runtime global in a module', 'export {}; declare const SyntheticService: unknown;', 1],
  ['global augmentation', 'export {}; declare global { const SyntheticService: unknown; }', 1],
  ['global augmentation with export', 'export {}; declare global { export const SyntheticService: unknown; }', 1],
]) {
  test(`retirement audit distinguishes ${name}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-audit-'));
    try {
      fs.writeFileSync(path.join(directory, 'fixture.d.ts'), declaration);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      assert.equal(result.error, undefined);
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, violations, result.stdout + result.stderr);
      assert.equal(audit.forbiddenDependencyEntries, 0);
      assert.equal(result.status, violations ? 1 : 0);
      if (!violations)
        assert(
          audit.classified.some(entry => entry.reason === 'Explicit module export declaration; no ambient global')
        );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [label, source, count] of [
  ['queued legacy data', "const data = { function: 'sails.services.pdfservice.createPDF' };", 0],
  ['live queue service access', 'sails.services.pdfservice.createPDF();', 1],
]) {
  test(`retirement audit classifies ${label} without exempting executable identifiers`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-queue-audit-'));
    try {
      const fixture = path.join(directory, 'packages/redbox-core/test/queues');
      fs.mkdirSync(fixture, { recursive: true });
      fs.writeFileSync(path.join(fixture, 'QueueMongo.test.ts'), source);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [label, source, count] of [
  ['retained configuration data', "export const data = [{ function: 'sails.services.pdfservice.createPDF' }];", 0],
  ['live service access in the literal table', 'sails.services.pdfservice.createPDF();', 1],
  ['unrelated retired path in the literal table', "const path = 'sails.config.synthetic';", 1],
]) {
  test(`retirement audit checks ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-config-audit-'));
    try {
      const fixture = path.join(directory, 'packages/redbox-core/test/configuration');
      fs.mkdirSync(fixture, { recursive: true });
      fs.writeFileSync(path.join(fixture, 'legacyInventoryTypes.ts'), source);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [label, suffix, count] of [
  ['auditor alone', '', 0],
  ['live code beside auditor constants', '\nsails.lift();\n', 1],
  ['evaluated code beside auditor constants', "\neval('sails.config.appUrl');\n", 1],
]) {
  test(`retirement audit inspects its own executable ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-self-'));
    try {
      const file = path.join(directory, 'support/tooling/sails-retirement/retirement-closure.cjs');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, fs.readFileSync(auditor, 'utf8') + suffix);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
for (const [label, filename, source, count] of [
  ['historical JSON', 'configuration-inventory.json', JSON.stringify({ baseline: 'sails.config.appUrl' }), 0],
  ['invalid JSON', 'configuration-inventory.json', 'sails.lift();', 1],
  ['adjacent executable', 'fixture.cjs', 'sails.lift();', 1],
]) {
  test(`retirement audit checks permanent fixture ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-data-'));
    try {
      const file = path.join(directory, 'test/fixtures/sails-retirement', filename);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [label, source, count] of [
  ['metadata snapshot', 'const snapshot = { sails: pkg.sails ?? null };', 0],
  ['executed metadata', 'load(pkg.sails);', 1],
  ['live access beside snapshot', 'const snapshot = { sails: pkg.sails ?? null }; sails.lift();', 1],
]) {
  test(`retirement audit checks offline inventory ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-inventory-'));
    try {
      const file = path.join(directory, 'support/tooling/sails-retirement/inventory.cjs');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [label, source, count] of [
  ['aliased require', "const legacy = require('sails'); legacy.lift();", 1],
  ['default import alias', "import framework from 'sails'; framework.lift();", 1],
  ['namespace import alias', "import * as framework from 'sails';", 1],
  ['dynamic import', "const framework = await import('sails');", 1],
  ['import equals alias', "import framework = require('sails');", 1],
  ['package subpath', "const framework = require('sails/lib/app');", 1],
  ['re-export', "export { lift as start } from 'sails';", 1],
  ['retired persistence package', "const legacy = require('waterline');", 1],
  ['historical neutral package', "const common = require('@researchdatabox/sails-ng-common');", 0],
  ['inert package name', "const framework = 'sails';", 0],
]) {
  test(`retirement audit checks ${label} by module specifier`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-import-'));
    try {
      fs.writeFileSync(path.join(directory, 'fixture.ts'), source);
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const [name, redbox, count] of [
  ['@institution/customization', { extension: '.' }, 1],
  ['@other/vendor-library', undefined, 0],
  ['redbox-hook-institution', undefined, 1],
]) {
  test(`retirement audit detects installed extension source in ${name}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-scoped-'));
    try {
      const extension = path.join(directory, 'node_modules', name);
      fs.mkdirSync(path.join(extension, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(extension, 'package.json'), JSON.stringify({ name, version: '1.0.0', redbox }));
      fs.writeFileSync(path.join(extension, 'dist/index.js'), "const legacy = require('sails'); legacy.lift();");
      const result = spawnSync(process.execPath, [auditor, '--tree', directory], { encoding: 'utf8' });
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations, count, result.stdout + result.stderr);
      assert.equal(result.status, count ? 1 : 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
