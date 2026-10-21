import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  CreateSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { Services as AppConfigServices, APP_CONFIG_SECRET_MASK } from '../../../src/services/AppConfigService';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import type { PublicationConfigurationContext } from '../../../src/services/publication/configuration';
import { PublicationPublishing } from '../../../src/configmodels/PublicationPublishing';
import { HookPublication, configuredDestination, reviewProvider } from '../../fixtures/publication/provider';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from '../testHelper';

const data = (value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value));
async function rejects(action: Promise<unknown>, pattern: RegExp) {
  let failure: unknown;
  try {
    await action;
  } catch (error) {
    failure = error;
  }
  expect(failure).to.be.instanceOf(Error);
  expect(String(failure)).to.match(pattern);
}
describe('Publication AppConfig round trips (PUB-03)', () => {
  let service: AppConfigServices.AppConfigs;
  class ConfigurationPublication extends HookPublication {
    used: NonNullable<PublicationConfigurationContext['usedDestinations']> = {};
    protected override async sourceConfigurationContext(): Promise<PublicationConfigurationContext> {
      return { usedDestinations: this.used };
    }
  }
  let publication: ConfigurationPublication;
  let branding: BrandingModel;
  let rows: Array<{ branding: string; configKey: string; configData: Record<string, unknown> }>;
  beforeEach(() => {
    setupServiceTestGlobals(createMockSails());
    rows = [];
    branding = Object.assign(new BrandingModel(), { id: 'brand-1', name: 'default' });
    publication = new ConfigurationPublication();
    Reflect.set(globalThis, 'PublicationService', publication);
    Reflect.set(globalThis, 'BrandingService', {
      getBrand: (name: string) => ({ ...branding, id: name === 'default' ? 'brand-1' : 'brand-2', name }),
    });
    Reflect.set(globalThis, 'AppConfig', {
      find: async (query: { branding: string; configKey?: string }) =>
        rows.filter(row => row.branding === query.branding && (!query.configKey || row.configKey === query.configKey)),
      create: async (row: (typeof rows)[number]) => {
        rows.push(row);
        return row;
      },
      updateOne: (query: { branding: string; configKey: string }) => ({
        set: async (patch: { configData: Record<string, unknown> }) => {
          const row = rows.find(row => row.branding === query.branding && row.configKey === query.configKey)!;
          Object.assign(row, patch);
          return row;
        },
      }),
    });
    service = new AppConfigServices.AppConfigs();
    Reflect.set(globalThis, 'AppConfigService', service);
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    for (const key of ['AppConfig', 'AppConfigService', 'BrandingService', 'PublicationService'])
      Reflect.deleteProperty(globalThis, key);
    sinon.restore();
  });
  function configuration() {
    const config = new PublicationPublishing();
    config.destinations.archive = configuredDestination();
    return config;
  }
  it('masks built-in and hook secrets, retains masked credentials and isolates brand overrides', async () => {
    const config = configuration();
    config.destinations.figshare = {
      ...configuredDestination(),
      provider: 'figshare',
      connection: { baseUrl: 'https://api.figshare.com', accountId: '123', token: 'figshare-private' },
    };
    config.destinations.oni = {
      ...configuredDestination(),
      provider: 'oni',
      connection: { ingestion: { adminToken: 'oni-private' } },
    };
    config.destinations.figshare.writeBack = {};
    config.destinations.oni.writeBack = {
      citationUrlPath: 'metadata.oni.citation_url',
      citationDoiPath: 'metadata.oni.citation_doi',
      publicationErrorPath: 'metadata.oni.publication_error',
    };
    const response = await service.createOrUpdateConfig(branding, 'publicationPublishing', data(config));
    const masked = JSON.stringify(response);
    expect(masked)
      .to.include(APP_CONFIG_SECRET_MASK)
      .and.not.to.include('private-key')
      .and.not.to.include('figshare-private')
      .and.not.to.include('oni-private');
    const model = await service.getAppConfigByBrandAndKey('brand-1', 'publicationPublishing');
    await service.createOrUpdateConfig(branding, 'publicationPublishing', data(Object(model)));
    expect(JSON.stringify(rows[0].configData))
      .to.include('private-key')
      .and.to.include('figshare-private')
      .and.to.include('oni-private');
    const other = Object.assign(new BrandingModel(), { id: 'brand-2', name: 'faculty' });
    const faculty = configuration();
    faculty.destinations.archive.connection.apiKey = 'faculty-key';
    await service.createOrUpdateConfig(other, 'publicationPublishing', data(faculty));
    expect(
      service.getAppConfigurationForBrand('default').publicationPublishing?.destinations.archive.connection.apiKey
    ).to.equal('private-key');
    expect(
      service.getAppConfigurationForBrand('faculty').publicationPublishing?.destinations.archive.connection.apiKey
    ).to.equal('faculty-key');
    expect(JSON.stringify(service.getMaskedAppConfigurationForBrand('faculty'))).not.to.include('faculty-key');
    expect(
      publication.getConfiguration('faculty', { authority: 'shared' })?.destinations.archive.connection.apiKey
    ).to.equal('faculty-key');
  });
  it('rejects unsafe configuration before persisting secrets or updating cache', async () => {
    const config = configuration();
    config.destinations.archive.writeBack = { url: 'workflow.stage' };
    await rejects(service.createOrUpdateConfig(branding, 'publicationPublishing', data(config)), /unsafe-output/);
    expect(rows).to.have.length(0);
    config.destinations.archive.writeBack = {};
    config.processing.enabled = true;
    await rejects(service.createConfig('default', 'publicationPublishing', data(config)), /storage-capability/);
    expect(rows).to.have.length(0);
  });
  it('allows credential rotation, blocks repointing/removal and retains archived evidence', async () => {
    const config = configuration();
    await service.createOrUpdateConfig(branding, 'publicationPublishing', data(config));
    const provider = reviewProvider;
    publication.used = {
      archive: { providerId: provider.id, targetFingerprint: provider.targetFingerprint(config.destinations.archive) },
    };
    config.destinations.archive.connection.apiKey = 'rotated';
    await service.createOrUpdateConfig(branding, 'publicationPublishing', data(config));
    config.destinations.archive.connection.account = 'wrong-account';
    await rejects(service.createOrUpdateConfig(branding, 'publicationPublishing', data(config)), /used-target-change/);
    config.destinations.archive.connection.account = 'institution-1';
    config.destinations.archive.archived = true;
    await service.createOrUpdateConfig(branding, 'publicationPublishing', data(config));
    delete config.destinations.archive;
    await rejects(
      service.createOrUpdateConfig(branding, 'publicationPublishing', data(config)),
      /used-destination-removed/
    );
    await rejects(service.resetConfigOverride(branding, 'publicationPublishing'), /retained/);
    expect(rows).to.have.length(1);
  });
  it('stores AWS references and preserves them through masked save/reload without leaking the ARN or value', async () => {
    const arn = 'arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:publication-test';
    sails.config.appConfigSecrets = {
      provider: 'aws-secrets-manager',
      region: 'ap-southeast-2',
      namePrefix: 'tests/publication',
    };
    const send = sinon.stub(SecretsManagerClient.prototype, 'send');
    send.callsFake(async command => {
      if (command instanceof CreateSecretCommand || command instanceof PutSecretValueCommand) return { ARN: arn };
      if (command instanceof GetSecretValueCommand) return { SecretString: 'private-key' };
      throw new Error('Unexpected secret command');
    });
    const response = await service.createOrUpdateConfig(branding, 'publicationPublishing', data(configuration()));
    expect(JSON.stringify(response)).not.to.include('private-key').and.not.to.include(arn);
    expect(JSON.stringify(rows[0].configData)).to.include('$appConfigSecret').and.not.to.include('private-key');
    const previous = JSON.stringify(rows[0].configData);
    await service.createOrUpdateConfig(branding, 'publicationPublishing', data(Object(response)));
    expect(JSON.stringify(rows[0].configData)).to.equal(previous);
    expect(
      service.getAppConfigurationForBrand('default').publicationPublishing?.destinations.archive.connection.apiKey
    ).to.equal('private-key');
  });
  it('rejects posted secret references before any secret-store read', async () => {
    const send = sinon.stub(SecretsManagerClient.prototype, 'send');
    const config = configuration();
    const incoming = {
      ...config,
      destinations: {
        archive: {
          ...config.destinations.archive,
          connection: {
            ...config.destinations.archive.connection,
            apiKey: { $appConfigSecret: { provider: 'aws-secrets-manager', arn: 'arn:untrusted' } },
          },
        },
      },
    };
    await rejects(service.createOrUpdateConfig(branding, 'publicationPublishing', data(incoming)), /must be strings/);
    expect(send.called).to.equal(false);
    expect(rows).to.have.length(0);
  });
  it('renders registered provider schemas in the existing AppConfig form', async () => {
    const result = await service.getAppConfigForm(branding, 'publicationPublishing');
    expect(result.fieldOrder).to.include('destinations');
    expect(JSON.stringify(result.schema)).to.include('review-ledger').and.to.include('value-binding-editor');
  });
});
