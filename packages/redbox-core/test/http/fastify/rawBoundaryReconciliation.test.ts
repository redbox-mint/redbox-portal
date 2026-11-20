import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const directory = path.resolve(__dirname, '../../../../../support/specs/fastify-migration/evidence');
const { inventory, profiles } = require(path.join(directory, 'reconcile-FM-036.cjs'));
const evidence = () => JSON.parse(readFileSync(path.join(directory, 'FM-036.raw-boundaries.json'), 'utf8'));
// All assertions inspect the same source snapshot. Mutation controls run in
// isolated child processes; rereading every source for each fixture adds no
// coverage and retains large temporary strings during the complete core run.
let suiteInventory: ReturnType<typeof inventory> | undefined;
const currentInventory = () => (suiteInventory ??= inventory());

function runControl(name: string): void {
  const result = spawnSync(
    'timeout',
    ['--signal=TERM', '--kill-after=15', '110', process.execPath, path.join(__dirname, 'rawBoundaryControl.cjs'), name],
    { encoding: 'utf8', timeout: 130000, maxBuffer: 4 * 1024 * 1024 }
  );
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, `${name}: ${result.signal ?? ''}\n${result.stdout}\n${result.stderr}`);
}

describe('FM-036 type-checked raw boundaries', function () {
  // Each uncached scan creates one complete package TypeScript program. The
  // external command deadline also bounds negative reconciliation controls.
  this.timeout(120000);
  it('reconciles every typed site with evidence and resolves the canonical declaration symbols', () => {
    const result = currentInventory();
    assert.deepEqual(result, evidence());
    assert.equal(result.canonicalTypes.length, 24);
    for (const type of result.canonicalTypes) assert(type.declarations.length, type.type);
    assert.deepEqual(result.discoveryContract.structuralScope, [
      'packages/redbox-core/src/http/**',
      'packages/redbox-core/src/storage/**',
    ]);
    assert(
      result.discoveryContract.receiverTypeFamilies.some((type: string) => type.includes('NodeJS.ReadableStream'))
    );
    assert(result.discoveryContract.receiverTypeFamilies.some((type: string) => type.includes('EmitterLike')));
    assert.match(result.discoveryContract.typeResolution, /checker.getAwaitedType/);
    for (const type of [
      'ReadableStream',
      'WritableStream',
      'TransformStream',
      'ReadableStreamDefaultReader',
      'ReadableStreamBYOBReader',
      'WritableStreamDefaultWriter',
    ]) {
      const declarations = result.canonicalTypes
        .filter((row: any) => row.type.split('<')[0] === type)
        .flatMap((row: any) => row.declarations);
      assert(
        declarations.some((file: string) => file.endsWith('/lib.dom.d.ts')),
        type
      );
      assert(
        declarations.some((file: string) => file.endsWith('/stream/web.d.ts')),
        type
      );
    }
  });
  const fixtureFiles = evidence().scannerFixtures;
  for (const [file, fixture] of Object.entries(fixtureFiles) as [string, { cases: any[] }][]) {
    for (const testCase of fixture.cases) {
      it(`${path.basename(file)} discovers ${testCase.source}`, () => {
        const actual = currentInventory().scannerFixtures[file].cases.find(
          (candidate: { source: string }) => candidate.source === testCase.source
        );
        assert(
          actual.sites.some(
            (site: { kind: string; operation: string; receiver: string }) =>
              site.kind === testCase.expectedKind &&
              site.operation === testCase.operation &&
              (!testCase.expectedReceiver || site.receiver === testCase.expectedReceiver)
          )
        );
      });
    }
  }
  it('makes --check fail when fixture discovery loses header calls', () => runControl('headers-fixture'));
  it('rejects an unowned typed header writer outside the HTTP directory, even during generation', () =>
    runControl('header-unowned'));
  it('detects a newly added header call in an existing owner as evidence drift', () => runControl('header-drift'));
  for (const mode of ['generation', 'check'])
    it(`rejects unclassified structural HTTP and storage interfaces during ${mode}`, () =>
      runControl('interfaces-' + mode));
  it('checks every applicable family/form cell against the actual consumption receiver', () => {
    const result = currentInventory();
    const file = Object.keys(result.scannerFixtures).find((file: string) =>
      file.endsWith('/consumption-matrix.json.fixture')
    );
    assert(file !== undefined, 'The consumption-matrix scanner fixture must be present');
    const cases = result.scannerFixtures[file].cases;
    for (const cell of result.consumptionCoverage) {
      const fixture = cases.find((row: any) => row.family === cell.family && row.form === cell.form);
      if (!cell.discovered) {
        assert(cell.reason && !fixture, `${cell.family}/${cell.form}`);
        continue;
      }
      assert(
        fixture?.sites.some(
          (site: any) =>
            site.kind === fixture.expectedKind &&
            site.operation === fixture.operation &&
            site.receiver === fixture.expectedReceiver
        ),
        `${cell.family}/${cell.form}`
      );
    }
    assert.equal(new Set(result.consumptionCoverage.map((cell: any) => cell.family)).size, 20);
    assert.equal(new Set(result.consumptionCoverage.map((cell: any) => cell.form)).size, 56);
  });
  for (const mode of ['generation', 'check'])
    it(`rejects every unclassified consumption fixture during ${mode}`, () => runControl('consumption-' + mode));
  it('fails generation/check fixture validation when async iteration discovery regresses', () =>
    runControl('iteration-fixture'));
  it('owns direct promised GridFS/OCFL producers and the imported Web stream argument', () => {
    const result = currentInventory();
    for (const [file, line, kind, operation, receiver, proof] of [
      [
        'storage/GridFSDriver.ts',
        144,
        'typed-return',
        'return',
        'this.operation(() => this.openStream(key))',
        'GridFSDriver',
      ],
      ['storage/GridFSDriver.ts', 144, 'typed-return', 'arrow-return', 'this.openStream(key)', 'GridFSDriver'],
      [
        'services/oni-v2/flydriveOcflStore.ts',
        220,
        'typed-return',
        'return',
        'this.ioDisk.getStream(this.keyFor(filePath))',
        'oni-v2/flydriveOcflStore',
      ],
      ['services/oni-v2/flydriveOcflStore.ts', 296, 'typed-handoff', 'fromWeb', 'data', 'oni-v2/flydriveOcflStore'],
    ] as const) {
      const row = result.boundaries.find(
        (site: any) =>
          site.file.endsWith('/src/' + file) &&
          site.line === line &&
          site.kind === kind &&
          site.operation === operation &&
          site.receiver === receiver
      );
      assert(row, `${file}:${line} ${kind}/${operation}/${receiver}`);
      assert.equal(row.profile, 'service');
      assert(row.owner && row.tests.includes(`packages/redbox-core/test/services/${proof}.test.ts`));
      for (const test of row.tests) assert(result.proofs[test]?.cases.length, test);
    }
  });
  it('owns all current implicit stream consumers with their iteration and executable proofs', () => {
    const result = currentInventory();
    const rows = result.boundaries;
    for (const [file, line, profile] of [
      ['http/integrations/multipart.ts', 144, 'multipart'],
      ['http/fastify/parsers.ts', 84, 'parser'],
      ['storage/TusStorageManagerDataStore.ts', 279, 'tus'],
      ['storage/TusStorageManagerDataStore.ts', 318, 'tus'],
      ['storage/StandardDatastream.ts', 585, 'service'],
      ['storage/StandardDatastream.ts', 882, 'service'],
      ['storage/writeGridFSStream.ts', 15, 'service'],
      ['integrations/figshare/managed-assets.ts', 97, 'service'],
      ['integrations/figshare/managed-assets.ts', 189, 'service'],
      ['integrations/figshare/managed-assets.ts', 329, 'service'],
    ] as const) {
      const row = rows.find(
        (site: any) =>
          site.file.endsWith('/src/' + file) &&
          site.line === line &&
          site.kind === 'typed-iteration' &&
          site.operation === 'for-await'
      );
      assert(row, `${file}:${line}`);
      assert.equal(row.profile, profile);
      assert(row.owner && row.tests.length && row.tests.every((proof: string) => result.proofs[proof]?.cases.length));
    }
  });
  it('owns all nine interface-typed review sites with their actual operation and executable proof', () => {
    const result = currentInventory();
    const rows = result.boundaries;
    for (const [file, line, operation, profile, proof] of [
      ['http/integrations/companion/uploads.ts', 115, 'on', 'companion', 'test/http/fastify/companionMongo.test.ts'],
      [
        'http/integrations/companion/uploads.ts',
        221,
        'removeListener',
        'companion',
        'test/http/fastify/companionMongo.test.ts',
      ],
      ['http/integrations/companion/uploads.ts', 226, 'on', 'companion', 'test/http/fastify/companionMongo.test.ts'],
      [
        'http/integrations/companion/uploads.ts',
        280,
        'removeListener',
        'companion',
        'test/http/CompanionLifecycleProbe.test.ts',
      ],
      ['storage/GridFSDriver.ts', 502, 'on', 'service', 'test/services/GridFSDriver.test.ts'],
      ['storage/GridFSDriver.ts', 509, 'once', 'service', 'test/services/GridFSDriver.test.ts'],
      ['storage/GridFSDriver.ts', 510, 'once', 'service', 'test/services/GridFSDriver.test.ts'],
    ] as const) {
      const row = rows.find(
        (site: any) =>
          site.file.endsWith('/src/' + file) &&
          site.line === line &&
          site.operation === operation &&
          site.kind === 'typed-call'
      );
      assert(row, `${file}:${line} ${operation}`);
      assert.equal(row.profile, profile);
      assert(row.owner && row.tests.includes('packages/redbox-core/' + proof));
      assert(result.proofs['packages/redbox-core/' + proof]?.cases.length);
    }
  });
  it('includes all review-identified operations as actual calls, not nearby references', () => {
    const rows = currentInventory().boundaries;
    for (const [file, line, operation] of [
      ['http/fastify/resumableUploads.ts', 86, 'setHeader'],
      ['http/integrations/companion/fastify.ts', 113, 'setHeader'],
      ['http/integrations/companion/fastify.ts', 134, 'setHeader'],
      ['http/integrations/progressSockets.ts', 196, 'disconnect'],
      ['http/integrations/progressSockets.ts', 329, 'disconnectSockets'],
      ['http/integrations/progressSockets.ts', 330, 'close'],
      ['http/integrations/progressSockets.ts', 331, 'close'],
      ['http/fastify/routes.ts', 970, 'cancel'],
      ['http/integrations/progressSockets.ts', 145, 'call'],
      ['http/integrations/progressSockets.ts', 164, 'prependListener'],
      ['http/integrations/progressSockets.ts', 192, 'on'],
      ['http/integrations/companion/uploads.ts', 174, 'set'],
      ['http/integrations/companion/uploads.ts', 213, 'setTimeout'],
      ['http/integrations/companion/uploads.ts', 245, 'setTimeout'],
      ['http/integrations/multipart.ts', 82, 'unpipe'],
      ['http/integrations/multipart.ts', 83, 'resume'],
      ['http/integrations/multipart.ts', 84, 'destroy'],
      ['http/integrations/multipart.ts', 85, 'destroy'],
      ['http/fastify/parsers.ts', 63, 'destroy'],
      ['http/fastify/parsers.ts', 117, 'destroy'],
      ['http/fastify/readStreams.ts', 53, 'destroy'],
      ['http/fastify/readStreams.ts', 54, 'destroy'],
      ['http/fastify/readStreams.ts', 74, 'pipe'],
      ['utilities/withTimeout.ts', 8, 'setTimeout'],
    ] as const)
      assert(
        rows.some(
          (row: any) =>
            row.file.endsWith('/src/' + file) &&
            row.line === line &&
            row.operation === operation &&
            row.kind !== 'typed-reference'
        ),
        `${file}:${line} ${operation}`
      );
  });
  it('keeps HTTP cancellation/session ownership distinct from upgrades and native response completion', () => {
    const rows = currentInventory().boundaries.filter((row: any) => row.file.endsWith('/companion/uploads.ts'));
    const http = rows.find((row: any) => row.line === 272 && row.kind === 'typed-call');
    const upgrade = rows.find((row: any) => row.line === 271 && row.kind === 'typed-call');
    assert.equal(http.profile, 'companionHttpCancellation');
    assert.deepEqual(http.bypassed, ['onSend', 'onError']);
    assert.match(http.restoration.session, /retainHttpCallback/);
    assert.match(http.restoration.session, /session commits/);
    assert.match(http.restoration.observation, /finish\/error only/);
    assert.match(http.restoration.observation, /premature socket closure does not imply response completion/);
    assert.match(http.restoration.drain, /requests.values/);
    assert.match(http.restoration.upgrade, /Not an upgrade/);
    assert.equal(upgrade.profile, 'companionUpgrade');
    for (const row of rows.filter(
      (site: any) => site.scopes.includes('handle') || site.scopes.includes('retainTransfer')
    ))
      assert.equal(row.profile, 'companion', row.call);
    for (const row of currentInventory().boundaries.filter((site: any) =>
      site.file.endsWith('/fastify/errorBoundary.ts')
    ))
      assert.equal(row.profile, row.socketTarget ? 'socketError' : 'error');
  });
  it('assigns every discovered site exactly one owner and executable proofs, after Express retirement', () => {
    const result = currentInventory();
    const all = result.boundaries;
    assert.deepEqual(new Set(all.map((row: any) => row.profile)), new Set(Object.keys(profiles)));
    for (const row of all) {
      assert(row.owner && row.file && row.line && row.tests.length);
      for (const concern of ['hooks', 'session', 'observation', 'drain', 'security', 'upgrade'])
        assert.equal(typeof row.restoration[concern], 'string');
      for (const proof of row.tests) assert(result.proofs[proof]?.cases.length, proof);
      assert(Array.isArray(row.bypassed));
    }
  });
});
