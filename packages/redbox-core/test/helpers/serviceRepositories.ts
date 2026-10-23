import { repositoryFixtures } from './repositoryFixtures';
import { repositoryFixtures as fixtures } from './repositoryFixtures';
import { projectReferenceFields } from '../../src/persistence/reference/selection';
import { secretLeaseRepository } from '../services/legacySecretLeases';
import { PersistenceError } from '../../src/persistence/errors';

// A fixture may return a promise or use a callback. Both are test data sources;
// no runtime model discovery, codecs, datastore mappings or callbacks live here.
export async function fixtureResult(value: any): Promise<any> {
  if (value?.then) return value;
  if (value?.exec)
    return new Promise((resolve, reject) =>
      value.exec((err: unknown, row: unknown) => (err ? reject(err) : resolve(row)))
    );
  return value;
}
async function call(name: string, method: string, args: unknown[] = [], options: Record<string, unknown> = {}) {
  let value = fixtures[name][method](...args);
  for (const [key, arg] of Object.entries(options)) if (value?.[key]) value = value[key](arg);
  return fixtureResult(value);
}
const read = (name: string, where: unknown) => call(name, 'findOne', [where]);
const rows = (name: string, where?: unknown, options?: Record<string, unknown>) =>
  call(name, 'find', where === undefined ? [] : [where], options);
