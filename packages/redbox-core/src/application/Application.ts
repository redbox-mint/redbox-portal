import type { PersistenceOwner } from '../persistence/owner';
import type { PersistenceResource } from '../persistence/types';
import {
  cleanupPersistence,
  initializePersistence,
  persistenceStatus,
  registerPersistenceResource,
} from '../persistence/runtime';

export interface ApplicationModule extends PersistenceResource {
  initialize(): Promise<void>;
  activate?(): Promise<void>;
}

/** Resolved before construction. Dependencies are wired into each factory's closure. */
export interface ApplicationModuleFactory {
  readonly name: string;
  create(): ApplicationModule;
}

export interface ApplicationWork {
  readonly name: string;
  readonly requires?: readonly string[];
  run(): Promise<void>;
}

/** Fixed startup stages, not a configurable workflow engine. Operations are bound offline. */
export interface ApplicationInitialization {
  readonly preparePersistence?: () => Promise<void>;
  readonly migrations?: () => Promise<void>;
  readonly coreBootstrap?: readonly ApplicationWork[];
  readonly extensionBootstrap?: readonly ApplicationWork[];
  readonly postBootstrap?: readonly ApplicationWork[];
}

export type ApplicationState =
  | 'constructed'
  | 'initializing'
  | 'initialized'
  | 'activating'
  | 'active'
  | 'stopping'
  | 'stopped'
  | 'failed';

export interface ApplicationStatus {
  readonly state: ApplicationState;
  readonly ready: boolean;
  readonly failure?: { readonly phase: 'initialize' | 'activate'; readonly module?: string; readonly stage?: string };
  readonly stopFailed: boolean;
  readonly cleanupPending: boolean;
  readonly persistence: ReturnType<typeof persistenceStatus>;
}

export interface Application {
  initialize(): Promise<void>;
  activate(): Promise<void>;
  stop(options?: { deadlineMs?: number }): Promise<void>;
  status(): ApplicationStatus;
}

export class ApplicationLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ApplicationLifecycleError';
  }
}

class ApplicationStoppingError extends ApplicationLifecycleError {
  public constructor() {
    super('Application stop has begun; use a fresh application for another start.');
  }
}

const applicationKey = Symbol.for('@researchdatabox/redbox-core/application/v1');

/**
 * Owns one already-resolved module set and the existing persistence resource registry.
 * Construction only wires dependencies. Factories are synchronous and must not acquire
 * resources; each returned module is registered before its awaited initialization.
 * Bound operations run in fixed startup stages; no service locator, discovery or signals live here.
 */
export class ApplicationRuntime implements Application {
  private state: ApplicationState = 'constructed';
  private readonly factories: readonly ApplicationModuleFactory[];
  private readonly modules = new Map<string, ApplicationModule>();
  private initializing?: Promise<void>;
  private activating?: Promise<void>;
  private inFlight?: Promise<void>;
  private stopping?: Promise<void>;
  private stopRequested = false;
  private cleanedUp = false;
  private stopFailed = false;
  private failure?: ApplicationStatus['failure'];
  private stage?: string;
  private readonly initialization: ApplicationInitialization;

