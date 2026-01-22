import { Request, Response, NextFunction } from 'express';

declare const TranslationService: any;

/**
 * SetLang Policy
 *
 * Sets the language code, currently implemented as a session attribute.
 */
export async function setLang(req: Request, res: Response, next: NextFunction): Promise<void> {
    await TranslationService.handle(req, res, next);
}

export default setLang;
