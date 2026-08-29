/**
 * Policies Config Interface
 * (sails.config.policies)
 *
 * Policy mapping configuration for controller actions.
 */

import { AUTHORIZATION_API_BASE_PATH, registerCoreApiRoutes, type ApiRouteDefinition } from '../api-routes';

export type PolicyName = string;
export type PolicyChain = PolicyName | PolicyName[] | boolean;

export interface ControllerPolicies {
  '*'?: PolicyChain;
  [actionName: string]: PolicyChain | undefined;
}

export interface PoliciesConfig {
  '*'?: PolicyChain;
  [controllerName: string]: ControllerPolicies | PolicyChain | undefined;
}

// Default policy chains
const defaultPolicies: PolicyName[] = [
  'brandingAndPortal',
  'checkBrandingValid',
  'setLang',
  'prepWs',
  'i18nLanguages',
  'menuResolver',
  'isWebServiceAuthenticated',
  'resolveAuthorizationContext',
  'authorizeRequest',
  'contentSecurityPolicy',
];

const apiValidationPolicies: PolicyName[] = [...defaultPolicies, 'validateApiContractRequest'];
const recordSchemaApiValidationPolicies: PolicyName[] = [...apiValidationPolicies];
const noCachePlusDefaultPolicies: PolicyName[] = ['noCache', ...defaultPolicies];
const noCachePlusApiValidationPolicies: PolicyName[] = ['noCache', ...apiValidationPolicies];
const doAttachmentPolicies: PolicyName[] = noCachePlusDefaultPolicies.flatMap(policy =>
  policy === 'resolveAuthorizationContext' ? ['companionAttachmentUploadAuth', policy] : [policy]
);
const publicTranslationPolicies: PolicyName[] = [
  'noCache',
  'brandingAndPortal',
  'checkBrandingValid',
  'setLang',
  'prepWs',
  'isWebServiceAuthenticated',
];

const noCachePlusCspNoncePolicy: PolicyName[] = ['noCache', 'isWebServiceAuthenticated', 'contentSecurityPolicy'];
const authenticatedInfoPolicies: PolicyName[] = noCachePlusDefaultPolicies.flatMap(policy =>
  policy === 'contentSecurityPolicy' ? ['isAuthenticated', policy] : [policy]
);

export function buildContractApiPolicies(
  apiRoutes: readonly ApiRouteDefinition[] = registerCoreApiRoutes()
): PoliciesConfig {
  return apiRoutes.reduce((acc, route) => {
    const controllerPolicies = acc[route.controller] as ControllerPolicies | undefined;
    acc[route.controller] = {
      '*': noCachePlusDefaultPolicies,
      ...(controllerPolicies ?? {}),
      [route.action]:
        route.authorization.kind === 'scope' &&
        route.path.startsWith(AUTHORIZATION_API_BASE_PATH) &&
        ['post', 'put', 'patch', 'delete'].includes(route.method)
          ? noCachePlusApiValidationPolicies.flatMap(policy =>
              policy === 'validateApiContractRequest' ? ['protectSessionMutation', policy] : [policy]
            )
          : noCachePlusApiValidationPolicies,
    };
    return acc;
  }, {} as PoliciesConfig);
}

export function mergeContractApiPolicies(
  targetPolicies: PoliciesConfig,
  apiRoutes: readonly ApiRouteDefinition[]
): PoliciesConfig {
  const routePolicies = buildContractApiPolicies(apiRoutes);
  Object.entries(routePolicies).forEach(([controllerName, controllerPolicy]) => {
    if (controllerName === '*' || typeof controllerPolicy !== 'object' || Array.isArray(controllerPolicy)) {
      targetPolicies[controllerName] = controllerPolicy;
      return;
    }

    const existingPolicy = targetPolicies[controllerName];
    targetPolicies[controllerName] = {
      ...(typeof existingPolicy === 'object' && !Array.isArray(existingPolicy) ? existingPolicy : {}),
      ...controllerPolicy,
    };
  });
  return targetPolicies;
}

const contractApiPolicies = buildContractApiPolicies();
const recordSchemaControllerPolicies = contractApiPolicies['webservice/RecordSchemaController'] as ControllerPolicies;

export const policies: PoliciesConfig = {
  UserController: {
    '*': noCachePlusDefaultPolicies,
    localLogin: noCachePlusCspNoncePolicy,
    aafLogin: noCachePlusCspNoncePolicy,
    openidConnectLogin: noCachePlusCspNoncePolicy,
    beginOidc: noCachePlusCspNoncePolicy,
    info: authenticatedInfoPolicies,
  },
  RenderViewController: {
    render: noCachePlusDefaultPolicies,
  },
  RecordController: {
    '*': noCachePlusDefaultPolicies,
    // companionAttachmentUploadAuth runs before checkAuth; bypass is route-scoped
    // and ignored for non-companion attachment routes.
    doAttachment: doAttachmentPolicies,
  },
  'webservice/RecordController': {
    '*': noCachePlusDefaultPolicies,
  },
  'webservice/BrandingController': {
    '*': noCachePlusDefaultPolicies,
  },
  ...contractApiPolicies,
  'webservice/RecordSchemaController': {
    ...recordSchemaControllerPolicies,
    create: recordSchemaApiValidationPolicies,
    update: recordSchemaApiValidationPolicies,
    immutable: recordSchemaApiValidationPolicies,
  },
  DynamicAssetController: {
    '*': noCachePlusDefaultPolicies,
  },
  TranslationController: {
    '*': noCachePlusDefaultPolicies,
    getNamespace: publicTranslationPolicies,
  },
  '*': defaultPolicies,
};
