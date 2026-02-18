/**
 * Sails Policies
 *
 * This module exports all policies for use in Sails applications.
 * These policies are middleware functions that run before controller actions.
 */

export { brandingAndPortal } from './brandingAndPortal';
export { checkAuth } from './checkAuth';
export { checkBrandingValid } from './checkBrandingValid';
export { companionAttachmentUploadAuth } from './companionAttachmentUploadAuth';
export { contentSecurityPolicy } from './contentSecurityPolicy';
export { disallowedHeadRequestHandler } from './disallowedHeadRequestHandler';
export { i18nLanguages } from './i18nLanguages';
export { isAuthenticated } from './isAuthenticated';
export { isWebServiceAuthenticated } from './isWebServiceAuthenticated';
export { menuResolver } from './menuResolver';
export { noCache } from './noCache';
export { prepWs } from './prepWs';
export { sessionAuth } from './sessionAuth';
export { setLang } from './setLang';

// Re-export as a namespace for convenient access
import { brandingAndPortal } from './brandingAndPortal';
import { checkAuth } from './checkAuth';
import { checkBrandingValid } from './checkBrandingValid';
import { companionAttachmentUploadAuth } from './companionAttachmentUploadAuth';
import { contentSecurityPolicy } from './contentSecurityPolicy';
import { disallowedHeadRequestHandler } from './disallowedHeadRequestHandler';
import { i18nLanguages } from './i18nLanguages';
import { isAuthenticated } from './isAuthenticated';
import { isWebServiceAuthenticated } from './isWebServiceAuthenticated';
import { menuResolver } from './menuResolver';
import { noCache } from './noCache';
import { prepWs } from './prepWs';
import { sessionAuth } from './sessionAuth';
import { setLang } from './setLang';

export const Policies = {
    brandingAndPortal,
    checkAuth,
    checkBrandingValid,
    companionAttachmentUploadAuth,
    contentSecurityPolicy,
    disallowedHeadRequestHandler,
    i18nLanguages,
    isAuthenticated,
    isWebServiceAuthenticated,
    menuResolver,
    noCache,
    prepWs,
    sessionAuth,
    setLang,
};

export default Policies;
