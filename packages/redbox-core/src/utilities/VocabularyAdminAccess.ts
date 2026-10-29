import { RBValidationError } from '../model/RBValidationError';

/** Admin routes must use the path brand, never body/query/session fallbacks. */
export class VocabularyAdminAccessError extends RBValidationError {
  constructor(public readonly status: 403 | 404, message: string) {
    super({ message, displayErrors: [{ title: message, status: String(status) }] });
  }
}

export function vocabularyAdminBrand(req: Sails.Req): string {
  const name = req.params?.branding;
  const brand = typeof name === 'string' && name.trim() ? BrandingService.getBrand(name) : null;
  if (!brand?.id) {
    throw new VocabularyAdminAccessError(404, 'Vocabulary not found');
  }
  // Reuse the persisted AJAX administration permissions for both transports. This
  // also fails closed on installations with no dedicated REST vocabulary path rule.
  const rules = PathRulesService.getRulesFromPath(`/${name}/${req.params.portal}/admin/vocabulary`, brand);
  const roles = Array.isArray(req.user?.roles) ? req.user.roles as Parameters<typeof PathRulesService.canRead>[1] : [];
  const permitted = rules && req.isAuthenticated() && (req.method === 'GET'
    ? PathRulesService.canRead(rules, roles, brand.name)
    : PathRulesService.canWrite(rules, roles, brand.name));
  if (!permitted) {
    throw new VocabularyAdminAccessError(403, 'Access denied');
  }
  return String(brand.id);
}

/** Keep trusted internal service calls unscoped; enforce HTTP access before any side effects. */
export async function assertVocabularyAdminAccess(req: Sails.Req, id: string): Promise<void> {
  const branding = vocabularyAdminBrand(req);
  const vocabulary = await Vocabulary.findOne({ id, branding });
  if (!vocabulary) {
    throw new VocabularyAdminAccessError(404, 'Vocabulary not found');
  }
}
