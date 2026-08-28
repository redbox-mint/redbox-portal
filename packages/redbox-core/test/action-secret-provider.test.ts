import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import ts from 'typescript';
import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  ACTION_CONTRACT_SCHEMA_VERSION,
  ACTION_SECRET_LIMITS,
  ActionSecretProviderError,
  actionSecretParameterSchema,
  createActionSecretProvider,
  createActionSecretSlotIdentity,
  deriveStableActionBindingId,
  deriveStableActionSecretSlotId,
  parseActionBinding,
  parseActionContext,
  parseActionDefinitionId,
  parseActionSecretSlotId,
  resolveActionHandlerSecrets,
  type ActionBinding,
  type ActionHandler,
  type ActionParameterDefinition,
  type ActionSecretDescriptorReference,
  type ActionSecretProviderErrorCode,
  type ActionSecretSlotIdentity,
  type ActionSecretStorage,
} from '../src/action-registry';

const brandId = 'brand-alpha';
const recordTypeKey = 'rdmp';
const actionId = parseActionDefinitionId('org.redbox.secret-action');
const scope = {
  context: 'record-lifecycle' as const,
  mode: 'onCreate' as const,
  phase: 'pre' as const,
};

function binding(stableKey = 'primary'): ActionBinding {
  const id = deriveStableActionBindingId({
    recordTypeKey,
    scope,
    actionId,
    contractVersion: 1,
    stableKey,
  });
  return parseActionBinding({
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id,
    stableKey,
    actionId,
    contractVersion: 1,
    scope,
    parameters: {
      label: { kind: 'literal', value: 'safe-label' },
      credential: { kind: 'secret', configured: true },
    },
    order: 10,
  });
}

function descriptor(parameters?: readonly ActionParameterDefinition[]): ActionSecretDescriptorReference {
  return {
    id: actionId,
    contractVersion: 1,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: parameters ?? [
        { name: 'label', title: 'Label', kind: 'string', required: false },
        { name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: true },
      ],
    },
  };
}

function actionContext() {
  return parseActionContext({
    schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    executionId: 'execution-1',
    correlationId: 'correlation-1',
    timestamp: '2026-08-28T00:00:00.000Z',
    brandId,
    recordTypeKey,
    scope,
    actor: null,
    record: {},
    priorOutputs: [],
  });
}

function slot(
  actionBinding = binding(),
  parameterName = 'credential',
  ownerBrandId = brandId
): ActionSecretSlotIdentity {
  return createActionSecretSlotIdentity({
    brandId: ownerBrandId,
    recordTypeKey,
    bindingId: actionBinding.id,
    parameterName,
  });
}

class MemoryActionSecretStorage implements ActionSecretStorage {
  readonly values = new Map<string, string>();
  readonly operations: string[] = [];
  failWith?: string;

  async replace(secretSlot: ActionSecretSlotIdentity, value: string): Promise<void> {
    this.operations.push('replace');
    if (this.failWith !== undefined) {
      throw new Error(this.failWith);
    }
    this.values.set(secretSlot.id, value);
  }

  async clear(secretSlot: ActionSecretSlotIdentity): Promise<void> {
    this.operations.push('clear');
    if (this.failWith !== undefined) {
      throw new Error(this.failWith);
    }
    this.values.delete(secretSlot.id);
  }

  async resolve(secretSlot: ActionSecretSlotIdentity): Promise<string | undefined> {
    this.operations.push('resolve');
    if (this.failWith !== undefined) {
      throw new Error(this.failWith);
    }
    return this.values.get(secretSlot.id);
  }

  async isConfigured(secretSlot: ActionSecretSlotIdentity): Promise<boolean> {
    this.operations.push('configured');
    if (this.failWith !== undefined) {
      throw new Error(this.failWith);
    }
    return this.values.has(secretSlot.id);
  }
}

