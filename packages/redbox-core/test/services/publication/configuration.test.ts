import { PUBLICATION_STORAGE_CAPABILITY_METHODS } from '../../../src/RecordStorageConcurrency';
import { expect } from 'chai';
import { PublicationPublishing, type PublicationWorkflowRule } from '../../../src/configmodels/PublicationPublishing';
import {
  validatePublicationConfiguration,
  publicationOutputPath,
  resolvePublicationConfiguration,
} from '../../../src/services/publication/configuration';
import { BUILTIN_PUBLICATION_DEFINITIONS } from '../../../src/services/publication/builtins';
import { PublicationProviderRegistry } from '../../../src/services/publication/registry';
import { registeredPublicationOutputs } from '../../../src/services/publication/writeback';
import { configuredDestination, reviewProvider, testRegistry } from '../../fixtures/publication/provider';

function storage(publication = 1) {
  return {
    ...Object.fromEntries(PUBLICATION_STORAGE_CAPABILITY_METHODS.map(method => [method, () => {}])),
    getCapabilities: () => ({ publication }),
  };
}
function config() {
  const value = new PublicationPublishing();
  value.destinations.archive = configuredDestination();
  return value;
}
function codes(value: unknown, context = {}) {
  const result = validatePublicationConfiguration(value, testRegistry(), context);
  return result.valid ? [] : result.issues.map(issue => issue.code);
}
describe('Publication configuration (PUB-03)', () => {
  it('defaults brand and destination processing off and preserves legacy processing defaults', () => {
    const value = config();
    Reflect.deleteProperty(value.destinations.archive, 'enabled');
    const result = validatePublicationConfiguration(value, testRegistry());
    expect(result.valid).to.equal(true);
    if (!result.valid) throw new Error('Expected valid defaults');
    expect(result.value.processing).to.include({ enabled: false, leaseMs: 120000, heartbeatMs: 20000, maxAttempts: 5 });
    expect(result.value.destinations.archive.enabled).to.equal(false);
  });
  it('rejects unknown providers, invalid destination IDs and duplicate policy IDs', () => {
    const value = config();
    value.destinations.archive.provider = 'missing';
    expect(codes(value)).to.include('unknown-provider');
    value.destinations['bad.id'] = configuredDestination();
    expect(codes(value)).to.include('schema');
    delete value.destinations['bad.id'];
    value.destinations.archive.provider = 'review-ledger';
    const policy = {
      id: 'on-approval',
      version: 1,
      mode: 'approval' as const,
      recordType: 'dataPublication',
      event: 'onTransition',
      destinations: ['archive'],
    };
    value.sourcePolicies = [policy, policy];
    expect(codes(value)).to.include('duplicate-id');
  });
  it('rejects empty, duplicate and missing workflow destination sets', () => {
    const value = config();
    const rule: PublicationWorkflowRule = {
      id: 'publish',
      version: 1,
      recordType: 'dataPublication',
      destinations: [],
      completion: 'all' as const,
      targetStage: 'published',
    };
    value.workflow.rules = [rule];
    expect(codes(value)).to.include('schema');
    rule.destinations = ['archive', 'archive'];
    expect(codes(value)).to.include('schema');
    rule.destinations = ['missing'];
    expect(codes(value)).to.include('missing-destination');
  });
  it('validates positive durations, bounded integer values and lease heartbeat ratio', () => {
    const value = config();
    value.processing.coalesceMs = 0;
    expect(codes(value)).to.include('schema');
    value.processing.coalesceMs = 1;
    value.processing.leaseMs = 59999;
    expect(codes(value)).to.include('lease-duration');
  });
  it('permits requester grant conditions but refuses historical-requester-dependent continuation', () => {
    const value = config();
    value.sourcePolicies = [
      {
        id: 'approve',
        version: 1,
        mode: 'approval',
        recordType: 'dataPublication',
        event: 'onTransitionWorkflow',
        destinations: ['archive'],
        grantCondition: '<%= user.username === "approver" %>',
        continuationCondition: '<%= user.disabled !== true %>',
      },
    ];
    expect(codes(value)).to.include('requester-continuation');
    value.sourcePolicies[0].continuationCondition = '<%= record.metadata.allowed === true %>';
    expect(codes(value)).to.deep.equal([]);
  });
  it('keeps AppConfig strict while letting source preparation isolate invalid provider mappings', () => {
    const registry = new PublicationProviderRegistry();
    registry.register({
      ...reviewProvider,
      validateConfiguration: () => ({
        valid: false,
        issues: [{ path: '/mapping', code: 'mapping', message: 'Invalid mapping' }],
      }),
    });
    expect(validatePublicationConfiguration(config(), registry).valid).to.equal(false);
    expect(
      validatePublicationConfiguration(config(), registry, { deferInvalidProviderConfiguration: true }).valid
    ).to.equal(true);
  });
  it('refuses enablement without storage capability, shared authority, adapter and target verification', () => {
    const value = config();
    value.processing.enabled = true;
    value.processing.serviceUsername = 'publication-worker';
    value.destinations.archive.enabled = true;
    expect(codes(value)).to.include.members(['storage-capability', 'brand-authority', 'target-unverified']);
    expect(codes(value, { publicationStorage: storage(2), authority: 'shared' })).to.include('storage-capability');
    const target = reviewProvider.targetFingerprint(value.destinations.archive);
    expect(
      codes(value, { publicationStorage: storage(), authority: 'shared', verifiedTargets: { archive: target } })
    ).to.deep.equal([]);
    const registry = testRegistry();
    registry.registerDefinition({ ...reviewProvider, id: 'config-only' });
    value.destinations.archive.provider = 'config-only';
    const result = validatePublicationConfiguration(value, registry, {
      publicationStorage: storage(),
      authority: 'shared',
      verifiedTargets: { archive: target },
    });
    expect(result.valid).to.equal(false);
    if (!result.valid) expect(result.issues.map(issue => issue.code)).to.include('adapter-unavailable');
  });
  it('allows same-target credential rotation and display-name changes, rejects provider/account/target replacement', () => {
    const value = config();
    const identity = {
      providerId: 'review-ledger',
      targetFingerprint: reviewProvider.targetFingerprint(value.destinations.archive),
    };
    const context = { usedDestinations: { archive: identity } };
    value.destinations.archive.connection.apiKey = 'rotated';
    value.destinations.archive.displayName = 'New label';
    expect(codes(value, context)).to.deep.equal([]);
    value.destinations.archive.connection.account = 'another-account';
    expect(codes(value, context)).to.include('used-target-change');
    value.destinations.archive.connection.account = 'institution-1';
    value.destinations.archive.connection.endpoint = 'https://other.example.test';
    expect(codes(value, context)).to.include('used-target-change');
    value.destinations.archive.provider = 'missing';
    expect(codes(value, context)).to.include('unknown-provider');
  });
  it('retains archived destinations and fixed all sets, and rejects removal of used identities', () => {
    const value = config();
    const context = {
      usedDestinations: {
        archive: {
          providerId: 'review-ledger',
          targetFingerprint: reviewProvider.targetFingerprint(value.destinations.archive),
        },
      },
    };
    value.destinations.archive.archived = true;
    value.workflow.rules = [
      {
        id: 'all-destinations',
        version: 1,
        recordType: 'dataPublication',
        destinations: ['archive'],
        completion: 'all',
        targetStage: 'published',
      },
    ];
    expect(codes(value, context)).to.deep.equal([]);
    value.destinations.archive.enabled = true;
    expect(codes(value, context)).to.include('archived-enabled');
    delete value.destinations.archive;
    expect(codes(value, context)).to.include('used-destination-removed');
  });
  for (const [left, right] of [
    ['metadata.links', 'metadata.links'],
    ['metadata.links', 'metadata.links.oni'],
    ['metadata.links.oni', 'metadata.links'],
    ['metadata.links[0].url', 'metadata.links[1].url'],
    ['metadata.links.0.url', 'metadata.links.1.url'],
    ['metadata.links[*].url', 'metadata.links.other'],
  ])
    it(`rejects output collision ${left} / ${right}`, () => {
      const value = config();
      value.destinations.archive.writeBack = { url: left };
      value.destinations.second = { ...configuredDestination(), writeBack: { url: right } };
      expect(codes(value)).to.include('output-collision');
    });
  it('permits disjoint metadata children but rejects unsafe and protected roots', () => {
    const value = config();
    value.destinations.second = { ...configuredDestination(), writeBack: { url: 'metadata.publications.second.url' } };
    expect(codes(value)).to.deep.equal([]);
    for (const path of [
      'metadata',
      'workflow.stage',
      'publicationSource.approvals',
      'metadata.__proto__.x',
      'metadata.constructor.x',
      'metadata..url',
      'metadata.links[]',
    ]) {
      value.destinations.second.writeBack = { url: path };
      expect(codes(value), path).to.include('unsafe-output');
    }
    expect(publicationOutputPath('metadata.links[0].url')).to.deep.equal(['metadata', 'links']);
  });
  for (const path of ['metadata.links[0].url', 'metadata.links[*].url', 'metadata.schema:url'])
    it(`rejects output ${path} before publication because record storage cannot project it`, () => {
      const value = config();
      value.destinations.archive.writeBack = { url: path };
      expect(codes(value)).to.include('unsafe-output');
    });
  it('rejects unprojectable provider outputs before sealing maintenance exemptions', () => {
    const registry = new PublicationProviderRegistry();
    registry.register({ ...reviewProvider, sourceMaintenancePaths: () => ['metadata.links[*].url'] });
    const value = config();
    const result = validatePublicationConfiguration(value, registry);
    expect(result.valid).to.equal(false);
    expect(() => registeredPublicationOutputs(registry, value, ['archive'])).to.throw(
      'Unsupported record projection path'
    );
  });
  it('never falls back to legacy configuration after unified authority commits', () => {
    expect(
      resolvePublicationConfiguration({ figsharePublishing: { enabled: true } }, testRegistry(), {
        authority: 'legacy',
      })
    ).to.equal(undefined);
    expect(() =>
      resolvePublicationConfiguration({ figsharePublishing: { enabled: true } }, testRegistry(), {
        authority: 'shared',
      })
    ).to.throw('missing');
    expect(() =>
      resolvePublicationConfiguration({ publicationPublishing: {} }, testRegistry(), { authority: 'shared' })
    ).to.throw('Invalid authoritative');
    expect(() => resolvePublicationConfiguration({}, testRegistry(), { authority: 'preparing' })).to.throw(
      'in progress'
    );
    expect(
      resolvePublicationConfiguration({ publicationPublishing: config() }, testRegistry(), { authority: 'shared' })
        ?.destinations.archive.provider
    ).to.equal('review-ledger');
  });
  it('rejects malformed provider bindings without echoing private values', () => {
    const provider = BUILTIN_PUBLICATION_DEFINITIONS.find(provider => provider.id === 'figshare')!;
    for (const binding of [
      { kind: 'path' },
      { kind: 'jsonata', expression: '(' },
      { kind: 'handlebars', template: '{{unsafeHelper metadata.title}}' },
      { kind: 'crosswalk', crosswalkId: 'crosswalk-1' },
    ]) {
      const value = {
        ...configuredDestination(),
        connection: { token: 'private-secret' },
        mapping: { metadata: { title: binding } },
      };
      const result = provider.validateConfiguration(value);
      expect(result.valid).to.equal(false);
      expect(JSON.stringify(result)).not.to.include('private-secret');
    }
  });
  it('defines provider-specific schemas and non-secret Figshare account identity', () => {
    const provider = BUILTIN_PUBLICATION_DEFINITIONS.find(provider => provider.id === 'figshare')!;
    const value = {
      ...configuredDestination(),
      provider: 'figshare',
      connection: { baseUrl: 'https://api.figshare.com/', accountId: '123', token: 'before' },
    };
    expect(provider.validateConfiguration(value).valid).to.equal(true);
    const fingerprint = provider.targetFingerprint(value);
    value.connection.token = 'after';
    value.connection.baseUrl = 'https://API.FIGSHARE.COM';
    expect(provider.targetFingerprint(value)).to.equal(fingerprint);
    value.connection.accountId = '456';
    expect(provider.targetFingerprint(value)).not.to.equal(fingerprint);
    expect(JSON.stringify(provider.configurationSchema)).to.include('value-binding-editor');
  });
});
