import { Context, Effect, Fiber, TestClock, TestContext } from 'effect';
import { expect } from 'chai';
import { of } from 'rxjs';
import {
  ActionTransientFailure,
  createActionExecutionOperation,
  createActionExecutionSupervisor,
  createPhaseContext,
  deriveActionId,
  dispatchDetachedActionPlan,
  legacyHookToEffect,
  projectRecordHookExecutionAuditSummary,
  runActionPlan,
  runSequentialActionPlan,
  retryDelayMs,
  validateActionExecutionPolicy,
} from '../../src/action-execution/index';
import { RecordHookCoordinator } from '../../src/services/record-hooks/coordinator';

describe('Effect action execution', function () {
  it('derives stable bounded IDs without including the function expression', function () {
    const id = deriveActionId('onCreate', 'pre', 0, 'sails.services.example.run');
    expect(id).to.match(/^onCreate\.pre\.0\.[a-f0-9]{12}$/);
    expect(id).not.to.include('sails');
    expect(deriveActionId('onCreate', 'pre', 0, 'sails.services.example.run')).to.equal(id);
  });

  it('validates bounded retry policies and requires idempotency acknowledgement', function () {
    expect(() => validateActionExecutionPolicy({ retry: { maxAttempts: 2 } })).to.throw('idempotent');
    expect(
      validateActionExecutionPolicy({ retry: { maxAttempts: 2, idempotent: true } })?.retry?.retryOn
    ).to.deep.equal(['transient']);
    expect(() => validateActionExecutionPolicy({ timeoutMs: 600001 })).to.throw('timeoutMs');
  });

  it('threads sequential values, retries transient failures, and skips later actions after exhaustion', async function () {
    let attempts = 0;
    const operation = createActionExecutionOperation('onCreate', 'request-1');
    const context = createPhaseContext(operation, 'pre');
    const outcome = await runActionPlan(
      [
        {
          actionId: 'first',
          mode: 'onCreate',
          phase: 'pre',
          index: 0,
          policy: { retry: { maxAttempts: 2, retryOn: ['transient'], idempotent: true } },
          invoke: () =>
            Effect.sync(() => {
              attempts += 1;
              if (attempts === 1) throw new ActionTransientFailure('temporary');
              return { value: 1 };
            }),
        },
        {
          actionId: 'second',
          mode: 'onCreate',
          phase: 'pre',
          index: 1,
          invoke: () => Effect.fail(new Error('stop')),
        },
        {
          actionId: 'never',
          mode: 'onCreate',
          phase: 'pre',
          index: 2,
          invoke: () => Effect.succeed({ value: 3 }),
        },
      ],
      context
    );

    expect(attempts).to.equal(2);
    expect(outcome.values).to.deep.equal([{ value: 1 }]);
    expect(outcome.report.actions.map(action => action.status)).to.deep.equal(['succeeded', 'failed', 'skipped']);
    expect(outcome.report.actions[2].skippedReason).to.equal('prior_action_failed');
    expect(outcome.report.actions[0].attempts).to.equal(2);
  });

  it('adapts plain values, Promises, Observables, and native Effects', async function () {
    const values = await Promise.all([
      Effect.runPromise(legacyHookToEffect(() => 1)),
      Effect.runPromise(legacyHookToEffect(() => Promise.resolve(2))),
      Effect.runPromise(legacyHookToEffect(() => of(3))),
      Effect.runPromise(legacyHookToEffect(() => Effect.succeed(4))),
    ]);
    expect(values).to.deep.equal([1, 2, 3, 4]);
  });

  it('threads the live record between legacy pre hooks and omits execution policy from options', async function () {
    const seen: unknown[] = [];
    const recordType = {
      hooks: {
        onCreate: {
          pre: [
            { id: 'first', function: 'first', options: { marker: 'legacy' } },
            { id: 'second', function: 'second', execution: { timeoutMs: 1000 } },
          ],
        },
      },
    };
    const operation = createActionExecutionOperation('onCreate');
    const coordinator = new RecordHookCoordinator({
      operation,
      resolveHook: hook => {
        const name = (hook as { function: string }).function;
        return name === 'first'
          ? (_oid, record, options) => {
              seen.push({ record, options });
              return { ...(record as Record<string, unknown>), first: true };
            }
          : (_oid, record, options) => {
              seen.push({ record, options });
              return { ...(record as Record<string, unknown>), second: true };
            };
      },
    });
    const result = await coordinator.runPre(null, { initial: true }, recordType, 'onCreate', { username: 'tester' });
    expect(result.record).to.deep.equal({ initial: true, first: true, second: true });
    expect((seen[1] as { record: unknown }).record).to.deep.equal({ initial: true, first: true });
    expect((seen[1] as { options: unknown }).options).to.deep.equal({});
    expect((seen[0] as { options: unknown }).options).to.deep.equal({ marker: 'legacy' });
  });

  it('reports an opaque Promise timeout as non-cooperative', async function () {
    const operation = createActionExecutionOperation('onCreate');
    const cancellation = { value: true };
    const outcome = await runActionPlan(
      [
        {
          actionId: 'promise-timeout',
          mode: 'onCreate',
          phase: 'pre',
          index: 0,
          policy: { timeoutMs: 5 },
          cooperativeCancellation: () => cancellation.value,
          invoke: () => legacyHookToEffect(() => new Promise(() => undefined), cancellation),
        },
      ],
      createPhaseContext(operation, 'pre')
    );
    expect(outcome.report.actions[0].status).to.equal('timed_out');
    expect(outcome.report.actions[0].failure?.cancellationCooperative).to.equal(false);
  });

  it('does not retry a non-cooperative timeout into an overlapping invocation', async function () {
    let invocations = 0;
    const operation = createActionExecutionOperation('onCreate');
    const cancellation = { value: true };
    const outcome = await runActionPlan(
      [
        {
          actionId: 'promise-timeout-retry',
          mode: 'onCreate',
          phase: 'pre',
          index: 0,
          policy: {
            timeoutMs: 5,
            retry: { maxAttempts: 2, retryOn: ['timeout'], idempotent: true },
          },
          cooperativeCancellation: () => cancellation.value,
          invoke: () =>
            legacyHookToEffect(() => {
              invocations += 1;
              return new Promise(() => undefined);
            }, cancellation),
        },
      ],
      createPhaseContext(operation, 'pre')
    );

    expect(invocations).to.equal(1);
    expect(outcome.report.actions[0].attempts).to.equal(1);
    expect(outcome.report.actions[0].failure?.cancellationCooperative).to.equal(false);
  });

  it('dispatches detached actions without waiting for completion', function () {
    const operation = createActionExecutionOperation('onCreate');
    const events: string[] = [];
    const outcome = dispatchDetachedActionPlan(
      [
        {
          actionId: 'one',
          mode: 'onCreate',
          phase: 'post',
          index: 0,
          invoke: () =>
            Effect.sync(() => {
              events.push('one');
            }),
        },
        {
          actionId: 'two',
          mode: 'onCreate',
          phase: 'post',
          index: 1,
          invoke: () =>
            Effect.sync(() => {
              events.push('two');
            }),
        },
      ],
      createPhaseContext(operation, 'post')
    );
    expect(outcome.report.status).to.equal('dispatched');
    expect(outcome.report.actions.every(action => action.status === 'dispatched')).to.equal(true);
    expect(events.slice(0, 2)).to.deep.equal(['one', 'two']);
  });

  it('caps audit entries while retaining complete counts', function () {
    const operation = createActionExecutionOperation('onCreate');
    operation.reports.push({
      schemaVersion: 1,
      executionId: operation.executionId,
      phaseExecutionId: 'phase-1',
      context: {
        executionId: operation.executionId,
        phaseExecutionId: 'phase-1',
        trigger: 'record-hook',
        mode: 'onCreate',
        phase: 'post',
      },
      status: 'dispatched',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:00.000Z',
      durationMs: 0,
      actions: Array.from({ length: 101 }, (_, index) => ({
        actionId: `a-${index}`,
        mode: 'onCreate' as const,
        phase: 'post' as const,
        index,
        status: 'dispatched' as const,
        attempts: 0,
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:00:00.000Z',
        durationMs: 0,
      })),
      counts: { succeeded: 0, failed: 0, timed_out: 0, interrupted: 0, skipped: 0, dispatched: 101 },
    });
    const summary = projectRecordHookExecutionAuditSummary(operation);
    expect(summary.actions).to.have.length(100);
    expect(summary.totalActions).to.equal(101);
    expect(summary.truncated).to.equal(true);
    expect(summary.counts.dispatched).to.equal(101);
  });
  it('uses the Effect TestClock, injected time, and deterministic jitter for retry scheduling', async function () {
    let logicalTime = 0;
    const sleeps: number[] = [];
    let attempts = 0;
    const operation = createActionExecutionOperation('onCreate', undefined, undefined, {
      now: () => new Date(logicalTime),
    });
    const context = createPhaseContext(operation, 'pre', {
      now: () => new Date(logicalTime),
    });
    const dependencies = {
      now: () => new Date(logicalTime),
      random: () => 0,
      sleep: (durationMs: number) => {
        sleeps.push(durationMs);
        return Effect.gen(function* () {
          yield* TestClock.sleep(`${durationMs} millis`);
          logicalTime += durationMs;
        });
      },
    };
    const action = {
      actionId: 'clocked-retry',
      mode: 'onCreate' as const,
      phase: 'pre' as const,
      index: 0,
      policy: {
        retry: {
          maxAttempts: 2,
          retryOn: ['transient' as const],
          schedule: { type: 'fixed' as const, delayMs: 40, jitter: true },
          idempotent: true as const,
        },
      },
      invoke: () =>
        Effect.sync(() => {
          attempts += 1;
          if (attempts === 1) throw new ActionTransientFailure('temporary');
          return 'ok';
        }),
    };

    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.fork(runSequentialActionPlan([action], context, dependencies));
        yield* Effect.yieldNow();
        yield* TestClock.adjust('20 millis');
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestContext.TestContext))
    );

    expect(outcome.report.actions[0].durationMs).to.equal(20);
    expect(sleeps).to.deep.equal([20]);
    expect(retryDelayMs({ type: 'fixed', delayMs: 40, jitter: true }, 1, () => 0)).to.equal(20);
    expect(retryDelayMs({ type: 'fixed', delayMs: 40, jitter: true }, 1, () => 1)).to.equal(60);
  });

  it('executes a native Effect action with its required layer already provided', async function () {
    const service = Context.GenericTag<{ value: number }>('test/native-action-service');
    const nativeAction = Effect.gen(function* () {
      const current = yield* service;
      return current.value + 1;
    }).pipe(Effect.provideService(service, { value: 4 }));
    const operation = createActionExecutionOperation('onCreate');
    const outcome = await runActionPlan(
      [
        {
          actionId: 'native-layered',
          mode: 'onCreate',
          phase: 'pre',
          index: 0,
          invoke: () => legacyHookToEffect(() => nativeAction),
        },
      ],
      createPhaseContext(operation, 'pre')
    );

    expect(outcome.values).to.deep.equal([5]);
    expect(outcome.report.actions[0].status).to.equal('succeeded');
  });

  it('logs starts at debug and keeps payloads out of info/warn fields', async function () {
    const logs: Array<{ level: string; name: string; fields?: Record<string, unknown> }> = [];
    const operation = createActionExecutionOperation('onCreate');
    await runActionPlan(
      [
        {
          actionId: 'redacted-payload',
          mode: 'onCreate',
          phase: 'pre',
          index: 0,
          invoke: () => Effect.succeed({ token: 'secret-token', options: { password: 'secret-password' } }),
        },
      ],
      createPhaseContext(operation, 'pre'),
      {
        logger: {
          debug: (name, fields) => logs.push({ level: 'debug', name, fields }),
          info: (name, fields) => logs.push({ level: 'info', name, fields }),
          warn: (name, fields) => logs.push({ level: 'warn', name, fields }),
        },
      }
    );

    expect(logs.some(log => log.level === 'debug' && log.name === 'record_hook_action_started')).to.equal(true);
    expect(logs.some(log => log.level === 'debug' && log.name === 'record_hook_action_attempt_succeeded')).to.equal(
      true
    );
    const productionLogs = logs.filter(log => log.level === 'info' || log.level === 'warn');
    expect(JSON.stringify(productionLogs)).not.to.include('secret-token');
    expect(JSON.stringify(productionLogs)).not.to.include('secret-password');
  });

  it('interrupts supervised detached fibers during teardown', async function () {
    const messages: Array<{ name: string; fields?: Record<string, unknown> }> = [];
    const supervisor = createActionExecutionSupervisor();
    const operation = createActionExecutionOperation('onCreate');
    dispatchDetachedActionPlan(
      [
        {
          actionId: 'never-completes',
          mode: 'onCreate',
          phase: 'post',
          index: 0,
          invoke: () =>
            Effect.async((_resume, signal) => {
              signal.addEventListener('abort', () => undefined, { once: true });
            }),
        },
      ],
      createPhaseContext(operation, 'post'),
      {
        supervisor,
        logger: {
          debug: (name, fields) => messages.push({ name, fields }),
          warn: (name, fields) => messages.push({ name, fields }),
        },
      }
    );
    await new Promise(resolve => setImmediate(resolve));
    supervisor?.interruptAll?.();
    await new Promise(resolve => setTimeout(resolve, 25));

    expect(
      messages.some(
        entry => entry.name === 'record_hook_detached_action_failed' && entry.fields?.failure_kind === 'interrupted'
      )
    ).to.equal(true);
  });

  it('unregisters detached fibers after they complete', async function () {
    const registered: unknown[] = [];
    const unregistered: unknown[] = [];
    const operation = createActionExecutionOperation('onCreate');
    dispatchDetachedActionPlan(
      [
        {
          actionId: 'completes',
          mode: 'onCreate',
          phase: 'post',
          index: 0,
          invoke: () => Effect.succeed(undefined),
        },
      ],
      createPhaseContext(operation, 'post'),
      {
        supervisor: {
          register: fiber => registered.push(fiber),
          unregister: fiber => unregistered.push(fiber),
        },
      }
    );

    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    expect(registered).to.have.length(1);
    expect(unregistered).to.deep.equal(registered);
  });

  it('fails the action when a post-sync hook returns the wrong shape and still reports the phase', async function () {
    const recordType = {
      hooks: {
        onUpdate: {
          postSync: [
            { id: 'bad', function: 'bad' },
            { id: 'never', function: 'never' },
          ],
        },
      },
    };
    const operation = createActionExecutionOperation('onUpdate');
    const invoked: string[] = [];
    const coordinator = new RecordHookCoordinator({
      operation,
      resolveHook: hook => {
        const name = (hook as { function: string }).function;
        return () => {
          invoked.push(name);
          return name === 'bad' ? null : {};
        };
      },
    });

    let thrown: unknown;
    try {
      await coordinator.runPostSync('oid-1', {}, recordType, 'onUpdate', {}, {});
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.equal(undefined);
    expect(invoked).to.deep.equal(['bad']);
    expect(operation.reports).to.have.length(1);
    expect(operation.reports[0].actions.map(action => action.status)).to.deep.equal(['failed', 'skipped']);
  });

  it('rejects duplicate explicit hook ids before any hook runs', async function () {
    const recordType = {
      hooks: {
        onUpdate: {
          pre: [
            { id: 'same', function: 'a' },
            { id: 'same', function: 'b' },
          ],
        },
      },
    };
    const coordinator = new RecordHookCoordinator({
      operation: createActionExecutionOperation('onUpdate'),
      resolveHook: () => () => ({}),
    });

    let thrown: unknown;
    try {
      await coordinator.runPre('oid-1', {}, recordType, 'onUpdate', {});
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error | undefined)?.message).to.contain("Duplicate pre hook id 'same'");
  });
});
