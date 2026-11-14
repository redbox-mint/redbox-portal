import type { ExtensionResolutionV2Options } from '../../extensions/v2';
import type { ControllerHostOptions } from '../../http/fastify/composition';
import type { NativePolicyInput } from '../../http/fastify/policies';
import type { NativeCsrfInput } from '../../http/fastify/csrf';
import type { NativeAuthenticationRoutesInput } from '../../http/fastify/authentication';
import type { NativeParserOptions } from '../../http/fastify/parsers';
import type { SafeHttpObservers } from '../../http/fastify/responses';
import type { apiRouteRegistrations } from '../../http/fastify/routes';
import type { loadInstalledExtensionProvidersV2 } from '../../extensions/v2';
import type { CoreNamespaceConfiguration } from '../../http/fastify/registry';

/** Production must select every option, including an explicit undefined for a
 * deliberately disabled callback. Prototype defaults remain available to fixtures.
 * Mapping over Required<T> retains T[K]'s undefined without making the key optional.
 */
type ExplicitSelection<T> = { readonly [K in keyof Required<T>]: T[K] };
export type ProductionExtensionLoadingOptions = ExplicitSelection<
  NonNullable<Parameters<typeof loadInstalledExtensionProvidersV2>[1]>
>;
export type ProductionRoutingOptions = Required<ExtensionResolutionV2Options['routing']>;
export type ProductionNamespaceConfiguration = Required<CoreNamespaceConfiguration>;
export type ProductionApiRouteOptions = Required<NonNullable<Parameters<typeof apiRouteRegistrations>[0]>>;
export type ProductionExtensionResolutionOptions = Required<ExtensionResolutionV2Options> & {
  readonly routing: ProductionRoutingOptions;
  readonly namespaceConfiguration: ProductionNamespaceConfiguration;
};
export type ProductionControllerHostOptions = Required<
  Omit<
    ControllerHostOptions,
    'security' | 'routing' | 'rawUploadInput' | 'brandingUploadInput' | 'pageNotFound' | 'staticAsset'
  >
> & {
  readonly rawUploadInput: ControllerHostOptions['rawUploadInput'];
  readonly brandingUploadInput: ControllerHostOptions['brandingUploadInput'];
  readonly pageNotFound: ControllerHostOptions['pageNotFound'];
  readonly staticAsset: ControllerHostOptions['staticAsset'];
  readonly routing: ProductionRoutingOptions;
  readonly namespaceConfiguration: ProductionNamespaceConfiguration;
  readonly security: ExplicitSelection<NonNullable<ControllerHostOptions['security']>> & {
    readonly observers: ExplicitSelection<SafeHttpObservers>;
    readonly parsers: Required<NativeParserOptions>;
  };
};
export type ProductionPolicyInput = Required<NativePolicyInput>;
export type ProductionCsrfInput = Required<NativeCsrfInput>;
export type ProductionAuthenticationRoutesInput = ExplicitSelection<NativeAuthenticationRoutesInput>;
