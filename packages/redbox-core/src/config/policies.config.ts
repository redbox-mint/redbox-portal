/**
 * Policies Config Interface
 * (sails.config.policies)
 * 
 * Policy mapping configuration for controller actions.
 */

import { registerCoreApiRoutes, type ApiRouteDefinition } from '../api-routes';

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
    'checkAuth',
    'contentSecurityPolicy',
];

const noCachePlusDefaultPolicies: PolicyName[] = ['noCache', ...defaultPolicies];
const noCachePlusApiValidationPolicies: PolicyName[] = [
    ...noCachePlusDefaultPolicies,
    'validateApiContractRequest'
];
const doAttachmentPolicies: PolicyName[] = noCachePlusDefaultPolicies.flatMap((policy) => (
    policy === 'checkAuth' ? ['companionAttachmentUploadAuth', policy] : [policy]
));
const publicTranslationPolicies: PolicyName[] = [
    'noCache',
    'brandingAndPortal',
    'checkBrandingValid',
    'setLang',
    'prepWs'
];

const noCachePlusCspNoncePolicy: PolicyName[] = ['noCache', 'contentSecurityPolicy'];

export function buildContractApiPolicies(apiRoutes: readonly ApiRouteDefinition[] = registerCoreApiRoutes()): PoliciesConfig {
    return apiRoutes.reduce((acc, route) => {
        const controllerPolicies = acc[route.controller] as ControllerPolicies | undefined;
        acc[route.controller] = {
            '*': noCachePlusDefaultPolicies,
            ...(controllerPolicies ?? {}),
            [route.action]: noCachePlusApiValidationPolicies
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

export const policies: PoliciesConfig = {
    UserController: {
        '*': noCachePlusDefaultPolicies,
        'localLogin': noCachePlusCspNoncePolicy,
        'aafLogin': noCachePlusCspNoncePolicy,
        'openidConnectLogin': noCachePlusCspNoncePolicy,
        'beginOidc': noCachePlusCspNoncePolicy,
        'info': ['noCache', 'isAuthenticated', 'contentSecurityPolicy'],
    },
    RenderViewController: {
        'render': noCachePlusDefaultPolicies
    },
    RecordController: {
        '*': noCachePlusDefaultPolicies,
        // companionAttachmentUploadAuth runs before checkAuth; bypass is route-scoped
        // and ignored for non-companion attachment routes.
        'doAttachment': doAttachmentPolicies
    },
    'webservice/RecordController': {
        '*': noCachePlusDefaultPolicies
    },
    'webservice/BrandingController': {
        '*': noCachePlusDefaultPolicies
    },
    ...buildContractApiPolicies(),
    'DynamicAssetController': {
        '*': noCachePlusDefaultPolicies
    },
    'TranslationController': {
        '*': noCachePlusDefaultPolicies,
        'getNamespace': publicTranslationPolicies
    },
    '*': defaultPolicies
};
