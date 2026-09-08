import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { describe, it } from 'mocha';

const runbook = readFileSync(
  resolve(__dirname, '../../../../support/wiki/Authorization-Migration-and-Rollout.md'),
  'utf8'
);
const fences = [...runbook.matchAll(/^```(bash|javascript)\n([\s\S]*?)^```/gm)];
const nodeBlocks = [...runbook.matchAll(/<<'(NODE|CUTOVER_NODE)'[^\n]*\n([\s\S]*?)\n\1(?:\n|$)/g)];
const cutover = nodeBlocks.find(block => block[1] === 'CUTOVER_NODE')?.[2];
const rollback = nodeBlocks.find(block => block[2].includes('Verified legacy mode'))?.[2];
const timing = nodeBlocks.find(block => block[2].includes('convergenceSeconds'))?.[2];
const NOW = Date.parse('2026-09-08T12:00:00.000Z');

function report(instanceId: string, mode = 'enforce') {
  return {
    generatedAt: new Date(NOW - 60_000).toISOString(),
    mode,
    deploymentIdentity: { complete: true, instanceId, buildVersion: 'reviewed-build' },
    registry: { generation: 'reviewed-registry', orphanedScopeCount: 0 },
    readyForEnforce: true,
    blockers: [] as { code: string }[],
    migration: { completed: true, driftTruncated: false, blockerCount: 0 },
    transactions: { available: true },
    routes: { valid: true },
    administrators: { brandsWithoutAdministratorCount: 0, systemAdministratorCount: 2 },
    rollbackExposure: { complete: true },
  };
}

