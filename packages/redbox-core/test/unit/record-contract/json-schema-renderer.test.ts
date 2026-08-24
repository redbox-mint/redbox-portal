import { expect } from 'chai';

import {
  JSON_SCHEMA_DRAFT_2020_12,
  RecordJsonSchemaRenderer,
  RecordJsonSchemaRendererError,
  renderRecordJsonSchema,
} from '../../../src/record-contract/json-schema-renderer';
import { recordContractPointer } from '../../../src/record-contract/json-pointer';
import type { ContractNode, RecordContract, RecordContractPublicContext } from '../../../src/record-contract/types';

const context: RecordContractPublicContext = {
  brand: 'default',
  portal: 'main',
  kind: 'create',
  recordType: 'dataset',
  workflowStep: 'draft',
  form: 'dataset-1.0-draft',
  operation: 'submit',
  unknownProperties: 'declared',
  enforcement: 'shadow',
};

function contract(
  properties: Readonly<Record<string, ContractNode>>,
  overrides: Partial<RecordContract> = {}
): RecordContract {
  return {
    root: {
      kind: 'object',
      nullable: false,
      properties,
      unknownProperties: context.unknownProperties,
    },
    definitions: {},
    fieldOwners: {},
    validatorSummaries: [],
    diagnostics: [],
    completeness: 'complete',
    context,
    ...overrides,
  };
}

