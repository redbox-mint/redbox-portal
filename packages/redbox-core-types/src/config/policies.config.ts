/**
 * Policies Config Interface
 * (sails.config.policies)
 * 
 * Policy mapping configuration for controller actions.
 */

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
    'DynamicAssetController': {
        '*': noCachePlusDefaultPolicies
    },
    'TranslationController': {
        '*': noCachePlusDefaultPolicies,
        'getNamespace': publicTranslationPolicies
    },
    '*': defaultPolicies
};
