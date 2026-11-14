import * as sinon from 'sinon';
import { BrandingModel, RoleModel, UserModel, type RecordModel } from '../../src/model';
import { reporting, type ReportingConfig } from '../../src/config/reporting.config';
import { reportingPrincipal } from '../../src/reporting/authorization';
import { resolveReportingRegistry } from '../../src/reporting/registry';
import type { RecordTypeConfig } from '../../src/config/recordtype.config';
export const brand = Object.assign(new BrandingModel(), { id: 'brand-a', name: 'a' });
export const role = Object.assign(new RoleModel(), { id: 'reporter-a', name: 'Reporter', branding: brand });
brand.roles = [role, Object.assign(new RoleModel(), { id: 'admin-a', name: 'Admin', branding: brand })];
export const user = Object.assign(new UserModel(), { id: 'alice-id', username: 'alice', type: 'oidc', roles: [role] });
export const principal = reportingPrincipal(brand, user);
export const configuration: ReportingConfig = { ...reporting, enabled: true, limits: { ...reporting.limits } };
export const recordTypes: RecordTypeConfig = {
  rdmp: {
    packageType: 'rdmp',
    reporting: {
      enabled: true,
      allowedRoles: ['Reporter'],
      forms: ['rdmp-view'],
      searchCore: 'default',
      searchFullTextVisibleToAllReportingRoles: true,
      fields: [
        {
          id: 'created',
          label: 'Created date',
          path: 'metaMetadata.createdOn',
          type: 'date',
          operations: ['filter', 'histogram', 'read'],
        },
        {
          id: 'faculty',
          label: 'Faculty',
          path: 'metadata.faculty',
          type: 'category',
          operations: ['filter', 'group', 'read'],
        },
        {
          id: 'workflowStage',
          label: 'Workflow stage',
          path: 'workflow.stage',
          type: 'category',
          operations: ['filter', 'group', 'read'],
        },
        {
          id: 'sensitiveData',
          label: 'Sensitive data',
          path: 'metadata.sensitiveData',
          type: 'boolean',
          operations: ['filter', 'group', 'read'],
        },
        {
          id: 'amount',
          label: 'Amount',
          path: 'metadata.amount',
          type: 'number',
          operations: ['filter', 'sum', 'average', 'read'],
        },
        {
          id: 'tags',
          label: 'Tags',
          path: 'metadata.tags',
          type: 'category',
          array: true,
          operations: ['filter', 'group', 'read'],
        },
        {
          id: 'hidden',
          label: 'Hidden value',
          path: 'metadata.hidden',
          type: 'text',
          operations: ['read'],
          allowedRoles: ['Admin'],
        },
      ],
    },
  },
};
export const registry = (actor = principal, type = 'rdmp') =>
  resolveReportingRegistry(
    actor,
    type,
    configuration,
    recordTypes,
    async () => new Set(['metadata.faculty', 'metadata.sensitiveData', 'metadata.amount', 'metadata.tags'])
  );
export function storedRecord(oid = 'record-1', overrides: Partial<RecordModel> = {}): RecordModel {
  return {
    redboxOid: oid,
    id: oid,
    harvestId: '',
    dateCreated: '',
    lastSaveDate: '',
    metaMetadata: {
      brandId: brand.id,
      type: 'rdmp',
      form: 'rdmp-view',
      createdBy: 'alice',
      createdOn: '2026-01-02T00:00:00Z',
      searchCore: 'default',
      attachmentFields: [],
    },
    metadata: { faculty: 'A', sensitiveData: true, amount: 100, tags: ['ml', 'ml', 'ai'], hidden: 'private' },
    workflow: { stage: 'draft', stageLabel: 'Draft' },
    authorization: {
      edit: [],
      view: ['alice'],
      editRoles: [],
      viewRoles: [],
      editPending: [],
      viewPending: [],
      stored: { edit: [], view: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] },
    },
    ...overrides,
  };
}

/** Each reporting suite owns its Sails fixture, including after unrelated suites remove the global. */
export function installReportingTestSails(): () => void {
  const previous = Reflect.get(globalThis, 'sails');
  Reflect.set(globalThis, 'sails', {
    config: {},
    services: {},
    log: { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), debug: sinon.stub(), verbose: sinon.stub() },
  });
  return () => {
    if (previous === undefined) Reflect.deleteProperty(globalThis, 'sails');
    else Reflect.set(globalThis, 'sails', previous);
  };
}
