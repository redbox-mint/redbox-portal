import { Request, Response, NextFunction } from 'express';

/**
 * PrepWs Policy
 *
 * Prepares WebSocket requests by setting up isAuthenticated method
 * and synchronizing user between request and session.
 */
export function prepWs(req: Request, res: Response, next: NextFunction): void {
    if ((req as any).isSocket) {
        (req as any).isAuthenticated = function (): boolean {
            return (req as any).session.user ? true : false;
        };
        (req as any).user = (req as any).session.user;
    } else {
        (req as any).session.user = (req as any).user;
    }
    next();
}

export default prepWs;
