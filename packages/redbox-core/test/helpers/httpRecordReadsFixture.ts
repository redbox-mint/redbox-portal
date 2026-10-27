import * as sinon from 'sinon';
import { httpRouteFixture } from './httpRouteFixture';
import { mountRecordReadRoutes } from '../../src/http/express/recordReads';

/** Real record-read routes with explicit and independently observable domain ports. */
export async function httpRecordReadsFixture() {
  const storage = Object.fromEntries(
    [
      'getMeta',
      'getRecords',
      'getDeletedRecords',
      'getDeletedRecordMeta',
      'getTombstone',
      'getRelatedRecords',
      'exportAllPlans',
    ].map(name => [name, sinon.stub()])
  );
  const schemas = { resolveCreate: sinon.stub(), resolveUpdate: sinon.stub(), resolveImmutable: sinon.stub() };
  const forms = {
    getFormByName: sinon.stub(),
    getFormByStartingWorkflowStep: sinon.stub(),
    buildClientFormConfig: sinon.stub(),
  };
  const audit = { getRecordAudit: sinon.stub(), getResolvedPermissionsSummary: sinon.stub() };
  const contextVariables = { evaluateContextVariables: sinon.stub().returns({}) };
  const recordTypes = { get: sinon.stub() };
  const search = { searchFuzzy: sinon.stub() };
  const f = await httpRouteFixture((router, input) =>
    mountRecordReadRoutes(router, {
      ...input,
      storage: storage as any,
      schemas,
      forms,
      audit,
      contextVariables,
      recordTypes,
      search,
      returnFields: [],
      maxRows: 1000,
      translate: key => key,
    })
  );
  return { ...f, storage, schemas, forms, audit, contextVariables, recordTypes, search };
}
