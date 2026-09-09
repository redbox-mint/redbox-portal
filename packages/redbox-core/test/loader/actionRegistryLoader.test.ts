import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { compileFunction } from 'node:vm';
import * as ActionRegistry from '../../src/action-registry';

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

async function createHook(
  appPath: string,
  packageName: string,
  registrationBody: string,
  main = 'index.js'
): Promise<void> {
  const modulePath = path.join(appPath, 'node_modules', packageName);
  await fs.mkdir(modulePath, { recursive: true });
  await fs.writeFile(
    path.join(modulePath, 'package.json'),
    JSON.stringify({
      name: packageName,
      version: '1.0.0',
      main,
      sails: { hasActions: true },
    })
  );
  await fs.mkdir(path.dirname(path.join(modulePath, main)), { recursive: true });
  await fs.writeFile(path.join(modulePath, main), registrationBody);
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

  it('uses capability metadata and records the resolved package entry module', async function () {
    const packageName = 'redbox-hook-capability-actions';
    await createHook(
      appPath,
      packageName,
      registrationExport(actionDescriptor('org.redbox.capability-action')),
      'lib/actions.js'
    );
    await writeAppPackage(appPath, [packageName]);
    const moduleRoot = path.join(appPath, 'node_modules', packageName);
    const packagePath = path.join(moduleRoot, 'package.json');
    const metadata = { name: packageName, version: '1.0.0', main: 'lib/actions.js', sails: { hasActions: true } };
    await fs.writeFile(packagePath, JSON.stringify(metadata));
    assert.deepEqual(
      findAndRegisterActions(appPath).actionRegistry.getDescriptor('org.redbox.capability-action')?.provenance,
      {
        packageName,
        moduleName: 'lib/actions.js',
      }
    );
    metadata.sails.hasActions = false;
    await fs.writeFile(packagePath, JSON.stringify(metadata));
    const withoutCapability = findAndRegisterActions(appPath);
    assert.equal(withoutCapability.actionRegistry.getDescriptor('org.redbox.capability-action'), undefined);
    assert.deepEqual(withoutCapability.hookActions, []);
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

  it('supports an empty registry and rejects core/hook and same-source collisions', async function () {
    const empty = ActionRegistry.buildActionRegistry([]);
    assert.equal(empty.size, 0);
    assert.equal(empty.serializeDescriptorMetadata(), '[]');
    assert.equal(Object.isFrozen(empty.descriptorMetadata), true);

    const packageName = 'redbox-hook-core-collision';
    await createHook(appPath, packageName, registrationExport(actionDescriptor(BUILT_IN_ACTION_IDS.applyTemplates)));
    await writeAppPackage(appPath, [packageName]);
    assert.equal(captureRegistrationError(() => findAndRegisterActions(appPath)).code, 'duplicate-action-id');

    const descriptor = actionDescriptor('org.redbox.same-source');
    await createHook(appPath, packageName, registrationExport(`${descriptor}, ${descriptor}`));
    assert.equal(captureRegistrationError(() => findAndRegisterActions(appPath)).code, 'duplicate-action-id');
  });

  it('rejects malformed original descriptors before copying or reading their fields', async function () {
    const packageName = 'redbox-hook-original-descriptor';
    for (const mutation of [
      `Object.defineProperty(descriptor, 'title', { enumerable: true, get() { throw new Error('getter executed'); } });`,
      `Object.defineProperty(descriptor, 'internal', { value: 'hidden' });`,
      `Object.defineProperty(descriptor, 'title', { value: 'hidden title', enumerable: false });`,
      `descriptor.handler = 'RecordsService.update';`,
      `descriptor.contractVersion = 0;`,
      `descriptor.internal = { handler: function () {} };`,
    ]) {
      await createHook(
        appPath,
        packageName,
        `
module.exports.registerRedboxActions = function () {
  const descriptor = ${actionDescriptor('org.redbox.original-descriptor')};
  ${mutation}
  return [descriptor];
};`
      );
      await writeAppPackage(appPath, [packageName]);
      assert.equal(captureRegistrationError(() => findAndRegisterActions(appPath)).code, 'invalid-action-registration');
    }

    let getterCalls = 0;
    const [descriptor] = ActionRegistry.registerRedboxActions();
    const accessorDescriptor = { ...descriptor };
    Object.defineProperty(accessorDescriptor, 'title', {
      enumerable: true,
      get() {
        getterCalls++;
        return 'getter title';
      },
    });
    assert.equal(
      captureRegistrationError(() =>
        ActionRegistry.buildActionRegistry([
          ActionRegistry.actionRegistrationSource('test-hook', 'index.js', () => [accessorDescriptor]),
        ])
      ).code,
      'invalid-action-registration'
    );
    assert.equal(getterCalls, 0);
  });

  it('rejects unsafe returned collections without getters or traps in direct builders and generated shims', async function () {
    const packageName = 'redbox-hook-collection-boundary';
    await createHook(appPath, packageName, registrationExport(''));
    await writeAppPackage(appPath, [packageName]);
    const discovered = findAndRegisterActions(appPath);
    await generateActionRegistryConfigShim(path.join(appPath, 'config'), discovered.hookActions);
    const content = await fs.readFile(path.join(appPath, 'config', 'actionRegistry.js'), 'utf8');
    const [coreDescriptor] = ActionRegistry.registerRedboxActions();
    const descriptor = { ...coreDescriptor, id: 'org.redbox.collection-boundary' };
    let calls = 0;
    const trap = () => {
      calls++;
      throw new Error('private collection details');
    };
    const traps = { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap, has: trap };
    const revokedArray = Proxy.revocable([], traps);
    const revokedDescriptor = Proxy.revocable({}, traps);
    revokedArray.revoke();
    revokedDescriptor.revoke();
    const unsafe: RuntimeValue[] = [
      Object.defineProperty([descriptor], '0', { get: trap }),
      Object.defineProperty([descriptor], '0', { enumerable: false }),
      Object.defineProperty([descriptor], 'private', { value: 'private collection details' }),
      Object.assign([descriptor], { extra: true }),
      Object.assign([descriptor], { [Symbol.iterator]: trap }),
      Object.defineProperty([descriptor], Symbol.iterator, { get: trap }),
      Object.assign([descriptor], { [Symbol('private')]: true }),
      Object.setPrototypeOf([descriptor], new Proxy(Array.prototype, traps)),
      new Proxy([descriptor], traps),
      new Proxy({}, traps),
      new Proxy(Promise.resolve([]), traps),
      revokedArray.proxy,
      [revokedDescriptor.proxy],
      [new Proxy(descriptor, traps)],
      [Object.defineProperty({ ...descriptor }, 'title', { get: trap })],
      Object.defineProperty({}, 'then', { get: trap }),
      new Array(1),
      new Array(50_001),
      null,
    ];
    const executeShim = (registerRedboxActions: () => RuntimeValue) => {
      const output = { exports: {} };
      compileFunction(content, ['require', 'module'])(
        (name: string) =>
          name === '@researchdatabox/redbox-core'
            ? { ActionRegistry, registerRedboxActions: ActionRegistry.registerRedboxActions }
            : { registerRedboxActions },
        output
      );
    };
    const executeDirect = (registerRedboxActions: () => RuntimeValue) => {
      ActionRegistry.buildActionRegistry([
        ActionRegistry.actionRegistrationSource(packageName, 'index.js', registerRedboxActions),
      ]);
    };
    for (const execute of [executeDirect, executeShim]) {
      for (const value of unsafe) {
        const error = captureRegistrationError(() => execute(() => value));
        assert.equal(error.code, 'invalid-action-registration');
        assert.equal(error.cause, undefined);
        assert.equal(error.stack?.includes('private collection details'), false);
        assert.ok(error.message.length < 256);
        assert.equal(calls, 0);
      }
      for (const value of [
        Object.freeze([descriptor]),
        Object.setPrototypeOf([descriptor], null),
        Object.freeze([]),
        Object.freeze([Object.setPrototypeOf({ ...descriptor }, null)]),
      ]) {
        assert.doesNotThrow(() => execute(() => value));
      }
      for (const registration of [
        () => Promise.resolve([]),
        () => Object.defineProperty(Promise.resolve([]), 'catch', { get: trap }),
        () => Object.defineProperty(Promise.resolve([]), 'constructor', { get: trap }),
        () => Object.setPrototypeOf(Promise.resolve([]), new Proxy(Promise.prototype, traps)),
        () => Promise.reject(new Error('private collection details')),
        async () => [],
        async () => {
          throw new Error('private collection details');
        },
      ]) {
        const error = captureRegistrationError(() => execute(registration));
        assert.equal(error.code, 'asynchronous-action-registration');
        assert.equal(error.cause, undefined);
        assert.equal(error.stack?.includes('private collection details'), false);
        assert.equal(calls, 0);
      }
      const error = captureRegistrationError(() => execute(trap));
      assert.equal(error.code, 'invalid-action-registration');
      assert.equal(error.cause, undefined);
      assert.equal(error.stack?.includes('private collection details'), false);
      calls = 0;
    }
    await new Promise(resolve => setImmediate(resolve));
  });

  it('detaches and deeply freezes public metadata while retaining direct handler identity', function () {
    const [original] = ActionRegistry.registerRedboxActions();
    const descriptor = { ...original, contexts: [...original.contexts] };
    const registry = ActionRegistry.buildActionRegistry([
      ActionRegistry.actionRegistrationSource('test-hook', 'lib/actions.js', () => [descriptor]),
    ]);
    const metadata = registry.getDescriptor(descriptor.id)!;
    assert.equal(registry.getHandler(descriptor.id, descriptor.contractVersion), descriptor.handler);
    assert.deepEqual(metadata.provenance, { packageName: 'test-hook', moduleName: 'lib/actions.js' });
    const serialized = registry.serializeDescriptorMetadata();
    descriptor.contexts.push('queued-record-action');
    assert.equal(registry.serializeDescriptorMetadata(), serialized);
    function assertFrozenData(value: object): void {
      assert.equal(Object.isFrozen(value), true);
      for (const child of Object.values(value)) {
        assert.notEqual(typeof child, 'function');
        if (child !== null && typeof child === 'object') assertFrozenData(child);
      }
    }
    assertFrozenData(registry.descriptorMetadata);
    assert.equal(Object.hasOwn(metadata, 'handler'), false);
    assert.equal(serialized.includes('#actions'), false);
    assert.throws(() => {
      (metadata.contexts as string[]).push('interactive');
    }, TypeError);
  });

  it('executes generated startup shims and revalidates registrations on every load', async function () {
    const packageName = 'redbox-hook-startup-actions';
    await createHook(appPath, packageName, registrationExport(actionDescriptor('org.redbox.startup-action')));
    await writeAppPackage(appPath, [packageName]);
    const registrations = findAndRegisterActions(appPath);
    await generateActionRegistryConfigShim(path.join(appPath, 'config'), registrations.hookActions);
    const content = await fs.readFile(path.join(appPath, 'config', 'actionRegistry.js'), 'utf8');
    const fixtureRequire = createRequire(path.join(appPath, 'package.json'));
    const execute = () => {
      const output = {
        exports: {} as {
          actionRegistry: ActionRegistry.RedboxActionRegistry;
          actionDescriptors: readonly ActionRegistry.ActionDescriptorMetadata[];
        },
      };
      compileFunction(content, ['require', 'module'])(
        (name: string) =>
          name === '@researchdatabox/redbox-core'
            ? { ActionRegistry, registerRedboxActions: ActionRegistry.registerRedboxActions }
            : fixtureRequire(name),
        output
      );
      return output.exports;
    };
    const loaded = execute();
    assert.equal(loaded.actionDescriptors, loaded.actionRegistry.descriptorMetadata);
    assert.equal(
      loaded.actionRegistry.serializeDescriptorMetadata(),
      registrations.actionRegistry.serializeDescriptorMetadata()
    );

    // Reuse the generated file, as startup does when shim regeneration is skipped.
    for (const [body, code] of [
      [registrationExport(actionDescriptor(BUILT_IN_ACTION_IDS.applyTemplates)), 'duplicate-action-id'],
      [
        registrationExport(actionDescriptor(BUILT_IN_ACTION_IDS.applyTemplates, 2)),
        'inconsistent-action-contract-version',
      ],
      [registrationExport(actionDescriptor('org.redbox.startup-action', 1, false)), 'invalid-action-registration'],
      ['module.exports.registerRedboxActions = () => null;', 'invalid-action-registration'],
      [
        'module.exports.registerRedboxActions = () => { throw new Error("private details"); };',
        'invalid-action-registration',
      ],
      [
        'module.exports.registerRedboxActions = async () => { throw new Error("private details"); };',
        'asynchronous-action-registration',
      ],
      ['module.exports.registerRedboxActions = async () => [];', 'asynchronous-action-registration'],
      ['module.exports = {};', 'invalid-action-registration'],
    ]) {
      await createHook(appPath, packageName, body);
      const error = captureRegistrationError(execute);
      assert.equal(error.code, code);
      assert.equal(error.message.includes('private details'), false);
    }
    // Allow the rejected async registration's rejection handler to settle.
    await new Promise(resolve => setImmediate(resolve));
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
    await writeAppPackage(appPath, [alpha, zeta], [alpha, zeta]);
    const second = findAndRegisterActions(appPath);
    const secondGeneration = await generateActionRegistryConfigShim(path.join(appPath, 'config'), second.hookActions);
    const secondContent = await fs.readFile(path.join(appPath, 'config', 'actionRegistry.js'), 'utf8');

    assert.deepEqual(firstGeneration, { generated: 1, total: 1 });
    assert.deepEqual(secondGeneration, { generated: 0, total: 1 });
    assert.equal(secondContent, firstContent);
  });
});
