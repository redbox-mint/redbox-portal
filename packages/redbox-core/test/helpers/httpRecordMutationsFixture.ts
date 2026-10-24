import express from 'express';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpRouteFixture } from './httpRouteFixture';
import { mountRecordMutationRoutes } from '../../src/http/express/recordMutations';
import { RecordSaveResponse } from '../../src/RecordSaveResponse';

/** Actual save routes; independent domain ports expose the authoritative submitted context. */
export async function httpRecordMutationsFixture(rootContext = '') {
  const saved = new RecordSaveResponse('00000000-0000-4000-8000-000000000000');
  saved.oid = 'record-1';
  saved.success = true;
  saved.outcome = 'saved';
  const record = {
    redboxOid: 'record-1',
    revision: 3,
    metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-form', attachmentFields: [] },
    metadata: { title: 'Original' },
    authorization: { edit: ['alice'], view: ['alice'] },
  };
  const records = {
    create: sinon.stub().resolves(saved),
    updateMeta: sinon.stub().resolves(saved),
    delete: sinon.stub().resolves(saved),
    restoreRecord: sinon.stub().resolves(saved),
    destroyDeletedRecord: sinon.stub().resolves(saved),
    getMeta: sinon.stub().resolves(record),
    getDeletedRecordMeta: sinon.stub().resolves(record),
    hasEditAccess: sinon.stub().returns(true),
    hasViewAccess: sinon.stub().returns(true),
  };
  const recordTypes = { get: sinon.stub().returns(of({ id: 'record-type-1', name: 'dataset' })) };
  const workflows = { get: sinon.stub().returns(of(undefined)) };
  const forms = { getFormByName: sinon.stub(), buildClientFormConfig: sinon.stub() };
  const contextVariables = { evaluateContextVariables: sinon.stub().returns({}) };
  const settings = { schemaEnabled: false, returnMetadataOnSave: true };
  const f = await httpRouteFixture((router, input) => {
    const target = express.Router();
    mountRecordMutationRoutes(target, {
      ...input,
      records: records as any,
      recordTypes,
      workflows,
      forms,
      contextVariables,
      rootContext,
      get schemaEnabled() {
        return settings.schemaEnabled;
      },
      get returnMetadataOnSave() {
        return settings.returnMetadataOnSave;
      },
    });
    router.use(rootContext || '/', target);
  });
  return {
    ...f,
    records,
    record,
    recordTypes,
    workflows,
    forms,
    contextVariables,
    settings,
    request: (path: string, options?: Parameters<typeof f.request>[1]) => f.request(rootContext + path, options),
  };
}
