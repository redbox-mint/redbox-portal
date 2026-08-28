import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BUILT_IN_ACTION_IDS, ActionRegistryRegistrationError } from '../../src/action-registry';
import { defineRedboxHook } from '../../src/hooks';
import { findAndRegisterActions, generateActionRegistryConfigShim } from '../../src/loader';
import { parseJsonText, type RuntimeValue } from '../../src/runtimeValues';

function actionDescriptor(actionId: string, contractVersion = 1, includeHandler = true): string {
  const handler = includeHandler
    ? `handler: function handler() { return { schemaVersion: 1, kind: 'no-change' }; },`
    : '';
  return `{
    schemaVersion: 1,
    id: ${JSON.stringify(actionId)},
    contractVersion: ${contractVersion},
    title: 'Test action',
    description: 'A test action descriptor.',
    category: 'test',
    ${handler}
    contexts: ['record-lifecycle'],
    modes: ['onCreate'],
    phases: ['pre'],
    allowRepeatedBindings: false,
    parameterSchema: { schemaVersion: 1, parameters: [] },
    outputSchema: { schemaVersion: 1, fields: [], safeFields: [] },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: {
      timeout: { defaultMs: 1000, minMs: 100, maxMs: 2000 },
      retry: { allowed: false }
    }
  }`;
}

async function createHook(appPath: string, packageName: string, registrationBody: string): Promise<void> {
  const modulePath = path.join(appPath, 'node_modules', packageName);
  await fs.mkdir(modulePath, { recursive: true });
  await fs.writeFile(
    path.join(modulePath, 'package.json'),
    JSON.stringify({
      name: packageName,
      version: '1.0.0',
      main: 'index.js',
      sails: { hasActions: true },
    })
  );
  await fs.writeFile(path.join(modulePath, 'index.js'), registrationBody);
  for (const request of [`${packageName}/package.json`, packageName]) {
    try {
      delete require.cache[require.resolve(request, { paths: [appPath] })];
    } catch {
      // A new fixture has no cache entry yet.
    }
  }
}

async function writeAppPackage(
  appPath: string,
  packageNames: readonly string[],
  hookLoadPriority: readonly string[] = []
): Promise<void> {
  const dependencies: Record<string, string> = {};
  for (const packageName of packageNames) {
    dependencies[packageName] = '1.0.0';
  }
  await fs.writeFile(
    path.join(appPath, 'package.json'),
    JSON.stringify({ name: 'action-loader-test', dependencies, hookLoadPriority })
  );
}

function registrationExport(descriptors: string): string {
  return `module.exports.registerRedboxActions = function registerRedboxActions() { return [${descriptors}]; };`;
}

function documentedHookExports(descriptors: string): string {
  return `
const registerRedboxActions = function registerRedboxActions() { return [${descriptors}]; };
const hookFactory = function hookFactory() { return {}; };
hookFactory.registerRedboxActions = registerRedboxActions;
module.exports.registerRedboxActions = registerRedboxActions;
module.exports.default = hookFactory;
`;
}

function captureRegistrationError(action: () => void): ActionRegistryRegistrationError {
  let capturedError: ActionRegistryRegistrationError | undefined;
  assert.throws(action, (error: RuntimeValue) => {
    if (error instanceof ActionRegistryRegistrationError) {
      capturedError = error;
      return true;
    }
    return false;
  });
  if (capturedError !== undefined) {
    return capturedError;
  }
  throw new Error('Expected action registration to fail.');
}

