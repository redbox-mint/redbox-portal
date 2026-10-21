import { cloneDeep } from 'lodash';
import type { PublicationObject, PublicationProviderExecution, PublicationResourceExecution } from './contracts';

/** Retained adapter capabilities cannot start work after their invocation returned. @internal */
export class PublicationInvocationEnded extends Error {
  constructor() {
    super('Publication adapter invocation has ended');
  }
}

/** Host-owned verdict across callbacks and the adapter's returned proposal. @internal */
export class PublicationProposal {
  failure?: Error;
  private readonly pending = new Set<Promise<unknown>>();
  private closed = false;
  private assertOpen(): void {
    this.assertAccepted();
    if (this.closed) this.reject(new PublicationInvocationEnded());
  }
  async finish(): Promise<void> {
    // The adapter has returned. Drain work already admitted, but never admit
    // a timer/retained-context callback while an earlier callback is pending.
    this.closed = true;
    while (this.pending.size) await Promise.allSettled([...this.pending]);
    this.assertAccepted();
  }
  assertAccepted(): void {
    if (this.failure) throw this.failure;
  }
  reject(error: unknown): never {
    this.failure ??= error instanceof Error ? error : new Error('Publication proposal rejected');
    throw this.failure;
  }
  value<T>(run: () => T): T {
    this.assertOpen();
    try {
      return run();
    } catch (error) {
      return this.reject(error);
    }
  }
  run<T>(run: () => Promise<T>, providerError?: (error: unknown) => boolean): Promise<T> {
    try {
      this.assertOpen();
    } catch (error) {
      return Promise.reject(error);
    }
    const task = (async () => {
      try {
        return await run();
      } catch (error) {
        // A provider's transport/callback failure is not a rejected host check.
        if (providerError?.(error)) throw error;
        return this.reject(error);
      }
    })();
    this.pending.add(task);
    void task.then(
      () => this.pending.delete(task),
      () => this.pending.delete(task)
    );
    return task;
  }
}

type ResourceLease = <T>(
  namespace: string,
  key: string,
  run: (resource: PublicationResourceExecution) => Promise<T>
) => Promise<T>;

/** Resource callbacks share the invocation verdict; provider failures retain their retry semantics. @internal */
export function publicationResourceProposal(proposal: PublicationProposal, acquire: ResourceLease): ResourceLease {
  return (namespace, key, run) => {
    let failed = false;
    let failure: unknown;
    return proposal.run(
      () =>
        acquire(namespace, key, async resource => {
          try {
            return await run({
              ...resource,
              operations: cloneDeep(resource.operations),
              journal: operation => proposal.run(() => resource.journal(cloneDeep(operation))),
            });
          } catch (error) {
            failed = true;
            failure = error;
            throw error;
          }
        }),
      error => failed && error === failure
    );
  };
}

/** Every host callback and the returned outcome are gated independently of adapter catch blocks. @internal */
export function publicationExecutionProposal<
  Config extends PublicationObject,
  State extends PublicationObject,
  Prepared extends PublicationObject,
>(context: PublicationProviderExecution<Config, State, Prepared>, proposal = new PublicationProposal()) {
  const guarded: PublicationProviderExecution<Config, State, Prepared> = {
    ...context,
    assertAuthority: () => proposal.run(() => context.assertAuthority()),
    project: fields => proposal.run(() => context.project(cloneDeep(fields))),
    checkpoint: (state, ids) => proposal.run(() => context.checkpoint(cloneDeep(state), ids && [...ids])),
    bind: binding => proposal.run(() => context.bind(cloneDeep(binding))),
    journal: operation => proposal.run(() => context.journal(cloneDeep(operation))),
    openAttachment: (id, path) => proposal.run(() => context.openAttachment(id, path)),
    idempotencyKey: operation => proposal.value(() => context.idempotencyKey(operation)),
    audit: summary => proposal.run(() => context.audit(cloneDeep(summary))),
    mutate: (operation, send) => {
      let failed = false;
      let failure: unknown;
      return proposal.run(
        () =>
          context.mutate(operation, async key => {
            try {
              return await send(key);
            } catch (error) {
              failed = true;
              failure = error;
              throw error;
            }
          }),
        error => failed && error === failure
      );
    },
    withResourceLease: publicationResourceProposal(proposal, (namespace, key, run) =>
      context.withResourceLease(namespace, key, run)
    ),
  };
  return { context: guarded, proposal };
}
