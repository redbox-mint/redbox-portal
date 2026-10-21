import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import {
  PublicationStaging,
  publicationStagingReferences,
  type PublicationAttachmentSource,
} from '../../../src/services/publication/staging';
import {
  allocatePublicationGeneratedValues,
  publicationMaterialConfiguration,
  sealPublicationSource,
  reopenPublicationSource,
  publicationInputReferences,
  type PublicationPreparationInput,
} from '../../../src/services/publication/source';
import { canonicalPublicationJson, publicationDigest, byteDigest } from '../../../src/services/publication/canonical';
import { isPublicationObject } from '../../../src/services/publication/builtins';
import { configuredDestination, reviewProvider, testRegistry } from '../../fixtures/publication/provider';
import { baselineOni, baselineRecord } from '../../fixtures/publication/baseline';
import { buildOniRoCrate } from '../../../src/services/oni-v2/crate';
import { evaluateBinding as figshareBinding } from '../../../src/services/figshare-v2/bindings';
import { evaluateBinding as oniBinding } from '../../../src/services/oni-v2/bindings';
import type { PublicationObject, PublicationSourceReference } from '../../../src/services/publication/contracts';

function jsonObject(value: object): PublicationObject {
  return JSON.parse(JSON.stringify(value));
}
describe('Shared bindings and sealed publication inputs (PUB-04)', function () {
  this.timeout(10000);
  let directory: string;
  let disk: Disk;
  let staging: PublicationStaging;
  function input(): PublicationPreparationInput {
    return {
      brandId: 'brand',
      oid: 'record',
      requestId: 'request-1',
      sourceRevision: 1,
      record: { metadata: { title: 'Dataset', status: 'pending' }, workflow: { stage: 'queued' }, recordVersion: 1 },
      maintenancePaths: ['metadata.status', 'metadata.url'],
      relatedInputs: { creator: { brandId: 'brand', id: 'person', version: 'v1', value: { name: 'Creator' } } },
      destinations: [
        {
          id: 'main',
          provider: reviewProvider,
          configuration: configuredDestination(),
          targetFingerprint: 'verified-target',
          mappingContextVersion: 1,
          managedFields: ['title'],
        },
      ],
      attachments: [],
      generatedValues: allocatePublicationGeneratedValues(undefined, () => new Date('2026-02-03T04:05:06Z')),
      resolveCrosswalk: async request => ({
        ...request,
        revisionId: 'approved-v1',
        value: { targets: [10, 20], labels: ['A', 'B'] },
      }),
    };
  }
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'publication-inputs-'));
    disk = new Disk(new FSDriver({ location: directory, visibility: 'private' }));
    staging = new PublicationStaging('durable-publication', disk);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  it('canonicalises object keys while preserving output-significant array order and rejecting non-JSON values', () => {
    assert.equal(
      publicationDigest({ z: 1, a: { y: false, b: [1, 'x'] } }),
      publicationDigest({ a: { b: [1, 'x'], y: false }, z: 1 })
    );
    assert.notEqual(publicationDigest([1, 2]), publicationDigest([2, 1]));
    const cycle: { self?: object } = {};
    cycle.self = cycle;
    for (const invalid of [undefined, NaN, Infinity, { absent: undefined }, new Date(), cycle, Array(2)])
      assert.throws(() => canonicalPublicationJson(invalid));
  });
  it('preserves provider-specific null/default/empty-string and escaping semantics through shared primitives', async () => {
    const target = { metadata: { nil: null, empty: '', zero: 0, text: '<a>&b', values: ['x', 'y'] } };
    assert.equal(
      await figshareBinding({ kind: 'path', path: 'metadata.nil', defaultValue: 'fallback' }, target),
      'fallback'
    );
    assert.equal(await oniBinding({ kind: 'path', path: 'metadata.nil', defaultValue: 'fallback' }, target), null);
    for (const evaluate of [figshareBinding, oniBinding]) {
      assert.equal(await evaluate({ kind: 'path', path: 'metadata.empty', defaultValue: 'fallback' }, target), '');
      assert.equal(await evaluate({ kind: 'path', path: 'metadata.zero', defaultValue: 9 }, target), 0);
      assert.equal(
        await evaluate({ kind: 'handlebars', template: '{{missing}}', defaultValue: 'fallback' }, target),
        'fallback'
      );
      assert.deepEqual(
        Array.from((await evaluate({ kind: 'jsonata', expression: 'metadata.values' }, target)) as string[]),
        ['x', 'y']
      );
      await assert.rejects(
        evaluate({ kind: 'handlebars', template: '{{#each metadata.values}}{{this}}{{/each}}' }, target),
        /Unsupported/
      );
      await assert.rejects(
        evaluate({ kind: 'handlebars', template: '{{lookup metadata "text"}}' }, target),
        /Unsupported/
      );
    }
    assert.equal(
      await figshareBinding({ kind: 'handlebars', template: '{{metadata.text}}' }, target),
      '&lt;a&gt;&amp;b'
    );
    assert.equal(await oniBinding({ kind: 'handlebars', template: '{{metadata.text}}' }, target), '<a>&b');
    assert.equal(await figshareBinding({ kind: 'path', path: 'name' }, { name: 'Contributor' }), 'Contributor');
  });
  it('reopens immutable source snapshots through an independently constructed worker disk after restart', async () => {
    const prepared = input();
    const sealed = await sealPublicationSource(prepared, staging);
    prepared.record.metadata = { title: 'later mutation' };
    prepared.relatedInputs.creator.value.name = 'Changed';
    const worker = new PublicationStaging(
      'durable-publication',
      new Disk(new FSDriver({ location: directory, visibility: 'private' }))
    );
    const reopened = await reopenPublicationSource('brand', sealed.reference, worker);
    assert.deepEqual(reopened, sealed.descriptor);
    assert.deepEqual(reopened.metadata.metadata, { title: 'Dataset' });
    assert.deepEqual(reopened.relatedInputs.creator, { id: 'person', version: 'v1', value: { name: 'Creator' } });
  });
  it('excludes operational settings, credentials and exact maintenance writes from identity', async () => {
    const original = input();
    const a = await sealPublicationSource(original, staging);
    const maintained = input();
    maintained.record.recordVersion = 20;
    maintained.record.metadata = { title: 'Dataset', status: 'complete', url: 'https://remote.test/1' };
    maintained.destinations[0].configuration.connection = {
      apiKey: 'rotated-secret',
      endpoint: 'https://alias.test',
      account: 'same-target',
    };
    maintained.destinations[0].configuration.processing = { leaseMs: 99999 };
    const b = await sealPublicationSource(maintained, staging);
    assert.equal(a.contentDigest, b.contentDigest);
    assert.deepEqual(a.configurationDigests, b.configurationDigests);
    assert.ok(!JSON.stringify(b.descriptor).includes('rotated-secret'));
    const projected = input();
    projected.record.workflow = { stage: 'published' };
    projected.workflowProjection = { approvedStage: 'queued', expectedStage: 'published' };
    assert.equal((await sealPublicationSource(projected, staging)).contentDigest, a.contentDigest);
    projected.workflowProjection = undefined;
    assert.notEqual((await sealPublicationSource(projected, staging)).contentDigest, a.contentDigest);
  });
  it('includes relevant metadata, mapping, selection, target, adapter contract, managed fields and related people', async () => {
    const original = await sealPublicationSource(input(), staging);
    const changes: Array<(value: PublicationPreparationInput) => void> = [
      value => {
        value.record.metadata = { title: 'Edited' };
      },
      value => {
        value.destinations[0].configuration.mapping = { title: { kind: 'path', path: 'metadata.other' } };
      },
      value => {
        value.destinations[0].configuration.attachments = { selected: 'different' };
      },
      value => {
        value.destinations[0].targetFingerprint = 'different-target';
      },
      value => {
        value.destinations[0].mappingContextVersion++;
      },
      value => {
        value.destinations[0].managedFields.push('description');
      },
      value => {
        value.relatedInputs.creator.value.name = 'Different person';
      },
      value => {
        value.sourceRevision++;
      },
    ];
    for (const change of changes) {
      const changed = input();
      change(changed);
      assert.notEqual((await sealPublicationSource(changed, staging)).contentDigest, original.contentDigest);
    }
  });
  it('sorts fixed destination sets without changing attachment order', async () => {
    const prepared = input();
    prepared.destinations.push({ ...prepared.destinations[0], id: 'second' });
    const a = await sealPublicationSource(prepared, staging);
    prepared.destinations.reverse();
    assert.equal((await sealPublicationSource(prepared, staging)).contentDigest, a.contentDigest);
    assert.deepEqual(a.descriptor.destinationIds, ['main', 'second']);
  });
  it('pins approved crosswalk revisions and actual mapping snapshots once for shared destinations', async () => {
    let lookups = 0;
    let revisionId = 'approved-v1';
    const prepared = input();
    prepared.destinations[0].configuration.mapping = {
      categories: {
        kind: 'crosswalk',
        crosswalkId: 'crosswalk',
        sourceVocabularyId: 'local',
        source: { kind: 'path', path: 'metadata.codes' },
      },
    };
    prepared.destinations.push({ ...prepared.destinations[0], id: 'second' });
    prepared.resolveCrosswalk = async request => {
      lookups++;
      return { ...request, revisionId, value: { targets: [10] } };
    };
    const first = await sealPublicationSource(prepared, staging);
    assert.equal(lookups, 1);
    revisionId = 'approved-v2';
    const reopened = await reopenPublicationSource('brand', first.reference, staging);
    assert.equal(reopened.crosswalkRevisions[0].revisionId, 'approved-v1');
    assert.deepEqual(reopened.relatedInputs.crosswalks, [
      { crosswalkId: 'crosswalk', revisionId: 'approved-v1', value: { targets: [10] } },
    ]);
    const second = await sealPublicationSource(prepared, staging);
    assert.notEqual(first.contentDigest, second.contentDigest);
    assert.notEqual(first.configurationDigests.main, second.configurationDigests.main);
  });
  it('removes hook-secret wildcard paths even inside material mapping options', () => {
    const destination = input().destinations[0];
    destination.provider = { ...reviewProvider, secretPaths: ['providerOptions.accounts.*.token'] };
    destination.configuration.providerOptions = {
      accounts: { a: { token: 'private-a', flag: true }, b: { token: 'private-b' } },
    };
    assert.deepEqual(publicationMaterialConfiguration(destination).providerOptions, {
      accounts: { a: { flag: true }, b: {} },
    });
  });
  it('allocates generated values once and reproduces complete Oni output on later retries', async () => {
    const generated = allocatePublicationGeneratedValues(undefined, () => new Date('2026-02-03T04:05:06Z'));
    const reused = allocatePublicationGeneratedValues(generated, () => new Date('2030-01-01Z'));
    assert.deepEqual(reused, generated);
    const prepared = input();
    prepared.record = jsonObject(baselineRecord());
    prepared.record.metaMetadata = { ...baselineRecord().metaMetadata, brandId: 'brand' };
    prepared.generatedValues = generated;
    const sealed = await sealPublicationSource(prepared, staging);
    const build = async (reference: PublicationSourceReference) => {
      const source = await reopenPublicationSource('brand', reference, staging);
      const config = baselineOni();
      assert.equal(typeof source.generatedValues.publicationTimestamp, 'string');
      assert.ok(isPublicationObject(source.metadata.metadata));
      return buildOniRoCrate({
        config,
        site: config.sites.public,
        siteName: 'public',
        oid: 'publication-baseline',
        record: { ...source.metadata, metadata: source.metadata.metadata },
        creator: { username: 'creator', email: 'creator@example.test', text_full_name: 'Ada Lovelace' },
        approver: { username: 'approver', email: 'approver@example.test', text_full_name: 'Institutional Approver' },
        publicationTimestamp: String(source.generatedValues.publicationTimestamp),
      });
    };
    const actual = JSON.parse(JSON.stringify(await build(sealed.reference)));
    assert.deepEqual(
      actual,
      JSON.parse(readFileSync(join(__dirname, '../../fixtures/publication/oni-crate.json'), 'utf8'))
    );
    assert.deepEqual(actual, JSON.parse(JSON.stringify(await build(sealed.reference))));
  });
  it('reuses trustworthy digests and immutable versions without opening attachment streams in preflight', async () => {
    let reads = 0;
    const source: PublicationAttachmentSource = {
      id: 'file',
      logicalPath: 'data/file.csv',
      inspect: async () => ({ size: 4, digest: byteDigest(Buffer.from('data')) }),
      open: async () => {
        reads++;
        return Readable.from(['data']);
      },
    };
    const digest = await staging.prepareAttachment('brand', source);
    assert.equal(digest.digest, byteDigest(Buffer.from('data')));
    assert.equal(reads, 0);
    const version = await staging.prepareAttachment('brand', {
      ...source,
      inspect: async () => ({ size: 4, immutableVersion: 'version-1' }),
    });
    assert.equal(version.immutableVersion, 'version-1');
    assert.equal(reads, 0);
    const draft = input();
    await sealPublicationSource(draft, staging);
    assert.equal(reads, 0);
  });
  it('stages unidentified bytes once for multiple destinations and preserves them after live rewrites', async () => {
    let bytes = 'original';
    let reads = 0;
    const source: PublicationAttachmentSource = {
      id: 'file',
      logicalPath: 'data.csv',
      inspect: async () => ({ size: bytes.length, changeToken: 'v1' }),
      open: async () => {
        reads++;
        return Readable.from([bytes]);
      },
    };
    const prepared = input();
    prepared.destinations.push({ ...prepared.destinations[0], id: 'second' });
    prepared.attachments = [source];
    const sealed = await sealPublicationSource(prepared, staging);
    assert.equal(reads, 1);
    bytes = 'modified';
    const stream = await staging.openAttachment('brand', sealed.descriptor.attachments[0]);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(chunks).toString(), 'original');
    const again = input();
    again.attachments = [source];
    assert.notEqual((await sealPublicationSource(again, staging)).contentDigest, sealed.contentDigest);
  });
  it('detects attachment rewrite during staging, including same-size rewrites and stores without tokens', async () => {
    let token = 'v1';
    const source: PublicationAttachmentSource = {
      id: 'file',
      logicalPath: 'data.csv',
      inspect: async () => ({ size: 4, changeToken: token }),
      open: async () => {
        token = 'v2';
        return Readable.from(['data']);
      },
    };
    await assert.rejects(staging.prepareAttachment('brand', source), /changed during preparation/);
    let reads = 0;
    await assert.rejects(
      staging.prepareAttachment('brand', {
        ...source,
        inspect: async () => ({ size: 4 }),
        open: async () => Readable.from([++reads === 1 ? 'data' : 'edit']),
      }),
      /changed during preparation/
    );
  });
  it('verifies live digest inputs into staging before handing bytes to providers', async () => {
    const source: PublicationAttachmentSource = {
      id: 'file',
      logicalPath: 'data.csv',
      inspect: async () => ({ size: 4, digest: byteDigest(Buffer.from('data')) }),
      open: async () => Readable.from(['edit']),
    };
    const attachment = await staging.prepareAttachment('brand', source);
    await assert.rejects(staging.openAttachment('brand', attachment, source), /bytes changed/);
    let version: string | undefined;
    const immutable = await staging.prepareAttachment('brand', {
      ...source,
      inspect: async () => ({ size: 4, immutableVersion: 'v1' }),
    });
    const stream = await staging.openAttachment('brand', immutable, {
      ...source,
      open: async selected => {
        version = selected;
        return Readable.from(['data']);
      },
    });
    stream.destroy();
    assert.equal(version, 'v1');
  });
  it('rejects cross-brand input references, cross-brand snapshots, duplicate paths and tampered bytes', async () => {
    const sealed = await sealPublicationSource(input(), staging);
    await assert.rejects(reopenPublicationSource('other-brand', sealed.reference, staging), /cross-brand/);
    const foreign = input();
    foreign.relatedInputs.creator.brandId = 'other';
    await assert.rejects(sealPublicationSource(foreign, staging), /different brand/);
    const source: PublicationAttachmentSource = {
      id: 'file',
      logicalPath: '../unsafe',
      inspect: async () => ({ size: 4 }),
      open: async () => Readable.from(['data']),
    };
    await assert.rejects(staging.prepareAttachment('brand', source), /logical path/);
    const duplicate = input();
    duplicate.attachments = [
      { ...source, logicalPath: 'safe' },
      { ...source, logicalPath: 'safe' },
    ];
    await assert.rejects(sealPublicationSource(duplicate, staging), /Duplicate/);
    await disk.put(sealed.reference.key, 'tampered');
    await assert.rejects(reopenPublicationSource('brand', sealed.reference, staging), /integrity/);
  });
  it('retains source/work/recovery references and grace-period objects while cleaning abandoned inputs', async () => {
    const refs = await Promise.all(Array.from({ length: 5 }, () => staging.putJson('brand', '{}')));
    const sourceRefs = new Set([refs[0].key]);
    const workRefs = new Set([refs[1].key]);
    const recoveryRefs = new Set([refs[2].key]);
    const guard = publicationStagingReferences({
      withReferenceFence: async (_reference, run) => run(),
      source: async reference => sourceRefs.has(reference.key),
      work: async reference => workRefs.has(reference.key),
      recovery: async reference => recoveryRefs.has(reference.key),
    });
    const recent = await staging.cleanup('brand', guard, { now: Date.now(), graceMs: 60000 });
    assert.equal(recent.deleted, 0);
    const old = await staging.cleanup('brand', guard, { now: Date.now() + 120000, graceMs: 60000 });
    assert.deepEqual(old, { scanned: 5, deleted: 2, retained: 3 });
    for (const reference of refs.slice(0, 3)) await staging.verify('brand', reference);
    await assert.rejects(
      staging.cleanup(
        'brand',
        {
          deleteIfUnreferenced: async () => {
            throw new Error('Reference scan unavailable');
          },
        },
        { now: Date.now() + 120000, graceMs: 60000 }
      ),
      /Reference scan unavailable/
    );
  });
  it('retains staged bytes reachable through recovery descriptors and rejects malformed sealed shapes', async () => {
    const prepared = input();
    prepared.attachments = [
      {
        id: 'file',
        logicalPath: 'data.csv',
        inspect: async () => ({ size: 4, changeToken: 'v1' }),
        open: async () => Readable.from(['data']),
      },
    ];
    const recovery = await sealPublicationSource(prepared, staging);
    await staging.putJson('brand', '{}');
    const reachable = await publicationInputReferences('brand', [recovery.reference], staging);
    assert.equal(reachable.length, 2);
    const recoveryKeys = new Set(reachable.map(reference => reference.key));
    const guard = publicationStagingReferences({
      withReferenceFence: async (_reference, run) => run(),
      source: async () => false,
      work: async () => false,
      recovery: async reference => recoveryKeys.has(reference.key),
    });
    assert.equal((await staging.cleanup('brand', guard, { now: Date.now() + 120000, graceMs: 60000 })).deleted, 1);
    for (const reference of reachable) await staging.verify('brand', reference);
    const malformed = { ...recovery.descriptor, adapterContracts: { main: { providerId: null } } };
    const invalid = await staging.putJson('brand', canonicalPublicationJson(malformed));
    await assert.rejects(reopenPublicationSource('brand', invalid, staging), /Invalid sealed/);
  });
  it('decodes/upgrades cloned provider state and rejects unknown evidence versions', () => {
    const registry = testRegistry();
    const legacy = { journal: { uncertain: true } };
    assert.deepEqual(registry.decodeState('review-ledger', legacy, 1), {
      state: { ...legacy, upgraded: true },
      version: 2,
    });
    assert.deepEqual(legacy, { journal: { uncertain: true } });
    assert.throws(() => registry.decodeState('review-ledger', legacy, 3), /Unsupported/);
    assert.throws(() => registry.decodeState('missing', legacy, 1), /unavailable/);
  });
});
