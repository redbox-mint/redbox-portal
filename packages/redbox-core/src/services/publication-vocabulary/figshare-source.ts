import { resolveFigshareVocabularyConfig } from '../figshare-v2/config';
import { makeFixtureClient, makeLiveClient } from '../figshare-v2/http';
import { assertSnapshotWithinLimits, filterByTaxonomy, normalizeFigshareCategories } from '../figshare-v2/categories';
import { PublicationVocabularyError, targetIdentity } from './contracts';
import type { PublicationSourceImport } from './contracts';

/** Catalogue scope and configured credentials are resolved server-side. Import never mutates Figshare. */
export async function figshareVocabularyCatalogue(
  brandId: string,
  scope: 'public' | 'account',
  taxonomyId: string
): Promise<Omit<PublicationSourceImport, 'importId'>> {
  if (!['public', 'account'].includes(scope) || !taxonomyId.trim())
    throw new PublicationVocabularyError('Figshare scope and taxonomy are required');
  const brandName = BrandingService.getBrandById(brandId)?.name;
  const config = brandName ? resolveFigshareVocabularyConfig(brandName) : null;
  if (!config) throw new PublicationVocabularyError('Figshare is not configured for this brand', 409);
  if (scope === 'account' && !config.connection.token?.trim() && config.runtime.mode !== 'fixture')
    throw new PublicationVocabularyError('Account catalogue requires configured credentials', 409);
  const client =
    config.runtime.mode === 'fixture'
      ? makeFixtureClient(config)
      : makeLiveClient(config, {
          recordOid: '',
          brandId,
          brandName: brandName!,
          correlationId: 'publication-vocabulary-import',
          triggerSource: 'publication-vocabulary-admin',
        });
  const raw = scope === 'account' ? await client.listAccountCategories() : await client.listPublicCategories();
  const normalized = normalizeFigshareCategories(raw);
  const rows = filterByTaxonomy(normalized, taxonomyId).rows;
  if (!rows.length) throw new PublicationVocabularyError('Figshare returned no categories for this taxonomy', 422);
  assertSnapshotWithinLimits(rows);
  const namespace = `figshare:${brandId}:${scope}:${taxonomyId}`;
  const ids = new Map(rows.map(row => [row.sourceId, targetIdentity(namespace, String(row.categoryId))]));
  return {
    provider: 'figshare',
    scope,
    catalogueId: taxonomyId,
    namespace,
    displayName: `Figshare ${scope} ${taxonomyId}`,
    terms: rows.map(row => ({
      id: targetIdentity(namespace, String(row.categoryId)),
      namespace,
      value: String(row.categoryId),
      sourceId: row.sourceId,
      label: row.title,
      selectable: row.selectable,
      evidence: { contentHash: row.contentHash, path: row.path, hasChildren: row.hasChildren },
      ...(row.parentSourceId && ids.has(row.parentSourceId) ? { parentId: ids.get(row.parentSourceId) } : {}),
    })),
  };
}
