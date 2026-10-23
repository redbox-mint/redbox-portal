/** Offline API coverage. This manifest never dispatches requests or constructs providers. */
import { recordTypeApiRoutes } from '../../api-routes/groups/recordtypes';
import { metadataReadRoutes } from './metadata';
import { configurationReadRoutes } from './configuration';
import { configurationWriteRoutes } from './configurationWrites';
import { formDeliveryRoutes } from './formDelivery';
import { queryReadRoutes } from './queryReads';
import { queryWriteRoutes } from './queryWrites';
import { recordReadRoutes } from './recordReads';
import { recordMutationRoutes } from './recordMutations';
import { harvestMutationRoutes } from './harvestMutations';
import { identityAdministrationRoutes } from './identityAdministration';
import { identityLinkRoutes } from './identityLinks';
import { vocabularyIntegrationRoutes } from './vocabularyIntegrations';
import { vocabularyAdministrationRoutes } from './vocabularyAdministration';
import { siemWriteRoutes } from './siemWrites';
import { adminOperationRoutes } from './adminOperations';
import { brandingOperationRoutes } from './brandingOperations';
import { brandingUploadRoutes } from './brandingUploads';
import { figshareAdministrationRoutes } from './figshareAdministration';
import { integrationOperationRoutes } from './integrationOperations';
import { datastreamReadRoutes } from './datastreamReads';
import { datastreamWriteRoutes } from './datastreamWrites';

export const apiHttpDeclarations = [
  ...recordTypeApiRoutes,
  ...metadataReadRoutes,
  ...configurationReadRoutes,
  ...configurationWriteRoutes,
  ...formDeliveryRoutes,
  ...queryReadRoutes,
  ...queryWriteRoutes,
  ...recordReadRoutes,
  ...recordMutationRoutes,
  ...harvestMutationRoutes,
  ...identityAdministrationRoutes,
  ...identityLinkRoutes,
  ...vocabularyIntegrationRoutes,
  ...vocabularyAdministrationRoutes,
  ...siemWriteRoutes,
  ...adminOperationRoutes,
  ...brandingOperationRoutes,
  ...brandingUploadRoutes,
  ...figshareAdministrationRoutes,
  ...integrationOperationRoutes,
  ...datastreamReadRoutes,
  ...datastreamWriteRoutes,
].filter(route => route.path.includes('/api/'));
