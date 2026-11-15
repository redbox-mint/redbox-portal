// Retained Express host contracts. Not part of the public extension API.
import type { Server } from 'node:http';
import type { RequestHandler } from 'express';
import type { ApplicationModule } from '../application';
import type { ExtensionFactory, ExtensionData } from './contract';

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
 * Versioned v6 extension declaration, safe for offline import and inspection.
 * @extensionPoint Export registerRedboxExtension returning apiVersion 1. Contribute factories, routes and data; acquisition belongs to the awaited application lifecycle.
 * @see https://github.com/redbox-mint/redbox-portal/wiki/Redbox-Loader
 */
export interface RedboxExtension extends ExtensionData {
  readonly apiVersion: 1;
  readonly handlers?: readonly ExtensionFactory<never, RequestHandler>[];
  readonly routes?: readonly ExtensionRoute[];
  readonly middleware?: readonly {
    readonly name: string;
    readonly stage: 'beforeRoutes' | 'afterRoutes';
    readonly handler: string;
  }[];
  readonly integrations?: readonly ExtensionFactory<never, ExtensionHostIntegration>[];
}