const add = (name: string, data: unknown) => call(name, 'create', [data], { fetch: undefined });
const patch = (name: string, where: unknown, values: unknown) => call(name, 'updateOne', [where], { set: values });
const del = (name: string, where: unknown, one = false) => call(name, one ? 'destroyOne' : 'destroy', [where]);
const keyed = (name: string) => ({
  listForBrand: (branding: string) => rows(name, { branding }),
  findByKey: (key: string) => read(name, { key }),
  createDefinition: (values: unknown) => add(name, values),
  reviseDefinition: (key: string, values: unknown) => patch(name, { key }, values),
  removeByKey: (key: string) => del(name, { key }, true),
});
export function referenceFixtures(): any {
  const repos = {
    themes: {
      list: () => rows('ThemeConfig'),
      findByName: (name: string) => read('ThemeConfig', { name }),
      createDefinition: (v: unknown) => add('ThemeConfig', v),
      reviseDefinition: (id: string, v: unknown) => patch('ThemeConfig', { id }, v),
    },
    forms: {
      list: (branding?: string) => rows('Form', branding === undefined ? {} : { branding }),
      listByName: (name: string, branding: string) => rows('Form', { name, branding }),
      findByName: (name: string, branding?: string) =>
        read('Form', { name, ...(branding === undefined ? {} : { branding }) }),
      findByIds: (ids: string[]) => (ids.length ? rows('Form', { id: ids }) : Promise.resolve([])),
      createDefinition: (v: unknown) => add('Form', v),
      removeByName: (name: string, branding: string) => del('Form', { name, branding }, true),
    },
    recordTypes: {
      listForBrand: async (branding: string, fields?: string[]) =>
        (await rows('RecordType', { where: { branding } })).map((row: any) => projectReferenceFields(row, fields)),
      findByName: async (branding: string, name: string, fields?: string[]) => {
        const row = await read('RecordType', { where: { branding, name } });
        return row ? projectReferenceFields(row, fields) : null;
      },
      findByKey: (key: string) => read('RecordType', { key }),
      createDefinition: (v: unknown) => add('RecordType', v),
      reviseDefinition: (id: string, v: unknown) => patch('RecordType', { id }, v),
      removeForBrand: (branding: string) => del('RecordType', { branding }),
    },
    workflows: {
      listAll: () => rows('WorkflowStep', {}),
      listForRecordType: (recordType: string, includeHidden = true) =>
        rows('WorkflowStep', { recordType, ...(includeHidden ? {} : { hidden: { '!=': true } }) }),
      findByName: (recordType: string, name: string) => read('WorkflowStep', { recordType, name }),
      findStarting: (recordType: string) => read('WorkflowStep', { recordType, starting: true }),
      createDefinition: (v: unknown) => add('WorkflowStep', v),
      attachForm: (id: string, form: string) =>
        call('WorkflowStep', 'update', [{ id }], { set: { form }, fetch: undefined }),
      removeAllForBootstrap: () => del('WorkflowStep', {}),
    },
    dashboardTypes: {
      listForBrand: (branding: string) => rows('DashboardType', { where: { branding } }),
      findByName: (branding: string, name: string) => read('DashboardType', { where: { branding, name } }),
      createDefinition: (v: unknown) => add('DashboardType', v),
      reviseDefinition: (branding: string, name: string, v: unknown) => patch('DashboardType', { branding, name }, v),
      removeForBrand: (branding: string, name?: string) =>
        del('DashboardType', { branding, ...(name === undefined ? {} : { name }) }),
    },
    reports: keyed('RBReport'),
    namedQueries: keyed('NamedQuery'),
    workspaceTypes: {
      listForBrand: (branding: string) => rows('WorkspaceType', { branding }),
      findByName: (branding: string, name: string) => read('WorkspaceType', { branding, name }),
      createDefinition: (v: unknown) => add('WorkspaceType', v),
      setLogo: (id: string, logo: string) => call('WorkspaceType', 'update', [{ id }, { logo }]),
      removeForBrand: (branding: string) => del('WorkspaceType', { branding }),
    },
    async workflowForms(recordType: string) {
      const steps = await repos.workflows.listForRecordType(recordType);
      const forms = await repos.forms.findByIds(steps.map((s: any) => s.form).filter(Boolean));
      return steps.map((s: any) => ({ ...s, form: forms.find((f: any) => f.id === s.form) ?? null }));
    },
  };
  return repos;
}
export function configurationFixtures(): any {
  const bundles = 'I18nBundle',
    translations = 'I18nTranslation';
  return {
    appConfigs: {
      listForBrand: (branding: string, configKey?: string) =>
        rows('AppConfig', { branding, ...(configKey === undefined ? {} : { configKey }) }),
      findForBrandAndKey: (branding: string, configKey: string) => read('AppConfig', { branding, configKey }),
      createConfiguration: (v: unknown) => add('AppConfig', v),
      replaceForBrandAndKey: (branding: string, configKey: string, configData: unknown) =>
        patch('AppConfig', { branding, configKey }, { configData }),
      removeForBrandAndKey: (branding: string, configKey: string) => del('AppConfig', { branding, configKey }),
    },
    dashboards: {
      findForBrand: (branding: string) => read('DashboardConfiguration', { branding }),
      createAggregate: (v: unknown) => add('DashboardConfiguration', v),
      compareAndSwap: async (branding: string, revision: number, v: unknown) =>
        (await call('DashboardConfiguration', 'update', [{ branding, revision }], { set: v, fetch: undefined }))
          ?.length === 1,
    },
    bundles: {
      findByUid: (uid: string) => read(bundles, { uid }),
      findById: (id: string) => read(bundles, { id }),
      findForLocale: (branding: string, locale: string, namespace: string) =>
        read(bundles, { branding, locale, namespace }),
      listForBrand: (branding: string, order?: boolean) => rows(bundles, { branding }, order ? { sort: 'locale' } : {}),
      createBundle: (v: unknown) => add(bundles, v),
      reviseBundle: (id: string, v: unknown) => patch(bundles, { id }, v),
      setEnabled: (branding: string, locale: string, namespace: string, enabled: boolean) =>
        patch(bundles, { branding, locale, namespace }, { enabled }),
    },
    translations: {
      findByUid: (uid: string) => read(translations, { uid }),
      listForLocale: (branding: string, locale: string, namespace: string, prefix?: string, order?: boolean) =>
        rows(
          translations,
          order
            ? { where: { branding, locale, namespace, ...(prefix ? { key: { startsWith: prefix } } : {}) } }
            : { branding, locale, namespace },
          order ? { sort: 'key ASC' } : {}
        ),
      createEntry: (v: unknown) => add(translations, v),
      reviseEntry: (id: string, v: unknown) => patch(translations, { id }, v),
      removeByUid: (uid: string) => del(translations, { uid }, true),
      addEntries: (v: unknown) => call(translations, 'createEach', [v]),
    },
    secretLeases: secretLeaseRepository(() => {
      const collection = fixtures.secretLocks;
      if (!collection)
        throw new PersistenceError(
          'secret-coordination-unavailable',
          'Bundled AppConfig secrets require MongoDB write coordination'
        );
      return collection;
    }),
  };
}
export function brandingFixtures(): any {
  const brand = 'BrandingConfig',
    history = 'BrandingConfigHistory';
  return {
    getBrand: (lookup: unknown) => read(brand, lookup),
    listBrands: () => rows(brand, {}),
    createBrand: (v: unknown) => add(brand, v),
    setBrandAssets: (id: string, v: unknown) => call(brand, 'update', [{ id }, v]),
    reviseBrand: (id: string, v: unknown) => patch(brand, { id }, v),
    reviseDraft: (id: string, draftRevision: number, v: unknown) => patch(brand, { id, draftRevision }, v),
    publishBrand: (id: string, version: number, draftRevision: number, v: unknown) =>
      patch(
        brand,
        {
          id,
          ...(version === undefined ? {} : { version }),
          ...(draftRevision === undefined ? {} : { draftRevision }),
        },
        v
      ),
    getHistory: (lookup: unknown) => read(history, lookup),
    listHistories: (branding?: string, order?: string) =>
      rows(history, branding === undefined ? {} : { branding }, order ? { sort: 'version ' + order } : {}),
    insertHistory: (v: unknown) => add(history, v),
    removeHistory: (id: string) => del(history, { id }),
    async backfillBrandTypeface(id: string) {
      const row = await read(brand, { id });
      if (!row) return;
      const v = {
        ...(row.typeface === undefined ? { typeface: null } : {}),
        ...(row.draftTypeface === undefined ? { draftTypeface: null } : {}),
        ...(row.draftRevision == null ? { draftRevision: 0 } : {}),
      };
      if (Object.keys(v).length) await patch(brand, { id }, v);
    },
    async backfillHistoryTypeface(id: string) {
      const row = await read(history, { id });
      if (row && row.typeface === undefined) await patch(history, { id }, { typeface: null });
    },
  };
}
export function harvestFixtures(): any {
  const run = 'HarvestRun',
    chunk = 'HarvestRunChunk',
    event = 'HarvestRecordEvent';
  return {
    runs: {
      findRun: (where: unknown) => read(run, where),
      createRun: (v: unknown) => add(run, v),
      listRuns: (where: unknown, skip: number, limit: number) =>
        rows(run, where, { sort: 'startedAt DESC', skip, limit }),
      countRuns: (where: unknown) => call(run, 'count', [where]),
      removeRun: (id: string) => del(run, { id }),
      async completeChunkCounters(row: any, counters: any, finalChunk: boolean, completedAt: string) {
        const next = require('../../src/persistence/harvest/atomicCounters').missingRunCounters(
          row,
          counters,
          completedAt,
          finalChunk
        );
        const { id, ...values } = next;
        return (await patch(run, { id }, values)) ?? next;
      },
      async incrementDuplicateChunks(row: any, completedAt = new Date().toISOString()) {
        const values = { duplicateChunks: Number(row.duplicateChunks ?? 0) + 1, lastChunkAt: completedAt };
        return (await patch(run, { id: row.id }, values)) ?? { ...row, ...values };
      },
    },
    chunks: {
      findAttempts: (runId: string, contentHash: string) =>
        rows(chunk, { runId, contentHash }, { sort: 'attempt DESC' }),
      listForRun: (runId: string, brandId: string, limit: number) =>
        rows(chunk, { runId, brandId }, { sort: 'submittedAt ASC', limit }),
      createAttempt: (v: unknown) => add(chunk, v),
      reviseAttempt: (id: string, v: unknown) => patch(chunk, { id }, v),
      removeForRun: (runId: string) => del(chunk, { runId }),
    },
    events: {
      appendEvents: (v: unknown) => call(event, 'createEach', [v]),
      listCheckpointed: (runId: string, brandId: string, chunkIds: string[]) =>
        rows(event, { runId, brandId, chunkId: { in: chunkIds } }, { sort: 'createdAt ASC' }),
      listEvents: (filter: unknown, skip: number, limit: number, ascending = false) =>
        rows(event, filter, { sort: ascending ? 'createdAt ASC' : 'createdAt DESC', skip, limit }),
      countEvents: (filter: unknown) => call(event, 'count', [filter]),
      removeForRun: (runId: string) => del(event, { runId }),
    },
  };
}
