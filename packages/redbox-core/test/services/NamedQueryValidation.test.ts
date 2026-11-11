import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import * as sinon from 'sinon';
import type { GraphqlNamedQueryDefinition, GraphqlNamedQueryVariable } from '@researchdatabox/sails-ng-common';
import { Controllers } from '../../src/controllers/webservice/NamedQueryController';
import { Services } from '../../src/services/NamedQueryService';
import { assertNamedQueryDefinition, NamedQueryDefinitionError } from '../../src/services/named-query/definition';
import {
  graphqlDiagnostic,
  GraphqlNamedQueryValidationError,
  validateGraphqlNamedQuery,
} from '../../src/services/named-query/graphql-validation';
import { validateApiRouteRequest } from '../../src/api-routes/validation';
import { createNamedQueryRoute } from '../../src/api-routes/groups/named-query';
import { createRecordYoga } from '../../src/record-graphql/schema';
import { gridHarness } from '../fixtures/record-grid.fixtures';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

const schema = gridHarness().schema;
const malformed = (key: string) => ({
  source: 'graphql',
  graphql: {
    document: '{ records(recordType: "grid-fixture") { nodes { oid } } }',
    variables: { [key]: { ownership: 'omitted' } },
    resultPath: ['records', 'nodes'],
  },
});
function structuralError(value: unknown): NamedQueryDefinitionError {
  try {
    assertNamedQueryDefinition(value);
  } catch (error) {
    assert.ok(error instanceof NamedQueryDefinitionError);
    return error;
  }
  throw new Error('Expected a structural definition error.');
}

