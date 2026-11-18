import assert from 'node:assert/strict';
import { of } from 'rxjs';
import type { SimpleInputFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';
import { Services, type RecordGraphqlDependencies } from '../../../src/services/RecordGraphqlService';
import { Services as SavedGridServices } from '../../../src/services/SavedGridService';
import { Controllers } from '../../../src/controllers/SavedGridController';
import { createCoreRecordContractContributors, RecordContractContributorRegistry } from '../../../src/record-contract';
import { recordGraphql } from '../../../src/config/recordGraphql.config';
import type { BuildResponseType } from '../../../src/model';
import type { ReadContractCandidate } from '../../../src/record-graphql/read-contract';
import { gridCaller } from '../../fixtures/record-grid.fixtures';

const title: SimpleInputFormComponentDefinitionFrame = {
  name: 'title',
  component: { class: 'SimpleInputComponent', config: { type: 'text' } },
};
const publication: ReadContractCandidate = {
  recordType: 'publication',
  workflowStep: 'draft',
  form: 'publication-draft',
  configuration: { name: 'publication-draft', type: 'publication', componentDefinitions: [title] },
};
const broken: ReadContractCandidate = {
  recordType: 'unrelated',
  workflowStep: 'draft',
  form: 'broken',
  configuration: {
    name: 'broken',
    type: 'unrelated',
    componentDefinitions: [
      {
        name: 'missing',
        overrides: { reusableFormName: 'unavailable' },
        component: { class: 'ReusableComponent', config: {} },
      },
    ],
  },
};

function graphqlService(dependencies: Partial<RecordGraphqlDependencies> = {}) {
  const registry = new RecordContractContributorRegistry(
    createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' }))
  );
  return new Services.RecordGraphql({
    getConfig: () => ({ ...recordGraphql, enabled: true }),
    getContributorRegistry: () => registry,
    getReusableDefinitions: () => ({}),
    ...dependencies,
  });
}

describe('Scoped explorer editor schema', () => {
  const originals = new Map<string, unknown>();
  const setGlobal = (key: string, value: unknown) => {
    originals.set(key, Reflect.get(globalThis, key));
    Reflect.set(globalThis, key, value);
  };
  afterEach(() => {
    for (const [key, value] of originals) Reflect.set(globalThis, key, value);
    originals.clear();
  });

  it('discovers editor SDL while global schema compilation and query execution fail closed', async () => {
    let reads = 0;
    const service = graphqlService({
      getCandidates: async () => [publication, broken],
      getRecord: async () => {
        reads++;
        return undefined;
      },
    });
    const sdl = await service.describeReadSchema(gridCaller, { recordType: 'publication' });
    assert.ok(sdl.includes('M_publication_draft'));
    assert.ok(!sdl.includes('M_unrelated'));
    await assert.rejects(service.getReadSchema(gridCaller), /Read contract compilation failed/);
    const result = await service.execute(gridCaller, { query: '{ record(oid: "example") { oid } }' });
    assert.equal(result.status, 503);
    assert.deepEqual(result.data.errors, [
      { message: 'Record GraphQL is unavailable.', extensions: { code: 'UNAVAILABLE' } },
    ]);
    assert.equal(reads, 0);
  });

  it('loads one scoped variant from a configured catalogue that exceeds maxVariants', async () => {
    const unrelated = { name: 'other-draft', type: 'other', componentDefinitions: [title] };
    setGlobal('FormsService', {
      listForms: () =>
        of(
          [publication.configuration, unrelated].map(configuration => ({
            name: configuration.name,
            branding: gridCaller.brand.id,
            configuration,
          }))
        ),
    });
    setGlobal('RecordTypesService', { getAll: () => of([{ name: 'publication' }, { name: 'other' }]) });
    setGlobal('WorkflowStepsService', {
      getAllForRecordTypeIncludingHidden: ({ name }: { name: string }) =>
        of(
          name === 'publication'
            ? [{ name: 'draft', config: { form: publication.form } }]
            : Array.from({ length: recordGraphql.maxVariants }, (_, index) => ({
                name: `stage-${index}`,
                config: { form: unrelated.name },
              }))
        ),
    });

    const service = graphqlService();
    const sdl = await service.describeReadSchema(gridCaller, { recordType: 'publication' });
    assert.ok(sdl.includes('M_publication_draft'));
    assert.ok(!sdl.includes('M_other'));
    await assert.rejects(service.describeReadSchema(gridCaller), /Read variants exceed their bound/);
  });

  it('applies maxVariants to the selected variants, including a workflow-stage filter', async () => {
    const service = graphqlService({
      getConfig: () => ({ ...recordGraphql, enabled: true, maxVariants: 1 }),
      getCandidates: async () => [publication, { ...publication, workflowStep: 'published' }],
    });
    await assert.rejects(
      service.describeReadSchema(gridCaller, { recordType: 'publication' }),
      /Read variants exceed their bound/
    );
    const sdl = await service.describeReadSchema(gridCaller, { recordType: 'publication', workflowStages: ['draft'] });
    assert.ok(sdl.includes('M_publication_draft'));
    assert.ok(!sdl.includes('M_publication_published'));
  });

  it('enforces the full reusable-definition fingerprint bound even for scoped discovery', async () => {
    const scope = { recordType: 'publication' };
    let unusedLabel = 'Unused';
    const service = graphqlService({
      getCandidates: async () => [publication],
      getReusableDefinitions: () => ({
        unused: [{ ...title, component: { class: 'SimpleInputComponent', config: { label: unusedLabel } } }],
      }),
    });
    assert.ok((await service.describeReadSchema(gridCaller, scope)).includes('M_publication_draft'));
    unusedLabel = 'x'.repeat(1_048_577);
    await assert.rejects(
      service.describeReadSchema(gridCaller, scope),
      /Read configuration exceeds its fingerprint bound/
    );
  });

  for (const { name, query, candidates, status, code } of [
    {
      name: 'an unknown record type',
      query: { recordType: 'unknown' },
      candidates: [publication],
      status: 400,
      code: 'invalid-definition',
    },
    {
      name: 'an unknown stage',
      query: { recordType: 'publication', workflowStage: 'unknown' },
      candidates: [publication],
      status: 400,
      code: 'invalid-definition',
    },
    {
      name: 'an empty catalogue',
      query: { recordType: 'publication' },
      candidates: [],
      status: 400,
      code: 'invalid-definition',
    },
    {
      name: 'a valid scope with broken compilation',
      query: { recordType: 'unrelated', workflowStage: 'draft' },
      candidates: [broken],
      status: 503,
      code: 'schema-unavailable',
    },
  ]) {
    it(`returns HTTP ${status} for ${name}`, async () => {
      const admin = { id: 'admin' };
      setGlobal('RecordGraphqlService', graphqlService({ getCandidates: async () => candidates }));
      setGlobal('SavedGridService', new SavedGridServices.SavedGrids());
      setGlobal('BrandingService', { getBrand: () => gridCaller.brand });
      setGlobal('RolesService', { getAdmin: () => admin });
      class CaptureController extends Controllers.SavedGrid {
        response?: BuildResponseType;
        protected override sendResp(_req: Sails.Req, res: Sails.Res, response?: BuildResponseType) {
          this.response = response;
          return res;
        }
      }
      const req = {
        params: { branding: gridCaller.brand.name, portal: gridCaller.portal },
        user: { ...gridCaller.user, roles: [admin] },
        isAuthenticated: () => true,
        query,
      };
      const controller = new CaptureController();
      await controller.schema(req as unknown as Sails.Req, {} as Sails.Res);
      assert.equal(controller.response?.status, status);
      assert.equal(controller.response?.displayErrors?.[0].code, code);
    });
  }
});