describe('RecordJsonSchemaRenderer', function () {
  it('renders every IR node kind, null unions, annotations, arrays, objects, and local definitions', function () {
    const address: ContractNode = {
      kind: 'object',
      nullable: false,
      definitionKey: 'address/v1',
      properties: {
        postcode: { kind: 'scalar', nullable: false, scalarType: 'integer' },
      },
      unknownProperties: 'declared',
    };
    const document = renderRecordJsonSchema(
      contract(
        {
          active: { kind: 'scalar', nullable: false, scalarType: 'boolean' },
          address: address,
          anythingNonNull: { kind: 'any', nullable: false },
          anythingNullable: { kind: 'any', nullable: true },
          count: { kind: 'scalar', nullable: true, scalarType: 'integer' },
          names: {
            kind: 'array',
            nullable: true,
            items: { kind: 'scalar', nullable: false, scalarType: 'string' },
          },
          rating: { kind: 'scalar', nullable: false, scalarType: 'number' },
          status: {
            kind: 'scalar',
            nullable: true,
            scalarType: 'string',
            enum: ['zeta', 'alpha'],
            annotations: {
              description: 'Status',
              default: 'alpha',
              examples: ['zeta'],
              extensions: { 'x-example-note': 'safe' },
            },
          },
        },
        { definitions: { 'address/v1': address } }
      )
    );

    expect(document.$schema).to.equal(JSON_SCHEMA_DRAFT_2020_12);
    expect(document.type).to.equal('object');
    expect(document).not.to.have.property('required');
    expect(document.properties?.active).to.deep.equal({ type: 'boolean' });
    expect(document.properties?.count).to.deep.equal({ type: ['integer', 'null'] });
    expect(document.properties?.rating).to.deep.equal({ type: 'number' });
    expect(document.properties?.names).to.deep.equal({
      type: ['array', 'null'],
      items: { type: 'string' },
    });
    expect(document.properties?.anythingNullable).to.deep.equal({});
    expect(document.properties?.anythingNonNull).to.deep.equal({ not: { type: 'null' } });
    expect(document.properties?.status).to.deep.equal({
      type: ['string', 'null'],
      enum: [null, 'alpha', 'zeta'],
      description: 'Status',
      default: 'alpha',
      examples: ['zeta'],
      'x-example-note': 'safe',
    });
    expect(document.properties?.address).to.deep.equal({ $ref: '#/$defs/address~1v1' });
    expect(document.$defs?.['address/v1']).to.deep.equal({
      type: 'object',
      properties: { postcode: { type: 'integer' } },
      additionalProperties: false,
    });
    expect(JSON.stringify(document)).not.to.match(/"\$ref":"(?:https?:|\/\/)/);
    expect(Object.isFrozen(document)).to.equal(true);
  });

  it('renders root-relative exists, equals, in, all, any, and not conditions against their target fields', function () {
    const document = new RecordJsonSchemaRenderer().render(
      contract({
        decision: { kind: 'scalar', nullable: false, scalarType: 'string' },
        detail: {
          kind: 'conditional',
          nullable: true,
          condition: {
            kind: 'all',
            conditions: [
              { kind: 'exists', pointer: recordContractPointer('/decision') },
              {
                kind: 'any',
                conditions: [
                  {
                    kind: 'equals',
                    pointer: recordContractPointer('/decision'),
                    value: 'yes',
                  },
                  {
                    kind: 'not',
                    condition: {
                      kind: 'in',
                      pointer: recordContractPointer('/decision'),
                      values: ['never', 'blocked'],
                    },
                  },
                ],
              },
            ],
          },
          thenNode: { kind: 'scalar', nullable: false, scalarType: 'string' },
          elseNode: {
            kind: 'object',
            nullable: false,
            properties: { reason: { kind: 'scalar', nullable: false, scalarType: 'string' } },
            unknownProperties: 'declared',
          },
          annotations: { description: 'Conditional detail' },
        },
      })
    );

    expect(document.properties?.detail).to.deep.equal({ description: 'Conditional detail' });
    expect(document.allOf).to.have.length(1);
    expect(document.allOf?.[0].if).to.deep.equal({
      allOf: [
        {
          type: 'object',
          properties: { decision: {} },
          required: ['decision'],
        },
        {
          anyOf: [
            {
              type: 'object',
              properties: { decision: { const: 'yes' } },
              required: ['decision'],
            },
            {
              not: {
                type: 'object',
                properties: { decision: { enum: ['blocked', 'never'] } },
                required: ['decision'],
              },
            },
          ],
        },
      ],
    });
    expect(document.allOf?.[0].then).to.deep.equal({
      properties: { detail: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
    });
    expect(document.allOf?.[0].else).to.deep.equal({
      properties: {
        detail: {
          anyOf: [
            {
              type: 'object',
              properties: { reason: { type: 'string' } },
              additionalProperties: false,
            },
            { type: 'null' },
          ],
        },
      },
    });
    expect(document).not.to.have.property('additionalProperties');
    expect(document.unevaluatedProperties).to.equal(false);
  });

  it('keeps both create and update schemas structurally partial and never emits business requiredness', function () {
    const properties = {
      title: { kind: 'scalar', nullable: false, scalarType: 'string' },
    } as const satisfies Readonly<Record<string, ContractNode>>;
    const createDocument = renderRecordJsonSchema(contract(properties));
    const updateDocument = renderRecordJsonSchema(contract(properties, { context: { ...context, kind: 'update' } }));

    expect(createDocument.properties?.title).to.deep.equal({ type: 'string' });
    expect(updateDocument.properties?.title).to.deep.equal({ type: 'string' });
    expect(createDocument).not.to.have.property('required');
    expect(updateDocument).not.to.have.property('required');
    expect(updateDocument['x-redbox-context'].kind).to.equal('update');
  });

  it('applies allow and declared closure at root, nested, conditional, and extension boundaries', function () {
    const nestedAllow: ContractNode = {
      kind: 'object',
      nullable: false,
      properties: {},
      unknownProperties: 'allow',
    };
    const extension: ContractNode = {
      kind: 'object',
      nullable: false,
      properties: { enabled: { kind: 'scalar', nullable: false, scalarType: 'boolean' } },
      unknownProperties: 'declared',
    };
    const declared = renderRecordJsonSchema(
      contract({
        nestedAllow,
        'example:extension': extension,
        conditionalObject: {
          kind: 'conditional',
          nullable: false,
          condition: { kind: 'exists', pointer: recordContractPointer('/nestedAllow') },
          thenNode: {
            kind: 'object',
            nullable: false,
            properties: { value: { kind: 'scalar', nullable: false, scalarType: 'string' } },
            unknownProperties: 'declared',
          },
        },
      })
    );
    const allowed = renderRecordJsonSchema(
      contract(
        { nestedAllow, 'example:extension': extension },
        {
          root: {
            kind: 'object',
            nullable: false,
            properties: { nestedAllow, 'example:extension': extension },
            unknownProperties: 'allow',
          },
          context: { ...context, unknownProperties: 'allow' },
        }
      )
    );

    expect(declared.unevaluatedProperties).to.equal(false);
    expect(declared.properties?.nestedAllow?.additionalProperties).to.equal(true);
    expect(declared.properties?.['example:extension']?.additionalProperties).to.equal(false);
    expect(
      (
        declared.allOf?.[0].then?.properties?.conditionalObject?.anyOf?.[0] ??
        declared.allOf?.[0].then?.properties?.conditionalObject
      )?.additionalProperties
    ).to.equal(false);
    expect(allowed.additionalProperties).to.equal(true);
    expect(allowed.properties?.nestedAllow?.additionalProperties).to.equal(true);
    expect(allowed.properties?.['example:extension']?.additionalProperties).to.equal(false);
  });

  it('emits only allowlisted, sorted public context, validation, diagnostic, and enforcement metadata', function () {
    const unsafeContext: RecordContractPublicContext = { ...context };
    Object.defineProperties(unsafeContext, {
      actor: { enumerable: true, value: 'private-user' },
      oid: { enumerable: true, value: 'private-oid' },
      record: { enumerable: true, value: { metadata: { title: 'private-record-value' } } },
      request: { enumerable: true, value: { authorization: 'private-request-value' } },
      requestId: { enumerable: true, value: 'volatile' },
      roles: { enumerable: true, value: ['Admin'] },
      sourceForm: { enumerable: true, value: { name: 'private-source-form' } },
      contextVariables: { enumerable: true, value: { privateContextValue: 'private-context-value' } },
      timestamp: { enumerable: true, value: 'never' },
    });
    const document = renderRecordJsonSchema(
      contract(
        {},
        {
          context: unsafeContext,
          completeness: 'partial',
          validatorSummaries: [
            {
              code: 'form.required',
              pointers: [recordContractPointer('/z'), recordContractPointer('/a')],
              groups: ['submit', 'draft', 'submit'],
              operations: ['update', 'create'],
              blocking: true,
              expression: '$secret()',
            } as RecordContract['validatorSummaries'][number],
          ],
          diagnostics: [
            {
              code: 'z-code',
              severity: 'warning',
              message: 'Safe message',
              secret: 'omit-me',
            } as RecordContract['diagnostics'][number],
            { code: 'a-code', severity: 'info', message: 'First' },
          ],
        }
      )
    );

    expect(document['x-redbox-context']).to.deep.equal(context);
    expect(document['x-redbox-context'].enforcement).to.equal('shadow');
    expect(document['x-redbox-completeness']).to.equal('partial');
    expect(document['x-redbox-validation']).to.deep.equal([
      {
        code: 'form.required',
        pointers: ['/a', '/z'],
        groups: ['draft', 'submit'],
        operations: ['create', 'update'],
        blocking: true,
      },
    ]);
    expect(document['x-redbox-diagnostics'].map(diagnostic => diagnostic.code)).to.deep.equal(['a-code', 'z-code']);
    const serialized = JSON.stringify(document);
    expect(serialized).not.to.include('private-user');
    expect(serialized).not.to.include('private-oid');
    expect(serialized).not.to.include('private-record-value');
    expect(serialized).not.to.include('private-request-value');
    expect(serialized).not.to.include('private-source-form');
    expect(serialized).not.to.include('private-context-value');
    expect(serialized).not.to.include('volatile');
    expect(serialized).not.to.include('$secret');
    expect(serialized).not.to.include('omit-me');
  });

  it('rejects missing definitions, reserved contributor keywords, and remote refs in annotation values', function () {
    expect(() =>
      renderRecordJsonSchema(
        contract({
          missing: {
            kind: 'object',
            nullable: false,
            definitionKey: 'missing',
            properties: {},
            unknownProperties: 'allow',
          },
        })
      )
    ).to.throw(RecordJsonSchemaRendererError, 'missing local definition');

    expect(() =>
      renderRecordJsonSchema(
        contract({
          protected: {
            kind: 'any',
            nullable: true,
            annotations: { extensions: { type: 'string' } },
          },
        })
      )
    ).to.throw(RecordJsonSchemaRendererError, 'reserved');

    expect(() =>
      renderRecordJsonSchema(
        contract({
          invalidAnnotation: {
            kind: 'scalar',
            nullable: false,
            scalarType: 'string',
            annotations: { extensions: { 'x.invalid': 'not accepted by AJV' } },
          },
        })
      )
    ).to.throw(RecordJsonSchemaRendererError, 'reserved');

    expect(() =>
      renderRecordJsonSchema(
        contract({
          remote: {
            kind: 'any',
            nullable: true,
            annotations: {
              extensions: { 'x-example-schema': { $ref: 'https://example.test/remote-schema' } },
            },
          },
        })
      )
    ).to.throw(RecordJsonSchemaRendererError, 'remote references');
  });

  it('keeps definition-local conditional composition out of the document root', function () {
    const conditionalDefinition: ContractNode = {
      kind: 'object',
      nullable: false,
      definitionKey: 'conditional-definition',
      properties: {
        enabled: { kind: 'scalar', nullable: false, scalarType: 'boolean' },
        value: {
          kind: 'conditional',
          nullable: false,
          condition: { kind: 'equals', pointer: recordContractPointer('/enabled'), value: true },
          thenNode: { kind: 'scalar', nullable: false, scalarType: 'string' },
        },
      },
      unknownProperties: 'declared',
    };
    const document = renderRecordJsonSchema(
      contract(
        { reusable: conditionalDefinition },
        { definitions: { 'conditional-definition': conditionalDefinition } }
      )
    );

    expect(document).not.to.have.property('allOf');
    expect(document.$defs?.['conditional-definition'].allOf).to.have.length(1);
    expect(document.$defs?.['conditional-definition'].unevaluatedProperties).to.equal(false);
  });

  it('scopes repeatable-item conditionals to each item object', function () {
    const document = renderRecordJsonSchema(
      contract({
        entries: {
          kind: 'array',
          nullable: false,
          items: {
            kind: 'object',
            nullable: false,
            unknownProperties: 'declared',
            properties: {
              mode: { kind: 'scalar', nullable: false, scalarType: 'string' },
              value: {
                kind: 'conditional',
                nullable: false,
                condition: {
                  kind: 'equals',
                  pointer: recordContractPointer('/entries/mode'),
                  value: 'text',
                },
                thenNode: { kind: 'scalar', nullable: false, scalarType: 'string' },
              },
            },
          },
        },
      })
    );

    expect(document).not.to.have.property('allOf');
    expect(document.properties?.entries?.items).to.deep.include({
      unevaluatedProperties: false,
      allOf: [
        {
          if: {
            type: 'object',
            properties: { mode: { const: 'text' } },
            required: ['mode'],
          },
          then: { properties: { value: { type: 'string' } } },
        },
      ],
    });
  });

  it('preserves array item traversal when a repeatable conditional depends on root metadata', function () {
    const document = renderRecordJsonSchema(
      contract({
        enabled: { kind: 'scalar', nullable: false, scalarType: 'boolean' },
        entries: {
          kind: 'array',
          nullable: false,
          items: {
            kind: 'object',
            nullable: false,
            unknownProperties: 'declared',
            properties: {
              value: {
                kind: 'conditional',
                nullable: false,
                condition: {
                  kind: 'equals',
                  pointer: recordContractPointer('/enabled'),
                  value: true,
                },
                thenNode: { kind: 'scalar', nullable: false, scalarType: 'string' },
              },
            },
          },
        },
      })
    );

    expect(document.allOf?.[0]).to.deep.equal({
      if: {
        type: 'object',
        properties: { enabled: { const: true } },
        required: ['enabled'],
      },
      then: {
        properties: {
          entries: { items: { properties: { value: { type: 'string' } } } },
        },
      },
    });
  });

  it('URI-encodes definition references and rejects undeclared local references in annotation data', function () {
    const definitionKey = 'address #/%';
    const definition: ContractNode = {
      kind: 'object',
      nullable: false,
      definitionKey,
      properties: {},
      unknownProperties: 'allow',
    };
    const document = renderRecordJsonSchema(
      contract({ address: definition }, { definitions: { [definitionKey]: definition } })
    );

    expect(document.properties?.address?.$ref).to.equal('#/$defs/address%20%23~1%25');
    expect(() =>
      renderRecordJsonSchema(
        contract({
          annotation: {
            kind: 'any',
            nullable: true,
            annotations: { extensions: { 'x-example-schema': { $ref: '#/$defs/missing' } } },
          },
        })
      )
    ).to.throw(RecordJsonSchemaRendererError, 'declared local definition');
  });
});
