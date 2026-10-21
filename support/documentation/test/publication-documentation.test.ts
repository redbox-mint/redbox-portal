import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PublicationService } from '@researchdatabox/redbox-core';
import { basicSurface, diagnosticsFor, extractPublicationContracts } from '../src/extract';
import { createProgram } from '../src/source';
import { subjectImport, pinnedSubjects } from '../examples/publication-vocabulary';
import { publicationVocabularyApiRoutes } from '@researchdatabox/redbox-core/dist/api-routes/groups/publication-vocabulary';

const examplePath = 'support/documentation/examples/publication/configuration.json';
function configuration() {
  const service = new PublicationService.Services.Publication();
  const result = service.validateConfiguration(JSON.parse(readFileSync(examplePath, 'utf8')));
  assert.ok(result.valid, result.valid ? '' : JSON.stringify(result.issues));
  return { service, value: result.value };
}

describe('shared publication documentation (PUB-19)', function () {
  this.timeout(60000);

  it('validates the complete disabled Figshare/Oni example against the actual schema and adapters', () => {
    const { value } = configuration();
    assert.equal(value.processing.enabled, false);
    assert.equal(value.processing.stagingDisk, 'publication-staging');
    assert.deepEqual(
      Object.values(value.destinations).map(destination => destination.provider),
      ['figshare', 'oni']
    );
    assert.ok(Object.values(value.destinations).every(destination => !destination.enabled));
    assert.deepEqual(
      value.sourcePolicies.map(policy => policy.mode),
      ['approval', 'auto-sync']
    );
    assert.equal(value.workflow.rules[0].completion, 'all');
  });

  it('validates any semantics without changing the approved configuration destination set', () => {
    const { service, value } = configuration();
    const destinations = [...value.workflow.rules[0].destinations];
    value.workflow.rules[0].completion = 'any';
    const result = service.validateConfiguration(value);
    assert.ok(result.valid);
    assert.deepEqual(result.value.workflow.rules[0].destinations, destinations);
  });
  it('PUB-25 validates the non-numeric import example and preserves an explicit frozen revision', () => {
    const route = publicationVocabularyApiRoutes.find(route => route.action === 'importSource');
    const schema = route?.request?.body?.content['application/json'].schema;
    assert.ok(schema);
    assert.equal(schema.safeParse(subjectImport).success, true);
    assert.equal(
      schema.safeParse({ ...subjectImport, terms: [{ ...subjectImport.terms[0], value: 42 }] }).success,
      false
    );
    assert.equal(pinnedSubjects.revision, 1);
    assert.equal(pinnedSubjects.outputs, 'value');
    assert.ok(subjectImport.terms[0].value.startsWith('https://'));
  });

  it('rejects unsafe example edits rather than treating schema success as activation evidence', () => {
    const { service, value } = configuration();
    for (const change of [
      () => {
        value.processing.enabled = true;
      },
      () => {
        value.processing.leaseMs = value.processing.heartbeatMs;
      },
      () => {
        value.destinations['oni-research'].writeBack.citationUrlPath = 'metadata.publications.figshare';
      },
      () => {
        value.workflow.rules[0].destinations = ['missing-destination'];
      },
      () => {
        value.destinations['oni-research'].writeBack = {};
      },
      () => {
        value.destinations['figshare-main'].mapping = { metadata: { title: { kind: 'path', path: 7 } } };
      },
    ]) {
      const original = structuredClone(value);
      change();
      assert.equal(service.validateConfiguration(value).valid, false);
      Object.assign(value, original);
    }
  });

  it('publishes adapter/configuration contracts and protected registration while excluding host methods', () => {
    const program = createProgram();
    const service = basicSurface(
      program.getTypeChecker(),
      program,
      'packages/redbox-core/src/services/PublicationService.ts',
      'Publication',
      'service:PublicationService',
      'service'
    );
    assert.ok(service);
    const surfaces = [service, ...extractPublicationContracts(program)];
    const diagnostics = diagnosticsFor(surfaces);
    assert.equal(service.lifecycle, 'supported');
    const names = new Set(service.members.map(member => member.name));
    for (const name of ['configureProviders', 'registerProvider', 'acceptRequest', 'validateConfiguration'])
      assert.ok(names.has(name), `missing supported method ${name}`);
    for (const name of ['administer', 'migrate', 'prepareSourceRequest', 'executeRecord', 'sourceConfigurationContext'])
      assert.equal(names.has(name), false, `internal method published: ${name}`);
    for (const name of [
      'PublicationProvider',
      'PublicationProviderExecution',
      'PublicationPublishingConfigData',
      'PublicationTargetTerm',
      'PublicationCrosswalkRevision',
      'PublicationVocabularyResolveInput',
    ]) {
      const contract = surfaces.find(surface => surface.id === `publication-contract:${name}`);
      assert.ok(contract);
      assert.equal(contract.lifecycle, 'supported');
      assert.ok(contract.members.length > 0);
    }
    assert.deepEqual(
      diagnostics.filter(finding => finding.surfaceId === service.id),
      []
    );
    const vocabularyIds = new Set(
      surfaces
        .filter(
          surface => surface.source.file === 'packages/redbox-core/src/services/publication-vocabulary/contracts.ts'
        )
        .map(surface => surface.id)
    );
    assert.equal(vocabularyIds.size, 10);
    assert.deepEqual(
      diagnostics.filter(finding => finding.surfaceId && vocabularyIds.has(finding.surfaceId)),
      []
    );
  });

  it('parses every delivered CLI command with the actual entry points without loading an application', async () => {
    type Request = { action: string; brandId?: string; parameters?: Record<string, unknown> };
    type Loader = () => Promise<{
      service: {
        administer(request: Request): Promise<Request>;
        migrate(request: Request): Promise<Request>;
        readiness(request: Request): Promise<Request>;
      };
      vocabularyService: { convert(request: Request): Promise<Request> };
      close(): Promise<void>;
    }>;
    type EntryPoint = { main(argv: string[], load: Loader, output: (value: string) => void): Promise<Request> };
    const shared: EntryPoint = require(`${process.cwd()}/support/publication/admin.js`);
    const figshare: EntryPoint = require(`${process.cwd()}/support/figshare/admin.js`);
    const requests: Request[] = [];
    let closed = 0;
    const record = async (request: Request) => {
      requests.push(request);
      return request;
    };
    const load: Loader = async () => ({
      service: { administer: record, migrate: record, readiness: record },
      vocabularyService: { convert: record },
      close: async () => {
        closed++;
      },
    });
    for (const file of [
      'support/wiki/Shared-Publication-Operations.md',
      'support/wiki/Figshare-Queued-Synchronisation.md',
      'support/wiki/Configuring-Oni-Publishing.md',
      'support/wiki/Shared-Publication-Vocabularies.md',
      'support/publication/README.md',
    ]) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!/^node support\/(publication|figshare)\/admin\.js /.test(line)) continue;
        // These runbooks deliberately use single-line commands and single-quoted JSON/reasons, with no shell expansion.
        const tokens = line.match(/'[^']*'|"[^"]*"|\S+/g)?.map(token => token.replace(/^(['"])(.*)\1$/, '$2'));
        assert.ok(tokens);
        const redirect = tokens.indexOf('>');
        const argv = tokens.slice(2, redirect < 0 ? undefined : redirect);
        const result = await (tokens[1].includes('figshare') ? figshare : shared).main(argv, load, () => {});
        assert.ok(result.brandId, `missing explicit brand: ${line}`);
      }
    }
    assert.ok(requests.length >= 25, 'runbook CLI examples must be exercised');
    assert.equal(closed, requests.length);
    assert.ok(requests.some(request => request.action === 'migrate'));
    assert.ok(requests.some(request => request.action === 'repair'));
  });
});
