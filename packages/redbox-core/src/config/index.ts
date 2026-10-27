export * from './branding.config';
export * from './brandingConfigurationDefaults.config';
export * from './raid.config';
export * from './report.config';
export * from './recordtype.config';
export * from './workflow.config';
export * from './dashboardview.config';
export * from './agendaQueue.config';
export * from './bootstrap.config';
export * from './policies.config';
// Pure domain defaults. Deployment configuration is resolved by configuration/portal.
export * from './appConfigSecrets.config';
export * from './api.config';
export * from './appmode.config';
export * from './record.config';
export * from './vocab.config';
export * from './static_assets.config';
export * from './i18n.config';
export * from './search.config';
export * from './namedQuery.config';
export * from './action.config';
export * from './dynamicasset.config';
export * from './peopleSearch.config';
export * from './reusableFormDefinitions.config';
export * from './log.config';
export * from './ng2.config';
export * from './datastores.config';
export * from './redboxSession.config';
export * from './queue.config';
export * from './storage.config';
export * from './orcid.config';
export * from './mint.config';
export * from './jsonld.config';
export * from './emailnotification.config';
export * from './figshareDev.config';
export * from './solr.config';
export * from './webpack.config';
export * from './csp.config';
export * from './dompurify.config';
export * from './companion.config';
export * from './auth.config';
export * from './custom.config';
export * from './dynamicconfig.config';
export * from './dashboardtype.config';
export * from './workspacetype.config';
export * from './lognamespace.config';
export * from './redboxToCkan.config';
export * from './custom_cache.config';
export * from './validators.config';
export * from './recordValidation.config';
export * from './recordSchema.config';
export * from './harvestRuns.config';
import { appConfigSecrets } from './appConfigSecrets.config';
import { api } from './api.config';
import { appmode } from './appmode.config';
import { record } from './record.config';
import { vocab } from './vocab.config';
import { static_assets } from './static_assets.config';
import { i18n } from './i18n.config';
import { search } from './search.config';
import { namedQuery } from './namedQuery.config';
import { action } from './action.config';
import { dynamicasset } from './dynamicasset.config';
import { peopleSearch } from './peopleSearch.config';
import { reusableFormDefinitions } from './reusableFormDefinitions.config';
import { log } from './log.config';
import { ng2 } from './ng2.config';
import { datastores } from './datastores.config';
import { redboxSession } from './redboxSession.config';
import { queue } from './queue.config';
import { storage } from './storage.config';
import { orcid } from './orcid.config';
import { mint } from './mint.config';
import { jsonld } from './jsonld.config';
import { emailnotification } from './emailnotification.config';
import { figshareDev } from './figshareDev.config';
import { solr } from './solr.config';
import { webpack } from './webpack.config';
import { csp } from './csp.config';
import { dompurify } from './dompurify.config';
import { companion } from './companion.config';
import { auth } from './auth.config';
import { custom } from './custom.config';
import { dynamicconfig } from './dynamicconfig.config';
import { dashboardtype } from './dashboardtype.config';
import { workspacetype } from './workspacetype.config';
import { lognamespace } from './lognamespace.config';
import { redboxToCkan } from './redboxToCkan.config';
import { custom_cache } from './custom_cache.config';
import { validators } from './validators.config';
import { recordValidation } from './recordValidation.config';
import { recordSchema } from './recordSchema.config';
import { harvestRuns } from './harvestRuns.config';
export const Config = {
  appConfigSecrets,
  api,
  appmode,
  record,
  vocab,
  static_assets,
  i18n,
  search,
  namedQuery,
  action,
  dynamicasset,
  peopleSearch,
  reusableFormDefinitions,
  log,
  ng2,
  datastores,
  redboxSession,
  queue,
  storage,
  orcid,
  mint,
  jsonld,
  emailnotification,
  figshareDev,
  solr,
  webpack,
  csp,
  dompurify,
  companion,
  auth,
  custom,
  dynamicconfig,
  dashboardtype,
  workspacetype,
  lognamespace,
  redboxToCkan,
  custom_cache,
  validators,
  recordValidation,
  recordSchema,
  harvestRuns,
} as const;
export type ConfigType = typeof Config;
export type AuthConfig = import('./brandingConfigurationDefaults.config').AuthBootstrapConfig &
  import('./brandingConfigurationDefaults.config').BrandAuthConfig;
export type BrandingAwareFunction = (
  brandName?: string
) => import('./brandingConfigurationDefaults.config').BrandingConfigurationDefaultsConfig;
