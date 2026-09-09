import assert from 'node:assert/strict';
import Handlebars from 'handlebars';
import { decodeWorkerRequest, decodeWorkerResponse } from '../src/expression-runtime/worker-protocol';
import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  ACTION_RESULT_SCHEMA_VERSION,
  parseActionContext,
  type ActionContext,
} from '../src/action-registry';
import { parseActionBindingId } from '../src/action-registry/identifiers';
import { ActionTimeoutFailure, normalizeActionFailure } from '../src/action-execution';
import {
  EXPRESSION_RUNTIME_LIMITS,
  MANAGED_HANDLEBARS_HELPER_NAMES,
  MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES,
  ManagedExpressionError,
  compileManagedHandlebarsTemplate,
  compileManagedJsonataExpression,
  evaluateManagedCondition,
  evaluateManagedJsonata,
  projectActionParameterContext,
  projectOutputDependencyContext,
  projectTextTemplateContext,
  projectTransitionConditionContext,
  renderManagedHandlebars,
  type ManagedJsonataValueContext,
} from '../src/expression-runtime';
import { ExpressionRuntime } from '../src';

const priorBindingId = parseActionBindingId('actb_00000000000000000000000000000000');

function context(): ActionContext {
  return parseActionContext({
    schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    executionId: 'execution-1',
    correlationId: 'correlation-1',
    requestId: 'request-1',
    timestamp: '2026-08-27T01:02:03Z',
    brandId: 'default',
    recordTypeKey: 'rdmp',
    scope: {
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: 'pre',
      scopeId: 'approve',
    },
    actor: { id: 'user-1', username: 'ada', roles: ['Admin'] },
    record: {
      oid: 'record-1',
      current: { metadata: { title: 'Old' } },
      candidate: {
        metadata: {
          title: '<Ada & Bob>',
          creators: [{ email: 'ada@example.test' }, { name: 'No email' }, { email: 'bob@example.test' }],
          nested: { accepted: true, secretToken: 'context-secret' },
          serviceRegistry: { mail: 'must-not-project' },
          request: { headers: 'must-not-project' },
          httpRequest: { headers: 'must-not-project' },
          apiResponse: { body: 'must-not-project' },
          processEnv: { API_KEY: 'must-not-project' },
          apiKey: 'must-not-project',
        },
      },
    },
    transition: { scopeId: 'approve', sourceStage: 'draft', targetStage: 'review' },
    priorOutputs: [
      {
        bindingId: priorBindingId,
        output: {
          schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
          fields: { approved: true, publicLabel: 'safe', secretValue: 'must-not-project' },
        },
      },
    ],
  });
}

async function capturedError(operation: Promise<never>): Promise<ManagedExpressionError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof ManagedExpressionError) {
      return error;
    }
    throw error;
  }
  assert.fail('Expected managed expression execution to fail.');
}

