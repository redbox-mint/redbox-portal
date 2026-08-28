import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import { ActionValidationFailure, createActionExecutionOperation } from '../../../src/action-execution';
import { ACTION_CONTRACT_LIMITS, ActionPlanValidationError } from '../../../src/action-registry';
import type { RuntimeRecord, RuntimeValue } from '../../../src/runtimeValues';
import {
  RegisteredRecordActionCoordinator,
  closedRecordActionSecretProvider,
  coreRecordActionRegistry,
  resolveRecordActionPlan,
} from '../../../src/services/record-actions/coordinator';

function emptyCoordinator(): RegisteredRecordActionCoordinator {
  const registry = coreRecordActionRegistry();
  return new RegisteredRecordActionCoordinator({
    registry,
    secretProvider: closedRecordActionSecretProvider(registry),
    recordType: {
      actionPlan: {
        schemaVersion: 1,
        recordTypeKey: 'rdmp',
        bindings: [],
      },
    },
    recordTypeKey: 'rdmp',
    brandId: 'default',
    actor: null,
    operation: createActionExecutionOperation('onCreate'),
  });
}

function assertCandidateRejected(candidate: RuntimeRecord): void {
  assert.throws(() => emptyCoordinator().runSequential(candidate, 'onCreate', 'pre'), ActionValidationFailure);
}

describe('registered record-action context projection', () => {
  it('rejects an accessor-bearing legacy hook array without invoking its getter', () => {
    let getterInvocations = 0;
    const legacyHooks: RuntimeValue[] = [];
    Object.defineProperty(legacyHooks, '0', {
      configurable: true,
      enumerable: true,
      get: () => {
        getterInvocations += 1;
        return {
          function: 'sails.services.rdmpservice.runTemplates',
          options: { templates: [] },
        };
      },
    });

    assert.throws(
      () => resolveRecordActionPlan(coreRecordActionRegistry(), { hooks: { onCreate: { pre: legacyHooks } } }, 'rdmp'),
      ActionPlanValidationError
    );
    assert.equal(getterInvocations, 0);
  });

  it('rejects a billion-length array Proxy promptly without invoking a trap', () => {
    let trapInvocations = 0;
    const target: RuntimeValue[] = [];
    target.length = 1_000_000_000;
    const hostileArray = new Proxy(target, {
      get: () => {
        trapInvocations += 1;
        return 1_000_000_000;
      },
      getOwnPropertyDescriptor: () => {
        trapInvocations += 1;
        return undefined;
      },
      getPrototypeOf: () => {
        trapInvocations += 1;
        return Array.prototype;
      },
      ownKeys: () => {
        trapInvocations += 1;
        return ['length'];
      },
    });
    const startedAt = performance.now();

    assertCandidateRejected({ metadata: hostileArray });

    assert.equal(trapInvocations, 0);
    assert.equal(performance.now() - startedAt < 250, true);
  });

  it('rejects oversized, sparse, deep, cyclic, accessor, inherited, and non-JSON candidates boundedly', () => {
    const oversizedArray = Array<ActionJsonNull>(ACTION_CONTRACT_LIMITS.maxArrayItems + 1).fill(null);
    const sparseArray: RuntimeValue[] = [];
    sparseArray.length = 2;
    sparseArray[1] = null;

    const deepValue: RuntimeRecord = {};
    let cursor = deepValue;
    for (let depth = 0; depth <= ACTION_CONTRACT_LIMITS.maxJsonDepth; depth += 1) {
      const child: RuntimeRecord = {};
      cursor.child = child;
      cursor = child;
    }

    const cyclicValue: RuntimeRecord = {};
    cyclicValue.self = cyclicValue;

    let accessorInvocations = 0;
    const accessorValue: RuntimeRecord = {};
    Object.defineProperty(accessorValue, 'payload', {
      configurable: true,
      enumerable: true,
      get: () => {
        accessorInvocations += 1;
        return 'must-not-run';
      },
    });

    let inheritedAccessorInvocations = 0;
    const inheritedPrototype = Object.defineProperty({}, 'polluted', {
      configurable: true,
      enumerable: true,
      get: () => {
        inheritedAccessorInvocations += 1;
        return true;
      },
    });
    const inheritedValue = Object.assign(Object.create(inheritedPrototype), { safe: true }) as RuntimeRecord;
    const prototypeKeyValue = JSON.parse('{"__proto__":null}') as RuntimeRecord;
    const oversizedObject: RuntimeRecord = {};
    for (let index = 0; index <= ACTION_CONTRACT_LIMITS.maxObjectProperties; index += 1) {
      oversizedObject[`field${index}`] = null;
    }

    const nonJsonValues: RuntimeValue[] = [1n, Symbol('not-json'), Number.NaN, new Date(0), (() => true) as never];
    const candidates: RuntimeRecord[] = [
      { metadata: oversizedArray },
      { metadata: sparseArray },
      { metadata: deepValue },
      { metadata: cyclicValue },
      { metadata: accessorValue },
      { metadata: inheritedValue },
      { metadata: prototypeKeyValue },
      { metadata: oversizedObject },
      ...nonJsonValues.map(payload => ({ metadata: { payload } })),
    ];

    const startedAt = performance.now();
    for (const candidate of candidates) {
      assertCandidateRejected(candidate);
    }

    assert.equal(accessorInvocations, 0);
    assert.equal(inheritedAccessorInvocations, 0);
    assert.equal(performance.now() - startedAt < 500, true);
  });

  it('retains the documented array and object cardinality boundaries', async () => {
    const boundaryArray = Array<ActionJsonNull>(ACTION_CONTRACT_LIMITS.maxArrayItems).fill(null);
    const boundaryObject: RuntimeRecord = {};
    for (let index = 0; index < ACTION_CONTRACT_LIMITS.maxObjectProperties; index += 1) {
      boundaryObject[`field${index}`] = null;
    }

    const result = await emptyCoordinator().runSequential(
      { metadata: { boundaryArray, boundaryObject, omittedUndefined: undefined } },
      'onCreate',
      'pre'
    );

    assert.equal(result.report.status, 'completed');
    const projectedCandidate = result.candidate;
    if (projectedCandidate === undefined) {
      assert.fail('Expected the bounded candidate projection.');
    }
    assert.equal(projectedCandidate.metadata !== null, true);
    const metadata = projectedCandidate.metadata;
    assert.equal(metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata), true);
    if (metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)) {
      assert.equal(Object.hasOwn(metadata, 'omittedUndefined'), false);
    }
  });
});

type ActionJsonNull = null;