describe('action registry loader', function () {
  let appPath: string;

  beforeEach(async function () {
    appPath = await fs.mkdtemp(path.join(os.tmpdir(), 'redbox-action-loader-'));
    await fs.mkdir(path.join(appPath, 'config'), { recursive: true });
    await writeAppPackage(appPath, []);
  });

  afterEach(async function () {
    await fs.rm(appPath, { recursive: true, force: true });
  });

  it('builds the explicit core registry with every executable legacy migration identity', function () {
    const result = findAndRegisterActions(appPath);

    assert.equal(result.actionRegistry.size, 11);
    assert.deepEqual(
      result.actionRegistry.descriptorMetadata.map(descriptor => descriptor.id).sort(),
      Object.values(BUILT_IN_ACTION_IDS).sort()
    );
    assert.deepEqual(result.hookActions, []);
    assert.equal(JSON.parse(result.actionRegistry.serializeDescriptorMetadata()).length, 11);
  });

  it('exposes synchronous action registration through the typed hook helper', function () {
    const registerRedboxActions = () => [];
    const hook = defineRedboxHook({ registerRedboxActions });

    assert.equal(hook.registerRedboxActions, registerRedboxActions);
  });

  it('accepts a hook that explicitly registers no actions', async function () {
    const packageName = 'redbox-hook-empty-actions';
    await createHook(appPath, packageName, registrationExport(''));
    await writeAppPackage(appPath, [packageName]);

    const result = findAndRegisterActions(appPath);
    assert.equal(result.actionRegistry.size, 11);
    assert.deepEqual(
      result.hookActions.map(hook => hook.packageName),
      [packageName]
    );
  });

  it('discovers hook actions, attaches provenance, and separates handlers from metadata', async function () {
    const packageName = 'redbox-hook-actions';
    await createHook(appPath, packageName, registrationExport(actionDescriptor('org.redbox.hook-action')));
    await writeAppPackage(appPath, [packageName]);

    const result = findAndRegisterActions(appPath);
    const descriptor = result.actionRegistry.getDescriptor('org.redbox.hook-action');

    assert.equal(result.actionRegistry.size, 12);
    assert.equal(descriptor?.provenance.packageName, packageName);
    assert.equal(descriptor?.provenance.moduleName, 'index.js');
    assert.equal(Object.hasOwn(descriptor ?? {}, 'handler'), false);
    assert.equal(Object.isFrozen(descriptor), true);
    assert.equal(Object.isFrozen(descriptor?.parameterSchema), true);
    assert.equal(typeof result.actionRegistry.getHandler('org.redbox.hook-action', 1), 'function');
    assert.equal(result.actionRegistry.getHandler('org.redbox.hook-action', 2), undefined);
    assert.equal(result.actionRegistry.serializeDescriptorMetadata().includes('handler'), false);
    assert.doesNotThrow(() => parseJsonText(result.actionRegistry.serializeDescriptorMetadata()));
  });

  it('discovers the documented named registration export alongside a default hook factory', async function () {
    const packageName = 'redbox-hook-documented-actions';
    await createHook(
      appPath,
      packageName,
      documentedHookExports(actionDescriptor('org.redbox.documented-hook-action'))
    );
    await writeAppPackage(appPath, [packageName]);

    const result = findAndRegisterActions(appPath);

    assert.equal(
      result.actionRegistry.getDescriptor('org.redbox.documented-hook-action')?.provenance.packageName,
      packageName
    );
  });

  it('rejects duplicate IDs regardless of hook priority', async function () {
    const alpha = 'redbox-hook-alpha-actions';
    const zeta = 'redbox-hook-zeta-actions';
    const descriptor = actionDescriptor('org.redbox.duplicate-action');
    await createHook(appPath, alpha, registrationExport(descriptor));
    await createHook(appPath, zeta, registrationExport(descriptor));

    await writeAppPackage(appPath, [alpha, zeta], [alpha, zeta]);
    const firstError = captureRegistrationError(() => findAndRegisterActions(appPath));
    assert.equal(firstError.code, 'duplicate-action-id');

    await writeAppPackage(appPath, [alpha, zeta], [zeta, alpha]);
    const secondError = captureRegistrationError(() => findAndRegisterActions(appPath));
    assert.equal(secondError.code, 'duplicate-action-id');
  });

  it('rejects conflicting contract versions for the same action ID', async function () {
    const alpha = 'redbox-hook-version-one';
    const beta = 'redbox-hook-version-two';
    await createHook(appPath, alpha, registrationExport(actionDescriptor('org.redbox.versioned-action', 1)));
    await createHook(appPath, beta, registrationExport(actionDescriptor('org.redbox.versioned-action', 2)));
    await writeAppPackage(appPath, [alpha, beta]);

    const error = captureRegistrationError(() => findAndRegisterActions(appPath));
    assert.equal(error.code, 'inconsistent-action-contract-version');
  });

  it('rejects missing handlers and malformed registry exports', async function () {
    const missingHandler = 'redbox-hook-missing-handler';
    await createHook(
      appPath,
      missingHandler,
      registrationExport(actionDescriptor('org.redbox.missing-handler', 1, false))
    );
    await writeAppPackage(appPath, [missingHandler]);
    assert.equal(captureRegistrationError(() => findAndRegisterActions(appPath)).code, 'invalid-action-registration');

    const malformed = 'redbox-hook-malformed-actions';
    await createHook(
      appPath,
      malformed,
      `module.exports.registerRedboxActions = function registerRedboxActions() { return {}; };`
    );
    await writeAppPackage(appPath, [malformed]);
    assert.equal(captureRegistrationError(() => findAndRegisterActions(appPath)).code, 'invalid-action-registration');
  });

  it('rejects asynchronous registration and a missing registration export', async function () {
    const asynchronous = 'redbox-hook-async-actions';
    await createHook(
      appPath,
      asynchronous,
      `module.exports.registerRedboxActions = async function registerRedboxActions() { return []; };`
    );
    await writeAppPackage(appPath, [asynchronous]);
    assert.equal(
      captureRegistrationError(() => findAndRegisterActions(appPath)).code,
      'asynchronous-action-registration'
    );

    const missingExport = 'redbox-hook-no-action-export';
    await createHook(appPath, missingExport, `module.exports.value = true;`);
    await writeAppPackage(appPath, [missingExport]);
    assert.throws(
      () => findAndRegisterActions(appPath),
      /has 'hasActions: true' but no direct 'registerRedboxActions'/
    );

    const defaultOnly = 'redbox-hook-default-only-actions';
    await createHook(
      appPath,
      defaultOnly,
      `
const hookFactory = function hookFactory() { return {}; };
hookFactory.registerRedboxActions = function registerRedboxActions() { return []; };
module.exports.default = hookFactory;
`
    );
    await writeAppPackage(appPath, [defaultOnly]);
    assert.throws(
      () => findAndRegisterActions(appPath),
      /has 'hasActions: true' but no direct 'registerRedboxActions'/
    );
  });

  it('orders metadata and generated shim sources deterministically', async function () {
    const alpha = 'redbox-hook-alpha-order';
    const zeta = 'redbox-hook-zeta-order';
    await createHook(appPath, zeta, registrationExport(actionDescriptor('org.redbox.zeta-action')));
    await createHook(appPath, alpha, registrationExport(actionDescriptor('org.redbox.alpha-action')));
    await writeAppPackage(appPath, [zeta, alpha], [zeta]);

    const first = findAndRegisterActions(appPath);
    assert.deepEqual(
      first.actionRegistry.descriptorMetadata
        .map(descriptor => descriptor.id)
        .filter(actionId => actionId.startsWith('org.redbox.')),
      ['org.redbox.alpha-action', 'org.redbox.zeta-action']
    );
    assert.deepEqual(
      first.hookActions.map(hook => hook.packageName),
      [alpha, zeta]
    );

    const firstGeneration = await generateActionRegistryConfigShim(path.join(appPath, 'config'), first.hookActions);
    const firstContent = await fs.readFile(path.join(appPath, 'config', 'actionRegistry.js'), 'utf8');
    const second = findAndRegisterActions(appPath);
    const secondGeneration = await generateActionRegistryConfigShim(path.join(appPath, 'config'), second.hookActions);
    const secondContent = await fs.readFile(path.join(appPath, 'config', 'actionRegistry.js'), 'utf8');

    assert.deepEqual(firstGeneration, { generated: 1, total: 1 });
    assert.deepEqual(secondGeneration, { generated: 0, total: 1 });
    assert.equal(secondContent, firstContent);
  });
});