describe('managed JSONata and Handlebars runtime', function () {
  this.timeout(15_000);

  it('rejects callable context values before serialization without executing traps', async () => {
    let reads = 0;
    const trap = (): never => {
      reads += 1;
      throw new Error('Must not execute');
    };
    const revoked = Proxy.revocable(() => {}, {});
    revoked.revoke();
    for (const value of [
      () => {},
      new Proxy(() => {}, { get: trap }),
      revoked.proxy,
      Object.defineProperty(() => {}, 'length', { get: trap }),
    ]) {
      const hostile = { record: { x: value } } as unknown as ManagedJsonataValueContext;
      await assert.rejects(
        evaluateManagedJsonata(compileManagedJsonataExpression('record'), hostile),
        ManagedExpressionError
      );
    }
    assert.equal(reads, 0);
  });

  it('rejects hostile selectors and prior-output getters without invoking caller code', () => {
    let calls = 0;
    const trap = (): never => {
      calls += 1;
      throw new Error('private-selector-details');
    };
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    const selectors = [
      new Proxy([], { get: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap }),
      revoked.proxy,
      Object.defineProperty(['approved'], '0', { get: trap }),
      Object.assign(['approved'], { [Symbol.iterator]: trap }),
      Object.create({ length: 1, 0: 'approved' }),
      Object.defineProperty({}, 'length', { get: trap }),
      new Array(1),
      [12],
      [null],
      [undefined],
      [Symbol('private')],
      [{ toString: trap, toLowerCase: trap }],
      null,
      'approved',
    ];
    const sanitized = (error: any): boolean => {
      assert.ok(error instanceof ManagedExpressionError);
      assert.ok(['expression-context-invalid', 'prior-output-cardinality-exceeded'].includes(error.diagnostic.code));
      assert.equal(String(error.stack).includes('private'), false);
      assert.ok(JSON.stringify(error).length < 512);
      return true;
    };
    for (const fields of selectors) {
      assert.throws(() => projectOutputDependencyContext(context(), priorBindingId, fields as any), sanitized);
    }
    for (const selected of [true, false]) {
      const original = context();
      const prior = original.priorOutputs[0];
      const source = {
        ...original,
        priorOutputs: [{ ...prior, output: { ...prior.output, fields: { ...prior.output.fields } } }],
      };
      Object.defineProperty(source.priorOutputs[0].output.fields, 'hostile', { enumerable: true, get: trap });
      assert.throws(
        () => projectOutputDependencyContext(source, priorBindingId, selected ? ['hostile'] : ['approved']),
        sanitized
      );
    }
    assert.equal(calls, 0);
    const fields = Object.setPrototypeOf(['approved', 'publicLabel'], null);
    assert.deepEqual(projectOutputDependencyContext(context(), priorBindingId, fields).priorOutput.fields, {
      approved: true,
      publicLabel: 'safe',
    });
  });

  it('serializes projected contexts without inherited object or array toJSON hooks', async () => {
    const prepared = compileManagedJsonataExpression('record.candidate.values');
    const template = compileManagedHandlebarsTemplate('{{record.oid}}', 'plain-text');
    const projected = { ...projectActionParameterContext(context()), record: { candidate: { values: [1, 2] } } };
    const textContext = projectTextTemplateContext(context());
    let calls = 0;
    const trap = (): never => {
      calls += 1;
      throw new Error('private-serialization-details');
    };
    for (const prototype of [Object.prototype, Array.prototype]) {
      for (const property of [{ value: trap }, { get: trap }]) {
        const original = Object.getOwnPropertyDescriptor(prototype, 'toJSON');
        let value: ReturnType<typeof evaluateManagedJsonata>;
        let text: ReturnType<typeof renderManagedHandlebars>;
        try {
          Object.defineProperty(prototype, 'toJSON', { ...property, configurable: true });
          // Both entry points copy/serialize synchronously before returning their promises.
          value = evaluateManagedJsonata(prepared, projected);
          text = renderManagedHandlebars(template, textContext);
        } finally {
          if (original) Object.defineProperty(prototype, 'toJSON', original);
          else Reflect.deleteProperty(prototype, 'toJSON');
        }
        assert.deepEqual(await value, [1, 2]);
        assert.equal(await text, 'record-1');
      }
    }
    const original = Object.getOwnPropertyDescriptor(BigInt.prototype, 'toJSON');
    let failure: ReturnType<typeof evaluateManagedJsonata>;
    try {
      Object.defineProperty(BigInt.prototype, 'toJSON', { get: trap, configurable: true });
      failure = evaluateManagedJsonata(prepared, {
        ...projected,
        record: { candidate: { value: 1n } },
      } as any);
    } finally {
      if (original) Object.defineProperty(BigInt.prototype, 'toJSON', original);
      else Reflect.deleteProperty(BigInt.prototype, 'toJSON');
    }
    const error = await capturedError(failure as Promise<never>);
    assert.equal(error.diagnostic.code, 'expression-context-invalid');
    assert.equal(String(error.stack).includes('private'), false);
    assert.equal(calls, 0);
  });

  it('rejects option and signal accessors and proxies without invoking them', async () => {
    const prepared = compileManagedJsonataExpression('true');
    const projected = projectActionParameterContext(context());
    let calls = 0;
    const trap = (): never => {
      calls += 1;
      throw new Error('private-signal-details');
    };
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const signal = { aborted: false, addEventListener() {}, removeEventListener() {} };
    const options = [
      null,
      new Proxy({}, { get: trap, getOwnPropertyDescriptor: trap }),
      Object.defineProperty({}, 'signal', { get: trap }),
      Object.defineProperty({}, 'timeoutMs', { get: trap }),
      { signal: revoked.proxy },
      { signal: new Proxy(signal, { get: trap, getPrototypeOf: trap }) },
      { signal: Object.create(new Proxy({}, { getOwnPropertyDescriptor: trap })) },
      { signal: { ...signal, addEventListener: new Proxy(() => {}, { apply: trap }) } },
      ...['aborted', 'addEventListener', 'removeEventListener'].map(key => ({
        signal: Object.defineProperty({ ...signal }, key, { get: trap }),
      })),
    ];
    for (const option of options) {
      const error = await capturedError(evaluateManagedJsonata(prepared, projected, option as any) as Promise<never>);
      assert.equal(error.diagnostic.code, 'expression-options-invalid');
      assert.equal(error.diagnostic.workerTerminated, false);
      assert.equal(String(error.stack).includes('private'), false);
      assert.ok(JSON.stringify(error).length < 512);
    }
    assert.equal(calls, 0);
  });

  it('rejects forged native signal receivers without private getter or proxy calls in either engine', async () => {
    let calls = 0;
    const trap = (): never => {
      calls += 1;
      throw new Error('private-native-signal');
    };
    const native = new AbortController().signal;
    const symbols = Object.getOwnPropertySymbols(native);
    const aborted = symbols.find(key => key.description === 'kAborted');
    assert.ok(aborted);
    const forged = Object.create(AbortSignal.prototype);
    Object.defineProperty(forged, aborted, { get: trap });
    const inherited = Object.create(native);
    Object.defineProperty(inherited, aborted, { get: trap });
    const revoked = Proxy.revocable(native, {});
    revoked.revoke();
    const composite = AbortSignal.any([native]);
    const compositeSymbols = Object.getOwnPropertySymbols(composite);
    const sourcesKey = compositeSymbols.find(key => key.description === 'kSourceSignals');
    assert.ok(sourcesKey);
    const poisonedComposite = AbortSignal.any([native]);
    const sources: Set<WeakRef<AbortSignal>> = Object.getOwnPropertyDescriptor(poisonedComposite, sourcesKey)?.value;
    Object.defineProperty(sources, Symbol.iterator, { get: trap });
    const poisonedReference = AbortSignal.any([native]);
    const references: Set<WeakRef<AbortSignal>> = Object.getOwnPropertyDescriptor(poisonedReference, sourcesKey)?.value;
    Object.defineProperty(Set.prototype.values.call(references).next().value, 'deref', { get: trap });
    const signals = [
      forged,
      poisonedComposite,
      poisonedReference,
      inherited,
      Object.create(AbortSignal.prototype),
      revoked.proxy,
      new Proxy(native, { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap }),
      ...symbols.map(key => Object.defineProperty(new AbortController().signal, key, { get: trap })),
      ...compositeSymbols.map(key => Object.defineProperty(AbortSignal.any([native]), key, { get: trap })),
      Object.defineProperty(new AbortController().signal, Symbol('extra'), { get: trap }),
    ];
    for (const engine of ['jsonata', 'handlebars'] as const) {
      const run = (signal: AbortSignal) =>
        engine === 'jsonata'
          ? evaluateManagedJsonata(compileManagedJsonataExpression('true'), projectActionParameterContext(context()), {
              signal,
            })
          : renderManagedHandlebars(
              compileManagedHandlebarsTemplate('safe', 'plain-text'),
              projectTextTemplateContext(context()),
              { signal }
            );
      for (const signal of signals) {
        const error = await capturedError(run(signal) as Promise<never>);
        assert.equal(error.diagnostic.code, 'expression-options-invalid');
        assert.equal(error.diagnostic.workerTerminated, false);
        assert.equal(String(error.stack).includes('private'), false);
        assert.ok(JSON.stringify(error).length < 512);
      }
      for (const signal of [native, AbortSignal.any([native])]) {
        assert.equal(await run(signal), engine === 'jsonata' ? true : 'safe');
      }
      const active = new AbortController();
      const pending = run(active.signal);
      active.abort();
      const activeError = await capturedError(pending as Promise<never>);
      assert.equal(activeError.diagnostic.kind, 'interrupted');
      assert.equal(activeError.diagnostic.workerTerminated, true);
      const timerError = await capturedError(run(AbortSignal.timeout(1)) as Promise<never>);
      assert.equal(timerError.diagnostic.kind, 'interrupted');
      assert.equal(timerError.diagnostic.workerTerminated, true);
      const controller = new AbortController();
      const lazyComposite = AbortSignal.any([controller.signal]);
      controller.abort();
      for (const signal of [AbortSignal.abort(), AbortSignal.any([AbortSignal.abort()]), lazyComposite]) {
        const error = await capturedError(run(signal) as Promise<never>);
        assert.equal(error.diagnostic.kind, 'interrupted');
        assert.equal(error.diagnostic.workerTerminated, false);
      }
    }
    assert.equal(calls, 0);
  });

  it('requires complete own artifact data before either engine reads properties', async () => {
    let calls = 0;
    const trap = (): never => {
      calls += 1;
      throw new Error('private-artifact-details');
    };
    for (const engine of ['jsonata', 'handlebars'] as const) {
      const prepared =
        engine === 'jsonata'
          ? compileManagedJsonataExpression('true')
          : compileManagedHandlebarsTemplate('safe', 'plain-text');
      const run = (artifact: object) =>
        engine === 'jsonata'
          ? evaluateManagedJsonata(
              artifact as typeof prepared & { engine: 'jsonata' },
              projectActionParameterContext(context())
            )
          : renderManagedHandlebars(
              artifact as ReturnType<typeof compileManagedHandlebarsTemplate>,
              projectTextTemplateContext(context())
            );
      const revoked = Proxy.revocable({}, {});
      revoked.revoke();
      const malformed = [
        null,
        undefined,
        {},
        [],
        true,
        1,
        'private',
        revoked.proxy,
        new Proxy(prepared, { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap }),
        Object.create(Object.defineProperty({}, 'engine', { get: trap })),
        Object.create(prepared),
        { ...prepared, extra: true },
        { ...prepared, [Symbol('extra')]: true },
        ...Object.keys(prepared).flatMap(key => {
          const incomplete = { ...prepared };
          Reflect.deleteProperty(incomplete, key);
          return [
            incomplete,
            { ...prepared, [key]: undefined },
            Object.defineProperty({ ...prepared }, key, { get: trap }),
            Object.defineProperty({ ...prepared }, key, { enumerable: false }),
          ];
        }),
        ...['', 1, null, { toString: trap }].map(source => ({ ...prepared, source })),
        ...[0, -1, 1.5, NaN, Infinity, '1', EXPRESSION_RUNTIME_LIMITS.maxAstNodes + 1].map(astNodes => ({
          ...prepared,
          astNodes,
        })),
        { ...prepared, engine: 'other' },
        { ...prepared, schemaVersion: 2 },
        ...(engine === 'handlebars' ? [{ ...prepared, destination: 'javascript' }] : []),
      ];
      for (const artifact of malformed) {
        const error = await capturedError(run(artifact as object) as Promise<never>);
        assert.equal(error.diagnostic.code, `${engine}-artifact-invalid`);
        assert.equal(error.diagnostic.kind, 'validation');
        assert.equal(error.diagnostic.workerTerminated, false);
        assert.equal(String(error.stack).includes('private'), false);
        assert.ok(JSON.stringify(error).length < 512);
      }
      assert.equal(await run(Object.assign(Object.create(null), prepared)), engine === 'jsonata' ? true : 'safe');
      const inheritedEngine = Object.getOwnPropertyDescriptor(Object.prototype, 'engine');
      let inheritedFailure: ReturnType<typeof run>;
      try {
        Object.defineProperty(Object.prototype, 'engine', { configurable: true, get: trap });
        const incomplete = { ...prepared };
        Reflect.deleteProperty(incomplete, 'engine');
        inheritedFailure = run(incomplete);
      } finally {
        if (inheritedEngine) Object.defineProperty(Object.prototype, 'engine', inheritedEngine);
        else Reflect.deleteProperty(Object.prototype, 'engine');
      }
      const inheritedError = await capturedError(inheritedFailure as Promise<never>);
      assert.equal(inheritedError.diagnostic.code, `${engine}-artifact-invalid`);
      const forgedCount = await capturedError(run({ ...prepared, astNodes: prepared.astNodes + 1 }) as Promise<never>);
      assert.equal(forgedCount.diagnostic.code, `${engine}-artifact-invalid`);
    }
    assert.equal(calls, 0);
  });

  it('rejects non-native cancellation before invoking listener methods in either engine', async () => {
    let calls = 0;
    const hostile = (): never => {
      calls += 1;
      throw new Error('private-listener-details');
    };
    for (const engine of ['jsonata', 'handlebars'] as const) {
      for (const aborted of [false, true]) {
        const signal: AbortSignal = {
          aborted,
          onabort: null,
          reason: undefined,
          throwIfAborted: hostile,
          dispatchEvent: hostile,
          addEventListener: hostile,
          removeEventListener: hostile,
        };
        const operation =
          engine === 'jsonata'
            ? evaluateManagedJsonata(
                compileManagedJsonataExpression('true'),
                projectActionParameterContext(context()),
                { signal }
              )
            : renderManagedHandlebars(
                compileManagedHandlebarsTemplate('safe', 'plain-text'),
                projectTextTemplateContext(context()),
                { signal }
              );
        const error = await capturedError(operation as Promise<never>);
        assert.equal(error.diagnostic.engine, engine);
        assert.equal(error.diagnostic.code, 'expression-options-invalid');
        assert.equal(error.diagnostic.workerTerminated, false);
        assert.equal(String(error.stack).includes('private'), false);
        assert.ok(JSON.stringify(error).length < 512);
      }
    }
    assert.equal(calls, 0);
  });

  it('never traverses native nested event state or invokes listener and dispatch hooks', async () => {
    let calls = 0;
    const trap = (): never => {
      calls += 1;
      throw new Error('private-event-state');
    };
    const eventPrototype = Object.getPrototypeOf(AbortSignal.prototype);
    const hookKeys = Object.getOwnPropertySymbols(eventPrototype);
    for (const engine of ['jsonata', 'handlebars'] as const) {
      const run = (signal: AbortSignal) =>
        engine === 'jsonata'
          ? evaluateManagedJsonata(compileManagedJsonataExpression('true'), projectActionParameterContext(context()), {
              signal,
            })
          : renderManagedHandlebars(
              compileManagedHandlebarsTemplate('safe', 'plain-text'),
              projectTextTemplateContext(context()),
              { signal }
            );
      for (const mode of [
        'map-get',
        'entry-accessor',
        'entry-proxy',
        'listener-proxy',
        'methods',
        'hooks',
        'late-state',
      ] as const) {
        const signal = new AbortController().signal;
        signal.addEventListener('abort', () => {});
        const eventsKey = Object.getOwnPropertySymbols(signal).find(key => key.description === 'kEvents')!;
        const events: Map<string, object> = Object.getOwnPropertyDescriptor(signal, eventsKey)!.value;
        const entry = Map.prototype.get.call(events, 'abort');
        const poison = () => {
          if (mode === 'map-get' || mode === 'late-state') Object.defineProperty(events, 'get', { get: trap });
          if (mode === 'entry-accessor') Object.defineProperty(entry, 'next', { get: trap });
          if (mode === 'entry-proxy')
            Map.prototype.set.call(
              events,
              'abort',
              new Proxy({}, { get: trap, getOwnPropertyDescriptor: trap, ownKeys: trap })
            );
          if (mode === 'listener-proxy') Object.defineProperty(entry, 'next', { value: new Proxy({}, { get: trap }) });
          if (mode === 'methods') {
            Object.defineProperty(signal, 'addEventListener', { value: trap });
            Object.defineProperty(signal, 'removeEventListener', { value: trap });
            Object.defineProperty(signal, 'dispatchEvent', { value: trap });
          }
          if (mode === 'hooks') for (const key of hookKeys) Object.defineProperty(signal, key, { value: trap });
        };
        if (mode !== 'late-state') poison();
        const pending = run(signal);
        if (mode === 'late-state') poison();
        assert.equal(await pending, engine === 'jsonata' ? true : 'safe');
      }
      // Accessor hooks are rejected through descriptors without being invoked.
      for (const key of [...hookKeys, 'addEventListener', 'removeEventListener', 'dispatchEvent']) {
        const signal = Object.defineProperty(new AbortController().signal, key, { get: trap });
        const error = await capturedError(run(signal) as Promise<never>);
        assert.equal(error.diagnostic.code, 'expression-options-invalid');
      }
    }
    assert.equal(calls, 0);
  });

  it('keeps native opaque abort reasons as interruption without inspecting them', async () => {
    let calls = 0;
    const trap = (): never => {
      calls += 1;
      throw new Error('private-reason');
    };
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const reasons = [
      new Proxy({}, { get: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap }),
      revoked.proxy,
      Object.defineProperty({}, 'name', { get: trap }),
      Object.defineProperty({}, 'toJSON', { get: trap }),
      new Proxy(() => {}, { apply: trap, get: trap }),
      1n,
      Symbol('private'),
      new Error('private-reason'),
    ];
    for (const engine of ['jsonata', 'handlebars'] as const) {
      const run = (signal: AbortSignal) =>
        engine === 'jsonata'
          ? evaluateManagedJsonata(compileManagedJsonataExpression('true'), projectActionParameterContext(context()), {
              signal,
            })
          : renderManagedHandlebars(
              compileManagedHandlebarsTemplate('safe', 'plain-text'),
              projectTextTemplateContext(context()),
              { signal }
            );
      for (const reason of reasons) {
        const source = new AbortController();
        const composite = AbortSignal.any([source.signal]);
        source.abort(reason);
        for (const signal of [AbortSignal.abort(reason), composite]) {
          const error = await capturedError(run(signal) as Promise<never>);
          assert.equal(error.diagnostic.code, `${engine}-interrupted`);
          assert.equal(error.diagnostic.workerTerminated, false);
          assert.ok(JSON.stringify(error).length < 512);
          assert.equal(String(error.stack).includes('private'), false);
        }
        const active = new AbortController();
        const pending = run(AbortSignal.any([active.signal]));
        active.abort(reason);
        const error = await capturedError(pending as Promise<never>);
        assert.equal(error.diagnostic.code, `${engine}-interrupted`);
        assert.equal(error.diagnostic.workerTerminated, true);
      }
    }
    assert.equal(calls, 0);
  });

  it('bounds composite traversal and rejects cancellation state changed during execution', async () => {
    const source = new AbortController().signal;
    const composite = AbortSignal.any([source]);
    const sourcesKey = Object.getOwnPropertySymbols(composite).find(key => key.description === 'kSourceSignals')!;
    const sources: Set<WeakRef<AbortSignal>> = Object.getOwnPropertyDescriptor(composite, sourcesKey)!.value;
    for (let index = 0; index < 1001; index += 1) Set.prototype.add.call(sources, new WeakRef(source));
    const run = (signal: AbortSignal) =>
      evaluateManagedJsonata(compileManagedJsonataExpression('true'), projectActionParameterContext(context()), {
        signal,
      });
    assert.equal((await capturedError(run(composite) as Promise<never>)).diagnostic.code, 'expression-options-invalid');
    const signal = new AbortController().signal;
    const pending = run(signal);
    let calls = 0;
    const aborted = Object.getOwnPropertySymbols(signal).find(key => key.description === 'kAborted')!;
    Object.defineProperty(signal, aborted, {
      get() {
        calls += 1;
        throw new Error('private-late-state');
      },
    });
    const error = await capturedError(pending as Promise<never>);
    assert.equal(error.diagnostic.code, 'expression-options-invalid');
    assert.equal(error.diagnostic.workerTerminated, true);
    assert.equal(calls, 0);
  });

  it('preserves worker deadlines with native signals whose listener hooks throw', async () => {
    const signal = new AbortController().signal;
    let calls = 0;
    const trap = (): never => {
      calls += 1;
      throw new Error('private-timeout-hook');
    };
    Object.defineProperty(signal, 'addEventListener', { value: trap });
    Object.defineProperty(signal, 'removeEventListener', { value: trap });
    const error = await capturedError(
      evaluateManagedJsonata(
        compileManagedJsonataExpression('($loop := function(){ $loop() }; $loop())'),
        projectActionParameterContext(context()),
        { signal, timeoutMs: 25 }
      ) as Promise<never>
    );
    assert.equal(error.diagnostic.code, 'jsonata-timeout');
    assert.equal(error.diagnostic.kind, 'timeout');
    assert.equal(error.diagnostic.workerTerminated, true);
    assert.equal(calls, 0);
  });

  it('exports a fixed managed contract without eval-like JSONata functions or unsafe Handlebars helpers', () => {
    assert.equal(ExpressionRuntime.compileManagedJsonataExpression, compileManagedJsonataExpression);
    assert.deepEqual(MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES, ['guessNameParts', 'luxonFormatDate']);
    assert.equal(MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES.includes('eval'), false);
    assert.equal(MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES.includes('jsonata'), false);
    assert.equal(MANAGED_HANDLEBARS_HELPER_NAMES.includes('emailList'), true);
    for (const helper of ['get', 'lookup', 't', 'markdownToHtml', 'renderMetadataValue']) {
      assert.equal(MANAGED_HANDLEBARS_HELPER_NAMES.includes(helper), false);
    }
    assert.equal(Object.isFrozen(MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES), true);
    assert.equal(Object.isFrozen(MANAGED_HANDLEBARS_HELPER_NAMES), true);
  });

  it('creates frozen purpose-specific projections and omits server-internal and secret-bearing keys', () => {
    const source = context();
    const transition = projectTransitionConditionContext(source);
    const parameters = projectActionParameterContext(source);
    const template = projectTextTemplateContext(source);
    const output = projectOutputDependencyContext(source, priorBindingId, ['approved', 'publicLabel']);

    assert.equal(transition.purpose, 'transition-condition');
    assert.equal(parameters.purpose, 'action-parameter');
    assert.equal(template.purpose, 'text-template');
    assert.equal(output.purpose, 'output-dependency');
    assert.deepEqual(output.priorOutput.fields, { approved: true, publicLabel: 'safe' });
    assert.deepEqual(projectOutputDependencyContext(source, priorBindingId, ['toString']).priorOutput.fields, {});
    assert.equal(JSON.stringify([transition, parameters, template, output]).includes('context-secret'), false);
    assert.equal(JSON.stringify([transition, parameters, template, output]).includes('must-not-project'), false);
    assert.equal('requestId' in parameters, false);
    assert.equal(Object.isFrozen(parameters), true);
    assert.equal(Object.isFrozen(parameters.record.candidate?.metadata), true);
    assert.equal(Object.isFrozen(parameters.actor?.roles), true);
  });

  it('rejects tampered artifacts and engine-incompatible context purposes at runtime', async () => {
    const prepared = compileManagedJsonataExpression('record.candidate.metadata.title');
    const artifactFailure = await capturedError(
      evaluateManagedJsonata(
        { ...prepared, astNodes: prepared.astNodes + 1 } as any,
        projectActionParameterContext(context()),
        { timeoutMs: 1_000 }
      ) as Promise<never>
    );
    assert.equal(artifactFailure.diagnostic.code, 'jsonata-artifact-invalid');
    assert.equal(artifactFailure.diagnostic.workerTerminated, false);

    const contextFailure = await capturedError(
      renderManagedHandlebars(
        compileManagedHandlebarsTemplate('{{record.oid}}', 'plain-text'),
        projectActionParameterContext(context()) as any,
        { timeoutMs: 1_000 }
      ) as Promise<never>
    );
    assert.equal(contextFailure.diagnostic.engine, 'handlebars');
    assert.equal(contextFailure.diagnostic.code, 'expression-worker-request-invalid');
  });

  it('rejects forbidden JSONata bindings and prototype/property escape attempts at compilation', () => {
    for (const source of [
      '$eval("1 + 1")',
      '$jsonata("1 + 1")',
      '$lookup(record, "title")',
      'record.candidate.constructor',
      'record.candidate."__proto__"',
      '$exists($process)',
    ]) {
      assert.throws(() => compileManagedJsonataExpression(source), ManagedExpressionError);
    }
    assert.doesNotThrow(() => compileManagedJsonataExpression('"Request approved without a secret value"'));
  });

  it('rejects forbidden Handlebars helpers, extensions, unescaped output, and prototype paths', () => {
    for (const source of [
      '{{get record "candidate.metadata.title"}}',
      '{{lookup record "constructor"}}',
      '{{t "secret.key"}}',
      '{{record.constructor}}',
      '{{{record.candidate.metadata.title}}}',
      '{{> persistedPartial}}',
    ]) {
      assert.throws(() => compileManagedHandlebarsTemplate(source, 'html-text'), ManagedExpressionError);
    }
  });

  it('enforces source, AST complexity, and template iteration limits deterministically', () => {
    assert.throws(
      () => compileManagedJsonataExpression('x'.repeat(EXPRESSION_RUNTIME_LIMITS.maxExpressionLength + 1)),
      ManagedExpressionError
    );
    assert.throws(
      () => compileManagedHandlebarsTemplate('x'.repeat(EXPRESSION_RUNTIME_LIMITS.maxTemplateLength + 1), 'plain-text'),
      ManagedExpressionError
    );
    const excessiveAst = `[${Array.from({ length: EXPRESSION_RUNTIME_LIMITS.maxAstNodes }, () => '1').join(',')}]`;
    assert.throws(() => compileManagedJsonataExpression(excessiveAst), ManagedExpressionError);
    const excessiveDepth = `${'$not('.repeat(EXPRESSION_RUNTIME_LIMITS.maxAstDepth + 1)}true${')'.repeat(
      EXPRESSION_RUNTIME_LIMITS.maxAstDepth + 1
    )}`;
    assert.throws(() => compileManagedJsonataExpression(excessiveDepth), ManagedExpressionError);
    const excessiveIterations = `${'{{#each record}}'.repeat(
      EXPRESSION_RUNTIME_LIMITS.maxTemplateEachBlocks + 1
    )}${'{{/each}}'.repeat(EXPRESSION_RUNTIME_LIMITS.maxTemplateEachBlocks + 1)}`;
    assert.throws(() => compileManagedHandlebarsTemplate(excessiveIterations, 'plain-text'), ManagedExpressionError);
  });

  it('evaluates JSONata only over projected JSON and enforces bounded inputs and results', async () => {
    const projected = projectActionParameterContext(context());
    const title = await evaluateManagedJsonata(
      compileManagedJsonataExpression('record.candidate.metadata.title'),
      projected,
      { timeoutMs: 1_000 }
    );
    assert.equal(title, '<Ada & Bob>');
    assert.equal(
      await evaluateManagedCondition(
        compileManagedJsonataExpression('record.candidate.metadata.nested.accepted = true'),
        projectTransitionConditionContext(context()),
        { timeoutMs: 1_000 }
      ),
      true
    );

    let nested: object = {};
    for (let depth = 0; depth < EXPRESSION_RUNTIME_LIMITS.maxJsonDepth + 10; depth += 1) {
      nested = { nested };
    }
    const deepContext = {
      ...projected,
      record: { candidate: nested },
    } as any as ManagedJsonataValueContext;
    const deepFailure = await capturedError(
      evaluateManagedJsonata(compileManagedJsonataExpression('record'), deepContext, {
        timeoutMs: 1_000,
      }) as Promise<never>
    );
    assert.equal(deepFailure.diagnostic.kind, 'limit');
    assert.equal(deepFailure.diagnostic.code, 'expression-input-limit-exceeded');

    const resultFailure = await capturedError(
      evaluateManagedJsonata(compileManagedJsonataExpression('$join([1..20000].$string(), "")'), projected, {
        timeoutMs: 1_000,
      }) as Promise<never>
    );
    assert.equal(resultFailure.diagnostic.kind, 'limit');
    assert.equal(resultFailure.diagnostic.code, 'jsonata-result-invalid');

    let accessorInvoked = false;
    const accessorContext = { ...projected };
    Object.defineProperty(accessorContext, 'record', {
      enumerable: true,
      get: () => {
        accessorInvoked = true;
        return {};
      },
    });
    const accessorFailure = await capturedError(
      evaluateManagedJsonata(
        compileManagedJsonataExpression('record'),
        accessorContext as any as ManagedJsonataValueContext,
        { timeoutMs: 1_000 }
      ) as Promise<never>
    );
    assert.equal(accessorFailure.diagnostic.code, 'expression-input-limit-exceeded');
    assert.equal(accessorInvoked, false);
  });

  it('uses destination-appropriate Handlebars escaping and only fixed pure helpers', async () => {
    const projected = projectTextTemplateContext(context());
    const source = '<strong>{{toUpper record.candidate.metadata.title}}</strong>\r\nBcc: attacker@example.test';
    const html = await renderManagedHandlebars(compileManagedHandlebarsTemplate(source, 'html-text'), projected, {
      timeoutMs: 1_000,
    });
    const plain = await renderManagedHandlebars(compileManagedHandlebarsTemplate(source, 'plain-text'), projected, {
      timeoutMs: 1_000,
    });
    const subject = await renderManagedHandlebars(
      compileManagedHandlebarsTemplate(source, 'email-subject'),
      projected,
      { timeoutMs: 1_000 }
    );
    const url = await renderManagedHandlebars(
      compileManagedHandlebarsTemplate('{{record.candidate.metadata.title}}', 'url-component'),
      projected,
      { timeoutMs: 1_000 }
    );
    const emails = await renderManagedHandlebars(
      compileManagedHandlebarsTemplate('{{emailList record.candidate.metadata.creators}}', 'plain-text'),
      projected,
      { timeoutMs: 1_000 }
    );

    assert.equal(html, '&lt;strong&gt;&lt;ADA &amp; BOB&gt;&lt;/strong&gt;\r\nBcc: attacker@example.test');
    assert.equal(plain, '<strong><ADA & BOB></strong>\r\nBcc: attacker@example.test');
    assert.equal(subject, '<strong><ADA & BOB></strong> Bcc: attacker@example.test');
    assert.equal(url, '%3CAda%20%26%20Bob%3E');
    assert.equal(emails, 'ada@example.test,bob@example.test');
  });

  it('interrupts recursively expensive work at the worker boundary and preserves timeout semantics', async () => {
    const projected = projectActionParameterContext(context());
    const recursive = compileManagedJsonataExpression('($loop := function($x){$loop($x)}; $loop(1))');
    const timedOut = await capturedError(
      evaluateManagedJsonata(recursive, projected, { timeoutMs: 25 }) as Promise<never>
    );
    assert.deepEqual(timedOut.diagnostic, {
      schemaVersion: 1,
      engine: 'jsonata',
      kind: 'timeout',
      code: 'jsonata-timeout',
      workerTerminated: true,
    });

    const controller = new AbortController();
    controller.abort();
    const interrupted = await capturedError(
      evaluateManagedJsonata(compileManagedJsonataExpression('true'), projected, {
        timeoutMs: 1_000,
        signal: controller.signal,
      }) as Promise<never>
    );
    assert.equal(interrupted.diagnostic.kind, 'interrupted');
    assert.equal(interrupted.diagnostic.code, 'jsonata-interrupted');
    assert.equal(interrupted.diagnostic.workerTerminated, false);

    const activeController = new AbortController();
    const activeInterruption = evaluateManagedJsonata(recursive, projected, {
      timeoutMs: 2_000,
      signal: activeController.signal,
    }) as Promise<never>;
    setTimeout(() => activeController.abort(), 700);
    const activelyInterrupted = await capturedError(activeInterruption);
    assert.equal(activelyInterrupted.diagnostic.kind, 'interrupted');
    assert.equal(activelyInterrupted.diagnostic.code, 'jsonata-interrupted');
    assert.equal(activelyInterrupted.diagnostic.workerTerminated, true);

    const ordinaryTimeout = normalizeActionFailure(new ActionTimeoutFailure(false));
    assert.equal(ordinaryTimeout.kind, 'timeout');
    assert.equal(ordinaryTimeout.cancellationCooperative, false);
    assert.notEqual(ordinaryTimeout.kind, 'interrupted');
  });

  it('returns only bounded redacted diagnostics for hostile source and context values', async () => {
    const projected = projectActionParameterContext(context());
    const failure = await capturedError(
      evaluateManagedJsonata(compileManagedJsonataExpression('$sqrt("administrator-source-value")'), projected, {
        timeoutMs: 1_000,
      }) as Promise<never>
    );
    const serialized = JSON.stringify(failure.diagnostic);
    assert.equal(serialized.includes('administrator-source-value'), false);
    assert.equal(serialized.includes('context-secret'), false);
    assert.equal(serialized.length < 256, true);
    assert.equal(failure.message.includes('secret'), false);
  });
  it('rejects aliases, shadowed forbidden bindings, and computed property helpers', () => {
    for (const name of [
      'eval',
      'jsonata',
      'lookup',
      'request',
      'response',
      'req',
      'res',
      'services',
      'sails',
      'environment',
      'env',
      'filesystem',
      'fs',
      'globalThis',
      'process',
      'secret',
      'credentials',
      'apiKey',
      'constructor',
      'prototype',
      '__proto__',
    ]) {
      for (const source of [`$${name}`, `($${name} := function(){true}; $${name}())`]) {
        assert.throws(() => compileManagedJsonataExpression(source), ManagedExpressionError, source);
      }
    }
    for (const source of [
      '($f := $eval; $f("1"))',
      '$lookup(record, "con" & "structor")',
      'record.candidate.`constructor`',
      'record.candidate."prototype"',
      'record.candidate."__proto__"',
      'record.candidate.request',
    ])
      assert.throws(() => compileManagedJsonataExpression(source), ManagedExpressionError);
  });

  it('rejects every unsafe helper form, including subexpressions and traversal', () => {
    for (const helper of [
      'attachmentDownloadUrl',
      'blockHelperMissing',
      'get',
      'helperMissing',
      'json',
      'log',
      'lookup',
      'markdownToHtml',
      'plaintextToHtml',
      'pluck',
      'renderMetadataValue',
      't',
    ]) {
      for (const template of [`{{${helper}}}`, `{{${helper} record}}`, `{{#if (${helper} record)}}yes{{/if}}`]) {
        assert.throws(() => compileManagedHandlebarsTemplate(template, 'plain-text'), ManagedExpressionError, template);
      }
    }
    for (const template of [
      '{{@root}}',
      '{{../record}}',
      '{{record.[constructor]}}',
      '{{record/__proto__}}',
      '{{& record}}',
      '{{#custom record}}yes{{/custom}}',
      '{{#> partial}}yes{{/partial}}',
      '{{*inline "x"}}',
      '{{custom record}}',
    ]) {
      assert.throws(() => compileManagedHandlebarsTemplate(template, 'plain-text'), ManagedExpressionError, template);
    }
  });

  it('runs every allowlisted helper and strips privileged options from missing arguments', async () => {
    const samples: Record<string, string> = {
      and: 'true true',
      concat: '"a" "b"',
      default: 'null "fallback"',
      emailList: 'record.candidate.metadata.creators',
      eq: '1 1',
      formatDate: '"2026-01-02" "yyyy"',
      gt: '2 1',
      gte: '1 1',
      isArray: 'actor.roles',
      isDefined: '1',
      isEmpty: '""',
      isNull: 'null',
      isObject: 'record',
      isUndefined: 'undefined',
      join: 'actor.roles ","',
      lt: '1 2',
      lte: '1 1',
      ne: '1 2',
      not: 'false',
      or: 'false true',
      parseDateString: '"2026-01-02"',
      split: '"a,b" "," 0',
      substring: '"abc" 0 1',
      toLower: '"A"',
      toUpper: '"a"',
      trim: '" a "',
      urlEncode: '"a b"',
    };
    assert.deepEqual(Object.keys(samples).sort(), [...MANAGED_HANDLEBARS_HELPER_NAMES].sort());
    const template = Object.entries(samples)
      .map(([name, args]) => `{{${name} ${args}}}`)
      .join('|');
    const result = await renderManagedHandlebars(
      compileManagedHandlebarsTemplate(template, 'plain-text'),
      projectTextTemplateContext(context()),
      { timeoutMs: 1000 }
    );
    assert.equal(result.includes('fallback|ada@example.test,bob@example.test|true|2026'), true);
    assert.equal(result.includes('[object Object]'), false);
    const missing = await renderManagedHandlebars(
      compileManagedHandlebarsTemplate(
        '{{#with (default null)}}{{name}}{{/with}}|{{toLower}}|{{join actor.roles}}|{{substring "abc" 1}}',
        'plain-text'
      ),
      projectTextTemplateContext(context()),
      { timeoutMs: 1000 }
    );
    assert.equal(missing, '||Admin|bc');
  });

  it('cannot inherit ambient helpers or register functions through evaluation options', async () => {
    let called = false;
    Handlebars.registerHelper('hostHelper', () => {
      called = true;
      return 'private';
    });
    try {
      assert.throws(
        () => compileManagedHandlebarsTemplate('{{hostHelper record}}', 'plain-text'),
        ManagedExpressionError
      );
      const value = await evaluateManagedJsonata(
        compileManagedJsonataExpression('$hostHelper()'),
        projectActionParameterContext(context()),
        { timeoutMs: 1000, bindings: { hostHelper: () => 'private' } } as any
      ).catch(error => error);
      assert.equal(value instanceof ManagedExpressionError, true);
      assert.equal(called, false);
    } finally {
      Handlebars.unregisterHelper('hostHelper');
    }
  });

  it('rejects forged context fields and schema versions instead of trusting TypeScript projections', async () => {
    const projected = projectActionParameterContext(context());
    for (const extra of [
      { privateInternals: 'private' },
      { schemaVersion: 2 },
      { actor: { id: 'x', roles: [], extra: 'private' } },
      { priorOutputs: [{ bindingId: priorBindingId, fields: {}, extra: 'private' }] },
      { record: { extra: 'private' } },
      { record: { candidate: { credentials: 'private' } } },
    ]) {
      const error = await capturedError(
        evaluateManagedJsonata(compileManagedJsonataExpression('$'), {
          ...projected,
          ...extra,
        } as any) as Promise<never>
      );
      assert.equal(error.diagnostic.code, 'expression-worker-request-invalid');
      assert.equal(JSON.stringify(error).includes('private'), false);
    }
  });

  it('never reads inherited properties or invokes accessors, proxies, or serialization hooks', async () => {
    let reads = 0;
    const trap = () => {
      reads++;
      throw new Error('private');
    };
    const cycle: Record<string, object> = {};
    cycle.self = cycle;
    for (const value of [
      Object.create({ inherited: 'private' }),
      new Proxy({}, { ownKeys: trap }),
      Object.defineProperty({}, 'x', { enumerable: true, get: trap }),
      { toJSON: trap },
      cycle,
    ]) {
      const projected = { ...projectActionParameterContext(context()), record: { candidate: value } };
      await assert.rejects(
        evaluateManagedJsonata(compileManagedJsonataExpression('record'), projected as any),
        ManagedExpressionError
      );
      assert.equal(decodeWorkerRequest(value), undefined);
    }
    assert.equal(reads, 0);
    assert.equal(
      await evaluateManagedJsonata(
        compileManagedJsonataExpression('record.toString'),
        projectActionParameterContext(context()),
        { timeoutMs: 1000 }
      ),
      undefined
    );
    await assert.rejects(
      renderManagedHandlebars(
        compileManagedHandlebarsTemplate('{{record.toString}}', 'plain-text'),
        projectTextTemplateContext(context()),
        { timeoutMs: 1000 }
      ),
      ManagedExpressionError
    );
  });

  it('bounds UTF-8 input, cardinality, result depth, and worker protocol parsing', async () => {
    const projected = projectActionParameterContext(context());
    for (const value of [
      '💥'.repeat(EXPRESSION_RUNTIME_LIMITS.maxInputBytes / 4),
      Array(EXPRESSION_RUNTIME_LIMITS.maxArrayItems + 1).fill(0),
      Object.fromEntries(
        Array.from({ length: EXPRESSION_RUNTIME_LIMITS.maxObjectProperties + 1 }, (_, i) => ['k' + i, 0])
      ),
    ]) {
      const error = await capturedError(
        evaluateManagedJsonata(compileManagedJsonataExpression('record'), {
          ...projected,
          record: { candidate: { value } },
        } as any) as Promise<never>
      );
      assert.equal(error.diagnostic.kind, 'limit');
    }
    const source =
      '{"x":'.repeat(EXPRESSION_RUNTIME_LIMITS.maxJsonDepth + 1) +
      '1' +
      '}'.repeat(EXPRESSION_RUNTIME_LIMITS.maxJsonDepth + 1);
    for (const expression of [source, '[1..101]', '$join([1..100].$pad("x", 1000), "")']) {
      const error = await capturedError(
        evaluateManagedJsonata(compileManagedJsonataExpression(expression), projected, {
          timeoutMs: 1000,
        }) as Promise<never>
      );
      assert.equal(error.diagnostic.kind, 'limit');
    }
    let deep: object = {};
    for (let i = 0; i < 10000; i++) deep = { deep };
    assert.equal(decodeWorkerRequest(deep), undefined);
    assert.equal(decodeWorkerResponse({ type: 'json-result', present: true, value: deep }), undefined);
    for (const timeoutMs of [0, 9, 2001, Infinity, NaN, 12.5]) {
      await assert.rejects(
        evaluateManagedJsonata(compileManagedJsonataExpression('true'), projected, { timeoutMs }),
        ManagedExpressionError
      );
    }
  });

  it('escapes complete HTML text and URL components and rejects attribute, full URL, JS and JSON destinations', async () => {
    const payload = '<script>"&\' \`=javascript:alert(1)</script>\r\nBcc:x';
    const projected = { ...projectTextTemplateContext(context()), record: { candidate: { payload } } };
    const render = (destination: 'plain-text' | 'html-text' | 'url-component' | 'email-subject') =>
      renderManagedHandlebars(
        compileManagedHandlebarsTemplate('{{record.candidate.payload}}', destination),
        projected,
        { timeoutMs: 1000 }
      );
    assert.equal(await render('plain-text'), payload);
    const html = await render('html-text');
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('&lt;script&gt;'), true);
    const url = await render('url-component');
    assert.equal(decodeURIComponent(url), payload);
    assert.equal(/[<>"' \`=():/]/.test(url), false);
    assert.equal(/[\r\n]/.test(await render('email-subject')), false);
    for (const destination of ['html-attribute', 'attribute', 'url', 'javascript', 'js', 'json']) {
      assert.throws(() => compileManagedHandlebarsTemplate('{{record}}', destination as any), ManagedExpressionError);
    }
    const tooLarge = {
      ...projected,
      record: { candidate: { payload: 'x'.repeat(EXPRESSION_RUNTIME_LIMITS.maxResultBytes + 1) } },
    };
    await assert.rejects(
      renderManagedHandlebars(
        compileManagedHandlebarsTemplate('{{record.candidate.payload}}', 'plain-text'),
        tooLarge,
        { timeoutMs: 1000 }
      ),
      (error: ManagedExpressionError) => error.diagnostic.code === 'handlebars-result-size-exceeded'
    );
  });

  it('uses a closed diagnostic vocabulary and exposes no private stack or cause', () => {
    for (const code of ['secret-value', 'private\nvalue', 'x'.repeat(100000)]) {
      const error = new ManagedExpressionError('jsonata', 'evaluation', code);
      assert.equal(error.diagnostic.code, 'expression-error');
      assert.equal(JSON.stringify(error).length < 256, true);
      assert.equal(error.stack, 'ManagedExpressionError: Expression evaluation failed.');
      assert.equal(error.cause, undefined);
    }
  });
  it('terminates native regular-expression work that cannot cooperate with an abort', async () => {
    const expression = compileManagedJsonataExpression('$match("' + 'a'.repeat(50) + '!", /^(a+)+$/)');
    const error = await capturedError(
      evaluateManagedJsonata(expression, projectActionParameterContext(context()), { timeoutMs: 25 }) as Promise<never>
    );
    assert.equal(error.diagnostic.kind, 'timeout');
    assert.equal(error.diagnostic.workerTerminated, true);
  });

  it('validates dependency selection and condition purpose and result types', async () => {
    for (const fields of [['secretValue'], ['approved', 'approved'], Array(101).fill('approved')]) {
      assert.throws(() => projectOutputDependencyContext(context(), priorBindingId, fields), ManagedExpressionError);
    }
    assert.throws(
      () =>
        projectOutputDependencyContext(context(), parseActionBindingId('actb_11111111111111111111111111111111'), []),
      ManagedExpressionError
    );
    const expression = compileManagedJsonataExpression('true');
    await assert.rejects(
      evaluateManagedCondition(expression, projectActionParameterContext(context()) as any),
      (error: ManagedExpressionError) => error.diagnostic.code === 'expression-context-invalid'
    );
    await assert.rejects(
      evaluateManagedJsonata(expression, projectTransitionConditionContext(context()) as any),
      (error: ManagedExpressionError) => error.diagnostic.code === 'expression-context-invalid'
    );
    await assert.rejects(
      evaluateManagedCondition(
        compileManagedJsonataExpression('"true"'),
        projectTransitionConditionContext(context()),
        { timeoutMs: 1000 }
      ),
      (error: ManagedExpressionError) => error.diagnostic.code === 'jsonata-condition-result-invalid'
    );
    for (const source of ['function(){true}', '{"__proto__":{"polluted":true}}', '{"constructor":1}']) {
      await assert.rejects(
        evaluateManagedJsonata(compileManagedJsonataExpression(source), projectActionParameterContext(context()), {
          timeoutMs: 1000,
        }),
        ManagedExpressionError
      );
    }
    const output = await evaluateManagedJsonata(
      compileManagedJsonataExpression('priorOutput.fields.approved'),
      projectOutputDependencyContext(context(), priorBindingId, ['approved']),
      { timeoutMs: 1000 }
    );
    assert.equal(output, true);
  });
  it('reuses both pure shared JSONata functions inside the worker', async () => {
    const result = await evaluateManagedJsonata(
      compileManagedJsonataExpression(
        '{"name":$guessNameParts("Ada Lovelace"),"year":$luxonFormatDate("2026-01-02","yyyy")}'
      ),
      projectActionParameterContext(context()),
      { timeoutMs: 1000 }
    );
    assert.deepEqual(result, { name: { full: 'Ada Lovelace', first: 'Ada', last: 'Lovelace' }, year: '2026' });
  });
  it('bounds forged artifacts before property reads or worker transfer', async () => {
    let reads = 0;
    const trap = () => {
      reads++;
      throw new Error('private');
    };
    const jsonataArtifact = compileManagedJsonataExpression('true');
    const handlebarsArtifact = compileManagedHandlebarsTemplate('{{record.oid}}', 'plain-text');
    for (const source of ['x'.repeat(EXPRESSION_RUNTIME_LIMITS.maxTemplateLength + 1), { toString: trap }]) {
      await assert.rejects(
        evaluateManagedJsonata({ ...jsonataArtifact, source } as any, projectActionParameterContext(context())),
        ManagedExpressionError
      );
      await assert.rejects(
        renderManagedHandlebars({ ...handlebarsArtifact, source } as any, projectTextTemplateContext(context())),
        ManagedExpressionError
      );
    }
    for (const artifact of [
      new Proxy(jsonataArtifact, { get: trap }),
      Object.defineProperty({}, 'engine', { get: trap }),
    ]) {
      await assert.rejects(
        evaluateManagedJsonata(artifact as any, projectActionParameterContext(context())),
        ManagedExpressionError
      );
    }
    assert.equal(reads, 0);
  });
});
