import { expect } from 'chai';

import {
  renderRecordContractPublicContext,
  renderRecordJsonSchema,
} from '../../../src/record-contract/json-schema-renderer';
import { snapshotRecordContractPublicContext } from '../../../src/record-contract/record-contract-context';
import type {
  RecordContractContextRequest,
  RecordContractCreateContextRequest,
  RecordContractUpdateContext,
  RecordContractUpdateContextRequest,
} from '../../../src/record-contract/record-contract-context';
import type { RecordContractCompileRequest } from '../../../src/record-contract/record-contract-compiler';
import type { RecordContract, RecordContractPublicContext } from '../../../src/record-contract/types';

const publicContext = {
  brand: 'default',
  portal: 'main',
  kind: 'update',
  recordType: 'dataset',
  workflowStep: 'draft',
  form: 'dataset-1.0-draft',
  operation: 'submit',
  unknownProperties: 'declared',
  enforcement: 'shadow',
} satisfies RecordContractPublicContext;

type IsAssignable<Source, Target> = [Source] extends [Target] ? true : false;
type ExpectFalse<Value extends false> = Value;
type UnsafeOidContext = Omit<RecordContractPublicContext, 'oid'> & { readonly oid: string };
type UnsafeActorContext = Omit<RecordContractPublicContext, 'actor'> & {
  readonly actor: { readonly username: string };
};
type UnsafeRecordContext = Omit<RecordContractPublicContext, 'record'> & {
  readonly record: Readonly<Record<string, unknown>>;
};
type UnsafeRequestContext = Omit<RecordContractPublicContext, 'request'> & {
  readonly request: Readonly<Record<string, unknown>>;
};
type UnsafeSourceFormContext = Omit<RecordContractPublicContext, 'sourceForm'> & {
  readonly sourceForm: Readonly<Record<string, unknown>>;
};
type UnsafeContextVariablesContext = Omit<RecordContractPublicContext, 'contextVariables'> & {
  readonly contextVariables: Readonly<Record<string, unknown>>;
};
type PublicCompilerContext = RecordContractCompileRequest['context'];
type PublicRendererContext = Parameters<typeof renderRecordContractPublicContext>[0];
type SchemaRendererContract = Parameters<typeof renderRecordJsonSchema>[0];
type ContractWith<Context> = Omit<RecordContract, 'context'> & { readonly context: Context };
type CreateRequestWithOid = Omit<RecordContractCreateContextRequest, 'oid'> & { readonly oid: string };
type UpdateRequestWithoutOid = Omit<RecordContractUpdateContextRequest, 'oid'>;

const compileTimeBoundary: readonly [
  ExpectFalse<IsAssignable<UnsafeOidContext, PublicCompilerContext>>,
  ExpectFalse<IsAssignable<UnsafeOidContext, PublicRendererContext>>,
  ExpectFalse<IsAssignable<UnsafeActorContext, PublicCompilerContext>>,
  ExpectFalse<IsAssignable<UnsafeActorContext, PublicRendererContext>>,
  ExpectFalse<IsAssignable<UnsafeRecordContext, PublicCompilerContext>>,
  ExpectFalse<IsAssignable<UnsafeRecordContext, PublicRendererContext>>,
  ExpectFalse<IsAssignable<UnsafeRequestContext, PublicCompilerContext>>,
  ExpectFalse<IsAssignable<UnsafeRequestContext, PublicRendererContext>>,
  ExpectFalse<IsAssignable<UnsafeSourceFormContext, PublicCompilerContext>>,
  ExpectFalse<IsAssignable<UnsafeSourceFormContext, PublicRendererContext>>,
  ExpectFalse<IsAssignable<UnsafeContextVariablesContext, PublicCompilerContext>>,
  ExpectFalse<IsAssignable<UnsafeContextVariablesContext, PublicRendererContext>>,
  ExpectFalse<IsAssignable<ContractWith<UnsafeOidContext>, SchemaRendererContract>>,
  ExpectFalse<IsAssignable<ContractWith<UnsafeActorContext>, SchemaRendererContract>>,
  ExpectFalse<IsAssignable<ContractWith<UnsafeRecordContext>, SchemaRendererContract>>,
  ExpectFalse<IsAssignable<ContractWith<UnsafeRequestContext>, SchemaRendererContract>>,
  ExpectFalse<IsAssignable<ContractWith<UnsafeSourceFormContext>, SchemaRendererContract>>,
  ExpectFalse<IsAssignable<ContractWith<UnsafeContextVariablesContext>, SchemaRendererContract>>,
  ExpectFalse<IsAssignable<CreateRequestWithOid, RecordContractContextRequest>>,
  ExpectFalse<IsAssignable<UpdateRequestWithoutOid, RecordContractContextRequest>>,
] = [
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
];

describe('record-contract context boundary', function () {
  it('rejects private resolution data at compiler and renderer boundaries at compile time', function () {
    expect(compileTimeBoundary).to.deep.equal(Array.from({ length: 20 }, () => false));
  });

  it('creates immutable allowlisted snapshots without mutating or leaking runtime private data', function () {
    const resolvedContext: RecordContractUpdateContext = {
      publicContext,
      resolution: {
        sourceFormFingerprint: 'sha256:source-form',
        sourceForm: { name: publicContext.form, componentDefinitions: [] },
        reusableFormDefinitions: {},
        actor: { authenticated: true, roles: ['Researcher'] },
        formMode: 'edit',
        contextVariables: { featureEnabled: true },
        oid: 'private-oid',
        existingRecord: { metadata: { privateTitle: 'secret-record-value' } },
      },
    };
    const runtimeContext: RecordContractPublicContext = { ...resolvedContext.publicContext };
    Object.defineProperties(runtimeContext, {
      oid: { enumerable: true, value: 'private-oid' },
      actor: { enumerable: true, value: { username: 'private-user' } },
      record: { enumerable: true, value: { metadata: { privateTitle: 'secret-record-value' } } },
      request: { enumerable: true, value: { authorization: 'private-request-value' } },
      sourceForm: { enumerable: true, value: { name: 'private-source-form' } },
      contextVariables: { enumerable: true, value: { privateContextValue: 'private-context-value' } },
    });

    const snapshot = snapshotRecordContractPublicContext(runtimeContext);
    const rendered = renderRecordContractPublicContext(runtimeContext);
    const document = renderRecordJsonSchema({
      root: {
        kind: 'object',
        nullable: false,
        properties: {},
        unknownProperties: 'declared',
      },
      definitions: {},
      fieldOwners: {},
      validatorSummaries: [],
      diagnostics: [],
      completeness: 'complete',
      context: runtimeContext,
    });

    expect(snapshot).to.deep.equal(publicContext);
    expect(rendered).to.deep.equal(publicContext);
    expect(Object.isFrozen(snapshot)).to.equal(true);
    expect(Object.isFrozen(rendered)).to.equal(true);
    expect(Object.isFrozen(document['x-redbox-context'])).to.equal(true);
    expect(Reflect.set(snapshot, 'brand', 'mutated')).to.equal(false);
    expect(runtimeContext.brand).to.equal('default');
    expect(resolvedContext.resolution.oid).to.equal('private-oid');

    const serialized = JSON.stringify(document);
    expect(serialized).not.to.include('private-oid');
    expect(serialized).not.to.include('private-user');
    expect(serialized).not.to.include('secret-record-value');
    expect(serialized).not.to.include('private-request-value');
    expect(serialized).not.to.include('private-source-form');
    expect(serialized).not.to.include('private-context-value');
  });
});
