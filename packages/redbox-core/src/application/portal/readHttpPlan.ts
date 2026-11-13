import { combineBrowserInput } from './pageHttpPlan';
import * as browserControllers from '../../http/controllers/BrowserControllers';
import type { BrowserPageBinding } from '../../http/controllers/BrowserControllers';
import type { PortalApplicationContext } from './application';
import type { RecordReadInput } from '../../http/actions/recordReads';
import type { QueryReadInput } from '../../http/actions/queryReads';
import { ContextVariables } from '../../forms/ContextVariables';
import { RecordAuditViews } from '../../queries/RecordAuditViews';
import { SiemReads } from '../../queries/SiemReads';
import { summarizeFigshareStatus } from '../../queries/FigshareStatus';
import { diffRecordValues } from '@researchdatabox/sails-ng-common';
import * as persistence from '../../persistence/runtime';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  DatastreamController,
  type DatastreamControllerInput,
} from '../../http/controllers/webservice/DatastreamController';
import { defineController, bindControllerFactory } from '../../http/controllers';
import * as c from '../../http/controllers/ReadControllers';
import { portalHttpPlan } from './httpPlan';
import { portalReferenceHttpInputs } from './referenceHttpPlan';
/** Offline domain selection shared by Express and Fastify. Getters borrow only
 * initialized modules; no connection, controller or domain is acquired here. */
export function portalReadHttpInputs(portal: PortalApplicationContext) {
  const { data, config, log, owner } = portal,
    ref = data.reference;
  const records: RecordReadInput = {
    get schemas() {
      return ref.schema.get();
    },
    rootContext: config.server.rootContext,
    get storage() {
      return data.storage();
    },
    get audit() {
      return data.records.get();
    },
    get forms() {
      return ref.forms.get();
    },
    contextVariables: new ContextVariables(config.record.contextVariables, log),
    reusableFormDefinitions: config.reusableFormDefinitions,
    get recordTypes() {
      return ref.types.get();
    },
    get search() {
      return data.search.get();
    },
    returnFields: config.record.search.returnFields,
    maxRows: config.api.max_requests,
    maxSearchRows: config.record.search.maxRecordsPerPage,
    log,
    translate: (key, brand) => ref.translation.get().t(key, undefined, 'en', brand),
  };
  const queries: QueryReadInput = {
    get queries() {
      return ref.queries.get();
    },
    get reports() {
      return ref.reports.get();
    },
    get harvest() {
      return data.harvest.get();
    },
    get siem() {
      return new SiemReads(persistence.getSiemRepository(owner));
    },
    get audit() {
      return new RecordAuditViews({
        records: data.records.get(),
        forms: ref.forms.get(),
        integrations: portal.providers.audits.get(),
        compareRecords: diffRecordValues,
        canView: async (brand, user, record) =>
          data.records.get().hasViewAccess(brand, user, Array.isArray(user.roles) ? user.roles : [], record),
        configuration: name => ref.appConfigs.get().getAppConfigurationForBrand(name),
        figshareStatus: async (oid, record) =>
          summarizeFigshareStatus(oid, record, await persistence.getFigshareSyncRepository(owner).get(oid)),
      });
    },
    get search() {
      return data.search.get();
    },
    get recordTypes() {
      return ref.types.get();
    },
    returnFields: config.record.search.returnFields,
    siemConfig: async id => ref.appConfigs.get().getAppConfigByBrandAndKey(id, 'siem'),
  };
  return { records, queries };
}
type ReadUploadInput = c.ApiRecordReadControllerInput & DatastreamControllerInput;
class ReadUploadController extends c.ApiRecordReadController {
  private readonly uploads: DatastreamController;
  constructor(input: ReadUploadInput) {
    super(input);
    this.uploads = new DatastreamController(input);
  }
  addDataStreams(request: FastifyRequest, reply: FastifyReply) {
    return this.uploads.addDataStreams(request, reply);
  }
}
const readUploadController = defineController({
  name: c.apiRecordReadController.name,
  requires: ['portal-raw-http'],
  actions: [...c.apiRecordReadController.actions, 'addDataStreams'],
  create: (input: ReadUploadInput) => new ReadUploadController(input),
});
export const combineHttpInputs = <A extends object, B extends object>(a: A, b: B): A & B =>
  Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(a), ...Object.getOwnPropertyDescriptors(b) }) as A &
    B;

export function portalReadControllers(
  portal: PortalApplicationContext,
  selected: ReadonlySet<string>,
  uploads?: DatastreamControllerInput,
  browser?: BrowserPageBinding
) {
  const inputs = portalReadHttpInputs(portal);
  const metadata = portalHttpPlan(portal, {}).metadata,
    refs = portalReferenceHttpInputs(portal);
  // Preserve lazy domain getters when combining a controller's explicit inputs.
  const combine = combineHttpInputs;
  const bindings = [
    ...(uploads
      ? [bindControllerFactory(readUploadController, combine(combine(metadata, inputs.records), uploads))]
      : [bindControllerFactory(c.apiRecordReadController, combine(metadata, inputs.records))]),
    bindControllerFactory(
      c.recordReadController,
      combine(
        inputs.records,
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
    ),
    bindControllerFactory(c.apiExportReadController, inputs.records),
    browser
      ? bindControllerFactory(
          browserControllers.exportReadBrowserController,
          combineBrowserInput(inputs.records, browser)
        )
      : bindControllerFactory(c.exportReadController, inputs.records),
    bindControllerFactory(c.apiRecordSchemaReadController, inputs.records),
    bindControllerFactory(c.apiReportReadController, inputs.queries),
    bindControllerFactory(c.reportReadController, inputs.queries),
    bindControllerFactory(c.apiNamedQueryReadController, inputs.queries),
    bindControllerFactory(c.apiHarvestRunReadController, inputs.queries),
    bindControllerFactory(c.apiSiemReadController, inputs.queries),
    bindControllerFactory(c.apiSearchReadController, inputs.queries),
    bindControllerFactory(c.apiIntegrationAuditReadController, inputs.queries),
    browser
      ? bindControllerFactory(
          browserControllers.recordAuditReadBrowserController,
          combineBrowserInput(inputs.queries, browser)
        )
      : bindControllerFactory(c.recordAuditReadController, inputs.queries),
  ].filter(binding => selected.has(binding.factory.name));
  return { controllers: bindings.map(binding => binding.factory), bindings };
}