// Independent admission contract: do not derive required rows or outcomes from the runbook.
const expectedSmoke: Record<string, Record<string, boolean | number>> = {
  'guest-home': { http: 200, implicitGuest: true, persistedGuest: false },
  'guest-pre-auth': { login: true, callback: true, logout: true, csrfBootstrap: true, protectedAccess: false },
  'authenticated-guest': { home: 200, self: 200, implicitGuest: true, administration: 403 },
  'researcher-record': { create: true, read: true, update: true, search: true, unrelatedRecord: 403 },
  'librarian-custom-roles': { curation: true, customGrants: true, customDenied: 403, labelGrants: false },
  'brand-admin-role': {
    create: true,
    edit: true,
    grant: true,
    revoke: true,
    immediateRevocation: true,
    audited: true,
    escalation: 403,
    systemAdministration: 403,
  },
  'system-admin-two-brands': { firstAdminBothBrands: true, secondAdminBothBrands: true, implicitRecordBypass: false },
  'disabled-session': { http: 401, controllerExecuted: false, guestFallback: false },
  'linked-identities': { canonicalParity: true, disabledParent: 401, aliasGrants: false },
  'role-lifecycle': {
    singleRole: true,
    additiveUnion: true,
    foreignRoleGrants: false,
    inactiveRoleGrants: false,
    expiredGrants: false,
    revokedGrants: false,
    suppressedGrants: false,
    orphanGrants: false,
    staleGrants: false,
  },
  'bearer-absent-ceiling': { workflow: true, sessionCsrfRequired: false, missingScope: 403, aclDenied: 403 },
  'bearer-empty-ceiling': { scoped: 403, guestScoped: 403, publicPreAuth: true },
  'bearer-restricted-ceiling': { outsideCeiling: 403, missingActorScope: 403, aclDenied: 403 },
  'bearer-permitted-ceiling': { permitted: true },
  'bearer-invalid': { http: 401, fallback: false, controllerExecuted: false },
  'bearer-revoked': { http: 401, fallback: false, controllerExecuted: false },
  'bearer-malformed': { http: 401, fallback: false, controllerExecuted: false },
  'acl-direct-view': { read: true, update: 403 },
  'acl-direct-edit': { update: true, read: true },
  'acl-role-view': { read: true, update: 403, immutableKeyParity: true },
  'acl-role-edit': { update: true, read: true, foreignOrSystemKeyGrants: false },
  'acl-broad-read': { read: true, update: 403, crossBrand: 404 },
  'acl-broad-update': { update: true, missingBaseScope: 403, crossBrand: 404 },
  'acl-none': { read: 403, update: 403, missing: 404 },
  'record-search-export': {
    listParity: true,
    searchParity: true,
    exportParity: true,
    recordAclUnchanged: true,
    solrAclUnchanged: true,
  },
  'cross-brand-record': { sameBrand: true, crossBrand: 404, missing: 404, opaque: true },
  'cross-brand-vocabulary': { sameBrand: true, crossBrand: 404, missing: 404, opaque: true },
  'cross-brand-form': { sameBrand: true, crossBrand: 404, missing: 404, opaque: true },
  'cross-brand-config': { sameBrand: true, crossBrand: 404, missing: 404, opaque: true },
  'brand-boundary': { unknown: 404, unauthorized: 404, fallback: false },
  'navigation-route-service': { grantedParity: true, deniedParity: true, unknownScopeGrants: false },
  'session-csrf': { valid: true, missing: 403, invalid: 403, rejectedWrite: false },
  'protected-quorum': {
    protectedRoles: true,
    scopeFloors: true,
    finalBrandAdmin: true,
    finalSystemAdmin: true,
    atomic: true,
    twoSystemAdmins: true,
  },
  'transaction-failure': { http: 503, partialWrite: false, restored: true },
  'audit-failure': { mutationAccepted: false, partialWrite: false, restored: true },
  'assignment-manual': {
    grant: true,
    removal: true,
    audited: true,
    otherSourcesRetained: true,
    finalSourceRemoved: true,
    drift: false,
  },
  'assignment-external': {
    grant: true,
    removal: true,
    audited: true,
    otherSourcesRetained: true,
    finalSourceRemoved: true,
    drift: false,
  },
  'assignment-onboarding': {
    grant: true,
    removal: true,
    audited: true,
    otherSourcesRetained: true,
    finalSourceRemoved: true,
    drift: false,
  },
  'assignment-recovery': {
    grant: true,
    removal: true,
    audited: true,
    otherSourcesRetained: true,
    finalSourceRemoved: true,
    drift: false,
  },
  'assignment-migration': {
    grant: true,
    removal: true,
    audited: true,
    otherSourcesRetained: true,
    finalSourceRemoved: true,
    drift: false,
  },
  'onboarding-link-claim': {
    onboarding: true,
    linking: true,
    claimReplacement: true,
    unrelatedSourcesRetained: true,
    persistedGuest: false,
  },
  websocket: { workflow: true, gates: true, deniedDisclosure: false, deniedWrite: false },
  background: { workflow: true, gates: true, missingContextGrants: false, unauthorizedWrite: false },
  'hook-integrator': {
    workflows: true,
    scopedRoutes: true,
    resourceDenials: true,
    credentials: true,
    allVariants: true,
  },
};

function smoke(instanceId: string) {
  return {
    instanceId,
    mode: 'enforce',
    buildVersion: 'reviewed-build',
    registryGeneration: 'reviewed-registry',
    rows: Object.entries(expectedSmoke).map(([id, actual]) => ({
      id,
      status: 'passed',
      actual: { ...actual },
      startedAt: new Date(NOW - 180_000).toISOString(),
      completedAt: new Date(NOW - 120_000).toISOString(),
      fixtureRef: `fixtures/${instanceId}/${id}`,
      evidence: Object.fromEntries(Object.keys(actual).map(key => [key, `probes/${instanceId}/${id}/${key}`])),
      cleanupStatus: 'passed',
      cleanupEvidenceRef: `cleanup/${instanceId}/${id}`,
    })),
  };
}

