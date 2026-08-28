import { strict as assert } from 'node:assert';
import { Effect } from 'effect';
import {
  ActionConfigurationError,
  ActionDomainFailure,
  ActionInterruptedFailure,
  ActionTimeoutFailure,
  ActionTransientFailure,
  ActionValidationFailure,
  createActionExecutionOperation,
  createPhaseContext,
  normalizeActionFailure,
  runActionPlan,
} from '../../src/action-execution';
import { RBValidationError } from '../../src/model/RBValidationError';

describe('action failure normalization', () => {
  it('preserves every valid branded failure branch without exposing arbitrary messages', () => {
    assert.deepEqual(normalizeActionFailure(new ActionConfigurationError('private configuration detail')), {
      kind: 'configuration',
      code: 'invalid-hook-execution-policy',
    });
    assert.deepEqual(normalizeActionFailure(new RBValidationError({ message: 'private validation detail' })), {
      kind: 'validation',
      code: 'record-validation-failed',
    });
    assert.deepEqual(normalizeActionFailure(new ActionValidationFailure('private action detail')), {
      kind: 'validation',
      code: 'action-validation-failed',
    });
    assert.deepEqual(
      normalizeActionFailure(new ActionDomainFailure('private domain detail', 'provider.retry-1', ' Try later ')),
      { kind: 'domain', code: 'provider.retry-1', summary: 'Try later' }
    );
    assert.deepEqual(normalizeActionFailure(new ActionTransientFailure('private transient detail')), {
      kind: 'transient',
      code: 'action-transient-failed',
      summary: undefined,
    });
    assert.deepEqual(normalizeActionFailure(new ActionTimeoutFailure(false), true), {
      kind: 'timeout',
      code: 'action-timeout',
      cancellationCooperative: false,
    });
    assert.deepEqual(normalizeActionFailure(new ActionInterruptedFailure(true), false), {
      kind: 'interrupted',
      code: 'action-interrupted',
      cancellationCooperative: true,
    });
    assert.deepEqual(normalizeActionFailure(new Error('private unexpected detail')), {
      kind: 'unexpected',
      code: 'action-unexpected-failure',
    });
  });

  it('never invokes own or inherited accessors while inspecting structural failures', () => {
    let ownTagReads = 0;
    const ownTagAccessor = Object.defineProperty({}, '_tag', {
      get: () => {
        ownTagReads += 1;
        throw new Error('must not execute');
      },
    });
    assert.deepEqual(normalizeActionFailure(ownTagAccessor), {
      kind: 'unexpected',
      code: 'action-unexpected-failure',
    });
    assert.equal(ownTagReads, 0);

    let ownCodeReads = 0;
    const ownCodeAccessor = Object.defineProperty({ _tag: 'ActionDomainFailure' }, 'code', {
      get: () => {
        ownCodeReads += 1;
        throw new Error('must not execute');
      },
    });
    assert.deepEqual(normalizeActionFailure(ownCodeAccessor), {
      kind: 'unexpected',
      code: 'action-unexpected-failure',
    });
    assert.equal(ownCodeReads, 0);

    let ownCancellationReads = 0;
    const ownCancellationAccessor = Object.defineProperty({ _tag: 'ActionTimeoutFailure' }, 'cancellationCooperative', {
      get: () => {
        ownCancellationReads += 1;
        throw new Error('must not execute');
      },
    });
    assert.deepEqual(normalizeActionFailure(ownCancellationAccessor), {
      kind: 'unexpected',
      code: 'action-unexpected-failure',
    });
    assert.equal(ownCancellationReads, 0);

    let ownNameReads = 0;
    const ownNameAccessor = Object.defineProperty(new Error('private detail'), 'name', {
      get: () => {
        ownNameReads += 1;
        throw new Error('must not execute');
      },
    });
    assert.deepEqual(normalizeActionFailure(ownNameAccessor), {
      kind: 'unexpected',
      code: 'action-unexpected-failure',
    });
    assert.equal(ownNameReads, 0);

    let inheritedTagReads = 0;
    const prototype = Object.defineProperty({}, '_tag', {
      get: () => {
        inheritedTagReads += 1;
        throw new Error('must not execute');
      },
    });
    const inheritedTagAccessor = Object.create(prototype);
    assert.deepEqual(normalizeActionFailure(inheritedTagAccessor), {
      kind: 'unexpected',
      code: 'action-unexpected-failure',
    });
    assert.equal(inheritedTagReads, 0);

    let inheritedCodeReads = 0;
    const inheritedCodePrototype = Object.defineProperty({}, 'code', {
      get: () => {
        inheritedCodeReads += 1;
        throw new Error('must not execute');
      },
    });
    const inheritedCodeAccessor = Object.assign(Object.create(inheritedCodePrototype), {
      _tag: 'ActionDomainFailure',
    });
    assert.deepEqual(normalizeActionFailure(inheritedCodeAccessor), {
      kind: 'domain',
      code: 'action-domain-failed',
      summary: undefined,
    });
    assert.equal(inheritedCodeReads, 0);
  });

  it('contains throwing proxy traps and does not use ordinary property gets', () => {
    const throwingDescriptorProxy = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          throw new Error('descriptor trap failed');
        },
      }
    );
    assert.deepEqual(normalizeActionFailure(throwingDescriptorProxy), {
      kind: 'unexpected',
      code: 'action-unexpected-failure',
    });

    let ordinaryGets = 0;
    const throwingGetProxy = new Proxy(
      { _tag: 'ActionDomainFailure', code: 'proxy-domain-failed', safeSummary: 'Safe summary' },
      {
        get: () => {
          ordinaryGets += 1;
          throw new Error('ordinary get trap must not execute');
        },
      }
    );
    assert.deepEqual(normalizeActionFailure(throwingGetProxy), {
      kind: 'domain',
      code: 'proxy-domain-failed',
      summary: 'Safe summary',
    });
    assert.equal(ordinaryGets, 0);
  });

  it('bounds structural failure codes to the documented safe format', () => {
    const fallback = { kind: 'domain', code: 'action-domain-failed', summary: undefined };
    const invalidCodes = [
      '',
      '   ',
      'line\nbreak',
      'control\u0000code',
      'contains space',
      '-leading-separator',
      'unicode-é',
      'x'.repeat(65),
      'x'.repeat(500_000),
    ];
    for (const code of invalidCodes) {
      assert.deepEqual(normalizeActionFailure({ _tag: 'ActionDomainFailure', code }), fallback);
    }
    const maximumCode = `A${'b'.repeat(63)}`;
    assert.equal(normalizeActionFailure({ _tag: 'ActionDomainFailure', code: maximumCode }).code, maximumCode);
  });

  it('rejects Unicode controls, line separators, format controls, and malformed surrogate text from reports', async () => {
    const unsafeCodePoints = [
      { label: 'U+0085 NEXT LINE', codePoint: 0x0085 },
      { label: 'U+2028 LINE SEPARATOR', codePoint: 0x2028 },
      { label: 'U+2029 PARAGRAPH SEPARATOR', codePoint: 0x2029 },
      { label: 'U+202E RIGHT-TO-LEFT OVERRIDE', codePoint: 0x202e },
      { label: 'U+200E LEFT-TO-RIGHT MARK', codePoint: 0x200e },
      { label: 'U+2066 LEFT-TO-RIGHT ISOLATE', codePoint: 0x2066 },
      { label: 'U+2069 POP DIRECTIONAL ISOLATE', codePoint: 0x2069 },
      { label: 'U+FEFF ZERO WIDTH NO-BREAK SPACE', codePoint: 0xfeff },
      { label: 'U+D800 UNPAIRED HIGH SURROGATE', codePoint: 0xd800 },
    ] as const;

    for (const { label, codePoint } of unsafeCodePoints) {
      const rejectedCharacter = String.fromCodePoint(codePoint);
      const rejectedSummary = `safe${rejectedCharacter}text`;
      const normalized = normalizeActionFailure(
        new ActionDomainFailure('private domain detail', 'provider-rejected-summary', rejectedSummary)
      );
      assert.equal(normalized.summary === undefined, true, `${label} must use the no-summary fallback`);

      const logs: Array<{ message: string; fields?: object }> = [];
      const operation = createActionExecutionOperation('onCreate');
      const outcome = await runActionPlan(
        [
          {
            actionId: 'unicode-summary-rejection',
            mode: 'onCreate',
            phase: 'pre',
            index: 0,
            invoke: () =>
              Effect.fail(
                new ActionDomainFailure('private domain detail', 'provider-rejected-summary', rejectedSummary)
              ),
          },
        ],
        createPhaseContext(operation, 'pre'),
        { logger: { warn: (message, fields) => logs.push({ message, fields }) } }
      );
      const serializedReport = JSON.stringify(outcome.report);
      const serializedLogs = JSON.stringify(logs);
      assert.equal(
        outcome.report.actions[0]?.failure?.summary === undefined,
        true,
        `${label} must not enter an execution report`
      );
      assert.equal(serializedReport.includes('"summary"'), false, `${label} must not enter a serialized report`);
      assert.equal(serializedLogs.includes('"summary"'), false, `${label} must not enter serialized diagnostics`);
      assert.equal(
        serializedReport.includes(rejectedCharacter),
        false,
        `${label} must not remain in serialized reports`
      );
      assert.equal(
        serializedLogs.includes(rejectedCharacter),
        false,
        `${label} must not remain in serialized diagnostics`
      );
    }
  });

  it('retains safe ordinary Unicode within the code-point bound', () => {
    const safeSummary = ' Crème brûlée — 東京 🙂 ';
    assert.deepEqual(normalizeActionFailure(new ActionDomainFailure('private detail', 'safe-unicode', safeSummary)), {
      kind: 'domain',
      code: 'safe-unicode',
      summary: 'Crème brûlée — 東京 🙂',
    });

    const maximumSupplementarySummary = '🙂'.repeat(160);
    assert.equal(
      normalizeActionFailure(
        new ActionDomainFailure('private detail', 'safe-unicode-boundary', maximumSupplementarySummary)
      ).summary,
      maximumSupplementarySummary
    );
    assert.equal(
      normalizeActionFailure(
        new ActionDomainFailure('private detail', 'safe-unicode-boundary', `${maximumSupplementarySummary}🙂`)
      ).summary,
      undefined
    );
  });

  it('returns bounded structured reports and logs for hostile and oversized thrown values', async () => {
    const hostile = new Proxy(
      {},
      {
        get: () => {
          throw new Error('get trap failed');
        },
        getOwnPropertyDescriptor: () => {
          throw new Error('descriptor trap failed');
        },
        getPrototypeOf: () => {
          throw new Error('prototype trap failed');
        },
      }
    );
    const logs: Array<{ message: string; fields?: object }> = [];
    const operation = createActionExecutionOperation('onCreate');
    const hostileOutcome = await runActionPlan(
      [
        {
          actionId: 'hostile-failure',
          mode: 'onCreate',
          phase: 'pre',
          index: 0,
          invoke: () =>
            Effect.sync(() => {
              throw hostile;
            }),
        },
      ],
      createPhaseContext(operation, 'pre'),
      { logger: { error: (message, fields) => logs.push({ message, fields }) } }
    );
    assert.deepEqual(hostileOutcome.report.actions[0]?.failure, {
      kind: 'unexpected',
      code: 'action-unexpected-failure',
    });

    const oversizedOperation = createActionExecutionOperation('onCreate');
    const oversizedOutcome = await runActionPlan(
      [
        {
          actionId: 'oversized-code',
          mode: 'onCreate',
          phase: 'pre',
          index: 0,
          invoke: () =>
            Effect.fail({
              _tag: 'ActionDomainFailure',
              code: 'x'.repeat(500_000),
              safeSummary: 'A bounded summary',
            }),
        },
      ],
      createPhaseContext(oversizedOperation, 'pre'),
      { logger: { warn: (message, fields) => logs.push({ message, fields }) } }
    );
    assert.deepEqual(oversizedOutcome.report.actions[0]?.failure, {
      kind: 'domain',
      code: 'action-domain-failed',
      summary: 'A bounded summary',
    });
    assert.ok(JSON.stringify(hostileOutcome.report).length < 2_000);
    assert.ok(JSON.stringify(oversizedOutcome.report).length < 2_000);
    assert.ok(JSON.stringify(logs).length < 4_000);
  });
});
