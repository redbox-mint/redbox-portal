import type { MongoCollection } from '@prisma/orm-mongo/orm';
import type { Contract } from '../prisma/generated/contract';
import type { CorePrismaClient } from '../prisma/client';
import { MongoExistsExpr, MongoFieldFilter } from '@prisma/orm-mongo/query-ast';
import type { MongoFilterExpr } from '@prisma/orm-mongo/query-ast';
import { prismaModelValues } from '../prisma/modelValues';
import { projectReferenceFields } from './selection';
import { coercePersistenceQueryScalar, persistenceQueryFields } from '../scalars';
import type { ReferenceCollection } from './physical';
import type {
  ReferenceRepositories,
  Definition,
  DefinitionValues,
  FormDefinition,
  BrandedDefinition,
  WorkflowDefinition,
  DashboardDefinition,
  ReportDefinitionRow,
  NamedQueryDefinitionRow,
} from './ReferenceRepositories';
import { referenceId as id, encodeReference, decodeReference, referenceOperation } from './physical';

export function prismaReferenceRepositories(client: CorePrismaClient): ReferenceRepositories {
  // A union of model handles shares one Prisma collection API; its decoded row type is the model union.
  const model = (name: ReferenceCollection) =>
    client.orm[name] as MongoCollection<
      Contract,
      | 'ThemeConfig'
      | 'Form'
      | 'RecordType'
      | 'WorkflowStep'
      | 'DashboardType'
      | 'RBReport'
      | 'NamedQuery'
      | 'WorkspaceType'
    >;
  const list = async <T extends Definition>(
    collection: ReferenceCollection,
    where: DefinitionValues,
    fields?: readonly string[] | null,
    filter?: MongoFilterExpr
  ): Promise<T[]> => {
    let query = model(collection).where(prismaModelValues(where));
    if (filter) query = query.where(filter);
    return (await query.all().toArray()).map(row =>
      projectReferenceFields(decodeReference<T>(collection, row, true)!, fields)
    );
  };
  const one = async <T extends Definition>(
    collection: ReferenceCollection,
    where: DefinitionValues,
    fields?: readonly string[] | null
  ): Promise<T | null> => {
    const row = decodeReference<T>(collection, await model(collection).where(prismaModelValues(where)).first(), true);
    return row ? projectReferenceFields(row, fields) : null;
  };
  const create = async <T extends Definition>(collection: ReferenceCollection, values: DefinitionValues): Promise<T> =>
    decodeReference<T>(
      collection,
      await model(collection).create(prismaModelValues(encodeReference(collection, values))),
      true
    )!;
  const patch = async <T extends Definition>(
    collection: ReferenceCollection,
    where: DefinitionValues,
    values: DefinitionValues
  ): Promise<T | null> =>
    decodeReference<T>(
      collection,
      await model(collection)
        .where(prismaModelValues(where))
        .update(prismaModelValues(encodeReference(collection, values, true))),
      true
    );
  const remove = async (collection: ReferenceCollection, where: DefinitionValues, many = true): Promise<void> => {
    const query = model(collection).where(prismaModelValues(where));
    if (many) await query.deleteAndCount();
    else await query.delete();
  };
  const byBrand = (branding: string) => ({ branding: id(branding) });
  const byKey = (key: string) => ({ key: coercePersistenceQueryScalar(key, 'string') });
  return {
    themes: {
      list: () => referenceOperation(() => list<Definition>('themeconfig', {})),
      findByName: name =>
        referenceOperation(() =>
          one<Definition>('themeconfig', { name: coercePersistenceQueryScalar(name, 'string') })
        ),
      reviseDefinition: (identity, values) =>
        referenceOperation(() => patch<Definition>('themeconfig', { _id: id(identity) }, values)),
      createDefinition: values => referenceOperation(() => create<Definition>('themeconfig', values)),
    },
    forms: {
      list: branding =>
        referenceOperation(() => list<FormDefinition>('form', branding === undefined ? {} : byBrand(branding))),
      listByName: (name, branding) =>
        referenceOperation(() =>
          list<FormDefinition>('form', { ...persistenceQueryFields({ name }), ...byBrand(branding) })
        ),
      findByName: (name, branding) =>
        referenceOperation(() =>
          one<FormDefinition>('form', {
            ...persistenceQueryFields({ name }),
            ...(branding === undefined ? {} : byBrand(branding)),
          })
        ),
      findByIds: ids =>
        referenceOperation(() =>
          list<FormDefinition>(
            'form',
            {},
            undefined,
            MongoFieldFilter.in(
              '_id',
              ids.map(value => id(value).toHexString())
            )
          )
        ),
      removeByName: (name, branding) =>
        referenceOperation(async () => {
          const row = await one<FormDefinition>('form', { ...persistenceQueryFields({ name }), ...byBrand(branding) });
          if (row) await remove('form', { _id: id(row.id) }, false);
        }),
      createDefinition: values => referenceOperation(() => create<FormDefinition>('form', values)),
    },
    recordTypes: {
      listForBrand: (branding, fields) =>
        referenceOperation(() => list<BrandedDefinition>('recordtype', byBrand(branding), fields)),
      findByName: (branding, name, fields) =>
        referenceOperation(() =>
          one<BrandedDefinition>('recordtype', { ...byBrand(branding), ...persistenceQueryFields({ name }) }, fields)
        ),
      findByKey: key => referenceOperation(() => one<BrandedDefinition>('recordtype', byKey(key))),
      reviseDefinition: (identity, values) =>
        referenceOperation(() => patch<BrandedDefinition>('recordtype', { _id: id(identity) }, values)),
      removeForBrand: branding => referenceOperation(() => remove('recordtype', byBrand(branding))),
      createDefinition: values => referenceOperation(() => create<BrandedDefinition>('recordtype', values)),
    },
    workflows: {
      listAll: () => referenceOperation(() => list<WorkflowDefinition>('workflowstep', {})),
      listForRecordType: (recordType, includeHidden = true) =>
        referenceOperation(() =>
          list<WorkflowDefinition>(
            'workflowstep',
            { recordType: id(recordType) },
            undefined,
            includeHidden ? undefined : MongoFieldFilter.neq('hidden', true)
          )
        ),
      findByName: (recordType, name) =>
        referenceOperation(() =>
          one<WorkflowDefinition>('workflowstep', { recordType: id(recordType), ...persistenceQueryFields({ name }) })
        ),
      findStarting: recordType =>
        referenceOperation(() =>
          one<WorkflowDefinition>('workflowstep', { recordType: id(recordType), starting: true })
        ),
      attachForm: (identity, form) =>
        referenceOperation(async () => {
          const row = await patch<WorkflowDefinition>('workflowstep', { _id: id(identity) }, { form });
          return row ? [row] : [];
        }),
      removeAllForBootstrap: () =>
        referenceOperation(async () => {
          // Prisma requires an explicit filter for this intentional all-workflow reset.
          await client.orm.workflowstep.where(MongoExistsExpr.exists('_id')).deleteAndCount();
        }),
      createDefinition: values => referenceOperation(() => create<WorkflowDefinition>('workflowstep', values)),
    },
    dashboardTypes: {
      listForBrand: branding => referenceOperation(() => list<DashboardDefinition>('dashboardtype', byBrand(branding))),
      findByName: (branding, name) =>
        referenceOperation(() =>
          one<DashboardDefinition>('dashboardtype', { ...byBrand(branding), ...persistenceQueryFields({ name }) })
        ),
      reviseDefinition: (branding, name, values) =>
        referenceOperation(async () => {
          const where = { ...byBrand(branding), ...persistenceQueryFields({ name }) };
          // Validate submitted fields even if no definition matches, without merging a read into the patch.
          const submitted = prismaModelValues(encodeReference('dashboardtype', values, true));
          return decodeReference<DashboardDefinition>(
            'dashboardtype',
            await model('dashboardtype').where(prismaModelValues(where)).update(submitted),
            true
          );
        }),
      removeForBrand: (branding, name) =>
        referenceOperation(() =>
          remove('dashboardtype', {
            ...byBrand(branding),
            ...(name === undefined ? {} : persistenceQueryFields({ name })),
          })
        ),
      createDefinition: values => referenceOperation(() => create<DashboardDefinition>('dashboardtype', values)),
    },
    reports: {
      listForBrand: branding => referenceOperation(() => list<ReportDefinitionRow>('report', byBrand(branding))),
      findByKey: key => referenceOperation(() => one<ReportDefinitionRow>('report', byKey(key))),
      reviseDefinition: (key, values) =>
        referenceOperation(() => patch<ReportDefinitionRow>('report', byKey(key), values)),
      removeByKey: key => referenceOperation(() => remove('report', byKey(key), false)),
      createDefinition: values => referenceOperation(() => create<ReportDefinitionRow>('report', values)),
    },
    namedQueries: {
      listForBrand: branding =>
        referenceOperation(() => list<NamedQueryDefinitionRow>('namedquery', byBrand(branding))),
      findByKey: key => referenceOperation(() => one<NamedQueryDefinitionRow>('namedquery', byKey(key))),
      reviseDefinition: (key, values) =>
        referenceOperation(() => patch<NamedQueryDefinitionRow>('namedquery', byKey(key), values)),
      removeByKey: key =>
        referenceOperation(async () =>
          decodeReference<NamedQueryDefinitionRow>(
            'namedquery',
            await client.orm.namedquery.where(prismaModelValues(byKey(key))).delete(),
            true
          )
        ),
      createDefinition: values => referenceOperation(() => create<NamedQueryDefinitionRow>('namedquery', values)),
    },
    workspaceTypes: {
      listForBrand: branding => referenceOperation(() => list<BrandedDefinition>('workspacetype', byBrand(branding))),
      findByName: (branding, name) =>
        referenceOperation(() =>
          one<BrandedDefinition>('workspacetype', { ...byBrand(branding), ...persistenceQueryFields({ name }) })
        ),
      setLogo: (identity, logo) =>
        referenceOperation(async () => {
          await patch<BrandedDefinition>('workspacetype', { _id: id(identity) }, { logo });
        }),
      removeForBrand: branding => referenceOperation(() => remove('workspacetype', byBrand(branding))),
      createDefinition: values => referenceOperation(() => create<BrandedDefinition>('workspacetype', values)),
    },
    async workflowForms(recordType) {
      const steps = await this.workflows.listForRecordType(recordType);
      const forms = await this.forms.findByIds([
        ...new Set(steps.map(step => step.form).filter((value): value is string => Boolean(value))),
      ]);
      const byId = new Map(forms.map(form => [form.id, form]));
      return steps.map(step => ({ ...step, form: step.form ? (byId.get(step.form) ?? null) : null }));
    },
  };
}
