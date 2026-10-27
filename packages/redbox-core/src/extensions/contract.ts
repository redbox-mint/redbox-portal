import type { Server } from 'node:http';
import type { RequestHandler } from 'express';
export type { RequestHandler } from 'express';
import type { ApplicationModule } from '../application';

/**
 * Offline factory declaration with a concrete, application-bound input.
 * @extensionPoint Register a named module or handler factory; declare requires and replaces explicitly. The selected application supplies each concrete dependency.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Services-Architecture
 */
export interface ExtensionFactory<Input = never, Output = ApplicationModule> {
  readonly name: string;
  readonly requires?: readonly string[];
  /** Replacing a lower-precedence registration must be intentional. */
  readonly replaces?: true;
  create(input: Input): Output;
}

/**
 * Explicit HTTP route declaration with mandatory access policy.
 * @extensionPoint Register routes with selected handler names and public or named access policies. The host owns the listener and policy binding.
 */
export interface ExtensionRoute {
  readonly name: string;
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
  readonly path: string;
  readonly handler: string;
  readonly access: 'public' | readonly string[];
  readonly replaces?: true;
}

/**
 * Owned integration with the host's single HTTP server.
 * @extensionPoint Supply prepare and application lifecycle methods; never listen independently or install process signals.
 */
export interface ExtensionHostIntegration extends ApplicationModule {
  prepare(server: Server): Promise<void>;
}

/**
 * Named, awaited startup or ledger migration work.
 * @extensionPoint Register ordered work with concrete inputs bound by the application. Migrations must tolerate replay after a partial failure.
 */
export interface ExtensionWork {
  readonly name: string;
  readonly requires?: readonly string[];
  /** Bound by the later bootstrap/ledger composition, never by inspection. */
  run(input: never): Promise<void>;
}

/**
 * Versioned v6 extension declaration, safe for offline import and inspection.
 * @extensionPoint Export registerRedboxExtension returning apiVersion 1. Contribute factories, routes and data; acquisition belongs to the awaited application lifecycle.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Redbox-Loader
 */
export interface RedboxExtension {
  readonly apiVersion: 1;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly modules?: readonly ExtensionFactory[];
  readonly handlers?: readonly ExtensionFactory<never, RequestHandler>[];
  readonly routes?: readonly ExtensionRoute[];
  readonly middleware?: readonly {
    readonly name: string;
    readonly stage: 'beforeRoutes' | 'afterRoutes';
    readonly handler: string;
  }[];
  readonly integrations?: readonly ExtensionFactory<never, ExtensionHostIntegration>[];
  readonly migrations?: readonly ExtensionWork[];
  readonly bootstrap?: readonly ExtensionWork[];
  readonly jobs?: Readonly<Record<string, unknown>>;
  readonly forms?: Readonly<Record<string, unknown>>;
  readonly workflows?: Readonly<Record<string, unknown>>;
  readonly configModels?: readonly { readonly name: string; readonly definition: Readonly<Record<string, unknown>> }[];
  readonly contributors?: readonly { readonly name: string; readonly module: string }[];
  /** Package-relative directories, resolved against the installed artifact. */
  readonly views?: readonly string[];
  readonly assets?: readonly string[];
}