function fixture(phase = 'cutover-after') {
  const reviewed = {
    buildVersion: 'reviewed-build',
    registryGeneration: 'reviewed-registry',
    instanceIds: ['portal-a', 'portal-b'],
    readinessMaxAgeSeconds: 300,
    smokeMaxAgeSeconds: 3600,
  };
  const mode = ['before', 'isolated'].includes(phase) ? 'shadow' : 'enforce';
  const reports = [report('portal-a', mode), report('portal-b', mode)];
  const smokes = [smoke('portal-a'), smoke('portal-b')];
  const files = new Map<string, string>();
  function run() {
    assert.ok(cutover, 'The runbook must contain the executable cutover verifier.');
    const defaults = new Map([
      ['reviewed-cutover.json', JSON.stringify(reviewed)],
      ['cutover-deployment-completed-at.txt', new Date(NOW - 240_000).toISOString()],
      ...smokes.map((value): [string, string] => [`smoke/${value.instanceId}.json`, JSON.stringify(value)]),
      ['fleet.txt', reviewed.instanceIds.map(id => `${id} https://${id}/api/authorization`).join('\n')],
      ...reports.map((value, index): [string, string] => [
        `${phase}/portal-${index === 0 ? 'a' : 'b'}.json`,
        JSON.stringify(value),
      ]),
    ]);
    for (const [path, value] of files) defaults.set(path, value);
    execute(cutover, defaults, phase);
  }
  return { reviewed, reports, smokes, files, run };
}

function execute(source: string, files: ReadonlyMap<string, string>, phase?: string) {
  new Script(source).runInNewContext({
    require: (name: string) => {
      if (name === 'node:assert/strict') return assert;
      assert.equal(name, 'node:fs');
      return {
        readFileSync: (path: string) => {
          const value = files.get(path.replace('/evidence/', ''));
          assert.notEqual(value, undefined, `Missing evidence: ${path}`);
          return value;
        },
      };
    },
    process: { argv: ['node', 'verifier.cjs', '/evidence', phase] },
    URL,
    Date: { now: () => NOW, parse: Date.parse },
    console: { log: () => undefined },
  });
}

