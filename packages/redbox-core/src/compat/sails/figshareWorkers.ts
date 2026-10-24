import { createFigshareRuntime } from '../../integrations/figshare/runtime';
import { createFigshareManagedAssets } from '../../integrations/figshare/managed-assets';
import { createFigshareWorker } from '../../integrations/figshare/worker';
import { createFigshareAdministration } from '../../integrations/figshare/admin';
import { createFigshareAudit } from '../../integrations/figshare/audit';
import type { FigshareWorkerInput } from '../../integrations/figshare/worker-input';
import { getFigshareSyncRepository } from '../../persistence/runtime';
import * as metadata from '../../services/figshare-v2/metadata';
import * as http from '../../services/figshare-v2/http';
import * as assets from '../../services/figshare-v2/assets';
import * as config from '../../services/figshare-v2/config';
import * as context from '../../services/figshare-v2/context';
import * as embargo from '../../services/figshare-v2/embargo';
import * as managed from '../../services/figshare-v2/managed-assets';
import * as audit from '../../services/figshare-v2/audit';
import * as source from '../../services/figshare-v2/source-intent';
import { figshareWork } from '../../services/figshare-v2/worker-lifecycle';

export const comparisonFigshareRuntime = () =>
  createFigshareRuntime({
    metadata,
    brandName: (...args) => config.getBrandName(...args),
    clientLayer: (...args) => http.makeClientLayer(...args),
  });
export const comparisonFigshareManagedAssets = () => createFigshareManagedAssets(assets);
export const comparisonFigshareAudit = () =>
  createFigshareAudit(typeof IntegrationAuditService === 'undefined' ? undefined : IntegrationAuditService);
function input(): FigshareWorkerInput {
  return {
    records: {
      getMeta: (...args) => RecordsService.getMeta(...args),
      getFigshareIntentStorage: (...args) => RecordsService.getFigshareIntentStorage(...args),
      hasEditAccess: (...args) => RecordsService.hasEditAccess(...args),
      setRecordFields: (...args) => RecordsService.setRecordFields(...args),
      updateMetaInternal: (...args) => RecordsService.updateMetaInternal(...args),
    },
    brandById: id => BrandingService.getBrandById(id),
    user: name => UsersService.getUserWithUsername(name).toPromise(),
    recordType: (brand, name) => RecordTypesService.get(brand, name).toPromise(),
    workflowStep: (type, name) => WorkflowStepsService.get(type, name).toPromise(),
    queue: { now: (...args) => AgendaQueueService.now(...args) },
    configuration: (...args) => config.resolveFigsharePublishingConfig(...args),
    context: (...args) => context.createRunContext(...args),
    assets: managed,
    embargo: (...args) => embargo.syncEmbargoPhase(...args),
    eligible: (...args) => source.currentExecutionEligible(...args),
    audit,
    get log() {
      return sails.log;
    },
    store: () => getFigshareSyncRepository(),
    work: operation => figshareWork(sails, operation),
  };
}
export const comparisonFigshareWorker = () => createFigshareWorker(input());
export const comparisonFigshareAdmin = () =>
  createFigshareAdministration({ ...input(), administrator: roles => RolesService.getAdminFromRoles(roles) });
