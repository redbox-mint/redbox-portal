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
function isApiRequest(req: Sails.Req): boolean {
    return /\/[^\/]+\/[^\/]+\/api\//.test(req.path);
}

export function checkAuth(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    const companionAttachmentUploadAuthorized = (req as Sails.Req & { companionAttachmentUploadAuthorized?: boolean }).companionAttachmentUploadAuthorized;
    if (companionAttachmentUploadAuthorized === true) {
        return next();
    }

    const brand = BrandingService.getBrand(req.session.branding ?? '');
    if (!brand) {
        sails.log.verbose("In checkAuth, no branding found.");
        res.status(404).json({
            branding: sails.config.auth.defaultBrand,
            portal: sails.config.auth.defaultPortal
        });
        return;
    }

    const isAuthenticated = req.isAuthenticated() || (req as Sails.Req & { redboxApiAuthenticated?: boolean }).redboxApiAuthenticated === true;
    const isApi = isApiRequest(req);

    let roles: unknown[];
    if (isAuthenticated) {
        roles = (req.user?.roles ?? []) as unknown[];
    } else {
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand));
    }

    const rules = PathRulesService.getRulesFromPath(req.path, brand);
    if (rules) {
        const canRead = PathRulesService.canRead(rules, roles as unknown as Parameters<typeof PathRulesService.canRead>[1], brand.name);
        if (!canRead) {
            if (isAuthenticated) {
                if (isApi) {
                    res.status(403).json({ message: 'Access Denied', details: '' });
                    return;
                }
                res.status(403).send();
                return;
            } else {
                if (isApi) {
                    res.status(401).json({ message: 'Unauthorized', details: '' });
                    return;
                }
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

    return next();
}

export default checkAuth;
