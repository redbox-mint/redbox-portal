import type { Router, RequestHandler } from 'express';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import type { StorageService } from '../../src/StorageService';
import type { RecordTypes } from '../../src/recordTypes';
import type { RecordAuditReader } from '../../src/queries/RecordAuditReader';
import type { SolrReads } from '../../src/queries/SolrReads';
import type { mongoFixture } from './mongoFixture';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { registerPersistenceResource } from '../../src/persistence/runtime';
import { Forms } from '../../src/forms/Forms';
import { RecordValidation } from '../../src/forms/RecordValidation';
import type { RecordValidationServiceDependencies } from '../../src/forms/RecordValidation';
import { Services as Workflows } from '../../src/workflows/WorkflowSteps';
import { Services as Schemas } from '../../src/recordSchema/RecordSchema';
import { Services as Sanitizers } from '../../src/forms/DomSanitizer';
import { dompurify } from '../../src/config/dompurify.config';
import { recordSchema } from '../../src/config/recordSchema.config';
import { ContextVariables } from '../../src/forms/ContextVariables';
import { RecordContractContributorRegistry, createCoreRecordContractContributors } from '../../src/record-contract';
import { hasViewAccess, hasEditAccess, hasTransitionRoleAuthorization } from '../../src/records/access';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { mountRecordReadRoutes } from '../../src/http/express/recordReads';
import { pilotPolicyChain } from '../../src/http/express/policies';
export async function prepareRecordReads(
  router: Router,
  f: Awaited<ReturnType<typeof mongoFixture>>,
  types: RecordTypes,
  storage: StorageService,
  audit: RecordAuditReader,
  search: Pick<SolrReads, 'searchFuzzy'>,
  policies: Readonly<Record<string, RequestHandler>>
) {
  const refs = getReferenceRepositories(f.owner);
  const brand = Object.assign(new BrandingModel(), f.brand);
  const workflows = new Workflows.WorkflowSteps({
    references: refs,
    config: { appmode: {}, workflow: {} },
    log: nothingLogger,
    initialiseDashboardSettings: async () => {},
  });
  const config = { ...recordSchema, enabled: true };
  const sanitizer = new Sanitizers.DomSanitizer({ config: { dompurify }, log: nothingLogger });
  registerPersistenceResource(f.owner, 'read-sanitizer', { close: () => sanitizer.close() });
  const readers: RecordValidationServiceDependencies = {
    loadRecord: oid => storage.getMeta(oid),
    loadRecordType: (brand, name) => refs.recordTypes.findByName(brand, name),
    loadStartingWorkflowStep: async type =>
      (await refs.workflows.findStarting(type.id ?? '')) as Awaited<
        ReturnType<RecordValidationServiceDependencies['loadStartingWorkflowStep']>
      >,
    loadWorkflowStep: async (type, step) =>
      (await refs.workflows.findByName(type.id ?? '', step)) as Awaited<
        ReturnType<RecordValidationServiceDependencies['loadWorkflowStep']>
      >,
    loadWorkflowSteps: async type =>
      (await refs.workflows.listForRecordType(type.id ?? '', false)) as Awaited<
        ReturnType<RecordValidationServiceDependencies['loadWorkflowSteps']>
      >,
    loadForm: async (name, brand) =>
      (await refs.forms.findByName(name, brand)) as Awaited<
        ReturnType<RecordValidationServiceDependencies['loadForm']>
      >,
    constructForm: async () => {
      throw new Error('Use production form construction');
    },
  };
  const validation = new RecordValidation({
    readers,
    config: { recordSchema: config },
    log: nothingLogger,
    html: {
      sanitizeWithProfile: (value, profile) => sanitizer.sanitizeWithProfile(value, profile),
      htmlSanitizationMode: () => 'sanitize',
    },
  });
  const forms = new Forms({
    repository: refs,
    config: { appmode: {} },
    log: nothingLogger,
    formRegistry: () => ({}),
    defaultBrand: () => brand,
    recordTypes: types,
    workflowSteps: workflows,
    validation,
    records: { getMeta: storage.getMeta.bind(storage), hasViewAccess, hasEditAccess, hasTransitionRoleAuthorization },
    vocabulary: { defaultBrand: () => brand.name, getEntries: async () => ({ entries: [], meta: { total: 0 } }) },
  });
  await refs.forms.createDefinition({
    name: 'dataRecord',
    branding: brand.id,
    configuration: {
      name: 'dataRecord',
      type: 'dataRecord',
      componentDefinitions: [
        {
          name: 'title',
          component: { class: 'SimpleInputComponent', config: { type: 'text' } },
          model: { class: 'SimpleInputModel', config: { defaultValue: 'Default title' } },
        },
      ],
      enabledValidationGroups: ['base'],
      validationGroups: { base: { description: 'base', initialMembership: 'all' } },
      validationOperations: { draft: { label: 'Save draft', enabledValidationGroups: ['base'], roles: ['Admin'] } },
    },
  });
  const type = await refs.recordTypes.findByName(brand.id, 'dataRecord');
  await refs.workflows.createDefinition({
    name: 'draft',
    recordType: type!.id,
    starting: true,
    hidden: false,
    config: { form: 'dataRecord', authorization: { editRoles: ['Admin'], transitionRoles: ['Admin'] } },
  });
  const registry = new RecordContractContributorRegistry(
    createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' }))
  );
  const schemas = new Schemas.RecordSchema({
    getConfig: () => config,
    getStorageProvider: () => storage,
    getContributorRegistry: () => registry,
    getContributorRegistrationIssues: () => [],
    getContributorComponentTypes: () =>
      registry.registrations().flatMap(r => (r.contributor.kind === 'component' ? [r.contributor.componentType] : [])),
    getConfiguredFormCandidates: () => forms.listConfiguredRecordContractForms(),
    resolveContractContext: request => validation.resolveContractContext(request),
    buildContractFormConfig: (context, caller) => forms.buildContractFormConfig(context, caller),
    authorizeCreate: async (context, caller) =>
      caller.brand.id === context.publicContext.brand && caller.user.roles.some(role => role.name === 'Admin'),
    authorizeUpdate: async (context, caller) =>
      caller.brand.id === context.publicContext.brand &&
      hasEditAccess(
        caller.brand,
        caller.user,
        caller.user.roles.map(r => ({ ...r })),
        context.resolution.existingRecord
      ),
    clock: Date.now,
    telemetryLogger: nothingLogger,
  });
  schemas.init();
  registerPersistenceResource(f.owner, 'read-schemas', { close: () => schemas.close() });
  mountRecordReadRoutes(router, {
    storage,
    audit,
    forms,
    schemas,
    recordTypes: types,
    search,
    contextVariables: new ContextVariables({}, nothingLogger),
    maxRows: 100,
    returnFields: ['id'],
    log: nothingLogger,
    translate: key => key,
    policies,
    policyConfiguration: { '*': [...pilotPolicyChain] },
  });
  return { schemas, forms, validation, workflows, config };
}
