import type { HttpHookContribution, HttpFallbackContribution } from '../http/contracts';
import type { ApplicationModule } from '../application';
import type { ControllerRegistration, HttpRouteDeclaration } from '../http/contracts';

/**
 * Offline factory declaration with a concrete, application-bound input.
 * @extensionPoint Register a named module or controller factory; declare requires and replaces explicitly. The selected application supplies each concrete dependency.
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
 * Named, awaited startup or ledger migration work.
 * @extensionPoint Register ordered work with concrete inputs bound by the application. Migrations must tolerate replay after a partial failure.
 */
export interface ExtensionWork {
  readonly name: string;
  readonly requires?: readonly string[];
  /** Bound by the later bootstrap/ledger composition, never by inspection. */
  run(input: never): Promise<void>;
}

/** Transport-independent extension contributions, shared by both hosts.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface ExtensionData {
  readonly config?: Readonly<Record<string, unknown>>;
  readonly modules?: readonly ExtensionFactory[];
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

/** Current Fastify extension contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface RedboxExtensionV2 extends ExtensionData {
  readonly apiVersion: 2;
  readonly controllers?: readonly ControllerRegistration[];
  readonly hooks?: readonly HttpHookContribution[];
  readonly fallbacks?: readonly HttpFallbackContribution[];
  readonly routes?: readonly HttpRouteDeclaration[];
}
