/** Generic test data only: no resolver DTOs, runtime imports or external services.
 * Call the factory per test; every record/scenario is independently mutable.
 * Scenario expectations describe the feature contract, not baseline runtime support.
 */
export function createRelatedRecordsFixtures() {
  const tenants = { primary: 'related-test', other: 'related-other' };
  const roles = { reader: 'RelatedReader', editor: 'RelatedEditor' };
  const users = {
    reader: { username: 'related-reader', roles: [roles.reader] },
    editor: { username: 'related-editor', roles: [roles.reader, roles.editor] },
    denied: { username: 'related-denied', roles: [] as string[] },
    otherTenant: { username: 'related-other-reader', roles: [roles.reader] },
  };
  const ids = {
    root: 'related-plan',
    activityA: 'related-activity-a',
    activityB: 'related-activity-b',
    denied: 'related-activity-denied',
    deleted: 'related-activity-deleted',
    missing: 'related-activity-missing',
    crossTenant: 'related-activity-other',
  };
  const timestamp = '2026-01-01T00:00:00.000Z';
  const record = (oid: string, type: string, metadata: Record<string, unknown>, brandId = tenants.primary) => ({
    redboxOid: oid,
    revision: 1,
    metaMetadata: {
      brandId,
      type,
      form: `${type}-1.0-draft`,
      createdBy: users.editor.username,
      createdOn: timestamp,
      lastSaveDate: timestamp,
    },
    metadata,
    authorization: {
      view: [users.reader.username, users.editor.username],
      edit: [users.editor.username],
      viewRoles: [roles.reader],
      editRoles: [roles.editor],
    },
    workflow: { stage: 'draft', stageLabel: 'Draft' },
    dateCreated: timestamp,
    lastSaveDate: timestamp,
  });
  const activityA = record(ids.activityA, 'related-activity', {
    title: 'Activity A',
    startDate: '2026-01-10',
    endDate: '2026-02-10',
    emptyText: '',
    nullable: null,
    enabled: false,
    count: 0,
    emptyList: [],
    'literal.key': 'literal dot',
    literal: { key: 'nested value' },
    'slash/key': 'literal slash',
    'tilde~key': 'literal tilde',
    'namespace:title': 'literal colon',
  });
  const activityB = record(ids.activityB, 'related-activity', {
    title: 'Activity B',
    startDate: '2026-03-10',
    endDate: '2026-04-10',
  });
  const root = record(ids.root, 'related-plan', {
    title: 'Local plan title',
    localNotes: 'Retained local answer',
    primaryActivity: ids.activityA,
    supportingActivities: [{ oid: ids.activityB }],
    retainedActivityTitle: 'Old copied title',
    group: { localAnswer: 'Retained nested answer', activityTitle: 'Old nested copy' },
    rows: [{ localAnswer: 'Retained row answer', activityTitle: 'Old row copy' }],
  });
  const denied = record(ids.denied, 'related-activity', { title: 'Private source' });
  denied.authorization = { view: [], edit: [], viewRoles: [], editRoles: [] };
  const crossTenant = record(ids.crossTenant, 'related-activity', { title: 'Other tenant source' }, tenants.other);
  const deleted = record(ids.deleted, 'related-activity', { title: 'Deleted source' });
  // Keep deleted separate from active records; adapters choose their own tombstone representation.
  const activeRecords = [root, activityA, activityB, denied, crossTenant];
  const relations = [
    {
      id: 'primary-activity',
      recordType: 'related-activity',
      localField: 'metadata.primaryActivity',
      foreignField: 'redboxOid',
      cardinality: 'one',
      direction: 'outbound',
    },
    {
      id: 'supporting-activities',
      recordType: 'related-activity',
      localField: 'metadata.supportingActivities',
      foreignField: 'redboxOid',
      cardinality: 'many',
      direction: 'outbound',
    },
  ];
  const references = {
    scalar: ids.activityA,
    object: { oid: ids.activityA },
    customObject: { redboxOid: ids.activityA },
    array: [ids.activityB, { oid: ids.activityA }, ids.activityB],
    expectedOrder: [ids.activityB, ids.activityA],
    empty: [],
    unavailable: [ids.denied, ids.deleted, ids.missing, ids.crossTenant],
  };
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const updatedActivity = clone(activityA);
  updatedActivity.metadata.title = 'Activity A updated';
  updatedActivity.metadata.startDate = '2026-05-10';
  updatedActivity.revision = 2;
  updatedActivity.lastSaveDate = '2026-01-02T00:00:00.000Z';
  updatedActivity.metaMetadata.lastSaveDate = updatedActivity.lastSaveDate;
  const audit = [{ oid: ids.root, action: 'create', date: timestamp }];
  const scenarios = {
    sourceOnlyChange: {
      rootBefore: clone(root),
      rootAfter: clone(root),
      sourceBefore: clone(activityA),
      sourceAfter: updatedActivity,
      auditBefore: clone(audit),
      auditAfter: clone(audit),
      unchangedRootSections: ['metadata', 'revision', 'lastSaveDate', 'metaMetadata', 'audit'],
    },
    referenceRace: {
      selections: [ids.activityA, ids.activityB],
      completionOrder: [ids.activityB, ids.activityA],
      expectedCurrentOid: ids.activityB,
    },
    sameIdRefresh: { selections: [ids.activityA, ids.activityA], expectedTitle: 'Activity A updated' },
    unlink: { previousReference: ids.activityA, nextReference: null, expectedCurrentOids: [] },
    retainedLocalData: {
      stored: clone(root),
      localEdit: { localNotes: 'Edited local answer' },
      displayValues: { retainedActivityTitle: 'Activity A updated' },
      preservedFields: ['title', 'group', 'rows', 'retainedActivityTitle'],
    },
    requiredSource: {
      relationId: 'primary-activity',
      required: true,
      unavailableOids: [...references.unavailable],
      expectedOperationAllowed: false,
    },
    optionalSource: {
      relationId: 'primary-activity',
      required: false,
      unavailableOids: [...references.unavailable],
      expectedOperationAllowed: true,
    },
  };
  return {
    tenants,
    roles,
    users,
    ids,
    root,
    activityA,
    activityB,
    denied,
    deleted,
    crossTenant,
    activeRecords,
    relations,
    references,
    audit,
    scenarios,
  };
}
