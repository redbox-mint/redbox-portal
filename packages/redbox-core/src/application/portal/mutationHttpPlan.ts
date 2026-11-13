import { combineBrowserInput } from './pageHttpPlan';
import * as browserControllers from '../../http/controllers/BrowserControllers';
import type { BrowserPageBinding } from '../../http/controllers/BrowserControllers';
import type { PortalApplicationContext } from './application';
import { bindControllerFactory, defineController } from '../../http/controllers';
import * as c from '../../http/controllers/MutationControllers';
import { portalReadHttpInputs, combineHttpInputs } from './readHttpPlan';
import { portalReferenceHttpInputs } from './referenceHttpPlan';
import { portalHttpPlan } from './httpPlan';
import type { ConfiguredAction } from '../../http/actions/configuredActions';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  DatastreamController,
  type DatastreamControllerInput,
} from '../../http/controllers/webservice/DatastreamController';

/** Offline selections borrow initialized production owners at request time. */
export function portalMutationHttpInputs(
  portal: PortalApplicationContext,
  actions: Readonly<Record<string, ConfiguredAction>>
) {
  const { data, config, log } = portal,
    ref = data.reference;
  const audit = (actor: { id: string; username: string }, action: string, context: { brandId: string }) =>
    data.users.get().addUserAuditEvent({ ...actor }, action, context);
  const reads = portalReadHttpInputs(portal);
  return {
    records: {
      get records() {
        return data.records.get();
      },
      get recordTypes() {
        return ref.types.get();
      },
      get workflows() {
        return ref.workflows.get();
      },
      get forms() {
        return ref.forms.get();
      },
      contextVariables: reads.records.contextVariables,
      reusableFormDefinitions: config.reusableFormDefinitions,
      returnMetadataOnSave: config.record.form?.returnMetadataOnSave,
      schemaEnabled: config.recordSchema.enabled,
      rootContext: config.server.rootContext,
      publicUrl: config.server.publicUrl,
      log,
    },
    harvest: {
      get harvest() {
        return data.harvest.get();
      },
      get recordTypes() {
        return ref.types.get();
      },
      log,
    },
    configuration: {
      get appConfigs() {
        return ref.appConfigs.get();
      },
      get translations() {
        return ref.entries.get();
      },
      get dashboardConfig() {
        return ref.dashboardConfig.get();
      },
      reloadTranslations: (id: string) => ref.translation.get().reloadResources(id),
    },
    queries: {
      get queries() {
        return ref.queries.get();
      },
      get reports() {
        return ref.reports.get();
      },
      audit,
      log,
    },
    actions: { actions, audit, log },
  };
}
type MutationUploadInput = c.ApiRecordMutationControllerInput & DatastreamControllerInput;
class MutationUploadController extends c.ApiRecordMutationController {
  private readonly uploads: DatastreamController;
  constructor(input: MutationUploadInput) {
    super(input);
    this.uploads = new DatastreamController(input);
  }
  addDataStreams(request: FastifyRequest, reply: FastifyReply) {
    return this.uploads.addDataStreams(request, reply);
  }
}
const mutationUploadController = defineController({
  name: c.apiRecordMutationController.name,
  requires: ['portal-raw-http'],
  actions: [...c.apiRecordMutationController.actions, 'addDataStreams'],
  create: (input: MutationUploadInput) => new MutationUploadController(input),
});
export function portalMutationControllers(
  portal: PortalApplicationContext,
  selected: ReadonlySet<string>,
  actions: Readonly<Record<string, ConfiguredAction>>,
  uploads?: DatastreamControllerInput,
  browser?: BrowserPageBinding
) {
  const input = portalMutationHttpInputs(portal, actions),
    reads = portalReadHttpInputs(portal),
    refs = portalReferenceHttpInputs(portal),
    metadata = portalHttpPlan(portal, {}).metadata;
  const combine = combineHttpInputs;
  const browserRecords = combine(
    input.records,
    combine(
      reads.records,
      combine(refs.form, {
        get recordTypes() {
          return refs.metadata.recordTypes;
        },
        get workflowSteps() {
          return refs.metadata.workflowSteps;
        },
        get dashboardTypes() {
          return refs.metadata.dashboardTypes;
        },
        get dashboardConfig() {
          return refs.metadata.dashboardConfig;
        },
      })
    )
  );
  const apiRecords = combine(combine(combine(metadata, reads.records), input.records), input.harvest);
  const bindings = [
    uploads
      ? bindControllerFactory(mutationUploadController, combine(apiRecords, uploads))
      : bindControllerFactory(c.apiRecordMutationController, apiRecords),
    browser
      ? bindControllerFactory(
          browserControllers.recordMutationBrowserController,
          combineBrowserInput(browserRecords, browser)
        )
      : bindControllerFactory(c.recordMutationController, browserRecords),
    bindControllerFactory(c.apiAppConfigMutationController, combine(refs.configuration, input.configuration)),
    browser
      ? bindControllerFactory(
          browserControllers.appConfigMutationBrowserController,
          combineBrowserInput(combine(refs.configuration, input.configuration), browser)
        )
      : bindControllerFactory(c.appConfigMutationController, combine(refs.configuration, input.configuration)),
    bindControllerFactory(c.apiTranslationMutationController, combine(refs.configuration, input.configuration)),
    bindControllerFactory(c.translationMutationController, combine(refs.metadata, input.configuration)),
    bindControllerFactory(c.apiDashboardMutationController, combine(refs.metadata, input.configuration)),
    browser
      ? bindControllerFactory(
          browserControllers.dashboardMutationBrowserController,
          combineBrowserInput(combine(refs.metadata, input.configuration), browser)
        )
      : bindControllerFactory(c.dashboardMutationController, combine(refs.metadata, input.configuration)),
    bindControllerFactory(c.apiNamedQueryMutationController, combine(reads.queries, input.queries)),
    bindControllerFactory(c.apiReportMutationController, combine(reads.queries, input.queries)),
    browser
      ? bindControllerFactory(
          browserControllers.reportMutationBrowserController,
          combineBrowserInput(combine(reads.queries, input.queries), browser)
        )
      : bindControllerFactory(c.reportMutationController, combine(reads.queries, input.queries)),
    bindControllerFactory(c.actionController, input.actions),
  ].filter(binding => selected.has(binding.factory.name));
  return { controllers: bindings.map(binding => binding.factory), bindings };
}