describe('Named query safe structural diagnostic paths', () => {
  for (const key of ['PRIVATE_KEY <b>\n x', 'PRIVATE_KEY.part', 'PRIVATE_KEY[0]'])
    it(`stops before the malformed dynamic key ${JSON.stringify(key)}`, () => {
      const definition = malformed(key);
      const error = structuralError(definition);
      assert.equal(error.field, 'graphql.variables');
      assert.equal(error.message, 'Invalid named query definition at graphql.variables');
      assert.ok(!String(error.stack).includes('PRIVATE_KEY'));
      const validation = validateGraphqlNamedQuery(definition, schema).validation;
      assert.equal(validation.valid, false);
      assert.equal(validation.diagnostics[0].field, 'graphql.variables');
      assert.ok(!JSON.stringify(validation).includes('PRIVATE_KEY'));
    });
  it('retains valid structural prefixes and bounds paths without partial segments', () => {
    const definition = malformed('valid');
    Reflect.set(definition.graphql.variables.valid, 'ownership', 'consumer');
    Reflect.set(definition.graphql.variables.valid, 'parameter', 'value');
    Reflect.set(definition.graphql.variables.valid, 'inputType', 'String');
    assert.equal(structuralError(definition).field, 'graphql.variables.valid.required');
    const long = structuralError(malformed('x'.repeat(300) + '!'));
    assert.equal(long.field, 'graphql.variables');
    assert.equal(new NamedQueryDefinitionError(['graphql', 'variables', 'x'.repeat(300)]).field, 'graphql.variables');
    const arrayItem = malformed('valid');
    Reflect.set(arrayItem.graphql, 'resultPath', ['records', 1]);
    assert.equal(structuralError(arrayItem).field, 'graphql.resultPath');
    const diagnostic = graphqlDiagnostic('INVALID_DEFINITION', 'graphql.variables.PRIVATE_KEY <b>', 'Repair input.');
    assert.equal(diagnostic.field, 'graphql.variables');
  });
  it('keeps the generic CRUD route validator from reflecting malformed keys', () => {
    const result = validateApiRouteRequest(
      {
        body: { ...malformed('PRIVATE_KEY <b>\n x'), name: 'safe' },
        headers: { 'content-type': 'application/json' },
      } as unknown as Sails.Req,
      createNamedQueryRoute
    );
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.path === 'body'));
    assert.ok(!JSON.stringify(result).includes('PRIVATE_KEY'));
  });

  describe('response and bootstrap boundaries', () => {
    class TestController extends Controllers.NamedQuery {
      public override sendResp(...args: Parameters<Controllers.NamedQuery['sendResp']>) {
        return super.sendResp(...args);
      }
    }
    const brand = { id: 'brand', name: 'default', css: '', roles: [] };
    let previous: Record<string, unknown>;
    let mockSails: ReturnType<typeof createMockSails>;
    beforeEach(() => {
      previous = Object.fromEntries(
        ['BrandingService', 'NamedQueryService', 'NamedQueryEditorService', 'TranslationService', 'NamedQuery'].map(
          key => [key, Reflect.get(globalThis, key)]
        )
      );
      mockSails = createMockSails();
      setupServiceTestGlobals(mockSails);
      Object.assign(globalThis, {
        BrandingService: { getBrand: () => brand },
        TranslationService: { t: (text: string) => text },
      });
    });
    afterEach(() => {
      cleanupServiceTestGlobals();
      Object.assign(globalThis, previous);
      sinon.restore();
    });
    for (const action of ['previewDraft', 'createQuery', 'updateQuery'] as const)
      for (const failure of action === 'previewDraft'
        ? (['validation'] as const)
        : (['structural', 'validation'] as const))
        it(`${action} does not reflect malformed keys in ${failure} errors for either API version`, async () => {
          const definition = malformed('PRIVATE_KEY <b>\n x');
          const validation = validateGraphqlNamedQuery(definition, schema).validation;
          Object.assign(globalThis, {
            NamedQueryEditorService: {
              previewDraft: sinon.stub().rejects(new GraphqlNamedQueryValidationError(validation.diagnostics)),
            },
            NamedQueryService: {
              create: sinon
                .stub()
                .rejects(
                  failure === 'structural'
                    ? structuralError(definition)
                    : new GraphqlNamedQueryValidationError(validation.diagnostics)
                ),
              update: sinon
                .stub()
                .rejects(
                  failure === 'structural'
                    ? structuralError(definition)
                    : new GraphqlNamedQueryValidationError(validation.diagnostics)
                ),
            },
          });
          const controller = new TestController();
          for (const version of ['1.0', '2.0']) {
            const req = {
              body: action === 'previewDraft' ? { definition } : { ...definition, name: 'safe' },
              session: { branding: 'default' },
              param: (name: string) => (name === 'name' ? 'safe' : 'rdmp'),
              headers: { 'x-redbox-api-version': version },
              isAuthenticated: () => true,
              user: { username: 'author', roles: [] },
            };
            const res = {
              status: sinon.stub().returnsThis(),
              set: sinon.stub().returnsThis(),
              json: sinon.stub().returnsThis(),
            };
            await controller[action](req as unknown as Sails.Req, res as unknown as Sails.Res);
            // The core response helper turns generic internal errors into 500;
            // GraphQL diagnostics use the explicit 400/422 display-error branches.
            assert.equal(
              res.status.lastCall.args[0],
              action === 'previewDraft' ? 422 : failure === 'structural' ? 500 : 400
            );
            const response = res.json.lastCall.args[0];
            assert.ok(!JSON.stringify(response).includes('PRIVATE_KEY'));
            for (const call of mockSails.log.error.getCalls()) {
              assert.ok(!JSON.stringify(call.args).includes('PRIVATE_KEY'));
              for (const value of call.args)
                if (value instanceof Error) assert.ok(!String(value.stack).includes('PRIVATE_KEY'));
            }
            if (failure === 'validation') {
              if (version === '2.0') assert.equal(response.meta.diagnostics[0].field, 'graphql.variables');
              else assert.match(response.details, /^graphql\.variables:/);
            }
          }
        });
    it('does not reflect malformed dynamic keys in structural bootstrap logs', async () => {
      const root = await fs.mkdtemp(path.join(tmpdir(), 'redbox-t04-safe-path-'));
      try {
        await fs.mkdir(path.join(root, 'namedqueries'));
        await fs.writeFile(
          path.join(root, 'namedqueries', 'safe.json'),
          JSON.stringify(malformed('PRIVATE_KEY <b>\n x'))
        );
        mockSails.config.bootstrap = { ...mockSails.config.bootstrap, bootstrapDataPath: root };
        const findOne = sinon.stub().throws(new Error('Should fail before persistence.'));
        Reflect.set(globalThis, 'NamedQuery', { findOne });
        await new Services.NamedQueryService().bootstrapData(brand);
        assert.equal(findOne.called, false);
        assert.equal(mockSails.log.error.callCount, 1);
        const error = mockSails.log.error.firstCall.args[1];
        assert.ok(error instanceof NamedQueryDefinitionError);
        assert.equal(error.field, 'graphql.variables');
        assert.ok(!String(error.stack).includes('PRIVATE_KEY'));
        assert.ok(!JSON.stringify(mockSails.log.error.firstCall.args).includes('PRIVATE_KEY'));
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  });
});

function scoped(
  root: 'records' | 'recordFields',
  argument: 'recordType' | 'workflowStages',
  ownership: 'literal' | 'fixed' | 'omitted' | 'consumer',
  value: string | string[]
): GraphqlNamedQueryDefinition {
  const inputType = argument === 'recordType' ? 'String!' : '[String!]';
  const binding: GraphqlNamedQueryVariable =
    ownership === 'fixed'
      ? { ownership, value }
      : ownership === 'consumer'
        ? { ownership, parameter: 'scope', inputType, required: inputType.endsWith('!'), defaultValue: value }
        : { ownership: 'omitted' };
  return {
    source: 'graphql',
    graphql: {
      document: `query${ownership === 'literal' ? '' : `($scope: ${inputType}${ownership === 'omitted' ? ` = ${JSON.stringify(value)}` : ''})`} {
        scope: ${root}(${argument === 'workflowStages' ? 'recordType: "grid-fixture", ' : ''}${argument}: ${ownership === 'literal' ? JSON.stringify(value) : '$scope'}) {
          rows: ${root === 'records' ? 'nodes { oid }' : 'fields { id }'}
        }
      }`,
      variables: ownership === 'literal' ? {} : { scope: binding },
      resultPath: ['scope', 'rows'],
    },
  };
}

describe('Named query static collection and discovery scopes', () => {
  for (const root of ['records', 'recordFields'] as const) {
    for (const ownership of ['literal', 'fixed', 'omitted'] as const) {
      for (const argument of ['recordType', 'workflowStages'] as const)
        it(`${root} checks ${ownership} ${argument} without reflecting supplied values`, () => {
          const value = argument === 'recordType' ? 'PRIVATE_UNKNOWN_TYPE' : ['draft', 'PRIVATE_UNKNOWN_STAGE'];
          const invalid = validateGraphqlNamedQuery(scoped(root, argument, ownership, value), schema).validation;
          assert.equal(invalid.valid, false);
          assert.deepEqual(
            invalid.diagnostics.map(d => d.code),
            [argument === 'recordType' ? 'UNKNOWN_RECORD_TYPE' : 'UNKNOWN_WORKFLOW_STAGE']
          );
          assert.equal(
            invalid.diagnostics[0].field,
            ownership === 'literal' ? 'graphql.document' : 'graphql.variables.scope'
          );
          assert.ok(!JSON.stringify(invalid).includes('PRIVATE_UNKNOWN'));
          const valid = argument === 'recordType' ? 'grid-fixture' : ['draft', 'published'];
          assert.equal(
            validateGraphqlNamedQuery(scoped(root, argument, ownership, valid), schema).validation.valid,
            true
          );
        });
    }
    for (const argument of ['recordType', 'workflowStages'] as const)
      it(`${root} keeps consumer-controlled ${argument} dynamic despite defaults`, () => {
        const value = argument === 'recordType' ? 'PRIVATE_DYNAMIC_TYPE' : ['PRIVATE_DYNAMIC_STAGE'];
        assert.equal(
          validateGraphqlNamedQuery(scoped(root, argument, 'consumer', value), schema).validation.valid,
          true
        );
      });
    it(`${root} preserves GraphQL singleton-list literal and default stage coercion`, () => {
      for (const ownership of ['literal', 'omitted'] as const)
        assert.equal(
          validateGraphqlNamedQuery(scoped(root, 'workflowStages', ownership, 'draft'), schema).validation.valid,
          true
        );
    });
    it(`${root} checks stages against its own record type`, () => {
      const contracts = gridHarness().contracts;
      const other = {
        ...contracts[0],
        context: { ...contracts[0].context, recordType: 'other', workflowStep: 'archived' },
      };
      const { schema: otherSchema } = createRecordYoga([...contracts, other], {
        getRecord: async () => undefined,
        hasViewAccess: () => false,
      });
      const definition = scoped(root, 'workflowStages', 'literal', ['archived']);
      assert.deepEqual(
        validateGraphqlNamedQuery(definition, otherSchema).validation.diagnostics.map(d => d.code),
        ['UNKNOWN_WORKFLOW_STAGE']
      );
      definition.graphql.document = definition.graphql.document.replace('grid-fixture', 'other');
      assert.equal(validateGraphqlNamedQuery(definition, otherSchema).validation.valid, true);
    });
  }
  it('checks discovery scopes in fragments outside the mapped result path', () => {
    const definition = scoped('records', 'recordType', 'literal', 'grid-fixture');
    definition.graphql.document = `query {
      scope: records(recordType: "grid-fixture") { rows: nodes { oid } }
      ...Discovery
    }
    fragment Discovery on Query {
      info: recordFields(recordType: "grid-fixture", workflowStages: ["PRIVATE_UNKNOWN_STAGE"]) { fields { id } }
    }`;
    const validation = validateGraphqlNamedQuery(definition, schema).validation;
    assert.deepEqual(
      validation.diagnostics.map(d => d.code),
      ['UNKNOWN_WORKFLOW_STAGE']
    );
    assert.equal(validation.diagnostics[0].field, 'graphql.document');
    assert.ok(!JSON.stringify(validation).includes('PRIVATE_UNKNOWN_STAGE'));
  });
});
