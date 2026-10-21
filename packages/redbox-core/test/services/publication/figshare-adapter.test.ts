import assert from 'node:assert/strict';
import { Services as PublicationServices } from '../../../src/services/PublicationService';
import { Services as FigshareServices } from '../../../src/services/FigshareService';
import { PublicationPublishing } from '../../../src/configmodels/PublicationPublishing';
import type { PublicationConfigurationContext } from '../../../src/services/publication/configuration';
import {
  decodeFigshareProviderState,
  emptyFigshareEvidence,
  figshareJson,
} from '../../../src/services/figshare-v2/publication-state';
import { figshareDestinationConfiguration } from '../../../src/services/figshare-v2/publication-config';
import { createFigsharePublicationProvider } from '../../../src/services/figshare-v2/publication-adapter';
import { apiNamespace } from '../../../src/services/figshare-v2/identity';
import type { StorageService } from '../../../src/StorageService';
import {
  prepareFigshareSource,
  describeFigshareSource,
  resolveSealedFigshareCrosswalk,
} from '../../../src/services/figshare-v2/publication-source';

describe('Figshare publication contracts (PUB-09)', () => {
  it('registers executable built-in adapters while processing remains disabled', () => {
    const service = new PublicationServices.Publication();
    assert.equal(service.getProviders().find(provider => provider.id === 'figshare')?.executionAvailable, true);
    assert.equal(service.getProviders().find(provider => provider.id === 'oni')?.executionAvailable, true);
    assert.equal(new PublicationPublishing().processing.enabled, false);
  });
  it('PUB-13 describes publication/access observations without resolving credentials or making provider calls', () => {
    const provider = createFigsharePublicationProvider(() => {
      throw new Error('Status must not create a provider client');
    });
    const legacy = emptyFigshareEvidence('oid', 'brand');
    legacy.binding = {
      namespace: 'https://api.example/v2',
      accountId: 'secret-account',
      ownerId: 'private-owner',
      articleId: '51',
    };
    legacy.publication = 'published';
    legacy.embargoed = true;
    const observed = provider.summariseStatus!(figshareJson({ legacy }));
    assert.deepEqual(observed, {
      deposit: 'confirmed',
      publication: 'published',
      ingestion: 'not_required',
      visibility: 'verified',
      accessible: false,
      embargoed: true,
    });
    legacy.publication = 'private';
    assert.equal(provider.summariseStatus!(figshareJson({ legacy })).visibility, 'unverified');
  });
  it('upgrades the complete original row without dropping receipts, uncertainty, audit or correction evidence', () => {
    const legacy = emptyFigshareEvidence('oid', 'brand');
    legacy.binding = { namespace: 'https://api.test/v2', accountId: '1', ownerId: '101', articleId: '51' };
    legacy.create = {
      token: 'exact-token',
      binding: { ...legacy.binding },
      startedAt: '2026-10-19',
      outcome: 'uncertain',
      error: 'retained',
    };
    legacy.publish = {
      generation: 4,
      hash: 'actual-custom-payload',
      previousVersion: 2,
      outcome: 'uncertain',
      submittedAt: '2026-10-19',
    };
    legacy.receipts = [
      {
        key: 'receipt',
        localId: 'local',
        digest: 'sha',
        md5: 'md5',
        size: 3,
        name: 'a.csv',
        articleId: '51',
        fileId: '70',
        kind: 'hosted',
        state: 'uploading',
        desired: true,
      },
    ];
    legacy.corrections = [{ at: '2026-10-19', actor: 'admin', action: 'bind-file' }];
    const original = figshareJson({ ...legacy, unknownRecoveryEvidence: { mustRemain: true } });
    const migrated = decodeFigshareProviderState(original, 1);
    assert.deepEqual(migrated.legacy, original);
    assert.deepEqual(decodeFigshareProviderState(migrated, 2), migrated);
    assert.deepEqual(original.unknownRecoveryEvidence, { mustRemain: true });
  });
  it('rejects malformed/future state and conflicting identities without modifying evidence', () => {
    const provider = createFigsharePublicationProvider(() =>
      new FigshareServices.FigshareService().publicationAdapterHooks()
    );
    const state = figshareJson({
      legacy: { ...emptyFigshareEvidence('oid', 'brand'), receipts: [{ state: 'available' }] },
    });
    const copy = structuredClone(state);
    assert.equal(provider.decodeState(state, 2).valid, false);
    assert.equal(provider.upgradeState(state, 3).valid, false);
    assert.deepEqual(state, copy);
    const legacy = emptyFigshareEvidence('oid', 'brand');
    for (const checkpoint of [{ changedPayloadApproval: 1 }, { assetsBaseline: [] }, { cleanupProjection: false }])
      assert.equal(provider.decodeState(figshareJson({ legacy, ...checkpoint }), 2).valid, false);
    legacy.binding = { namespace: 'api', accountId: '1', ownerId: '1', articleId: '51' };
    legacy.articleId = '99';
    assert.throws(() => decodeFigshareProviderState(figshareJson(legacy), 1), /Conflicting/);
  });
  it('resolves provider configuration independently of legacy AppConfig and preserves provider payload defaults', () => {
    const config = figshareDestinationConfiguration({
      connection: { baseUrl: 'https://api.test/v2', token: 'current' },
      mapping: { metadata: { title: { kind: 'path', path: 'metadata.custom' } } },
      attachments: {},
      providerOptions: {},
      writeBack: { articleId: 'metadata.destination_id', articleUrls: ['metadata.destination_url'] },
    });
    assert.equal(config.record.articleIdPath, 'metadata.destination_id');
    assert.equal(config.writeBack.articleId, 'metadata.destination_id');
    assert.deepEqual(config.metadata.title, { kind: 'path', path: 'metadata.custom', defaultValue: '' });
    assert.equal(config.article.publishMode, 'afterUploadsComplete');
    assert.equal(config.workflow.transitionJob.enabled, false);
    config.connection.baseUrl = 'https://API.TEST:443/v2/';
    assert.equal(apiNamespace(config), 'https://api.test/v2');
  });
  it('selects only backend migration assignments, including when another Figshare destination appears first', async () => {
    const names = ['RecordsService', 'BrandingService', 'PublicationSync'];
    const old = names.map(name => Reflect.get(globalThis, name));
    const configuration = new PublicationPublishing();
    const destination = {
      provider: 'figshare',
      displayName: 'Figshare',
      enabled: false,
      archived: false,
      connection: {},
      mapping: {},
      attachments: {},
      writeBack: {},
      providerOptions: {},
    };
    configuration.destinations = { first: destination, original: { ...destination } };
    const storage = { getMeta: async () => ({ metaMetadata: { brandId: 'brand' } }) };
    const wakes: string[][] = [];
    let authority: PublicationConfigurationContext = {
      authority: 'shared',
      legacyDestinations: { figshare: ['original'] },
    };
    class Routed extends PublicationServices.Publication {
      protected override async sourceConfigurationContext(_brandId: string, _storage: StorageService) {
        return authority;
      }
      override getConfiguration() {
        return configuration;
      }
      override async wakeRecord(brandId: string, oid: string) {
        wakes.push([brandId, oid]);
      }
    }
    Reflect.set(globalThis, 'PublicationSync', {
      getDatastore: () => ({
        manager: {
          collection: () => ({ find: () => ({ limit: () => ({ toArray: async () => [] }), toArray: async () => [] }) }),
        },
      }),
    });
    Reflect.set(globalThis, 'RecordsService', { getPublicationStorage: () => storage });
    Reflect.set(globalThis, 'BrandingService', { getBrandById: () => ({ name: 'brand' }) });
    try {
      const service = new Routed();
      assert.equal(await service.forwardLegacyProviderJob('figshare', 'oid', 'brand'), true);
      assert.deepEqual(wakes, [['brand', 'oid']]);
      await assert.rejects(service.forwardLegacyProviderJob('figshare', 'oid', 'wrong'), /brand mismatch/);
      authority = { authority: 'shared' };
      await assert.rejects(service.forwardLegacyProviderJob('figshare', 'oid'), /missing or ambiguous/);
      authority = { authority: 'shared', legacyDestinations: { figshare: ['first', 'original'] } };
      await assert.rejects(service.forwardLegacyProviderJob('figshare', 'oid'), /ambiguous/);
      authority = { authority: 'preparing' };
      await assert.rejects(service.forwardLegacyProviderJob('figshare', 'oid'), /cutover/);
      authority = { authority: 'legacy' };
      assert.equal(await service.forwardLegacyProviderJob('figshare', 'oid'), false);
    } finally {
      names.forEach((name, index) =>
        old[index] === undefined ? Reflect.deleteProperty(globalThis, name) : Reflect.set(globalThis, name, old[index])
      );
    }
  });
  it('forwards a legacy job using only provider/OID/brand, discarding queued user and article authority', async () => {
    const old = Reflect.get(globalThis, 'PublicationService');
    const calls: unknown[][] = [];
    Reflect.set(globalThis, 'PublicationService', {
      forwardLegacyProviderJob: async (...args: unknown[]) => {
        calls.push(args);
        return true;
      },
    });
    try {
      await new FigshareServices.FigshareService().syncRecordJob({
        attrs: { data: { oid: 'oid', brandId: 'brand', articleId: '999' } },
      });
      assert.deepEqual(calls, [['figshare', 'oid', 'brand', true]]);
    } finally {
      if (old === undefined) Reflect.deleteProperty(globalThis, 'PublicationService');
      else Reflect.set(globalThis, 'PublicationService', old);
    }
  });
  it('pins crosswalk revisions/results for record and contributor binding contexts without remote API calls', async () => {
    const names = ['FigshareVocabularyCrosswalk', 'FigshareVocabularyService', 'BrandingService'];
    const old = names.map(name => Reflect.get(globalThis, name));
    let revision = 3;
    const requests: unknown[] = [];
    Reflect.set(globalThis, 'BrandingService', { getBrandById: () => ({ id: 'brand', name: 'brand' }) });
    Reflect.set(globalThis, 'FigshareVocabularyCrosswalk', {
      findOne: async () => ({ status: 'approved', localVocabulary: 'local', approvedRevision: revision }),
    });
    Reflect.set(globalThis, 'FigshareVocabularyService', {
      resolveCrosswalkValues: async (request: { codes: string[] }) => {
        requests.push(request);
        return { values: [10], normalizedCodes: request.codes, unresolvedCodes: [], historicalTargets: [] };
      },
    });
    try {
      const binding = {
        kind: 'crosswalk',
        crosswalkId: 'crosswalk',
        sourceVocabularyId: 'local',
        source: { kind: 'path', path: 'metadata.codes' },
      };
      const configuration = {
        connection: {},
        mapping: {
          metadata: {
            title: { kind: 'path', path: 'metadata.title' },
            description: { kind: 'path', path: 'metadata.description' },
            license: { required: false },
            categories: { source: binding },
          },
          authors: {
            contributorPaths: ['metadata.people'],
            lookup: [{ matchBy: 'email', value: { ...binding, source: { kind: 'path', path: 'code' } } }],
          },
        },
        attachments: {},
        providerOptions: {},
        writeBack: {},
      };
      const actor = { username: 'approver', userType: 'local' };
      const input = {
        brandId: 'brand',
        oid: 'oid',
        destinationId: 'main',
        configuration: figshareJson(configuration),
        record: {
          metadata: { title: 'Title', description: 'Description', codes: ['0101'], people: [{ code: '0101' }] },
          metaMetadata: { brandId: 'brand' },
        },
        requester: actor,
        approver: actor,
        generatedValues: {},
      };
      const prepared = await prepareFigshareSource(
        input,
        new FigshareServices.FigshareService().publicationAdapterHooks()
      );
      assert.equal(requests.length, 2);
      const dependencies = describeFigshareSource(input, prepared);
      const snapshot = await dependencies.resolveCrosswalk({
        brandId: 'brand',
        crosswalkId: 'crosswalk',
        sourceVocabularyId: 'local',
      });
      assert.equal(snapshot.revisionId, '3');
      revision = 4;
      assert.deepEqual(
        (
          await resolveSealedFigshareCrosswalk(prepared, {
            brandId: 'brand',
            crosswalkId: 'crosswalk',
            sourceVocabularyId: 'local',
            codes: ['0101'],
            outputs: 'categoryId',
          })
        ).values,
        [10]
      );
      await assert.rejects(
        resolveSealedFigshareCrosswalk(prepared, {
          brandId: 'brand',
          crosswalkId: 'crosswalk',
          sourceVocabularyId: 'local',
          codes: ['different'],
          outputs: 'categoryId',
        }),
        /outside the sealed approval/
      );
      const changed = await prepareFigshareSource(
        input,
        new FigshareServices.FigshareService().publicationAdapterHooks()
      );
      assert.notDeepEqual(changed, prepared);
    } finally {
      names.forEach((name, index) =>
        old[index] === undefined ? Reflect.deleteProperty(globalThis, name) : Reflect.set(globalThis, name, old[index])
      );
    }
  });
});
