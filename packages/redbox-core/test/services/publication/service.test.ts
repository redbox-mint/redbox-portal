import { expect } from 'chai';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { generateServiceShims, generateModelShims } from '../../../src/loader';
import { WaterlineModels } from '../../../src/waterline-models';
import { ServiceExports } from '../../../src/services';
import { ConfigModels } from '../../../src/configmodels/ConfigModels';
import { agendaQueue } from '../../../src/config/agendaQueue.config';
import { PublicationProviderRegistry } from '../../../src/services/publication/registry';
import type {
  PublicationProviderExecution,
  PublicationObject,
  PublicationApproval,
} from '../../../src/services/publication/contracts';
import { HookPublication, reviewProvider } from '../../fixtures/publication/provider';

describe('PublicationService extension and loader contracts (PUB-02)', function () {
  this.timeout(20000);
  it('exports a real service and model through the core indexes', () => {
    expect(ServiceExports).to.have.property('PublicationService');
    expect(WaterlineModels.PublicationSync.attributes).to.have.keys([
      'brandId',
      'oid',
      'destinationId',
      'schemaVersion',
      'providerId',
      'providerStateVersion',
      'providerState',
      'revision',
      'sourceGeneration',
      'sourceRevision',
      'approvalId',
      'approvalEpoch',
      'sourceDigest',
      'source',
      'recoverySources',
      'configurationDigest',
      'targetFingerprint',
      'lease',
      'dispatchUntil',
      'nextActionAt',
      'work',
      'status',
      'waitingReason',
      'retry',
      'retryEpisodes',
      'binding',
      'remoteNamespace',
      'remoteObjectId',
      'operations',
      'completion',
      'workflowPending',
      'links',
      'audit',
      'correctionReferences',
    ]);
  });
  it('registers a hook provider before freeze and includes its schema/secret metadata', () => {
    const service = new HookPublication();
    service.bootstrap();
    service.bootstrap();
    expect(service.getProviders().map(provider => provider.id)).to.deep.equal(['figshare', 'oni', 'review-ledger']);
    expect(ConfigModels.getModelInfo('publicationPublishing').secretFields).to.include(
      'destinations.*.connection.apiKey'
    );
    expect(JSON.stringify(ConfigModels.getModelInfo('publicationPublishing').schema)).to.include('review-ledger');
    const editorSchema = JSON.stringify(ConfigModels.getModelInfo('publicationPublishing').schema);
    expect(editorSchema).to.include('publication-destinations');
    expect(editorSchema).to.include('secretPaths');
    expect(editorSchema).to.include('executionAvailable');
    expect(editorSchema).to.include('capabilities');
    expect(() => service.registerLate()).to.throw('frozen');
    expect(service.exports()).not.to.have.property('registerProvider');
  });
  it('rejects duplicate IDs, unsupported contracts and unsafe secret metadata before freeze', () => {
    const registry = new PublicationProviderRegistry();
    registry.register(reviewProvider);
    expect(() => registry.register({ ...reviewProvider, stateVersion: 3 })).to.throw('Duplicate');
    expect(() => new PublicationProviderRegistry().register({ ...reviewProvider, contractVersion: 3 })).to.throw(
      'contract version'
    );
    expect(() =>
      new PublicationProviderRegistry().register({ ...reviewProvider, secretPaths: ['connection.__proto__.secret'] })
    ).to.throw('secret path');
  });
  for (const registration of ['register', 'registerDefinition'] as const)
    it(`rejects version-1 adapters at ${registration} with an actionable upgrade message`, () => {
      const registry = new PublicationProviderRegistry();
      const register = (contractVersion: number) => {
        const provider = { ...reviewProvider, contractVersion };
        if (registration === 'register') registry.register(provider);
        else registry.registerDefinition(provider);
      };
      expect(() => register(1)).to.throw(
        "Publication provider 'review-ledger' contract version 1 is unsupported; expected 2 (structured operation evidence). Update the adapter and drain older workers before deployment."
      );
      expect(registry.list()).to.deep.equal([]);
      register(2);
      expect(registry.get('review-ledger')?.contractVersion).to.equal(2);
    });
  it('enforces version 2 through the service subclass registration seam', () => {
    class OldContractHook extends HookPublication {
      protected override configureProviders(): void {
        super.configureProviders();
        this.registerProvider({ ...reviewProvider, id: 'old-hook-provider', contractVersion: 1 });
      }
    }
    expect(() => new OldContractHook().bootstrap()).to.throw(
      "Publication provider 'old-hook-provider' contract version 1 is unsupported; expected 2 (structured operation evidence). Update the adapter and drain older workers before deployment."
    );
  });
  it('narrows runtime state and prepared inputs and preserves evidence through explicit upgrades', async () => {
    const registry = new PublicationProviderRegistry();
    registry.register(reviewProvider);
    const provider = registry.get('review-ledger')!;
    const approval: PublicationApproval = {
      id: 'approval-1',
      epoch: 1,
      sourceRevision: 1,
      policy: {
        id: 'approve',
        version: 1,
        mode: 'approval',
        recordType: 'dataPublication',
        event: 'onTransition',
        destinations: ['archive'],
      },
      destinationIds: ['archive'],
      targetFingerprints: {},
      configurationDigests: {},
      source: { encodingVersion: 1, disk: 'staging', key: 'brand/source', digest: 'sha256:source' },
      requester: { username: 'requester', userType: 'local' },
      approver: { username: 'approver', userType: 'local' },
      grantedAt: '2026-01-01T00:00:00Z',
    };
    const context: PublicationProviderExecution<PublicationObject, PublicationObject, PublicationObject> = {
      brandId: 'brand-1',
      oid: 'oid-1',
      destinationId: 'archive',
      approval,
      sourceGeneration: 1,
      workKind: 'synchronise',
      source: {
        encodingVersion: 1,
        brandId: 'brand-1',
        oid: 'oid-1',
        requestId: 'request',
        sourceRevision: 1,
        metadata: {},
        relatedInputs: {},
        destinationIds: ['archive'],
        targets: {},
        materialConfiguration: {},
        crosswalkRevisions: [],
        attachments: [],
        generatedValues: {},
        adapterContracts: {},
        managedFields: {},
      },
      operations: [],
      recoverySources: [],
      recovery: false,
      configuration: { connection: { endpoint: 'https://ledger.example.test', account: 'institution-1' } },
      credentials: {},
      state: { ticket: 'preserve-me', uncertain: { operation: 'old-operation' } },
      prepared: {},
      signal: new AbortController().signal,
      async assertAuthority() {},
      async project() {
        throw new Error('This adapter contract fixture does not request a record projection');
      },
      async checkpoint() {},
      async bind() {},
      async journal() {},
      async openAttachment() {
        throw new Error('No selected attachment');
      },
      idempotencyKey: () => 'fixture-key',
      async mutate(_operation, send) {
        return send('fixture-key');
      },
      async withResourceLease(_namespace, _resource, run) {
        return run({ operations: [], async journal() {} });
      },
      async audit() {},
    };
    const outcome = await provider.execute!('reconcile', context, 1);
    expect(outcome.kind).to.equal('waiting');
    expect(outcome.state).to.deep.equal({ ...context.state, upgraded: true });
    for (const version of [0, 3]) {
      let error: unknown;
      try {
        await provider.execute!('synchronise', context, version);
      } catch (failure) {
        error = failure;
      }
      expect(error).to.be.instanceOf(Error);
    }
    const prepared = await provider.prepareSource!({
      brandId: 'brand-1',
      oid: 'oid-1',
      destinationId: 'archive',
      configuration: context.configuration,
      record: { title: 'Approved' },
      requester: approval.requester,
      approver: approval.approver,
      generatedValues: { publishedAt: 'fixed-date' },
    });
    expect(prepared).to.deep.equal({
      valid: true,
      value: { record: { title: 'Approved' }, generated: { publishedAt: 'fixed-date' } },
    });
  });
  it('generates and loads service/model shims, including a service registered by an actual hook module', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'publication-loader-'));
    try {
      const corePath = path.resolve(__dirname, '../../../src');
      const fixturePath = path.resolve(__dirname, '../../fixtures/publication/provider.ts');
      const coreDirectory = path.join(directory, 'node_modules/@researchdatabox/redbox-core');
      const hookDirectory = path.join(directory, 'node_modules/publication-test-hook');
      const serviceDirectory = path.join(directory, 'api/services');
      const modelDirectory = path.join(directory, 'api/models');
      for (const target of [coreDirectory, hookDirectory, serviceDirectory, modelDirectory])
        await fs.mkdir(target, { recursive: true });
      await fs.writeFile(
        path.join(coreDirectory, 'index.js'),
        `module.exports = require(${JSON.stringify(corePath)});`
      );
      await fs.writeFile(
        path.join(hookDirectory, 'index.js'),
        `const { HookPublication } = require(${JSON.stringify(fixturePath)});\nexports.registerRedboxServices = () => ({ PublicationService: new HookPublication().exports() });\nexports.ServiceExports = exports.registerRedboxServices();`
      );
      await generateServiceShims(serviceDirectory, {});
      await generateModelShims(modelDirectory, {});
      const requireGenerated = createRequire(path.join(directory, 'package.json'));
      const core: unknown = requireGenerated(path.join(serviceDirectory, 'PublicationService.js'));
      expect(core).to.have.property('validateConfiguration');
      for (const name of ['Publication-Dispatch', 'Publication-SyncRecord', 'Publication-StagingCleanup']) {
        const [service, method] = agendaQueue.jobs[name].fnName.split('.');
        expect(service).to.equal('publicationservice');
        expect(core).to.have.property(method).that.is.a('function');
      }
      expect(agendaQueue.jobs['Publication-Dispatch'].backend).to.equal('mongodb');
      expect(agendaQueue.jobs['Publication-StagingCleanup'].backend).to.equal('mongodb');
      expect(agendaQueue.jobs['Publication-StagingCleanup'].schedule?.intervalOrSchedule).to.equal('5 minutes');
      expect(requireGenerated(path.join(modelDirectory, 'PublicationSync.js'))).to.have.property(
        'globalId',
        'PublicationSync'
      );
      const filename = path.join(serviceDirectory, 'PublicationService.js');
      delete require.cache[require.resolve(filename)];
      await generateServiceShims(serviceDirectory, { PublicationService: { module: 'publication-test-hook' } });
      const hooked = requireGenerated(filename);
      hooked.bootstrap();
      expect(hooked.getProviders().map((provider: { id: string }) => provider.id)).to.include('review-ledger');
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
