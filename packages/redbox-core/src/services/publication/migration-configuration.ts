import { cloneDeep, get, mergeWith } from 'lodash';
import { FigsharePublishing } from '../../configmodels/FigsharePublishing';
import { OniPublishing } from '../../configmodels/OniPublishing';
import { PublicationPublishing, type PublicationPublishingConfigData } from '../../configmodels/PublicationPublishing';
import type { PublicationObject } from './contracts';
import { isPublicationObject } from './builtins';
import { publicationDigest } from './canonical';
import type { PublicationProviderRegistry } from './registry';

export interface PublicationMigrationReview {
  id: string;
  category: string;
  reference: string;
}
export interface PublicationMigrationTranslation {
  recordType: string;
  hook: string;
  event: string;
  destinationId: string;
  policyId: string;
  mode: 'auto-sync';
}
export function migrationJson(value: unknown): PublicationObject {
  const result: unknown = JSON.parse(JSON.stringify(value));
  if (!isPublicationObject(result)) throw new Error('Migration evidence must be a JSON object');
  return result;
}
export function migrationDestinationId(brandId: string, provider: string, site = ''): string {
  return `${provider}-${publicationDigest({ brandId, provider, site }).slice(0, 24)}`;
}
/** Drop registered credentials before hashing/reporting configuration. Secret rotation does not change the inventory. */
export function migrationConfigurationFingerprint(
  config: PublicationPublishingConfigData,
  registry: PublicationProviderRegistry
): string {
  const copy = cloneDeep(config);
  for (const destination of Object.values(copy.destinations)) {
    for (const path of registry.get(destination.provider)?.secretPaths ?? []) {
      const remove = (node: unknown, parts: string[]): void => {
        if (!node || typeof node !== 'object') return;
        const [part, ...rest] = parts;
        if (part === '*') {
          for (const key of Object.keys(node)) remove(node, [key, ...rest]);
        } else if (rest.length) remove(Reflect.get(node, part), rest);
        else Reflect.deleteProperty(node, part);
      };
      remove(destination, path.split('.'));
    }
  }
  return publicationDigest(migrationJson(copy));
}

