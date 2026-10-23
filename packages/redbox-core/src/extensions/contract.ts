import type { Server } from 'node:http';
import type { RequestHandler } from 'express';
import type { ApplicationModule } from '../application';

/** Factories accept their own concrete input type, never a default container. */
export interface ExtensionFactory<Input = never, Output = ApplicationModule> {
  readonly name: string;
  readonly requires?: readonly string[];
  /** Replacing a lower-precedence registration must be intentional. */
  readonly replaces?: true;
  create(input: Input): Output;
}

export interface ExtensionRoute {
  readonly name: string;
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
  readonly path: string;
  readonly handler: string;
  readonly access: 'public' | readonly string[];
  readonly replaces?: true;
}

/** The host supplies its one server. Integrations never listen or install signals. */
export interface ExtensionHostIntegration extends ApplicationModule {
  prepare(server: Server): Promise<void>;
}

export interface ExtensionWork {
  readonly name: string;
  readonly requires?: readonly string[];
  /** Bound by the later bootstrap/ledger composition, never by inspection. */
  run(input: never): Promise<void>;
}

/** Offline declaration only: importing/registering must not acquire resources. */
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
