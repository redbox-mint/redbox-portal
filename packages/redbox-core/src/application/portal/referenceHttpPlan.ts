import type { PortalApplicationContext } from './application';
import { bindControllerFactory } from '../../http/controllers';
import * as controllers from '../../http/controllers/ReferenceControllers';
import type { ConfigurationReadInput } from '../../http/actions/configurationReads';
import type { MetadataReadInput } from '../../http/actions/metadataReads';
import type { RecordTypeReadInput } from '../../http/actions/recordTypeReads';
import type { FormDeliveryInput } from '../../http/actions/formDelivery';
import { ContextVariables } from '../../forms/ContextVariables';
import { Services as Prehydrate } from '../../forms/FormPayloadPrehydrate';

/** Shared production selection for the two adapters. All domain getters borrow
 * initialized application modules; offline planning acquires no resources. */
export function portalReferenceHttpInputs(portal: PortalApplicationContext) {
  const { data, config, log } = portal;
  const ref = data.reference;
  const recordTypes: RecordTypeReadInput = {
    get recordTypes() {
      return ref.types.get();
    },
    recordSchema: config.recordSchema,
    rootContext: config.server.rootContext,
  };
  const metadata: MetadataReadInput = {
    get recordTypes() {
      return ref.types.get();
    },
    get workflowSteps() {
      return ref.workflows.get();
    },
    get workspaceTypes() {
      return ref.workspaceTypes.get();
    },
    get dashboardTypes() {
      return ref.dashboards.get();
    },
    get dashboardConfig() {
      return ref.dashboardConfig.get();
    },
    get translations() {
      return ref.entries.get();
    },
  };
  const configuration: ConfigurationReadInput = {
    get appConfigs() {
      return ref.appConfigs.get();
    },
    get translations() {
      return ref.entries.get();
    },
    get forms() {
      return ref.forms.get();
    },
    loadRecord: oid => data.records.get().getMeta(oid),
  };
  const form: FormDeliveryInput = {
    contextVariables: new ContextVariables(config.record.contextVariables, log),
    delivery: {
      get forms() {
        return ref.forms.get();
      },
      get recordTypes() {
        return ref.types.get();
      },
      get workflowSteps() {
        return ref.workflows.get();
      },
      get prehydrate() {
        return new Prehydrate.FormPayloadPrehydrateService({
          config: { form: config.form },
          vocabulary: ref.vocabulary.get(),
          log,
        });
      },
      loadRecord: oid => data.records.get().getMeta(oid),
      canView: async (brand, user, record) =>
        !!user &&
        data.records.get().hasViewAccess(
          brand,
          user,
          user.roles.map(role => ({ ...role })),
          record
        ),
      canEdit: async (brand, user, record) =>
        !!user &&
        data.records.get().hasEditAccess(
          brand,
          user,
          user.roles.map(role => ({ ...role })),
          record
        ),
      fingerprint: (...args) => data.records.get().getRecordFormFingerprint(...args),
      reusableFormDefinitions: config.reusableFormDefinitions,
    },
  };
  return { recordTypes, metadata, configuration, form };
}

export function portalReferenceControllers(portal: PortalApplicationContext, selected: ReadonlySet<string>) {
  const inputs = portalReferenceHttpInputs(portal);
  const dashboard: controllers.DashboardConfigControllerInput = {
    get dashboardConfig() {
      return inputs.metadata.dashboardConfig;
    },
  };
  const appConfig: controllers.AppConfigControllerInput = {
    get appConfigs() {
      return inputs.configuration.appConfigs;
    },
  };
  const translation: controllers.TranslationControllerInput = {
    get translations() {
      return inputs.configuration.translations;
    },
  };
  const bindings = [
    bindControllerFactory(controllers.recordTypeController, inputs.recordTypes),
    bindControllerFactory(controllers.appConfigController, appConfig),
    bindControllerFactory(controllers.appConfigFormController, appConfig),
    bindControllerFactory(controllers.translationController, translation),
    bindControllerFactory(controllers.formManagementController, {
      get forms() {
        return inputs.configuration.forms;
      },
      loadRecord: inputs.configuration.loadRecord,
    }),
    bindControllerFactory(controllers.workspaceTypesController, {
      get workspaceTypes() {
        return inputs.metadata.workspaceTypes;
      },
    }),
    bindControllerFactory(controllers.browserTranslationController, {
      get translations() {
        return inputs.metadata.translations;
      },
    }),
    bindControllerFactory(controllers.dashboardConfigController, dashboard),
    bindControllerFactory(controllers.browserDashboardConfigController, dashboard),
    bindControllerFactory(controllers.recordReferenceController, {
      get recordTypes() {
        return inputs.metadata.recordTypes;
      },
      get workflowSteps() {
        return inputs.metadata.workflowSteps;
      },
      get dashboardTypes() {
        return inputs.metadata.dashboardTypes;
      },
      get dashboardConfig() {
        return inputs.metadata.dashboardConfig;
      },
      contextVariables: inputs.form.contextVariables,
      delivery: inputs.form.delivery,
    }),
  ].filter(binding => selected.has(binding.factory.name));
  return { controllers: bindings.map(binding => binding.factory), bindings };
}
