import * as BrandingServiceModule from '../services/BrandingService';
import * as RolesServiceModule from '../services/RolesService';
import * as PathRulesServiceModule from '../services/PathRulesService';

declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const RolesService: RolesServiceModule.Services.Roles;
declare const PathRulesService: PathRulesServiceModule.Services.PathRules;

/**
 * CheckAuth Policy
 *
 * Checks if the current user has permission to access the requested path
 * based on their roles and the path rules defined for the brand.
 */
export function checkAuth(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    const companionAttachmentUploadAuthorized = (req as Sails.Req & { companionAttachmentUploadAuthorized?: boolean }).companionAttachmentUploadAuthorized;
    const requestPath = String(req.path ?? '').toLowerCase();
    const isCompanionAttachmentRoute = /^\/[^/]+\/[^/]+\/companion\/record\/[^/]+\/attach(?:\/[^/]+)?$/.test(requestPath);
    if (companionAttachmentUploadAuthorized === true && isCompanionAttachmentRoute) {
        return next();
    }
    if (companionAttachmentUploadAuthorized === true && !isCompanionAttachmentRoute) {
        sails.log.warn('Ignoring companionAttachmentUploadAuthorized bypass flag on non-companion attachment route.', { path: req.path });
    }

    const brand = BrandingService.getBrand(req.session.branding ?? '');
    if (!brand) {
        sails.log.verbose("In checkAuth, no branding found.");
        // invalid brand
        res.status(404).json({
            branding: sails.config.auth.defaultBrand,
            portal: sails.config.auth.defaultPortal
        });
        return;
    }

    let roles: unknown[];
    if (req.isAuthenticated()) {
        roles = (req.user?.roles ?? []) as unknown[];
    } else {
        // assign default role if needed...
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand));
    }

    // get the rules if any....
    const rules = PathRulesService.getRulesFromPath(req.path, brand);
    if (rules) {
        // populate variables if this user has a role that can read or write...
        const canRead = PathRulesService.canRead(rules, roles as unknown as Parameters<typeof PathRulesService.canRead>[1], brand.name);
        if (!canRead) {
            if (req.isAuthenticated()) {
                res.status(403).send();
                return;
            } else {
                const contentTypeHeader = req.headers["content-type"] == null ? "" : req.headers["content-type"];
                if (contentTypeHeader.indexOf("application/json") !== -1) {
                    res.status(403).json({ message: "Access Denied" });
                    return;
                } else {
                    (sails.getActions()['user/redirlogin'] as (r: Sails.Req, s: Sails.Res) => void)(req, res);
                    return;
                }
            }
        }
    } else {
        sails.log.verbose("No rules for path:" + req.path);
    }

    // no rules can proceed...
    return next();
}

export default checkAuth;
