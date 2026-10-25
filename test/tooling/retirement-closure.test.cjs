'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const auditor = path.resolve(__dirname, '../../support/specs/sails-retirement/evidence/retirement-closure.cjs');

for (const [label, source, count] of [
  ['forbidden package table', "const rejected = ['sails','sails.io.js','skipper','waterline'].includes(leaf);", 0],
  ['actual forbidden package import', "require('sails.io.js');", 1],
  ['unrelated runtime path', "const rejected = ['sails','sails.config.synthetic','skipper','waterline'].includes(leaf);", 1],
]) {
  test(`retirement audit distinguishes ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(),'redbox-retirement-graph-audit-'));
    try {
      const fixture = path.join(directory,'packages/redbox-core/test/qualification');
      fs.mkdirSync(fixture,{recursive:true});
      fs.writeFileSync(path.join(fixture,'installed-dependency-graph.cjs'),source);
      const result = spawnSync(process.execPath,[auditor,'--tree',directory],{encoding:'utf8'});
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations,count,result.stdout+result.stderr);
      assert.equal(result.status,count?1:0);
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
  });
}

for (const [label, source, count] of [
  ['known finite conversion', "const names = {'sails.services.planattachmentservice.preserveIds':'wsu.plan.preserveIds'};", 0],
  ['unknown conversion', "const names = {'sails.services.unknown.run':'wsu.unknown'};", 1],
  ['live access', 'sails.services.planattachmentservice.preserveIds();', 1],
]) {
  test(`retirement audit checks WSU ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(),'redbox-retirement-wsu-audit-'));
    try {
      const fixture = path.join(directory,'node_modules/redbox-hook-wsu/dist');
      fs.mkdirSync(fixture,{recursive:true});
      fs.writeFileSync(path.join(directory,'node_modules/redbox-hook-wsu/package.json'),JSON.stringify({name:'redbox-hook-wsu'}));
      fs.writeFileSync(path.join(fixture,'migration-data.js'),source);
      const result = spawnSync(process.execPath,[auditor,'--tree',directory],{encoding:'utf8'});
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations,count,result.stdout+result.stderr);
      assert.equal(result.status,count?1:0);
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
  });
}

for (const [label, source, count] of [
  ['offline manifest rejection', "if (pkg.sails != null) findings.push('sails: remove legacy hook discovery metadata');", 0],
  ['loading the legacy manifest value', 'load(pkg.sails);', 1],
  ['live runtime access beside the rejection check', "if (pkg.sails != null) findings.push('sails: remove legacy hook discovery metadata'); sails.lift();", 1],
]) {
  test(`retirement audit checks CLI ${label}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-retirement-cli-audit-'));
    try {
      const fixture = path.join(directory, 'packages/redbox-dev-tools/src');
      fs.mkdirSync(fixture, {recursive:true});
      fs.writeFileSync(path.join(fixture,'cli.ts'),source);
      const result = spawnSync(process.execPath,[auditor,'--tree',directory],{encoding:'utf8'});
      const audit = JSON.parse(result.stdout);
      assert.equal(audit.executableViolations,count,result.stdout+result.stderr);
      assert.equal(result.status,count?1:0);
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
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
