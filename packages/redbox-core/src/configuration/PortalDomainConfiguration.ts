import type { StaticAssetsConfig } from '../config/static_assets.config';
import type { CompanionConfig } from '../config/companionDefaults';
import type { CustomCacheConfig } from '../config/custom_cache.config';
import type { RecordTypeConfig } from '../config/recordtype.config';
import type { WorkflowConfig } from '../config/workflow.config';
import type { DashboardTypeConfig } from '../config/dashboardtype.config';
import type { DashboardViewConfig } from '../config/dashboardview.config';
import type { WorkspaceTypeConfig } from '../config/workspacetype.config';
import type { I18nConfig } from '../config/i18n.config';
import type { VocabConfig } from '../config/vocab.config';
import type { SolrSearchConfig } from '../config/solr.config';
import type { SearchConfig } from '../config/search.config';
import type { NamedQueryConfig } from '../config/namedQuery.config';
import type { ActionConfig } from '../config/action.config';
import type { EmailNotificationConfig } from '../config/emailnotification.config';
import type { BrandingConfigurationDefaultsConfig } from '../config/brandingConfigurationDefaults.config';
import type { ContentSecurityPolicyConfig } from '../config/csp.config';
import type { BrandingConfig } from '../config/branding.config';
import type { ReusableFormDefinitions } from '@researchdatabox/sails-ng-common';

/** Data consumed by concrete domains. The build emits the matching runtime JSON Schema. */
export interface PortalDomainConfiguration {
  static_assets: StaticAssetsConfig;
  companion: CompanionConfig;
  custom_cache: CustomCacheConfig;
  recordtype: RecordTypeConfig;
  workflow: WorkflowConfig;
  dashboardtype: DashboardTypeConfig;
  dashboardview: DashboardViewConfig;
  workspacetype: WorkspaceTypeConfig;
  i18n: I18nConfig;
  vocab: VocabConfig;
  solr: SolrSearchConfig;
  search: SearchConfig;
  namedQuery: NamedQueryConfig;
  action: ActionConfig;
  emailnotification: EmailNotificationConfig;
  brandingConfigurationDefaults: BrandingConfigurationDefaultsConfig;
  csp: ContentSecurityPolicyConfig;
  branding: BrandingConfig;
  reusableFormDefinitions: ReusableFormDefinitions;
}