describe('Authorization rollout runbook', function () {
  it('keeps every shell fence, JavaScript fence and embedded Node verifier syntactically valid', function () {
    assert.ok(fences.length > 0);
    assert.equal(nodeBlocks.length, 3);
    for (const [, language, source] of fences) {
      if (language === 'javascript') {
        assert.doesNotThrow(() => new Script(source));
      } else {
        const checked = spawnSync('bash', ['-n'], { input: source, encoding: 'utf8' });
        assert.ifError(checked.error);
        assert.equal(checked.status, 0, checked.stderr);
      }
    }
    for (const [, , source] of nodeBlocks) assert.doesNotThrow(() => new Script(source));
  });

  for (const phase of ['before', 'isolated', 'cutover-after', 'before-admission']) {
    it(`accepts current matching readiness for the entire reviewed fleet at ${phase}`, function () {
      assert.doesNotThrow(() => fixture(phase).run());
    });
  }

  it('enumerates exactly the independent mandatory smoke contract in the operator matrix', function () {
    const matrixSection = runbook.split('### Mandatory Phase 15.1 smoke matrix and evidence')[1]?.split('\n## ')[0];
    assert.ok(matrixSection, 'The mandatory operator matrix must be present.');
    const documented = [...matrixSection.matchAll(/^\| `([a-z-]+)`\s*\|/gm)].map(match => match[1]);
    assert.deepEqual(documented.sort(), Object.keys(expectedSmoke).sort());
  });

  for (const instance of [0, 1]) {
    for (const id of Object.keys(expectedSmoke)) {
      it(`blocks admission when ${id} is missing on member ${instance + 1}`, function () {
        const state = fixture('before-admission');
        state.smokes[instance].rows = state.smokes[instance].rows.filter(row => row.id !== id);
        assert.throws(state.run, /incomplete\/duplicate smoke matrix/);
      });
    }
  }

  for (const id of Object.keys(expectedSmoke)) {
    it(`requires every ${id} sub-result and evidence even with a passed status`, function () {
      for (const key of Object.keys(expectedSmoke[id])) {
        for (const defect of [
          'missing outcome',
          'failed outcome',
          'wrong type',
          'missing evidence',
          'empty evidence',
        ]) {
          const state = fixture('before-admission');
          const row = state.smokes[1].rows.find(candidate => candidate.id === id);
          assert.ok(row);
          if (defect === 'missing outcome') delete row.actual[key];
          if (defect === 'failed outcome') {
            const expected = row.actual[key];
            row.actual[key] = typeof expected === 'boolean' ? !expected : expected + 1;
          }
          if (defect === 'wrong type') Reflect.set(row.actual, key, String(row.actual[key]));
          if (defect === 'missing evidence') delete row.evidence[key];
          if (defect === 'empty evidence') row.evidence[key] = ' ';
          assert.throws(state.run, `${id}/${key}: ${defect}`);
        }
      }
    });

    it(`rejects skipped/failed/incomplete ${id} and cleanup`, function () {
      for (const field of ['status', 'cleanupStatus'] as const) {
        for (const value of ['failed', 'skipped', 'not-run', 'not-applicable', '']) {
          const state = fixture('before-admission');
          const row = state.smokes[1].rows.find(candidate => candidate.id === id);
          assert.ok(row);
          row[field] = value;
          assert.throws(state.run);
        }
      }
    });
  }

  it('requires a complete smoke manifest for every member, even when readiness passes', function () {
    const missing = fixture('before-admission');
    missing.smokes.pop();
    assert.throws(missing.run, /Missing evidence/);
    for (const contents of ['{', '{}', 'null', '{"rows":[]}']) {
      const state = fixture('before-admission');
      state.files.set('smoke/portal-b.json', contents);
      assert.throws(state.run);
    }
  });

  it('rejects duplicate/unknown rows and aggregate-only results', function () {
    for (const defect of ['duplicate', 'unknown', 'aggregate']) {
      const state = fixture('before-admission');
      const manifest = state.smokes[1];
      if (defect === 'duplicate') manifest.rows[1] = manifest.rows[0];
      if (defect === 'unknown') manifest.rows[0].id = 'generic-smoke';
      if (defect === 'aggregate') {
        Reflect.deleteProperty(manifest, 'rows');
        Reflect.set(manifest, 'passed', true);
      }
      assert.throws(state.run);
    }
  });

  it('binds smoke to the reviewed member, mode, build and registry', function () {
    for (const [field, value] of [
      ['instanceId', 'portal-a'],
      ['mode', 'shadow'],
      ['mode', 'legacy'],
      ['buildVersion', 'old-build'],
      ['registryGeneration', 'old-registry'],
    ]) {
      const state = fixture('before-admission');
      Reflect.set(state.smokes[1], field, value);
      // Preserve the expected filename to exercise manifest identity, not a missing-file rejection.
      state.files.set('smoke/portal-b.json', JSON.stringify(state.smokes[1]));
      assert.throws(state.run);
    }
  });

  it('requires fresh ordered probe/cleanup timing after cutover and before admission readiness', function () {
    for (const patch of [
      { startedAt: new Date(NOW - 240_001).toISOString() },
      { startedAt: new Date(NOW - 100_000).toISOString() },
      { startedAt: 'invalid' },
      { completedAt: 'invalid' },
      { completedAt: new Date(NOW - 59_999).toISOString() },
      { completedAt: new Date(NOW + 1).toISOString() },
    ]) {
      const state = fixture('before-admission');
      Object.assign(state.smokes[1].rows[0], patch);
      assert.throws(state.run, /stale\/invalid smoke timing/);
    }
    const stale = fixture('before-admission');
    stale.reviewed.smokeMaxAgeSeconds = 179;
    assert.throws(stale.run, /stale\/invalid smoke timing/);
    const boundary = fixture('before-admission');
    boundary.reviewed.smokeMaxAgeSeconds = 180;
    assert.doesNotThrow(boundary.run);
    for (const completed of ['', 'invalid', new Date(NOW + 1).toISOString()]) {
      const state = fixture('before-admission');
      state.files.set('cutover-deployment-completed-at.txt', completed);
      assert.throws(state.run, /Invalid cutover completion time/);
    }
  });

  it('requires fixture and cleanup evidence and rejects extra or missing outcome maps', function () {
    for (const field of ['fixtureRef', 'cleanupEvidenceRef', 'evidence', 'actual', 'status', 'cleanupStatus']) {
      const missing = fixture('before-admission');
      Reflect.deleteProperty(missing.smokes[1].rows[0], field);
      assert.throws(missing.run);
      const empty = fixture('before-admission');
      Reflect.set(empty.smokes[1].rows[0], field, ' ');
      assert.throws(empty.run);
    }
    for (const field of ['actual', 'evidence'] as const) {
      const state = fixture('before-admission');
      Reflect.set(state.smokes[1].rows[0][field], 'unreviewedProbe', true);
      assert.throws(state.run);
    }
  });

  it('accepts reordered complete rows/evidence without relaxing readiness at admission', function () {
    const reordered = fixture('before-admission');
    reordered.smokes.reverse();
    for (const manifest of reordered.smokes) {
      manifest.rows.reverse();
      for (const row of manifest.rows) row.evidence = Object.fromEntries(Object.entries(row.evidence).reverse());
    }
    assert.doesNotThrow(reordered.run);
    const blocked = fixture('before-admission');
    blocked.reports[1].blockers.push({ code: 'new-blocker' });
    assert.throws(blocked.run);
  });

  const invalidReports: ReadonlyArray<readonly [string, (value: ReturnType<typeof report>) => void]> = [
    [
      'legacy member',
      value => {
        value.mode = 'legacy';
      },
    ],
    [
      'shadow member',
      value => {
        value.mode = 'shadow';
      },
    ],
    [
      'wrong instance',
      value => {
        value.deploymentIdentity.instanceId = 'portal-other';
      },
    ],
    [
      'incomplete identity',
      value => {
        value.deploymentIdentity.complete = false;
      },
    ],
    [
      'wrong build',
      value => {
        value.deploymentIdentity.buildVersion = 'old-build';
      },
    ],
    [
      'wrong registry',
      value => {
        value.registry.generation = 'old-registry';
      },
    ],
    [
      'not ready',
      value => {
        value.readyForEnforce = false;
      },
    ],
    [
      'blocker despite ready flag',
      value => {
        value.blockers.push({ code: 'blocked' });
      },
    ],
    [
      'unfinished migration',
      value => {
        value.migration.completed = false;
      },
    ],
    [
      'truncated drift',
      value => {
        value.migration.driftTruncated = true;
      },
    ],
    [
      'migration blocker',
      value => {
        value.migration.blockerCount = 1;
      },
    ],
    [
      'unavailable transactions',
      value => {
        value.transactions.available = false;
      },
    ],
    [
      'invalid routes',
      value => {
        value.routes.valid = false;
      },
    ],
    [
      'orphaned scope',
      value => {
        value.registry.orphanedScopeCount = 1;
      },
    ],
    [
      'missing brand administrator',
      value => {
        value.administrators.brandsWithoutAdministratorCount = 1;
      },
    ],
    [
      'insufficient system administrators',
      value => {
        value.administrators.systemAdministratorCount = 1;
      },
    ],
    [
      'incomplete exposure',
      value => {
        value.rollbackExposure.complete = false;
      },
    ],
    [
      'stale report',
      value => {
        value.generatedAt = new Date(NOW - 300_001).toISOString();
      },
    ],
    [
      'future report',
      value => {
        value.generatedAt = new Date(NOW + 1).toISOString();
      },
    ],
    [
      'invalid report time',
      value => {
        value.generatedAt = 'invalid';
      },
    ],
  ];
  for (const [name, mutate] of invalidReports) {
    it(`rejects a ${name} even when the other member is healthy`, function () {
      const state = fixture();
      mutate(state.reports[1]);
      assert.throws(state.run);
    });
  }

  it('rejects enforce mode before the approved isolated deployment', function () {
    const state = fixture('isolated');
    state.reports[1].mode = 'enforce';
    assert.throws(state.run);
  });

  it('rejects unknown checkpoints', function () {
    assert.throws(() => fixture('after').run());
  });

  for (const [name, fleet] of [
    ['empty fleet', ''],
    ['missing member', 'portal-a https://portal-a/api/authorization'],
    ['duplicate member', 'portal-a https://portal-a/api/authorization\nportal-a https://portal-a/api/authorization'],
    ['unreviewed member', 'portal-a https://portal-a/api/authorization\nportal-c https://portal-c/api/authorization'],
    ['malformed entry', '../portal-a https://portal-a/api/authorization'],
    ['missing endpoint', 'portal-a'],
  ]) {
    it(`rejects an ${name}`, function () {
      const state = fixture();
      state.files.set('fleet.txt', fleet);
      assert.throws(state.run);
    });
  }

  it('rejects missing and malformed reports', function () {
    const missing = fixture();
    missing.reports.pop();
    assert.throws(missing.run, /Missing evidence/);
    const malformed = fixture();
    malformed.files.set('cutover-after/portal-b.json', '{');
    assert.throws(malformed.run);
  });

  it('rejects a uniformly wrong build or registry instead of treating agreement as approval', function () {
    for (const key of ['buildVersion', 'registryGeneration'] as const) {
      const state = fixture();
      state.reviewed[key] = 'different-approved-value';
      assert.throws(state.run);
    }
  });

  it('rejects invalid review identity, inventory and freshness budgets', function () {
    for (const patch of [
      { buildVersion: '' },
      { registryGeneration: ' ' },
      { instanceIds: [] },
      { instanceIds: ['portal-a', 'portal-a'] },
      { instanceIds: ['../portal-a'] },
      { readinessMaxAgeSeconds: 0 },
      { readinessMaxAgeSeconds: -1 },
      { readinessMaxAgeSeconds: 1.5 },
      { smokeMaxAgeSeconds: 0 },
      { smokeMaxAgeSeconds: -1 },
      { smokeMaxAgeSeconds: 1.5 },
    ]) {
      const state = fixture();
      Object.assign(state.reviewed, patch);
      assert.throws(state.run);
    }
  });

  it('preserves rollback verification and rejects mixed modes or incomplete exposure', function () {
    assert.ok(rollback);
    const after = report('portal-a', 'legacy');
    const files = new Map([
      ['fleet.txt', 'portal-a https://portal-a/api/authorization'],
      ['before/portal-a.json', JSON.stringify(report('portal-a'))],
      ['after/portal-a.json', JSON.stringify(after)],
    ]);
    assert.doesNotThrow(() => execute(rollback, files));
    after.mode = 'enforce';
    files.set('after/portal-a.json', JSON.stringify(after));
    assert.throws(() => execute(rollback, files));
    after.mode = 'legacy';
    after.rollbackExposure.complete = false;
    files.set('after/portal-a.json', JSON.stringify(after));
    assert.throws(() => execute(rollback, files));
  });

  it('preserves rollback timing verification and rejects reversed timestamps', function () {
    assert.ok(timing);
    const files = new Map([
      ['rollback-started-at.txt', '2026-09-08T11:00:00Z'],
      ['fleet-verified-at.txt', '2026-09-08T11:05:00Z'],
      ['observation-completed-at.txt', '2026-09-08T11:20:00Z'],
    ]);
    assert.doesNotThrow(() => execute(timing, files));
    files.set('observation-completed-at.txt', '2026-09-08T11:01:00Z');
    assert.throws(() => execute(timing, files), /Invalid rollback timestamps/);
  });
});