/** Known save hooks become explicit policies. Arbitrary conditions are retained verbatim and require review. */
export function convertPublicationConfiguration(
  brandId: string,
  legacy: PublicationObject,
  recordTypes: PublicationObject[],
  parameters: PublicationObject
): {
  config: PublicationPublishingConfigData;
  assignments: Record<string, string>;
  reviews: PublicationMigrationReview[];
  translations: PublicationMigrationTranslation[];
} {
  const config = new PublicationPublishing();
  const assignments: Record<string, string> = {};
  const reviews: PublicationMigrationReview[] = [];
  const translations: PublicationMigrationTranslation[] = [];
  const review = (category: string, reference: string) => {
    const id = `review-${publicationDigest({ category, reference }).slice(0, 24)}`;
    if (!reviews.some(item => item.id === id)) reviews.push({ id, category, reference });
  };
  const merge = <T extends object>(defaults: T, value: unknown): T =>
    mergeWith(defaults, value, (_target, source) => (Array.isArray(source) ? source : undefined));
  if (isPublicationObject(legacy.figsharePublishing)) {
    const figshare = merge(new FigsharePublishing(), legacy.figsharePublishing);
    const id = migrationDestinationId(brandId, 'figshare');
    assignments.figshare = id;
    config.processing = { ...config.processing, ...figshare.processing, enabled: false };
    const connection = migrationJson(figshare.connection);
    if (typeof parameters.figshareAccountId === 'string') connection.accountId = parameters.figshareAccountId;
    config.destinations[id] = {
      provider: 'figshare',
      displayName: 'Figshare',
      enabled: false,
      archived: false,
      connection,
      mapping: migrationJson({
        metadata: figshare.metadata,
        authors: figshare.authors,
        categories: figshare.categories,
      }),
      attachments: migrationJson({ selection: figshare.selection, assets: figshare.assets }),
      providerOptions: migrationJson({
        article: figshare.article,
        impersonation: figshare.impersonation,
        embargo: figshare.embargo,
        record: figshare.record,
        writeBack: figshare.writeBack,
      }),
      writeBack: {
        articleId: figshare.writeBack.articleId,
        articleUrls: figshare.writeBack.articleUrls,
        status: figshare.record.statusPath,
        error: figshare.record.errorPath,
        syncState: figshare.record.syncStatePath,
        ...(figshare.record.allFilesUploadedPath ? { allFilesUploaded: figshare.record.allFilesUploadedPath } : {}),
      },
    };
    if (figshare.workflow.transitionJob.enabled) review('workflow-translation', 'figshare.workflow.transitionJob');
  }
  if (isPublicationObject(legacy.oniPublishing)) {
    const oni = merge(new OniPublishing(), legacy.oniPublishing);
    if (isPublicationObject(legacy.oniPublishing.sites))
      oni.sites = Object.fromEntries(Object.keys(legacy.oniPublishing.sites).map(site => [site, oni.sites[site]]));
    for (const [site, connection] of Object.entries(oni.sites).sort(([a], [b]) => a.localeCompare(b))) {
      const id = migrationDestinationId(brandId, 'oni', site);
      assignments[`oni:${site}`] = id;
      config.destinations[id] = {
        provider: 'oni',
        displayName: connection.label || `Oni ${site}`,
        enabled: false,
        archived: false,
        connection: migrationJson(connection),
        mapping: migrationJson(oni.mapping),
        attachments: migrationJson(oni.selection),
        providerOptions: migrationJson({
          rootCollection: oni.rootCollection,
          metadata: oni.metadata,
          writeBack: oni.writeBack,
        }),
        writeBack: {
          citationUrlPath: oni.writeBack.citationUrlPath,
          citationDoiPath: oni.writeBack.citationDoiPath,
          publicationErrorPath: oni.writeBack.publicationErrorPath,
        },
      };
    }
  }
  config.processing.serviceUsername =
    typeof parameters.serviceUsername === 'string' ? parameters.serviceUsername : config.processing.serviceUsername;
  config.processing.serviceUserType = 'local';
  if (typeof parameters.stagingDisk === 'string') config.processing.stagingDisk = parameters.stagingDisk;
  const sync = new Set([
    'validateFigshareRecord',
    'wakeFigshareRecord',
    'createUpdateFigshareArticle',
    'uploadFilesToFigshareArticle',
  ]);
  for (const type of recordTypes) {
    const hooks = type.hooks;
    if (!isPublicationObject(hooks) || typeof type.name !== 'string') continue;
    for (const [event, phases] of Object.entries(hooks)) {
      if (!isPublicationObject(phases)) continue;
      for (const [phase, entries] of Object.entries(phases)) {
        if (!Array.isArray(entries)) continue;
        for (const [index, hook] of entries.entries()) {
          if (!isPublicationObject(hook) || typeof hook.function !== 'string') continue;
          const method = hook.function.split('.').pop() ?? '';
          const provider = sync.has(method) ? 'figshare' : method === 'exportDataset' ? 'oni' : undefined;
          if (!provider) {
            if (/Figshare|Oni|publish/i.test(hook.function))
              review('custom-hook', `${type.name}.${event}.${phase}.${index}`);
            continue;
          }
          const options = isPublicationObject(hook.options) ? hook.options : {};
          const site =
            typeof options.site === 'string'
              ? options.site
              : String(get(legacy, 'oniPublishing.defaultSite', 'public'));
          const destinationId = assignments[provider === 'oni' ? `oni:${site}` : provider];
          const reference = `${type.name}.${event}.${phase}.${index}`;
          if (!destinationId) {
            review('ambiguous-destination', reference);
            continue;
          }
          const grant = typeof options.triggerCondition === 'string' ? options.triggerCondition : '';
          const continuation = typeof options.executionCondition === 'string' ? options.executionCondition : grant;
          // Only the exact trivial conditions can be translated without reviewing arbitrary code.
          if ([grant, continuation].some(value => value && value !== '<%= true %>'))
            review('continuation-expression', reference);
          if (provider === 'oni') review('synchronous-oni-callers', reference);
          const policyId = `legacy-${publicationDigest({ type: type.name, event, destinationId, grant, continuation }).slice(0, 24)}`;
          if (!config.sourcePolicies.some(policy => policy.id === policyId))
            config.sourcePolicies.push({
              id: policyId,
              version: 1,
              mode: 'auto-sync',
              recordType: type.name,
              event,
              destinations: [destinationId],
              grantCondition: grant,
              continuationCondition: continuation,
            });
          translations.push({
            recordType: type.name,
            event,
            hook: reference,
            destinationId,
            policyId,
            mode: 'auto-sync',
          });
        }
      }
    }
  }
  // Existing crosswalk bindings stay in the provider sections; no vocabulary collection or route changes.
  if (
    isPublicationObject(legacy.publicationPublishing) &&
    isPublicationObject(legacy.publicationPublishing.destinations) &&
    Object.keys(legacy.publicationPublishing.destinations).length
  )
    review('existing-unified-configuration', 'publicationPublishing');
  return { config, assignments, reviews: reviews.sort((a, b) => a.id.localeCompare(b.id)), translations };
}