  public constructor(
    private readonly owner: PersistenceOwner,
    factories: readonly ApplicationModuleFactory[] = [],
    initialization: ApplicationInitialization = {}
  ) {
    if (Reflect.get(owner, applicationKey))
      throw new ApplicationLifecycleError(
        'A persistence owner belongs to one application. Restart with a fresh owner.'
      );
    const names = new Set<string>();
    this.factories = factories.map(factory => {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(factory.name) || names.has(factory.name))
        throw new ApplicationLifecycleError('Application module names must be unique, bounded identifiers.');
      names.add(factory.name);
      return { name: factory.name, create: factory.create.bind(factory) };
    });
    for (const stage of [
      initialization.coreBootstrap,
      initialization.extensionBootstrap,
      initialization.postBootstrap,
    ]) {
      const steps = new Set<string>();
      for (const step of stage ?? []) {
        if (!/^[A-Za-z0-9_:@./-]{1,200}$/.test(step.name) || steps.has(step.name))
          throw new ApplicationLifecycleError('Bootstrap work needs unique bounded names within its stage.');
        steps.add(step.name);
        for (const dependency of step.requires ?? [])
          if (!names.has(dependency))
            throw new ApplicationLifecycleError('Bootstrap work requires an unavailable module.');
      }
    }
    const snapshot = (work: readonly ApplicationWork[] | undefined) =>
      work?.map(step => ({
        name: step.name,
        requires: step.requires && [...step.requires],
        run: step.run.bind(step),
      }));
    this.initialization = {
      ...initialization,
      coreBootstrap: snapshot(initialization.coreBootstrap),
      extensionBootstrap: snapshot(initialization.extensionBootstrap),
      postBootstrap: snapshot(initialization.postBootstrap),
    };
    Object.defineProperty(owner, applicationKey, { value: true });
  }

  public initialize(): Promise<void> {
    if (this.stopRequested) return Promise.reject(new ApplicationStoppingError());
    if (this.initializing) return this.initializing;
    this.state = 'initializing';
    let currentModule: string | undefined;
    const work = Promise.resolve().then(async () => {
      this.assertRunning();
      this.stage = 'persistence';
      await initializePersistence(this.owner);
      this.assertRunning();
      await this.initialization.preparePersistence?.();
      this.stage = 'modules';
      for (const factory of this.factories) {
        this.assertRunning();
        currentModule = factory.name;
        const module = factory.create();
        registerPersistenceResource(this.owner, 'module:' + factory.name, {
          drain: () => module.drain?.() ?? Promise.resolve(),
          close: async () => {
            await module.close();
            this.modules.delete(factory.name);
          },
        });
        this.modules.set(factory.name, module);
        await module.initialize();
      }
      currentModule = undefined;
      this.assertRunning();
      this.stage = 'migrations';
      await this.initialization.migrations?.();
      for (const [name, steps] of [
        ['coreBootstrap', this.initialization.coreBootstrap],
        ['extensionBootstrap', this.initialization.extensionBootstrap],
        ['postBootstrap', this.initialization.postBootstrap],
      ] as const) {
        for (const step of steps ?? []) {
          this.assertRunning();
          this.stage = name + ':' + step.name;
          await step.run();
        }
      }
      this.assertRunning();
      this.stage = undefined;
      this.state = 'initialized';
    });
    this.inFlight = work;
    this.initializing = work.catch(error => this.failed(error, 'initialize', currentModule));
    return this.initializing;
  }

  public activate(): Promise<void> {
    if (this.stopRequested) return Promise.reject(new ApplicationStoppingError());
    if (this.activating) return this.activating;
    if (this.state !== 'initialized')
      return Promise.reject(new ApplicationLifecycleError('Await application initialization before activation.'));
    this.state = 'activating';
    let currentModule: string | undefined;
    const work = Promise.resolve().then(async () => {
      for (const [name, module] of this.modules) {
        this.assertRunning();
        currentModule = name;
        await module.activate?.();
      }
      this.assertRunning();
      this.state = 'active';
    });
    this.inFlight = work;
    this.activating = work.catch(error => this.failed(error, 'activate', currentModule));
    return this.activating;
  }

  public stop(options: { deadlineMs?: number } = {}): Promise<void> {
    if (this.stopping) return this.stopping;
    if (this.cleanedUp) return Promise.resolve();
    const deadlineMs = options.deadlineMs ?? 30_000;
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0)
      return Promise.reject(new ApplicationLifecycleError('Application stop deadlineMs must be a positive integer.'));
    this.stopRequested = true;
    this.state = 'stopping';
    const deadline = Date.now() + deadlineMs;
    const attempt = Promise.resolve().then(async () => {
      // Wait for acquisition/activation to settle before initiating cleanup. This
      // is the stage work, not its failure handler (which may itself await stop).
      await this.withDeadline(this.inFlight?.catch(() => {}) ?? Promise.resolve(), deadline);
      await this.withDeadline(cleanupPersistence(this.owner), deadline);
      this.cleanedUp = true;
      this.stopFailed = false;
      this.state = 'stopped';
    });
    this.stopping = attempt.catch(error => {
      this.stopFailed = true;
      this.state = 'failed';
      throw error;
    });
    const result = this.stopping;
    const settled = () => {
      if (this.stopping === result) this.stopping = undefined;
    };
    void result.then(settled, settled);
    return result;
  }

  public status(): ApplicationStatus {
    const persistence = persistenceStatus(this.owner);
    return {
      state: this.state,
      ready: this.state === 'active' && !this.stopRequested && persistence.ready,
      failure: this.failure && { ...this.failure },
      stopFailed: this.stopFailed,
      cleanupPending: this.stopRequested && !this.cleanedUp,
      persistence,
    };
  }

  private assertRunning(): void {
    if (this.stopRequested) throw new ApplicationStoppingError();
  }

  private async failed(error: unknown, phase: 'initialize' | 'activate', module?: string): Promise<never> {
    const interrupted = error instanceof ApplicationStoppingError;
    if (!interrupted)
      this.failure = {
        phase,
        module,
        ...(phase === 'initialize' && !module && this.stage ? { stage: this.stage } : {}),
      };
    if (!this.stopRequested) {
      try {
        await this.stop();
      } catch {
        /* stop failure is separately visible and retryable */
      }
    } else {
      // An expired stop is never silently retried when a slow acquisition settles.
      await this.stopping?.catch(() => {});
    }
    if (!interrupted && this.cleanedUp) this.state = 'failed';
    throw error;
  }

  private async withDeadline(work: Promise<void>, deadline: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ApplicationLifecycleError(
                  'Application stop deadline exceeded. Resources remain owned; await work and retry stop.'
                )
              ),
            Math.max(0, deadline - Date.now())
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
