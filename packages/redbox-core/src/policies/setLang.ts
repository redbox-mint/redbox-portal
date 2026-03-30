declare const TranslationService: {
    handle(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): Promise<void>;
};

/**
 * SetLang Policy
 *
 * Sets the language code, currently implemented as a session attribute.
 */
export async function setLang(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): Promise<void> {
    await TranslationService.handle(req, res, next);
}

export default setLang;