async function expectProviderError(
  operation: Promise<unknown>,
  code: ActionSecretProviderErrorCode,
  excludedText?: string
): Promise<ActionSecretProviderError> {
  try {
    await operation;
    assert.fail(`Expected ${code}.`);
  } catch (error) {
    assert.equal(error instanceof ActionSecretProviderError, true);
    const providerError = error as ActionSecretProviderError;
    assert.equal(providerError.code, code);
    assert.equal(providerError.message.length <= 160, true);
    const serialized = JSON.stringify(providerError);
    if (excludedText !== undefined) {
      assert.equal(providerError.message.includes(excludedText), false);
      assert.equal(serialized.includes(excludedText), false);
      assert.equal(providerError.stack?.includes(excludedText) ?? false, false);
    }
    return providerError;
  }
}

function forbiddenTypeKeywords(sourceFile: ts.SourceFile): readonly string[] {
  const failures: string[] = [];
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword || node.kind === ts.SyntaxKind.UnknownKeyword) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      failures.push(
        `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}:${node.getText(sourceFile)}`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return failures;
}

describe('action secret parameter provider boundary', () => {
  it('derives stable slots from every ownership component', () => {
    const primaryBinding = binding();
    const base = slot(primaryBinding);
    const repeated = slot(primaryBinding);
    const variants = [
      slot(primaryBinding, 'credential', 'brand-beta'),
      createActionSecretSlotIdentity({
        brandId,
        recordTypeKey: 'data-record',
        bindingId: primaryBinding.id,
        parameterName: 'credential',
      }),
      slot(binding('secondary')),
      slot(primaryBinding, 'apiToken'),
    ];

    assert.equal(base.id, repeated.id);
    assert.equal(Object.isFrozen(base), true);
    assert.equal(new Set(variants.map(variant => variant.id)).size, variants.length);
    assert.equal(
      variants.every(variant => variant.id !== base.id),
      true
    );
    assert.notEqual(
      deriveStableActionSecretSlotId({
        brandId: 'brand:alpha',
        recordTypeKey,
        bindingId: primaryBinding.id,
        parameterName: 'credential',
      }),
      deriveStableActionSecretSlotId({
        brandId: 'brand',
        recordTypeKey: `alpha:${recordTypeKey}`,
        bindingId: primaryBinding.id,
        parameterName: 'credential',
      })
    );
    assert.throws(() => parseActionSecretSlotId('acts_not-a-valid-slot'), ActionSecretProviderError);
  });

  it('retains omitted and blank writes, replaces non-blank values, and clears only explicitly', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const secretSlot = slot();
    const access = { requesterBrandId: brandId, slot: secretSlot };

    await provider.replace({ ...access, value: 'first-secret' });
    assert.equal(await provider.isConfigured(access), true);
    assert.equal(await provider.write(access), 'retained');
    assert.equal(await provider.write({ ...access, value: '  \t ' }), 'retained');
    assert.equal(storage.operations.filter(operation => operation === 'replace').length, 1);

    assert.equal(await provider.write({ ...access, value: 'second-secret' }), 'replaced');
    const resolved = await provider.resolveForHandler({
      ...access,
      binding: binding(),
      descriptor: descriptor(),
    });
    assert.equal(resolved?.reveal(), 'second-secret');
    assert.equal(String(resolved), '[REDACTED]');
    assert.equal(JSON.stringify(resolved), '"[REDACTED]"');

    await expectProviderError(provider.replace({ ...access, value: '' }), 'invalid-secret-value');
    assert.equal(await provider.isConfigured(access), true);

    await provider.clear(access);
    assert.equal(await provider.isConfigured(access), false);
    assert.equal(
      await provider.resolveForHandler({ ...access, binding: binding(), descriptor: descriptor() }),
      undefined
    );
  });

  it('resolves only descriptor-declared secret parameters for a handler', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const actionBinding = binding();
    const credentialSlot = slot(actionBinding);
    const labelSlot = slot(actionBinding, 'label');
    await provider.replace({ requesterBrandId: brandId, slot: credentialSlot, value: 'handler-secret' });
    await provider.replace({ requesterBrandId: brandId, slot: labelSlot, value: 'must-not-resolve' });

    const secrets = await resolveActionHandlerSecrets(
      provider,
      { brandId, recordTypeKey },
      actionBinding,
      descriptor()
    );
    assert.deepEqual(Object.keys(secrets), ['credential']);
    assert.equal(secrets.credential?.reveal(), 'handler-secret');
    assert.equal(Object.isFrozen(secrets), true);
    assert.equal(JSON.stringify(secrets).includes('handler-secret'), false);
    assert.equal(storage.operations.filter(operation => operation === 'resolve').length, 1);

    let receivedSecret = '';
    let receivedNames: string[] = [];
    const handler: ActionHandler = (_context, _parameters, handlerSecrets) => {
      receivedNames = Object.keys(handlerSecrets);
      receivedSecret = handlerSecrets.credential?.reveal() ?? '';
      return { schemaVersion: 1, kind: 'no-change' };
    };
    await handler(actionContext(), actionBinding.parameters, secrets);
    assert.deepEqual(receivedNames, ['credential']);
    assert.equal(receivedSecret, 'handler-secret');

    await expectProviderError(
      provider.resolveForHandler({
        requesterBrandId: brandId,
        slot: labelSlot,
        binding: actionBinding,
        descriptor: descriptor(),
      }),
      'handler-secret-access-denied'
    );
    assert.equal(storage.operations.filter(operation => operation === 'resolve').length, 1);
  });

  it('fails closed when a descriptor-required slot is absent and omits an absent optional slot', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const actionBinding = binding();

    await expectProviderError(
      resolveActionHandlerSecrets(provider, { brandId, recordTypeKey }, actionBinding, descriptor()),
      'required-secret-not-configured'
    );

    const optional = descriptor([
      { name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: false },
    ]);
    assert.deepEqual(
      await resolveActionHandlerSecrets(provider, { brandId, recordTypeKey }, actionBinding, optional),
      {}
    );
  });

  it('denies cross-brand reads, state checks, writes, retained no-ops, and clears before storage access', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const secretSlot = slot();
    const ownerAccess = { requesterBrandId: brandId, slot: secretSlot };
    await provider.replace({ ...ownerAccess, value: 'owned-secret' });
    const operationCount = storage.operations.length;
    const deniedAccess = { requesterBrandId: 'brand-beta', slot: secretSlot };

    await expectProviderError(provider.write(deniedAccess), 'cross-brand-secret-access');
    await expectProviderError(provider.replace({ ...deniedAccess, value: 'replacement' }), 'cross-brand-secret-access');
    await expectProviderError(provider.clear(deniedAccess), 'cross-brand-secret-access');
    await expectProviderError(provider.isConfigured(deniedAccess), 'cross-brand-secret-access');
    await expectProviderError(
      provider.resolveForHandler({
        ...deniedAccess,
        binding: binding(),
        descriptor: descriptor(),
      }),
      'cross-brand-secret-access'
    );

    assert.equal(storage.operations.length, operationCount);
    assert.equal(await provider.isConfigured(ownerAccess), true);
  });

  it('rejects tampered slots and handler identity or declaration mismatches before storage access', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const actionBinding = binding();
    const credentialSlot = slot(actionBinding);
    const access = { requesterBrandId: brandId, slot: credentialSlot };

    await expectProviderError(
      provider.isConfigured({ ...access, slot: { ...credentialSlot, parameterName: 'apiToken' } }),
      'invalid-secret-slot'
    );

    const mismatches = [
      {
        binding: binding('secondary'),
        descriptor: descriptor(),
      },
      {
        binding: actionBinding,
        descriptor: { ...descriptor(), id: parseActionDefinitionId('org.redbox.other-action') },
      },
      {
        binding: actionBinding,
        descriptor: { ...descriptor(), contractVersion: 2 },
      },
      {
        binding: actionBinding,
        descriptor: descriptor([{ name: 'credential', title: 'Credential', kind: 'string', required: true }]),
      },
    ];
    for (const mismatch of mismatches) {
      await expectProviderError(provider.resolveForHandler({ ...access, ...mismatch }), 'handler-secret-access-denied');
    }

    assert.deepEqual(storage.operations, []);
  });

  it('normalizes adapter failures and rejects oversized values without disclosing material', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const access = { requesterBrandId: brandId, slot: slot() };
    const sentinel = 'provider-failure-raw-secret';
    storage.failWith = `adapter exposed ${sentinel}`;

    const error = await expectProviderError(
      provider.replace({ ...access, value: sentinel }),
      'secret-provider-failure',
      sentinel
    );
    assert.equal('cause' in error, false);
    const forgedError = new ActionSecretProviderError(sentinel as ActionSecretProviderErrorCode);
    assert.equal(forgedError.code, 'secret-provider-failure');
    assert.equal(JSON.stringify(forgedError).includes(sentinel), false);

    storage.failWith = undefined;
    const oversized = 's'.repeat(ACTION_SECRET_LIMITS.maxSecretBytes + 1);
    await expectProviderError(provider.replace({ ...access, value: oversized }), 'invalid-secret-value', oversized);
    assert.equal(storage.values.size, 0);
  });

  it('redacts adapter causes across clear, resolve, and configured-state failures', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const access = { requesterBrandId: brandId, slot: slot() };
    const sentinel = 'adapter-cause-secret';
    storage.failWith = `adapter exposed ${sentinel}`;
    const operations = [
      () => provider.clear(access),
      () => provider.isConfigured(access),
      () => provider.resolveForHandler({ ...access, binding: binding(), descriptor: descriptor() }),
    ];

    for (const operation of operations) {
      const error = await expectProviderError(operation(), 'secret-provider-failure', sentinel);
      assert.equal('cause' in error, false);
    }
  });

  it('keeps raw values out of binding, descriptor, resolved-secret, and error serialization', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const actionBinding = binding();
    const secretSlot = slot(actionBinding);
    const sentinel = 'never-serialize-this-secret';
    assert.equal(
      actionSecretParameterSchema.safeParse({
        name: 'credential',
        title: 'Credential',
        kind: 'secret',
        writeOnly: true,
        required: true,
        defaultValue: sentinel,
      }).success,
      false
    );
    assert.throws(() =>
      parseActionBinding({
        ...actionBinding,
        parameters: {
          credential: { kind: 'secret', configured: true, value: sentinel },
        },
      })
    );
    await provider.replace({ requesterBrandId: brandId, slot: secretSlot, value: sentinel });
    const secrets = await resolveActionHandlerSecrets(
      provider,
      { brandId, recordTypeKey },
      actionBinding,
      descriptor()
    );

    const publicMaterial = JSON.stringify({
      binding: actionBinding,
      descriptor: descriptor(),
      diagnostics: { configured: await provider.isConfigured({ requesterBrandId: brandId, slot: secretSlot }) },
      handlerSecrets: secrets,
    });
    assert.equal(publicMaterial.includes(sentinel), false);
    assert.equal(publicMaterial.includes('[REDACTED]'), true);
    assert.equal(inspect(secrets).includes(sentinel), false);
  });

  it('emits no any or unknown type nodes from A06 runtime sources', () => {
    const sourceDirectory = path.resolve(__dirname, '../src/action-registry');
    const runtimeFiles = ['contracts.ts', 'index.ts', 'secrets.ts'];
    const failures: string[] = [];

    for (const fileName of runtimeFiles) {
      const sourcePath = path.join(sourceDirectory, fileName);
      const sourceText = fs.readFileSync(sourcePath, 'utf8');
      const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.ES2024, true, ts.ScriptKind.TS);
      failures.push(...forbiddenTypeKeywords(sourceFile));

      const declaration = ts.transpileDeclaration(sourceText, {
        fileName: sourcePath,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          strict: true,
          declaration: true,
          declarationMap: false,
        },
      });
      const diagnostics = declaration.diagnostics ?? [];
      assert.equal(
        diagnostics.length,
        0,
        ts.formatDiagnostics(diagnostics, {
          getCanonicalFileName: name => name,
          getCurrentDirectory: () => process.cwd(),
          getNewLine: () => '\n',
        })
      );
      const declarationFile = ts.createSourceFile(
        sourcePath.replace(/\.ts$/, '.d.ts'),
        declaration.outputText,
        ts.ScriptTarget.ES2024,
        true,
        ts.ScriptKind.TS
      );
      failures.push(...forbiddenTypeKeywords(declarationFile));
    }

    assert.deepEqual(failures, []);
  });
});
