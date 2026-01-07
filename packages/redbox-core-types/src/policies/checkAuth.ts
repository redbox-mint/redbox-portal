import { Request, Response, NextFunction } from 'express';

declare const sails: any;
declare const BrandingService: any;
declare const RolesService: any;
declare const PathRulesService: any;

/**
 * CheckAuth Policy
 *
 * Checks if the current user has permission to access the requested path
 * based on their roles and the path rules defined for the brand.
 */
export function checkAuth(req: Request, res: Response, next: NextFunction): any {
    const brand = BrandingService.getBrand((req as any).session.branding);
    if (!brand) {
        sails.log.verbose("In checkAuth, no branding found.");
        // invalid brand
        return res.status(404).json({
            branding: sails.config.auth.defaultBrand,
            portal: sails.config.auth.defaultPortal
        });
    }

    let roles: string[];
    if ((req as any).isAuthenticated()) {
        roles = (req as any).user.roles;
    } else {
        // assign default role if needed...
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand));
    }

    // get the rules if any....
    const rules = PathRulesService.getRulesFromPath(req.path, brand);
    if (rules) {
        // populate variables if this user has a role that can read or write...
        const canRead = PathRulesService.canRead(rules, roles, brand.name);
        if (!canRead) {
            if ((req as any).isAuthenticated()) {
                return res.status(403).send();
            } else {
                const contentTypeHeader = req.headers["content-type"] == null ? "" : req.headers["content-type"];
                if (contentTypeHeader.indexOf("application/json") !== -1) {
                    return res.status(403).json({ message: "Access Denied" });
                } else {
                    return sails.getActions()['user/redirlogin'](req, res);
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
