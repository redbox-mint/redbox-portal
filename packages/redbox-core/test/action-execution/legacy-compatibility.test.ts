import { Effect } from 'effect';
import { expect } from 'chai';
import { Observable, of } from 'rxjs';
import { ActionTransientFailure, createActionExecutionOperation } from '../../src/action-execution/index';
import { RecordHookCoordinator } from '../../src/services/record-hooks/coordinator';

type AnyRecord = Record<string, unknown>;

function coordinator(
  resolveHook: (hook: AnyRecord) => (...args: unknown[]) => unknown,
  logger?: {
    debug?: (...args: any[]) => void;
    info?: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
  }
) {
  return new RecordHookCoordinator({
    operation: createActionExecutionOperation('onCreate'),
    dependencies: { logger },
    resolveHook: hook => resolveHook(hook as AnyRecord),
  });
}

function tick(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

describe('record-hook legacy compatibility characterization', function () {
  it('passes immutable server operation context without shifting legacy arguments or trusting candidate context', async function () {
    const actor = { username: 'user' };
    const record = { operation: 'create', metadata: { operation: 'create' } };
    const options = { operation: 'create', retained: true };
    for (const [operationMode, hookMode, expected] of [
      ['onCreate', 'onTransitionWorkflow', 'create'],
      ['onUpdate', 'onUpdate', 'update'],
      ['onTransitionWorkflow', 'onTransitionWorkflow', 'update'],
      ['onDelete', 'onDelete', 'delete'],
    ] as const) {
      const calls: unknown[][] = [];
      const instance = new RecordHookCoordinator({
        operation: createActionExecutionOperation(operationMode),
        resolveHook: () => (...args: unknown[]) => {
          calls.push(args);
          return args[1];
        },
      });
      await instance.runPre('oid-1', record, {
        hooks: { [hookMode]: { pre: [{ function: 'capture', options }] } },
      }, hookMode, actor);
      expect(calls).to.have.length(1);
      expect(calls[0].slice(0, 5)).to.deep.equal(['oid-1', record, options, actor, undefined]);
      expect(calls[0][5]).to.deep.equal({ operation: expected });
      expect(Object.isFrozen(calls[0][5])).to.equal(true);
    }
  });

  it('preserves plain, Promise, Observable, and native Effect pre-hook values', async function () {
    const values = await Promise.all([
      coordinator(() => () => 'plain').runPre(
        null,
        {},
        { hooks: { onCreate: { pre: [{ function: 'plain' }] } } },
        'onCreate',
        {}
      ),
      coordinator(() => () => Promise.resolve('promise')).runPre(
        null,
        {},
        { hooks: { onCreate: { pre: [{ function: 'promise' }] } } },
        'onCreate',
        {}
      ),
      coordinator(() => () => of('observable')).runPre(
        null,
        {},
        { hooks: { onCreate: { pre: [{ function: 'observable' }] } } },
        'onCreate',
        {}
      ),
      coordinator(() => () => Effect.succeed('effect')).runPre(
        null,
        {},
        { hooks: { onCreate: { pre: [{ function: 'effect' }] } } },
        'onCreate',
        {}
      ),
    ]);

    expect(values.map(result => result.record)).to.deep.equal(['plain', 'promise', 'observable', 'effect']);
  });

  it('preserves sequential record threading and fail-fast omission', async function () {
    const invoked: string[] = [];
    const recordType = {
      hooks: {
        onCreate: {
          pre: [{ function: 'first' }, { function: 'second' }, { function: 'never' }],
        },
      },
    };
    const result = await coordinator(hook => {
      const name = String(hook.function);
      return (_oid, record) => {
        invoked.push(name);
        if (name === 'second') {
          throw new Error('legacy stop');
        }
        return { ...(record as AnyRecord), first: true };
      };
    }).runPre('oid-1', { initial: true }, recordType, 'onCreate', { username: 'user' });

    expect(invoked).to.deep.equal(['first', 'second']);
    expect(result.record).to.deep.equal({ initial: true, first: true });
    expect(result.report.actions.map(action => action.status)).to.deep.equal(['succeeded', 'failed', 'skipped']);
  });

  it('locks the postSync record-return and in-place response mutation quirk', async function () {
    const recordType = {
      hooks: {
        onCreate: {
          postSync: [
            { function: 'record', options: { returnType: 'record' } },
            { function: 'response', options: { returnType: 'response' } },
          ],
        },
      },
    };
    const seen: AnyRecord[] = [];
    const result = await coordinator(hook => {
      if (hook.function === 'record') {
        return (_oid, record, _options, _user, response) => {
          seen.push({ record: record as AnyRecord, response: response as AnyRecord });
          (response as AnyRecord).workspaceOid = 'workspace-1';
          return { ...(record as AnyRecord), transformed: true };
        };
      }
      return (_oid, record, _options, _user, response) => {
        seen.push({ record: record as AnyRecord, response: response as AnyRecord });
        (response as AnyRecord).workspaceData = { linked: true };
        return {
          success: false,
          message: 'legacy response',
          data: { accepted: true },
          metadata: { warning: true },
          oid: 'must-not-replace',
          secret: 'must-not-leak',
        };
      };
    }).runPostSync('oid-1', { original: true }, recordType, 'onCreate', {}, { oid: 'oid-1', success: true });

    expect(result.record).to.deep.equal({ original: true, transformed: true });
    expect(seen[1].record).to.deep.equal({ original: true, transformed: true });
    expect(result.response).to.deep.include({
      oid: 'oid-1',
      success: false,
      message: 'legacy response',
      data: { accepted: true },
      metadata: { warning: true },
      workspaceOid: 'workspace-1',
      workspaceData: { linked: true },
    });
    expect(result.response).not.to.have.property('secret');
  });

  it('tracks the highest applied postSync record revision without changing hook replacements', async function () {
    const values: AnyRecord[] = [
      { revision: 3, earlierOnly: true },
      { revision: 9, authorization: { edit: [] } },
      { revision: 4 },
      ...[-1, 1.5, '99', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined].map(revision => ({ revision })),
      { revision: 100 },
      { metadata: { partial: true } },
    ];
    const seen: unknown[] = [];
    const result = await coordinator(hook => (_oid, record) => {
      seen.push(record);
      return values[Number(hook.function)];
    }).runPostSync(
      'oid-1',
      { revision: 1 },
      {
        hooks: {
          onUpdate: {
            postSync: values.map((_value, index) => ({
              function: String(index),
              ...(index === values.length - 2 ? { options: { returnType: 'response' } } : {}),
            })),
          },
        },
      },
      'onUpdate',
      {},
      {}
    );

    expect(result.committedRevision).to.equal(9);
    expect(result.committedRecord).to.deep.equal({
      revision: 9,
      authorization: { edit: [] },
      metadata: { partial: true },
    });
    expect(result.record).to.equal(values.at(-1));
    expect(result.record).not.to.have.property('revision');
    expect(seen[values.length - 1]).to.equal(values[values.length - 3]);
  });

  it('does not adopt absent or invalid revisions or response hook revisions', async function () {
    for (const revision of [undefined, -1, 1.5, '9', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const result = await coordinator(
        hook => () => (hook.function === 'record' ? { revision } : { revision: 99 })
      ).runPostSync(
        'oid-1',
        { revision: 50 },
        {
          hooks: {
            onUpdate: {
              postSync: [{ function: 'record' }, { function: 'response', options: { returnType: 'response' } }],
            },
          },
        },
        'onUpdate',
        {},
        {}
      );
      expect(result.committedRevision).to.equal(undefined);
      expect(result.committedRecord).to.equal(undefined);
    }
  });

  it('tracks only the final applied value after a postSync hook retries', async function () {
    let attempts = 0;
    const result = await coordinator(() => (_oid, record) => {
      attempts += 1;
      if (attempts === 1) {
        // A failed attempt may mutate its input, but has no applied result.
        (record as AnyRecord).revision = 99;
        throw new ActionTransientFailure('retry before applying');
      }
      return { revision: 4 };
    }).runPostSync(
      'oid-1',
      { revision: 1 },
      {
        hooks: {
          onUpdate: {
            postSync: [
              {
                function: 'retry',
                execution: { retry: { maxAttempts: 2, idempotent: true } },
              },
            ],
          },
        },
      },
      'onUpdate',
      {},
      {}
    );

    expect(attempts).to.equal(2);
    expect(result.report.actions[0].attempts).to.equal(2);
    expect(result.committedRevision).to.equal(4);
    expect(result.committedRecord).to.deep.equal({ revision: 4 });
    expect(result.record).to.deep.equal({ revision: 4 });
  });

  it('isolates the committed base from hook inputs, response hooks, and failed retry mutations', async function () {
    const committed = { revision: 7, authorization: { edit: [] as string[] }, metadata: { saved: true } };
    const partial = { metadata: { later: true } };
    const final = { custom: { applied: true } };
    const seen: unknown[] = [];
    let attempts = 0;
    const result = await coordinator(hook => (_oid, record) => {
      seen.push(record);
      if (hook.function === 'commit') return committed;
      if (hook.function === 'partial') {
        committed.authorization.edit.push('input-mutation');
        return partial;
      }
      if (hook.function === 'response') {
        partial.metadata.later = false;
        return { revision: 99, authorization: { edit: ['response'] }, metadata: { response: true } };
      }
      attempts += 1;
      if (attempts === 1) {
        Reflect.set(record as AnyRecord, 'revision', 100);
        Reflect.set(partial.metadata, 'failedAttempt', true);
        throw new ActionTransientFailure('unapplied mutation');
      }
      return final;
    }).runPostSync(
      'oid-1',
      { revision: 1 },
      {
        hooks: {
          onUpdate: {
            postSync: [
              { function: 'commit' },
              { function: 'partial' },
              { function: 'response', options: { returnType: 'response' } },
              { function: 'retry', execution: { retry: { maxAttempts: 2, idempotent: true } } },
            ],
          },
        },
      },
      'onUpdate',
      {},
      {}
    );

    expect(result.committedRevision).to.equal(7);
    expect(result.committedRecord).to.deep.equal({
      revision: 7,
      authorization: { edit: [] },
      metadata: { later: true },
      custom: { applied: true },
    });
    expect(result.record).to.equal(final);
    expect(seen[1]).to.equal(committed);
    expect(seen[2]).to.equal(partial);
    expect(seen[3]).to.equal(partial);
    final.custom.applied = false;
    expect(result.committedRecord?.custom).to.deep.equal({ applied: true });
  });

  it('keeps a committed base isolated when a later hook fails without an applied result', async function () {
    const result = await coordinator(hook => (_oid, record) => {
      if (hook.function === 'commit') return { revision: 7, metadata: { committed: true } };
      Reflect.set(record as AnyRecord, 'metadata', { failed: true });
      throw new Error('failed hook');
    }).runPostSync(
      'oid-1',
      {},
      {
        hooks: { onUpdate: { postSync: [{ function: 'commit' }, { function: 'fail' }] } },
      },
      'onUpdate',
      {},
      {}
    );
    expect(result.terminalCause).not.to.equal(undefined);
    expect(result.committedRevision).to.equal(7);
    expect(result.committedRecord).to.deep.equal({ revision: 7, metadata: { committed: true } });
    expect(result.record).to.deep.equal({ revision: 7, metadata: { failed: true } });
  });

  it('preserves detached invocation order, overlap, ignored returns, and swallowed failures', async function () {
    const invoked: string[] = [];
    const completed: string[] = [];
    const errors: unknown[] = [];
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const recordType = {
      hooks: {
        onCreate: {
          post: [{ function: 'first' }, { function: 'second' }, { function: 'failure' }],
        },
      },
    };
    const result = coordinator(
      hook => {
        if (hook.function === 'first') {
          return () => {
            invoked.push('first');
            return new Promise<void>(resolve => {
              resolveFirst = () => {
                completed.push('first');
                resolve();
              };
            });
          };
        }
        if (hook.function === 'second') {
          return () => {
            invoked.push('second');
            return new Promise<void>(resolve => {
              resolveSecond = () => {
                completed.push('second');
                resolve();
              };
            });
          };
        }
        return () => {
          invoked.push('failure');
          throw new Error('detached failure');
        };
      },
      { error: (_message, error) => errors.push(error) }
    ).dispatchPost('oid-1', { value: true }, recordType, 'onCreate', { username: 'user' });

    expect(result.report.status).to.equal('dispatched');
    await tick();
    expect(invoked).to.deep.equal(['first', 'second', 'failure']);
    resolveSecond();
    resolveFirst();
    await tick();
    expect(completed).to.deep.equal(['second', 'first']);
    expect(errors).to.have.length(1);
  });

  it('skips one malformed detached definition and still dispatches later hooks', async function () {
    const invoked: string[] = [];
    const warnings: unknown[] = [];
    const recordType = {
      hooks: {
        onCreate: {
          post: [{ function: '' }, { function: 'valid' }],
        },
      },
    };
    const result = coordinator(
      hook => () => {
        invoked.push(String(hook.function));
        return undefined;
      },
      { warn: (_message, fields) => warnings.push(fields) }
    ).dispatchPost('oid-1', {}, recordType, 'onCreate', {});

    await tick();
    expect(result.report.actions.map(action => action.actionId)).to.have.length(1);
    expect(invoked).to.deep.equal(['valid']);
    expect(warnings).to.have.length(1);
  });

  it('captures Observable failure and synchronous detached throws without leaking the cause', async function () {
    const errors: Array<Record<string, unknown>> = [];
    const recordType = {
      hooks: {
        onCreate: {
          post: [{ function: 'observable' }, { function: 'throw' }],
        },
      },
    };
    coordinator(
      hook => () =>
        hook.function === 'observable'
          ? new Observable(subscriber => subscriber.error({ secret: 'do-not-log' }))
          : (() => {
              throw new Error('secret throw');
            })(),
      {
        error: (_message, fields) => errors.push(fields as Record<string, unknown>),
      }
    ).dispatchPost('oid-1', {}, recordType, 'onCreate', {});
    await tick();

    expect(errors).to.have.length(2);
    expect(JSON.stringify(errors)).not.to.include('secret');
  });
});
